export const CHART_COLORS = {
  revenue: "#3b82f6",
  operatingProfit: "#10b981",
  netProfit: "#f59e0b",
  positive: "#10b981",
  negative: "#ef4444",
  neutral: "#94a3b8",
  primary: "#3b82f6",
  secondary: "#8b5cf6",
  grid: "#e2e8f0",
  axis: "#64748b",
  tooltipBg: "#0f172a",
  tooltipText: "#f8fafc",
} as const;

export const PIE_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#a855f7",
  "#f97316",
  "#94a3b8",
];

export const CHART_DEFAULTS = {
  margin: { top: 12, right: 16, bottom: 8, left: 8 },
  axis: {
    stroke: CHART_COLORS.axis,
    fontSize: 11,
    tickLine: false,
  },
  grid: {
    stroke: CHART_COLORS.grid,
    strokeDasharray: "3 3",
    vertical: false,
  },
  tooltipStyle: {
    background: CHART_COLORS.tooltipBg,
    border: "none",
    borderRadius: 6,
    color: CHART_COLORS.tooltipText,
    fontSize: 12,
    padding: "8px 10px",
  },
} as const;

/** Compact form for axis ticks (e.g., "308.7조"). Input is in 백만원. */
export function formatKrwTooltip(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조`;
  if (abs >= 10_000) return `${(n / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  return `${n.toLocaleString("ko-KR")}백만`;
}

/**
 * Full breakdown for tooltip body (e.g., "308조 7,058억"). Input is in 백만원.
 * 1조 = 1,000,000 백만 / 1억 = 100 백만.
 */
export function formatKrwBreakdown(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : Number(value);
  if (!Number.isFinite(n) || n === 0) return "-";
  const negative = n < 0;
  const abs = Math.abs(n);
  const jo = Math.floor(abs / 1_000_000);
  const eok = Math.floor((abs % 1_000_000) / 100);
  const baekman = Math.floor(abs % 100);
  const parts: string[] = [];
  if (jo > 0) parts.push(`${jo.toLocaleString("ko-KR")}조`);
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (jo === 0 && eok === 0) parts.push(`${baekman.toLocaleString("ko-KR")}백만`);
  if (!parts.length) return "-";
  return (negative ? "-" : "") + parts.join(" ") + "원";
}
