/**
 * 데이터 조립기 — ParsedFileData + DART → DealDataset
 * upload-and-generate API에서 호출
 */
import type {
  DealDataset, DealOverview, BorrowerProfile, SubsidiaryProfile,
  ValuationDataset, FinancialsDataset, BorrowingsDataset, CashflowDataset,
  ProvisionDataset, GuarantorDataset, OpinionDataset, RiskDataset,
  TrancheInfo, FinancialRow, ShareholderEntry, BorrowingSource,
  OperatingStatusItem, CollateralItem, PeerEntry, FcfeRow,
  SensitivityTable, EquitySensitivityRow, ChecklistItem,
} from './types';
import type { ParsedFileData, ValuationData, OperatingStatusParsed, SyndicateInfoParsed } from '../uploaded-file-parser';
import type { CashFlowEntity } from '../loan-engine/types';
import { generateOpinionParagraphs, generateFinancialAnalysis, generateRiskItems } from './comment-generator';

// DART API의 결과 타입 (route.ts에서 정의된 것과 동일)
export interface DartResultForDocx {
  financials: {
    years: string[];
    balanceSheet: { account: string; values: Record<string, number | string>; bold?: boolean; depth?: number }[];
    incomeStatement: { account: string; values: Record<string, number | string>; bold?: boolean; depth?: number }[];
  };
  borrowings: {
    entityName: string;
    summary?: { category: string; count: number; balance: number; weightedAvgRate: string; maturityRange: string }[];
    topLenders?: { lender: string; type: string; balance: number; rate: string; maturity: string }[];
  }[];
  shareholders: { name: string; stockType: string; shareCount: string; shareRatio: string; relation: string }[];
  companyInfo?: {
    ceoNm: string; bizrNo: string; jurirNo: string; adres: string;
    estDt: string; indutyCode: string; corpCls: string; accMt: string;
  };
}

