// test-infocare.mjs — Test the Infocare crawler flow locally
// Uses full puppeteer (not puppeteer-core) for local testing with visible browser
// Run: node test-infocare.mjs [sido] [gugun] [dong] [propertyType]
// Example: node test-infocare.mjs 서울 강남구 대치동 아파트

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read credentials from .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) env[key.trim()] = vals.join('=').trim();
}

const INFOCARE_ID = env.INFOCARE_ID;
const INFOCARE_PW = env.INFOCARE_PW;

// Parse CLI args or use defaults
const [sido, gugun, dong, propertyType] = process.argv.slice(2);
const SEARCH = {
  sido: sido || '서울',
  gugun: gugun || '강남구',
  dong: dong || '대치동',
  yongdoGroup: '집합건물',
  yongdo: propertyType || '아파트',
};

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  Screenshot: ${name}.png`);
}

async function getMainFrameReady(page, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const mf = page.frames().find(f => f.name() === 'info_main');
    if (mf) {
      const hasBody = await mf.evaluate(() => !!document.body).catch(() => false);
      if (hasBody) return mf;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('info_main frame not ready');
}

async function main() {
  console.log(`\nInfocare crawler test: ${SEARCH.sido} ${SEARCH.gugun} ${SEARCH.dong} ${SEARCH.yongdo}`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 1200 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', async dialog => {
    console.log(`  [Dialog] ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // 1. LOGIN
    console.log('\n[1] Login...');
    await page.goto('https://infocare.co.kr', { waitUntil: 'networkidle2', timeout: 20000 });
    let mf = await getMainFrameReady(page);
    await mf.waitForSelector('li.login a', { timeout: 10000 });
    await mf.click('li.login a');
    await mf.waitForSelector('input.userid', { visible: true, timeout: 5000 });
    await mf.type('input.userid', INFOCARE_ID, { delay: 20 });
    await mf.type('input.passwd', INFOCARE_PW, { delay: 20 });
    await mf.click('.login-pane button.btn_submit');
    await new Promise(r => setTimeout(r, 4000));
    mf = await getMainFrameReady(page);
    const loggedIn = await mf.evaluate(() => {
      const lo = document.querySelector('span.logout');
      return lo ? window.getComputedStyle(lo).display !== 'none' : false;
    });
    console.log(`  Logged in: ${loggedIn}`);
    if (!loggedIn) { console.log('  LOGIN FAILED!'); return; }

    // 2. Navigate to stats
    console.log('\n[2] Navigate to stat_area_detail.asp...');
    await mf.evaluate(() => { window.location.href = '/statistics/stat_area_detail.asp'; });
    await new Promise(r => setTimeout(r, 4000));
    mf = await getMainFrameReady(page);
    await mf.waitForSelector('form.infoStat', { timeout: 10000 });

    // 3. Fill hidden form and submit
    console.log(`\n[3] Search: ${SEARCH.sido} ${SEARCH.gugun} ${SEARCH.dong} (${SEARCH.yongdoGroup}/${SEARCH.yongdo})...`);
    await mf.evaluate((params) => {
      const form = document.querySelector('form.infoStat');
      if (!form) return;
      const setVal = (name, val) => {
        const inp = form.querySelector(`input[name="${name}"]`);
        if (inp) inp.value = val;
      };
      setVal('resultyn', 'Y');
      setVal('addr_do', params.sido);
      setVal('addr_si', params.gugun);
      setVal('addr_dong', params.dong);
      setVal('yongdo_group', params.yongdoGroup);
      setVal('yongdo', params.yongdo);
      setVal('sdate', '');
      setVal('edate', '');
      form.action = '/statistics/stat_area_detail.asp';
      form.target = '_self';
      form.submit();
    }, SEARCH);

    await new Promise(r => setTimeout(r, 8000));
    mf = await getMainFrameReady(page);
    await screenshot(page, 'result');

    // 4. Parse results
    console.log('\n[4] Parse results...');
    const data = await mf.evaluate(() => {
      const result = { hasResults: false, statArea: null, nakRate: null, calc: null, nakInfo: null };

      const statResult = document.querySelector('.stat_result');
      if (!statResult || statResult.style.display === 'none') return result;
      result.hasResults = true;

      // stat_area
      const statArea = document.querySelector('table.stat_area');
      if (statArea) {
        const h1 = statArea.querySelector('thead tr:first-child');
        result.statArea = {
          regionHeaders: h1 ? Array.from(h1.querySelectorAll('th[colspan="3"]')).map(th => th.textContent?.trim()) : [],
          rows: Array.from(statArea.querySelectorAll('tbody tr')).map(tr => ({
            period: tr.querySelector('th')?.textContent?.trim(),
            cells: Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim()),
          })),
        };
      }

      // nakRate
      const nakRate = document.querySelector('table.stat_nak_rate');
      if (nakRate) {
        result.nakRate = Array.from(nakRate.querySelectorAll('tr')).map(tr => ({
          label: tr.querySelector('th')?.textContent?.trim(),
          value: tr.querySelector('td.ftcda6405')?.textContent?.trim(),
          unit: tr.querySelectorAll('td')[1]?.textContent?.trim(),
        }));
      }

      // calc
      const calc = document.querySelector('table.calc');
      if (calc) {
        result.calc = {
          avgNakRate: calc.querySelector('.avg_nakrate span.ftcda6405')?.textContent?.trim(),
          appliedNakRate: calc.querySelector('.set_nakrate span.ftcda6405')?.textContent?.trim(),
        };
      }

      // nakInfo
      const nakInfo = document.querySelector('table.stat_nak_info');
      if (nakInfo) {
        const rows = Array.from(nakInfo.querySelectorAll('tbody tr:not(.noitem)'));
        result.nakInfo = {
          count: rows.length,
          sample: rows.slice(0, 5).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(c => c.textContent?.trim())
          ),
        };
      }

      return result;
    });

    if (!data.hasResults) {
      console.log('  No results found!');
    } else {
      console.log('\n  === 지역통계 ===');
      console.log(`  Regions: ${data.statArea?.regionHeaders?.join(' / ')}`);
      if (data.statArea?.rows) {
        console.log('  Period      | Regional Rate | Regional Count | District Rate | District Count | Dong Rate | Dong Count');
        for (const r of data.statArea.rows) {
          const c = r.cells;
          console.log(`  ${r.period.padEnd(10)} | ${(c[0]||'').padStart(13)} | ${(c[2]||'').padStart(14)} | ${(c[3]||'').padStart(13)} | ${(c[5]||'').padStart(14)} | ${(c[6]||'').padStart(9)} | ${(c[8]||'').padStart(10)}`);
        }
      }

      console.log('\n  === 낙찰가율 Summary ===');
      if (data.nakRate) {
        for (const r of data.nakRate) console.log(`  ${r.label}: ${r.value} ${r.unit}`);
      }

      console.log('\n  === 가중평균 ===');
      console.log(`  평균낙찰가율: ${data.calc?.avgNakRate}%`);
      console.log(`  적용낙찰가율: ${data.calc?.appliedNakRate}%`);

      console.log(`\n  === 낙찰사례 (${data.nakInfo?.count || 0}건) ===`);
      if (data.nakInfo?.sample) {
        for (const r of data.nakInfo.sample) console.log(`  ${r.join(' | ')}`);
      }
    }

    console.log('\n--- Browser closing in 10 seconds ---');
    await new Promise(r => setTimeout(r, 10000));

  } catch (err) {
    console.error('Error:', err.message);
    await screenshot(page, 'error-state').catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
