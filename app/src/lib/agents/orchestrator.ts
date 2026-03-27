/**
 * 오케스트레이터
 * ==============
 * 전체 워크플로우 제어: 수집 → 파싱 → 병합 → 분석 → Excel → 검수
 * 상태 머신으로 관리, QA FAIL 시 자동 재처리 또는 에스컬레이션
 */

import type {
  AgentState,
  OrchestratorContext,
  OrchestratorResult,
  CollectRequest,
  AnalysisResult,
} from "./types";
import { collectData } from "./data-collector";
import { parseFinancialData } from "./parser";
import { mergeFinancialData } from "./merger";
import { runQAVerification } from "./qa-verifier";
import { analyzeFinancial, type FinancialAnalysisReport } from "../financial-analyzer";
import { generateExcelReport } from "../excel-generator";

// ============================================================
// 로그 헬퍼
// ============================================================

function log(
  ctx: OrchestratorContext,
  agent: string,
  message: string,
  level: "info" | "warn" | "error" = "info"
) {
  ctx.logs.push({ timestamp: new Date().toISOString(), agent, message, level });
  const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : "✅";
  console.log(`[Orchestrator/${agent}] ${prefix} ${message}`);
}

function transition(ctx: OrchestratorContext, newState: AgentState) {
  log(ctx, "orchestrator", `${ctx.state} → ${newState}`);
  ctx.state = newState;
}

// ============================================================
// 메인 실행
// ============================================================

export async function runOrchestrator(request: CollectRequest): Promise<OrchestratorResult> {
  const ctx: OrchestratorContext = {
    state: "IDLE",
    request,
    escalations: [],
    retryCount: 0,
    maxRetries: 2,
    startedAt: new Date().toISOString(),
    logs: [],
  };

  try {
    return await executeFlow(ctx);
  } catch (error) {
    log(ctx, "orchestrator", `치명적 오류: ${error}`, "error");
    return {
      success: false,
      state: "ERROR",
      error: `오케스트레이터 오류: ${error}`,
      logs: ctx.logs,
    };
  }
}

