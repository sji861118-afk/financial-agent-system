// app/src/lib/loan-engine/types.ts
import type { Paragraph, Table } from 'docx';

// ─── Loan Types ───

export type LoanType =
  | 'equity-pledge'       // 지분담보
  | 'pf-bridge'           // PF브릿지
  | 'unsold-collateral'   // 미분양담보
  | 'private-bond'        // 사모사채
  | 'construction';       // 공사비유동화

// ─── Section System ───

export type SectionContent = (Paragraph | Table)[];
export type SectionBuilder = (data: LoanApplication) => SectionContent | null;

export type SectionId =
  // Common
  | 'header' | 'overview' | 'basic-terms' | 'syndicate'
  | 'funding' | 'funding-plan'
  | 'conditions-security' | 'conditions' | 'security'
  | 'interest-rate' | 'structure' | 'opinion'
  | 'obligor-borrower' | 'borrowings' | 'obligor-related'
  | 'financial-opinion' | 'risk-analysis'
  | 'checklist' | 'tbd-summary'
  | 'PAGE_BREAK'
  // Plugins
  | 'plugin:equity-pledge'
  | 'plugin:collateral' | 'plugin:land-registry'
  | 'plugin:trigger' | 'plugin:interest-reserve' | 'plugin:equity-ratio'
  | 'plugin:sales-status' | 'plugin:sensitivity' | 'plugin:recovery'
  | 'plugin:term-sheet' | 'plugin:industry-compare'
  | 'plugin:credit-rating' | 'plugin:issuance-history'
  | 'plugin:construction';

export interface LoanTypeProfile {
  type: LoanType;
  sectionOrder: SectionId[];
  conditionsAndSecurity: 'merged' | 'separate';
}

// ─── Core Data Model ───

export interface LoanApplication {
  meta: ApplicationMeta;
  borrower: BorrowerInfo;
  loanTerms: LoanTerms;
  funding: FundingPlan;
  collateralSecurity: CollateralSecurityItem[];
  loanConditions: LoanConditions;
  syndicate?: SyndicateInfo;
  interestRate: InterestRateBreakdown;
  financials: {
    borrower: FinancialStatements;
    subsidiaries?: RelatedEntityFinancials[];
    relatedCompanies?: RelatedEntityFinancials[];
  };
  borrowings: BorrowingDetail[];
  typeSpecific: TypeSpecificData;
  aiContent: {
    opinion?: string;
    financialAnalysis?: string;
    riskAnalysis?: string;
  };
  unresolvedItems: UnresolvedItem[];
}

export type TypeSpecificData =
  | { type: 'equity-pledge'; data: EquityPledgeData }
  | { type: 'pf-bridge'; data: PFBridgeData }
  | { type: 'unsold-collateral'; data: UnsoldCollateralData }
  | { type: 'private-bond'; data: PrivateBondData }
  | { type: 'construction'; data: ConstructionFinanceData };

// ─── Sub-types ───

export interface ApplicationMeta {
  applicationDate: string;     // "2026-03-24"
  applicationType: '신규' | '기한연장' | '조건변경' | '증액' | '재신청' | '대환';
  branch: string;              // "기업금융1본부"
  officer?: string;
}

export interface BorrowerInfo {
  name: string;
  representative: string;
  businessNumber: string;       // 사업자번호
  corporateNumber?: string;     // 법인등록번호
  establishedDate: string;
  industry: string;
  address: string;
  companyType?: string;         // "비상장 / 외감"
  employeeCount?: number;
  capital?: number;             // 자본금 (백만원)
  fiscalMonth?: number;         // 결산월
  shareholders?: ShareholderInfo[];
  operatingStatus?: OperatingStatusItem[];
}

export interface ShareholderInfo {
  name: string;
  stockType: string;            // "보통주", "우선주"
  shares: number;
  ownershipPct: number;
  note?: string;
}

export interface OperatingStatusItem {
  label: string;
  value: string;
  note?: string;
}

export interface LoanTerms {
  loanType: LoanType;
  amount: number;               // 백만원
  durationMonths: number;
  repaymentMethod: string;
  repaymentDetail?: string;
  earlyRepaymentFee?: string;
  interestPayment?: string;
  rateType?: string;            // "고정" | "변동" | "TBD"
  ratePercent?: number;
  collateralType: string;
  purpose: string;
  repaymentSource: string;
  creditClassification: string;
  guarantor?: string;
}

export interface FundingPlan {
  cashIn: { item: string; amount: number }[];
  cashOut: { item: string; amount: number }[];
  detailedFunding?: {
    label: string;
    items: { category: string; amount: number; pct?: number; note?: string }[];
    total: number;
  };
}

export interface CollateralSecurityItem {
  no: number;
  description: string;
}

