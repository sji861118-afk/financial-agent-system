import type { FinancialResult, FinancialRow } from "@/lib/dart-api";
import type { Cells24, CellMatch, YearCellMatches, YearCells } from "./types";

/**
 * FinancialResult → 24재무셀 추출 (+ 매칭 추적).
 *
 * 매칭 전략:
 *   - 연결(CFS) 우선 (재무분석은 연결 기준이 본질), 없으면 개별(OFS)
 *   - 정확매칭 → 부분매칭 fallback (dart-api.ts:596-616 calcRatios 패턴 미러링)
 *   - 차입금 계산은 dart-api.ts:735-810 "차입금 계산 (재무분석 전문가 기준)" 룰을 단순화 복제
 *
 * 매칭 추적: 모든 추출 함수는 `{ value, match }`를 반환. 사용자 피드백
 * ("어떤 항목으로 추출되는지 모르겠음") 대응 — UI tooltip + Excel cell comment에 노출.
 *
 * 단위: DART raw 단위(원). 호출 측에서 백만원 변환 (`Math.round(v / 1_000_000)`).
 */

function normalizeAcct(s: string): string {
  let n = s.replace(/\s/g, "");
  n = n.replace(/\(유동\)$|\(비유동\)$/g, "");
  n = n.replace(/^[IⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩivxlcdm\d]+[.·\s]+/, "");
  n = n.replace(/^\(\d+\)/, "");
  n = n.replace(/\(주석?[\d,\s]*\)/g, "");
  n = n.replace(/\(Note\s*[\d,\s]*\)/gi, "");
  return n;
}

function parseNum(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s || s === "-") return 0;
  const negative = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[(),\s]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

interface MR { value: number; match: CellMatch; }

const NO_MATCH: CellMatch = { account: "", kind: "missing" };

/** 첫 매칭 정책 (기존 — 일반 회사 회귀 방지). BS 등 outlier 위험 항목에 사용. */
function getMR(rows: FinancialRow[], keywords: string[], year: string): MR {
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of keywords) {
      if (norm === kw.replace(/\s/g, "")) {
        const v = parseNum(r[year]);
        if (v !== 0) return { value: v, match: { account: r.account, kind: "exact" } };
      }
    }
  }
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of keywords) {
      if (norm.includes(kw.replace(/\s/g, ""))) {
        const v = parseNum(r[year]);
        if (v !== 0) return { value: v, match: { account: r.account, kind: "partial" } };
      }
    }
  }
  return { value: 0, match: NO_MATCH };
}

function getExactMR(rows: FinancialRow[], keywords: string[], year: string): MR {
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of keywords) {
      if (norm === kw.replace(/\s/g, "")) {
        return { value: parseNum(r[year]), match: { account: r.account, kind: "exact" } };
      }
    }
  }
  return { value: 0, match: NO_MATCH };
}

/**
 * 정확매칭 후보 중 절댓값 최대값 반환 (+ 매칭명).
 * dart-api.ts Stage 2(annual-report-body)가 같은 IS section의 별도/연결/
 * 분기/통합 표를 모두 isItems에 통합. 첫 매칭이 보조 부분표(작은 값)일 경우
 * max로 본 계정 합계를 찾음.
 */
function getExactMaxMR(rows: FinancialRow[], keywords: string[], year: string): MR {
  let maxV = 0;
  let maxAcc = "";
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of keywords) {
      if (norm === kw.replace(/\s/g, "")) {
        const v = parseNum(r[year]);
        if (Math.abs(v) > Math.abs(maxV)) {
          maxV = v;
          maxAcc = r.account;
        }
      }
    }
  }
  return maxAcc
    ? { value: maxV, match: { account: maxAcc, kind: "exact", detail: "max" } }
    : { value: 0, match: NO_MATCH };
}

/** 부분 매칭 + max (IS 항목 fallback). */
function getMaxMR(rows: FinancialRow[], keywords: string[], year: string): MR {
  const exact = getExactMaxMR(rows, keywords, year);
  if (exact.value !== 0) return exact;
  let maxV = 0;
  let maxAcc = "";
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of keywords) {
      if (norm.includes(kw.replace(/\s/g, ""))) {
        const v = parseNum(r[year]);
        if (Math.abs(v) > Math.abs(maxV)) {
          maxV = v;
          maxAcc = r.account;
        }
      }
    }
  }
  return maxAcc
    ? { value: maxV, match: { account: maxAcc, kind: "partial", detail: "max" } }
    : { value: 0, match: NO_MATCH };
}

