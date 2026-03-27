import { type NextRequest } from "next/server";
import { getUsageStats } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const period = (request.nextUrl.searchParams.get("period") || "7d") as "7d" | "30d" | "all";
  const stats = await getUsageStats(period);
  return Response.json(stats);
}
