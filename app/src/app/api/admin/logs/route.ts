import { type NextRequest } from "next/server";
import { getActivityLogs } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit")) || 100;
  const userId = request.nextUrl.searchParams.get("userId") || undefined;
  const action = request.nextUrl.searchParams.get("action") as any || undefined;
  const since = request.nextUrl.searchParams.get("since") || undefined;

  const logs = await getActivityLogs({ limit, userId, action, since });
  return Response.json({ logs });
}
