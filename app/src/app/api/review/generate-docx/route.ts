import { type NextRequest } from 'next/server';
import { getReviewStore } from '@/lib/review-store';
import { dealToLoanApplication } from '@/lib/deal-to-loan-mapper';
import { generateDocx, equityPledgeProfile } from '@/lib/loan-engine/index';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { dealId } = await request.json();
    if (!dealId) {
      return Response.json({ error: 'dealId 필수' }, { status: 400 });
    }

    const store = getReviewStore();
    const deal = await store.getDeal(dealId);
    if (!deal) {
      return Response.json({ error: '건을 찾을 수 없습니다' }, { status: 404 });
    }
    const opinions = await store.getOpinionsForDeal(dealId);

    const loanApp = dealToLoanApplication(deal, opinions);
    const profile = equityPledgeProfile;
    const buffer = await generateDocx(loanApp, { profile });

    const today = new Date().toISOString().slice(0, 10);
    const filename = encodeURIComponent(`${deal.차주}_${today}_초안.docx`);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('[generate-docx] Error:', error);
    return Response.json(
      { error: '초안 생성 실패', detail: String(error) },
      { status: 500 }
    );
  }
}
