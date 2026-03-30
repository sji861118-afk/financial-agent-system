import { type NextRequest } from "next/server";
import { parseAppraisalPdf } from "@/lib/appraisal-parser";
import type { AppraisalParseResult, CollateralAnalysis, ComparativeCase, SupplyOverview, CollateralDetailItem } from "@/types/appraisal";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const propertyType = (formData.get("propertyType") as string) || "아파트";

    if (files.length === 0) {
      return Response.json(
        { success: false, error: "파일이 없습니다." },
        { status: 400 },
      );
    }

    // 각 파일의 확장자 검증
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "pdf") {
        return Response.json(
          { success: false, error: `PDF 파일만 지원합니다: ${file.name}` },
          { status: 400 },
        );
      }
    }

    // 병렬 파싱
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return {
          fileName: file.name,
          result: await parseAppraisalPdf(buffer, propertyType),
        };
      }),
    );

    // 결과 병합
    let mergedCollateral: Partial<CollateralAnalysis> = {};
    const mergedComparatives: ComparativeCase[] = [];
    let mergedSupply: Partial<SupplyOverview> = {};
    const mergedDetail: CollateralDetailItem[] = [];
    const mergedConfidence: Record<string, number> = {};
    const allWarnings: string[] = [];

    let collateralSet = false;
    let supplySet = false;

    for (const settled of results) {
      if (settled.status === "rejected") {
        allWarnings.push(`파일 파싱 실패: ${settled.reason}`);
        continue;
      }

      const { fileName, result } = settled.value;

      // 담보분석: 첫 번째 성공 결과 사용
      if (!collateralSet && result.collateral && Object.keys(result.collateral).length > 0) {
        mergedCollateral = result.collateral;
        collateralSet = true;
      }

      // 비준사례: 누적
      if (result.comparatives.length > 0) {
        mergedComparatives.push(...result.comparatives);
      }

      // 공급개요: 첫 번째 성공 결과 사용
      if (!supplySet && result.supply && Object.keys(result.supply).length > 0) {
        mergedSupply = result.supply;
        supplySet = true;
      }

      // 상세담보: 누적
      if (result.collateralDetail.length > 0) {
        mergedDetail.push(...result.collateralDetail);
      }

      // confidence 최대값
      for (const [key, val] of Object.entries(result.confidence)) {
        mergedConfidence[key] = Math.max(mergedConfidence[key] || 0, val);
      }

      // warnings에 파일명 추가
      for (const w of result.warnings) {
        allWarnings.push(`[${fileName}] ${w}`);
      }
    }

    const merged: AppraisalParseResult = {
      collateral: mergedCollateral,
      comparatives: mergedComparatives,
      supply: mergedSupply,
      collateralDetail: mergedDetail,
      confidence: mergedConfidence,
      warnings: allWarnings,
    };

    return Response.json({
      success: true,
      extracted: merged,
      warnings: allWarnings,
    });
  } catch (error) {
    console.error("Appraisal parse error:", error);
    return Response.json(
      { success: false, error: `감정평가서 파싱 오류: ${error}` },
      { status: 500 },
    );
  }
}
