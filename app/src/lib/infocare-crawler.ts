// app/src/lib/infocare-crawler.ts
import type { AuctionStats, AuctionStatRow } from '@/types/appraisal';

interface CrawlRequest {
  sido: string;       // e.g. "광주광역시"
  gugun: string;      // e.g. "남구"
  dong: string;       // e.g. "월산동"
  propertyType: string; // e.g. "아파트"
}

interface CrawlResult {
  success: boolean;
  data?: AuctionStats;
  error?: string;
}

export async function crawlInfocareAuctionStats(req: CrawlRequest): Promise<CrawlResult> {
  let browser: Awaited<ReturnType<typeof import('puppeteer-core')>>['Browser'] extends new (...args: unknown[]) => infer R ? R : never;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browserInstance: any = null;

  try {
    // Dynamic imports for serverless compatibility
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');

    browserInstance = await puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browserInstance.newPage();
    page.setDefaultTimeout(30000);

    // 1. Navigate to infocare
    await page.goto('https://infocare.co.kr', { waitUntil: 'networkidle2', timeout: 15000 });

    // 2. Login
    const id = process.env.INFOCARE_ID;
    const pw = process.env.INFOCARE_PW;
    if (!id || !pw) {
      return { success: false, error: 'INFOCARE_ID/PW 환경변수 미설정' };
    }

    // Try to find login form — selectors may need adjustment after testing
    await page.waitForSelector('input[type="text"], input[name="userId"], input[id="userId"]', { timeout: 10000 });

    // Type credentials
    const idSelector = (await page.$('input[name="userId"]')) || (await page.$('input[type="text"]'));
    const pwSelector = (await page.$('input[name="userPw"]')) || (await page.$('input[type="password"]'));

    if (idSelector) await idSelector.type(id);
    if (pwSelector) await pwSelector.type(pw);

    // Submit login
    const loginBtn =
      (await page.$('button[type="submit"]')) ||
      (await page.$('input[type="submit"]')) ||
      (await page.$('.login-btn'));
    if (loginBtn) await loginBtn.click();

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});

    // 3. Navigate to auction stats page
    // This URL/selector needs to be discovered — try common patterns
    const auctionLink = (await page.$('a[href*="nachal"]')) || (await page.$('a[href*="auction"]'));
    if (auctionLink) {
      await auctionLink.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    }

    // 4. Fill search form with region/property type
    // This is highly site-specific — placeholder implementation
    // Will need adjustment after seeing actual site structure

    // 5. Parse results table — look for table with 낙찰가율 data
    const tableData = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const text = table.textContent || '';
        if (text.includes('낙찰가율') || text.includes('낙찰률')) {
          const rows = Array.from(table.querySelectorAll('tr'));
          return rows.map((row: HTMLTableRowElement) => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            return cells.map((cell) => (cell.textContent || '').trim());
          });
        }
      }
      return null;
    });

    if (!tableData) {
      return {
        success: false,
        error: '낙찰통계 테이블을 찾을 수 없습니다. 사이트 구조가 변경되었을 수 있습니다.',
      };
    }

    // Parse the table data into AuctionStatRow[]
    const stats = parseAuctionTable(tableData);

    return {
      success: true,
      data: {
        region: req.sido,
        district: req.gugun,
        dong: req.dong,
        propertyType: req.propertyType,
        baseMonth: new Date().toISOString().slice(0, 7).replace('-', '.'),
        stats,
        source: '인포케어',
        retrievedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { success: false, error: `크롤링 실패: ${String(err)}` };
  } finally {
    if (browserInstance) await browserInstance.close().catch(() => {});
  }
}

function parseAuctionTable(rows: string[][]): AuctionStatRow[] {
  // Try to parse common table formats
  // Expected: rows with period (12개월/6개월/3개월) and rate/count pairs
  const result: AuctionStatRow[] = [];
  const periods: Array<'12개월' | '6개월' | '3개월'> = ['12개월', '6개월', '3개월'];

  for (const period of periods) {
    const periodNum = period.replace('개월', '');
    const row = rows.find((r) => r.some((cell) => cell.includes(periodNum)));
    if (row) {
      // Try to extract numbers from the row
      const numbers = row
        .map((cell) => cell.replace(/[,%]/g, ''))
        .filter((cell) => /^\d+(\.\d+)?$/.test(cell))
        .map(Number);

      // Expected pattern: rate1, count1, rate2, count2, rate3, count3
      result.push({
        period,
        regional: { rate: numbers[0] || 0, count: numbers[1] || 0 },
        district: { rate: numbers[2] || 0, count: numbers[3] || 0 },
        dong: { rate: numbers[4] || 0, count: numbers[5] || 0 },
      });
    } else {
      result.push({
        period,
        regional: { rate: 0, count: 0 },
        district: { rate: 0, count: 0 },
        dong: { rate: 0, count: 0 },
      });
    }
  }

  return result;
}
