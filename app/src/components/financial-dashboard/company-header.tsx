"use client";

import { Building2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "./badges";
import type { DashboardData } from "./types";

interface CompanyHeaderProps {
  data: DashboardData;
  onDownloadExcel?: () => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CompanyHeader({ data, onDownloadExcel }: CompanyHeaderProps) {
  const ci = data.companyInfo;
  const grade = data.analysis?.overallGrade;
  const nice = data.niceRating;
  const yearRange = data.years.length > 0 ? `${data.years[0]}~${data.years[data.years.length - 1]}` : "";
  const fsType = data.analysis?.fsType;
  const industry = data.analysis?.industryLabel;

  return (
    <Card className="border-slate-200 sticky top-0 z-10 bg-white/95 backdrop-blur">
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-md bg-slate-100 text-slate-600 shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                  {ci.corpName || "(회사명 미상)"}
                </h2>
                {fsType && (
                  <Badge variant="secondary" className="text-xs">{fsType}</Badge>
                )}
                {industry && (
                  <Badge variant="outline" className="text-xs">{industry}</Badge>
                )}
                {yearRange && (
                  <Badge variant="outline" className="text-xs">{yearRange}</Badge>
                )}
              </div>
              {data.source && <div className="mt-0.5 text-[11px] text-slate-400">출처: {data.source}</div>}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-stretch sm:self-center">
            {grade && grade !== "-" && (
              <div className="text-center">
                <div className="text-[10px] text-slate-500 mb-0.5">자체평가</div>
                <GradeBadge grade={grade} />
              </div>
            )}
            {nice?.available && nice.grade && (
              <div className="text-center">
                <div className="text-[10px] text-slate-500 mb-0.5">NICE</div>
                <GradeBadge grade={nice.grade} />
              </div>
            )}

            {data.filename && onDownloadExcel && (
              <Button onClick={onDownloadExcel} size="sm" className="gap-1.5" title={data.filename}>
                <Download className="h-4 w-4" />
                Excel
                {data.fileSize ? (
                  <span className="hidden sm:inline text-[10px] opacity-80 ml-1">
                    ({formatFileSize(data.fileSize)})
                  </span>
                ) : null}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
