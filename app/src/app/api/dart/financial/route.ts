import { type NextRequest } from "next/server";
import { findCorpCode, findStockCodeByCorpCode } from "@/lib/dart-corp-codes";
import { buildFinancialData, fetchAuditOpinion, fetchShareholders, fetchBorrowingNotes, fetchAuditNotes, type FinancialResult } from "@/lib/dart-api";
import { analyzeYoYChanges, type YoYThreshold, type YoYChangeItem } from "@/lib/yoy-note-analyzer";
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
    // 인증 및 일일 조회 제한 체크 (타임아웃 가드 — Firebase 미응답 시 조회 자체가 블로킹되지 않도록)
    const userId = request.headers.get("x-user-id") || "";
    const userName = request.headers.get("x-user-name") || "";

    if (userId) {
      try {
        const limitCheck = await Promise.race([
          checkDailyLimit(userId),
          new Promise<{ allowed: true; remaining: -1; limit: 0 }>((resolve) =>
            setTimeout(() => resolve({ allowed: true, remaining: -1, limit: 0 }), 5000)
          ),
        ]);
        if (!limitCheck.allowed) {
          return Response.json(
            { success: false, error: `일일 조회 제한(${limitCheck.limit}건)을 초과했습니다. 내일 다시 시도해주세요.` },
            { status: 429 }
          );
        }
      } catch (e) {
        console.error("[Auth] checkDailyLimit failed, proceeding:", e);
      }
    }

    const body = await request.json();
    const corpName: string = body.corpName || "";
    const directCorpCode: string | undefined = body.corpCode;
    const years: string[] = body.years || [];
    const doExcel: boolean = body.generateExcel ?? true;
    const yoyThreshold: YoYThreshold | undefined = body.yoyThreshold;

    if (!corpName && !directCorpCode) {
      return Response.json(
        { success: false, error: "차주명을 입력하세요." },
        { status: 400 }
      );
    }

    // 활동 로그 기록 (fire-and-forget — 응답을 블로킹하지 않음)
    if (userId) {
      Promise.resolve().then(() => logActivity(userId, userName, "query", `재무조회: ${corpName || directCorpCode}`)).catch(() => {});
    }

    // corpCode가 직접 전달되면 그대로 사용 (동명 기업 구분)
    let corp: { corpCode: string; stockCode: string } | null = null;
    if (directCorpCode) {
      corp = { corpCode: directCorpCode, stockCode: findStockCodeByCorpCode(directCorpCode) };
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
                bsItems: converted.bsItems, isItems: converted.isItems, cfItems: [] as any[], ratios: converted.ratios,
                hasOfs: true, bsItemsCfs: [] as any[], isItemsCfs: [] as any[], cfItemsCfs: [] as any[], ratiosCfs: {}, hasCfs: false,
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
      result = await buildFinancialData(corp.corpCode, displayYears, corp.stockCode);
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

    // 재무분석 + NICE + 주주현황을 병렬 실행
    // ※ fetchBorrowingNotes, fetchAuditOpinion은 DART ZIP 다운로드 필요 → Vercel US서버에서 20초+ 소요 → 스킵
    //   (차입금 주석/감사의견은 Excel 부가정보이며, 핵심 재무제표 조회에 영향 없음)
    let analysis = null;
    let niceRating: { grade: string; gradeDate: string; gradeAgency: string; available: boolean } | null = null;
    let auditOpinion = null;
    let shareholders: any[] = [];
    let borrowingNotes = null;

    const latestYear = String(Math.max(...displayYears.map(Number)));

    const [analysisResult, niceResult, shareholdersResult] = await Promise.allSettled([
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
      fetchShareholders(corp.corpCode, latestYear),
    ]);

    if (analysisResult.status === "fulfilled") analysis = analysisResult.value;
    else console.error("Financial analysis error:", analysisResult.reason);
    if (niceResult.status === "fulfilled") niceRating = niceResult.value;
    else console.error("NICE rating error:", niceResult.reason);
    if (shareholdersResult.status === "fulfilled") shareholders = shareholdersResult.value;
    else console.error("Shareholders error:", shareholdersResult.reason);

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
    if (doExcel && result.hasData) {
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

        // 증감사유 분석: 임계값이 설정된 경우 실행
        let yoyAnalysis: YoYChangeItem[] | undefined;
        if (yoyThreshold && (yoyThreshold.amountMillions || yoyThreshold.percentChange)) {
          // 주석 데이터: Stage 3에서 이미 가져왔으면 result.notesSections 사용, 아니면 별도 다운로드
          let notesSections = result.notesSections;
          if (!notesSections && corp) {
            // Stage 1(상장사 API) 데이터 → 감사보고서에서 주석 별도 추출
            try {
              notesSections = await fetchAuditNotes(corp.corpCode, displayYears) || undefined;
            } catch (e) {
              console.warn("[YoY] fetchAuditNotes failed:", e);
            }
          }
          if (notesSections) {
            yoyAnalysis = analyzeYoYChanges(
              result.bsItems, result.isItems, result.years,
              notesSections, yoyThreshold
            );
            console.log(`[YoY] 증감사유 분석: ${yoyAnalysis.length}건 감지 (임계값: ${yoyThreshold.amountMillions || '-'}백만원, ${yoyThreshold.percentChange || '-'}%)`);
          }
        }

        const excelBuffer = await generateExcelReport({
          corpName,
          companyInfo: result.companyInfo,
          years: result.years,
          bsItemsOfs: result.bsItems,
          isItemsOfs: result.isItems,
          cfItemsOfs: result.cfItems,
          bsItemsCfs: result.bsItemsCfs,
          isItemsCfs: result.isItemsCfs,
          cfItemsCfs: result.cfItemsCfs,
          ratiosOfs: result.ratios,
          ratiosCfs: result.ratiosCfs,
          hasOfs: result.hasOfs,
          hasCfs: result.hasCfs,
          source: result.source || "DART Open API",
          analysis: excelAnalysis,
          auditOpinion,
          shareholders,
          borrowingNotes,
          yoyAnalysis,
        });

        fileSize = excelBuffer.length;
        excelBase64 = Buffer.from(excelBuffer).toString("base64");

        // 파일 시스템에도 저장 (로컬 다운로드 fallback)
        try {
          ensureOutputDir();
          const filePath = path.join(OUTPUT_DIR, filename);
          fs.writeFileSync(filePath, excelBuffer);
        } catch { /* serverless에서 실패해도 무시 */ }

        // DataStore 저장은 응답 후 비동기 처리 (waitUntil 불가하므로 fire-and-forget)
        const _excelBase64ForSave = excelBase64;
        const _filename = filename;
        const _fileSize = fileSize;
        Promise.resolve().then(async () => {
          try {
            const store = getDataStore();
            await store.saveFile({ name: _filename!, size: _fileSize, type: "재무분석", createdAt: new Date().toISOString(), downloadUrl: _excelBase64ForSave || undefined });
          } catch { /* non-blocking */ }
        });
      } catch (e) {
        console.error("Excel generation error:", e);
      }
    }

    // 조회 이력 저장 (fire-and-forget)
    Promise.resolve().then(async () => {
      try {
        const store = getDataStore();
        await store.saveQuery({ corpName, years: displayYears, type: "재무조회", status: "complete", result: { filename: filename || undefined, grade: analysis?.overallGrade, summary: analysis?.overallSummary?.slice(0, 200) }, createdAt: new Date().toISOString() });
      } catch { /* non-blocking */ }
    });

    // QA 검수 스킵 (Vercel 시간 절약 — 로컬에서만 의미 있음)
    const qaReport = null;
    const qaEscalations = null;

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
        cfItems: result.cfItems,
        ratios: result.ratios,
        hasOfs: result.hasOfs,
        bsItemsCfs: result.bsItemsCfs,
        isItemsCfs: result.isItemsCfs,
        cfItemsCfs: result.cfItemsCfs,
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
        // Excel base64: 3MB 이하만 응답에 포함 (Vercel 4.5MB 응답 제한 대비)
        excelBase64: excelBase64 && excelBase64.length < 3 * 1024 * 1024 ? excelBase64 : null,
        excelTooLarge: excelBase64 && excelBase64.length >= 3 * 1024 * 1024 ? true : undefined,
        // QA 검수 결과 (에이전트 시스템)
        qaReport,
        qaEscalations,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : "";
    console.error("DART financial error:", msg, stack);
    return Response.json(
      { success: false, error: `조회 오류: ${msg}` },
      { status: 500 }
    );
  }
}