/**
 * 부호 처리 매칭 (+ 매칭명). DART의 계정명 컨벤션:
 *   - "영업이익" / "당기순이익" / "영업이익(손실)" / "당기순이익(손실)" 통합 계정 → raw 값의 부호 그대로 사용
 *   - "영업손실" / "당기순손실" / "분기순손실" / "반기순손실" 등 손실 단독 계정 → raw가 절댓값(양수)으로 옴 → 음수로 변환
 *
 * 호출 측: profitKeywords(통합·이익)와 lossKeywords(손실 단독)를 분리해서 전달.
 * 우진물산처럼 영업손실/순손실 계정으로만 표기되는 회사에서 부호 오류 방지.
 */
function getSignedProfitMR(
  rows: FinancialRow[],
  profitKeywords: string[],
  lossKeywords: string[],
  year: string,
): MR {
  // 1순위: 손실 계정명 정확 매칭 → -|v|
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of lossKeywords) {
      if (norm === kw.replace(/\s/g, "")) {
        const v = parseNum(r[year]);
        if (v !== 0) {
          return {
            value: -Math.abs(v),
            match: { account: r.account, kind: "exact", detail: "손실 계정 → 음수 변환" },
          };
        }
      }
    }
  }
  // 2순위: 이익(통합 포함) 계정명 → raw 부호 그대로
  return getMR(rows, profitKeywords, year);
}

/**
 * 총차입금 계산 (+ 매칭된 모든 계정명 SUM). dart-api.ts:735-810 룰 압축 복제.
 *  - "차입부채" 단일 행이 있으면 그것을 사용
 *  - 없으면 단기/장기 차입금·사채·리스부채·대출금 SUM (할인차금 차감)
 *  - 부분 매칭 fallback (계정명에 차입금/사채/리스부채/대출금 포함, 단 총계/이자/할인/채권 제외)
 */
function calcBorrowingsMR(bsRows: FinancialRow[], year: string): MR {
  const single = getExactMR(bsRows, ["차입부채"], year);
  if (single.value !== 0) {
    return {
      value: Math.abs(single.value),
      match: { account: single.match.account, kind: "exact", detail: "차입부채 단일 행" },
    };
  }

  const exactKw = [
    "단기차입금", "장기차입금",
    "유동성장기부채", "유동성장기차입금",
    "사채", "회사채", "전환사채", "신주인수권부사채", "교환사채",
    "단기사채", "유동성사채",
    "유동리스부채", "비유동리스부채", "리스부채",
    "단기리스부채", "장기리스부채",
    "유동금융부채", "비유동금융부채",
    "파생금융부채",
    "차입금", "장기부채",
    "대출금", "단기대출금", "장기대출금",
    "PF대출금", "프로젝트금융대출금", "프로젝트금융차입금",
    "건설자금대출금", "시행사대출금",
    "유동성대출금", "유동성장기대출금",
  ];

  let total = 0;
  const seen = new Set<string>();
  const matchedAccounts: string[] = [];

  for (const kw of exactKw) {
    const kwNorm = kw.replace(/\s/g, "");
    for (let i = 0; i < bsRows.length; i++) {
      const norm = normalizeAcct(bsRows[i].account);
      if (norm !== kwNorm) continue;
      const v = parseNum(bsRows[i][year]);
      if (v === 0 || seen.has(kwNorm)) continue;
      let netVal = Math.abs(v);
      if (i + 1 < bsRows.length) {
        const nextNorm = normalizeAcct(bsRows[i + 1].account);
        if (nextNorm.includes("할인차금") || nextNorm.includes("사채할인발행차금")) {
          const discount = parseNum(bsRows[i + 1][year]);
          if (discount < 0) netVal += discount;
        }
      }
      total += netVal;
      seen.add(kwNorm);
      matchedAccounts.push(bsRows[i].account);
      break;
    }
  }

  // 부분 매칭 fallback
  for (let i = 0; i < bsRows.length; i++) {
    const norm = normalizeAcct(bsRows[i].account);
    if (seen.has(norm)) continue;
    const isBorrowing =
      (norm.includes("차입금") || norm.includes("사채") || norm.includes("리스부채") || norm.includes("대출금")) &&
      !norm.includes("총계") && !norm.includes("합계") && !norm.includes("이자") &&
      !norm.includes("상환") && !norm.includes("할인") && !norm.includes("채권");
    if (!isBorrowing) continue;
    const v = parseNum(bsRows[i][year]);
    if (v === 0) continue;
    let netVal = Math.abs(v);
    if (i + 1 < bsRows.length) {
      const nextNorm = normalizeAcct(bsRows[i + 1].account);
      if (nextNorm.includes("할인차금") || nextNorm.includes("사채할인발행차금")) {
        const discount = parseNum(bsRows[i + 1][year]);
        if (discount < 0) netVal += discount;
      }
    }
    total += netVal;
    seen.add(norm);
    matchedAccounts.push(`${bsRows[i].account}*`); // * = 부분매칭 fallback
  }

  if (matchedAccounts.length === 0) {
    return { value: 0, match: NO_MATCH };
  }
  return {
    value: total,
    match: {
      account: matchedAccounts.join("+"),
      kind: matchedAccounts.length === 1 ? "exact" : "sum",
      detail: matchedAccounts.length === 1 ? undefined : `${matchedAccounts.length}건 SUM`,
    },
  };
}

