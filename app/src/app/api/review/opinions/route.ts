import { type NextRequest } from "next/server";
import {
  getReviewStore,
  autoTransitionStatus,
} from "@/lib/review-store";

export const maxDuration = 30;

// GET /api/review/opinions?dealId=xxx
export async function GET(request: NextRequest) {
  try {
    const store = getReviewStore();
    const dealId = new URL(request.url).searchParams.get("dealId");
    if (!dealId) {
      return Response.json({ error: "dealId 필수" }, { status: 400 });
    }

    const opinions = await store.getOpinionsForDeal(dealId);
    return Response.json({ opinions });
  } catch (error) {
    console.error("[api/review/opinions] GET error:", error);
    return Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

// POST /api/review/opinions
export async function POST(request: NextRequest) {
  try {
    const store = getReviewStore();
    const body = await request.json();

    if (!body.dealId) {
      return Response.json({ error: "dealId 필수" }, { status: 400 });
    }

    const opinionId = await store.createOpinion({
      dealId: body.dealId,
      authorId: body.authorId || "",
      authorName: body.authorName || "",
      department: body.department,
      장점: body.장점 || [],
      단점: body.단점 || [],
      진행여부: body.진행여부 || "진행",
      보완사항: body.보완사항 || "",
      컨택자: body.컨택자 || "",
    });

    // 상태 자동 전환
    const newStatus = await autoTransitionStatus(store, body.dealId);

    // viewpoint 자동 생성 (Phase 4에서 활용)
    const deal = await store.getDeal(body.dealId);
    if (deal) {
      await store.createViewpoint({
        dealId: body.dealId,
        opinionId: opinionId,
        analystId: body.authorId || "",
        productType: deal.productType,
        productSubtype: deal.productSubtype,
        tags: deal.tags,
        pros: (body.장점 || []).map((t: string) => ({
          text: t,
          category: "기타" as const,
          source: "analyst" as const,
        })),
        cons: (body.단점 || []).map((t: string) => ({
          text: t,
          category: "기타" as const,
          source: "analyst" as const,
        })),
        dealName: deal.구분,
        dealAmount: deal.모집금액,
        summary: `${deal.차주} - ${deal.구분}`,
      });
    }

    return Response.json(
      { id: opinionId, dealStatus: newStatus },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/review/opinions] POST error:", error);
    return Response.json({ error: "의견 생성 실패" }, { status: 500 });
  }
}
