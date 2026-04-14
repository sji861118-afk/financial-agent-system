import { type NextRequest } from 'next/server';
import { getReviewStore } from '@/lib/review-store';
import { dealToLoanApplication } from '@/lib/deal-to-loan-mapper';
import { generateDocx, equityPledgeProfile, unsoldCollateralProfile } from '@/lib/loan-engine/index';
import { findCorpCode } from '@/lib/dart-corp-codes';
import {
  getCompanyInfo, buildFinancialData, fetchBorrowingNotes, fetchRelatedCompanies,
} from '@/lib/dart-api';
import type { DartCompanyInfo, RelatedCompanyEntry } from '@/lib/dart-api';
import type { FinancialStatements, StatementLineItem, RelatedEntityFinancials, BorrowingDetail } from '@/lib/loan-engine/types';
import type { FinancialRow as DartFinancialRow } from '@/lib/dart-api';

export const maxDuration = 60;

/** DART 값 string→number 변환 (obligor 분석 코멘트에서 typeof number 체크) */
function toNum(v: string | number | undefined): number | string {
  if (v === undefined || v === '' || v === '-') return '';
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? v : n;
}

function convertDartRows(rows: DartFinancialRow[], years: string[]): StatementLineItem[] {
  return rows.map(r => ({
    account: r.account,
    values: Object.fromEntries(years.map(y => [y, toNum(r[y])])),
    bold: r.depth === 0,
    indent: r.depth ?? 2,
  }));
}

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

    // ─── DART 데이터 조회 ───
    let dartCompanyInfo: DartCompanyInfo | undefined;
    let dartFinancials: FinancialStatements | undefined;
    let dartBorrowings: BorrowingDetail[] = [];
    let dartRelatedEntities: RelatedEntityFinancials[] = [];

    const corp = findCorpCode(deal.차주 || '');
    if (corp) {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 3 }, (_, i) => String(currentYear - 3 + i));

      // Phase 1: 병렬 조회 (차주 기본정보 + 재무 + 관련회사 목록)
      const [companyInfo, financialData, relatedEntries] = await Promise.all([
        getCompanyInfo(corp.corpCode),
        buildFinancialData(corp.corpCode, years),
        fetchRelatedCompanies(corp.corpCode, String(currentYear - 1)).catch(() => [] as RelatedCompanyEntry[]),
      ]);

      dartCompanyInfo = companyInfo;

      if (financialData.hasData) {
        const bsSource = financialData.hasOfs ? financialData.bsItems : financialData.bsItemsCfs;
        const isSource = financialData.hasOfs ? financialData.isItems : financialData.isItemsCfs;
        const dartYears = financialData.years;

        dartFinancials = {
          years: dartYears,
          balanceSheet: convertDartRows(bsSource, dartYears),
          incomeStatement: convertDartRows(isSource, dartYears),
        };

        // 재무비율 추가
        if (financialData.ratios) {
          const ratioItems: StatementLineItem[] = [];
          for (const [acct, vals] of Object.entries(financialData.ratios)) {
            ratioItems.push({
              account: acct,
              values: Object.fromEntries(Object.entries(vals).map(([y, v]) => [y, v])),
            });
          }
          dartFinancials.ratios = ratioItems;
        }
      }

      // 차입금 주석 조회
      try {
        const bNotes = await fetchBorrowingNotes(corp.corpCode, years);
        if (bNotes?.details?.length) {
          const topLenders = bNotes.details
            .filter(d => d.currentAmount && d.currentAmount !== '-' && !/합계|소계/.test(d.category))
            .map(d => ({
              lender: d.lender || d.category,
              type: '차입금',
              balance: Math.round(parseInt(String(d.currentAmount).replace(/,/g, '')) / 1000) || 0,
              rate: d.interestRate || '-',
              maturity: d.maturityDate || '-',
              repayment: '-',
            }))
            .filter(d => d.balance > 0)
            .sort((a, b) => b.balance - a.balance);

          if (topLenders.length > 0) {
            dartBorrowings.push({
              entityName: deal.차주 || '',
              summary: [],
              topLenders: topLenders.slice(0, 10),
            });
          }
        }
      } catch { /* 차입금 주석 없어도 계속 */ }

      // Phase 2: 관련회사 재무 병렬 조회 (top 5)
      if (relatedEntries.length > 0) {
        const topRelated = relatedEntries
          .sort((a, b) => (b.ownershipPct ?? 0) - (a.ownershipPct ?? 0))
          .slice(0, 5);

        const relatedResults = await Promise.allSettled(
          topRelated.map(async (entry) => {
            if (!entry.corpCode) {
              return { entry, financials: null as FinancialStatements | null };
            }
            try {
              const fin = await buildFinancialData(entry.corpCode, years);
              if (!fin.hasData) return { entry, financials: null };
              const bsSource = fin.hasOfs ? fin.bsItems : fin.bsItemsCfs;
              const isSource = fin.hasOfs ? fin.isItems : fin.isItemsCfs;
              const statements: FinancialStatements = {
                years: fin.years,
                balanceSheet: convertDartRows(bsSource, fin.years),
                incomeStatement: convertDartRows(isSource, fin.years),
              };
              return { entry, financials: statements };
            } catch {
              return { entry, financials: null };
            }
          })
        );

        for (const result of relatedResults) {
          if (result.status !== 'fulfilled') continue;
          const { entry, financials } = result.value;

          const relEntity: RelatedEntityFinancials = {
            entity: {
              name: entry.corpName,
              relationship: entry.relationship,
              note: entry.ownershipPct ? `지분율 ${entry.ownershipPct}%` : undefined,
            },
            detailLevel: financials ? 'full' : 'minimal',
            statements: financials || undefined,
          };
          dartRelatedEntities.push(relEntity);
        }
      }

      console.log(`[generate-docx] DART 조회 완료: ${deal.차주} (관련사 ${dartRelatedEntities.length}건)`);
    }

    // ─── LoanApplication 구성 + DOCX 생성 ───
    const loanApp = dealToLoanApplication(deal, opinions, dartFinancials, dartCompanyInfo, dartRelatedEntities);

    // 차입금 데이터 추가
    if (dartBorrowings.length > 0) {
      loanApp.borrowings = dartBorrowings;
    }

    // 프로필 결정
    const isUnsold = deal.productSubtype?.includes('미분양')
      || deal.tags?.some(t => t.includes('미분양'));
    const profile = isUnsold ? unsoldCollateralProfile : equityPledgeProfile;

    const buffer = await generateDocx(loanApp, { profile });

    const today = new Date().toISOString().slice(0, 10);
    const filename = encodeURIComponent(`${deal.차주}_${today}_초안.docx`);

    return new Response(new Uint8Array(buffer), {
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
