import type { Workbook, Worksheet } from 'exceljs';
import type { CollateralAnalysis } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { applyTitle, applyHeader, applyDataBorder, applyFooter, markInputRequired, markAutoCalc, setNumberFormat } from './form-styles.ts';

export function buildCollateralSummarySheet(wb: Workbook, c: CollateralAnalysis, sourceLabel: string): Worksheet {
  const ws = wb.addWorksheet('담보분석');
  applyTitle(ws, '담보분석', `출처: ${sourceLabel}`);

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 18;

  // 담보물 표
  applyHeader(ws, 4, ['구분', '종류', '수량', '면적(㎡)', '감정가(백만원)', '담보가용가']);
  c.items.forEach((it, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = i + 1;
    ws.getCell(row, 2).value = it.type;
    ws.getCell(row, 3).value = it.quantity;
    ws.getCell(row, 4).value = it.areaSqm;
    setNumberFormat(ws.getCell(row, 4), 'AREA_SQM');
    ws.getCell(row, 5).value = it.appraisalValue;
    setNumberFormat(ws.getCell(row, 5), 'MILLION_KRW');
    ws.getCell(row, 6).value = it.availableValue;
    setNumberFormat(ws.getCell(row, 6), 'MILLION_KRW');
    applyDataBorder(ws, row, 6);
  });
  const subtotalRow = 5 + c.items.length;
  ws.getCell(subtotalRow, 1).value = '합계';
  ws.getCell(subtotalRow, 4).value = c.totalArea;
  setNumberFormat(ws.getCell(subtotalRow, 4), 'AREA_SQM');
  ws.getCell(subtotalRow, 5).value = c.appraisalValue;
  setNumberFormat(ws.getCell(subtotalRow, 5), 'MILLION_KRW');
  ws.getCell(subtotalRow, 6).value = c.availableValue;
  setNumberFormat(ws.getCell(subtotalRow, 6), 'MILLION_KRW');
  ws.getRow(subtotalRow).font = { bold: true };
  applyDataBorder(ws, subtotalRow, 6);

  // 평가정보 표
  const infoStart = subtotalRow + 3;
  applyHeader(ws, infoStart, ['구분', '평가기관', '평가기준일', '평가방법', 'LTV(%)', '비고']);
  ws.getCell(infoStart + 1, 1).value = '본건';
  ws.getCell(infoStart + 1, 2).value = c.appraiser ?? '';
  ws.getCell(infoStart + 1, 3).value = c.baseDate ?? '';
  ws.getCell(infoStart + 1, 4).value = `비교 ${c.method.comparison}% / 원가 ${c.method.cost}% / 수익 ${c.method.income}%`;
  ws.getCell(infoStart + 1, 5).value = c.ltv;
  ws.getCell(infoStart + 1, 6).value = c.remarks ?? '';
  applyDataBorder(ws, infoStart + 1, 6);

  // 권리현황
  const rightsStart = infoStart + 4;
  ws.getCell(rightsStart, 1).value = '권리현황';
  ws.getCell(rightsStart, 1).font = { bold: true };
  applyHeader(ws, rightsStart + 1, ['순위', '권리종류', '권리자', '원금', '설정비율', '채권최고액']);
  c.rights.forEach((r, i) => {
    const row = rightsStart + 2 + i;
    ws.getCell(row, 1).value = r.order;
    ws.getCell(row, 2).value = r.type;
    ws.getCell(row, 3).value = r.holder;
    ws.getCell(row, 4).value = r.principal;
    setNumberFormat(ws.getCell(row, 4), 'MILLION_KRW');
    ws.getCell(row, 5).value = r.settingRatio;
    ws.getCell(row, 6).value = r.maxClaim;
    setNumberFormat(ws.getCell(row, 6), 'MILLION_KRW');
    applyDataBorder(ws, row, 6);
  });

  // 회수예상가 계산 블록
  const recoveryStart = rightsStart + 2 + c.rights.length + 2;
  ws.getCell(recoveryStart, 1).value = '회수예상가 계산';
  ws.getCell(recoveryStart, 1).font = { bold: true, size: 12 };

  ws.getCell(recoveryStart + 1, 1).value = '감정가(백만원)';
  ws.getCell(recoveryStart + 1, 2).value = c.appraisalValue;
  setNumberFormat(ws.getCell(recoveryStart + 1, 2), 'MILLION_KRW');

  ws.getCell(recoveryStart + 2, 1).value = '낙찰가율(%)';
  markInputRequired(ws.getCell(recoveryStart + 2, 2));

  ws.getCell(recoveryStart + 3, 1).value = '회수액 = 감정가 × 낙찰가율';
  markAutoCalc(ws.getCell(recoveryStart + 3, 2),
    `B${recoveryStart + 1}*B${recoveryStart + 2}/100`);
  setNumberFormat(ws.getCell(recoveryStart + 3, 2), 'MILLION_KRW');

  ws.getCell(recoveryStart + 4, 1).value = '선순위(백만원)';
  ws.getCell(recoveryStart + 4, 2).value = c.priorClaims;
  setNumberFormat(ws.getCell(recoveryStart + 4, 2), 'MILLION_KRW');

  ws.getCell(recoveryStart + 5, 1).value = '당사 회수가';
  markAutoCalc(ws.getCell(recoveryStart + 5, 2),
    `B${recoveryStart + 3}-B${recoveryStart + 4}`);
  setNumberFormat(ws.getCell(recoveryStart + 5, 2), 'MILLION_KRW');

  applyFooter(ws, recoveryStart + 7, sourceLabel);

  return ws;
}
