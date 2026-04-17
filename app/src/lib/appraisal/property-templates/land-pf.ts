import type { Workbook } from 'exceljs';
import type { AppraisalData, ReviewFinding } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { buildAuditFindingsSheet } from '../sheet-builders/audit-findings.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { buildCollateralSummarySheet } from '../sheet-builders/collateral-summary.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { buildCollateralDetailSheet } from '../sheet-builders/collateral-detail.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { buildComparativesSheet } from '../sheet-builders/comparatives.ts';

export function buildLandPfWorkbook(
  wb: Workbook,
  data: AppraisalData,
  findings: ReviewFinding[],
): void {
  const sourceLabel = sourceLabelFrom(data);
  buildAuditFindingsSheet(wb, findings, data.source.parsedAt);
  buildCollateralSummarySheet(wb, data.collateral, sourceLabel);
  buildCollateralDetailSheet(wb, data.collateralDetail, 'land-pf', sourceLabel);
  buildComparativesSheet(wb, data.comparatives, sourceLabel);
  // 공급/분양 시트는 토지PF에서 생략 (해당 없음)
}

function sourceLabelFrom(data: AppraisalData): string {
  const a = data.source.appraisalReports[0];
  return a ? `${a.appraiser ?? '감정평가서'} (${a.baseDate ?? data.source.parsedAt})` : '감정평가서';
}
