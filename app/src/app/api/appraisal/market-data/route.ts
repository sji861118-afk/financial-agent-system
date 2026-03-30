import { type NextRequest } from "next/server";
import { fetchMarketData } from "@/lib/market-api";

export async function POST(request: NextRequest) {
  try {
    const { address, propertyType } = await request.json();
    const result = await fetchMarketData({
      sido: address?.sido || '',
      gugun: address?.gugun || '',
      dong: address?.dong || '',
      propertyType: propertyType || '아파트',
    });
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
