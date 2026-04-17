import type { Workbook, Worksheet } from 'exceljs';
import type { ComparativeCase } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { applyTitle, applyHeader, applyDataBorder, applyFooter, setNumberFormat } from './form-styles.ts';

export function buildComparativesSheet(
  wb: Workbook,
  comparatives: ComparativeCase[],
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('비준사례');
  applyTitle(ws, '비준사례', `출처: ${sourceLabel}`);

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 30;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 14;
  ws.getColumn(7).width = 14;
  ws.getColumn(8).width = 18;
  ws.getColumn(9).width = 20;

  applyHeader(ws, 4, ['구분', '라벨', '소재지', '면적(㎡)', '평단가(백만원)', '거래일/기준시점', '평가목적', '출처', '비고']);

  // 거래사례 먼저, 평가사례 다음
  const trades = comparatives.filter(c => c.type === '거래');
  const evals = comparatives.filter(c => c.type === '평가');
  const ordered = [...trades, ...evals];

  ordered.forEach((c, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = c.type;
    ws.getCell(row, 2).value = c.label;
    ws.getCell(row, 3).value = c.address;
    ws.getCell(row, 4).value = c.areaSqm;
    setNumberFormat(ws.getCell(row, 4), 'AREA_SQM');
    ws.getCell(row, 5).value = c.pricePerPyeong;
    setNumberFormat(ws.getCell(row, 5), 'MILLION_KRW');
    ws.getCell(row, 6).value = c.baseDate;
    ws.getCell(row, 7).value = c.purpose ?? '';
    ws.getCell(row, 8).value = c.source;
    ws.getCell(row, 9).value = `${c.buildingName ?? ''} ${c.unit ?? ''}`.trim();
    applyDataBorder(ws, row, 9);
  });

  applyFooter(ws, 5 + ordered.length + 2, sourceLabel);
  return ws;
}
