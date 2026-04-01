// app/src/lib/infocare-crawler.ts
// Crawls infocare.co.kr for auction statistics (낙찰통계)
// Site uses frameset (info_main), JS login popup, form-based search

import type { AuctionStats, AuctionStatRow } from '@/types/appraisal';

interface CrawlRequest {
  sido: string; // e.g. "서울", "광주" (short form, not "광주광역시")
  gugun: string; // e.g. "남구", "강남구"
  dong: string; // e.g. "봉선동", "대치동"
  propertyType: string; // e.g. "아파트"
}

interface CrawlResult {
  success: boolean;
  data?: AuctionStats;
  error?: string;
}

// Map full sido names to infocare short names
const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
  // Also accept short forms directly
  서울: '서울',
  부산: '부산',
  대구: '대구',
  인천: '인천',
  광주: '광주',
  대전: '대전',
  울산: '울산',
  세종: '세종',
  경기: '경기',
  강원: '강원',
  충북: '충북',
  충남: '충남',
  전북: '전북',
  전남: '전남',
  경북: '경북',
  경남: '경남',
  제주: '제주',
};

// Map property type to infocare yongdo_group / yongdo
function mapPropertyType(type: string): { group: string; sub: string } {
  switch (type) {
    case '아파트':
      return { group: '집합건물', sub: '아파트' };
    case '오피스텔':
      return { group: '집합건물', sub: '오피스텔' };
    case '연립':
    case '다세대':
      return { group: '집합건물', sub: type };
    case '주상복합':
      return { group: '집합건물', sub: '주상복합(주거)' };
    case '상가':
      return { group: '상가', sub: '' };
    case '근린생활시설':
      return { group: '상가', sub: '' };
    case '토지':
      return { group: '토지', sub: '' };
    case '공장':
      return { group: '공장', sub: '' };
    default:
      return { group: '', sub: '' };
  }
}

