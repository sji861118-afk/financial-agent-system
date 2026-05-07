"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { DashboardAIAnalysis } from "./types";

interface AnalystOpinionTabsProps {
  ai: DashboardAIAnalysis | null | undefined;
  gemini: DashboardAIAnalysis | null | undefined;
  fallbackText?: string;
}

interface OpinionPanelProps {
  data: DashboardAIAnalysis;
}

function Section({ label, body }: { label: string; body: string | undefined }) {
  if (!body) return null;
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{body}</p>
    </div>
  );
}

function OpinionPanel({ data }: OpinionPanelProps) {
  return (
    <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
      <Section label="요약" body={data.executiveSummary} />
      <Section label="심층 진단" body={data.deepDiagnosis} />
      <Section label="리스크 평가" body={data.riskAssessment} />
      <Section label="여신 의견" body={data.loanOpinion} />
      <Section label="신용 전망" body={data.creditOutlook} />
      <Section label="핵심 지표 해석" body={data.keyMetricsNarrative} />
      {data.aiModel && (
        <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400">
          모델: {data.aiModel}
        </div>
      )}
    </div>
  );
}

export function AnalystOpinionTabs({ ai, gemini, fallbackText }: AnalystOpinionTabsProps) {
  const hasAi = !!ai;
  const hasGemini = !!gemini;
  const hasFallback = !hasAi && !hasGemini && !!fallbackText;

  if (!hasAi && !hasGemini && !hasFallback) return null;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">전문가 소견</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {hasAi && hasGemini ? (
          <Tabs defaultValue="ai">
            <TabsList>
              <TabsTrigger value="ai">{ai!.aiModel || "GPT"}</TabsTrigger>
              <TabsTrigger value="gemini">{gemini!.aiModel || "Gemini"}</TabsTrigger>
            </TabsList>
            <TabsContent value="ai" className="mt-3">
              <OpinionPanel data={ai!} />
            </TabsContent>
            <TabsContent value="gemini" className="mt-3">
              <OpinionPanel data={gemini!} />
            </TabsContent>
          </Tabs>
        ) : hasAi ? (
          <OpinionPanel data={ai!} />
        ) : hasGemini ? (
          <OpinionPanel data={gemini!} />
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{fallbackText}</p>
        )}
      </CardContent>
    </Card>
  );
}
