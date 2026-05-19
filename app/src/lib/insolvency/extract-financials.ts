import type { FinancialResult, FinancialRow } from "@/lib/dart-api";
import type { Cells24, YearCells } from "./types";

/**
 * FinancialResult → 24재무셀 추출.
 *
 * 매칭 전략:
 *   - 연결(CFS) 우선 (재무분석은 연결 기준이 본질), 없으면 개별(OFS)
 *   - 정확매칭 → 부분매칭 fallback (dart-api.ts:596-616 calcRatios 패턴 미러링)
 *   - 차입금 계산은 dart-api.ts:735-810 "차입금 계산 (재무분석 전문가 기준)" 룰을 단순화 복제
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

function get(rows: FinancialRow[], keywords: string[], year: string): number {
  // 1) 정확 매칭
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of keywords) {
      if (norm === kw.replace(/\s/g, "")) {
        const v = parseNum(r[year]);
        if (v !== 0) return v;
      }
    }
  }
  // 2) 부분 매칭
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of keywords) {
      if (norm.includes(kw.replace(/\s/g, ""))) {
        const v = parseNum(r[year]);
        if (v !== 0) return v;
      }
    }
  }
  return 0;
}

function getExact(rows: FinancialRow[], keywords: string[], year: string): number {
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of keywords) {
      if (norm === kw.replace(/\s/g, "")) return parseNum(r[year]);
    }
  }
  return 0;
}

/**
 * 부호 처리 매칭. DART의 계정명 컨벤션:
 *   - "영업이익" / "당기순이익" / "영업이익(손실)" / "당기순이익(손실)" 통합 계정 → raw 값의 부호 그대로 사용
 *   - "영업손실" / "당기순손실" / "분기순손실" / "반기순손실" 등 손실 단독 계정 → raw가 절댓값(양수)으로 옴 → 음수로 변환
 *
 * 호출 측: profitKeywords(통합·이익)와 lossKeywords(손실 단독)를 분리해서 전달.
 * 우진물산처럼 영업손실/순손실 계정으로만 표기되는 회사에서 부호 오류 방지.
 */
function getSignedProfit(
  rows: FinancialRow[],
  profitKeywords: string[],
  lossKeywords: string[],
  year: string,
): number {
  // 1순위: 손실 계정명 정확 매칭 → -|v|
  for (const r of rows) {
    const norm = normalizeAcct(r.account);
    for (const kw of lossKeywords) {
      if (norm === kw.replace(/\s/g, "")) {
        const v = parseNum(r[year]);
        if (v !== 0) return -Math.abs(v);
      }
    }
  }
  // 2순위: 이익(통합 포함) 계정명 → raw 부호 그대로 (DART가 이미 음수면 음수)
  return get(rows, profitKeywords, year);
}

/**
 * 총차입금 계산. dart-api.ts:735-810 룰 압축 복제.
 *  - "차입부채" 단일 행이 있으면 그것을 사용
 *  - 없으면 단기/장기 차입금·사채·리스부채·대출금 SUM (할인차금 차감)
 *  - 부분 매칭 fallback (계정명에 차입금/사채/리스부채/대출금 포함, 단 총계/이자/할인/채권 제외)
 */
