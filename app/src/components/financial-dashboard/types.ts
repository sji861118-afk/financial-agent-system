export interface DashboardCompanyInfo {
  corpCode: string;
  corpName: string;
  ceoNm: string;
  bizrNo: string;
  adres: string;
  estDt: string;
  indutyCode: string;
  stockCode: string;
  jurirNo?: string;
  accMt?: string;
  corpCls?: string;
}

export interface DashboardFinancialRow {
  account: string;
  depth?: number;
  noteRef?: string;
  [year: string]: string | number | undefined;
}

export interface DashboardRatioDetail {
  name: string;
  category: string;
  valuesStr: Record<string, string>;
  benchmark: number | string;
  benchmarkLabel?: string;
  trend: string;
  trendIcon: string;
  vsBenchmark: string;
  diagnosis: string;
  riskLevel: string;
}

export interface DashboardAnalysis {
  overallGrade: string;
  overallSummary: string;
  fsType: string;
  industryLabel: string;
  stability: DashboardRatioDetail[];
  profitability: DashboardRatioDetail[];
  growth: DashboardRatioDetail[];
  activity?: DashboardRatioDetail[];
  riskFactors: string[];
  opportunityFactors: string[];
  analystOpinion: string;
}

export interface DashboardAIAnalysis {
  executiveSummary: string;
  deepDiagnosis: string;
  riskAssessment: string;
  loanOpinion: string;
  creditOutlook: string;
  keyMetricsNarrative: string;
  aiModel: string;
}

export interface DashboardShareholder {
  name: string;
  stockType: string;
  shareCount: string;
  shareRatio: string;
  relation: string;
  remark: string;
}

export interface DashboardBorrowingDetail {
  category: string;
  lender: string;
  interestRate: string;
  maturityDate: string;
  currentAmount: string;
  previousAmount: string;
  currency: string;
}

export interface DashboardBorrowingNotes {
  title: string;
  details: DashboardBorrowingDetail[];
  totalCurrent: string;
  totalPrevious: string;
  fiscalYear: string;
}

export interface DashboardAuditOpinion {
  auditorName: string;
  opinionType: string;
  reportDate: string;
  fiscalYear: string;
}

export interface DashboardNiceRating {
  grade: string;
  gradeDate: string;
  gradeAgency: string;
  available: boolean;
}

export interface DashboardData {
  companyInfo: DashboardCompanyInfo;

  bsItems: DashboardFinancialRow[];
  isItems: DashboardFinancialRow[];
  cfItems?: DashboardFinancialRow[];
  ratios: Record<string, Record<string, string>>;
  hasOfs?: boolean;

  bsItemsCfs?: DashboardFinancialRow[];
  isItemsCfs?: DashboardFinancialRow[];
  cfItemsCfs?: DashboardFinancialRow[];
  ratiosCfs?: Record<string, Record<string, string>>;
  hasCfs?: boolean;

  years: string[];
  source: string;
  hasData: boolean;
  noDataReason?: string;

  analysis?: DashboardAnalysis;
  aiAnalysis?: DashboardAIAnalysis | null;
  geminiAnalysis?: DashboardAIAnalysis | null;

  niceRating?: DashboardNiceRating | null;
  shareholders?: DashboardShareholder[];
  borrowingNotes?: DashboardBorrowingNotes | null;
  auditOpinion?: DashboardAuditOpinion | null;

  filename?: string;
  fileSize?: number;
  excelBase64?: string | null;
}
