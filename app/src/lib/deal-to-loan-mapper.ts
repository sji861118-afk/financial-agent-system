import type { ReviewDeal, ReviewOpinion, FinancialSnapshot, FinancialRow, FinancialIndicator } from '@/types/review';
import type { LoanApplication, LoanType, FinancialStatements, StatementLineItem, UnresolvedItem, RelatedEntityFinancials } from '@/lib/loan-engine/types';
import type { DartCompanyInfo } from '@/lib/dart-api';

// ─── Parsers ────────────────────────────────────────────────

function parseLoanTermsString(s: string): { rate: number | null; fee: string | null; months: number | null } {
  const rateMatch = s.match(/([\d.]+)%/);
  const feeMatch = s.match(/수수료\s*([\d.]+)%/);
  const monthMatch = s.match(/(\d+)\s*개월/);
  return {
    rate: rateMatch ? parseFloat(rateMatch[1]) : null,
    fee: feeMatch ? `${feeMatch[1]}%` : null,
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

function mapLoanType(productType: string, subtype?: string): LoanType {
  const map: Record<string, LoanType> = {
    'PF': 'pf-bridge',
    '브릿지': 'pf-bridge',
    '기업신용': 'equity-pledge',
    '사모사채': 'private-bond',
    '담보대출': 'equity-pledge',
  };
  return map[productType] || 'equity-pledge';
}

/** 구분 문자열에서 applicationType 추출 */
function parseApplicationType(s: string): '신규' | '기한연장' | '조건변경' | '증액' | '재신청' | '대환' {
  if (s.includes('연장')) return '기한연장';
  if (s.includes('조건변경')) return '조건변경';
  if (s.includes('증액')) return '증액';
  if (s.includes('대환')) return '대환';
  if (s.includes('재신청')) return '재신청';
  return '신규';
}

// ─── Financial Snapshot → Statements ────────────────────────

function snapshotToStatements(snapshot: FinancialSnapshot): FinancialStatements {
  const years = snapshot.데이터.map(r => r.결산년월);
  const makeItem = (account: string, getter: (r: FinancialRow) => number, bold?: boolean): StatementLineItem => ({
    account,
    values: Object.fromEntries(snapshot.데이터.map(r => [r.결산년월, getter(r)])),
    bold,
  });

  // 자동 산출 비율
  const ratios: StatementLineItem[] = [];
  const lastTwo = snapshot.데이터.slice(-2);

  // 부채비율 = 부채총계 / 자본총계 × 100
  const debtRatioValues: Record<string, string> = {};
  for (const r of snapshot.데이터) {
    debtRatioValues[r.결산년월] = r.자본총계 !== 0 ? `${(r.부채총계 / r.자본총계 * 100).toFixed(1)}%` : '-';
  }
  ratios.push({ account: '부채비율', values: debtRatioValues });

  // 자기자본비율 = 자본총계 / 자산총계 × 100
  const eqRatioValues: Record<string, string> = {};
  for (const r of snapshot.데이터) {
    eqRatioValues[r.결산년월] = r.자산총계 !== 0 ? `${(r.자본총계 / r.자산총계 * 100).toFixed(1)}%` : '-';
  }
  ratios.push({ account: '자기자본비율', values: eqRatioValues });

  // 영업이익률 = 영업이익 / 매출액 × 100
  const opMarginValues: Record<string, string> = {};
  for (const r of snapshot.데이터) {
    opMarginValues[r.결산년월] = r.매출액 !== 0 ? `${(r.영업이익 / r.매출액 * 100).toFixed(1)}%` : '-';
  }
  ratios.push({ account: '영업이익률', values: opMarginValues });

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
    ratios,
  };
}

// ─── Opinion Builder ────────────────────────────────────────

function buildOpinionText(opinions: ReviewOpinion[]): string {
  if (opinions.length === 0) return '';
  return opinions.map(op => {
    const parts: string[] = [`[${op.department} - ${op.authorName}] 의견: ${op.진행여부}`];
    if (op.장점?.length) parts.push(`장점:\n${op.장점.map(s => `  - ${s}`).join('\n')}`);
    if (op.단점?.length) parts.push(`단점:\n${op.단점.map(s => `  - ${s}`).join('\n')}`);
    if (op.보완사항) parts.push(`보완사항: ${op.보완사항}`);
    return parts.join('\n');
  }).join('\n\n');
}

/** 검토의견에서 리스크 분석 텍스트 생성 */
function buildRiskAnalysis(deal: ReviewDeal, opinions: ReviewOpinion[]): string {
  const risks: string[] = [];

  // 재무지표에서 negative 항목 추출
  if (deal.재무지표?.length) {
    const negatives = deal.재무지표.filter(i => i.status === 'negative');
    if (negatives.length > 0) {
      risks.push(`재무 위험요인: ${negatives.map(n => `${n.name} ${n.value}`).join(', ')}`);
    }
  }

  // 검토의견에서 단점 취합
  const allCons = opinions.flatMap(op => op.단점 || []);
  if (allCons.length > 0) {
    risks.push(`검토의견 지적사항:\n${allCons.map(c => `  - ${c}`).join('\n')}`);
  }

  // 보완사항
  const supplements = opinions.filter(op => op.보완사항).map(op => `[${op.department}] ${op.보완사항}`);
  if (supplements.length > 0) {
    risks.push(`보완 필요사항:\n${supplements.map(s => `  - ${s}`).join('\n')}`);
  }

  return risks.join('\n\n') || '';
}

/** 재무 스냅샷에서 간단한 분석 소견 생성 */
function buildFinancialAnalysis(deal: ReviewDeal): string {
  const snapshot = deal.재무현황?.find(s => s.역할 === '차주') || deal.재무현황?.[0];
  if (!snapshot || !snapshot.데이터?.length) return '';

  const latest = snapshot.데이터[snapshot.데이터.length - 1];
  const prev = snapshot.데이터.length >= 2 ? snapshot.데이터[snapshot.데이터.length - 2] : null;

  const parts: string[] = [];
  parts.push(`${snapshot.회사명} ${latest.결산년월} 기준 자산총계 ${latest.자산총계.toLocaleString()}억원, 부채총계 ${latest.부채총계.toLocaleString()}억원, 자본총계 ${latest.자본총계.toLocaleString()}억원.`);

  if (latest.자본총계 !== 0) {
    const debtRatio = (latest.부채총계 / latest.자본총계 * 100).toFixed(1);
    parts.push(`부채비율 ${debtRatio}%.`);
  }

  parts.push(`매출액 ${latest.매출액.toLocaleString()}억원, 영업이익 ${latest.영업이익.toLocaleString()}억원, 당기순이익 ${latest.당기순이익.toLocaleString()}억원.`);

  if (prev) {
    const revGrowth = prev.매출액 !== 0 ? ((latest.매출액 - prev.매출액) / Math.abs(prev.매출액) * 100).toFixed(1) : '-';
    parts.push(`전년 대비 매출 ${revGrowth}% 성장.`);
  }

  // 재무지표 반영
  if (deal.재무지표?.length) {
    const indicators = deal.재무지표.map(i => `${i.name} ${i.value}`).join(', ');
    parts.push(`주요 재무지표: ${indicators}.`);
  }

  return parts.join(' ');
}

// ─── Collateral Security Parser ─────────────────────────────

/** 주요채권보전 문자열을 여러 항목으로 분리 */
function parseCollateralSecurity(s: string): { no: number; description: string }[] {
  if (!s) return [];
  // 줄바꿈이나 번호(1., 2., ①, ②)로 분리 시도
  const lines = s.split(/\n|(?=\d+\.)|(?=[①②③④⑤⑥⑦⑧⑨⑩])/).map(l => l.replace(/^\d+\.\s*|^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').trim()).filter(Boolean);
  if (lines.length <= 1) return [{ no: 1, description: s.trim() }];
  return lines.map((desc, i) => ({ no: i + 1, description: desc }));
}

// ─── DART Company Info Helpers ──────────────────────────────

/** "1234567890" → "123-45-67890" */
function formatBizrNo(s: string): string {
  const d = s.replace(/[^0-9]/g, '');
  if (d.length !== 10) return s;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** "1234561234567" → "123456-1234567" */
function formatJurirNo(s: string): string {
  const d = s.replace(/[^0-9]/g, '');
  if (d.length !== 13) return s;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}

/** "20100315" → "2010-03-15" */
function formatEstDt(s: string): string {
  const d = s.replace(/[^0-9]/g, '');
  if (d.length !== 8) return s;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/** DART corpCls → display string */
function mapCorpCls(cls: string): string {
  const map: Record<string, string> = {
    'Y': '유가증권 상장',
    'K': '코스닥 상장',
    'N': '비상장',
    'E': '기타',
  };
  return map[cls] || cls;
}

/** KSIC 2-digit code → industry name */
const INDUSTRY_MAP: Record<string, string> = {
  '01': '농업', '02': '임업', '03': '어업', '05': '석탄광업',
  '10': '식료품제조', '20': '화학제조', '24': '금속제조', '25': '금속가공',
  '26': '전자부품', '29': '기계장비', '30': '자동차', '35': '전기가스',
  '41': '건설업', '42': '토목건설', '45': '자동차판매', '46': '도매업',
  '47': '소매업', '49': '육상운송', '52': '창고운송', '55': '숙박업',
  '58': '출판업', '59': '영상제작', '61': '통신업', '62': '정보서비스',
  '63': '정보서비스', '64': '금융업', '65': '보험업', '66': '금융서비스',
  '68': '부동산업', '70': '연구개발', '71': '전문서비스', '72': '건축설계',
  '73': '기술서비스', '74': '사업서비스', '75': '사업지원',
};

function lookupIndustryName(code: string): string {
  if (!code) return '';
  const prefix2 = code.slice(0, 2);
  return INDUSTRY_MAP[prefix2] || '';
}

// ─── Main Mapper ────────────────────────────────────────────

export function dealToLoanApplication(
  deal: ReviewDeal,
  opinions: ReviewOpinion[],
  dartFinancials?: FinancialStatements,
  dartCompanyInfo?: DartCompanyInfo,
  dartRelatedEntities?: RelatedEntityFinancials[],
): LoanApplication {
  const parsed = parseLoanTermsString(deal.금리수수료기간 || '');
  const amount = parseAmount(deal.모집금액 || '');
  const loanType = mapLoanType(deal.productType, deal.productSubtype);

  // 재무데이터: DART 상세가 있으면 우선, 없으면 요약 스냅샷 변환
  const borrowerFs: FinancialStatements = dartFinancials
    || (deal.재무현황?.length > 0
      ? snapshotToStatements(deal.재무현황.find(s => s.역할 === '차주') || deal.재무현황[0])
      : { years: [], balanceSheet: [], incomeStatement: [] });

  // 관계사 재무 (시공사, 연대보증인 등)
  const relatedStatements = (deal.재무현황 || [])
    .filter(s => s.역할 !== '차주')
    .map(s => ({
      entity: {
        name: s.회사명,
        relationship: s.역할,
      },
      detailLevel: 'summary' as const,
      summaryRow: s.데이터.length > 0 ? {
        totalAssets: s.데이터[s.데이터.length - 1].자산총계,
        totalLiabilities: s.데이터[s.데이터.length - 1].부채총계,
        totalEquity: s.데이터[s.데이터.length - 1].자본총계,
        revenue: s.데이터[s.데이터.length - 1].매출액,
        operatingIncome: s.데이터[s.데이터.length - 1].영업이익,
        netIncome: s.데이터[s.데이터.length - 1].당기순이익,
        year: s.데이터[s.데이터.length - 1].결산년월,
      } : undefined,
    }));

  // 상환방법 추정
  const repaymentMethod = parsed.months
    ? (parsed.months <= 12 ? '만기일시상환' : '만기일시상환 (원금)')
    : '[TBD]';

  // 담보/보전 파싱
  const collateralItems = parseCollateralSecurity(deal.주요채권보전 || '');

  // TBD 항목 동적 생성 (실제로 비어있는 항목만)
  const unresolvedItems: UnresolvedItem[] = [];
  let unresolvedNo = 1;
  if (!parsed.rate) unresolvedItems.push({ no: unresolvedNo++, section: '기본조건', item: '대출금리', status: '[TBD: 협의 중]' });
  if (parsed.fee) unresolvedItems.push({ no: unresolvedNo++, section: '기본조건', item: '취급수수료', status: `참여수수료 ${parsed.fee} (확정 필요)` });
  if (!deal.재무현황?.length && !dartFinancials && !dartCompanyInfo) unresolvedItems.push({ no: unresolvedNo++, section: '재무현황', item: '재무제표', status: '[TBD: DART 조회 또는 업로드 필요]' });
  if (collateralItems.length <= 1) unresolvedItems.push({ no: unresolvedNo++, section: '담보/보전', item: '담보 상세 목록', status: '[TBD: 담보평가 후]' });

  return {
    meta: {
      applicationDate: deal.접수일 || new Date().toISOString().slice(0, 10),
      applicationType: parseApplicationType(deal.구분 || ''),
      branch: '기업금융1본부',
      officer: deal.당행접수자 || '',
    },
    borrower: {
      name: deal.차주 || dartCompanyInfo?.corpName || '[TBD]',
      representative: dartCompanyInfo?.ceoNm || '[TBD: 확인 필요]',
      businessNumber: dartCompanyInfo?.bizrNo ? formatBizrNo(dartCompanyInfo.bizrNo) : '[TBD]',
      corporateNumber: dartCompanyInfo?.jurirNo ? formatJurirNo(dartCompanyInfo.jurirNo) : undefined,
      establishedDate: dartCompanyInfo?.estDt ? formatEstDt(dartCompanyInfo.estDt) : '[TBD]',
      industry: lookupIndustryName(dartCompanyInfo?.indutyCode || '')
        || deal.tags?.find(t => t.includes('업') || t.includes('금융') || t.includes('건설'))
        || '[TBD]',
      address: deal.주소 || dartCompanyInfo?.adres || '[TBD]',
      companyType: dartCompanyInfo?.corpCls ? mapCorpCls(dartCompanyInfo.corpCls) : undefined,
      fiscalMonth: dartCompanyInfo?.accMt ? parseInt(dartCompanyInfo.accMt) : undefined,
    },
    loanTerms: {
      loanType,
      amount,
      durationMonths: parsed.months || 0,
      repaymentMethod,
      rateType: parsed.rate ? '고정' : 'TBD',
      ratePercent: parsed.rate || undefined,
      collateralType: deal.주요채권보전 || '[TBD]',
      purpose: deal.자금용도 || '[TBD]',
      repaymentSource: '[TBD: 상환재원 확인 필요]',
      creditClassification: '정상',
      guarantor: deal.tags?.find(t => t.includes('보증') || t.includes('연대')) || undefined,
    },
    funding: {
      cashIn: [{ item: '본건대출', amount }],
      cashOut: [{ item: deal.자금용도 || '운영자금', amount }],
    },
    collateralSecurity: collateralItems.length > 0 ? collateralItems : [{ no: 1, description: '[TBD: 담보/보전 조건 확정 필요]' }],
    loanConditions: {
      general: ['현물 및 현금 배당 금지 (별도 협의 시까지)'],
      precedentConditions: [
        '제반 금융계약의 적법한 체결',
        '법무법인의 적법의견서 제출',
        '기타 대주가 합리적으로 요청하는 사항',
      ],
      subsequentConditions: [
        '인출일 이후 자금사용목적에 따라 사용 후 사용증빙 제출',
        '기타 대주가 합리적으로 요청하는 사항',
      ],
      accelerationEvents: [
        '차주가 대출약정에 따라 지급하여야 할 금액을 해당 지급기일에 지급하지 아니한 경우',
        '대출약정상 차주의 확인 및 보장 사항이 중요한 점에서 사실과 다르거나 허위로 밝혀진 경우',
        '차주에 대한 파산, 회생, 청산 등의 절차가 개시된 경우',
      ],
    },
    interestRate: {
      baseRate: parsed.rate || undefined,
      appliedRate: parsed.rate || undefined,
    },
    financials: {
      borrower: borrowerFs,
      relatedCompanies: [...relatedStatements, ...(dartRelatedEntities || [])].length > 0
        ? [...relatedStatements, ...(dartRelatedEntities || [])]
        : undefined,
    },
    borrowings: [],
    typeSpecific: {
      type: loanType,
      data: {} as any,
    },
    aiContent: {
      opinion: buildOpinionText(opinions),
      financialAnalysis: buildFinancialAnalysis(deal),
      riskAnalysis: buildRiskAnalysis(deal, opinions),
    },
    unresolvedItems,
  };
}
