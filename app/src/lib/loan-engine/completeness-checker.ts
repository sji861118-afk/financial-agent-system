/**
 * 여신승인신청서 완성도 체커
 * 샘플 기준 필요 섹션/데이터를 정의하고, 현재 데이터에서 채워진 것과 비는 것을 분석
 */

// ─── 데이터 소스 유형 ───
export type DataSource = 'dart' | 'uploaded-pdf' | 'uploaded-excel' | 'manual' | 'appraisal' | 'auto-calc';

// ─── 섹션 정의 ───
export interface SectionRequirement {
  id: string;
  title: string;
  /** 샘플 신청서 페이지 참조 */
  samplePages: string;
  /** 필수 여부 */
  required: boolean;
  /** 데이터 필드 목록 */
  fields: FieldRequirement[];
}

export interface FieldRequirement {
  id: string;
  label: string;
  /** 가능한 데이터 소스 (우선순위 순) */
  sources: DataSource[];
  /** 필수 여부 */
  required: boolean;
}

export interface FieldStatus {
  fieldId: string;
  label: string;
  status: 'filled' | 'partial' | 'missing';
  source?: DataSource;
  value?: string; // 채워진 경우 요약값
}

export interface SectionStatus {
  sectionId: string;
  title: string;
  required: boolean;
  completeness: number; // 0~100%
  fields: FieldStatus[];
}

export interface CompletenessReport {
  overall: number; // 전체 완성도 0~100%
  requiredCompleteness: number; // 필수 항목만 완성도
  sections: SectionStatus[];
  /** 부족 데이터를 채우려면 필요한 자료 */
  missingDataSuggestions: MissingSuggestion[];
}

export interface MissingSuggestion {
  dataType: string;
  description: string;
  affectedSections: string[];
  priority: 'high' | 'medium' | 'low';
}

// ─── 미분양담보대출 신청서 섹션 정의 (샘플 기준) ───

