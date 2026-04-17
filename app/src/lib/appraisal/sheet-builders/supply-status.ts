import type { Workbook, Worksheet } from 'exceljs';
import type { SupplyOverview } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { applyTitle, applyHeader, applyDataBorder, applyFooter, markInputRequired, setNumberFormat } from './form-styles.ts';

export function buildSupplyStatusSheet(
  wb: Workbook,
  supply: SupplyOverview,
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('공급분양');
  applyTitle(ws, '공급개요 + 분양현황', `출처: ${sourceLabel}`);

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 30;

  // 사업 개요
  const p = supply.project as Record<string, unknown>;
  // 주의: p.constructor는 JS prototype property로 fallback되어 함수가 들어옴.
  // Object.hasOwn으로 실제 필드만 추출.
  const own = (key: string): string | number | undefined => {
    if (!Object.hasOwn(p, key)) return undefined;
    const v = p[key];
    if (v === undefined || v === null || typeof v === 'function') return undefined;
    if (typeof v === 'string' || typeof v === 'number') return v;
    return String(v);
  };
  const grossArea = own('grossArea') as { sqm?: number } | undefined;
  const labelValuePairs: [string, string | number | undefined][] = [
    ['사업명', own('name')],
    ['사업목적물', own('purpose')],
    ['시행사', own('developer')],
    ['시공사', own('constructor')],
    ['소재지', own('address')],
    ['용도지역', own('zoning')],
    ['연면적(㎡)', typeof grossArea === 'object' && grossArea ? grossArea.sqm : undefined],
    ['건폐율(%)', own('coverageRatio')],
    ['용적률(%)', own('floorAreaRatio')],
    ['주차대수', own('parking')],
    ['규모', own('scale')],
    ['공사기간', own('constructionPeriod')],
    ['준공일', own('completionDate')],
    ['분양률(%)', own('salesRate')],
  ];

  labelValuePairs.forEach((pair, i) => {
    const row = 4 + i;
    ws.getCell(row, 1).value = pair[0];
    ws.getCell(row, 1).font = { bold: true };
    if (pair[1] === undefined || pair[1] === null || pair[1] === '') {
      markInputRequired(ws.getCell(row, 2));
    } else {
      ws.getCell(row, 2).value = pair[1];
      if (typeof pair[1] === 'number') setNumberFormat(ws.getCell(row, 2), 'MILLION_KRW');
    }
    applyDataBorder(ws, row, 2);
  });

  // 분양현황 표
  const tableStart = 4 + labelValuePairs.length + 2;
  ws.getCell(tableStart, 1).value = '분양현황';
  ws.getCell(tableStart, 1).font = { bold: true, size: 12 };
  applyHeader(ws, tableStart + 1, ['타입', '세대수', '분양가(백만원)', '분양완료', '미분양', '분양률(%)']);

  const rows = supply.salesStatus ?? [];
  rows.forEach((r, i) => {
    const row = tableStart + 2 + i;
    ws.getCell(row, 1).value = r.type;
    ws.getCell(row, 2).value = r.totalUnits;
    ws.getCell(row, 3).value = r.totalAmount;
    setNumberFormat(ws.getCell(row, 3), 'MILLION_KRW');
    ws.getCell(row, 4).value = r.soldUnits;
    ws.getCell(row, 5).value = r.unsoldUnits;
    ws.getCell(row, 6).value = r.salesRateUnits;
    applyDataBorder(ws, row, 6);
  });

  applyFooter(ws, tableStart + 2 + rows.length + 2, sourceLabel);
  return ws;
}
