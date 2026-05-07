"use client";

import {
  BarChart,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, CHART_DEFAULTS, formatKrwTooltip } from "./chart-theme";
import { SingleKrwTooltip } from "./chart-tooltips";
import { findRow, parseAmount } from "./utils";
import type { DashboardFinancialRow } from "./types";

interface MetricBarsProps {
  isItems: DashboardFinancialRow[];
  years: string[];
}

interface SinglePanelProps {
  title: string;
  data: { year: string; value: number }[];
  color: string;
}

function SinglePanel({ title, data, color }: SinglePanelProps) {
  const allZero = data.every((d) => d.value === 0);
  if (allZero) return null;

  return (
    <Card className="border-slate-200 h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={CHART_DEFAULTS.margin}>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            <XAxis dataKey="year" {...CHART_DEFAULTS.axis} fontSize={11} />
            <YAxis tickFormatter={(v) => formatKrwTooltip(v)} {...CHART_DEFAULTS.axis} fontSize={10} width={64} />
            <Tooltip content={<SingleKrwTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={48}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.value < 0 ? CHART_COLORS.negative : color} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={((v: number) => formatKrwTooltip(v)) as never}
                style={{ fontSize: 10, fill: "#475569", fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function MetricBars({ isItems, years }: MetricBarsProps) {
  if (!years.length || !isItems?.length) return null;
  const revenue = findRow(isItems, "revenue");
  const op = findRow(isItems, "operatingProfit");
  const net = findRow(isItems, "netProfit");

  const series = (row: DashboardFinancialRow | undefined) =>
    years.map((y) => ({ year: y, value: row ? parseAmount(row[y]) : 0 }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 h-full">
      <SinglePanel title="매출" data={series(revenue)} color={CHART_COLORS.revenue} />
      <SinglePanel title="영업이익" data={series(op)} color={CHART_COLORS.operatingProfit} />
      <SinglePanel title="당기순이익" data={series(net)} color={CHART_COLORS.netProfit} />
    </div>
  );
}
