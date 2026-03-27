import { getDataStore } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const store = getDataStore();
    const files = await store.getFiles(50);
    return Response.json({ success: true, files });
  } catch (error) {
    console.error("Files list error:", error);
    return Response.json(
      { success: false, error: "파일 목록 조회 오류" },
      { status: 500 }
    );
  }
}
