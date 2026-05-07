"use client";

import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardAuditOpinion } from "./types";

interface AuditCardProps {
  opinion: DashboardAuditOpinion | null | undefined;
}

export function AuditCard({ opinion }: AuditCardProps) {
  if (!opinion) {
    return (
      <Card className="border-slate-200 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">감사인 의견</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-400">
          감사보고서 의견이 응답에 포함되어 있지 않습니다. (현재 라우트 응답에서 스킵)
        </CardContent>
      </Card>
    );
  }

  const isClean = opinion.opinionType?.includes("적정");

  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          {isClean ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          감사인 의견
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="flex items-center gap-2">
          <Badge
            className={
              isClean
                ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                : "bg-amber-100 text-amber-700 border-amber-300"
            }
          >
            {opinion.opinionType || "미상"}
          </Badge>
          <span className="text-xs text-slate-400">{opinion.fiscalYear}</span>
        </div>
        <div className="text-sm text-slate-700">{opinion.auditorName || "-"}</div>
        {opinion.reportDate && (
          <div className="text-xs text-slate-400">감사보고서일 {opinion.reportDate}</div>
        )}
      </CardContent>
    </Card>
  );
}
