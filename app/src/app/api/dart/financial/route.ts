import { type NextRequest } from "next/server";
import { findCorpCode } from "@/lib/dart-corp-codes";
import { buildFinancialData, fetchAuditOpinion, fetchShareholders, fetchBorrowingNotes, type FinancialResult } from "@/lib/dart-api";
import { fetchFisisFinancialData, convertFisisToFinancialRows } from "@/lib/fisis-api";
import { analyzeFinancial } from "@/lib/financial-analyzer";
import { generateRuleBasedExpert } from "@/lib/rule-based-expert";
import { fetchNiceCreditRating } from "@/lib/nice-api";
import { generateExcelReport } from "@/lib/excel-generator";
import { getDataStore } from "@/lib/firebase-admin";
import { checkDailyLimit, logActivity, verifyToken, getCookieName } from "@/lib/auth";
import { runOrchestrator, type OrchestratorResult } from "@/lib/agents";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Vercel Hobby 플랜 최대 60초, Pro 플랜 최대 300초
export const maxDuration = 60;

const OUTPUT_DIR = path.join(os.tmpdir(), "loan-app-output");

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// DART 재무데이터 메모리 캐시 (같은 기업 반복 조회 시 API 재호출 방지)
const _dartCache = new Map<string, { data: FinancialResult; ts: number }>();
const DART_CACHE_TTL = 5 * 60 * 1000; // 5분

