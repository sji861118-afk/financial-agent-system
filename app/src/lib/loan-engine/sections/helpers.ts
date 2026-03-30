// app/src/lib/loan-engine/sections/helpers.ts
import {
  Paragraph, Table, TableRow, TableCell, TextRun,
  AlignmentType, BorderStyle, WidthType, VerticalAlign,
  ShadingType, PageBreak,
} from 'docx';

// ─── Style Constants ───
export const FONT = '맑은 고딕';
export const FONT_SIZE = 18;        // 9pt = 18 half-points
export const FONT_SIZE_SMALL = 16;  // 8pt
export const FONT_SIZE_TITLE = 28;  // 14pt
export const FONT_SIZE_SECTION = 22; // 11pt
export const HEADER_SHADING = { type: ShadingType.SOLID, color: 'D9D9D9' };
export const TBD_COLOR = '0000FF';
export const CONFIRM_COLOR = 'FF0000';

const thinBorder = { style: BorderStyle.SINGLE, size: 1 };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

// ─── Formatting ───

export function fmt(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return '-';
  if (typeof num === 'string') {
    if (num.includes('TBD')) return '[TBD]';
    // Try to parse as number
    const parsed = Number(num.replace(/,/g, ''));
    if (!isNaN(parsed)) return parsed.toLocaleString('ko-KR');
    return num;
  }
  return num.toLocaleString('ko-KR');
}

export function pct(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return num.toFixed(2) + '%';
}

// ─── Cell Builders ───

interface CellOpts {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  width?: number;
  colspan?: number;
  rowspan?: number;
  bold?: boolean;
}

export function headerCell(text: string, opts: CellOpts = {}): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, font: FONT, size: FONT_SIZE })],
      alignment: opts.align || AlignmentType.CENTER,
    })],
    shading: HEADER_SHADING,
    borders,
    verticalAlign: VerticalAlign.CENTER,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.colspan,
    rowSpan: opts.rowspan,
  });
}

export function dataCell(text: string, opts: CellOpts = {}): TableCell {
  const str = String(text ?? '');
  let color: string | undefined;
  if (str.includes('[TBD')) color = TBD_COLOR;
  else if (str.includes('[확인필요')) color = CONFIRM_COLOR;

  // Auto-detect numeric alignment
  const isNumeric = typeof text === 'string' && /^[\d,.()\-]+[%원]?$/.test(text.replace(/\s/g, ''));
  const alignment = opts.align || (isNumeric ? AlignmentType.RIGHT : AlignmentType.LEFT);

  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: str, font: FONT, size: FONT_SIZE, bold: opts.bold, color })],
      alignment,
    })],
    borders,
    verticalAlign: VerticalAlign.CENTER,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.colspan,
    rowSpan: opts.rowspan,
  });
}

// ─── Paragraph Builders ───

export function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `■ ${text}`, bold: true, font: FONT, size: FONT_SIZE_SECTION })],
    spacing: { before: 300, after: 100 },
  });
}

export function subTitle(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, font: FONT, size: FONT_SIZE })],
    spacing: { before: 200, after: 80 },
  });
}

export function bodyText(text: string, opts: { color?: string } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, color: opts.color })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 60 },
  });
}

export function tbdText(text: string): Paragraph {
  return bodyText(text, { color: TBD_COLOR });
}

export function bulletText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `□ ${text}`, font: FONT, size: FONT_SIZE })],
    spacing: { after: 80 },
  });
}

export function emptyLine(): Paragraph {
  return new Paragraph({ children: [], spacing: { after: 60 } });
}

export function unitLabel(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE_SMALL })],
    alignment: AlignmentType.RIGHT,
    spacing: { after: 40 },
  });
}

export function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// ─── Table Builder ───

export function makeTable(rows: TableRow[], width = 100): Table {
  return new Table({ width: { size: width, type: WidthType.PERCENTAGE }, rows });
}

export function row(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells });
}

// ─── Shorthand aliases (matching sections-supplement.mjs style) ───

export const hc = headerCell;
export const dc = dataCell;
export function rc(text: string, opts: CellOpts = {}): TableCell {
  return dataCell(text, { ...opts, align: AlignmentType.RIGHT });
}
export function cc(text: string, opts: CellOpts = {}): TableCell {
  return dataCell(text, { ...opts, align: AlignmentType.CENTER });
}