export const UNSOLD_COLLATERAL_SECTIONS: SectionRequirement[] = [
  {
    id: 'basic-terms',
    title: '1. 기본조건',
    samplePages: 'p1',
    required: true,
    fields: [
      { id: 'borrower-name', label: '차주명', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'loan-amount', label: '신청금액', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'loan-duration', label: '대출기간', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'repayment-method', label: '상환방법', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'interest-rate', label: '대출금리', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'ltv', label: 'LTV', sources: ['uploaded-pdf', 'auto-calc'], required: true },
      { id: 'fee', label: '수수료', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'collateral-type', label: '담보종류', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'purpose', label: '자금용도', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'repayment-source', label: '상환재원', sources: ['uploaded-pdf', 'manual'], required: true },
    ],
  },
  {
    id: 'syndicate',
    title: '대주단 구성',
    samplePages: 'p1',
    required: false,
    fields: [
      { id: 'tranche-structure', label: '트렌치 구조 (Tr.A/B/C)', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'lender-list', label: '대주 목록', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'tranche-amounts', label: '트렌치별 금액', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'seniority', label: '선순위/후순위 구분', sources: ['uploaded-pdf', 'manual'], required: false },
    ],
  },
  {
    id: 'funding-structure',
    title: '자금조달 및 지출구조',
    samplePages: 'p1',
    required: true,
    fields: [
      { id: 'cash-in', label: 'Cash In (조달)', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'cash-out', label: 'Cash Out (지출)', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'funding-detail', label: '조달/지출 상세 비율', sources: ['uploaded-pdf', 'manual'], required: false },
    ],
  },
  {
    id: 'loan-conditions',
    title: '2. 여신조건 상세',
    samplePages: 'p2',
    required: true,
    fields: [
      { id: 'collateral-security', label: '채권보전사항', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'precedent-conditions', label: '인출선행조건', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'subsequent-conditions', label: '인출후행조건', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'covenants', label: '여신조건/약정사항', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'acceleration-events', label: '기한이익상실사유', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'disbursement-conditions', label: '자금집행 조건', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'ltv-maintenance', label: 'LTV 유지비율 및 관리기준', sources: ['uploaded-pdf', 'auto-calc'], required: false },
    ],
  },
  {
    id: 'opinion',
    title: '3. 신청점 종합의견',
    samplePages: 'p2',
    required: true,
    fields: [
      { id: 'deal-overview', label: '대출개요', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'pros', label: '장점', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'cons', label: '단점/리스크', sources: ['uploaded-pdf', 'manual'], required: true },
    ],
  },
  {
    id: 'collateral-analysis',
    title: '■ 담보분석',
    samplePages: 'p3-7',
    required: true,
    fields: [
      { id: 'collateral-location', label: '소재지', sources: ['uploaded-pdf', 'appraisal', 'manual'], required: true },
      { id: 'appraiser', label: '감정기관/감정일', sources: ['appraisal', 'uploaded-pdf'], required: true },
      { id: 'appraisal-value', label: '감정가', sources: ['appraisal', 'uploaded-pdf'], required: true },
      { id: 'collateral-ltv', label: '담보인정비율/LTV', sources: ['auto-calc', 'uploaded-pdf'], required: true },
      { id: 'unit-list', label: '호실별 상세 (면적, 분양가, 감정가, LTV)', sources: ['uploaded-excel', 'appraisal'], required: true },
      { id: 'priority-structure', label: '선순위 현황', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'location-map', label: '위치도', sources: ['manual'], required: false },
      { id: 'site-photos', label: '현장사진', sources: ['manual'], required: false },
    ],
  },
  {
    id: 'auction-stats',
    title: '경매통계',
    samplePages: 'p4',
    required: false,
    fields: [
      { id: 'auction-rate-12m', label: '12개월 낙찰가율', sources: ['appraisal', 'manual'], required: false },
      { id: 'auction-rate-6m', label: '6개월 낙찰가율', sources: ['appraisal', 'manual'], required: false },
      { id: 'auction-rate-3m', label: '3개월 낙찰가율', sources: ['appraisal', 'manual'], required: false },
      { id: 'min-auction-value', label: '최소낙찰가 산정', sources: ['auto-calc'], required: false },
    ],
  },
  {
    id: 'comparables',
    title: '비준사례',
    samplePages: 'p8-9',
    required: false,
    fields: [
      { id: 'comparable-list', label: '인근 거래사례', sources: ['appraisal', 'manual'], required: false },
      { id: 'comparable-map', label: '거래사례 위치도', sources: ['manual'], required: false },
      { id: 'nearby-developments', label: '인근 지식산업센터/아파트 현황', sources: ['manual'], required: false },
      { id: 'market-price-comparison', label: '시세 비교분석', sources: ['manual'], required: false },
    ],
  },
  {
    id: 'project-analysis',
    title: '■ 사업성분석',
    samplePages: 'p10-12',
    required: true,
    fields: [
      { id: 'project-name', label: '사업명', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'project-location', label: '소재지/대지면적', sources: ['uploaded-pdf', 'appraisal'], required: true },
      { id: 'building-info', label: '건축규모/연면적', sources: ['uploaded-pdf', 'appraisal'], required: true },
      { id: 'construction-progress', label: '공정률/사용검사일', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'supply-overview', label: '공급개요 (층별 호실수, 면적)', sources: ['uploaded-excel', 'uploaded-pdf'], required: true },
      { id: 'sales-status', label: '분양현황 (분양률, 미분양)', sources: ['uploaded-pdf', 'uploaded-excel'], required: true },
      { id: 'sales-amount', label: '분양금액 현황 (납부완료/미납)', sources: ['uploaded-excel', 'uploaded-pdf'], required: true },
      { id: 'developer', label: '시행사/시공사', sources: ['uploaded-pdf', 'dart', 'manual'], required: true },
      { id: 'trust-structure', label: '신탁구조 (관리형토지신탁 등)', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'timeline', label: '진행일정 및 계획', sources: ['uploaded-pdf', 'manual'], required: false },
    ],
  },
  {
    id: 'project-pnl',
    title: '사업수지',
    samplePages: 'p17',
    required: false,
    fields: [
      { id: 'revenue-breakdown', label: '수입 항목별 금액/비율', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'cost-breakdown', label: '지출 항목별 금액/비율', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'project-margin', label: '시행이익률', sources: ['auto-calc', 'manual'], required: false },
      { id: 'unpaid-construction', label: '미지급 공사비 및 대여금', sources: ['uploaded-pdf', 'manual'], required: false },
      { id: 'trust-account-balance', label: '신탁계좌 잔액', sources: ['uploaded-pdf', 'manual'], required: false },
    ],
  },
  {
    id: 'sensitivity',
    title: '민감도분석 (EXIT 시나리오)',
    samplePages: 'p21',
    required: true,
    fields: [
      { id: 'scenario-by-sales-rate', label: '분양률별 LTV/대출잔액 시나리오', sources: ['auto-calc', 'manual'], required: true },
      { id: 'exit-scenario-9m', label: 'EXIT 시나리오 (9개월 후)', sources: ['auto-calc', 'manual'], required: false },
      { id: 'exit-scenario-21m', label: 'EXIT 시나리오 (21개월 후)', sources: ['auto-calc', 'manual'], required: false },
      { id: 'refinancing-feasibility', label: '타행대환 가능성 분석', sources: ['manual'], required: false },
    ],
  },
  {
    id: 'obligor-borrower',
    title: '■ 채무관련인 — 차주',
    samplePages: 'p22-23',
    required: true,
    fields: [
      { id: 'company-info', label: '기본정보 (사업자번호, 설립일, 주소 등)', sources: ['dart', 'uploaded-pdf'], required: true },
      { id: 'shareholders', label: '주주구성', sources: ['dart', 'manual'], required: false },
      { id: 'credit-rating', label: '신용등급', sources: ['dart', 'manual'], required: false },
      { id: 'bs', label: '재무상태표', sources: ['dart'], required: true },
      { id: 'is', label: '손익계산서', sources: ['dart'], required: true },
      { id: 'bs-analysis', label: 'BS 분석 코멘트', sources: ['auto-calc'], required: true },
      { id: 'is-analysis', label: 'IS 분석 코멘트', sources: ['auto-calc'], required: true },
      { id: 'related-party-tx', label: '기거래 및 관련여신', sources: ['manual'], required: false },
      { id: 'borrowings-detail', label: '차입금/보증채무 현황', sources: ['dart', 'manual'], required: true },
    ],
  },
  {
    id: 'obligor-guarantor',
    title: '■ 채무관련인 — 자금보증인/모회사',
    samplePages: 'p24-26',
    required: false,
    fields: [
      { id: 'guarantor-info', label: '보증인 기본정보', sources: ['dart', 'manual'], required: false },
      { id: 'guarantor-bs', label: '보증인 재무상태표', sources: ['dart'], required: false },
      { id: 'guarantor-is', label: '보증인 손익계산서', sources: ['dart'], required: false },
      { id: 'guarantor-subsidiaries', label: '지배구조/관계사 현황', sources: ['dart', 'manual'], required: false },
      { id: 'pfv-spc-borrowings', label: 'PFV/SPC 차입금 상세', sources: ['manual'], required: false },
      { id: 'guarantee-details', label: '보증채무 내역', sources: ['manual'], required: false },
      { id: 'dev-projects', label: '개발사업현황 (프로젝트별)', sources: ['manual'], required: false },
      { id: 'investment-recovery', label: '투자금 현황 및 회수일정', sources: ['manual'], required: false },
    ],
  },
  {
    id: 'interest-repayment',
    title: '■ 이자상환능력 및 리스크분석',
    samplePages: 'p30',
    required: true,
    fields: [
      { id: 'rate-calculation', label: '금리산출 및 적용', sources: ['uploaded-pdf', 'manual'], required: true },
      { id: 'interest-payment-analysis', label: '이자납입 분석', sources: ['auto-calc', 'manual'], required: true },
      { id: 'principal-repayment-analysis', label: '원금상환 분석 (EXIT 경매)', sources: ['auto-calc', 'manual'], required: true },
    ],
  },
  {
    id: 'risk-analysis',
    title: '리스크분석',
    samplePages: 'p31',
    required: true,
    fields: [
      { id: 'construction-risk', label: '시공사 및 공사 리스크', sources: ['manual', 'uploaded-pdf'], required: true },
      { id: 'interest-risk', label: '이자지급 리스크', sources: ['auto-calc', 'manual'], required: true },
      { id: 'sales-risk', label: '분양 및 가격 리스크', sources: ['manual', 'uploaded-pdf'], required: true },
      { id: 'collateral-risk', label: '담보가치 리스크', sources: ['manual', 'uploaded-pdf'], required: true },
    ],
  },
  {
    id: 'checklist',
    title: '■ 자체점검 Check List',
    samplePages: 'p31',
    required: true,
    fields: [
      { id: 'checklist-items', label: '점검항목별 결과', sources: ['auto-calc'], required: true },
    ],
  },
];

