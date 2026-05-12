/**
 * 토지·구분건물 비준사례 시트 빌더 (4종)
 *
 * - 토지비준-거래사례: 감정평가서 P55-58 "㉡ 거래사례" 표
 * - 토지비준-평가사례: 감정평가서 P55-58 "㉠ 평가사례" 표
 * - 구분건물비준-거래사례: 감정평가서 P67 "■ 인근지역 구분건물 거래사례" 표
 * - 구분건물비준-평가사례: 감정평가서 P68 "■ 인근지역 구분건물 평가사례" 표
 *
 * 출력 형식 — 세로형 (rows = 사례), 본건 미포함 (PDF 원본 표 구조와 동일).
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { ComparativeCase } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { applyTitle, applyHeader, applyDataBorder, applyFooter, setNumberFormat } from './form-styles.ts';

const LAND_TRADE_HEADERS = ['No', '지번', '면적(㎡)', '지목', '용도지역', '이용상황', '형상', '도로조건', '거래일자', '실거래가액(원)', '사례단가(원/㎡)', '개별지가(원/㎡)'];
const LAND_APPRAISAL_HEADERS = ['No', '지번', '면적(㎡)', '지목', '용도지역', '이용상황', '형상', '도로조건', '기준시점', '평가목적', '사례단가(원/㎡)', '개별지가(원/㎡)'];
const UNIT_TRADE_HEADERS = ['No', '소재지', '명칭', '동/층/호', '전유면적(㎡)', '이용상황', '거래금액(원)', '전유면적 기준단가(원/㎡)', '거래시점', '사용승인일'];
const UNIT_APPRAISAL_HEADERS = ['No', '소재지', '명칭', '동/층/호', '전유면적(㎡)', '이용상황', '평가액(원)', '평가단가(원/㎡)', '기준시점', '평가목적', '사용승인일'];

const LAND_COL_WIDTHS = [6, 18, 12, 8, 10, 14, 10, 12, 12, 16, 14, 14];
const UNIT_COL_WIDTHS = [6, 14, 22, 22, 12, 22, 18, 16, 12, 12, 12];

function setColumnWidths(ws: Worksheet, widths: number[]): void {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

export function buildLandTradeSheet(
  wb: Workbook,
  cases: ComparativeCase[],
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('토지비준-거래사례');
  applyTitle(ws, '토지 비준사례 — 거래사례', `출처: ${sourceLabel}`);
  setColumnWidths(ws, LAND_COL_WIDTHS);
  applyHeader(ws, 4, LAND_TRADE_HEADERS);

  cases.forEach((c, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = c.label || String(i + 1);
    ws.getCell(row, 2).value = c.plotNumber ?? c.address ?? '';
    ws.getCell(row, 3).value = c.areaSqm;
    setNumberFormat(ws.getCell(row, 3), 'AREA_SQM');
    ws.getCell(row, 4).value = c.landCategory ?? '';
    ws.getCell(row, 5).value = c.zoning ?? '';
    ws.getCell(row, 6).value = c.usage ?? '';
    ws.getCell(row, 7).value = c.shape ?? '';
    ws.getCell(row, 8).value = c.roadCondition ?? '';
    ws.getCell(row, 9).value = c.baseDate ?? '';
    ws.getCell(row, 10).value = c.price || '';
    if (c.price) setNumberFormat(ws.getCell(row, 10), 'MILLION_KRW');
    ws.getCell(row, 11).value = c.pricePerPyeong || '';
    if (c.pricePerPyeong) setNumberFormat(ws.getCell(row, 11), 'MILLION_KRW');
    ws.getCell(row, 12).value = c.individualLandPrice ?? '';
    if (c.individualLandPrice) setNumberFormat(ws.getCell(row, 12), 'MILLION_KRW');
    applyDataBorder(ws, row, LAND_TRADE_HEADERS.length);
  });

  applyFooter(ws, 5 + cases.length + 2, sourceLabel);
  return ws;
}

export function buildLandAppraisalSheet(
  wb: Workbook,
  cases: ComparativeCase[],
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('토지비준-평가사례');
  applyTitle(ws, '토지 비준사례 — 평가사례', `출처: ${sourceLabel}`);
  setColumnWidths(ws, LAND_COL_WIDTHS);
  applyHeader(ws, 4, LAND_APPRAISAL_HEADERS);

  cases.forEach((c, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = c.label || String(i + 1);
    ws.getCell(row, 2).value = c.plotNumber ?? c.address ?? '';
    ws.getCell(row, 3).value = c.areaSqm;
    setNumberFormat(ws.getCell(row, 3), 'AREA_SQM');
    ws.getCell(row, 4).value = c.landCategory ?? '';
    ws.getCell(row, 5).value = c.zoning ?? '';
    ws.getCell(row, 6).value = c.usage ?? '';
    ws.getCell(row, 7).value = c.shape ?? '';
    ws.getCell(row, 8).value = c.roadCondition ?? '';
    ws.getCell(row, 9).value = c.baseDate ?? '';
    ws.getCell(row, 10).value = c.purpose ?? '';
    ws.getCell(row, 11).value = c.pricePerPyeong || '';
    if (c.pricePerPyeong) setNumberFormat(ws.getCell(row, 11), 'MILLION_KRW');
    ws.getCell(row, 12).value = c.individualLandPrice ?? '';
    if (c.individualLandPrice) setNumberFormat(ws.getCell(row, 12), 'MILLION_KRW');
    applyDataBorder(ws, row, LAND_APPRAISAL_HEADERS.length);
  });

  applyFooter(ws, 5 + cases.length + 2, sourceLabel);
  return ws;
}

export function buildUnitTradeSheet(
  wb: Workbook,
  cases: ComparativeCase[],
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('구분건물비준-거래사례');
  applyTitle(ws, '인근지역 구분건물 비준사례 — 거래사례', `출처: ${sourceLabel}`);
  setColumnWidths(ws, UNIT_COL_WIDTHS);
  applyHeader(ws, 4, UNIT_TRADE_HEADERS);

  cases.forEach((c, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = c.label || String(i + 1);
    ws.getCell(row, 2).value = c.plotNumber ?? c.address ?? '';
    ws.getCell(row, 3).value = c.buildingName ?? '';
    ws.getCell(row, 4).value = c.dongFloorUnit ?? c.unit ?? '';
    ws.getCell(row, 5).value = c.areaSqm;
    setNumberFormat(ws.getCell(row, 5), 'AREA_SQM');
    ws.getCell(row, 6).value = c.usage ?? '';
    ws.getCell(row, 7).value = c.price || '';
    if (c.price) setNumberFormat(ws.getCell(row, 7), 'MILLION_KRW');
    ws.getCell(row, 8).value = c.pricePerPyeong || '';
    if (c.pricePerPyeong) setNumberFormat(ws.getCell(row, 8), 'MILLION_KRW');
    ws.getCell(row, 9).value = c.baseDate ?? '';
    ws.getCell(row, 10).value = c.approvalDate ?? '';
    applyDataBorder(ws, row, UNIT_TRADE_HEADERS.length);
  });

  applyFooter(ws, 5 + cases.length + 2, sourceLabel);
  return ws;
}

export function buildUnitAppraisalSheet(
  wb: Workbook,
  cases: ComparativeCase[],
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('구분건물비준-평가사례');
  applyTitle(ws, '인근지역 구분건물 비준사례 — 평가사례', `출처: ${sourceLabel}`);
  setColumnWidths(ws, UNIT_COL_WIDTHS);
  applyHeader(ws, 4, UNIT_APPRAISAL_HEADERS);

  cases.forEach((c, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = c.label || String(i + 1);
    ws.getCell(row, 2).value = c.plotNumber ?? c.address ?? '';
    ws.getCell(row, 3).value = c.buildingName ?? '';
    ws.getCell(row, 4).value = c.dongFloorUnit ?? c.unit ?? '';
    ws.getCell(row, 5).value = c.areaSqm;
    setNumberFormat(ws.getCell(row, 5), 'AREA_SQM');
    ws.getCell(row, 6).value = c.usage ?? '';
    ws.getCell(row, 7).value = c.price || '';
    if (c.price) setNumberFormat(ws.getCell(row, 7), 'MILLION_KRW');
    ws.getCell(row, 8).value = c.pricePerPyeong || '';
    if (c.pricePerPyeong) setNumberFormat(ws.getCell(row, 8), 'MILLION_KRW');
    ws.getCell(row, 9).value = c.baseDate ?? '';
    ws.getCell(row, 10).value = c.purpose ?? '';
    ws.getCell(row, 11).value = c.approvalDate ?? '';
    applyDataBorder(ws, row, UNIT_APPRAISAL_HEADERS.length);
  });

  applyFooter(ws, 5 + cases.length + 2, sourceLabel);
  return ws;
}

/** 4개 시트 일괄 추가 — orchestrator에서 호출 */
export function buildExtendedComparativeSheets(
  wb: Workbook,
  data: {
    landTradeCases?: ComparativeCase[];
    landAppraisalCases?: ComparativeCase[];
    unitTradeCases?: ComparativeCase[];
    unitAppraisalCases?: ComparativeCase[];
  },
  sourceLabel: string,
): { sheetsCreated: string[] } {
  const created: string[] = [];
  if ((data.landTradeCases?.length ?? 0) > 0) {
    buildLandTradeSheet(wb, data.landTradeCases!, sourceLabel);
    created.push('토지비준-거래사례');
  }
  if ((data.landAppraisalCases?.length ?? 0) > 0) {
    buildLandAppraisalSheet(wb, data.landAppraisalCases!, sourceLabel);
    created.push('토지비준-평가사례');
  }
  if ((data.unitTradeCases?.length ?? 0) > 0) {
    buildUnitTradeSheet(wb, data.unitTradeCases!, sourceLabel);
    created.push('구분건물비준-거래사례');
  }
  if ((data.unitAppraisalCases?.length ?? 0) > 0) {
    buildUnitAppraisalSheet(wb, data.unitAppraisalCases!, sourceLabel);
    created.push('구분건물비준-평가사례');
  }
  return { sheetsCreated: created };
}
