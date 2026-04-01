import { type NextRequest } from "next/server";
import { getReviewStore } from "@/lib/review-store";

// PUT /api/review/opinions/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = getReviewStore();
    const updates = await request.json();

    delete updates.id;
    delete updates.createdAt;
    delete updates.dealId;

    await store.updateOpinion(id, updates);
    return Response.json({ success: true });
  } catch (error) {
    console.error("[api/review/opinions/[id]] PUT error:", error);
    return Response.json({ error: "수정 실패" }, { status: 500 });
  }
}
