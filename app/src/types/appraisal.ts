export type PropertyType =
  | '아파트'
  | '지식산업센터'
  | '오피스텔'
  | '오피스'
  | '토지'
  | '근린생활시설'
  | '상가'
  | '기타';

export interface Address {
  sido: string;
  gugun: string;
  dong: string;
  detail: string;
  full: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: 'appraisal' | 'feasibility' | 'reference';
  file: File;
}

export interface CollateralItem {
  type: string;
  quantity: number;
  areaSqm: number;
  areaPyeong: number;
  appraisalValue: number;
  collateralRatio: number;
  priorClaims: number;
  availableValue: number;
  ltv: number;
}

export interface RightEntry {
  order: number;
  type: string;
  holder: string;
  principal: number;
  settingRatio: number;
  maxClaim: number;
  ltv: number;
}

export interface CollateralAnalysis {
  owner: string;
  trustee: string;
  appraiser: string;
  debtor: string;
  purpose: string;
  submittedTo: string;
  baseDate: string;
  serialNo: string;
  method: {
    comparison: number;
    cost: number;
    income: number;
  };
  appraisalValue: number;
  formRequirements: {
    officialAppraisal: boolean;
    signatureComplete: boolean;
    forFinancialUse: boolean;
    reused: boolean;
    reusedNote: string;
    conditional: boolean;
  };
  items: CollateralItem[];
  totalArea: number;
  totalAreaPyeong: number;
  collateralRatio: number;
  priorClaims: number;
  availableValue: number;
  ltv: number;
  rights: RightEntry[];
  remarks: string;
  opinion: string;
}

export interface AuctionStatRow {
  period: '12개월' | '6개월' | '3개월';
  regional: { rate: number; count: number };
  district: { rate: number; count: number };
  dong: { rate: number; count: number };
}

export interface AuctionStats {
  region: string;
  district: string;
  dong: string;
  propertyType: string;
  baseMonth: string;
  stats: AuctionStatRow[];
  source: string;
  retrievedAt: string;
}

export interface RecoveryEstimate {
  appraisalValue: number;
  appliedRate: number;
  appliedPeriod: string;
  appliedLevel: string;
  priorClaims: number;
  pariPassuShare: number;
  distributionAmount: number;
  recoveryAmount: number;
  lossAmount: number;
  opinion: string;
}

export interface SupplyRow {
  category: string;
  type: string;
  units: number;
  areaSqm: number;
  areaPyeong: number;
  pricePerPyeong: number;
  pricePerUnit: number;
  totalPrice: number;
  ratio: number;
}

export interface SalesStatusRow {
  type: string;
  totalUnits: number;
  totalAmount: number;
  soldUnits: number;
  soldAmount: number;
  unsoldUnits: number;
  unsoldAmount: number;
  salesRateUnits: number;
  salesRateAmount: number;
}

export interface SupplyOverview {
  project: {
    name: string;
    purpose: string;
    developer: string;
    constructor: string;
    address: string;
    zoning: string;
    landArea: { sqm: number; pyeong: number };
    buildingArea: { sqm: number; pyeong: number };
    grossArea: { sqm: number; pyeong: number };
    coverageRatio: number;
    floorAreaRatio: number;
    parking: number;
    scale: string;
    constructionPeriod: string;
    completionDate: string;
    salesRate: number;
  };
  supplyTable: SupplyRow[];
  salesStatus: SalesStatusRow[];
}

export interface CollateralDetailItem {
  no: number;
  unit: string;
  floor: string;
  areaSqm: number;
  areaPyeong: number;
  appraisalValue: number;
  planPrice: number;
  releaseCondition: number;
  appraisalPricePerPyeong: number;
  planPricePerPyeong: number;
  status: '분양' | '미분양' | '계약' | '잔금납부';
  remarks: string;
}

export interface ComparativeCase {
  type: '거래' | '평가';
  label: string;
  address: string;
  buildingName: string;
  unit: string;
  usage: string;
  purpose: string;
  source: string;
  areaSqm: number;
  areaPyeong: number;
  price: number;
  pricePerPyeong: number;
  baseDate: string;
}

/** 비준사례 건물 단위 (건물 정보 + 하위 거래/평가 행) */
export interface ComparativeBuilding {
  label: string;
  category: string;
  address: string;
  buildingName: string;
  landAreaSqm: number;
  grossAreaSqm: number;
  buildingAreaSqm: number;
  coverageFloorRatio: string;
  scale: string;
  approvalDate: string;
  source: string;
  transactions: ComparativeCase[];
  appraisals: ComparativeCase[];
}

/** 감정평가서 내 경매통계 인용 */
export interface AuctionQuote {
  region: string;
  period: string;
  rows: {
    usage: string;
    totalAppraisal: number;
    totalBid: number;
    bidRate: number;
    totalCases: number;
    bidCases: number;
    bidCaseRate: number;
  }[];
  source: string;
}

export interface RealTransactionRow {
  address: string;
  buildingName: string;
  areaSqm: number;
  price: number;
  pricePerPyeong: number;
  transactionDate: string;
  floor: string;
}

export interface LandPriceRow {
  address: string;
  pricePerSqm: number;
  year: number;
  changeRate: number;
}

export interface NearbyComplex {
  name: string;
  distance: string;
  source: string;
  areaSqm: number;
  pricePerPyeong: number;
  completionYear: number;
  salesRate: number;
}