export interface LoanConditions {
  physical?: string[];          // 물적담보 조건
  personal?: string[];          // 인적담보 조건
  interestReserve?: string[];   // 이자유보 조건
  general?: string[];           // 기타 일반 조건
  approvalValidity?: string;    // 승인유효기간
}

export interface SyndicateInfo {
  totalAmount: number;
  tranches: TrancheInfo[];
}

export interface TrancheInfo {
  name: string;
  amount: number;
  rate?: number;
  participants: { name: string; amount: number; role?: string }[];
  conditions?: string[];
}

export interface InterestRateBreakdown {
  baseRate?: number;
  addOnRates?: { item: string; rate: number }[];
  totalCalculated?: number;
  adjustment?: number;
  adjustmentReason?: string;
  appliedRate?: number;
}

// ─── Financial Statements ───

export interface FinancialStatements {
  years: string[];              // ["22.12", "23.12", "24.12", "25.12"]
  balanceSheet: StatementLineItem[];
  incomeStatement: StatementLineItem[];
  ratios?: StatementLineItem[];
}

export interface StatementLineItem {
  account: string;
  values: Record<string, number | string | null>;  // year → value
  yoyChange?: string;
  bold?: boolean;
  indent?: number;
}

export interface RelatedEntityFinancials {
  entity: EntityInfo;
  detailLevel: 'full' | 'summary' | 'minimal';
  statements?: FinancialStatements;
  summaryRow?: FinancialSummaryRow;
  operatingStatus?: OperatingStatusItem[];
  borrowings?: BorrowingDetail[];
}

export interface EntityInfo {
  name: string;
  relationship: string;
  representative?: string;
  businessNumber?: string;
  corporateNumber?: string;
  establishedDate?: string;
  industry?: string;
  address?: string;
  companyType?: string;
  employeeCount?: number;
  capital?: number;
  shareholders?: ShareholderInfo[];
  note?: string;
}

export interface FinancialSummaryRow {
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  borrowings?: number;
  year?: string;
}

export interface BorrowingDetail {
  entityName: string;
  summary: BorrowingSummaryRow[];
  topLenders?: BorrowingLenderRow[];
  note?: string;
}

export interface BorrowingSummaryRow {
  category: string;
  count: number;
  balance: number;
  weightedAvgRate: string;
  maturityRange: string;
}

export interface BorrowingLenderRow {
  lender: string;
  type: string;
  balance: number;
  rate: string;
  maturity: string;
  repayment: string;
}

// ─── Type-Specific Data ───

export interface EquityPledgeData {
  pledgedEquities: PledgedEquityItem[];
  valuationStatus?: ValuationInfo[];
  collateralValue?: {
    valuationBasis: string;
    valuationAmount: number;
    ltv: number;
    note?: string;
  };
  unlistedValuation?: UnlistedStockValuation;
  guarantorIncome?: GuarantorIncome;
  cashFlow?: CashFlowData;
  provisioningRates?: ProvisioningData;
  consolidatedFinancials?: FinancialStatements;
}

export interface PledgedEquityItem {
  targetCompany: string;
  holder: string;
  stockType: string;
  shares: number;
  ownershipPct: number;
  appraiser?: string;
  valuationAmount?: number | string;  // number or "TBD"
  valuationDate?: string;
  note?: string;
}

export interface ValuationInfo {
  method: string;
  items: { label: string; value: string | number }[];
}

export interface UnlistedStockValuation {
  method: string;
  items: { label: string; value: string | number }[];
}

export interface GuarantorIncome {
  name: string;
  items: { label: string; value: string }[];
}

export interface CashFlowData {
  entities: CashFlowEntity[];
  consolidatedMetrics?: { label: string; value: string; note?: string }[];
}

export interface CashFlowEntity {
  name: string;
  source: string;
  period: string;
  quarters: string[];
  items: CashFlowLineItem[];
}

export interface CashFlowLineItem {
  label: string;
  values: (number | string)[];
  annual?: number | string;
  bold?: boolean;
  indent?: number;
}

export interface ProvisioningData {
  items: { category: string; values: Record<string, string | number> }[];
  years: string[];
}

export interface RiskAnalysisItem {
  category: string;
  analysis: string;
  likelihood: string;         // "● 낮음" | "● 보통" | "● 높음"
}

// ─── Placeholder types for future loan types ───

export interface PFBridgeData { [key: string]: unknown }
export interface UnsoldCollateralData { [key: string]: unknown }
export interface PrivateBondData { [key: string]: unknown }
export interface ConstructionFinanceData { [key: string]: unknown }

// ─── Unresolved Items ───

export interface UnresolvedItem {
  no: number;
  section: string;
  item: string;
  status: string;
}