async function executeFlow(ctx: OrchestratorContext): Promise<OrchestratorResult> {
  // ── Step 1: 데이터 수집 ──
  transition(ctx, "COLLECTING");
  try {
    ctx.collectResult = await collectData(ctx.request);
    log(ctx, "data-collector", `수집 완료: BS ${ctx.collectResult.snapshot.dartBsRaw.length}행, IS ${ctx.collectResult.snapshot.dartIsRaw.length}행`);
  } catch (e) {
    log(ctx, "data-collector", `수집 실패: ${e}`, "error");
    transition(ctx, "ERROR");
    return buildResult(ctx, `데이터 수집 실패: ${e}`);
  }

  // ── Step 2: 파싱·정규화 ──
  transition(ctx, "PARSING");
  try {
    ctx.parsedData = parseFinancialData(ctx.collectResult.snapshot);
    const kp = ctx.parsedData.keyAccountsPresent;
    const missing = Object.entries(kp).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      log(ctx, "parser", `주요 계정 누락: ${missing.join(", ")}`, "warn");
    } else {
      log(ctx, "parser", `파싱 완료: BS ${ctx.parsedData.bsItems.length}항목, IS ${ctx.parsedData.isItems.length}항목`);
    }
  } catch (e) {
    log(ctx, "parser", `파싱 실패: ${e}`, "error");
    transition(ctx, "ERROR");
    return buildResult(ctx, `파싱 실패: ${e}`);
  }

  // ── Step 3: 병합 ──
  transition(ctx, "MERGING");
  try {
    const fr = ctx.collectResult.financialResult;
    ctx.mergedData = mergeFinancialData(
      fr.bsItems,
      fr.isItems,
      fr.years,
      ctx.request.uploadData,
      false // DART 우선
    );
    log(ctx, "merger", `병합 완료: ${ctx.mergedData.mergeStats.mergedItemCount}항목 (DART ${ctx.mergedData.mergeStats.dartItemCount} + 업로드 ${ctx.mergedData.mergeStats.uploadItemCount})`);
  } catch (e) {
    log(ctx, "merger", `병합 실패: ${e}`, "error");
    transition(ctx, "ERROR");
    return buildResult(ctx, `병합 실패: ${e}`);
  }

  // ── Step 4: 분석 ──
  transition(ctx, "ANALYZING");
  let analysisReport: FinancialAnalysisReport | null = null;
  try {
    const fr = ctx.collectResult.financialResult;
    analysisReport = analyzeFinancial({
      company: fr.companyInfo,
      bsItemsOfs: ctx.mergedData.bsItems,
      isItemsOfs: ctx.mergedData.isItems,
      bsItemsCfs: fr.bsItemsCfs || [],
      isItemsCfs: fr.isItemsCfs || [],
      ratiosOfs: fr.ratios || {},
      ratiosCfs: fr.ratiosCfs || {},
      hasOfs: fr.hasOfs,
      hasCfs: fr.hasCfs,
      years: ctx.mergedData.years,
    });

    // QA 검증용 주요 비율 추출
    const latestYear = ctx.mergedData.years[ctx.mergedData.years.length - 1];
    ctx.analysisResult = {
      report: analysisReport,
      keyRatios: extractKeyRatios(analysisReport, latestYear),
    };
    log(ctx, "analyzer", `분석 완료: 등급 ${analysisReport.overallGrade}`);
  } catch (e) {
    log(ctx, "analyzer", `분석 실패 (계속 진행): ${e}`, "warn");
  }

  // ── Step 5: Excel 생성 ──
  transition(ctx, "BUILDING");
  try {
    const fr = ctx.collectResult.financialResult;
    const excelAnalysis = analysisReport ? {
      corpName: analysisReport.corpName,
      industryLabel: analysisReport.industryLabel,
      fsType: analysisReport.fsType,
      overallGrade: analysisReport.overallGrade,
      overallSummary: analysisReport.overallSummary,
      stability: analysisReport.stabilityRatios.map((r) => ({ ...r, benchmark: String(r.benchmark) })),
      profitability: analysisReport.profitabilityRatios.map((r) => ({ ...r, benchmark: String(r.benchmark) })),
      growth: analysisReport.growthRatios.map((r) => ({ ...r, benchmark: String(r.benchmark) })),
      activity: analysisReport.activityRatios?.map((r) => ({ ...r, benchmark: String(r.benchmark) })),
      riskFactors: analysisReport.riskFactors,
      opportunityFactors: analysisReport.opportunityFactors,
      analystOpinion: analysisReport.analystOpinion,
      years: analysisReport.years,
    } : undefined;

    ctx.excelBuffer = Buffer.from(
      await generateExcelReport({
        corpName: ctx.request.corpName,
        companyInfo: fr.companyInfo,
        years: ctx.mergedData.years,
        bsItemsOfs: ctx.mergedData.bsItems,
        isItemsOfs: ctx.mergedData.isItems,
        bsItemsCfs: fr.bsItemsCfs || [],
        isItemsCfs: fr.isItemsCfs || [],
        ratiosOfs: fr.ratios || {},
        ratiosCfs: fr.ratiosCfs || {},
        hasOfs: fr.hasOfs,
        hasCfs: fr.hasCfs,
        source: fr.source || "DART Open API",
        analysis: excelAnalysis,
      })
    );
    log(ctx, "excel-builder", `Excel 생성 완료: ${ctx.excelBuffer.length} bytes`);
  } catch (e) {
    log(ctx, "excel-builder", `Excel 생성 실패: ${e}`, "error");
    transition(ctx, "ERROR");
    return buildResult(ctx, `Excel 생성 실패: ${e}`);
  }

  // ── Step 6: 검수 (QA) ──
  transition(ctx, "VERIFYING");
  const { qaReport, escalations } = runQAVerification(
    ctx.collectResult.snapshot,
    ctx.mergedData,
    ctx.analysisResult,
    ctx.retryCount
  );
  ctx.qaReport = qaReport;
  ctx.escalations = escalations;

  log(ctx, "qa-verifier", `검수 결과: ${qaReport.status} (${qaReport.checks.map((c) => `${c.type}:${c.result}`).join(", ")})`);

  // ── 검수 결과에 따른 분기 ──
  if (qaReport.status === "PASS") {
    transition(ctx, "COMPLETE");
    ctx.completedAt = new Date().toISOString();
    log(ctx, "orchestrator", `처리 완료 (${qaReport.checks.filter((c) => c.result === "PASS").length}/4 PASS)`);
    return buildResult(ctx);
  }

  if (qaReport.status === "AUTO_FIX" && ctx.retryCount < ctx.maxRetries) {
    ctx.retryCount++;
    log(ctx, "orchestrator", `자동 재처리 시도 (${ctx.retryCount}/${ctx.maxRetries})`);
    // 재처리: Step 2부터 다시
    return executeFlow(ctx);
  }

  // ESCALATE
  transition(ctx, "ESCALATE");
  log(ctx, "orchestrator", `에스컬레이션: ${escalations.length}건 사람 확인 필요`, "warn");
  return buildResult(ctx);
}

// ============================================================
// 헬퍼
// ============================================================

function extractKeyRatios(report: FinancialAnalysisReport, year: string): AnalysisResult["keyRatios"] {
  const result: AnalysisResult["keyRatios"] = {};
  for (const r of report.stabilityRatios || []) {
    if (r.name.includes("부채비율") && r.values?.[year] != null) result.debtRatio = r.values[year]!;
    if (r.name.includes("유동비율") && r.values?.[year] != null) result.currentRatio = r.values[year]!;
  }
  for (const r of report.profitabilityRatios || []) {
    if (r.name.includes("ROA") && r.values?.[year] != null) result.roa = r.values[year]!;
    if (r.name.includes("ROE") && r.values?.[year] != null) result.roe = r.values[year]!;
    if (r.name.includes("영업이익률") && r.values?.[year] != null) result.operatingMargin = r.values[year]!;
    if (r.name.includes("순이익률") && r.values?.[year] != null) result.netMargin = r.values[year]!;
  }
  return result;
}

function buildResult(ctx: OrchestratorContext, error?: string): OrchestratorResult {
  return {
    success: ctx.state === "COMPLETE",
    state: ctx.state,
    excelBuffer: ctx.excelBuffer,
    qaReport: ctx.qaReport,
    escalations: ctx.escalations.length > 0 ? ctx.escalations : undefined,
    financialResult: ctx.collectResult?.financialResult,
    analysisReport: ctx.analysisResult?.report,
    error,
    logs: ctx.logs,
  };
}