export interface MarketAnalysis {
  location: {
    description: string;
    transportation: string;
    education: string;
    amenities: string;
  };
  realTransactions: {
    data: RealTransactionRow[];
    source: string;
    retrievedAt: string;
  };
  officialLandPrice: {
    data: LandPriceRow[];
    source: string;
    retrievedAt: string;
  };
  priceComparison: {
    description: string;
    nearbyComplexes: NearbyComplex[];
  };
}

export interface AppraisalCase {
  id: string;
  caseName: string;
  borrowerName: string;
  address: Address;
  propertyType: PropertyType;
  files: UploadedFile[];
  collateral: CollateralAnalysis;
  auctionStats: AuctionStats;
  recoveryEstimate: RecoveryEstimate;
  supply: SupplyOverview;
  collateralDetail: CollateralDetailItem[];
  comparatives: ComparativeCase[];
  marketAnalysis: MarketAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface AppraisalParseResult {
  collateral: Partial<CollateralAnalysis>;
  comparatives: ComparativeCase[];
  comparativeBuildings: ComparativeBuilding[];
  supply: Partial<SupplyOverview>;
  collateralDetail: CollateralDetailItem[];
  auctionQuote: AuctionQuote | null;
  valuationSummary: {
    comparisonTotal: number;
    incomeTotal: number;
    finalValue: number;
    method: string;
  } | null;
  confidence: Record<string, number>;
  warnings: string[];
}

export function createEmptyCase(): AppraisalCase {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    caseName: '',
    borrowerName: '',
    address: { sido: '', gugun: '', dong: '', detail: '', full: '' },
    propertyType: '아파트',
    files: [],
    collateral: {
      owner: '',
      trustee: '',
      appraiser: '',
      debtor: '',
      purpose: '',
      submittedTo: '',
      baseDate: '',
      serialNo: '',
      method: { comparison: 0, cost: 0, income: 0 },
      appraisalValue: 0,
      formRequirements: {
        officialAppraisal: false,
        signatureComplete: false,
        forFinancialUse: false,
        reused: false,
        reusedNote: '',
        conditional: false,
      },
      items: [],
      totalArea: 0,
      totalAreaPyeong: 0,
      collateralRatio: 0,
      priorClaims: 0,
      availableValue: 0,
      ltv: 0,
      rights: [],
      remarks: '',
      opinion: '',
    },
    auctionStats: {
      region: '',
      district: '',
      dong: '',
      propertyType: '',
      baseMonth: '',
      stats: [],
      source: '인포케어',
      retrievedAt: '',
    },
    recoveryEstimate: {
      appraisalValue: 0,
      appliedRate: 0,
      appliedPeriod: '3개월',
      appliedLevel: '',
      priorClaims: 0,
      pariPassuShare: 0,
      distributionAmount: 0,
      recoveryAmount: 0,
      lossAmount: 0,
      opinion: '',
    },
    supply: {
      project: {
        name: '',
        purpose: '',
        developer: '',
        constructor: '',
        address: '',
        zoning: '',
        landArea: { sqm: 0, pyeong: 0 },
        buildingArea: { sqm: 0, pyeong: 0 },
        grossArea: { sqm: 0, pyeong: 0 },
        coverageRatio: 0,
        floorAreaRatio: 0,
        parking: 0,
        scale: '',
        constructionPeriod: '',
        completionDate: '',
        salesRate: 0,
      },
      supplyTable: [],
      salesStatus: [],
    },
    collateralDetail: [],
    comparatives: [],
    marketAnalysis: {
      location: { description: '', transportation: '', education: '', amenities: '' },
      realTransactions: { data: [], source: '', retrievedAt: '' },
      officialLandPrice: { data: [], source: '', retrievedAt: '' },
      priceComparison: { description: '', nearbyComplexes: [] },
    },
    createdAt: now,
    updatedAt: now,
  };
}

// === 신청서 양식 자동화 v3 (2026-04-17) ===

export type ApplicationFormType = 'apartment-pf' | 'industrial-center' | 'land-pf';

export interface ParsedReportMeta {
  fileName: string;
  pages: number;
  appraiser?: string;
  baseDate?: string;
  parseStatus: 'ok' | 'partial' | 'failed';
}

export interface AppraisalData {
  source: {
    appraisalReports: ParsedReportMeta[];
    feasibilityReports: ParsedReportMeta[];
    parsedAt: string;
  };
  formType: ApplicationFormType;
  detectionConfidence: number;

  collateral: CollateralAnalysis;
  collateralDetail: CollateralDetailItem[];
  comparatives: ComparativeCase[];
  supply?: SupplyOverview;

  missingFields: string[];
}

export interface ReviewFinding {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  perspective: 'appraiser' | 'reviewer';
  category: string;
  message: string;
  detail?: string;
  sectionRef?: { sheet: string; cell: string };
  suggestedAction?: string;
}

export interface GenerateAppraisalResponse {
  success: boolean;
  excelBase64?: string;
  detectedType: ApplicationFormType;
  detectionConfidence: number;
  findings: ReviewFinding[];
  warnings: string[];
  fileName: string;
}

export function mapToApplicationFormType(pt: PropertyType): ApplicationFormType | null {
  switch (pt) {
    case '아파트': return 'apartment-pf';
    case '지식산업센터': return 'industrial-center';
    case '토지': return 'land-pf';
    default: return null;
  }
}
