export interface CompanyInfo {
  corpCode: string;
  corpName: string;
  stockCode?: string;
  modifyDate?: string;
}

export interface FinancialData {
  year: string;
  revenue: number;
  operatingProfit: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface RatioAnalysis {
  category: "안정성" | "수익성" | "성장성";
  name: string;
  value: number;
  unit: string;
  grade: "A" | "B" | "C" | "D";
}

export interface AppraisalResult {
  id: string;
  caseName: string;
  companyName?: string;
  fileName: string;
  uploadedAt: string;
  extractionStatus: {
    collateralSurvey: boolean;
    locationMap: boolean;
    comparativeCases: boolean;
    auctionStats: boolean;
  };
}

export interface Query {
  id: string;
  companyName: string;
  queryType: "재무조회" | "감정평가";
  createdAt: string;
  status: "완료" | "진행중" | "실패";
}

export interface FileRecord {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  type: "재무분석" | "감정평가" | "보고서" | "기타";
  downloadUrl: string;
}
