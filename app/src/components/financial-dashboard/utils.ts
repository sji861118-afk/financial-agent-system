import type { DashboardFinancialRow } from "./types";

export function parseAmount(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const s = String(val).trim();
  if (!s || s === "-") return 0;
  const negative = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[(),\s]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

export function parsePercent(val: string | undefined): number | null {
  if (!val || val === "-") return null;
  const cleaned = String(val).replace(/[%,\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const ACCOUNT_ALIASES: Record<string, string[]> = {
  revenue: ["매출액", "매출", "수익(매출액)", "영업수익", "매출수익"],
  operatingProfit: ["영업이익", "영업손실", "영업이익(손실)", "영업손익"],
  netProfit: ["당기순이익", "당기순손실", "당기순이익(손실)", "당기순손익", "연결당기순이익"],
  cfOperating: ["영업활동현금흐름", "영업활동으로인한현금흐름", "영업활동순현금흐름"],
  cfInvesting: ["투자활동현금흐름", "투자활동으로인한현금흐름", "투자활동순현금흐름"],
  cfFinancing: ["재무활동현금흐름", "재무활동으로인한현금흐름", "재무활동순현금흐름"],
  cfNetChange: ["현금및현금성자산의순증감", "현금의증감", "현금및현금성자산의증감"],
  // BS items for soundness breakdown
  totalLiab: ["부채총계", "부채합계"],
  totalEquity: ["자본총계", "자본합계"],
  currentAssets: ["유동자산", "유동자산총계"],
  currentLiab: ["유동부채", "유동부채총계"],
  inventory: ["재고자산"],
  capitalSurplus: ["자본잉여금"],
  retainedEarnings: ["이익잉여금", "결손금"],
  paidInCapital: ["자본금"],
  // IS items
  financialCost: ["금융비용", "이자비용"],
};

export function findRow(items: DashboardFinancialRow[] | undefined, key: keyof typeof ACCOUNT_ALIASES): DashboardFinancialRow | undefined {
  if (!items?.length) return undefined;
  const aliases = ACCOUNT_ALIASES[key].map((s) => s.replace(/\s/g, ""));
  return items.find((row) => {
    const acc = (row.account || "").replace(/\s/g, "");
    return aliases.some((a) => acc === a || acc.includes(a));
  });
}

export function rowToYearSeries(
  row: DashboardFinancialRow | undefined,
  years: string[],
): { year: string; value: number }[] {
  if (!row) return years.map((y) => ({ year: y, value: 0 }));
  return years.map((y) => ({ year: y, value: parseAmount(row[y]) }));
}

export function pickStatement<T>(
  hasOfs: boolean | undefined,
  ofs: T | undefined,
  cfs: T | undefined,
): T | undefined {
  if (hasOfs && ofs) return ofs;
  return cfs ?? ofs;
}

export function formatKrwShort(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조`;
  if (abs >= 10_000) return `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  if (abs >= 100) return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}백만`;
  if (value === 0) return "-";
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

export function pickLatestRatio(
  ratios: Record<string, Record<string, string>> | undefined,
  ratioName: string,
): { year: string; value: number } | null {
  if (!ratios) return null;
  const years = Object.keys(ratios).sort();
  for (let i = years.length - 1; i >= 0; i--) {
    const v = parsePercent(ratios[years[i]]?.[ratioName]);
    if (v !== null) return { year: years[i], value: v };
  }
  return null;
}

export function ratioYearSeries(
  ratios: Record<string, Record<string, string>> | undefined,
  ratioName: string,
  years: string[],
): { year: string; value: number | null }[] {
  if (!ratios) return years.map((y) => ({ year: y, value: null }));
  return years.map((y) => ({ year: y, value: parsePercent(ratios[y]?.[ratioName]) }));
}