// ─── 완성도 체크 로직 ───

export interface CheckerInput {
  /** 업로드된 파일에서 추출한 전체 텍스트 */
  extractedText: string;
  /** 업로드된 파일 이름 목록 */
  fileNames: string[];
  /** DART 조회 결과 */
  dart: {
    hasCompanyInfo: boolean;
    hasFinancials: boolean;
    hasBorrowingNotes: boolean;
    years: string[];
  };
  /** 감정평가서 데이터 */
  appraisal?: {
    hasBasicInfo: boolean;
    hasUnitValues: boolean;
    hasAuctionStats: boolean;
    hasComparables: boolean;
  };
  /** 사용자 입력 필드 */
  manualFields?: Record<string, string>;
}

export function checkCompleteness(
  input: CheckerInput,
  sections: SectionRequirement[] = UNSOLD_COLLATERAL_SECTIONS,
): CompletenessReport {
  const text = input.extractedText;
  const sectionStatuses: SectionStatus[] = [];

  for (const section of sections) {
    const fieldStatuses: FieldStatus[] = [];

    for (const field of section.fields) {
      const status = checkField(field, input, text);
      fieldStatuses.push(status);
    }

    const total = fieldStatuses.length;
    const filled = fieldStatuses.filter(f => f.status === 'filled').length;
    const partial = fieldStatuses.filter(f => f.status === 'partial').length;
    const completeness = total > 0 ? Math.round((filled + partial * 0.5) / total * 100) : 0;

    sectionStatuses.push({
      sectionId: section.id,
      title: section.title,
      required: section.required,
      completeness,
      fields: fieldStatuses,
    });
  }

  // 전체 완성도
  const allFields = sectionStatuses.flatMap(s => s.fields);
  const totalFields = allFields.length;
  const filledFields = allFields.filter(f => f.status === 'filled').length;
  const partialFields = allFields.filter(f => f.status === 'partial').length;
  const overall = Math.round((filledFields + partialFields * 0.5) / totalFields * 100);

  // 필수 항목만
  const requiredSections = sectionStatuses.filter(s => s.required);
  const reqFields = requiredSections.flatMap(s => s.fields.filter((_, i) =>
    sections.find(sec => sec.id === s.sectionId)!.fields[i].required
  ));
  const reqFilled = reqFields.filter(f => f.status === 'filled').length;
  const reqPartial = reqFields.filter(f => f.status === 'partial').length;
  const requiredCompleteness = reqFields.length > 0
    ? Math.round((reqFilled + reqPartial * 0.5) / reqFields.length * 100)
    : 0;

  // 부족 데이터 제안
  const missingDataSuggestions = generateSuggestions(sectionStatuses, sections);

  return { overall, requiredCompleteness, sections: sectionStatuses, missingDataSuggestions };
}