/**
 * 이자비용 추출 (+ 매칭명). 우선순위:
 *   1) IS 정확매칭 "이자비용"
 *   2) CF "이자지급" / "이자납부"
 *   3) IS 부분매칭 "금융비용" / "금융원가"
 */
function getInterestExpenseMR(isRows: FinancialRow[], cfRows: FinancialRow[], year: string): MR {
  const isExact = getExactMR(isRows, ["이자비용"], year);
  if (isExact.value !== 0) {
    return { value: Math.abs(isExact.value), match: isExact.match };
  }
  const cfHit = getMR(cfRows, ["이자지급", "이자납부"], year);
  if (cfHit.value !== 0) {
    return {
      value: Math.abs(cfHit.value),
      match: { account: cfHit.match.account, kind: cfHit.match.kind, detail: "CF 이자지급 fallback" },
    };
  }
  const finCost = getMR(isRows, ["금융비용", "금융원가"], year);
  if (finCost.value !== 0) {
    return {
      value: Math.abs(finCost.value),
      match: { account: finCost.match.account, kind: finCost.match.kind, detail: "금융비용 fallback" },
    };
  }
  return { value: 0, match: NO_MATCH };
}

/**
 * 신탁업/금융업 매출 fallback (+ 매칭명).
 * 영업수익·매출액 계정이 없는 신탁/은행/증권/캐피탈 등에서
 * "순이자이익(이자수익−이자비용) + 순수수료이익(수수료수익−수수료비용)"으로 매출 산정.
 */
function calcFinancialRevenueMR(isRows: FinancialRow[], year: string): MR {
  const netInterest = getExactMR(isRows, ["순이자이익", "순이자손익"], year);
  const netFee = getExactMR(isRows, ["순수수료이익", "순수수료손익"], year);
  if (netInterest.value !== 0 || netFee.value !== 0) {
    const parts: string[] = [];
    if (netInterest.match.account) parts.push(netInterest.match.account);
    if (netFee.match.account) parts.push(netFee.match.account);
    return {
      value: netInterest.value + netFee.value,
      match: {
        account: parts.join("+"),
        kind: "sum",
        detail: "신탁/금융업: 순이자이익+순수수료이익",
      },
    };
  }
  const intIncome = getExactMR(isRows, ["이자수익"], year);
  const intExpense = getExactMR(isRows, ["이자비용"], year);
  const feeIncome = getExactMR(isRows, ["수수료수익"], year);
  const feeExpense = getExactMR(isRows, ["수수료비용"], year);
  if (intIncome.value === 0 && feeIncome.value === 0) {
    return { value: 0, match: NO_MATCH };
  }
  const v =
    Math.abs(intIncome.value) - Math.abs(intExpense.value) +
    Math.abs(feeIncome.value) - Math.abs(feeExpense.value);
  const parts = [intIncome.match.account, intExpense.match.account, feeIncome.match.account, feeExpense.match.account]
    .filter(Boolean);
  return {
    value: v,
    match: {
      account: parts.join("±"),
      kind: "sum",
      detail: "신탁/금융업: (이자수익−이자비용)+(수수료수익−수수료비용)",
    },
  };
}

