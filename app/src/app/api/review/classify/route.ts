import { type NextRequest } from "next/server";
import { classifyProductType, autoTags } from "@/lib/product-classifier";

// POST /api/review/classify — 상품유형 자동분류 + 태그 추천
export async function POST(request: NextRequest) {
  try {
    const { 구분, 주소, 자금용도, 대출개요 } = await request.json();
    const text = `${구분 ?? ""} ${주소 ?? ""} ${자금용도 ?? ""} ${대출개요 ?? ""}`;

    const { major, sub } = classifyProductType(text, { 구분 });
    const tags = autoTags(text, { 구분, 주소 });

    return Response.json({
      productType: major,
      productSubtype: sub,
      suggestedTags: tags,
    });
  } catch (error) {
    console.error("[api/review/classify] error:", error);
    return Response.json({ error: "분류 실패" }, { status: 500 });
  }
}
