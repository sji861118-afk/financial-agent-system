import type { Worksheet, Cell, Border } from 'exceljs';

export const COLORS = {
  TITLE_BG: '595959',
  TITLE_FG: 'FFFFFF',
  HEADER_BG: 'D9E1F2',
  INPUT_REQUIRED: 'FFF2CC',
  AUTO_CALC: 'E2EFDA',
  ERROR_BG: 'FF0000',
  WARNING_BG: 'FFC000',
  INFO_BG: 'BFBFBF',
  SUBTITLE_FG: '808080',
} as const;

export const PLACEHOLDER = '_입력필요_';

export const NUMBER_FORMATS = {
  MILLION_KRW: '#,##0',
  AREA_SQM: '#,##0.00',
  PERCENT: '0.00%',
  DATE: 'yyyy-mm-dd',
} as const;

const THIN_BORDER: Partial<Border> = { style: 'thin', color: { argb: '000000' } };

export function applyTitle(ws: Worksheet, title: string, subtitle?: string): void {
  const titleCell = ws.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.TITLE_FG } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 24;

  if (subtitle) {
    const subCell = ws.getCell('A2');
    subCell.value = subtitle;
    subCell.font = { italic: true, size: 10, color: { argb: COLORS.SUBTITLE_FG } };
  }
}

export function applyHeader(ws: Worksheet, row: number, headers: string[], startCol = 1): void {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, startCol + i);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
  });
}

export function applyDataBorder(ws: Worksheet, row: number, colCount: number, startCol = 1): void {
  for (let i = 0; i < colCount; i++) {
    const cell = ws.getCell(row, startCol + i);
    cell.border = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
  }
}

export function markInputRequired(cell: Cell): void {
  cell.value = PLACEHOLDER;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.INPUT_REQUIRED } };
  cell.font = { italic: true, color: { argb: '808080' } };
}

export function markAutoCalc(cell: Cell, formula: string): void {
  cell.value = { formula } as never;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.AUTO_CALC } };
  cell.font = { bold: true };
}

export function applyFooter(ws: Worksheet, row: number, source: string): void {
  const cell = ws.getCell(row, 1);
  cell.value = `출처: ${source}`;
  cell.font = { size: 8, italic: true, color: { argb: COLORS.SUBTITLE_FG } };
}

export function setNumberFormat(cell: Cell, format: keyof typeof NUMBER_FORMATS): void {
  cell.numFmt = NUMBER_FORMATS[format];
}
