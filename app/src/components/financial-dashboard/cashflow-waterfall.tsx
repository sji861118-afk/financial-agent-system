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

interface CashflowWaterfallProps {
  cfItems: DashboardFinancialRow[] | undefined;
  years: string[];
}

export function CashflowWaterfall({ cfItems, years }: CashflowWaterfallProps) {
  if (!cfItems?.length || !years.length) {
    return (
      <Card className="border-slate-200 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">현금흐름 (최근연도)</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-400">현금흐름표 데이터가 없습니다.</CardContent>
      </Card>
    );
  }

  const latest = years[years.length - 1];
  const op = findRow(cfItems, "cfOperating");
  const inv = findRow(cfItems, "cfInvesting");
  const fin = findRow(cfItems, "cfFinancing");
  const net = findRow(cfItems, "cfNetChange");

  const data = [
    { name: "영업", value: op ? parseAmount(op[latest]) : 0 },
    { name: "투자", value: inv ? parseAmount(inv[latest]) : 0 },
    { name: "재무", value: fin ? parseAmount(fin[latest]) : 0 },
    { name: "순증감", value: net ? parseAmount(net[latest]) : 0 },
  ];

  if (data.every((d) => d.value === 0)) {
    return (
      <Card className="border-slate-200 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">현금흐름 ({latest})</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-400">{latest} 현금흐름 데이터가 없습니다.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">현금흐름 ({latest})</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={CHART_DEFAULTS.margin}>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            <XAxis dataKey="name" {...CHART_DEFAULTS.axis} />
            <YAxis tickFormatter={(v) => formatKrwTooltip(v)} {...CHART_DEFAULTS.axis} width={64} fontSize={10} />
            <Tooltip content={<SingleKrwTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.value < 0 ? CHART_COLORS.negative : CHART_COLORS.positive} />
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
