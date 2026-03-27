/**
 * FISIS (금융통계정보시스템) API 연동 모듈
 * ==========================================
 * 금융감독원이 운영하는 금융회사 경영정보를 조회합니다.
 * 은행, 보험, 증권, 캐피탈, 리스, 저축은행 등 금융회사 재무데이터 제공
 *
 * API: https://fisis.fss.or.kr/page/api-intro.jsp
 * Base URL: https://fisis.fss.or.kr/openapi/
 * 인증: auth 파라미터 (인증키)
 * 응답: JSON
 */

const FISIS_BASE = "https://fisis.fss.or.kr/openapi";

function getAuth(): string {
  return process.env.FISIS_AUTH_KEY || "ef711ade3a2fe82bb80fbe1dcf89b668";
}

// ============================================================
// 금융회사 검색
// ============================================================

interface FisisCompany {
  finance_cd: string;
  finance_nm: string;
  finance_path: string;
}

// 금융권역 코드
const PART_DIVS = [
  { code: "A", name: "시중은행" },
  { code: "B", name: "지방은행/특수은행" },
  { code: "C", name: "신용카드사" },
  { code: "D", name: "종합금융" },
  { code: "E", name: "상호저축은행" },
  { code: "F", name: "증권사" },
  { code: "G", name: "자산운용사" },
  { code: "H", name: "생명보험" },
  { code: "I", name: "손해보험" },
  { code: "J", name: "외국은행" },
  { code: "K", name: "할부금융/리스" },
  { code: "L", name: "금융지주" },
  { code: "M", name: "부동산신탁" },
  { code: "N", name: "기타금융" },
];

let companyCache: { nm: string; cd: string; part: string; partNm: string }[] | null = null;

export async function loadFisisCompanies(): Promise<typeof companyCache> {
  if (companyCache) return companyCache;

  const auth = getAuth();
  const all: { nm: string; cd: string; part: string; partNm: string }[] = [];

  for (const { code, name } of PART_DIVS) {
    try {
      const r = await fetch(`${FISIS_BASE}/companySearch.json?lang=kr&auth=${auth}&partDiv=${code}`);
      const d = await r.json();
      for (const c of d.result?.list || []) {
        if (c.finance_nm?.includes("[폐]")) continue; // 폐업 제외
        all.push({ nm: c.finance_nm, cd: c.finance_cd, part: code, partNm: name });
      }
    } catch { /* skip */ }
  }

  companyCache = all;
  console.log(`[FISIS] 금융회사 ${all.length}개 로드 완료`);
  return all;
}

