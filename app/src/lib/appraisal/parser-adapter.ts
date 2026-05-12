import type {
  AppraisalParseResult,
  AppraisalData,
  CollateralAnalysis,
  CollateralDetailItem,
  ComparativeCase,
  SupplyOverview,
  ApplicationFormType,
  ParsedReportMeta,
} from '@/types/appraisal';

const EMPTY_COLLATERAL: CollateralAnalysis = {
  owner: '', trustee: '', appraiser: '', debtor: '',
  purpose: '', submittedTo: '', baseDate: '', serialNo: '',
  method: { comparison: 0, cost: 0, income: 0 },
  appraisalValue: 0,
  formRequirements: {
    officialAppraisal: false, signatureComplete: false,
    forFinancialUse: false, reused: false, reusedNote: '', conditional: false,
  },
  items: [],
  totalArea: 0, totalAreaPyeong: 0,
  collateralRatio: 0, priorClaims: 0, availableValue: 0, ltv: 0,
  rights: [],
  remarks: '', opinion: '',
};

export function adaptParserResult(
  parsed: AppraisalParseResult,
  formType: ApplicationFormType,
  detectionConfidence: number,
  appraisalMetas: ParsedReportMeta[],
  feasibilityMetas: ParsedReportMeta[],
  feasibilityParsed?: AppraisalParseResult | null,
): AppraisalData {
  const collateral: CollateralAnalysis = { ...EMPTY_COLLATERAL, ...(parsed.collateral as Partial<CollateralAnalysis>) };
  // method 누락 시 기본값
  if (!collateral.method) collateral.method = { comparison: 0, cost: 0, income: 0 };
  // rights/items 누락 시 빈 배열
  if (!Array.isArray(collateral.rights)) collateral.rights = [];
  if (!Array.isArray(collateral.items)) collateral.items = [];

  const collateralDetail: CollateralDetailItem[] = Array.isArray(parsed.collateralDetail) ? parsed.collateralDetail : [];
  const comparatives: ComparativeCase[] = Array.isArray(parsed.comparatives) ? parsed.comparatives : [];

  // === Derived 값 보강: 누락 필드를 collateralDetail에서 합산하여 보완 ===
  // 감수 에이전트가 false-positive를 내지 않도록 detail에서 도출 가능한 값은 채워줌.
  if (collateralDetail.length > 0) {
    if (collateral.totalArea === 0) {
      collateral.totalArea = collateralDetail.reduce((s, d) => s + (d.areaSqm ?? 0), 0);
    }
    if (collateral.totalAreaPyeong === 0) {
      collateral.totalAreaPyeong = collateralDetail.reduce((s, d) => s + (d.areaPyeong ?? 0), 0);
    }
    if (collateral.appraisalValue === 0) {
      collateral.appraisalValue = collateralDetail.reduce((s, d) => s + (d.appraisalValue ?? 0), 0);
    }
  }

  // supply는 사업성보고서 우선, 없으면 감평서의 propertyOverview
  let supply: SupplyOverview | undefined;
  const supplyRaw = (feasibilityParsed?.supply ?? parsed.supply) as Partial<SupplyOverview> | undefined;
  if (supplyRaw && Object.keys(supplyRaw).length > 0) {
    supply = {
      project: supplyRaw.project ?? {} as SupplyOverview['project'],
      supplyTable: supplyRaw.supplyTable ?? [],
      salesStatus: supplyRaw.salesStatus ?? [],
    };
  }

  // === 누락 필드 추적 — 감수 에이전트가 "데이터 없음" vs "실제 위반" 구분에 사용 ===
  const missingFields: string[] = [];
  // 평가방법은 합계가 100이 아니면 추출 실패로 간주 (실제 평가서는 합계 100%)
  const methodSum = collateral.method.comparison + collateral.method.cost + collateral.method.income;
  if (Math.abs(methodSum - 100) > 1) missingFields.push('collateral.method');
  if (!collateral.appraiser) missingFields.push('collateral.appraiser');
  if (!collateral.baseDate) missingFields.push('collateral.baseDate');
  if (collateral.appraisalValue === 0) missingFields.push('collateral.appraisalValue');
  if (collateral.totalArea === 0) missingFields.push('collateral.totalArea');
  if (collateral.ltv === 0) missingFields.push('collateral.ltv');
  if (collateral.priorClaims === 0 && collateral.rights.length === 0) {
    missingFields.push('collateral.priorClaims');
  }
  if (collateral.rights.length === 0) missingFields.push('collateral.rights');
  if (collateralDetail.length === 0) missingFields.push('collateralDetail');
  if (comparatives.length === 0) missingFields.push('comparatives');

  return {
    source: {
      appraisalReports: appraisalMetas,
      feasibilityReports: feasibilityMetas,
      parsedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    },
    formType,
    detectionConfidence,
    collateral,
    collateralDetail,
    comparatives,
    supply,
    landTradeCases: parsed.landTradeCases ?? [],
    landAppraisalCases: parsed.landAppraisalCases ?? [],
    unitTradeCases: parsed.unitTradeCases ?? [],
    unitAppraisalCases: parsed.unitAppraisalCases ?? [],
    missingFields,
  };
}
