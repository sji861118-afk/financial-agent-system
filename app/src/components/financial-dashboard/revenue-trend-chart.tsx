"use client";

import {
  ComposedChart,
  Bar,
  Line,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, CHART_DEFAULTS, formatKrwTooltip } from "./chart-theme";
import { MultiSeriesKrwTooltip } from "./chart-tooltips";
import { findRow, parseAmount } from "./utils";
import type { DashboardFinancialRow } from "./types";

interface RevenueTrendChartProps {
  isItems: DashboardFinancialRow[];
  years: string[];
}

export function RevenueTrendChart({ isItems, years }: RevenueTrendChartProps) {
  if (!years.length || !isItems?.length) return null;

  const revenue = findRow(isItems, "revenue");
  const op = findRow(isItems, "operatingProfit");
  const net = findRow(isItems, "netProfit");

  const data = years.map((y) => ({
    year: y,
    매출: revenue ? parseAmount(revenue[y]) : 0,
    영업이익: op ? parseAmount(op[y]) : 0,
    당기순이익: net ? parseAmount(net[y]) : 0,
  }));

  if (data.every((d) => d.매출 === 0 && d.영업이익 === 0 && d.당기순이익 === 0)) {
    return null;
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold text-slate-700">매출 · 영업이익 · 당기순이익 추이</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={CHART_DEFAULTS.margin}>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            <XAxis dataKey="year" {...CHART_DEFAULTS.axis} />
            <YAxis tickFormatter={(v) => formatKrwTooltip(v)} {...CHART_DEFAULTS.axis} width={70} />
            <Tooltip content={<MultiSeriesKrwTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="매출" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={48}>
              <LabelList
                dataKey="매출"
                position="top"
                formatter={((v: number) => formatKrwTooltip(v)) as never}
                style={{ fontSize: 10, fill: CHART_COLORS.revenue, fontWeight: 600 }}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="영업이익"
              stroke={CHART_COLORS.operatingProfit}
              strokeWidth={2}
              dot={{ r: 4 }}
            >
              <LabelList
                dataKey="영업이익"
                position="top"
                formatter={((v: number) => formatKrwTooltip(v)) as never}
                style={{ fontSize: 10, fill: CHART_COLORS.operatingProfit, fontWeight: 600 }}
              />
            </Line>
            <Line
              type="monotone"
              dataKey="당기순이익"
              stroke={CHART_COLORS.netProfit}
              strokeWidth={2}
              dot={{ r: 4 }}
            >
              <LabelList
                dataKey="당기순이익"
                position="bottom"
                formatter={((v: number) => formatKrwTooltip(v)) as never}
                style={{ fontSize: 10, fill: CHART_COLORS.netProfit, fontWeight: 600 }}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
