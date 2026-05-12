/**
 * docx-js 헬퍼 함수 — gen-techmate-v5.mjs 헬퍼를 TypeScript로 이식
 */
import {
  Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, ShadingType, PageBreak,
  VerticalAlign, TableLayoutType, type IRunOptions,
} from 'docx';

// ─── 상수 ─────────────────────────────────────────────────────────────────
export const FONT = '맑은 고딕';
export const SZ = 18;           // 9pt default
export const SZ_TITLE = 28;
export const SZ_SECTION = 22;
export const GRAY = 'D9D9D9';
const BORDER_COLOR = '999999';

const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

// ─── TextRun ──────────────────────────────────────────────────────────────
interface TOptions {
  size?: number;
  bold?: boolean;
  italics?: boolean;
  color?: string;
  break?: number;
}

export function t(text: string, opts: TOptions = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size || SZ,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color,
    break: opts.break,
  });
}

// ─── Paragraph ────────────────────────────────────────────────────────────
interface POptions {
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  spacing?: { before?: number; after?: number };
  indent?: { left?: number; right?: number; firstLine?: number };
  heading?: any;
  size?: number;
  bold?: boolean;
  italics?: boolean;
  color?: string;
}

export function p(texts: string | TextRun | (string | TextRun)[], opts: POptions = {}): Paragraph {
  let runs: (string | TextRun)[];
  if (typeof texts === 'string') {
    runs = [t(texts, { size: opts.size, bold: opts.bold, italics: opts.italics, color: opts.color })];
  } else if (texts instanceof TextRun) {
    runs = [texts];
  } else {
    runs = texts;
  }
  const children = runs.map(r => (typeof r === 'string' ? t(r, { size: opts.size, bold: opts.bold }) : r));
  return new Paragraph({
    children,
    alignment: opts.alignment,
    spacing: opts.spacing || { after: 60 },
    indent: opts.indent,
    heading: opts.heading,
  });
}

export function emptyP(): Paragraph {
  return p('', { spacing: { after: 40 } });
}

// ─── TableCell ────────────────────────────────────────────────────────────
interface CellOptions {
  shading?: string;
  width?: number;
  bold?: boolean;
  size?: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  columnSpan?: number;
  rowSpan?: number;
}

export function cell(text: string | TextRun[], opts: CellOptions = {}): TableCell {
  const shading = opts.shading
    ? { type: ShadingType.SOLID, color: opts.shading, fill: opts.shading }
    : undefined;
  const width = opts.width
    ? { size: opts.width, type: WidthType.PERCENTAGE }
    : undefined;
  const cellMargins = { top: 20, bottom: 20, left: 40, right: 40 };
  const runs = Array.isArray(text)
    ? text
    : [t(String(text), { bold: opts.bold, size: opts.size })];
  return new TableCell({
    children: [
      p(runs, {
        alignment: opts.alignment || AlignmentType.CENTER,
        spacing: { after: 0 },
      }),
    ],
    shading,
    width,
    borders,
    verticalAlign: VerticalAlign.CENTER,
    margins: cellMargins,
    columnSpan: opts.columnSpan,
    rowSpan: opts.rowSpan,
  });
}

export function headerCell(text: string, opts: CellOptions = {}): TableCell {
  return cell(text, { ...opts, shading: GRAY, bold: true });
}

// ─── Table ────────────────────────────────────────────────────────────────
export function makeTable(rows: TableRow[]): Table {
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
  });
}

// ─── Row helpers ──────────────────────────────────────────────────────────
export function kvRow(key: string, value: string, opts: { keyWidth?: number; valWidth?: number; valAlign?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): TableRow {
  return new TableRow({
    children: [
      headerCell(key, { width: opts.keyWidth || 25, alignment: AlignmentType.CENTER }),
      cell(value, { width: opts.valWidth || 75, alignment: opts.valAlign || AlignmentType.LEFT }),
    ],
  });
}

export function kvTable(pairs: [string, string][], opts: { keyWidth?: number; valWidth?: number; valAlign?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Table {
  return makeTable(pairs.map(([k, v]) => kvRow(k, v, opts)));
}

interface DataRowOptions {
  bold?: boolean;
  shading?: string;
  alignments?: ((typeof AlignmentType)[keyof typeof AlignmentType])[];
  size?: number;
  centerAll?: boolean;
}

export function dataRow(values: string[], opts: DataRowOptions = {}): TableRow {
  return new TableRow({
    children: values.map((v, i) => {
      return cell(v, {
        bold: opts.bold,
        shading: opts.shading,
        alignment: opts.alignments?.[i] ?? AlignmentType.CENTER,
        size: opts.size,
      });
    }),
  });
}

export function headerRow(values: string[]): TableRow {
  return new TableRow({
    children: values.map(v => headerCell(v)),
  });
}

// ─── Layout helpers ───────────────────────────────────────────────────────
export function sectionTitle(num: string, title: string): Paragraph {
  return p([t(`${num}. ${title}`, { bold: true, size: SZ_SECTION })], { spacing: { before: 200, after: 100 } });
}

export function subTitle(text: string): Paragraph {
  return p([t(text, { bold: true, size: 20 })], { spacing: { before: 160, after: 80 } });
}

export function bullet(text: string): Paragraph {
  return p([t(`  • ${text}`)], { spacing: { after: 30 }, indent: { left: 200 } });
}

export function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}
