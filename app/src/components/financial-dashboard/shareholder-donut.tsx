"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PIE_PALETTE } from "./chart-theme";
import { PercentTooltip } from "./chart-tooltips";
import { parsePercent } from "./utils";
import type { DashboardShareholder } from "./types";

interface ShareholderSectionProps {
  shareholders: DashboardShareholder[] | undefined;
  basisLabel?: string;
}

export function ShareholderDonut({ shareholders, basisLabel }: ShareholderSectionProps) {
  if (!shareholders?.length) {
    return (
      <Card className="border-slate-200 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">주주 현황</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-400">주주 정보가 없습니다.</CardContent>
      </Card>
    );
  }

  const top = shareholders.slice(0, 8).map((s, i) => ({
    rank: i + 1,
    name: s.name,
    relation: s.relation,
    stockType: s.stockType,
    shareCount: s.shareCount,
    pct: parsePercent(s.shareRatio),
    color: PIE_PALETTE[i % PIE_PALETTE.length],
  }));

  const totalPct = top.reduce((sum, s) => sum + (s.pct || 0), 0);
  const others = Math.max(0, 100 - totalPct);
  const pieData = [
    ...top.map((s) => ({ name: s.name, value: s.pct || 0 })),
    ...(others > 0.1 ? [{ name: "기타", value: others }] : []),
  ];

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700">주주명부</CardTitle>
        {basisLabel && <span className="text-xs text-slate-400">{basisLabel}</span>}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
          <div className="h-[240px] flex flex-col items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={92}
                  paddingAngle={1.5}
                  stroke="white"
                  strokeWidth={1}
                  isAnimationActive={false}
                >
                  {pieData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i < top.length ? top[i].color : "#cbd5e1"}
                    />
                  ))}
                </Pie>
                <Tooltip content={<PercentTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-100">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">주주명</TableHead>
                  <TableHead className="text-xs">관계</TableHead>
                  <TableHead className="text-xs">주식종류</TableHead>
                  <TableHead className="text-xs text-right">비율</TableHead>
                  <TableHead className="text-xs text-right">수량</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((s) => (
                  <TableRow key={`${s.name}-${s.rank}`}>
                    <TableCell className="p-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    </TableCell>
                    <TableCell className="text-xs font-medium text-slate-800">{s.name}</TableCell>
                    <TableCell className="text-xs text-slate-500">{s.relation || "-"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{s.stockType || "-"}</TableCell>
                    <TableCell className="text-xs text-right font-semibold tabular-nums">
                      {s.pct !== null ? `${s.pct.toFixed(2)}%` : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums text-slate-600">
                      {s.shareCount || "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {others > 0.1 && (
                  <TableRow className="bg-slate-50/50">
                    <TableCell className="p-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">기타</TableCell>
                    <TableCell className="text-xs">-</TableCell>
                    <TableCell className="text-xs">-</TableCell>
                    <TableCell className="text-xs text-right font-semibold tabular-nums text-slate-500">
                      {others.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-xs text-right text-slate-400">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        {shareholders.length > top.length && (
          <p className="mt-2 text-[11px] text-slate-400 text-right">
            상위 {top.length}명 표시 · 전체 {shareholders.length}명
          </p>
        )}
      </CardContent>
    </Card>
  );
}
