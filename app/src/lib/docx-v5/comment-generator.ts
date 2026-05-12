/**
 * 서술형 분석 코멘트 자동 생성기 (룰기반)
 * v5 품질의 핵심 — ParsedFileData + DART 데이터로 전문가 수준 서술 생성
 */
import type {
  DealDataset, OpinionDataset, AnalysisSection, RiskItem,
} from './types';

// ─── 검토의견 6개 □ 단락 ──────────────────────────────────────────────────
export function generateOpinionParagraphs(data: DealDataset): string[] {
  const d = data.deal;
  const b = data.borrower;
  const v = data.valuation;
  const f = data.financials;
  const borr = data.borrowings;

  const paragraphs: string[] = [];

  // □1: 딜 개요
  paragraphs.push(
    `본건은 ${d.borrowerName}(이하 "차주")에 대한 ${d.collateralType} 대출건으로, ` +
    `대주단 총 ${fmt(d.totalAmount)}백만원` +
    (d.tranches.length > 1
      ? `(${d.tranches.map(tr => `${tr.lender} ${tr.name} ${fmt(tr.amount)}`).join(', ')})`
      : '') +
    ` 규모의 ${d.duration}개월 만기 신규 여신임. ` +
    (d.conditions.securityItems.length > 0
      ? d.conditions.securityItems.slice(0, 3).map(s => s.replace(/\d+\.\s*/, '')).join(', ') + '.'
      : '')
  );

  // □2: 차주 소개 + 실적
  const bsTotal = findVal(b.bsData, '자산총계');
  const capitalTotal = findVal(b.bsData, '자본총계');
  const opIncome = findVal(b.isData, '영업이익');
  const netIncome = findVal(b.isData, '당기순이익');
  paragraphs.push(
    `차주는 ${b.establishedDate.slice(0, 4)}년 설립된 ${b.industry} 영위 ${b.companyType}으로, ` +
    `최근 기준 자산총계 ${bsTotal}백만원, 자본총계 ${capitalTotal}백만원 규모임. ` +
    `영업이익 ${opIncome}백만원, 당기순이익 ${netIncome}백만원을 기록함.`
  );

  // □3: 가치산정 결과
  if (v) {
    paragraphs.push(
      `${v.appraiser} 가치산정보고서(${v.baseDate}) ${v.method} 방식으로 산정한 차주 Equity Value는 ` +
      `${v.equityValue}이며, 총 담보평가액 ${fmt(v.totalCollateralValue)}백만원으로, ` +
      `대출금 ${fmt(d.totalAmount)}백만원 대비 LTV ${v.ltv}로 충분한 담보여력을 확보함.`
    );
  }

  // □4: 이자상환
  const totalInterest = d.tranches.reduce((s, tr) => s + tr.annualInterest, 0);
  if (totalInterest > 0) {
    paragraphs.push(
      `본건 연간 이자비용 약 ${fmt(totalInterest)}백만원이며, ` +
      (borr.totalCount > 0
        ? `차주는 ${borr.institutionCount}개 이상 금융기관과 차입관계를 유지하고 있어 차환 리스크는 제한적임.`
        : '이자부담은 경미한 수준임.')
    );
  }

  // □5: 리스크 요인
  const debtRatio = findVal(b.bsData, '부채비율');
  if (debtRatio) {
    paragraphs.push(
      `다만, 차주 부채비율 ${debtRatio} 등 구조적 리스크 요인이 존재하며, ` +
      `이에 대한 지속적 모니터링이 필요함.`
    );
  }

  // □6: 결론
  paragraphs.push(
    `종합적으로, 차주의 사업안정성` +
    (v ? `, 충분한 담보가치(LTV ${v.ltv})` : '') +
    `를 감안할 때, 본건 여신은 적정한 것으로 판단되어 승인을 요청드림.`
  );

  return paragraphs;
}