export async function crawlInfocareAuctionStats(
  req: CrawlRequest
): Promise<CrawlResult> {
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

    // Handle dialogs (e.g. "다른 컴퓨터에서 로그인" confirmation)
    page.on('dialog', async (dialog: { accept: () => Promise<void> }) => {
      await dialog.accept();
    });

    // ===== 1. Navigate to infocare (frameset) =====
    await page.goto('https://infocare.co.kr', {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Get the main content frame
    const mainFrame = await waitForMainFrame(page);
    if (!mainFrame) {
      return { success: false, error: 'info_main 프레임을 찾을 수 없습니다' };
    }

    // ===== 2. Login =====
    const id = process.env.INFOCARE_ID;
    const pw = process.env.INFOCARE_PW;
    if (!id || !pw) {
      return { success: false, error: 'INFOCARE_ID/PW 환경변수 미설정' };
    }

    // Open login popup by clicking the login link
    await mainFrame.waitForSelector('li.login a', { timeout: 10000 });
    await mainFrame.click('li.login a');

    // Wait for login popup to appear with userid input
    await mainFrame.waitForSelector('input.userid', {
      visible: true,
      timeout: 5000,
    });

    // Fill credentials
    await mainFrame.type('input.userid', id, { delay: 20 });
    await mainFrame.type('input.passwd', pw, { delay: 20 });

    // Click login submit button inside the popup
    await mainFrame.click('.login-pane button.btn_submit');

    // Wait for login to complete
    await new Promise((r) => setTimeout(r, 4000));

    // Verify login by checking logout span visibility
    const refreshedFrame = await waitForMainFrame(page);
    if (!refreshedFrame) {
      return { success: false, error: '로그인 후 프레임을 찾을 수 없습니다' };
    }

    const loggedIn = await refreshedFrame.evaluate(() => {
      const logoutSpan = document.querySelector('span.logout');
      return logoutSpan
        ? window.getComputedStyle(logoutSpan).display !== 'none'
        : false;
    });

    if (!loggedIn) {
      return { success: false, error: '인포케어 로그인 실패' };
    }

    // ===== 3. Navigate to stat_area_detail page =====
    await refreshedFrame.evaluate(() => {
      window.location.href = '/statistics/stat_area_detail.asp';
    });
    await new Promise((r) => setTimeout(r, 4000));

    const statsFrame = await waitForMainFrame(page);
    if (!statsFrame) {
      return { success: false, error: '통계 페이지 로드 실패' };
    }

    // Wait for the search form to be ready
    await statsFrame.waitForSelector('form.infoStat', { timeout: 10000 });

    // ===== 4. Fill hidden form and submit =====
    const sidoShort = SIDO_SHORT[req.sido] || req.sido;
    const { group: yongdoGroup, sub: yongdoSub } = mapPropertyType(
      req.propertyType
    );

    await statsFrame.evaluate(
      (params: {
        sido: string;
        gugun: string;
        dong: string;
        yongdoGroup: string;
        yongdo: string;
      }) => {
        const form = document.querySelector(
          'form.infoStat'
        ) as HTMLFormElement | null;
        if (!form) return;

        const setVal = (name: string, val: string) => {
          const inp = form.querySelector(
            `input[name="${name}"]`
          ) as HTMLInputElement | null;
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
      },
      {
        sido: sidoShort,
        gugun: req.gugun,
        dong: req.dong,
        yongdoGroup: yongdoGroup,
        yongdo: yongdoSub,
      }
    );

    // Wait for results page to load
    await new Promise((r) => setTimeout(r, 8000));
    const resultFrame = await waitForMainFrame(page);
    if (!resultFrame) {
      return { success: false, error: '검색 결과 페이지 로드 실패' };
    }

    // ===== 5. Parse results =====
    const parsed = await resultFrame.evaluate(() => {
      const result: {
        statPeriod: string;
        regionHeaders: string[];
        statAreaRows: {
          period: string;
          cells: string[];
        }[];
        nakRate: string;
        nakRateAvg: string;
        avgNakRate: string;
        appliedNakRate: string;
        nakInfoCount: number;
        nakInfoSample: string[][];
        hasResults: boolean;
      } = {
        statPeriod: '',
        regionHeaders: [],
        statAreaRows: [],
        nakRate: '0',
        nakRateAvg: '0',
        avgNakRate: '0',
        appliedNakRate: '0',
        nakInfoCount: 0,
        nakInfoSample: [],
        hasResults: false,
      };

      // Check if results are displayed
      const statResult = document.querySelector('.stat_result');
      if (
        !statResult ||
        (statResult as HTMLElement).style.display === 'none'
      ) {
        return result;
      }
      result.hasResults = true;

      // Stat period text
      const periodEl = document.querySelector('.ftcda6405');
      if (periodEl)
        result.statPeriod = (periodEl.textContent || '').trim();

      // stat_area table: 지역/기간별 통계
      const statArea = document.querySelector('table.stat_area');
      if (statArea) {
        // Header row has th[colspan=3] for each region level
        const headerRow = statArea.querySelector('thead tr:first-child');
        if (headerRow) {
          const ths = headerRow.querySelectorAll('th[colspan="3"]');
          ths.forEach((th) =>
            result.regionHeaders.push((th.textContent || '').trim())
          );
        }

        // Data rows: 1년간 평균, 6개월 평균, 3개월 평균
        const dataRows = statArea.querySelectorAll('tbody tr');
        dataRows.forEach((tr) => {
          const th = tr.querySelector('th');
          const tds = tr.querySelectorAll('td');
          result.statAreaRows.push({
            period: (th?.textContent || '').trim(),
            cells: Array.from(tds).map((td) =>
              (td.textContent || '').trim()
            ),
          });
        });
      }

      // stat_nak_rate: 낙찰가율 and 낙찰률평균
      const nakRateTable = document.querySelector('table.stat_nak_rate');
      if (nakRateTable) {
        const rows = nakRateTable.querySelectorAll('tr');
        rows.forEach((tr) => {
          const th = tr.querySelector('th');
          const label = (th?.textContent || '').trim();
          const valueTd = tr.querySelector('td.ftcda6405');
          const val = (valueTd?.textContent || '0').trim();
          if (label === '낙찰가율') result.nakRate = val;
          if (label === '낙찰률평균') result.nakRateAvg = val;
        });
      }

      // calc table: 평균낙찰가율 and 적용낙찰가율
      const calc = document.querySelector('table.calc');
      if (calc) {
        const avgSpan = calc.querySelector(
          '.avg_nakrate span.ftcda6405'
        );
        const appSpan = calc.querySelector(
          '.set_nakrate span.ftcda6405'
        );
        if (avgSpan)
          result.avgNakRate = (avgSpan.textContent || '0').trim();
        if (appSpan)
          result.appliedNakRate = (appSpan.textContent || '0').trim();
      }

      // stat_nak_info: 낙찰사례
      const nakInfo = document.querySelector('table.stat_nak_info');
      if (nakInfo) {
        const rows = Array.from(
          nakInfo.querySelectorAll('tbody tr:not(.noitem)')
        );
        result.nakInfoCount = rows.length;
        result.nakInfoSample = rows.slice(0, 10).map((tr) =>
          Array.from(tr.querySelectorAll('td')).map((c) =>
            (c.textContent || '').trim()
          )
        );
      }

      return result;
    });

    if (!parsed.hasResults) {
      return {
        success: false,
        error: '검색 결과가 없습니다. 지역/용도를 확인해 주세요.',
      };
    }

    // ===== 6. Convert to AuctionStatRow[] =====
    const stats = parseStatAreaRows(parsed.statAreaRows);

    // Extract base month from stat period text
    // Format: "[기준 통계 기간:2025/03/01 ~ 2026/02/28]"
    const baseMonthMatch = parsed.statPeriod.match(
      /~\s*(\d{4})\/(\d{2})/
    );
    const baseMonth = baseMonthMatch
      ? `${baseMonthMatch[1]}.${baseMonthMatch[2]}`
      : new Date().toISOString().slice(0, 7).replace('-', '.');

    return {
      success: true,
      data: {
        region: req.sido,
        district: req.gugun,
        dong: req.dong,
        propertyType: req.propertyType,
        baseMonth,
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

/**
 * Wait for the info_main frame to be ready with content
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForMainFrame(page: any, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mf = page.frames().find((f: any) => f.name() === 'info_main');
    if (mf) {
      const hasBody = await mf
        .evaluate(() => !!document.body)
        .catch(() => false);
      if (hasBody) return mf;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/**
 * Parse the stat_area table rows into AuctionStatRow[]
 *
 * Each row has 9 cells: 3 groups x (낙찰가율, 낙찰률평균, 낙찰건수)
 * Groups are: regional (시도), district (시군구), dong (동)
 * Periods: "1년간 평균", "6개월 평균", "3개월 평균"
 */
function parseStatAreaRows(
  rows: { period: string; cells: string[] }[]
): AuctionStatRow[] {
  const periodMap: Record<string, '12개월' | '6개월' | '3개월'> = {
    '1년간 평균': '12개월',
    '6개월 평균': '6개월',
    '3개월 평균': '3개월',
  };

  const result: AuctionStatRow[] = [];

  for (const row of rows) {
    const period = periodMap[row.period];
    if (!period) continue;

    // cells: [rate1, rateAvg1, count1, rate2, rateAvg2, count2, rate3, rateAvg3, count3]
    // We use 낙찰가율 (index 0, 3, 6) and 낙찰건수 (index 2, 5, 8)
    const parseNum = (s: string) =>
      parseFloat(s.replace(/[%,]/g, '')) || 0;

    result.push({
      period,
      regional: {
        rate: parseNum(row.cells[0] || '0'),
        count: parseNum(row.cells[2] || '0'),
      },
      district: {
        rate: parseNum(row.cells[3] || '0'),
        count: parseNum(row.cells[5] || '0'),
      },
      dong: {
        rate: parseNum(row.cells[6] || '0'),
        count: parseNum(row.cells[8] || '0'),
      },
    });
  }

  // Ensure all 3 periods are present
  for (const period of ['12개월', '6개월', '3개월'] as const) {
    if (!result.find((r) => r.period === period)) {
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
