"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS } from "./chart-theme";
import { pickLatestRatio } from "./utils";

interface RatioDonutsProps {
  ratios: Record<string, Record<string, string>> | undefined;
}

interface SingleDonutProps {
  label: string;
  value: number | null;
  year: string | null;
  cap?: number;
  positive?: boolean;
  unit?: string;
}

function SingleDonut({ label, value, year, cap = 200, positive = true, unit = "%" }: SingleDonutProps) {
  const hasValue = value !== null && Number.isFinite(value);
  const display = hasValue ? value!.toFixed(1) : "-";
  const fill = !hasValue
    ? CHART_COLORS.neutral
    : positive
      ? value! >= 100
        ? CHART_COLORS.positive
        : value! >= 50
          ? CHART_COLORS.revenue
          : CHART_COLORS.negative
      : value! <= 100
        ? CHART_COLORS.positive
        : value! <= 200
          ? CHART_COLORS.netProfit
          : CHART_COLORS.negative;

  const ratio = hasValue ? Math.max(0, Math.min(1, Math.abs(value!) / cap)) : 0;
  const data = [
    { name: "v", value: ratio },
    { name: "rest", value: 1 - ratio },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="relative h-[120px] w-[120px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={56}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={fill} />
              <Cell fill={CHART_COLORS.grid} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-slate-900 tabular-nums">{display}{hasValue ? unit : ""}</span>
          {year && <span className="text-[10px] text-slate-400">{year}</span>}
        </div>
      </div>
    </div>
  );
}

export function RatioDonuts({ ratios }: RatioDonutsProps) {
  if (!ratios || Object.keys(ratios).length === 0) return null;

  const debt = pickLatestRatio(ratios, "부채비율");
  const current = pickLatestRatio(ratios, "유동비율");
  const equity = pickLatestRatio(ratios, "자기자본비율");

  if (!debt && !current && !equity) return null;

  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">핵심 안정성 지표</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-3 gap-2">
          <SingleDonut
            label="부채비율"
            value={debt?.value ?? null}
            year={debt?.year ?? null}
            cap={400}
            positive={false}
          />
          <SingleDonut
            label="유동비율"
            value={current?.value ?? null}
            year={current?.year ?? null}
            cap={300}
            positive={true}
          />
          <SingleDonut
            label="자기자본비율"
            value={equity?.value ?? null}
            year={equity?.year ?? null}
            cap={100}
            positive={true}
          />
        </div>
      </CardContent>
    </Card>
  );
}
