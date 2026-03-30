import { type NextRequest } from 'next/server';
import { crawlInfocareAuctionStats } from '@/lib/infocare-crawler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sido, gugun, dong, propertyType } = body;

    if (!sido || !gugun) {
      return Response.json(
        { success: false, error: '소재지(시/구) 필수' },
        { status: 400 },
      );
    }

    const result = await crawlInfocareAuctionStats({
      sido,
      gugun,
      dong: dong || '',
      propertyType: propertyType || '아파트',
    });

    if (!result.success) {
      return Response.json({
        success: false,
        fallback: 'manual',
        message: result.error || '인포케어 조회 실패. 수동으로 입력해주세요.',
      });
    }

    return Response.json({ success: true, auctionStats: result.data });
  } catch (err) {
    return Response.json({
      success: false,
      fallback: 'manual',
      message: String(err),
    });
  }
}
