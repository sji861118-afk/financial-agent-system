"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RiskOpportunityGridProps {
  riskFactors: string[];
  opportunityFactors: string[];
}

export function RiskOpportunityGrid({ riskFactors, opportunityFactors }: RiskOpportunityGridProps) {
  if (!riskFactors.length && !opportunityFactors.length) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card className="border-red-100 bg-red-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            리스크 요인
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {riskFactors.length === 0 ? (
            <p className="text-xs text-slate-400">감지된 리스크 요인이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {riskFactors.map((f, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-red-400 shrink-0">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-emerald-100 bg-emerald-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            기회 요인
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {opportunityFactors.length === 0 ? (
            <p className="text-xs text-slate-400">감지된 기회 요인이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {opportunityFactors.map((f, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-emerald-400 shrink-0">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
