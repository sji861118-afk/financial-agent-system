"use client";

import { CHART_DEFAULTS, formatKrwBreakdown } from "./chart-theme";

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | string;
  name?: string | number;
  color?: string;
  fill?: string;
  payload?: Record<string, unknown>;
}

interface RechartsTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}

const wrapperStyle: React.CSSProperties = {
  background: CHART_DEFAULTS.tooltipStyle.background,
  border: "none",
  borderRadius: 6,
  color: CHART_DEFAULTS.tooltipStyle.color,
  fontSize: 12,
  padding: "8px 10px",
  minWidth: 140,
  boxShadow: "0 4px 12px rgba(15,23,42,0.25)",
};

/** Multi-series tooltip — label = year, rows = each series (매출/영업이익/...). */
export function MultiSeriesKrwTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={wrapperStyle}>
      <div style={{ fontWeight: 600, marginBottom: 6, opacity: 0.85 }}>{label}</div>
      {payload.map((p, i) => (
        <div
          key={`${p.dataKey ?? p.name ?? i}`}
          style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1.6 }}
        >
          <span style={{ color: p.color || p.fill, fontSize: 14, lineHeight: 1 }}>●</span>
          <span style={{ flex: 1, opacity: 0.9 }}>{p.dataKey ?? p.name}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatKrwBreakdown(Number(p.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Single-series tooltip — label + one big value. */
export function SingleKrwTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={wrapperStyle}>
      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          color: p.color || p.fill || "white",
        }}
      >
        {formatKrwBreakdown(Number(p.value))}
      </div>
    </div>
  );
}

/** Percent tooltip — for ratio donuts / shareholders. */
export function PercentTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const v = Number(p.value);
  return (
    <div style={wrapperStyle}>
      {label !== undefined && <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: p.color || p.fill }}>●</span>
        <span style={{ flex: 1 }}>{p.name ?? p.dataKey}</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {Number.isFinite(v) ? `${v.toFixed(2)}%` : "-"}
        </span>
      </div>
    </div>
  );
}