export async function POST(request: NextRequest) {
  try {
    // 인증 및 일일 조회 제한 체크
    const userId = request.headers.get("x-user-id") || "";
    const userName = request.headers.get("x-user-name") || "";

    if (userId) {
      const limitCheck = await checkDailyLimit(userId);
      if (!limitCheck.allowed) {
        return Response.json(
          { success: false, error: `일일 조회 제한(${limitCheck.limit}건)을 초과했습니다. 내일 다시 시도해주세요.` },
          { status: 429 }
        );
      }
    }

    const { corpName, corpCode: directCorpCode, years, generateExcel: doExcel = true } =
      await request.json();

    if (!corpName && !directCorpCode) {
      return Response.json(
        { success: false, error: "차주명을 입력하세요." },
        { status: 400 }
      );
    }

    // 활동 로그 기록
    if (userId) {
      await logActivity(userId, userName, "query", `재무조회: ${corpName || directCorpCode}`);
    }

    // corpCode가 직접 전달되면 그대로 사용 (동명 기업 구분)
    let corp: { corpCode: string; stockCode: string } | null = null;
    if (directCorpCode) {
      corp = { corpCode: directCorpCode, stockCode: "" };
    } else {
      corp = findCorpCode(corpName);
    }

    const displayYears = years || [
      String(new Date().getFullYear() - 2),
      String(new Date().getFullYear() - 1),
      String(new Date().getFullYear()),
    ];

    // DART에서 못 찾으면 FISIS 전용 조회 시도
    if (!corp) {
      const nameHints = ["캐피탈", "금융", "은행", "저축", "보험", "증권", "카드", "리스", "신탁", "대부"];
      const nameIsFinancial = nameHints.some((k) => corpName.includes(k));
      if (nameIsFinancial) {
        console.log(`[FISIS] DART 미등록 → FISIS 직접 조회: ${corpName}`);
        try {
          const fisisData = await fetchFisisFinancialData(corpName, displayYears);
          if (fisisData && fisisData.hasData) {
            const converted = convertFisisToFinancialRows(fisisData, displayYears);
            if (converted.bsItems.length > 0) {
              // FISIS 전용 응답 구성
              const fisisResult = {
                companyInfo: { corpCode: "", corpName: fisisData.companyName, ceoNm: "", jurirNo: "", bizrNo: "", adres: "", estDt: "", indutyCode: "64", accMt: "", stockCode: "", corpCls: "" },
                bsItems: converted.bsItems, isItems: converted.isItems, ratios: converted.ratios,
                hasOfs: true, bsItemsCfs: [] as any[], isItemsCfs: [] as any[], ratiosCfs: {}, hasCfs: false,
                years: converted.displayYears, source: `FISIS 금융통계정보시스템 (${fisisData.partName})`, hasData: true,
              };
              // 분석 실행 후 바로 반환
              let analysis = null;
              try {
                analysis = analyzeFinancial({
                  company: fisisResult.companyInfo,
                  bsItemsOfs: fisisResult.bsItems as unknown as Array<Record<string, string>>,
                  isItemsOfs: fisisResult.isItems as unknown as Array<Record<string, string>>,
                  bsItemsCfs: [], isItemsCfs: [], ratiosOfs: fisisResult.ratios, ratiosCfs: {}, hasOfs: true, hasCfs: false, years: fisisResult.years,
                });
              } catch (e) { console.error("FISIS analysis error:", e); }
              return Response.json({ success: true, result: { ...fisisResult, analysis: analysis ? {
                corpName: analysis.corpName, industryLabel: analysis.industryLabel, fsType: analysis.fsType,
                overallGrade: analysis.overallGrade, overallSummary: analysis.overallSummary,
                stability: analysis.stabilityRatios, profitability: analysis.profitabilityRatios,
                growth: analysis.growthRatios, activity: analysis.activityRatios,
                riskFactors: analysis.riskFactors, opportunityFactors: analysis.opportunityFactors, analystOpinion: analysis.analystOpinion, years: analysis.years,
              } : null, aiAnalysis: analysis?.expertAnalysis || null, niceRating: null } });
            }
          }
        } catch (e) { console.error("FISIS direct error:", e); }
      }
      return Response.json({ success: false, error: `"${corpName}" 기업을 찾을 수 없습니다.` });
    }

    // DART 데이터 캐시 확인
    const cacheKey = `${corp.corpCode}_${displayYears.join(",")}`;
    const cached = _dartCache.get(cacheKey);
    let result: FinancialResult;
    if (cached && Date.now() - cached.ts < DART_CACHE_TTL) {
      result = cached.data;
      console.log(`[Cache] ${corpName} DART 캐시 사용`);
    } else {
      result = await buildFinancialData(corp.corpCode, displayYears);
      _dartCache.set(cacheKey, { data: result, ts: Date.now() });
    }

    // 금융회사인 경우 FISIS 데이터로 보강/대체
    const indutyCode = result.companyInfo?.indutyCode || "";
    const isFinancial = indutyCode && parseInt(indutyCode.substring(0, 2)) >= 64 && parseInt(indutyCode.substring(0, 2)) <= 66;
    const nameHints = ["캐피탈", "금융", "은행", "저축", "보험", "증권", "카드", "리스", "신탁", "대부"];
    const nameIsFinancial = nameHints.some((k) => corpName.includes(k));

    if ((isFinancial || nameIsFinancial) && (!result.hasData || !result.hasOfs)) {
      console.log(`[FISIS] 금융회사 감지 → FISIS 데이터 조회: ${corpName}`);
      try {
        const fisisData = await fetchFisisFinancialData(corpName, displayYears);
        if (fisisData && fisisData.hasData) {
          const converted = convertFisisToFinancialRows(fisisData, displayYears);
          if (converted.bsItems.length > 0) {
            result.bsItems = converted.bsItems;
            result.isItems = converted.isItems;
            result.ratios = converted.ratios;
            result.years = converted.displayYears;
            result.hasOfs = true;
            result.hasData = true;
            result.source = `FISIS 금융통계정보시스템 (${fisisData.partName})`;
            result.noDataReason = undefined;
            console.log(`[FISIS] ${corpName} 데이터 적용: BS ${converted.bsItems.length}행, IS ${converted.isItems.length}행`);
          }
        }
      } catch (e) {
        console.error("FISIS error:", e);
      }
    }

    // 재무분석 + NICE + 감사의견 + 주주현황을 병렬 실행
    let analysis = null;
    let niceRating: { grade: string; gradeDate: string; gradeAgency: string; available: boolean } | null = null;
    let auditOpinion = null;
    let shareholders: any[] = [];
    let borrowingNotes = null;

    const latestYear = String(Math.max(...displayYears.map(Number)));

    const [analysisResult, niceResult, auditResult, shareholdersResult, borrowingResult] = await Promise.allSettled([
      Promise.resolve().then(() => analyzeFinancial({
        company: result.companyInfo,
        bsItemsOfs: result.bsItems,
        isItemsOfs: result.isItems,
        bsItemsCfs: result.bsItemsCfs,
        isItemsCfs: result.isItemsCfs,
        ratiosOfs: result.ratios,
        ratiosCfs: result.ratiosCfs,
        hasOfs: result.hasOfs,
        hasCfs: result.hasCfs,
        years: result.years,
      })),
      fetchNiceCreditRating(corpName, result.companyInfo?.bizrNo),
      fetchAuditOpinion(corp.corpCode, displayYears),
      fetchShareholders(corp.corpCode, latestYear),
      fetchBorrowingNotes(corp.corpCode, displayYears),
    ]);

    if (analysisResult.status === "fulfilled") analysis = analysisResult.value;
    else console.error("Financial analysis error:", analysisResult.reason);
    if (niceResult.status === "fulfilled") niceRating = niceResult.value;
    else console.error("NICE rating error:", niceResult.reason);
    if (auditResult.status === "fulfilled") auditOpinion = auditResult.value;
    else console.error("Audit opinion error:", auditResult.reason);
    if (shareholdersResult.status === "fulfilled") shareholders = shareholdersResult.value;
    else console.error("Shareholders error:", shareholdersResult.reason);
    if (borrowingResult.status === "fulfilled") borrowingNotes = borrowingResult.value;
    else console.error("Borrowing notes error:", borrowingResult.reason);

    // 전문가 소견 (룰 기반 자체분석 — 외부 API 미사용)
    let aiAnalysis = null;
    if (analysis && result.hasData) {
      try {
        aiAnalysis = generateRuleBasedExpert({
          corpName,
          industryLabel: analysis.industryLabel,
          years: result.years,
          ratios: result.ratios,
          bsItems: result.bsItems,
          isItems: result.isItems,
          ruleBasedReport: analysis,
        });
      } catch (e) {
        console.error("Rule-based expert error:", e);
      }
    }
    const geminiAnalysis = null;

    // Excel 생성
    let filename: string | null = null;
    let fileSize = 0;
    let excelBase64: string | null = null;
    if (doExcel) {
      try {
        const now = new Date();
        const ts = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
        filename = `재무현황_${corpName}_${ts}.xlsx`;

        // analysis를 Excel용 형식으로 변환
        const excelAnalysis = analysis
          ? {
              corpName: analysis.corpName,
              industryLabel: analysis.industryLabel,
              fsType: analysis.fsType,
              overallGrade: analysis.overallGrade,
              overallSummary: analysis.overallSummary,
              stability: analysis.stabilityRatios.map((r) => ({
                ...r,
                benchmark: String(r.benchmark),
              })),
              profitability: analysis.profitabilityRatios.map((r) => ({
                ...r,
                benchmark: String(r.benchmark),
              })),
              growth: analysis.growthRatios.map((r) => ({
                ...r,
                benchmark: String(r.benchmark),
              })),
              activity: analysis.activityRatios.map((r) => ({
                ...r,
                benchmark: String(r.benchmark),
              })),
              riskFactors: analysis.riskFactors,
              opportunityFactors: analysis.opportunityFactors,
              analystOpinion: analysis.analystOpinion,
              years: analysis.years,
            }
          : undefined;

        const excelBuffer = await generateExcelReport({
          corpName,
          companyInfo: result.companyInfo,
          years: result.years,
          bsItemsOfs: result.bsItems,
          isItemsOfs: result.isItems,
          bsItemsCfs: result.bsItemsCfs,
          isItemsCfs: result.isItemsCfs,
          ratiosOfs: result.ratios,
          ratiosCfs: result.ratiosCfs,
          hasOfs: result.hasOfs,
          hasCfs: result.hasCfs,
          source: result.source || "DART Open API",
          analysis: excelAnalysis,
          auditOpinion,
          shareholders,
          borrowingNotes,
        });

        fileSize = excelBuffer.length;
        excelBase64 = Buffer.from(excelBuffer).toString("base64");

        // 파일 시스템에도 저장 (로컬 다운로드 fallback)
        try {
          ensureOutputDir();
          const filePath = path.join(OUTPUT_DIR, filename);
          fs.writeFileSync(filePath, excelBuffer);
        } catch { /* serverless에서 실패해도 무시 */ }

        // DataStore에 파일 기록 (base64 포함)
        const store = getDataStore();
        await store.saveFile({
          name: filename,
          size: fileSize,
          type: "재무분석",
          createdAt: new Date().toISOString(),
          downloadUrl: excelBase64 || undefined,
        });
      } catch (e) {
        console.error("Excel generation error:", e);
      }
    }

    // 조회 이력 저장
    try {
      const store = getDataStore();
      await store.saveQuery({
        corpName,
        years: displayYears,
        type: "재무조회",
        status: "complete",
        result: {
          filename: filename || undefined,
          grade: analysis?.overallGrade,
          summary: analysis?.overallSummary?.slice(0, 200),
        },
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Save query error:", e);
    }

    // ── QA 검수 (에이전트 시스템) ──
    let qaReport = null;
    let qaEscalations = null;
    try {
      const { runQAVerification } = await import("@/lib/agents/qa-verifier");
      // 원본 스냅샷 구성 (검수 기준)
      const snapshotRows = (rows: any[], years: string[]) =>
        rows.map((r: any) => {
          const values: Record<string, string | number | undefined> = {};
          for (const y of years) { if (r[y] !== undefined) values[y] = r[y]; }
          return { account: r.account, values };
        });
      const snapshot = {
        collectedAt: new Date().toISOString(),
        sources: [{ type: "DART" as const, label: `DART ${corpName}` }],
        dartBsRaw: snapshotRows(result.bsItems, result.years),
        dartIsRaw: snapshotRows(result.isItems, result.years),
        years: result.years,
      };
      const mergedData = {
        bsItems: result.bsItems,
        isItems: result.isItems,
        years: result.years,
        mergeStats: { dartItemCount: result.bsItems.length + result.isItems.length, uploadItemCount: 0, mergedItemCount: result.bsItems.length + result.isItems.length, unmatchedItems: [] },
      };
      // 분석 결과가 있으면 주요 비율 추출
      let analysisForQA = undefined;
      if (analysis) {
        const latestYear = result.years[result.years.length - 1];
        const keyRatios: Record<string, number | undefined> = {};
        for (const r of analysis.stabilityRatios || []) {
          if (r.name.includes("부채비율") && r.values?.[latestYear] != null) keyRatios.debtRatio = r.values[latestYear]!;
          if (r.name.includes("유동비율") && r.values?.[latestYear] != null) keyRatios.currentRatio = r.values[latestYear]!;
        }
        for (const r of analysis.profitabilityRatios || []) {
          if (r.name.includes("ROA") && r.values?.[latestYear] != null) keyRatios.roa = r.values[latestYear]!;
          if (r.name.includes("ROE") && r.values?.[latestYear] != null) keyRatios.roe = r.values[latestYear]!;
        }
        analysisForQA = { report: analysis, keyRatios };
      }
      const qaResult = runQAVerification(snapshot, mergedData, analysisForQA as any);
      qaReport = qaResult.qaReport;
      qaEscalations = qaResult.escalations.length > 0 ? qaResult.escalations : null;
      console.log(`[QA] 검수 결과: ${qaReport.status} (${qaReport.checks.map((c: any) => `${c.type}:${c.result}`).join(", ")})`);
    } catch (e) {
      console.error("QA verification error (non-blocking):", e);
    }

    // 응답 조립
    const responseAnalysis = analysis
      ? {
          corpName: analysis.corpName,
          industryLabel: analysis.industryLabel,
          fsType: analysis.fsType,
          overallGrade: analysis.overallGrade,
          overallSummary: analysis.overallSummary,
          stability: analysis.stabilityRatios,
          profitability: analysis.profitabilityRatios,
          growth: analysis.growthRatios,
          activity: analysis.activityRatios,
          riskFactors: analysis.riskFactors,
          opportunityFactors: analysis.opportunityFactors,
          analystOpinion: analysis.analystOpinion,
          years: analysis.years,
        }
      : null;

    return Response.json({
      success: true,
      result: {
        companyInfo: result.companyInfo,
        bsItems: result.bsItems,
        isItems: result.isItems,
        ratios: result.ratios,
        hasOfs: result.hasOfs,
        bsItemsCfs: result.bsItemsCfs,
        isItemsCfs: result.isItemsCfs,
        ratiosCfs: result.ratiosCfs,
        hasCfs: result.hasCfs,
        years: result.years,
        source: result.source,
        hasData: result.hasData,
        noDataReason: result.noDataReason,
        quarterlyWarnings: (result as any).quarterlyWarnings || [],
        analysis: responseAnalysis,
        aiAnalysis: aiAnalysis || analysis?.expertAnalysis || null,
        geminiAnalysis: geminiAnalysis || null,
        niceRating,
        auditOpinion,
        shareholders,
        borrowingNotes,
        filename,
        fileSize,
        excelBase64,
        // QA 검수 결과 (에이전트 시스템)
        qaReport,
        qaEscalations,
      },
    });
  } catch (error) {
    console.error("DART financial error:", error);
    return Response.json(
      { success: false, error: `조회 오류: ${error}` },
      { status: 500 }
    );
  }
}
