/**
 * DealDataset — v5 DOCX 생성기의 유일한 입력 모델
 * ParsedFileData + DART 데이터를 통합한 중간 모델
 */

// ─── 최상위 모델 ──────────────────────────────────────────────────────────
export interface DealDataset {
  deal: DealOverview;
  borrower: BorrowerProfile;
  subsidiary: SubsidiaryProfile | null;
  valuation: ValuationDataset | null;
  financials: FinancialsDataset;
  borrowings: BorrowingsDataset;
  cashflow: CashflowDataset | null;
  provisions: ProvisionDataset | null;
  guarantor: GuarantorDataset | null;
  opinion: OpinionDataset;
  risks: RiskDataset;
  checklist: ChecklistItem[];
}

// ─── 딜 개요 ──────────────────────────────────────────────────────────────
export interface TrancheInfo {
  name: string;        // "Tr.A"
  lender: string;      // "당행"
  amount: number;      // 8000 (백만원)
  rate: string;        // "5.50%"
  duration: string;    // "24개월"
  fee: number;         // 700 (백만원)
  aic: string;         // "9.88%"
  annualInterest: number; // 440 (백만원)
}

export interface ConditionSet {
  securityItems: string[];
  precedentConditions: string[];
  subsequentConditions: string[];
  accelerationEvents: string[];
}

export interface FundUsage {
  cashIn: { item: string; amount: number }[];
  cashOut: { item: string; amount: number }[];
}

export interface FundingStructure {
  items: { category: string; amount: number; ratio: string }[];
}

export interface DealOverview {
  borrowerName: string;
  totalAmount: number;           // 30000 (백만원)
  purpose: string;
  repaymentSource: string;
  repaymentMethod: string;       // "만기일시상환(24개월)"
  interestPayment: string;       // "매 1개월 또는 3개월 후취"
  guarantorName: string;         // "심형석 대표이사"
  collateralType: string;        // "지분담보(근질권)"
  creditClassification: string;  // "정상"
  duration: number;              // 24 (개월)
  tranches: TrancheInfo[];
  conditions: ConditionSet;
  fundUsage: FundUsage;
  fundingStructure: FundingStructure | null;
  overviewText: string;          // 신청개요 본문 (□ 첫번째 단락)
  keyMetrics: string[];          // ▶ 핵심 재무지표 bullet 리스트
  keyMetricsNote: string;        // ※ 주석
  departmentName: string;        // "기업금융1본부"
}

// ─── 차주 프로필 ──────────────────────────────────────────────────────────
export interface BorrowerProfile {
  name: string;
  representative: string;
  businessNumber: string;        // "110-81-88656"
  corporateNumber: string;       // "110111-4244094"
  establishedDate: string;       // "2009.12.17"
  industry: string;
  address: string;
  companyType: string;           // "비상장/외감"
  employees: string;             // "34명"
  capital: string;               // "3,624백만원"
  fiscalMonth: string;           // "12월"
  shareholders: ShareholderEntry[];
  // BS/IS 데이터 (연도별)
  bsData: FinancialRow[];
  isData: FinancialRow[];
  // 영업현황
  operatingStatus: OperatingStatusItem[];
  // 연결 재무
  consolidatedBs: FinancialRow[] | null;
  consolidatedIs: FinancialRow[] | null;
}

export interface ShareholderEntry {
  name: string;
  stockType: string;      // "보통주"
  shares: string;          // "366,395"
  ratio: string;           // "63.09%"
}

export interface FinancialRow {
  label: string;           // "현금및예치금"
  values: Record<string, string>;  // { "FY21": "11,207", "FY22": "6,946", ... }
  bold?: boolean;
  shading?: string;
}

// ─── 자회사 프로필 ────────────────────────────────────────────────────────
export interface SubsidiaryProfile {
  name: string;
  representative: string;
  establishedDate: string;
  industry: string;
  relationship: string;    // "테크메이트코리아대부(주) 100% 자회사"
  companyType: string;
  address: string;
  bsData: FinancialRow[];
  isData: FinancialRow[];
  analysisComment: string;
}

// ─── 가치산정 ─────────────────────────────────────────────────────────────
export interface ValuationDataset {
  appraiser: string;             // "삼일회계법인 (PwC)"
  method: string;                // "FCFE (Free Cash Flow to Equity) DCF"
  baseDate: string;              // "2025.12.31 (가결산 기준)"
  summaryText: string;           // Valuation Summary 서술
  // 할인율
  ke: string;                    // "14.78%"
  keComponents: {
    rf: string;                  // "3.39%"
    mrp: string;                 // "8.00%"
    betaL: string;               // "0.841"
    betaU: string;               // "0.342"
    deRatio: string;             // "187.44%"
    taxRate: string;             // "22%"
    sizePremium: string;         // "4.66%"
  };
  perpetualGrowthRate: string;   // "1.00%"
  // 가치
  pvOfFcfe: string;              // "(7,575) 백만원"
  terminalValue: string;         // "54,366 백만원"
  operatingValue: string;        // "46,790 백만원"
  youmeEquityValue: string;      // "70,938 백만원"
  otherInvestment: string;       // "16,889 백만원"
  nonOperatingValue: string;     // "87,827 백만원"
  equityValue: string;           // "134,617 백만원 (약 1,346억원)"
  equityValueNum: number;        // 134617
  // Peer Group
  peerGroup: PeerEntry[];
  // FCFE 추정
  fcfeHeaders: string[];     // ["FY23", "FY24", "FY25", "FY26E", ...]
  tmFcfe: FcfeRow[];
  ymFcfe: FcfeRow[];
  tmFcfeNotes: string[];         // ※ 주석
  ymFcfeNotes: string[];
  // 민감도
  operatingSensitivity: SensitivityTable;
  equitySensitivity: EquitySensitivityRow[];
  // 담보지분
  collateralItems: CollateralItem[];
  totalCollateralValue: number;  // 183441
  ltv: string;                   // "22.3%"
  ltvNote: string;               // ※ Sensitivity 최저 기준 LTV 주석
}