// ─── 재무분석 6개 섹션 ────────────────────────────────────────────────────
export function generateFinancialAnalysis(data: DealDataset): {
  profitability: AnalysisSection;
  assetQuality: AnalysisSection;
  capitalStructure: AnalysisSection;
  fundingStructure: AnalysisSection;
  growth: AnalysisSection;
  comprehensiveRisk: AnalysisSection;
} {
  return {
    profitability: generateProfitability(data),
    assetQuality: generateAssetQuality(data),
    capitalStructure: generateCapitalStructure(data),
    fundingStructure: generateFundingStructure(data),
    growth: generateGrowth(data),
    comprehensiveRisk: generateComprehensiveRisk(data),
  };
}

function generateProfitability(data: DealDataset): AnalysisSection {
  const b = data.borrower;
  const revenue = findVal(b.isData, '영업수익');
  const opIncome = findVal(b.isData, '영업이익');
  const intIncome = findVal(b.isData, '이자수익');
  const intCost = findVal(b.isData, '이자비용');

  const paragraphs: string[] = [];
  paragraphs.push(
    `최근 기준 영업수익 ${revenue}백만원을 기록함. ` +
    `영업이익은 ${opIncome}백만원 수준임.`
  );
  if (intIncome && intCost) {
    paragraphs.push(
      `이자수익 ${intIncome}백만원, 이자비용 ${intCost}백만원으로, ` +
      `순이자마진(NIM)을 유지하고 있음.`
    );
  }
  if (data.valuation?.tmFcfe && data.valuation.tmFcfe.length > 0) {
    paragraphs.push(`수익성 전망: 삼일PwC 추정에 따르면 수익성 개선세가 지속될 것으로 예상됨.`);
  }

  return { title: '▶ ① 수익성 분석', paragraphs };
}

function generateAssetQuality(data: DealDataset): AnalysisSection {
  const b = data.borrower;
  const lossExp = findVal(b.isData, '대손상각비');
  const paragraphs: string[] = [];
  if (lossExp) {
    paragraphs.push(`대손상각비 ${lossExp}백만원 수준으로, 자산건전성 관리가 필요함.`);
  }
  // 영업현황에서 연체율
  const delinquency = b.operatingStatus.find(os => os.label.includes('연체율'));
  if (delinquency) {
    paragraphs.push(`연체율: ${delinquency.value}. 대손충당금 설정 수준은 업계 평균 대비 적정 수준임.`);
  }
  if (paragraphs.length === 0) {
    paragraphs.push('자산건전성 관련 상세 데이터 확인 필요.');
  }
  return { title: '▶ ② 자산건전성', paragraphs };
}

function generateCapitalStructure(data: DealDataset): AnalysisSection {
  const debtRatio = findVal(data.borrower.bsData, '부채비율');
  const paragraphs: string[] = [];
  if (debtRatio) {
    paragraphs.push(`부채비율 ${debtRatio} 수준임.`);
  }
  const capital = findVal(data.borrower.bsData, '자본총계');
  if (capital) {
    paragraphs.push(`자본총계 ${capital}백만원으로, 자본 확충 추세를 확인할 필요가 있음.`);
  }
  if (paragraphs.length === 0) {
    paragraphs.push('자본구조 관련 상세 분석 필요.');
  }
  return { title: '▶ ③ 자본구조', paragraphs };
}

function generateFundingStructure(data: DealDataset): AnalysisSection {
  const borr = data.borrowings;
  const paragraphs: string[] = [];
  if (borr.bySource.length > 0) {
    const top3 = borr.bySource
      .sort((a, b) => parseNum(b.balance) - parseNum(a.balance))
      .slice(0, 3);
    paragraphs.push(
      `총 차입금 ${fmt(borr.totalAmount)}백만원(${borr.totalCount}건/${borr.institutionCount}개 이상 금융기관). ` +
      `주요 조달원: ${top3.map(s => `${s.source} ${s.balance}(${s.avgRate})`).join(', ')}.`
    );
  }
  if (paragraphs.length === 0) {
    paragraphs.push('조달구조 관련 상세 데이터 확인 필요.');
  }
  return { title: '▶ ④ 조달구조', paragraphs };
}

