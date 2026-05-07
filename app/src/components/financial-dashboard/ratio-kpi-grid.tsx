"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RiskBadge, TrendIcon } from "./badges";
import type { DashboardAnalysis, DashboardRatioDetail } from "./types";

interface RatioKpiGridProps {
  analysis: DashboardAnalysis;
  years?: string[];
}

interface KpiSectionProps {
  title: string;
  ratios: DashboardRatioDetail[];
  years: string[];
}

function pickYearKeys(ratios: DashboardRatioDetail[], explicitYears?: string[]): string[] {
  if (explicitYears?.length) return [...explicitYears].sort();
  // Derive year columns from the first ratio's valuesStr keys
  const sample = ratios.find((r) => Object.keys(r.valuesStr).length > 0);
  if (!sample) return [];
  return Object.keys(sample.valuesStr).sort();
}

function KpiSection({ title, ratios, years }: KpiSectionProps) {
  if (!ratios.length) return null;
  const yearKeys = pickYearKeys(ratios, years);

  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto rounded-md border border-slate-100">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="text-xs">지표</TableHead>
                {yearKeys.map((y) => (
                  <TableHead key={y} className="text-xs text-right tabular-nums">
                    {y}
                  </TableHead>
                ))}
                <TableHead className="text-xs text-right">벤치마크</TableHead>
                <TableHead className="text-xs text-center w-10">추이</TableHead>
                <TableHead className="text-xs text-center w-14">평가</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ratios.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="text-xs font-medium text-slate-800">{r.name}</TableCell>
                  {yearKeys.map((y) => (
                    <TableCell
                      key={y}
                      className="text-xs text-right tabular-nums text-slate-700"
                    >
                      {r.valuesStr[y] || "-"}
                    </TableCell>
                  ))}
                  <TableCell className="text-xs text-right tabular-nums text-slate-500">
                    {r.benchmarkLabel || r.benchmark}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex"><TrendIcon icon={r.trendIcon} /></span>
                  </TableCell>
                  <TableCell className="text-center">
                    <RiskBadge level={r.riskLevel} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function RatioKpiGrid({ analysis, years }: RatioKpiGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <KpiSection title="안정성 지표" ratios={analysis.stability || []} years={years || []} />
      <KpiSection title="수익성 지표" ratios={analysis.profitability || []} years={years || []} />
      <KpiSection title="성장성 지표" ratios={analysis.growth || []} years={years || []} />
      <KpiSection title="활동성 지표" ratios={analysis.activity || []} years={years || []} />
    </div>
  );
}