// ─── 개별 필드 체크 ───

function checkField(field: FieldRequirement, input: CheckerInput, text: string): FieldStatus {
  const base: FieldStatus = { fieldId: field.id, label: field.label, status: 'missing' };

  // 1. manual 입력 우선
  if (input.manualFields?.[field.id]) {
    return { ...base, status: 'filled', source: 'manual', value: input.manualFields[field.id] };
  }

  // 2. 소스별 체크
  for (const source of field.sources) {
    const result = checkSource(field.id, source, input, text);
    if (result) return { ...base, ...result };
  }

  return base;
}

function checkSource(
  fieldId: string, source: DataSource, input: CheckerInput, text: string,
): Partial<FieldStatus> | null {
  switch (source) {
    case 'dart':
      return checkDartSource(fieldId, input);
    case 'uploaded-pdf':
    case 'uploaded-excel':
      return checkUploadedSource(fieldId, source, input, text);
    case 'appraisal':
      return checkAppraisalSource(fieldId, input);
    case 'auto-calc':
      return checkAutoCalcSource(fieldId, input);
    case 'manual':
      return null; // manual은 사용자 입력 대기
  }
}

function checkDartSource(fieldId: string, input: CheckerInput): Partial<FieldStatus> | null {
  const d = input.dart;
  switch (fieldId) {
    case 'company-info':
      return d.hasCompanyInfo ? { status: 'filled', source: 'dart', value: 'DART 기업정보' } : null;
    case 'bs': case 'is':
      return d.hasFinancials ? { status: 'filled', source: 'dart', value: `DART ${d.years.join(',')}` } : null;
    case 'borrowings-detail':
      return d.hasBorrowingNotes ? { status: 'filled', source: 'dart', value: 'DART 차입금 주석' } : null;
    case 'shareholders':
      return d.hasCompanyInfo ? { status: 'partial', source: 'dart', value: 'DART (주주구성 조회 필요)' } : null;
    case 'guarantor-info': case 'guarantor-bs': case 'guarantor-is':
      // 보증인 DART 조회는 보증인명이 있어야 가능
      return null;
    case 'developer':
      return d.hasCompanyInfo ? { status: 'partial', source: 'dart' } : null;
    default:
      return null;
  }
}