export interface PeerEntry {
  company: string;
  deRatio: string;
  betaL: string;
  betaU: string;
}

export interface FcfeRow {
  label: string;       // "영업수익"
  values: string[];    // ["27,156", "46,732", ...] — 연도순
}

export interface SensitivityTable {
  rowHeaders: string[];     // Ke 값들 ["13.78%", ...]
  colHeaders: string[];     // g 값들 ["0.0%", ...]
  values: string[][];       // [row][col]
}

export interface EquitySensitivityRow {
  scenario: string;          // "Bull (+20%)"
  equityValue: string;
  youmeShare: string;
  techShare: string;
  totalCollateral: string;
  ltv: string;
}

export interface CollateralItem {
  company: string;           // "유미캐피탈대부"
  pledger: string;           // "테크메이트코리아대부"
  stockType: string;         // "보통주"
  shares: string;            // "294,000주"
  ratio: string;             // "100%"
  value: string;             // "70,938"
  valuationMethod: string;   // "삼일PwC FCFE DCF"
}

// ─── 재무 데이터셋 ────────────────────────────────────────────────────────
export interface FinancialsDataset {
  years: string[];           // ["FY21", "FY22", "FY23", "FY24", "FY25"]
  // 재무분석 코멘트 (6개 섹션)
  profitability: AnalysisSection;
  assetQuality: AnalysisSection;
  capitalStructure: AnalysisSection;
  fundingStructure: AnalysisSection;
  growth: AnalysisSection;
  comprehensiveRisk: AnalysisSection;
}

export interface AnalysisSection {
  title: string;             // "▶ ① 수익성 분석"
  paragraphs: string[];      // 서술형 코멘트 배열
}

// ─── 차입금 ───────────────────────────────────────────────────────────────
export interface BorrowingsDataset {
  totalAmount: number;       // 365693
  totalCount: number;        // 109
  institutionCount: number;  // 20+
  bySource: BorrowingSource[];
  // 영업현황
  operatingStatus: OperatingStatusItem[];
}

export interface BorrowingSource {
  source: string;     // "은행"
  count: string;      // "6건"
  balance: string;    // "6,011"
  avgRate: string;    // "6.30%"
}

export interface OperatingStatusItem {
  label: string;
  value: string;
}

// ─── 현금흐름 ─────────────────────────────────────────────────────────────
export interface CashflowDataset {
  tmCashflow: CashflowTable;
  ymCashflow: CashflowTable | null;
}

export interface CashflowTable {
  entityName: string;
  headers: string[];       // ["구분", "1Q", "2Q", "3Q", "4Q", "연간"]
  rows: CashflowRow[];
}

export interface CashflowRow {
  label: string;
  values: string[];
}

// ─── 충당금 ───────────────────────────────────────────────────────────────
export interface ProvisionDataset {
  tmProvision: ProvisionTable;
  ymProvision: ProvisionTable | null;
}

export interface ProvisionTable {
  entityName: string;
  headers: string[];       // ["구분", "FY23", "FY24", "FY25"]
  rows: ProvisionRow[];
}

export interface ProvisionRow {
  label: string;
  values: string[];
}

// ─── 보증인 ───────────────────────────────────────────────────────────────
export interface GuarantorDataset {
  name: string;
  birthDate: string;
  position: string;
  relationship: string;
  guaranteeScope: string;
  note: string;
  income: GuarantorIncomeTable | null;
}

export interface GuarantorIncomeTable {
  headers: string[];
  rows: { label: string; values: string[] }[];
}

// ─── 검토의견 ─────────────────────────────────────────────────────────────
export interface OpinionDataset {
  paragraphs: string[];      // 6개 □ 단락
}

// ─── 리스크 ───────────────────────────────────────────────────────────────
export interface RiskDataset {
  // 금리산출 (= tranches 기반, 별도 렌더링용)
  interestAnalysisText: string[];
  principalAnalysisText: string[];
  // 리스크 테이블
  riskItems: RiskItem[];
}

export interface RiskItem {
  risk: string;            // "담보가치 하락"
  description: string;     // "Equity Value 하락 시 LTV 상승 가능"
  mitigation: string;      // "Worst(-30%) 시나리오에서도 LTV 25.0%..."
}

// ─── 체크리스트 ───────────────────────────────────────────────────────────
export interface ChecklistItem {
  no: number;
  item: string;
  result: string;          // "확인완료" | "확인필요" | "미확정(가결산)"
}

export interface TbdItem {
  no: number;
  item: string;
  note: string;
}