export async function searchFisisCompany(corpName: string): Promise<{ nm: string; cd: string; part: string; partNm: string } | null> {
  const companies = await loadFisisCompanies();
  if (!companies) return null;

  const clean = corpName.replace(/㈜|\(주\)|주식회사/g, "").trim();

  // 매칭 후보 수집
  const candidates = companies.filter((c) => {
    const cnm = c.nm.replace(/㈜|\(주\)|주식회사/g, "").trim();
    return c.nm === corpName || cnm === clean || cnm.includes(clean) || clean.includes(cnm);
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 복수 매칭 시 업종 힌트로 우선순위
  const partHints: Record<string, string[]> = {
    F: ["증권"], K: ["캐피탈", "리스", "할부"], C: ["카드"],
    H: ["생명", "생보"], I: ["손해", "손보", "화재"], M: ["신탁", "자산신탁"],
    A: ["은행"], E: ["저축"], L: ["금융지주", "금융그룹"],
  };

  for (const [part, hints] of Object.entries(partHints)) {
    if (hints.some((h) => clean.includes(h))) {
      const match = candidates.find((c) => c.part === part);
      if (match) return match;
    }
  }

  return candidates[0];
}

// ============================================================
// 통계목록별 통계코드 매핑 (주요 권역)
// ============================================================

// 권역별 재무상태표/손익계산서 통계코드
// 주의: 권역마다 통계코드 체계가 다름 (은행은 SA003, 캐피탈은 SK103 등)
const STAT_CODES: Record<string, { bs: string[]; is: string[]; ratio: string[]; summary: string[] }> = {
  A: { bs: ["SA003", "SA004"], is: ["SA021"], ratio: ["SA017", "SA014"], summary: ["SA027"] },   // 시중은행
  B: { bs: ["SA003", "SA004"], is: ["SA021"], ratio: ["SA017", "SA014"], summary: ["SA027"] },   // 지방/특수은행
  C: { bs: ["SC003", "SC004"], is: ["SC006"], ratio: ["SC009", "SC010"], summary: [] },          // 신용카드
  E: { bs: ["SE003", "SE004"], is: ["SE021"], ratio: ["SE017", "SE014"], summary: [] },          // 저축은행
  F: { bs: ["SF003", "SF004"], is: ["SF021"], ratio: ["SF017"], summary: [] },                   // 증권
  G: { bs: ["SG003", "SG004"], is: ["SG006"], ratio: ["SG009"], summary: [] },                   // 자산운용
  H: { bs: ["SH003", "SH004"], is: ["SH021"], ratio: ["SH017"], summary: [] },                  // 생명보험
  I: { bs: ["SI003", "SI004"], is: ["SI021"], ratio: ["SI017"], summary: [] },                   // 손해보험
  K: { bs: ["SK103", "SK104"], is: ["SK118"], ratio: ["SK009", "SK010"], summary: ["SK126"] },   // 할부/리스/캐피탈
  L: { bs: ["SL003", "SL004"], is: ["SL006"], ratio: ["SL009"], summary: [] },                   // 금융지주
  M: { bs: ["SM005"], is: ["SM007"], ratio: ["SM014", "SM015", "SM010"], summary: [] },          // 부동산신탁
  N: { bs: ["SN003", "SN004"], is: ["SN006"], ratio: ["SN009"], summary: [] },                   // 기타금융
};

// ============================================================
// 통계정보 조회 (핵심)
// ============================================================

interface FisisStatItem {
  base_month: string;
  finance_cd: string;
  finance_nm: string;
  account_cd: string;
  account_nm: string;
  a: string; // 금액 또는 비율값
}

async function fetchStats(
  financeCd: string,
  listNo: string,
  startMm: string,
  endMm: string
): Promise<FisisStatItem[]> {
  const auth = getAuth();
  const url = `${FISIS_BASE}/statisticsInfoSearch.json?lang=kr&auth=${auth}&financeCd=${financeCd}&listNo=${listNo}&term=Q&startBaseMm=${startMm}&endBaseMm=${endMm}`;

  try {
    const r = await fetch(url);
    const d = await r.json();
    if (d.result?.err_cd === "000") {
      return d.result.list || [];
    }
  } catch { /* skip */ }
  return [];
}

// ============================================================
// 금융회사 재무데이터 구성
// ============================================================

export interface FisisFinancialResult {
  companyName: string;
  companyCode: string;
  partName: string;
  items: Record<string, Record<string, string>>; // {period: {account: value}}
  ratios: Record<string, Record<string, string>>; // {period: {ROA: "2.64", ...}}
  periods: string[];
  hasData: boolean;
}

function toMillions(val: string): string {
  if (!val || val === "-" || val === "0") return "-";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  // FISIS 금액은 원 단위 → 백만원 변환
  const m = num / 1_000_000;
  if (Math.abs(m) >= 1) return m.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  if (m === 0) return "-";
  return m.toFixed(1);
}

/** FISIS 비율 데이터에서 직접 사용 (이미 %나 배수로 제공) */
function fmtRatio(val: string): string {
  if (!val || val === "-") return "-";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  return `${num.toFixed(1)}%`;
}

export async function fetchFisisFinancialData(
  corpName: string,
  years: string[]
): Promise<FisisFinancialResult | null> {
  const company = await searchFisisCompany(corpName);
  if (!company) {
    console.log(`[FISIS] '${corpName}' 금융회사 미발견`);
    return null;
  }

  console.log(`[FISIS] ${company.nm} (${company.cd}) 권역: ${company.partNm}`);

  const codes = STAT_CODES[company.part];
  if (!codes) {
    console.log(`[FISIS] 권역 ${company.part}(${company.partNm})에 대한 통계코드 미정의`);
    return null;
  }

  const startMm = `${Math.min(...years.map(Number))}03`;
  const endMm = `${Math.max(...years.map(Number))}12`;

  const result: FisisFinancialResult = {
    companyName: company.nm,
    companyCode: company.cd,
    partName: company.partNm,
    items: {},
    ratios: {},
    periods: [],
    hasData: false,
  };

  // BS + IS 데이터 수집
  for (const listNo of [...codes.bs, ...codes.is]) {
    const items = await fetchStats(company.cd, listNo, startMm, endMm);
    for (const item of items) {
      const period = item.base_month; // e.g. "202312"
      if (!result.items[period]) result.items[period] = {};
      result.items[period][item.account_nm] = item.a || "-";
      if (!result.periods.includes(period)) result.periods.push(period);
    }
  }

  // 수익성/건전성 비율 수집
  for (const listNo of codes.ratio) {
    const items = await fetchStats(company.cd, listNo, startMm, endMm);
    for (const item of items) {
      const period = item.base_month;
      if (!result.ratios[period]) result.ratios[period] = {};
      result.ratios[period][item.account_nm] = item.a || "-";
    }
  }

  result.periods.sort();
  result.hasData = result.periods.length > 0;

  if (result.hasData) {
    console.log(`[FISIS] ${company.nm} 데이터: ${result.periods.length}개 기간, BS/IS ${Object.keys(result.items).length}개, 비율 ${Object.keys(result.ratios).length}개`);
  }

  return result;
}

// ============================================================
// FISIS → DART FinancialResult 호환 형식 변환
// ============================================================

interface FinancialRow {
  account: string;
  depth?: number;
  [key: string]: string | number | undefined;
}

/**
 * FISIS 데이터를 DART 파이프라인과 호환되는 형식으로 변환
 * 12월 결산 기준 연도별 데이터로 정리
 */
export function convertFisisToFinancialRows(
  fisis: FisisFinancialResult,
  years: string[]
): {
  bsItems: FinancialRow[];
  isItems: FinancialRow[];
  ratios: Record<string, Record<string, string>>;
  displayYears: string[];
} {
  // 12월 결산 기간만 추출 (연말 기준)
  const annualPeriods = fisis.periods.filter((p) => p.endsWith("12"));
  const periodToYear: Record<string, string> = {};
  for (const p of annualPeriods) {
    periodToYear[p] = p.substring(0, 4); // "202312" → "2023"
  }

  // BS 항목 구성 (SK103 + SK104)
  const bsAccounts = new Set<string>();
  const isAccounts = new Set<string>();

  // 계정 분류: 자산/부채/자본은 BS, 수익/비용은 IS
  const bsKeywords = ["자산", "부채", "자본", "예치금", "대출", "유가증권", "차입", "사채"];
  const isKeywords = ["수익", "비용", "이자", "손익", "매출", "영업", "판매비", "관리비"];

  for (const period of annualPeriods) {
    const items = fisis.items[period] || {};
    for (const acctNm of Object.keys(items)) {
      const isBs = bsKeywords.some((k) => acctNm.includes(k));
      const isIs = isKeywords.some((k) => acctNm.includes(k));
      if (isIs && !isBs) {
        isAccounts.add(acctNm);
      } else {
        bsAccounts.add(acctNm);
      }
    }
  }

  function buildRows(accounts: Set<string>, isBs: boolean): FinancialRow[] {
    const rows: FinancialRow[] = [];
    for (const acct of accounts) {
      const row: FinancialRow = { account: acct, depth: detectDepth(acct, isBs) };
      let hasData = false;
      for (const period of annualPeriods) {
        const year = periodToYear[period];
        const val = fisis.items[period]?.[acct];
        if (val && val !== "-" && val !== "0") {
          row[year] = toMillions(val);
          hasData = true;
        } else {
          row[year] = "-";
        }
      }
      if (hasData) rows.push(row);
    }
    return rows;
  }

  const bsItems = buildRows(bsAccounts, true);
  const isItems = buildRows(isAccounts, false);

  // 비율 구성: FISIS SK009에서 ROA/ROE 등을 직접 사용 + BS/IS에서 추가 산출
  const ratios: Record<string, Record<string, string>> = {};
  const revenueByYear: Record<string, number> = {};

  for (const period of annualPeriods) {
    const year = periodToYear[period];
    const r: Record<string, string> = {};
    const periodRatios = fisis.ratios[period] || {};
    const periodItems = fisis.items[period] || {};

    // FISIS 직접 제공 비율 (권역별로 키 이름이 다름)
    const roa = periodRatios["총자산순이익률(ROA)"] || periodRatios["총자산이익률(ROA)"] || periodRatios["총자산이익률"];
    const roe = periodRatios["자기자본순이익률(ROE)"] || periodRatios["자기자본이익률(ROE)"] || periodRatios["자기자본이익률"];
    if (roa) r["총자산이익률(ROA)"] = fmtRatio(roa);
    if (roe) r["자기자본이익률(ROE)"] = fmtRatio(roe);

    // 유동비율 (SM010 등)
    const liquidity = periodRatios["유동비율"] || periodRatios["원화 유동성비율"];
    if (liquidity) r["유동비율"] = fmtRatio(liquidity);

    // 수지비율 (금융업 수익성 지표)
    const costRatio = periodRatios["수지비율"];
    if (costRatio) {
      // 수지비율 = 영업비용/영업수익 → 영업이익률 = 100 - 수지비율
      const cr = parseFloat(costRatio);
      if (!isNaN(cr)) r["영업이익률"] = `${(100 - cr).toFixed(1)}%`;
    }

    // BS 항목에서 비율 산출 — FISIS 필드명은 "Ⅱ. 차입부채", "부채총계" 등 다양
    function findVal(...keys: string[]): number {
      for (const k of keys) {
        // 정확 매칭
        if (periodItems[k]) { const v = parseFloat(periodItems[k]); if (!isNaN(v)) return v; }
        // 부분 매칭 (Ⅰ. Ⅱ. 등 로마숫자 접두사 포함)
        for (const [itemKey, itemVal] of Object.entries(periodItems)) {
          const cleaned = itemKey.replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVivx\d]+[.\s]+/, "").trim();
          if (cleaned === k && itemVal) { const v = parseFloat(itemVal); if (!isNaN(v)) return v; }
        }
      }
      return 0;
    }

    const totalAssets = findVal("자산총계");
    const totalLiab = findVal("부채총계", "부채");
    const totalEquity = findVal("자본총계", "자본");
    const borrowings = findVal("차입부채", "차입부채 계", "차입금");
    const cash = findVal("현금 및 예치금", "현금및현금성자산", "현금 및 현금성 자산");
    const opRevenue = findVal("영업수익", "수익합계", "영업수익합계");
    const opExpense = findVal("영업비용", "비용합계", "영업비용합계");
    const opProfit = findVal("영업이익(손실)", "영업이익", "영업손익");
    const netProfit = findVal("당기순이익(손실)", "당기순이익", "당기순손익");

    // 안정성
    if (totalEquity > 0 && totalLiab > 0) r["부채비율"] = `${((totalLiab / totalEquity) * 100).toFixed(1)}%`;
    if (totalAssets > 0 && totalEquity > 0) r["자기자본비율"] = `${((totalEquity / totalAssets) * 100).toFixed(1)}%`;
    if (borrowings > 0) {
      r["총차입금"] = toMillions(String(borrowings));
      r["순차입금"] = toMillions(String(borrowings - cash));
      if (totalAssets > 0) r["차입금의존도"] = `${((borrowings / totalAssets) * 100).toFixed(1)}%`;
    }

    // 수익성 — FISIS 직접 제공 ROA/ROE를 우선, 없으면 산출
    const netIncome = periodRatios["당기순이익"] || periodRatios["세후당기손익"];
    if (!r["총자산이익률(ROA)"] && totalAssets > 0) {
      const ni = netIncome ? parseFloat(netIncome) : netProfit;
      if (ni && !isNaN(ni)) r["총자산이익률(ROA)"] = `${((ni / totalAssets) * 100).toFixed(1)}%`;
    }
    if (!r["자기자본이익률(ROE)"] && totalEquity > 0) {
      const ni = netIncome ? parseFloat(netIncome) : netProfit;
      if (ni && !isNaN(ni)) r["자기자본이익률(ROE)"] = `${((ni / totalEquity) * 100).toFixed(1)}%`;
    }

    // 영업이익률 — 직접 계산 또는 수지비율에서 변환
    if (opRevenue > 0) {
      const op = opProfit !== 0 ? opProfit : opRevenue - opExpense;
      r["영업이익률"] = `${((op / opRevenue) * 100).toFixed(1)}%`;
    } else if (!r["영업이익률"]) {
      const costRatio = periodRatios["수지비율"];
      if (costRatio) {
        const cr = parseFloat(costRatio);
        if (!isNaN(cr) && cr > 0) r["영업이익률"] = `${(100 - cr).toFixed(1)}%`;
      }
    }

    // 매출(영업수익) 저장 (매출증가율 계산용)
    if (opRevenue > 0) revenueByYear[year] = opRevenue;

    if (Object.keys(r).length) ratios[year] = r;
  }

  // 매출증가율 (YoY)
  const sortedDisplayYears = [...new Set(annualPeriods.map((p) => periodToYear[p]))].sort();
  for (let i = 1; i < sortedDisplayYears.length; i++) {
    const cur = sortedDisplayYears[i];
    const prev = sortedDisplayYears[i - 1];
    if (revenueByYear[cur] && revenueByYear[prev] && revenueByYear[prev] !== 0) {
      const growth = ((revenueByYear[cur] - revenueByYear[prev]) / Math.abs(revenueByYear[prev])) * 100;
      if (!ratios[cur]) ratios[cur] = {};
      ratios[cur]["매출증가율"] = `${growth.toFixed(1)}%`;
    }
  }

  const displayYears = [...new Set(annualPeriods.map((p) => periodToYear[p]))].sort();

  return { bsItems, isItems, ratios, displayYears };
}

function detectDepth(acctNm: string, _isBs: boolean): number {
  const nm = acctNm.replace(/\s/g, "");
  // 총계
  if (nm === "자산총계" || nm === "부채" || nm === "자본총계" || nm === "수익합계" || nm === "비용합계" || nm === "영업수익" || nm === "영업비용") return 0;
  // 중분류
  if (nm.includes("_")) return 2; // 하위 항목 (FISIS는 _로 구분)
  return 1;
}