function checkUploadedSource(
  fieldId: string, source: DataSource, input: CheckerInput, text: string,
): Partial<FieldStatus> | null {
  const hasExcel = input.fileNames.some(f => /\.(xlsx|xls)$/i.test(f));
  const hasPdf = input.fileNames.some(f => /\.pdf$/i.test(f));

  if (source === 'uploaded-excel' && !hasExcel) return null;
  if (source === 'uploaded-pdf' && !hasPdf) return null;

  // 텍스트 기반 패턴 매칭
  const patterns: Record<string, { regex: RegExp; extract?: RegExp }> = {
    'borrower-name': { regex: /차주[:\s]*([^\n,]+)/ },
    'loan-amount': { regex: /(?:모집금액|대출금액|한도대출)[^0-9]*([\d,.]+)\s*억/ },
    'loan-duration': { regex: /(\d+)\s*개월/ },
    'interest-rate': { regex: /(?:금리|이자율|수익률)[^0-9]*([\d.]+)\s*%/ },
    'ltv': { regex: /LTV\s*([\d.]+)%/ },
    'collateral-type': { regex: /(?:주요\s*)?채권보전[:\s]*([^\n]+)/ },
    'purpose': { regex: /자금용도[:\s]*([^\n]+)/ },
    'repayment-source': { regex: /상환재원[:\s]*([^\n]+)/ },
    'repayment-method': { regex: /만기일시상환|원리금균등|원금균등/ },
    'fee': { regex: /수수료[:\s]*([\d.]+)%/ },
    'cash-in': { regex: /항목\s*금액/ },
    'cash-out': { regex: /항목\s*금액/ },
    'deal-overview': { regex: /대출개요/ },
    'pros': { regex: /장점/ },
    'cons': { regex: /단점/ },
    'collateral-location': { regex: /소재[지]?[:\s]*([^\n]+)/ },
    'collateral-security': { regex: /채권보전/ },
    'precedent-conditions': { regex: /인출\s*선행\s*조건|인출조건/ },
    'subsequent-conditions': { regex: /인출\s*후행\s*조건/ },
    'covenants': { regex: /약정|여신조건/ },
    'acceleration-events': { regex: /기한이익상실/ },
    'sales-status': { regex: /분양[률현황]|미분양/ },
    'sales-amount': { regex: /분양가[:\s]*([\d,.]+)/ },
    'project-name': { regex: /사업명[:\s]*([^\n]+)/ },
    'project-location': { regex: /소재지[:\s]*([^\n]+)/ },
    'construction-progress': { regex: /공정률|준공|사용검사/ },
    'developer': { regex: /시행사|시공사/ },
    'trust-structure': { regex: /관리형\s*토지\s*신탁|자금관리/ },
    'rate-calculation': { regex: /금리\s*산출|가산금리/ },
    'tranche-structure': { regex: /Tr\.\s*[A-C]|트렌치|선순위/ },
    'disbursement-conditions': { regex: /자금\s*집행|인출\s*한도/ },
    'ltv-maintenance': { regex: /LTV\s*유지|담보\s*관리/ },
    'unpaid-construction': { regex: /미지급\s*공사비/ },
    'trust-account-balance': { regex: /신탁\s*계좌|신탁계정/ },
    'building-info': { regex: /연면적|건축\s*규모|지상\s*\d+층/ },
    'supply-overview': { regex: /호실\s*수|공급\s*개요|층\s*별/ },
    'timeline': { regex: /진행\s*일정|공사\s*기간|착공/ },
    'construction-risk': { regex: /시공[사\s]*리스크|공사\s*리스크/ },
    'interest-risk': { regex: /이자[지급\s]*리스크/ },
    'sales-risk': { regex: /분양\s*리스크|가격\s*리스크/ },
    'collateral-risk': { regex: /담보\s*가치\s*리스크/ },
  };

  // 호실별 목록은 Excel에서
  if (fieldId === 'unit-list' && hasExcel) {
    // Excel에 호실 데이터가 있는지 (동, 호, 분양가 등 패턴)
    const hasUnits = /\d{3,4}호|\d동/.test(text);
    return hasUnits ? { status: 'filled', source: 'uploaded-excel', value: '호실 목록' } : null;
  }

  const pat = patterns[fieldId];
  if (!pat) return null;

  const match = text.match(pat.regex);
  if (match) {
    return {
      status: 'filled',
      source,
      value: match[1]?.trim().slice(0, 50) || '확인됨',
    };
  }

  return null;
}

