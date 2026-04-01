import { type NextRequest } from "next/server";
import { getReviewStore } from "@/lib/review-store";
import { classifyProductType, autoTags } from "@/lib/product-classifier";
import type { DealListFilter, ProductMajorType } from "@/types/review";

export const maxDuration = 30;

// GET /api/review/deals — 목록 조회
export async function GET(request: NextRequest) {
  try {
    const store = getReviewStore();
    const { searchParams } = new URL(request.url);

    const filter: DealListFilter = {};
    const status = searchParams.get("status");
    if (status) filter.status = status as DealListFilter["status"];

    const productType = searchParams.get("productType");
    if (productType) filter.productType = productType as ProductMajorType;

    const limit = searchParams.get("limit");
    if (limit) filter.limit = parseInt(limit, 10);

    const deals = await store.listDeals(filter);
    return Response.json({ deals });
  } catch (error) {
    console.error("[api/review/deals] GET error:", error);
    return Response.json(
      { error: "목록 조회 실패" },
      { status: 500 }
    );
  }
}

// POST /api/review/deals — 새 여신 접수
export async function POST(request: NextRequest) {
  try {
    const store = getReviewStore();
    const body = await request.json();

    // 자동 분류
    const classification = classifyProductType(
      `${body.구분 ?? ""} ${body.대출개요 ?? ""} ${body.주소 ?? ""}`,
      { 구분: body.구분 }
    );
    const tags = autoTags(
      `${body.구분 ?? ""} ${body.대출개요 ?? ""}`,
      { 구분: body.구분, 주소: body.주소 }
    );

    // 모집금액에서 숫자 추출
    const amountMatch = (body.모집금액 || "").match(/[\d,.]+/);
    const 모집금액_억원 = amountMatch
      ? parseFloat(amountMatch[0].replace(/,/g, ""))
      : 0;

    const dealId = await store.createDeal({
      접수일: body.접수일 || new Date().toISOString().slice(0, 10),
      구분: body.구분 || "",
      당행접수자: body.당행접수자 || "",
      소개처: body.소개처 || "",
      차주: body.차주 || "",
      주소: body.주소 || "",
      금리수수료기간: body.금리수수료기간 || "",
      모집금액: body.모집금액 || "",
      모집금액_억원,
      자금용도: body.자금용도 || "",
      주요채권보전: body.주요채권보전 || "",
      productType: body.productType || classification.major,
      productSubtype: body.productSubtype || classification.sub,
      tags: body.tags?.length ? body.tags : tags,
      재무현황: body.재무현황 || [],
      재무지표: body.재무지표 || [],
      대출개요: body.대출개요 || "",
      status: "접수",
      createdBy: body.createdBy || "",
      attachments: body.attachments || [],
    });

    return Response.json({ id: dealId }, { status: 201 });
  } catch (error) {
    console.error("[api/review/deals] POST error:", error);
    return Response.json(
      { error: "여신 접수 실패" },
      { status: 500 }
    );
  }
}