function extractYearCells(
  bsRows: FinancialRow[],
  isRows: FinancialRow[],
  cfRows: FinancialRow[],
  year: string,
): { cells: YearCells; matches: YearCellMatches } {
  // 자산총계
  let assetsMR = getMR(bsRows, ["자산총계", "자산합계", "부채와자본총계", "부채및자본총계", "자본과부채총계"], year);
  const liabMR = getMR(bsRows, ["부채총계", "부채합계"], year);
  const equityMR = getMR(bsRows, ["자본총계", "자본합계"], year);
  if (assetsMR.value === 0 && liabMR.value !== 0 && equityMR.value !== 0) {
    assetsMR = {
      value: liabMR.value + equityMR.value,
      match: { account: "부채총계+자본총계", kind: "sum", detail: "자산총계 결측 → 부채+자본 합산" },
    };
  }

  const borrowMR = calcBorrowingsMR(bsRows, year);

  // 매출액 — 다단계 매칭
  const revenueKw = [
    "매출", "매출액", "수익(매출액)",
    "영업수익", "공사수익", "분양수익",
    "용역수익", "용역매출", "용역매출액",
    "상품매출", "제품매출", "건설용역매출", "서비스매출", "서비스수익",
  ];
  let revenueMR = getExactMR(isRows, revenueKw, year);
  if (revenueMR.value === 0) {
    revenueMR = getMR(isRows, ["매출액", "영업수익", "공사수익", "분양수익"], year);
  }
  if (revenueMR.value === 0) {
    revenueMR = getMR(isRows, ["보험수익", "보험료수익", "수입보험료", "보험서비스수익"], year);
  }
  if (revenueMR.value === 0) {
    revenueMR = getMR(isRows, ["순영업수익", "순영업수익합계", "영업수익합계"], year);
  }
  if (revenueMR.value === 0) {
    revenueMR = calcFinancialRevenueMR(isRows, year);
  }
  if (revenueMR.value === 0) {
    // 6순위: annual-report-body 다중행 max
    const maxMR = getExactMaxMR(isRows, revenueKw, year);
    if (maxMR.value !== 0) revenueMR = maxMR;
  }

  // 영업손익
  const opProfitKw = ["영업이익", "영업이익(손실)", "영업손익"];
  const opLossKw = ["영업손실"];
  let opMR = getSignedProfitMR(isRows, opProfitKw, opLossKw, year);
  if (opMR.value === 0) {
    const maxOp = getExactMaxMR(isRows, [...opProfitKw, ...opLossKw], year);
    if (Math.abs(maxOp.value) > 0) opMR = maxOp;
  }

  // 당기순손익
  const niProfitKw = [
    "당기순이익", "당기순이익(손실)", "당기순손익",
    "연결당기순이익", "연결당기순손익",
    "반기순이익", "분기순이익",
  ];
  const niLossKw = ["당기순손실", "반기순손실", "분기순손실", "연결당기순손실"];
  let niMR = getSignedProfitMR(isRows, niProfitKw, niLossKw, year);
  if (niMR.value === 0) {
    const maxNi = getExactMaxMR(isRows, [...niProfitKw, ...niLossKw], year);
    if (Math.abs(maxNi.value) > 0) niMR = maxNi;
  }

  let ieMR = getInterestExpenseMR(isRows, cfRows, year);
  if (ieMR.value === 0) {
    const ieIs = getExactMaxMR(isRows, ["이자비용"], year);
    const ieCf = getExactMaxMR(cfRows, ["이자지급", "이자납부"], year);
    if (Math.abs(ieIs.value) >= Math.abs(ieCf.value) && ieIs.value !== 0) {
      ieMR = { value: Math.abs(ieIs.value), match: { ...ieIs.match, detail: "max fallback" } };
    } else if (ieCf.value !== 0) {
      ieMR = { value: Math.abs(ieCf.value), match: { ...ieCf.match, detail: "CF max fallback" } };
    }
  }
  // 표시: 절댓값 (PDF 양식 컨벤션)
  const ieValue = Math.abs(ieMR.value);

  // 미사용 변수 경고 회피
  void getMaxMR;

  const cells: YearCells = {
    totalAssets: assetsMR.value,
    totalLiab: liabMR.value,
    totalEquity: equityMR.value,
    borrowings: borrowMR.value,
    revenue: revenueMR.value,
    operatingIncome: opMR.value,
    interestExpense: ieValue,
    netIncome: niMR.value,
  };
  const matches: YearCellMatches = {
    totalAssets: assetsMR.match,
    totalLiab: liabMR.match,
    totalEquity: equityMR.match,
    borrowings: borrowMR.match,
    revenue: revenueMR.match,
    operatingIncome: opMR.match,
    interestExpense: ieMR.match,
    netIncome: niMR.match,
  };
  return { cells, matches };
}

/**
 * 보고서 단위 자동 감지 + 보정.
 * DART의 fnlttSinglAcntAll은 raw를 원 단위로 주는 것이 일반적이고
 * dart-api.ts:546의 toMillions로 백만원 단위 string으로 표준화된다.
 * 그러나 일부 회사(특히 금융업·증권사·Stage 3 감사보고서 fallback)는
 * raw 자체가 이미 백만원/천원 단위로 보고되어 toMillions가 추가로 나누면
 * 비현실적으로 작은 값이 된다 (예: NH투자증권 자산 63 백만 → 실제 59조원).
 *
 * 휴리스틱:
 *   - 자산총계 최대값 < 1,000 (백만단위 = 10억원) → 사실상 활동 회사 없음
 *     → 보고서가 이미 백만/천 단위로 보고된 것으로 추정 → ×1,000,000 보정
 */
