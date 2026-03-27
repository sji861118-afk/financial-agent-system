/**
 * 서브에이전트: parser
 * ====================
 * 수집된 원본 데이터(FinancialRow[])를 정규화하여 ParsedData 반환
 * - 계정명 정규화 (normalizeAcct 동일 로직)
 * - 주요 계정 존재 여부 확인
 * - 수치를 number로 통일
 */

import type { FinancialRow } from "../dart-api";
import type { ParsedData, ParsedItem, RawDataSnapshot } from "./types";

/** 계정명 정규화 (dart-api.ts normalizeAcct와 동일) */
function normalizeAcct(s: string): string {
  let n = s.replace(/\s/g, "");
  n = n.replace(/^[IⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩivxlcdm\d]+[.·\s]+/, "");
  n = n.replace(/^\(\d+\)/, "");
  n = n.replace(/\(주석?[\d,\s]*\)/g, "");
  n = n.replace(/\(Note\s*[\d,\s]*\)/gi, "");
  n = n.replace(/\(注[\d,\s]*\)/g, "");
  return n;
}

/** 문자열 금액 → number */
function parseAmount(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  const s = val.trim();
  if (s === "-" || s === "") return 0;
  const negative = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[(),\s]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return negative ? -num : num;
}

/** FinancialRow[] → ParsedItem[] */
function parseRows(rows: FinancialRow[], years: string[]): ParsedItem[] {
  return rows.map((row) => {
    const normalized = normalizeAcct(row.account || "");
    const values: Record<string, number> = {};
    for (const y of years) {
      values[y] = parseAmount(row[y]);
    }
    return {
      account: normalized,
      originalAccount: row.account || "",
      depth: row.depth,
      values,
    };
  });
}

/** 주요 계정 존재 확인 */
function checkKeyAccounts(bsItems: ParsedItem[], isItems: ParsedItem[]) {
  const bsAccounts = bsItems.map((i) => i.account);
  const isAccounts = isItems.map((i) => i.account);

  return {
    totalAssets: bsAccounts.some((a) => a.includes("자산총계")),
    totalLiabilities: bsAccounts.some((a) => a.includes("부채총계")),
    totalEquity: bsAccounts.some((a) => a.includes("자본총계")),
    revenue: isAccounts.some((a) => a.includes("매출액") || a.includes("영업수익") || a.includes("수익(매출액)")),
    operatingProfit: isAccounts.some((a) => a.includes("영업이익") || a.includes("영업손실")),
    netIncome: isAccounts.some((a) => a.includes("당기순이익") || a.includes("당기순손실") || a.includes("당기순손익")),
  };
}

export function parseFinancialData(
  snapshot: RawDataSnapshot
): ParsedData {
  const years = snapshot.years;

  // DART 원본 → FinancialRow 형태로 복원
  const dartBsRows: FinancialRow[] = snapshot.dartBsRaw.map((r) => ({
    account: r.account,
    ...r.values,
  })) as FinancialRow[];

  const dartIsRows: FinancialRow[] = snapshot.dartIsRaw.map((r) => ({
    account: r.account,
    ...r.values,
  })) as FinancialRow[];

  // 파싱
  const bsItems = parseRows(dartBsRows, years);
  const isItems = parseRows(dartIsRows, years);

  // 업로드 데이터도 있으면 파싱 (merger에서 합칠 수 있도록)
  // → 여기서는 DART 파싱만. 업로드는 merger가 처리

  const keyAccountsPresent = checkKeyAccounts(bsItems, isItems);

  return {
    bsItems,
    isItems,
    years,
    keyAccountsPresent,
  };
}
