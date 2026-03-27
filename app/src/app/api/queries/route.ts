import { getDataStore } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const store = getDataStore();
    const queries = await store.getQueries(50);
    return Response.json({ success: true, queries });
  } catch (error) {
    console.error("Queries list error:", error);
    return Response.json(
      { success: false, error: "조회 이력 조회 오류" },
      { status: 500 }
    );
  }
}