function detectUnitMultiplier(byYear: Record<string, YearCells>): number {
  const maxAsset = Math.max(...Object.values(byYear).map((c) => c?.totalAssets || 0));
  if (maxAsset > 0 && maxAsset < 1_000) {
    return 1_000_000;
  }
  return 1;
}

/**
 * IS-only 단위 mismatch 감지 (쌍용건설 사례).
 */
function detectIsOnlyMultiplier(byYear: Record<string, YearCells>): number {
  const cells = Object.values(byYear).filter((c): c is YearCells => !!c);
  if (cells.length === 0) return 1;
  const maxAsset = Math.max(...cells.map((c) => c.totalAssets || 0));
  const maxRevenue = Math.max(...cells.map((c) => c.revenue || 0));
  if (maxRevenue === 0) return 1;
  if (maxAsset === 0) return 1;
  if (maxAsset / maxRevenue > 100_000) {
    return 1_000_000;
  }
  return 1;
}

function applyMultiplier(byYear: Record<string, YearCells>, m: number): Record<string, YearCells> {
  if (m === 1) return byYear;
  const out: Record<string, YearCells> = {};
  for (const [y, c] of Object.entries(byYear)) {
    out[y] = {
      totalAssets: c.totalAssets * m,
      totalLiab: c.totalLiab * m,
      totalEquity: c.totalEquity * m,
      borrowings: c.borrowings * m,
      revenue: c.revenue * m,
      operatingIncome: c.operatingIncome * m,
      interestExpense: c.interestExpense * m,
      netIncome: c.netIncome * m,
    };
  }
  return out;
}

/** IS 항목(매출/영업/이자/순익)에만 multiplier 적용 — BS는 보존 */
function applyIsMultiplier(byYear: Record<string, YearCells>, m: number): Record<string, YearCells> {
  if (m === 1) return byYear;
  const out: Record<string, YearCells> = {};
  for (const [y, c] of Object.entries(byYear)) {
    out[y] = {
      ...c,
      revenue: c.revenue * m,
      operatingIncome: c.operatingIncome * m,
      interestExpense: c.interestExpense * m,
      netIncome: c.netIncome * m,
    };
  }
  return out;
}

/**
 * 24재무셀 추출 (3개년 × 8항목) + 매칭 메타.
 * 부실징후점검은 차주 본인의 신용 평가가 본질이므로 **개별(OFS) 우선**.
 * 연결(CFS)은 자회사 영향으로 차입/자산이 부풀려지거나 지분법으로
 * 영업이익이 왜곡될 수 있다 (한국토지신탁 사례: 개별 영업이익 28,356 vs 연결 -20,880).
 * 개별 데이터가 없는 경우(예: 일부 SPC)에만 연결 사용.
 *
 * 마지막에 단위 자동 감지 + 보정 적용 (NH투자증권 등 백만단위 보고 회사 대응).
 */
export function extract24Cells(fr: FinancialResult, years: string[]): Cells24 {
  const useOfs = fr.hasOfs && fr.bsItems.length > 0;
  const bsRows = useOfs ? fr.bsItems : fr.bsItemsCfs;
  const isRows = useOfs ? fr.isItems : fr.isItemsCfs;
  const cfRows = useOfs ? (fr.cfItems || []) : (fr.cfItemsCfs || []);

  let byYear: Record<string, YearCells> = {};
  const matches: Record<string, YearCellMatches> = {};
  for (const y of years) {
    const r = extractYearCells(bsRows, isRows, cfRows, y);
    byYear[y] = r.cells;
    matches[y] = r.matches;
  }

  const corpName = fr.companyInfo?.corpName || "(unknown)";

  // 1단계: 전체 단위 보정
  const multiplier = detectUnitMultiplier(byYear);
  if (multiplier !== 1) {
    console.log(`[extract24Cells] ${corpName} 전체 단위 보정 ×${multiplier}`);
    byYear = applyMultiplier(byYear, multiplier);
  } else {
    const isMultiplier = detectIsOnlyMultiplier(byYear);
    if (isMultiplier !== 1) {
      console.log(`[extract24Cells] ${corpName} IS-only 단위 보정 ×${isMultiplier}`);
      byYear = applyIsMultiplier(byYear, isMultiplier);
    }
  }

  return { byYear, matches };
}
