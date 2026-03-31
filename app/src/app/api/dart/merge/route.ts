import { type NextRequest } from "next/server";
import { findCorpCode } from "@/lib/dart-corp-codes";
import { buildFinancialData, fetchAuditOpinion, fetchShareholders, type FinancialResult } from "@/lib/dart-api";
import { analyzeFinancial } from "@/lib/financial-analyzer";
import { generateRuleBasedExpert } from "@/lib/rule-based-expert";
import { fetchNiceCreditRating } from "@/lib/nice-api";
import { generateExcelReport } from "@/lib/excel-generator";
import { getDataStore } from "@/lib/firebase-admin";
import { logActivity } from "@/lib/auth";
import * as fs from "fs";

export const maxDuration = 60;
import * as path from "path";
import * as os from "os";

const OUTPUT_DIR = path.join(os.tmpdir(), "loan-app-output");

interface FinancialRow {
  account: string;
  [year: string]: string;
}

/**
 * DART 데이터와 업로드된 Excel 데이터를 병합
 *
 * 동작:
 * 1) DART에서 가져올 수 있는 연도는 DART 데이터 사용
 * 2) 업로드 파일의 연도 중 DART에 없는 연도(보통 최신연도)는 업로드 데이터로 추가
 * 3) 겹치는 연도가 있으면 DART 데이터 우선 (신뢰도 높음), 옵션으로 변경 가능
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id") || "";
    const userName = request.headers.get("x-user-name") || "";

    const body = await request.json();
    const {
      corpName,
      corpCode: directCorpCode,
      dartYears,         // DART에서 조회할 연도
      uploadData,        // { years, bsItems, isItems }
      preferUpload,      // 겹치는 연도에서 업로드 데이터 우선 여부
    } = body;

    if (!uploadData?.bsItems?.length && !uploadData?.isItems?.length) {
      return Response.json({ success: false, error: "업로드 데이터가 없습니다." }, { status: 400 });
    }

    // corpName 없으면 기본값
    const effectiveCorpName = corpName || "업로드기업";

    if (userId) {
      await logActivity(userId, userName, "query", `재무조회(병합): ${effectiveCorpName}`);
    }

    // DART 코드 확인
    let corp: { corpCode: string; stockCode: string } | null = null;
    if (directCorpCode) {
      corp = { corpCode: directCorpCode, stockCode: "" };
    } else if (effectiveCorpName) {
      corp = findCorpCode(effectiveCorpName);
    }

    // 모든 연도 합집합
    const uploadYears: string[] = uploadData.years || [];
    const allYears = [...new Set([...(dartYears || []), ...uploadYears])].sort();

    let dartResult: FinancialResult | null = null;

    // DART 데이터 조회 (기업 코드가 있을 때만)
    if (corp && dartYears?.length > 0) {
      try {
        dartResult = await buildFinancialData(corp.corpCode, dartYears);
      } catch (e) {
        console.error("DART merge query error:", e);
      }
    }

    // BS 병합: 계정과목 기준으로 DART + 업로드 데이터 결합
    function mergeRows(dartRows: FinancialRow[], uploadRows: FinancialRow[], mergedYears: string[]): FinancialRow[] {
      const accountMap = new Map<string, FinancialRow>();

      // DART 데이터 먼저 넣기
      for (const row of dartRows) {
        const key = row.account.replace(/\s/g, "");
        accountMap.set(key, { ...row });
      }

      // 업로드 데이터 병합
      for (const uRow of uploadRows) {
        const key = uRow.account.replace(/\s/g, "");
        const existing = accountMap.get(key);
        if (existing) {
          // 겹치는 계정: 업로드 연도 중 DART에 없는 연도만 추가 (또는 preferUpload면 덮어쓰기)
          for (const y of uploadYears) {
            const dartHasYear = existing[y] && existing[y] !== "-" && existing[y] !== "";
            const uploadHasYear = uRow[y] && uRow[y] !== "-" && uRow[y] !== "";
            if (uploadHasYear && (!dartHasYear || preferUpload)) {
              existing[y] = uRow[y];
            }
          }
          accountMap.set(key, existing);
        } else {
          // 새 계정: 업로드 데이터 그대로 추가
          accountMap.set(key, { ...uRow });
        }
      }

      return Array.from(accountMap.values());
    }

    const dartBs = dartResult?.bsItems || [];
    const dartIs = dartResult?.isItems || [];
    const uploadBs: FinancialRow[] = uploadData.bsItems || [];
    const uploadIs: FinancialRow[] = uploadData.isItems || [];

    const mergedBs = mergeRows(dartBs, uploadBs, allYears);
    const mergedIs = mergeRows(dartIs, uploadIs, allYears);

    // BS/IS 항목으로부터 기본 재무비율 직접 계산 (업로드 전용 시 ratiosOfs가 비어있으므로)
    const computedRatios = computeRatiosFromItems(mergedBs, mergedIs, allYears);
    // DART 비율이 있으면 병합 (DART 우선)
    const dartRatios: Record<string, Record<string, string>> = dartResult?.ratios || {};
    for (const y of allYears) {
      if (!dartRatios[y]) dartRatios[y] = {};
      if (computedRatios[y]) {
        for (const [k, v] of Object.entries(computedRatios[y])) {
          if (!dartRatios[y][k] || dartRatios[y][k] === "-") {
            dartRatios[y][k] = v;
          }
        }
      }
    }

    // 비율 계산을 위해 financial-analyzer에 넘기기 위한 준비
    const companyInfo = dartResult?.companyInfo || {
      corpCode: directCorpCode || "", corpName: effectiveCorpName,
      ceoNm: "", jurirNo: "", bizrNo: "", adres: "", estDt: "",
      indutyCode: "", accMt: "", stockCode: "", corpCls: "",
    };

    // 재무분석 + 감사의견 + 주주 + NICE 병렬 실행
    let analysis = null;
    let niceRating = null;
    let auditOpinion = null;
    let shareholders: any[] = [];

    const latestYear = String(Math.max(...allYears.map(Number)));

    const promises: Promise<any>[] = [
      Promise.resolve().then(() => analyzeFinancial({
        company: companyInfo,
        bsItemsOfs: mergedBs,
        isItemsOfs: mergedIs,
        bsItemsCfs: [],
        isItemsCfs: [],
        ratiosOfs: dartRatios,
        ratiosCfs: {},
        hasOfs: true,
        hasCfs: false,
        years: allYears,
      })),
      fetchNiceCreditRating(effectiveCorpName, companyInfo.bizrNo),
    ];

    if (corp) {
      promises.push(fetchAuditOpinion(corp.corpCode, dartYears || allYears));
      promises.push(fetchShareholders(corp.corpCode, latestYear));
    } else {
      promises.push(Promise.resolve(null));
      promises.push(Promise.resolve([]));
    }

    const [analysisResult, niceResult, auditResult, shareholdersResult] = await Promise.allSettled(promises);

    if (analysisResult.status === "fulfilled") analysis = analysisResult.value;
    if (niceResult.status === "fulfilled") niceRating = niceResult.value;
    if (auditResult.status === "fulfilled") auditOpinion = auditResult.value;
    if (shareholdersResult.status === "fulfilled") shareholders = shareholdersResult.value || [];

    // 전문가 소견 (룰 기반 자체분석 — 외부 API 미사용)
    let aiAnalysis = null;
    if (analysis && (mergedBs.length > 0 || mergedIs.length > 0)) {
      try {
        aiAnalysis = generateRuleBasedExpert({
          corpName: effectiveCorpName,
          industryLabel: analysis.industryLabel,
          years: allYears,
          ratios: {},
          bsItems: mergedBs,
          isItems: mergedIs,
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

    try {
      const now = new Date();
      const ts = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const isUploadOnly = !dartYears?.length;
      filename = isUploadOnly ? `재무현황_${effectiveCorpName}_${ts}_업로드.xlsx` : `재무현황_${effectiveCorpName}_${ts}_병합.xlsx`;

      const excelAnalysis = analysis ? {
        corpName: analysis.corpName, industryLabel: analysis.industryLabel,
        fsType: analysis.fsType, overallGrade: analysis.overallGrade,
        overallSummary: analysis.overallSummary,
        stability: analysis.stabilityRatios.map((r: any) => ({ ...r, benchmark: String(r.benchmark) })),
        profitability: analysis.profitabilityRatios.map((r: any) => ({ ...r, benchmark: String(r.benchmark) })),
        growth: analysis.growthRatios.map((r: any) => ({ ...r, benchmark: String(r.benchmark) })),
        activity: analysis.activityRatios?.map((r: any) => ({ ...r, benchmark: String(r.benchmark) })),
        riskFactors: analysis.riskFactors, opportunityFactors: analysis.opportunityFactors,
        analystOpinion: analysis.analystOpinion, years: analysis.years,
      } : undefined;

      // ratios 계산
      const mergedRatios: Record<string, Record<string, string>> = {};
      if (analysis) {
        for (const y of allYears) {
          const yearRatios: Record<string, string> = {};
          for (const group of [analysis.stabilityRatios, analysis.profitabilityRatios, analysis.growthRatios, analysis.activityRatios]) {
            if (!group) continue;
            for (const r of group) {
              if (r.valuesStr?.[y]) yearRatios[r.name] = r.valuesStr[y];
            }
          }
          if (Object.keys(yearRatios).length) mergedRatios[y] = yearRatios;
        }
      }

      const excelBuffer = await generateExcelReport({
        corpName: effectiveCorpName,
        companyInfo,
        years: allYears,
        bsItemsOfs: mergedBs,
        isItemsOfs: mergedIs,
        bsItemsCfs: [],
        isItemsCfs: [],
        ratiosOfs: mergedRatios,
        ratiosCfs: {},
        hasOfs: true,
        hasCfs: false,
        source: isUploadOnly ? `업로드 파일` : `DART + 업로드 파일 병합`,
        analysis: excelAnalysis,
        auditOpinion,
        shareholders,
      });

      fileSize = excelBuffer.length;
      excelBase64 = Buffer.from(excelBuffer).toString("base64");

      try {
        if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(path.join(OUTPUT_DIR, filename), excelBuffer);
      } catch { /* serverless 환경 무시 */ }

      const store = getDataStore();
      await store.saveFile({
        name: filename,
        size: fileSize,
        type: "재무분석",
        createdAt: new Date().toISOString(),
        downloadUrl: excelBase64 || undefined,
      });
    } catch (e) {
      console.error("Merge Excel error:", e);
    }

    // 조회 이력
    try {
      const store = getDataStore();
      await store.saveQuery({
        corpName: effectiveCorpName,
        years: allYears,
        type: "재무조회",
        status: "complete",
        result: {
          filename: filename || undefined,
          grade: analysis?.overallGrade,
          summary: analysis?.overallSummary?.slice(0, 200),
          merged: true,
        },
        createdAt: new Date().toISOString(),
      });
    } catch { /* ignore */ }

    // ── QA 검수 ──
    let qaReport = null;
    let qaEscalations = null;
    try {
      const { runQAVerification } = await import("@/lib/agents/qa-verifier");
      const snapshotRows = (rows: any[], years: string[]) =>
        rows.map((r: any) => {
          const values: Record<string, string | number | undefined> = {};
          for (const y of years) { if (r[y] !== undefined) values[y] = r[y]; }
          return { account: r.account, values };
        });
      const snapshot = {
        collectedAt: new Date().toISOString(),
        sources: [
          ...(dartResult ? [{ type: "DART" as const, label: `DART ${effectiveCorpName}` }] : []),
          { type: "UPLOAD_EXCEL" as const, label: "업로드 파일" },
        ],
        dartBsRaw: snapshotRows(dartBs, dartYears || []),
        dartIsRaw: snapshotRows(dartIs, dartYears || []),
        uploadBsRaw: snapshotRows(uploadBs, uploadYears),
        uploadIsRaw: snapshotRows(uploadIs, uploadYears),
        years: allYears,
      };
      const mergedDataForQA = {
        bsItems: mergedBs,
        isItems: mergedIs,
        years: allYears,
        mergeStats: { dartItemCount: dartBs.length + dartIs.length, uploadItemCount: uploadBs.length + uploadIs.length, mergedItemCount: mergedBs.length + mergedIs.length, unmatchedItems: [] },
      };
      const qaResult = runQAVerification(snapshot, mergedDataForQA);
      qaReport = qaResult.qaReport;
      qaEscalations = qaResult.escalations.length > 0 ? qaResult.escalations : null;
      console.log(`[QA] 병합 검수 결과: ${qaReport.status}`);
    } catch (e) {
      console.error("QA verification error (non-blocking):", e);
    }

    // 응답
    const responseAnalysis = analysis ? {
      corpName: analysis.corpName, industryLabel: analysis.industryLabel,
      fsType: analysis.fsType, overallGrade: analysis.overallGrade,
      overallSummary: analysis.overallSummary,
      stability: analysis.stabilityRatios, profitability: analysis.profitabilityRatios,
      growth: analysis.growthRatios, activity: analysis.activityRatios,
      riskFactors: analysis.riskFactors, opportunityFactors: analysis.opportunityFactors,
      analystOpinion: analysis.analystOpinion, years: analysis.years,
    } : null;

    // ratios for display
    const displayRatios: Record<string, Record<string, string>> = {};
    if (analysis) {
      for (const y of allYears) {
        const r: Record<string, string> = {};
        for (const group of [analysis.stabilityRatios, analysis.profitabilityRatios, analysis.growthRatios, analysis.activityRatios]) {
          if (!group) continue;
          for (const ratio of group) {
            if (ratio.valuesStr?.[y]) r[ratio.name] = ratio.valuesStr[y];
          }
        }
        if (Object.keys(r).length) displayRatios[y] = r;
      }
    }

    return Response.json({
      success: true,
      result: {
        companyInfo,
        bsItems: mergedBs,
        isItems: mergedIs,
        ratios: displayRatios,
        hasOfs: true,
        bsItemsCfs: [],
        isItemsCfs: [],
        ratiosCfs: {},
        hasCfs: false,
        years: allYears,
        source: "DART + 업로드 파일 병합",
        hasData: true,
        analysis: responseAnalysis,
        aiAnalysis: aiAnalysis || analysis?.expertAnalysis || null,
        geminiAnalysis: geminiAnalysis || null,
        niceRating,
        auditOpinion,
        shareholders,
        filename,
        fileSize,
        excelBase64,
        qaReport,
        qaEscalations,
      },
    });
  } catch (error) {
    console.error("Merge API error:", error);
    return Response.json(
      { success: false, error: `병합 오류: ${error}` },
      { status: 500 }
    );
  }
}

