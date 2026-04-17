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

  // missing fields 추적 (중요 누락만)
  const missingFields: string[] = [];
  if (!collateral.appraiser) missingFields.push('collateral.appraiser');
  if (!collateral.baseDate) missingFields.push('collateral.baseDate');
  if (collateral.appraisalValue === 0) missingFields.push('collateral.appraisalValue');
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
    missingFields,
  };
}