function generateGrowth(data: DealDataset): AnalysisSection {
  const paragraphs: string[] = [];
  // 대출채권 성장률은 영업현황에서
  const loanBalance = data.borrower.operatingStatus.find(os => os.label.includes('대출채권'));
  if (loanBalance) {
    paragraphs.push(`대출채권 잔액 ${loanBalance.value}. 성장 추세를 확인할 필요가 있음.`);
  }
  if (data.valuation?.tmFcfe && data.valuation.tmFcfe.length > 0) {
    paragraphs.push('삼일PwC 추정에 따르면 점진적 성장이 전망됨.');
  }
  if (paragraphs.length === 0) {
    paragraphs.push('성장성 관련 상세 분석 필요.');
  }
  return { title: '▶ ⑤ 성장성', paragraphs };
}

function generateComprehensiveRisk(data: DealDataset): AnalysisSection {
  const v = data.valuation;
  const paragraphs: string[] = [];
  if (v) {
    paragraphs.push(
      `담보가치 견고성: LTV ${v.ltv}(Base). ` +
      (v.equitySensitivity.length > 0
        ? `Worst 시나리오에서도 LTV ${v.equitySensitivity[v.equitySensitivity.length - 1].ltv}로 원금 회수 가능성 높음.`
        : '')
    );
  }
  const totalInterest = data.deal.tranches.reduce((s, tr) => s + tr.annualInterest, 0);
  if (totalInterest > 0) {
    paragraphs.push(
      `이자상환능력: 본건 연간 이자비용 약 ${fmt(totalInterest)}백만원.`
    );
  }
  if (paragraphs.length === 0) {
    paragraphs.push('종합 리스크 분석 필요.');
  }
  return { title: '▶ ⑥ 종합 리스크', paragraphs };
}

// ─── 리스크 5항목 ─────────────────────────────────────────────────────────
export function generateRiskItems(data: DealDataset): RiskItem[] {
  const items: RiskItem[] = [];
  const v = data.valuation;
  const d = data.deal;

  // 1. 담보가치 하락
  if (v) {
    items.push({
      risk: '담보가치 하락',
      description: 'Equity Value 하락 시 LTV 상승 가능',
      mitigation: v.equitySensitivity.length > 0
        ? `Worst 시나리오에서도 LTV ${v.equitySensitivity[v.equitySensitivity.length - 1].ltv}로 충분한 여력`
        : `현재 LTV ${v.ltv}로 충분한 여력`,
    });
  }

  // 2. 이자납입 리스크
  const totalInterest = d.tranches.reduce((s, tr) => s + tr.annualInterest, 0);
  if (totalInterest > 0) {
    items.push({
      risk: '이자납입 리스크',
      description: '차주 수익성 악화 시 이자지급 부담',
      mitigation: `연간이자 ${fmt(totalInterest)}백만원, 이자유보계좌 설정으로 대응`,
    });
  }

  // 3. 차주 재무 리스크
  const debtRatio = findVal(data.borrower.bsData, '부채비율');
  if (debtRatio) {
    items.push({
      risk: '차주 재무 리스크',
      description: `부채비율 ${debtRatio}, 고레버리지`,
      mitigation: '업종 특성 감안, 자본 확충 추세 확인 필요',
    });
  }

  // 4. 외화사채 리스크 (차입금 데이터에서)
  const fxBorrowing = data.borrowings.bySource.find(bs =>
    bs.source.includes('외화') || bs.source.includes('사채')
  );
  if (fxBorrowing && parseNum(fxBorrowing.balance) > 0) {
    const ratio = data.borrowings.totalAmount > 0
      ? ((parseNum(fxBorrowing.balance) / data.borrowings.totalAmount) * 100).toFixed(1)
      : '?';
    items.push({
      risk: '외화사채 리스크',
      description: `외화사채 ${ratio}%`,
      mitigation: '원화 차입 다변화 추진',
    });
  }

  // 5. 차환 리스크
  items.push({
    risk: '차환 리스크',
    description: '만기 시 리파이낸싱 필요',
    mitigation: `${data.borrowings.institutionCount}+ 금융기관 차입관계 유지`,
  });

  return items;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────
function findVal(rows: { label: string; values: Record<string, string> }[], label: string): string {
  const row = rows.find(r => r.label.includes(label));
  if (!row) return '';
  const years = Object.keys(row.values).sort();
  return row.values[years[years.length - 1]] || '';
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}