function calcBorrowings(bsRows: FinancialRow[], year: string): number {
  const chaipBuchae = getExact(bsRows, ["차입부채"], year);
  if (chaipBuchae !== 0) return Math.abs(chaipBuchae);

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

  for (const kw of exactKw) {
    const kwNorm = kw.replace(/\s/g, "");
    for (let i = 0; i < bsRows.length; i++) {
      const norm = normalizeAcct(bsRows[i].account);
      if (norm !== kwNorm) continue;
      const v = parseNum(bsRows[i][year]);
      if (v === 0 || seen.has(kwNorm)) continue;
      let netVal = Math.abs(v);
      // 다음 행이 할인차금이면 차감
      if (i + 1 < bsRows.length) {
        const nextNorm = normalizeAcct(bsRows[i + 1].account);
        if (nextNorm.includes("할인차금") || nextNorm.includes("사채할인발행차금")) {
          const discount = parseNum(bsRows[i + 1][year]);
          if (discount < 0) netVal += discount; // discount<0 → 차감
        }
      }
      total += netVal;
      seen.add(kwNorm);
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
  }

  return total;
}

/**
 * 이자비용 추출. 우선순위:
 *   1) IS 정확매칭 "이자비용"
 *   2) CF "이자지급" / "이자납부"
 *   3) IS 부분매칭 "금융비용" / "금융원가"
 */
function getInterestExpense(isRows: FinancialRow[], cfRows: FinancialRow[], year: string): number {
  const isExact = getExact(isRows, ["이자비용"], year);
  if (isExact !== 0) return Math.abs(isExact);
  const cfHit = get(cfRows, ["이자지급", "이자납부"], year);
  if (cfHit !== 0) return Math.abs(cfHit);
  const finCost = get(isRows, ["금융비용", "금융원가"], year);
  return finCost !== 0 ? Math.abs(finCost) : 0;
}

/**
 * 신탁업/금융업 매출 fallback.
 * 영업수익·매출액 계정이 없는 신탁/은행/증권/캐피탈 등에서
 * "순이자이익(이자수익−이자비용) + 순수수료이익(수수료수익−수수료비용)"으로 매출 산정.
 * 재무분석 전문가 컨벤션 (한국토지신탁 PDF의 신탁업 매출 산정 방식과 동일).
 */
function calcFinancialRevenue(isRows: FinancialRow[], year: string): number {
  // 우선 "순이자이익" / "순수수료이익" 단일 행이 있으면 그것의 합 사용
  const netInterest = getExact(isRows, ["순이자이익", "순이자손익"], year);
  const netFee = getExact(isRows, ["순수수료이익", "순수수료손익"], year);
  if (netInterest !== 0 || netFee !== 0) {
    return netInterest + netFee;
  }
  // 없으면 직접 계산 — 모두 절댓값으로 통일 (DART 비용은 절댓값으로 옴)
  const intIncome = getExact(isRows, ["이자수익"], year);
  const intExpense = getExact(isRows, ["이자비용"], year);
  const feeIncome = getExact(isRows, ["수수료수익"], year);
  const feeExpense = getExact(isRows, ["수수료비용"], year);
  if (intIncome === 0 && feeIncome === 0) return 0;
  return Math.abs(intIncome) - Math.abs(intExpense) + Math.abs(feeIncome) - Math.abs(feeExpense);
}

function extractYearCells(
  bsRows: FinancialRow[],
  isRows: FinancialRow[],
  cfRows: FinancialRow[],
  year: string,
): YearCells {
  let totalAssets = get(bsRows, ["자산총계", "자산합계", "부채와자본총계", "부채및자본총계", "자본과부채총계"], year);
  const totalLiab = get(bsRows, ["부채총계", "부채합계"], year);
  const totalEquity = get(bsRows, ["자본총계", "자본합계"], year);
  if (totalAssets === 0 && totalLiab !== 0 && totalEquity !== 0) {
    totalAssets = totalLiab + totalEquity;
  }

  const borrowings = calcBorrowings(bsRows, year);

  // 매출액 — 다단계 매칭 (재무분석 전문가 입장에서 다양한 회사별 계정명 자동 대응)
  // 1순위: 정확 매칭 — "매출"(쌍용건설), "매출액", "영업수익", "수익(매출액)" 등 회사별 통합 계정
  let revenue = getExact(
    isRows,
    [
      "매출", "매출액", "수익(매출액)",
      "영업수익", "공사수익", "분양수익",
      "용역수익", "용역매출", "용역매출액",
      "상품매출", "제품매출", "건설용역매출", "서비스매출", "서비스수익",
    ],
    year,
  );
  // 2순위: 부분 매칭 (단, "매출원가/매출채권/매출총이익" 등 자식 항목 회피)
  if (revenue === 0) revenue = get(isRows, ["매출액", "영업수익", "공사수익", "분양수익"], year);
  // 3순위: 보험업
  if (revenue === 0) revenue = get(isRows, ["보험수익", "보험료수익", "수입보험료", "보험서비스수익"], year);
  // 4순위: 일반 금융업 합계 항목
  if (revenue === 0) revenue = get(isRows, ["순영업수익", "순영업수익합계", "영업수익합계"], year);
  // 5순위: 신탁업/은행/증권 — 순이자이익+순수수료이익 fallback
  if (revenue === 0) revenue = calcFinancialRevenue(isRows, year);

  // 영업손익 — 손실 계정명일 경우 음수로 변환
  const operatingIncome = getSignedProfit(
    isRows,
    ["영업이익", "영업이익(손실)", "영업손익"],
    ["영업손실"],
    year,
  );

  // 당기순손익 — 손실 계정명일 경우 음수로 변환
  const netIncome = getSignedProfit(
    isRows,
    [
      "당기순이익", "당기순이익(손실)", "당기순손익",
      "연결당기순이익", "연결당기순손익",
      "반기순이익", "분기순이익",
    ],
    ["당기순손실", "반기순손실", "분기순손실", "연결당기순손실"],
    year,
  );

  const interestExpense = getInterestExpense(isRows, cfRows, year);

  return { totalAssets, totalLiab, totalEquity, borrowings, revenue, operatingIncome, interestExpense, netIncome };
}

/**
 * 보고서 단위 자동 감지 + 보정.
 *
 * DART의 fnlttSinglAcntAll은 raw를 원 단위로 주는 것이 일반적이고
 * dart-api.ts:546의 toMillions로 백만원 단위 string으로 표준화된다.
 * 그러나 일부 회사(특히 금융업·증권사·Stage 3 감사보고서 fallback)는
 * raw 자체가 이미 백만원/천원 단위로 보고되어 toMillions가 추가로 나누면
 * 비현실적으로 작은 값이 된다 (예: NH투자증권 자산 63 백만 → 실제 59조원).
 *
 * 휴리스틱:
 *   - 자산총계 최대값 < 1,000 (백만단위 = 10억원) → 사실상 활동 회사 없음
 *     → 보고서가 이미 백만/천 단위로 보고된 것으로 추정 → ×1,000,000 보정
 *   - 자산총계 1,000 ~ 999,999 (10억~1조 미만) → 정상 (작은 회사는 그대로)
 *   - 자산총계 ≥ 1,000,000 (1조 이상) → 정상 (대기업)
 */
function detectUnitMultiplier(byYear: Record<string, YearCells>): number {
  const maxAsset = Math.max(...Object.values(byYear).map((c) => c?.totalAssets || 0));
  if (maxAsset > 0 && maxAsset < 1_000) {
    return 1_000_000;
  }
  return 1;
}

/**
 * IS-only 단위 mismatch 감지.
 * BS는 정상(자산 정상 자릿수)인데 IS 값들이 비정상적으로 작은 경우 (쌍용건설 사례).
 * 휴리스틱: maxRevenue > 0이고 maxAsset / maxRevenue > 100,000 (자산회전율
 *           역수가 비현실적) → IS가 다른 단위로 보고된 것으로 추정 → IS만 ×1,000,000.
 * 실제 자산회전율은 일반적으로 0.1~3.0 → 역수 0.3~10. 10,000배 이상은 unrealistic.
 */
function detectIsOnlyMultiplier(byYear: Record<string, YearCells>): number {
  const cells = Object.values(byYear).filter((c): c is YearCells => !!c);
  if (cells.length === 0) return 1;
  const maxAsset = Math.max(...cells.map((c) => c.totalAssets || 0));
  const maxRevenue = Math.max(...cells.map((c) => c.revenue || 0));
  if (maxRevenue === 0) return 1; // 매출 자체 매칭 실패는 단위 문제와 무관
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
 * 24재무셀 추출 (3개년 × 8항목).
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
  for (const y of years) {
    byYear[y] = extractYearCells(bsRows, isRows, cfRows, y);
  }

  const corpName = fr.companyInfo?.corpName || "(unknown)";

  // 1단계: 전체 단위 보정 (BS/IS 모두 단위 mismatch — NH투자증권 등 금융업)
  const multiplier = detectUnitMultiplier(byYear);
  if (multiplier !== 1) {
    console.log(`[extract24Cells] ${corpName} 전체 단위 보정 ×${multiplier} (자산 ${Math.max(...Object.values(byYear).map((c) => c?.totalAssets || 0))} 백만 → 보고서 단위 mismatch)`);
    byYear = applyMultiplier(byYear, multiplier);
  } else {
    // 2단계: IS-only 단위 보정 (BS는 정상, IS만 mismatch — 쌍용건설 등)
    const isMultiplier = detectIsOnlyMultiplier(byYear);
    if (isMultiplier !== 1) {
      const maxA = Math.max(...Object.values(byYear).map((c) => c?.totalAssets || 0));
      const maxR = Math.max(...Object.values(byYear).map((c) => c?.revenue || 0));
      console.log(`[extract24Cells] ${corpName} IS-only 단위 보정 ×${isMultiplier} (자산 ${maxA} / 매출 ${maxR} 비현실적 자릿수 차이)`);
      byYear = applyIsMultiplier(byYear, isMultiplier);
    }
  }

  return { byYear };
}
