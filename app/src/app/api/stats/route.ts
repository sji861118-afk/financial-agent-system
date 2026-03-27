import { getDataStore } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const store = getDataStore();
    const stats = await store.getStats();
    return Response.json({ success: true, ...stats });
  } catch (error) {
    console.error("Stats error:", error);
    return Response.json(
      { success: false, totalQueries: 0, weeklyQueries: 0, totalFiles: 0 },
      { status: 500 }
    );
  }
}
