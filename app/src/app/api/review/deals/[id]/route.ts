import { type NextRequest } from "next/server";
import { getReviewStore } from "@/lib/review-store";

export const maxDuration = 30;

// GET /api/review/deals/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = getReviewStore();
    const deal = await store.getDeal(id);
    if (!deal) {
      return Response.json({ error: "건을 찾을 수 없습니다" }, { status: 404 });
    }

    const opinions = await store.getOpinionsForDeal(id);
    return Response.json({ deal, opinions });
  } catch (error) {
    console.error("[api/review/deals/[id]] GET error:", error);
    return Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

// PUT /api/review/deals/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = getReviewStore();
    const updates = await request.json();

    // id, createdAt은 수정 불가
    delete updates.id;
    delete updates.createdAt;

    await store.updateDeal(id, updates);
    return Response.json({ success: true });
  } catch (error) {
    console.error("[api/review/deals/[id]] PUT error:", error);
    return Response.json({ error: "수정 실패" }, { status: 500 });
  }
}
