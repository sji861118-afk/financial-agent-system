import ExcelJS from 'exceljs';
import type { AppraisalData, ReviewFinding, ApplicationFormType, GenerateAppraisalResponse } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { auditAsAppraiser } from './auditors/appraiser-auditor.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { auditAsReviewer } from './auditors/reviewer-auditor.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { buildApartmentPfWorkbook } from './property-templates/apartment-pf.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { buildIndustrialCenterWorkbook } from './property-templates/industrial-center.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { buildLandPfWorkbook } from './property-templates/land-pf.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { sanitizeWorksheet } from './sheet-builders/form-styles.ts';

export interface OrchestratorInput {
  data: AppraisalData;
  fileNamePrefix?: string;
}

export interface OrchestratorOutput {
  buffer: Buffer;
  findings: ReviewFinding[];
  fileName: string;
}

export async function generateAppraisalExcel(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const { data } = input;

  // 감수 단계 (per-auditor try/catch)
  const findings: ReviewFinding[] = [];
  try {
    findings.push(...auditAsAppraiser(data));
  } catch (e) {
    console.error('appraiser-auditor failed:', e);
  }
  try {
    findings.push(...auditAsReviewer(data));
  } catch (e) {
    console.error('reviewer-auditor failed:', e);
  }

  // 워크북 빌드
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OK저축은행 감정평가 자동화 도구';
  wb.created = new Date();

  const builderByType: Record<ApplicationFormType, (wb: ExcelJS.Workbook, d: AppraisalData, f: ReviewFinding[]) => void> = {
    'apartment-pf': buildApartmentPfWorkbook,
    'industrial-center': buildIndustrialCenterWorkbook,
    'land-pf': buildLandPfWorkbook,
  };

  builderByType[data.formType](wb, data, findings);

  // ExcelJS write 직전에 모든 워크시트의 undefined cell value를 ''로 정규화 (방어층)
  wb.eachSheet((ws) => sanitizeWorksheet(ws));

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);

  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13);
  const fileName = `appraisal_${input.fileNamePrefix ?? data.formType}_${ts}.xlsx`;

  return { buffer, findings, fileName };
}
