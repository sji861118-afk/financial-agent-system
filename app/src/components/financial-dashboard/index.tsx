"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import { CompanyHeader } from "./company-header";
import { CompanyOverview } from "./company-overview";
import { SoundnessRadar } from "./soundness-radar";
import { RevenueTrendChart } from "./revenue-trend-chart";
import { MetricBars } from "./metric-bars";
import { CashflowWaterfall } from "./cashflow-waterfall";
import { RatioKpiGrid } from "./ratio-kpi-grid";
import { RatioDonuts } from "./ratio-donuts";
import { BorrowingsTable } from "./borrowings-table";
import { AuditCard } from "./audit-card";
import { ShareholderDonut } from "./shareholder-donut";
import { RiskOpportunityGrid } from "./risk-opportunity-grid";
import { AnalystOpinionTabs } from "./analyst-opinion-tabs";
import { DetailedStatements } from "./detailed-statements";
import type { DashboardData } from "./types";

export type { DashboardData } from "./types";

interface FinancialDashboardProps {
  data: DashboardData;
  onDownloadExcel?: () => void;
}

type FsKind = "ofs" | "cfs";

export function FinancialDashboard({ data, onDownloadExcel }: FinancialDashboardProps) {
  const hasOfs = !!data.hasOfs && (data.bsItems?.length ?? 0) > 0;
  const hasCfs = !!data.hasCfs && (data.bsItemsCfs?.length ?? 0) > 0;
  const initialKind: FsKind = hasOfs ? "ofs" : hasCfs ? "cfs" : "ofs";
  const [kind, setKind] = useState<FsKind>(initialKind);

  const view = useMemo(() => {
    const useCfs = kind === "cfs" && hasCfs;
    return {
      bs: useCfs ? data.bsItemsCfs! : data.bsItems,
      is: useCfs ? data.isItemsCfs! : data.isItems,
      cf: useCfs ? data.cfItemsCfs : data.cfItems,
      ratios: useCfs ? data.ratiosCfs : data.ratios,
      label: useCfs ? "연결 기준" : "개별 기준",
    };
  }, [kind, hasCfs, data]);

  if (!data.hasData) {
    return (
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-800">재무데이터를 조회할 수 없습니다</div>
            <p className="mt-1 text-sm text-amber-700">
              {data.noDataReason ||
                "DART에 공시된 재무제표를 찾지 못했습니다. 사업보고서 미제출 회사이거나 비상장 외감이 아닐 수 있습니다."}
            </p>
            <p className="mt-2 text-xs text-amber-600">
              파일 업로드 탭에서 직접 재무제표 Excel/PDF를 올려서 분석을 이어갈 수 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const showFsToggle = hasOfs && hasCfs;
  const periodLabel =
    data.years.length > 0 ? `${data.years[data.years.length - 1]}년 기준` : undefined;

  return (
    <div className="space-y-3">
      <CompanyHeader data={data} onDownloadExcel={onDownloadExcel} />

      {showFsToggle ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-slate-500 shrink-0">재무제표 기준</span>
          <Tabs value={kind} onValueChange={(v) => setKind(v as FsKind)}>
            <TabsList>
              <TabsTrigger value="ofs">개별 (OFS)</TabsTrigger>
              <TabsTrigger value="cfs">연결 (CFS)</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : (
        <div className="text-xs text-slate-400">
          재무제표 기준: {hasOfs ? "개별 (OFS)" : hasCfs ? "연결 (CFS)" : "-"}
          <span className="ml-1 text-slate-300">(이 회사는 한 종류만 공시)</span>
        </div>
      )}

      {/* 외부 탭: 차트 대시보드 / 상세 재무제표 */}
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">차트 대시보드</TabsTrigger>
          <TabsTrigger value="detail">상세 재무제표</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-3 space-y-3">
          {/* 기업 개요 + 기업 건전성 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CompanyOverview
              companyInfo={data.companyInfo}
              industry={data.analysis?.industryLabel}
              fsType={data.analysis?.fsType}
              basisLabel={periodLabel}
            />
            <SoundnessRadar
              bsItems={view.bs}
              isItems={view.is}
              years={data.years}
              basisLabel={`${view.label} · ${periodLabel ?? ""}`}
            />
          </div>

          {/* 재무 트렌드 (full-width) */}
          <RevenueTrendChart isItems={view.is} years={data.years} />

          {/* 매출/영업이익/순이익 3-up + 현금흐름 */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-stretch">
            <div className="lg:col-span-3">
              <MetricBars isItems={view.is} years={data.years} />
            </div>
            <div className="lg:col-span-1">
              <CashflowWaterfall cfItems={view.cf} years={data.years} />
            </div>
          </div>

          {/* 재무비율 전체 (안정성/수익성/성장성/활동성) */}
          {data.analysis && <RatioKpiGrid analysis={data.analysis} years={data.years} />}

          {/* 비율 도넛 + 차입금 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-1">
              <RatioDonuts ratios={view.ratios} />
            </div>
            <div className="lg:col-span-2">
              <BorrowingsTable notes={data.borrowingNotes} />
            </div>
          </div>

          {/* 주주명부 (full-width) + 감사인 */}
          <ShareholderDonut shareholders={data.shareholders} basisLabel={periodLabel} />

          <AuditCard opinion={data.auditOpinion} />

          {/* 리스크 / 기회 */}
          {data.analysis && (
            <RiskOpportunityGrid
              riskFactors={data.analysis.riskFactors || []}
              opportunityFactors={data.analysis.opportunityFactors || []}
            />
          )}

          {/* 전문가 소견 */}
          <AnalystOpinionTabs
            ai={data.aiAnalysis}
            gemini={data.geminiAnalysis}
            fallbackText={data.analysis?.analystOpinion}
          />
        </TabsContent>

        <TabsContent value="detail" className="mt-3">
          <DetailedStatements
            bsItems={view.bs}
            isItems={view.is}
            cfItems={view.cf}
            years={data.years}
            basisLabel={`${view.label}${periodLabel ? ` · ${periodLabel}` : ""}`}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
