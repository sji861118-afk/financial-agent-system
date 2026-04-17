import type { Workbook, Worksheet } from 'exceljs';
import type { ReviewFinding } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { applyTitle, applyHeader, applyDataBorder, COLORS } from './form-styles.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { countBySeverity } from '../auditors/findings-helpers.ts';

export function buildAuditFindingsSheet(wb: Workbook, findings: ReviewFinding[], extractedAt: string): Worksheet {
  const ws = wb.addWorksheet('감수의견', { views: [{ state: 'frozen', ySplit: 4 }] });
  const counts = countBySeverity(findings);
  applyTitle(ws, '감수의견 종합', `ERROR ${counts.error}건 / WARNING ${counts.warning}건 / INFO ${counts.info}건  |  추출 시점: ${extractedAt}`);

  applyHeader(ws, 4, ['심각도', '관점', '카테고리', '메시지', '상세', '참조시트', '권고조치']);

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 50;
  ws.getColumn(5).width = 40;
  ws.getColumn(6).width = 18;
  ws.getColumn(7).width = 30;

  findings.forEach((f, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = f.severity;
    ws.getCell(row, 2).value = f.perspective === 'appraiser' ? '감정평가사' : '심사역';
    ws.getCell(row, 3).value = f.category;
    ws.getCell(row, 4).value = f.message;
    ws.getCell(row, 5).value = f.detail ?? '';
    ws.getCell(row, 6).value = f.sectionRef ? `${f.sectionRef.sheet}!${f.sectionRef.cell}` : '';
    ws.getCell(row, 7).value = f.suggestedAction ?? '';

    const sevColor = f.severity === 'ERROR' ? COLORS.ERROR_BG
                   : f.severity === 'WARNING' ? COLORS.WARNING_BG
                   : COLORS.INFO_BG;
    ws.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sevColor } };
    ws.getCell(row, 1).font = { bold: true, color: { argb: f.severity === 'INFO' ? '000000' : 'FFFFFF' } };
    applyDataBorder(ws, row, 7);
  });

  if (findings.length === 0) {
    ws.getCell(5, 1).value = '✓ 검토할 사항이 없습니다.';
    ws.mergeCells(5, 1, 5, 7);
  }

  return ws;
}
