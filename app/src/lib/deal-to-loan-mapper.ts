import type { ReviewDeal, ReviewOpinion, FinancialSnapshot } from '@/types/review';
import type { LoanApplication, LoanType, FinancialStatements, StatementLineItem } from '@/lib/loan-engine/types';

function parseLoanTermsString(s: string): { rate: number | null; months: number | null } {
  const rateMatch = s.match(/([\d.]+)%/);
  const monthMatch = s.match(/(\d+)\s*개월/);
  return {
    rate: rateMatch ? parseFloat(rateMatch[1]) : null,
    months: monthMatch ? parseInt(monthMatch[1]) : null,
  };
}

function parseAmount(s: string): number {
  const match = s.replace(/,/g, '').match(/([\d.]+)\s*(억|백만|천만|만)?/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  switch (match[2]) {
    case '억': return num * 100;
    case '천만': return num * 10;
    case '만': return num * 0.01;
    default: return num;
  }
}

function mapLoanType(productType: string): LoanType {
  const map: Record<string, LoanType> = {
    'PF': 'pf-bridge',
    '브릿지': 'pf-bridge',
    '기업신용': 'equity-pledge',
    '사모사채': 'private-bond',
    '담보대출': 'equity-pledge',
  };
  return map[productType] || 'equity-pledge';
}

function snapshotToStatements(snapshot: FinancialSnapshot): FinancialStatements {
  const years = snapshot.데이터.map(r => r.결산년월);
  const makeItem = (account: string, getter: (r: typeof snapshot.데이터[0]) => number, bold?: boolean): StatementLineItem => ({
    account,
    values: Object.fromEntries(snapshot.데이터.map(r => [r.결산년월, getter(r)])),
    bold,
  });
  return {
    years,
    balanceSheet: [
      makeItem('자산총계', r => r.자산총계, true),
      makeItem('부채총계', r => r.부채총계, true),
      makeItem('자본총계', r => r.자본총계, true),
    ],
    incomeStatement: [
      makeItem('매출액', r => r.매출액, true),
      makeItem('영업이익', r => r.영업이익, true),
      makeItem('당기순이익', r => r.당기순이익, true),
    ],
    ratios: [],
  };
}

function buildOpinionText(opinions: ReviewOpinion[]): string {
  if (opinions.length === 0) return '';
  return opinions.map(op => {
    const parts: string[] = [`[${op.department} - ${op.authorName}] 의견: ${op.진행여부}`];
    if (op.장점?.length) parts.push(`장점: ${op.장점.join(', ')}`);
    if (op.단점?.length) parts.push(`단점: ${op.단점.join(', ')}`);
    if (op.보완사항) parts.push(`보완사항: ${op.보완사항}`);
    return parts.join('\n');
  }).join('\n\n');
}

export function dealToLoanApplication(
  deal: ReviewDeal,
  opinions: ReviewOpinion[],
  dartFinancials?: FinancialStatements,
): LoanApplication {
  const parsed = parseLoanTermsString(deal.금리수수료기간 || '');
  const amount = parseAmount(deal.모집금액 || '');
  const loanType = mapLoanType(deal.productType);

  const borrowerFs: FinancialStatements = dartFinancials
    || (deal.재무현황?.length > 0
      ? snapshotToStatements(deal.재무현황.find(s => s.역할 === '차주') || deal.재무현황[0])
      : { years: [], balanceSheet: [], incomeStatement: [] });

  return {
    meta: {
      applicationDate: deal.접수일 || new Date().toISOString().slice(0, 10),
      applicationType: '신규',
      branch: '기업금융1본부',
      officer: deal.당행접수자 || '',
    },
    borrower: {
      name: deal.차주 || '[TBD]',
      representative: '[TBD]',
      businessNumber: '[TBD]',
      establishedDate: '[TBD]',
      industry: '[TBD]',
      address: deal.주소 || '[TBD]',
    },
    loanTerms: {
      loanType,
      amount,
      durationMonths: parsed.months || 0,
      repaymentMethod: '[TBD]',
      rateType: parsed.rate ? '고정' : 'TBD',
      ratePercent: parsed.rate || undefined,
      collateralType: deal.주요채권보전 || '[TBD]',
      purpose: deal.자금용도 || '[TBD]',
      repaymentSource: '[TBD]',
      creditClassification: '정상',
    },
    funding: {
      cashIn: [{ item: '본건대출', amount }],
      cashOut: [{ item: deal.자금용도 || '운영자금', amount }],
    },
    collateralSecurity: deal.주요채권보전
      ? [{ no: 1, description: deal.주요채권보전 }]
      : [],
    loanConditions: {
      general: ['[TBD: 대출조건 확정 후 기재]'],
    },
    interestRate: {
      baseRate: parsed.rate || undefined,
      appliedRate: parsed.rate || undefined,
    },
    financials: {
      borrower: borrowerFs,
    },
    borrowings: [],
    typeSpecific: {
      type: loanType,
      data: {} as any,
    },
    aiContent: {
      opinion: buildOpinionText(opinions),
    },
    unresolvedItems: [
      { no: 1, section: '기본정보', item: '차주 상세정보', status: '[TBD: 사업자등록증 확인 후]' },
      { no: 2, section: '기본조건', item: '대출금리', status: '[TBD: 협의 중]' },
      { no: 3, section: '담보/보전', item: '담보 상세', status: '[TBD: 담보평가 후]' },
      { no: 4, section: '재무현황', item: '상세 재무제표', status: '[TBD: DART/업로드 후]' },
    ],
  };
}
