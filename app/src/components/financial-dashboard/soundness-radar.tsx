"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { CHART_COLORS, formatKrwBreakdown } from "./chart-theme";
import { findRow, parseAmount } from "./utils";
import type { DashboardFinancialRow } from "./types";

interface SoundnessRadarProps {
  bsItems: DashboardFinancialRow[];
  isItems: DashboardFinancialRow[];
  years: string[];
  basisLabel?: string;
}

interface SoundnessRow {
  name: string;
  numeratorLabel: string;
  numeratorValue: number;
  denominatorLabel: string;
  denominatorValue: number;
  ratioPct: number | null;
  formula: string;
  capForRadar: number;
  positive: boolean;
}

function safeRatio(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return (num / den) * 100;
}

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "-";
  return `${v.toFixed(2)}%`;
}

export function SoundnessRadar({ bsItems, isItems, years, basisLabel }: SoundnessRadarProps) {
  if (!years.length || !bsItems?.length) return null;
  const latest = years[years.length - 1];

  const totalLiab = parseAmount(findRow(bsItems, "totalLiab")?.[latest]);
  const totalEquity = parseAmount(findRow(bsItems, "totalEquity")?.[latest]);
  const currentAssets = parseAmount(findRow(bsItems, "currentAssets")?.[latest]);
  const currentLiab = parseAmount(findRow(bsItems, "currentLiab")?.[latest]);
  const inventory = parseAmount(findRow(bsItems, "inventory")?.[latest]);
  const capitalSurplus = parseAmount(findRow(bsItems, "capitalSurplus")?.[latest]);
  const retainedEarnings = parseAmount(findRow(bsItems, "retainedEarnings")?.[latest]);
  const paidInCapital = parseAmount(findRow(bsItems, "paidInCapital")?.[latest]);

  const operatingProfit = parseAmount(findRow(isItems, "operatingProfit")?.[latest]);
  const financialCost = Math.abs(parseAmount(findRow(isItems, "financialCost")?.[latest]));

  const rows: SoundnessRow[] = [
    {
      name: "부채비율",
      numeratorLabel: "부채총계",
      numeratorValue: totalLiab,
      denominatorLabel: "자본총계",
      denominatorValue: totalEquity,
      ratioPct: safeRatio(totalLiab, totalEquity),
      formula: "부채총계 / 자본총계 × 100",
      capForRadar: 500,
      positive: false,
    },
    {
      name: "유동비율",
      numeratorLabel: "유동자산",
      numeratorValue: currentAssets,
      denominatorLabel: "유동부채",
      denominatorValue: currentLiab,
      ratioPct: safeRatio(currentAssets, currentLiab),
      formula: "유동자산 / 유동부채 × 100",
      capForRadar: 300,
      positive: true,
    },
    {
      name: "당좌비율",
      numeratorLabel: "유동자산-재고",
      numeratorValue: currentAssets - inventory,
      denominatorLabel: "유동부채",
      denominatorValue: currentLiab,
      ratioPct: safeRatio(currentAssets - inventory, currentLiab),
      formula: "(유동자산 − 재고자산) / 유동부채 × 100",
      capForRadar: 250,
      positive: true,
    },
    {
      name: "이자보상비율",
      numeratorLabel: "영업이익",
      numeratorValue: operatingProfit,
      denominatorLabel: "금융비용",
      denominatorValue: financialCost,
      ratioPct: safeRatio(operatingProfit, financialCost),
      formula: "영업이익 / 금융비용 × 100",
      capForRadar: 1000,
      positive: true,
    },
    {
      name: "유보율",
      numeratorLabel: "잉여금합계",
      numeratorValue: capitalSurplus + retainedEarnings,
      denominatorLabel: "자본금",
      denominatorValue: paidInCapital,
      ratioPct: safeRatio(capitalSurplus + retainedEarnings, paidInCapital),
      formula: "(자본잉여금 + 이익잉여금) / 자본금 × 100",
      capForRadar: 3000,
      positive: true,
    },
  ];

  const radarData = rows.map((r) => {
    let normalized = 0;
    if (r.ratioPct !== null && Number.isFinite(r.ratioPct)) {
      const ratio = Math.min(1, Math.abs(r.ratioPct) / r.capForRadar);
      normalized = Math.round(ratio * 100);
    }
    return { metric: r.name, score: normalized, raw: r.ratioPct };
  });

  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700">기업 건전성</CardTitle>
        {basisLabel && <span className="text-xs text-slate-400">{basisLabel}</span>}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <PolarGrid stroke={CHART_COLORS.grid} />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="비율"
                  dataKey="score"
                  stroke={CHART_COLORS.revenue}
                  fill={CHART_COLORS.revenue}
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
                <Tooltip
                  formatter={
                    ((value: number, _name: unknown, entry: unknown) => {
                      const e = entry as { payload?: { raw?: number | null } };
                      const raw = e?.payload?.raw;
                      return [
                        raw !== null && raw !== undefined && Number.isFinite(raw)
                          ? `${raw.toFixed(2)}% (정규화 ${value})`
                          : "-",
                        "비율",
                      ];
                    }) as never
                  }
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="text-xs font-medium text-slate-700 align-top whitespace-nowrap">
                      {r.name}
                    </TableCell>
                    <TableCell className="text-xs p-0">
                      <div className="px-2 py-1 border-b border-slate-100 grid grid-cols-[1fr_auto] gap-2">
                        <span className="text-slate-500">{r.numeratorLabel}</span>
                        <span className="tabular-nums">{formatKrwBreakdown(r.numeratorValue)}</span>
                      </div>
                      <div className="px-2 py-1 grid grid-cols-[1fr_auto] gap-2">
                        <span className="text-slate-500">{r.denominatorLabel}</span>
                        <span className="tabular-nums">{formatKrwBreakdown(r.denominatorValue)}</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={`text-xs font-semibold tabular-nums whitespace-nowrap text-right align-middle ${
                        r.ratioPct === null
                          ? "text-slate-400"
                          : r.positive
                            ? r.ratioPct >= 100
                              ? "text-emerald-600"
                              : "text-amber-600"
                            : r.ratioPct <= 100
                              ? "text-emerald-600"
                              : r.ratioPct <= 200
                                ? "text-amber-600"
                                : "text-red-600"
                      }`}
                      title={r.formula}
                    >
                      {fmtPct(r.ratioPct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-[10px] text-slate-400">
              ※ 부채비율은 낮을수록, 그 외는 높을수록 양호 · 색상: 양호(녹색)/보통(주황)/주의(빨강)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
