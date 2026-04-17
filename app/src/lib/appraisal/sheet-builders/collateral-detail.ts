import type { Workbook, Worksheet } from 'exceljs';
import type { CollateralDetailItem, ApplicationFormType } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { applyTitle, applyHeader, applyDataBorder, applyFooter, setNumberFormat } from './form-styles.ts';

const HEADERS_BY_TYPE: Record<ApplicationFormType, string[]> = {
  'apartment-pf':       ['No', '동', '호', '타입', '전용면적(㎡)', '공급면적(㎡)', '감정가(백만원)', '평단가(백만원)', '분양상태'],
  'industrial-center':  ['No', '동', '층', '호실', '전용면적(㎡)', '감정가(백만원)', '평단가(백만원)', '임대상태'],
  'land-pf':            ['No', '지번', '지목', '면적(㎡)', '면적(평)', '공시지가(백만원/㎡)', '감정가(백만원)', '용도지역'],
};

export function buildCollateralDetailSheet(
  wb: Workbook,
  items: CollateralDetailItem[],
  formType: ApplicationFormType,
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('상세담보현황');
  applyTitle(ws, '상세담보현황', `출처: ${sourceLabel}`);

  const headers = HEADERS_BY_TYPE[formType];
  applyHeader(ws, 4, headers);

  ws.getColumn(1).width = 6;
  for (let i = 2; i <= headers.length; i++) ws.getColumn(i).width = 14;

  // ExcelJS는 undefined cell value에서 'richText' 접근 에러 발생 → 모든 값 안전화
  const safe = (v: unknown): string | number => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number' && !Number.isFinite(v)) return '';
    if (typeof v === 'string' || typeof v === 'number') return v;
    return String(v);
  };

  items.forEach((it, i) => {
    const row = 5 + i;
    if (formType === 'apartment-pf') {
      const unit = it.unit ?? '';
      ws.getCell(row, 1).value = safe(it.no);
      ws.getCell(row, 2).value = safe(unit.split('-')[0] || '');
      ws.getCell(row, 3).value = safe(unit.split('-')[1] || unit);
      ws.getCell(row, 4).value = '';
      ws.getCell(row, 5).value = safe(it.areaSqm);
      ws.getCell(row, 6).value = '';
      ws.getCell(row, 7).value = safe(it.appraisalValue);
      ws.getCell(row, 8).value = safe(it.appraisalPricePerPyeong);
      ws.getCell(row, 9).value = safe(it.status);
    } else if (formType === 'industrial-center') {
      ws.getCell(row, 1).value = safe(it.no);
      ws.getCell(row, 2).value = '';
      ws.getCell(row, 3).value = safe(it.floor);
      ws.getCell(row, 4).value = safe(it.unit);
      ws.getCell(row, 5).value = safe(it.areaSqm);
      ws.getCell(row, 6).value = safe(it.appraisalValue);
      ws.getCell(row, 7).value = safe(it.appraisalPricePerPyeong);
      ws.getCell(row, 8).value = safe(it.status);
    } else { // land-pf
      ws.getCell(row, 1).value = safe(it.no);
      ws.getCell(row, 2).value = safe(it.unit);
      ws.getCell(row, 3).value = '';
      ws.getCell(row, 4).value = safe(it.areaSqm);
      ws.getCell(row, 5).value = safe(it.areaPyeong);
      ws.getCell(row, 6).value = safe(it.appraisalPricePerPyeong);
      ws.getCell(row, 7).value = safe(it.appraisalValue);
      ws.getCell(row, 8).value = '';
    }
    for (let c = 1; c <= headers.length; c++) {
      const cell = ws.getCell(row, c);
      if (typeof cell.value === 'number') setNumberFormat(cell, 'MILLION_KRW');
    }
    applyDataBorder(ws, row, headers.length);
  });

  // 합계
  const sumRow = 5 + items.length;
  ws.getCell(sumRow, 1).value = '합계';
  ws.getRow(sumRow).font = { bold: true };
  const sumArea = items.reduce((s, it) => s + (it.areaSqm ?? 0), 0);
  const sumValue = items.reduce((s, it) => s + (it.appraisalValue ?? 0), 0);
  if (formType === 'apartment-pf') {
    ws.getCell(sumRow, 5).value = sumArea;
    ws.getCell(sumRow, 7).value = sumValue;
  } else if (formType === 'industrial-center') {
    ws.getCell(sumRow, 5).value = sumArea;
    ws.getCell(sumRow, 6).value = sumValue;
  } else {
    ws.getCell(sumRow, 4).value = sumArea;
    ws.getCell(sumRow, 7).value = sumValue;
  }
  applyDataBorder(ws, sumRow, headers.length);

  applyFooter(ws, sumRow + 2, sourceLabel);
  return ws;
}
