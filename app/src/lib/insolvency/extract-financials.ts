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

  // 매출액 (제조/건설/보험/금융 다종 keyword)
  let revenue = getExact(isRows, ["매출", "매출액", "영업수익", "공사수익", "분양수익"], year);
  if (revenue === 0) revenue = get(isRows, ["매출액", "영업수익", "공사수익", "분양수익"], year);
  if (revenue === 0) revenue = get(isRows, ["보험수익", "보험료수익", "수입보험료", "보험서비스수익"], year);
  if (revenue === 0) revenue = get(isRows, ["순영업수익", "순영업수익합계", "영업수익합계", "이자수익합계", "순이자손익"], year);

  const operatingIncome = get(
    isRows,
    ["영업이익", "영업이익(손실)", "영업손익", "영업손실"],
    year,
  );

  const netIncome = get(
    isRows,
    [
      "당기순이익", "당기순이익(손실)", "당기순손익", "당기순손실",
      "연결당기순이익", "연결당기순손익",
      "반기순이익", "반기순손실", "분기순이익", "분기순손실",
    ],
    year,
  );

  const interestExpense = getInterestExpense(isRows, cfRows, year);

  return { totalAssets, totalLiab, totalEquity, borrowings, revenue, operatingIncome, interestExpense, netIncome };
}

/**
 * 24재무셀 추출 (3개년 × 8항목).
 * 연결(CFS) 데이터 우선, 없으면 개별(OFS).
 */
export function extract24Cells(fr: FinancialResult, years: string[]): Cells24 {
  const useCfs = fr.hasCfs && fr.bsItemsCfs.length > 0;
  const bsRows = useCfs ? fr.bsItemsCfs : fr.bsItems;
  const isRows = useCfs ? fr.isItemsCfs : fr.isItems;
  const cfRows = useCfs ? (fr.cfItemsCfs || []) : (fr.cfItems || []);

  const byYear: Record<string, YearCells> = {};
  for (const y of years) {
    byYear[y] = extractYearCells(bsRows, isRows, cfRows, y);
  }
  return { byYear };
}