export function assembleDealDataset(
  parsed: ParsedFileData,
  dartResult: DartResultForDocx,
  borrowerName: string,
  memo: string,
  allText: string,
): DealDataset {
  const ci = dartResult.companyInfo;
  const fin = dartResult.financials;

  // ─── Deal Overview ──────────────────────────────────────
  const syndicateInfo = parsed.syndicateInfo;
  const tranches: TrancheInfo[] = syndicateInfo?.tranches.map(tr => ({
    name: tr.name,
    lender: tr.lender,
    amount: tr.amount,
    rate: tr.rate ? `${tr.rate}%` : '',
    duration: `${parsed.dealTerms.duration || 24}개월`,
    fee: tr.fee || 0,
    aic: tr.allInCost ? `${tr.allInCost}%` : '',
    annualInterest: tr.amount * (tr.rate || 0) / 100,
  })) || [];

  const totalAmount = syndicateInfo?.totalAmount
    || parsed.dealTerms.amount
    || tranches.reduce((s, t) => s + t.amount, 0)
    || 0;

  const isEquityDeal = allText.includes('지분담보') || allText.includes('근질권');

  // 텍스트에서 보전항목 추출
  const securityItems = isEquityDeal ? [
    `${borrowerName} 대표이사 연대보증`,
    '담보 지분 근질권 설정',
    '근질권 설정 주식의 처분승낙서 및 양도증서 발행',
    '대출이자 3개월치 이자유보계좌 근질권 설정',
    '기타 대주가 합리적으로 요청하는 사항',
  ] : [
    '미분양 호실 담보 (담보신탁 1순위 우선수익권)',
  ];

  const deal: DealOverview = {
    borrowerName,
    totalAmount,
    purpose: parsed.dealTerms.purpose || (isEquityDeal ? '신규대출 영업자금(운영자금)' : '운영자금'),
    repaymentSource: parsed.dealTerms.repaymentSource || (isEquityDeal ? '대출채권 원리금 회수 · 차입금 리파이낸싱' : '분양대금 회수'),
    repaymentMethod: `만기일시상환(${parsed.dealTerms.duration || 24}개월)`,
    interestPayment: '매 1개월 또는 3개월 후취',
    guarantorName: extract(allText, /연대보증[인자]*[:\s]*([^\n,(]+)/) || '',
    collateralType: isEquityDeal ? '지분담보(근질권)' : '미분양 호실 담보',
    creditClassification: '정상',
    duration: parsed.dealTerms.duration || 24,
    tranches,
    conditions: {
      securityItems,
      precedentConditions: [],
      subsequentConditions: [],
      accelerationEvents: [],
    },
    fundUsage: {
      cashIn: [{ item: '본건대출', amount: totalAmount }],
      cashOut: [{ item: parsed.dealTerms.purpose || '운영자금', amount: totalAmount }],
    },
    fundingStructure: null,
    overviewText: memo || `본건은 ${borrowerName}에 대한 ${isEquityDeal ? '지분담보' : '미분양담보'} 대출건임.`,
    keyMetrics: [],
    keyMetricsNote: '',
    departmentName: extract(allText, /(기업금융\d+본부)/) || '기업금융1본부',
  };

  // ─── Borrower Profile ───────────────────────────────────
  const dartYears = fin.years;
  const bsRows = fin.balanceSheet.map(r => toFinancialRow(r, dartYears));
  const isRows = fin.incomeStatement.map(r => toFinancialRow(r, dartYears));

  const shareholders: ShareholderEntry[] = dartResult.shareholders.map(sh => ({
    name: sh.name,
    stockType: sh.stockType || '보통주',
    shares: sh.shareCount,
    ratio: sh.shareRatio,
  }));

  const operatingStatus: OperatingStatusItem[] = parsed.operatingStatus.flatMap(os =>
    os.items.map(item => ({ label: item.label, value: item.value }))
  );

  const borrower: BorrowerProfile = {
    name: borrowerName,
    representative: ci?.ceoNm || extract(allText, /대표이사\s*([^\s(,]+)/) || '',
    businessNumber: ci?.bizrNo ? fmtBizrNo(ci.bizrNo) : '',
    corporateNumber: ci?.jurirNo ? fmtJurirNo(ci.jurirNo) : '',
    establishedDate: ci?.estDt ? fmtDate(ci.estDt) : '',
    industry: extract(allText, /업종[:\s]*([^\n,]+)/) || '',
    address: ci?.adres || '',
    companyType: ci?.corpCls === 'Y' ? '유가증권 상장' : ci?.corpCls === 'K' ? '코스닥 상장' : ci?.corpCls === 'N' ? '비상장' : '비상장/외감',
    employees: '',
    capital: '',
    fiscalMonth: ci?.accMt ? `${ci.accMt}월` : '12월',
    shareholders,
    bsData: bsRows,
    isData: isRows,
    operatingStatus,
    consolidatedBs: null,
    consolidatedIs: null,
  };

  // ─── Borrowings ─────────────────────────────────────────
  const bySource: BorrowingSource[] = [];
  if (parsed.borrowingDetails.length > 0) {
    const grouped: Record<string, { count: number; totalBalance: number; rates: number[] }> = {};
    for (const bd of parsed.borrowingDetails) {
      const cat = bd.category || '기타';
      if (!grouped[cat]) grouped[cat] = { count: 0, totalBalance: 0, rates: [] };
      grouped[cat].count++;
      grouped[cat].totalBalance += bd.balance;
      const r = parseFloat(bd.rate);
      if (!isNaN(r)) grouped[cat].rates.push(r);
    }
    for (const [source, g] of Object.entries(grouped)) {
      bySource.push({
        source,
        count: `${g.count}건`,
        balance: g.totalBalance.toLocaleString('ko-KR'),
        avgRate: g.rates.length > 0 ? `${(g.rates.reduce((a, b) => a + b, 0) / g.rates.length).toFixed(2)}%` : '-',
      });
    }
  }

  const borrowings: BorrowingsDataset = {
    totalAmount: parsed.borrowingDetails.reduce((s, bd) => s + bd.balance, 0),
    totalCount: parsed.borrowingDetails.length,
    institutionCount: new Set(parsed.borrowingDetails.map(bd => bd.lender)).size,
    bySource,
    operatingStatus,
  };

  // ─── Valuation ──────────────────────────────────────────
  let valuation: ValuationDataset | null = null;
  if (parsed.valuationData) {
    valuation = buildValuationDataset(parsed.valuationData, deal, borrowerName);
  }

  // ─── Cashflow ───────────────────────────────────────────
  let cashflow: CashflowDataset | null = null;
  if (parsed.cashFlows.length > 0) {
    const cfEntities = parsed.cashFlows;
    const tmEntity = cfEntities[0];
    const ymEntity = cfEntities.length > 1 ? cfEntities[1] : null;

    const toCashflowTable = (entity: CashFlowEntity) => ({
      entityName: entity.name,
      headers: ['구분', ...entity.quarters, '연간'],
      rows: entity.items.map(item => ({
        label: item.label,
        values: [...item.values.map(String), item.annual != null ? String(item.annual) : ''],
      })),
    });

    cashflow = {
      tmCashflow: toCashflowTable(tmEntity),
      ymCashflow: ymEntity ? toCashflowTable(ymEntity) : null,
    };
  }

  // ─── Provisions ─────────────────────────────────────────
  let provisions: ProvisionDataset | null = null;
  if (parsed.provisionRates.length > 0) {
    provisions = {
      tmProvision: {
        entityName: borrowerName,
        headers: ['구분', ...parsed.provisionRates[0].rates.map(r => r.bracket)],
        rows: parsed.provisionRates.map(pr => ({
          label: pr.entityName,
          values: pr.rates.map(r => r.generalRate),
        })),
      },
      ymProvision: null,
    };
  }

  // ─── Guarantor ──────────────────────────────────────────
  let guarantor: GuarantorDataset | null = null;
  if (parsed.guarantorIncome) {
    guarantor = {
      name: parsed.guarantorIncome.name,
      birthDate: '',
      position: '대표이사',
      relationship: `대표이사 겸 최대주주`,
      guaranteeScope: '본건 대출 원리금 전액',
      note: '',
      income: {
        headers: ['구분', ...parsed.guarantorIncome.incomeByYear.map(y => y.year)],
        rows: [
          { label: '근로소득', values: parsed.guarantorIncome.incomeByYear.map(y => fmtNum(y.laborIncome)) },
          { label: '이자소득', values: parsed.guarantorIncome.incomeByYear.map(y => fmtNum(y.interestIncome)) },
          { label: '배당소득', values: parsed.guarantorIncome.incomeByYear.map(y => fmtNum(y.dividendIncome)) },
          { label: '사업소득', values: parsed.guarantorIncome.incomeByYear.map(y => fmtNum(y.businessIncome)) },
          { label: '총소득', values: parsed.guarantorIncome.incomeByYear.map(y => fmtNum(y.totalIncome)) },
        ],
      },
    };
  }

  // ─── 조립 (의견/분석은 전체 데이터 기반으로 생성) ──────────────
  const dataset: DealDataset = {
    deal,
    borrower,
    subsidiary: null,
    valuation,
    financials: {
      years: dartYears,
      profitability: { title: '▶ ① 수익성 분석', paragraphs: [] },
      assetQuality: { title: '▶ ② 자산건전성', paragraphs: [] },
      capitalStructure: { title: '▶ ③ 자본구조', paragraphs: [] },
      fundingStructure: { title: '▶ ④ 조달구조', paragraphs: [] },
      growth: { title: '▶ ⑤ 성장성', paragraphs: [] },
      comprehensiveRisk: { title: '▶ ⑥ 종합 리스크', paragraphs: [] },
    },
    borrowings,
    cashflow,
    provisions,
    guarantor,
    opinion: { paragraphs: [] },
    risks: { interestAnalysisText: [], principalAnalysisText: [], riskItems: [] },
    checklist: [],
  };

  // 코멘트 생성기로 서술형 텍스트 채움
  const analysis = generateFinancialAnalysis(dataset);
  dataset.financials = { ...dataset.financials, ...analysis };
  dataset.opinion = { paragraphs: generateOpinionParagraphs(dataset) };
  dataset.risks.riskItems = generateRiskItems(dataset);

  // 이자분석 텍스트
  const totalInterest = tranches.reduce((s, tr) => s + tr.annualInterest, 0);
  if (totalInterest > 0) {
    dataset.risks.interestAnalysisText = [
      `본건 대출의 연간 이자비용은 ${fmtNum(totalInterest)}백만원이며, 이자부담은 경미한 수준임.`,
    ];
    dataset.risks.principalAnalysisText = [
      `본건은 만기일시상환(${deal.duration}개월) 구조로, 만기 시 상환 예정임.`,
    ];
  }

  return dataset;
}

// ─── Valuation 조립 ───────────────────────────────────────
function buildValuationDataset(v: ValuationData, deal: DealOverview, borrowerName: string): ValuationDataset {
  const kc = v.keComponents;
  const totalCollateral = v.equityValue + (v.youmeEquityValue || 0);
  const ltv = deal.totalAmount > 0 ? ((deal.totalAmount / totalCollateral) * 100).toFixed(1) + '%' : '0%';

  const collateralItems: CollateralItem[] = [];
  if (v.youmeEquityValue > 0) {
    collateralItems.push({
      company: '유미캐피탈대부',
      pledger: borrowerName,
      stockType: '보통주',
      shares: '',
      ratio: '100%',
      value: fmtNum(v.youmeEquityValue),
      valuationMethod: `${v.appraiser} ${v.method}`,
    });
  }
  collateralItems.push({
    company: borrowerName,
    pledger: '',
    stockType: '보통주',
    shares: '',
    ratio: '',
    value: fmtNum(v.equityValue),
    valuationMethod: v.method,
  });

  // FCFE rows
  const fcfeHeaders = v.tmFcfe.map(f => f.year);
  const tmFcfeRows: FcfeRow[] = v.tmFcfe.length > 0 ? [
    { label: '영업수익', values: v.tmFcfe.map(f => fmtNum(f.revenue)) },
    { label: '영업비용', values: v.tmFcfe.map(f => fmtNum(f.opCost)) },
    { label: '영업이익', values: v.tmFcfe.map(f => fmtNum(f.opIncome)) },
    { label: '당기순이익', values: v.tmFcfe.map(f => fmtNum(f.netIncome)) },
    { label: 'FCFE', values: v.tmFcfe.map(f => fmtNum(f.fcfe)) },
    { label: 'PV of FCFE', values: v.tmFcfe.map(f => fmtNum(f.pvFcfe)) },
  ] : [];
  const ymFcfeRows: FcfeRow[] = v.ymFcfe.length > 0 ? [
    { label: '영업수익', values: v.ymFcfe.map(f => fmtNum(f.revenue)) },
    { label: '영업이익', values: v.ymFcfe.map(f => fmtNum(f.opIncome)) },
    { label: '당기순이익', values: v.ymFcfe.map(f => fmtNum(f.netIncome)) },
    { label: 'FCFE', values: v.ymFcfe.map(f => fmtNum(f.fcfe)) },
    { label: 'PV of FCFE', values: v.ymFcfe.map(f => fmtNum(f.pvFcfe)) },
  ] : [];

  // 민감도 테이블
  const opSens: SensitivityTable = { rowHeaders: [], colHeaders: [], values: [] };
  if (v.tmSensitivity.length > 0) {
    opSens.colHeaders = Object.keys(v.tmSensitivity[0].values);
    opSens.rowHeaders = v.tmSensitivity.map(s => s.keLabel);
    opSens.values = v.tmSensitivity.map(s =>
      opSens.colHeaders.map(col => fmtNum(s.values[col] || 0))
    );
  }

  const eqSens: EquitySensitivityRow[] = [];
  // 지분가치 민감도는 Equity Value 기반으로 시나리오 생성
  const ev = v.equityValue;
  const ymEq = v.youmeEquityValue || 0;
  if (ev > 0) {
    const scenarios = [
      { scenario: 'Bull (+20%)', mult: 1.2 },
      { scenario: 'Base', mult: 1.0 },
      { scenario: 'Bear (-10%)', mult: 0.9 },
      { scenario: 'Stress (-20%)', mult: 0.8 },
      { scenario: 'Worst (-30%)', mult: 0.7 },
    ];
    for (const s of scenarios) {
      const adjEv = Math.round(ev * s.mult);
      const adjYm = Math.round(ymEq * s.mult);
      const techShare = Math.round(adjEv * 0.8355); // 83.55%
      const total = adjYm + techShare;
      eqSens.push({
        scenario: s.scenario,
        equityValue: fmtNum(adjEv),
        youmeShare: fmtNum(adjYm),
        techShare: fmtNum(techShare),
        totalCollateral: fmtNum(total),
        ltv: deal.totalAmount > 0 ? ((deal.totalAmount / total) * 100).toFixed(1) + '%' : '0%',
      });
    }
  }

  return {
    appraiser: v.appraiser || '삼일회계법인 (PwC)',
    method: v.method || 'FCFE DCF',
    baseDate: v.baseDate || '',
    summaryText: `${v.appraiser}이 ${v.baseDate} 기준 ${v.method} 방식으로 산정한 Equity Value는 ${fmtNum(v.equityValue)}백만원임.`,
    ke: `${v.ke}%`,
    keComponents: {
      rf: `${kc.rf}%`,
      mrp: `${kc.mrp}%`,
      betaL: String(kc.betaL),
      betaU: String(kc.betaU),
      deRatio: `${kc.deRatio}%`,
      taxRate: `${kc.taxRate}%`,
      sizePremium: `${kc.sizePremium}%`,
    },
    perpetualGrowthRate: `${v.perpetualGrowthRate}%`,
    pvOfFcfe: `${fmtNum(v.operatingValue)} 백만원`,
    terminalValue: '',
    operatingValue: `${fmtNum(v.operatingValue)} 백만원`,
    youmeEquityValue: `${fmtNum(v.youmeEquityValue)} 백만원`,
    otherInvestment: `${fmtNum(v.otherNonOperating)} 백만원`,
    nonOperatingValue: `${fmtNum(v.nonOperatingValue)} 백만원`,
    equityValue: `${fmtNum(v.equityValue)} 백만원`,
    equityValueNum: v.equityValue,
    peerGroup: v.peerGroup.map(pg => ({
      company: pg.company,
      deRatio: pg.deRatio,
      betaL: pg.beta5yr,
      betaU: pg.unleveredBeta,
    })),
    fcfeHeaders: v.tmFcfe.map(f => f.year),
    tmFcfe: tmFcfeRows,
    ymFcfe: ymFcfeRows,
    tmFcfeNotes: [],
    ymFcfeNotes: [],
    operatingSensitivity: opSens,
    equitySensitivity: eqSens,
    collateralItems,
    totalCollateralValue: totalCollateral,
    ltv,
    ltvNote: eqSens.length > 0 ? `Sensitivity 최저 ${eqSens[eqSens.length - 1].totalCollateral} 기준 LTV = ${eqSens[eqSens.length - 1].ltv}` : '',
  };
}

// ─── Helpers ──────────────────────────────────────────────
function toFinancialRow(
  dartRow: { account: string; values: Record<string, number | string>; bold?: boolean },
  years: string[],
): FinancialRow {
  const values: Record<string, string> = {};
  for (const y of years) {
    const v = dartRow.values[y];
    values[y] = v === '' || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('ko-KR') : String(v);
  }
  return {
    label: dartRow.account,
    values,
    bold: dartRow.bold,
    shading: dartRow.bold ? 'F2F2F2' : undefined,
  };
}

function extract(text: string, re: RegExp): string {
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function fmtBizrNo(s: string): string {
  const d = s.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}` : s;
}

function fmtJurirNo(s: string): string {
  const d = s.replace(/\D/g, '');
  return d.length === 13 ? `${d.slice(0,6)}-${d.slice(6)}` : s;
}

function fmtDate(s: string): string {
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6)}`;
  return s;
}

function fmtNum(n: number): string {
  if (n === 0 || isNaN(n)) return '';
  return n.toLocaleString('ko-KR');
}