// ── BS/IS 항목으로부터 기본 재무비율 계산 ──
function computeRatiosFromItems(
  bsItems: FinancialRow[],
  isItems: FinancialRow[],
  years: string[]
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  function findItem(items: FinancialRow[], keywords: string[]): FinancialRow | null {
    for (const item of items) {
      const acct = (item.account || "").replace(/\s/g, "");
      for (const kw of keywords) {
        if (acct.includes(kw)) return item;
      }
    }
    return null;
  }

  function parseAmt(val: string | undefined): number | null {
    if (!val || val === "-" || val === "") return null;
    const cleaned = val.replace(/,/g, "").replace(/\s/g, "");
    const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
    const numStr = cleaned.replace(/[()]/g, "");
    const num = parseFloat(numStr);
    if (isNaN(num)) return null;
    return negative ? -num : num;
  }

  function fmtPct(val: number): string {
    return val.toFixed(1);
  }

  // BS 항목 찾기
  const totalAssets = findItem(bsItems, ["자산총계"]);
  const totalLiab = findItem(bsItems, ["부채총계"]);
  const totalEquity = findItem(bsItems, ["자본총계"]);
  const currentAssets = findItem(bsItems, ["유동자산"]);
  const currentLiab = findItem(bsItems, ["유동부채"]);
  const nonCurrentLiab = findItem(bsItems, ["비유동부채"]);

  // IS 항목 찾기
  const revenue = findItem(isItems, ["매출액", "영업수익", "수익(매출액)"]);
  const opIncome = findItem(isItems, ["영업이익", "영업손익", "영업손실"]);
  const netIncome = findItem(isItems, ["당기순이익", "당기순손익", "당기순손실"]);
  const interestExp = findItem(isItems, ["이자비용", "금융비용"]);

  // 차입금 관련 — 다양한 명칭 모두 검색
  const cashItem = findItem(bsItems, ["현금및현금성자산", "현금및현금등가물", "현금과현금성자산"]);

  for (const y of years) {
    const r: Record<string, string> = {};

    const ta = parseAmt(totalAssets?.[y]);
    const tl = parseAmt(totalLiab?.[y]);
    let te = parseAmt(totalEquity?.[y]);
    const ca = parseAmt(currentAssets?.[y]);
    const cl = parseAmt(currentLiab?.[y]);

    // 자본총계 없으면 역산: 자산총계 - 부채총계
    if (te === null && ta !== null && tl !== null) {
      te = ta - tl;
    }
    // 부채총계 없으면 역산: 자산총계 - 자본총계
    const effectiveLiab = tl ?? (ta !== null && te !== null ? ta - te : null);

    // 부채비율 = 부채총계 / 자본총계 * 100
    if (effectiveLiab !== null && te !== null && te !== 0) {
      r["부채비율"] = fmtPct((effectiveLiab / Math.abs(te)) * 100);
    }

    // 유동비율 = 유동자산 / 유동부채 * 100
    if (ca !== null && cl !== null && cl !== 0) {
      r["유동비율"] = fmtPct((ca / cl) * 100);
    }

    // 자기자본비율 = 자본총계 / 자산총계 * 100
    if (te !== null && ta !== null && ta !== 0) {
      r["자기자본비율"] = fmtPct((te / ta) * 100);
    }

    // 총차입금 계산: 차입금 관련 모든 BS 항목 합산
    const borrowKeywords = [
      "단기차입금", "주임종단기차입금", "장기차입금", "유동성장기부채",
      "사채", "전환사채", "교환사채", "유동성사채",
      "리스부채", "유동금융부채", "비유동금융부채", "금융부채",
    ];
    let totalBorrow = 0;
    for (const item of bsItems) {
      const acct = (item.account || "").replace(/\s/g, "");
      if (borrowKeywords.some(kw => acct.includes(kw))) {
        const v = parseAmt(item[y]);
        if (v !== null && v > 0) totalBorrow += v;
      }
    }

    // 총차입금 (금액)
    if (totalBorrow > 0) {
      r["총차입금"] = Math.round(totalBorrow).toLocaleString("ko-KR");
    }

    // 순차입금 = 총차입금 - 현금성자산
    const cash = parseAmt(cashItem?.[y]) ?? 0;
    if (totalBorrow > 0) {
      const netBorrow = totalBorrow - cash;
      r["순차입금"] = Math.round(netBorrow).toLocaleString("ko-KR");
    }

    // 차입금의존도 = 총차입금 / 자산총계 * 100
    if (ta !== null && ta !== 0 && totalBorrow > 0) {
      r["차입금의존도"] = fmtPct((totalBorrow / ta) * 100);
    }

    // 영업이익률 = 영업이익 / 매출액 * 100
    const rev = parseAmt(revenue?.[y]);
    const op = parseAmt(opIncome?.[y]);
    const ni = parseAmt(netIncome?.[y]);

    if (op !== null && rev !== null && rev !== 0) {
      r["영업이익률"] = fmtPct((op / rev) * 100);
    }

    // 총자산이익률(ROA) = 당기순이익 / 자산총계 * 100
    if (ni !== null && ta !== null && ta !== 0) {
      r["총자산이익률(ROA)"] = fmtPct((ni / ta) * 100);
    }

    // 자기자본이익률(ROE) = 당기순이익 / 자본총계 * 100
    if (ni !== null && te !== null && te !== 0) {
      r["자기자본이익률(ROE)"] = fmtPct((ni / te) * 100);
    }

    // 매출액순이익률 = 당기순이익 / 매출액 * 100
    if (ni !== null && rev !== null && rev !== 0) {
      r["매출액순이익률"] = fmtPct((ni / rev) * 100);
    }

    if (Object.keys(r).length > 0) {
      result[y] = r;
    }
  }

  return result;
}