function checkAppraisalSource(fieldId: string, input: CheckerInput): Partial<FieldStatus> | null {
  if (!input.appraisal) return null;
  const a = input.appraisal;

  switch (fieldId) {
    case 'appraiser': case 'appraisal-value': case 'collateral-location':
    case 'project-location': case 'building-info':
      return a.hasBasicInfo ? { status: 'filled', source: 'appraisal', value: '감정평가서' } : null;
    case 'unit-list':
      return a.hasUnitValues ? { status: 'filled', source: 'appraisal', value: '감정평가서 호실별' } : null;
    case 'auction-rate-12m': case 'auction-rate-6m': case 'auction-rate-3m':
      return a.hasAuctionStats ? { status: 'filled', source: 'appraisal', value: '감정평가서 경매통계' } : null;
    case 'comparable-list':
      return a.hasComparables ? { status: 'filled', source: 'appraisal', value: '감정평가서 비준사례' } : null;
    default:
      return null;
  }
}

function checkAutoCalcSource(fieldId: string, input: CheckerInput): Partial<FieldStatus> | null {
  switch (fieldId) {
    case 'bs-analysis': case 'is-analysis':
      return input.dart.hasFinancials ? { status: 'filled', source: 'auto-calc', value: '자동 생성' } : null;
    case 'checklist-items':
      return { status: 'filled', source: 'auto-calc', value: '자동 생성' };
    case 'ltv': case 'collateral-ltv':
      // LTV는 감정가 + 대출금액이 있으면 자동 계산
      return null; // 다른 소스에서 먼저 체크
    case 'scenario-by-sales-rate': case 'interest-payment-analysis': case 'principal-repayment-analysis':
      // 자동계산은 기본 데이터(금리, 금액, 분양가)가 있으면 가능
      return null; // 향후 구현
    case 'min-auction-value':
      return input.appraisal?.hasAuctionStats ? { status: 'filled', source: 'auto-calc' } : null;
    case 'interest-risk':
      return input.dart.hasFinancials ? { status: 'partial', source: 'auto-calc', value: 'EBITDA 기반' } : null;
    default:
      return null;
  }
}

// ─── 부족 데이터 제안 생성 ───

function generateSuggestions(
  statuses: SectionStatus[],
  sections: SectionRequirement[],
): MissingSuggestion[] {
  const suggestions: MissingSuggestion[] = [];
  const missingBySource = new Map<string, string[]>();

  for (const ss of statuses) {
    if (!ss.required || ss.completeness === 100) continue;
    const section = sections.find(s => s.id === ss.sectionId)!;
    for (let i = 0; i < ss.fields.length; i++) {
      if (ss.fields[i].status !== 'missing') continue;
      const field = section.fields[i];
      if (!field.required) continue;
      const primarySource = field.sources[0];
      const key = primarySource;
      if (!missingBySource.has(key)) missingBySource.set(key, []);
      missingBySource.get(key)!.push(`${ss.title}: ${field.label}`);
    }
  }

  // 소스별로 묶어서 제안
  if (missingBySource.has('uploaded-pdf')) {
    suggestions.push({
      dataType: '검토의견서 / IM / 대출계약서 PDF',
      description: '대출조건, 여신조건, 종합의견, 사업개요 등을 포함하는 PDF 업로드 필요',
      affectedSections: missingBySource.get('uploaded-pdf')!,
      priority: 'high',
    });
  }
  if (missingBySource.has('uploaded-excel')) {
    suggestions.push({
      dataType: '호실별 담보 목록 Excel',
      description: '호실번호, 전용면적, 분양가, 감정가 등이 포함된 Excel 업로드 필요',
      affectedSections: missingBySource.get('uploaded-excel')!,
      priority: 'high',
    });
  }
  if (missingBySource.has('appraisal')) {
    suggestions.push({
      dataType: '감정평가서 PDF',
      description: '감정가, 비준사례, 경매통계 등이 포함된 감정평가서 업로드 필요',
      affectedSections: missingBySource.get('appraisal')!,
      priority: 'medium',
    });
  }
  if (missingBySource.has('manual')) {
    suggestions.push({
      dataType: '수동 입력 필요',
      description: '현장사진, 위치도, 리스크분석 등 자동화 불가 항목',
      affectedSections: missingBySource.get('manual')!,
      priority: 'low',
    });
  }
  if (missingBySource.has('auto-calc')) {
    suggestions.push({
      dataType: '기초 데이터 부족 (자동 계산 불가)',
      description: '금리, 분양가, 감정가 등 기초 데이터가 있으면 자동 계산 가능',
      affectedSections: missingBySource.get('auto-calc')!,
      priority: 'medium',
    });
  }

  return suggestions;
}
