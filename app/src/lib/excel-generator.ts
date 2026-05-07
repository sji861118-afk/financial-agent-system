/**
 * 여신승인신청서 자동화 - Excel 출력 모듈 (TypeScript)
 *
 * 탭(시트) 구성:
 *   1. 요약               - 재무현황 분석 결과 요약
 *   2. 재무상태표(개별)    - DART 기준 재무상태표 (BS) 개별
 *   3. 손익계산서(개별)    - DART 기준 손익계산서 (IS) 개별
 *   4. 재무상태표(연결)    - 연결 BS (데이터 있을 때)
 *   5. 손익계산서(연결)    - 연결 IS (데이터 있을 때)
 *   6. 재무분석            - AI 기반 재무 분석 보고서
 *   7~10. 담보분석 placeholder sheets
 */

import * as ExcelJS from "exceljs";

// ============================================================
// Interfaces
// ============================================================

export interface StatementItem {
  account: string;
  depth?: number;
  [year: string]: string | number | undefined;
}

export interface RatioDetail {
  name: string;
  category: string;
  valuesStr: Record<string, string>;
  benchmark: string;
  trend: string;
  trendIcon: string;
  vsBenchmark: string;
  diagnosis: string;
  riskLevel: string;
}

export interface FinancialAnalysis {
  corpName: string;
  industryLabel: string;
  fsType: string;
  overallGrade: string;
  overallSummary: string;
  stability: RatioDetail[];
  profitability: RatioDetail[];
  growth: RatioDetail[];
  activity?: RatioDetail[];
  riskFactors: string[];
  opportunityFactors: string[];
  analystOpinion: string;
  years: string[];
}

export interface ExcelReportData {
  corpName: string;
  companyInfo?: {
    corpName: string;
    ceoNm: string;
    jurirNo: string;
    bizrNo: string;
    adres: string;
    estDt: string;
    stockCode: string;
    indutyCode: string;
    accMt: string;
    corpCls: string;
  };
  years: string[];
  bsItemsOfs: StatementItem[];
  isItemsOfs: StatementItem[];
  cfItemsOfs?: StatementItem[];
  bsItemsCfs: StatementItem[];
  isItemsCfs: StatementItem[];
  cfItemsCfs?: StatementItem[];
  ratiosOfs: Record<string, Record<string, string>>;
  ratiosCfs: Record<string, Record<string, string>>;
  hasOfs: boolean;
  hasCfs: boolean;
  source: string;
  analysis?: FinancialAnalysis;
  auditOpinion?: {
    auditorName: string;
    opinionType: string;
    reportDate: string;
    fiscalYear: string;
  } | null;
  shareholders?: Array<{
    name: string;
    stockType: string;
    shareCount: string;
    shareRatio: string;
    relation: string;
    remark: string;
  }>;
  borrowingNotes?: {
    title: string;
    details: Array<{
      category: string;
      lender: string;
      interestRate: string;
      maturityDate: string;
      currentAmount: string;
      previousAmount: string;
      currency: string;
    }>;
    totalCurrent: string;
    totalPrevious: string;
    fiscalYear: string;
    rawTableData?: string[][];
  } | null;
  yoyAnalysis?: Array<{
    account: string;
    stmtType: "BS" | "IS";
    curValue: number;
    prevValue: number;
    changeAmount: number;
    changePercent: number | null;
    noteNum: string;
    noteTitle: string;
    noteSource: string;
    noteDetail: string;
    briefRef: string;
  }>;
}

// ============================================================
// Style constants
// ============================================================

const FONT_NAME = "맑은 고딕";
const FONT_SIZE = 10;

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F172A" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: FONT_SIZE,
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const TITLE_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: 14,
  bold: true,
};

const SECTION_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: 12,
  bold: true,
};

const NORMAL_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: FONT_SIZE,
};

const SMALL_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: 9,
};

const SOURCE_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: 9,
  italic: true,
  color: { argb: "FF888888" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
  bottom: { style: "thin" },
};

const CENTER_ALIGN: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};

const LEFT_ALIGN: Partial<ExcelJS.Alignment> = {
  horizontal: "left",
  vertical: "middle",
  wrapText: true,
};

const RIGHT_ALIGN: Partial<ExcelJS.Alignment> = {
  horizontal: "right",
  vertical: "middle",
  wrapText: true,
};

const SUB_HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEEF2FF" },
};

const LABEL_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
};

const RATIO_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2EFDA" },
};

const MISSING_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
};

// Analysis-specific styles
const ANALYSIS_TITLE_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E79" },
};

const ANALYSIS_SECTION_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD6E4F0" },
};

const GRADE_FILLS: Record<string, ExcelJS.FillPattern> = {
  AAA: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } },
  AA: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } },
  A: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5F5D5" } },
  BBB: { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } },
  BB: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } },
  B: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } },
  CCC: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } },
  CC: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFDDB0" } },
  C: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } },
  D: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF9999" } },
};

const GOOD_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2EFDA" },
};

const WARN_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
};

const DANGER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFC7CE" },
};

const CATEGORY_HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF4" },
};

const RISK_BG_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2F2" },
};

const OPPORTUNITY_BG_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2FFF2" },
};

// ============================================================
// Helper functions
// ============================================================

function applyHeaderStyle(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  colStart: number,
  colEnd: number
): void {
  for (let col = colStart; col <= colEnd; col++) {
    const cell = ws.getCell(rowNum, col);
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = THIN_BORDER;
  }
}

function applyDataStyle(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  colStart: number,
  colEnd: number,
  isMissing = false
): void {
  for (let col = colStart; col <= colEnd; col++) {
    const cell = ws.getCell(rowNum, col);
    cell.font = NORMAL_FONT;
    cell.alignment = LEFT_ALIGN;
    cell.border = THIN_BORDER;
    if (isMissing) {
      cell.fill = MISSING_FILL;
    }
  }
}

function setColWidths(
  ws: ExcelJS.Worksheet,
  widths: Record<number, number>
): void {
  for (const [col, width] of Object.entries(widths)) {
    ws.getColumn(Number(col)).width = width;
  }
}

function writeSourceNote(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  col: number,
  sourceText: string
): void {
  const cell = ws.getCell(rowNum, col);
  cell.value = `※ 출처: ${sourceText}`;
  cell.font = SOURCE_FONT;
}

function writeMissingNote(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  col: number,
  note: string
): void {
  const cell = ws.getCell(rowNum, col);
  cell.value = note;
  cell.font = SOURCE_FONT;
  cell.fill = MISSING_FILL;
}

function formatEstDate(estDt: string): string {
  if (estDt && estDt.length === 8) {
    return `${estDt.slice(0, 4)}년 ${estDt.slice(4, 6)}월 ${estDt.slice(6)}일`;
  }
  return estDt || "-";
}


function writeSectionHeader(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  title: string,
  totalCols = 8
): number {
  ws.mergeCells(rowNum, 1, rowNum, totalCols);
  const cell = ws.getCell(rowNum, 1);
  cell.value = title;
  cell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: "FF1F4E79" } };
  cell.alignment = LEFT_ALIGN;
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(rowNum, c).fill = ANALYSIS_SECTION_FILL;
    ws.getCell(rowNum, c).border = THIN_BORDER;
  }
  return rowNum + 1;
}

function getVsBenchmarkFill(
  vsBenchmark: string
): ExcelJS.FillPattern | null {
  const map: Record<string, ExcelJS.FillPattern | null> = {
    양호: GOOD_FILL,
    보통: null,
    주의: DANGER_FILL,
    판단불가: WARN_FILL,
  };
  return map[vsBenchmark] ?? null;
}

// ============================================================
// Sheet creators
// ============================================================

// ============================================================
// Dashboard sheet helpers
// ============================================================

function findStatementRow(items: StatementItem[] | undefined, aliases: string[]): StatementItem | undefined {
  if (!items?.length) return undefined;
  const normalized = aliases.map((a) => a.replace(/\s/g, ""));
  return items.find((row) => {
    const acc = (row.account || "").replace(/\s/g, "");
    return normalized.some((a) => acc === a || acc.includes(a));
  });
}

function statementValue(row: StatementItem | undefined, year: string): string {
  if (!row) return "-";
  const v = row[year];
  if (v === undefined || v === null || v === "") return "-";
  return String(v);
}

function statementNumber(row: StatementItem | undefined, year: string): number | null {
  if (!row) return null;
  const v = row[year];
  if (v === undefined || v === null || v === "" || v === "-") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const negative = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[(),\s]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function ratioValueNumber(valStr: string | undefined): number | null {
  if (!valStr || valStr === "-") return null;
  const cleaned = String(valStr).replace(/[%,회배\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function colLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function dashboardSectionHeader(ws: ExcelJS.Worksheet, rowNum: number, label: string, lastCol: number) {
  ws.mergeCells(rowNum, 1, rowNum, lastCol);
  const c = ws.getCell(rowNum, 1);
  c.value = `■ ${label}`;
  c.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = ANALYSIS_TITLE_FILL;
  c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(rowNum).height = 24;
}

function ratioVsBenchmarkFill(vs: string): ExcelJS.FillPattern | undefined {
  if (vs === "양호") return GOOD_FILL;
  if (vs === "보통") return WARN_FILL;
  if (vs === "주의") return DANGER_FILL;
  return undefined;
}

function createDashboardSheet(wb: ExcelJS.Workbook, data: ExcelReportData): void {
  const ws = wb.addWorksheet("1.대시보드", { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 26 },
  ];
  const LAST_COL = 8;

  let row = 1;
  const ci = data.companyInfo;
  const a = data.analysis;
  const sortedYears = [...data.years].sort();
  const latestYear = sortedYears[sortedYears.length - 1];

  // ─── Title banner ───
  ws.mergeCells(row, 1, row, LAST_COL);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = `${data.corpName} · 재무 대시보드`;
  titleCell.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = ANALYSIS_TITLE_FILL;
  titleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(row).height = 32;
  row += 1;

  ws.mergeCells(row, 1, row, LAST_COL);
  const subCell = ws.getCell(row, 1);
  const fsType = a?.fsType ? ` · ${a.fsType}` : "";
  const industry = a?.industryLabel ? ` · ${a.industryLabel}` : "";
  const grade = a?.overallGrade && a.overallGrade !== "-" ? ` · 종합등급 ${a.overallGrade}` : "";
  const period = sortedYears.length ? ` · ${sortedYears[0]}~${latestYear}` : "";
  subCell.value = `분석일자 ${new Date().toISOString().split("T")[0]}${period}${fsType}${industry}${grade}`;
  subCell.font = { ...SMALL_FONT, color: { argb: "FF555555" } };
  subCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  row += 2;

  // ─── 기업 개요 ───
  if (ci) {
    dashboardSectionHeader(ws, row, "기업 개요", LAST_COL); row += 1;
    const overviewFields: Array<[string, string]> = [
      ["대표이사", ci.ceoNm || "-"],
      ["법인구분", getCorpTypeLabel(ci.corpCls, ci.stockCode)],
      ["법인 등록번호", ci.jurirNo || "-"],
      ["사업자 등록번호", ci.bizrNo || "-"],
      ["종목코드", ci.stockCode || "비상장"],
      ["설립일자", formatEstDate(ci.estDt) || "-"],
      ["산업 분류", getIndustryLabel(ci.indutyCode) || ci.indutyCode || "-"],
      ["결산월", ci.accMt ? `${parseInt(ci.accMt, 10)}월` : "-"],
    ];
    for (let i = 0; i < overviewFields.length; i += 2) {
      const [l1, v1] = overviewFields[i];
      const [l2, v2] = overviewFields[i + 1] ?? ["", ""];
      ws.getCell(row, 1).value = l1;
      ws.getCell(row, 1).font = SECTION_FONT;
      ws.getCell(row, 1).fill = LABEL_FILL;
      ws.getCell(row, 1).alignment = LEFT_ALIGN;
      ws.mergeCells(row, 2, row, 4);
      ws.getCell(row, 2).value = v1;
      ws.getCell(row, 2).font = NORMAL_FONT;
      ws.getCell(row, 2).alignment = LEFT_ALIGN;
      if (l2) {
        ws.getCell(row, 5).value = l2;
        ws.getCell(row, 5).font = SECTION_FONT;
        ws.getCell(row, 5).fill = LABEL_FILL;
        ws.getCell(row, 5).alignment = LEFT_ALIGN;
        ws.mergeCells(row, 6, row, 8);
        ws.getCell(row, 6).value = v2;
        ws.getCell(row, 6).font = NORMAL_FONT;
        ws.getCell(row, 6).alignment = LEFT_ALIGN;
      }
      for (let c = 1; c <= LAST_COL; c++) ws.getCell(row, c).border = THIN_BORDER;
      ws.getRow(row).height = 20;
      row += 1;
    }
    if (ci.adres) {
      ws.getCell(row, 1).value = "회사 주소";
      ws.getCell(row, 1).font = SECTION_FONT;
      ws.getCell(row, 1).fill = LABEL_FILL;
      ws.getCell(row, 1).alignment = LEFT_ALIGN;
      ws.mergeCells(row, 2, row, LAST_COL);
      ws.getCell(row, 2).value = ci.adres;
      ws.getCell(row, 2).font = NORMAL_FONT;
      ws.getCell(row, 2).alignment = LEFT_ALIGN;
      for (let c = 1; c <= LAST_COL; c++) ws.getCell(row, c).border = THIN_BORDER;
      ws.getRow(row).height = 20;
      row += 1;
    }
    row += 1;
  }

  // ─── 종합 평가 ───
  if (a?.overallSummary) {
    dashboardSectionHeader(ws, row, `종합 평가 (등급 ${a.overallGrade})`, LAST_COL); row += 1;
    ws.mergeCells(row, 1, row, LAST_COL);
    const sumCell = ws.getCell(row, 1);
    sumCell.value = a.overallSummary;
    sumCell.font = NORMAL_FONT;
    sumCell.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
    sumCell.fill = ANALYSIS_SECTION_FILL;
    ws.getRow(row).height = 60;
    row += 2;
  }

  // ─── 주요 손익 추이 ───
  dashboardSectionHeader(ws, row, "주요 손익 추이 (단위: 백만원)", LAST_COL); row += 1;
  // header
  ws.getCell(row, 1).value = "계정";
  ws.getCell(row, 1).font = HEADER_FONT;
  ws.getCell(row, 1).fill = HEADER_FILL;
  ws.getCell(row, 1).alignment = CENTER_ALIGN;
  sortedYears.forEach((y, i) => {
    const c = ws.getCell(row, 2 + i);
    c.value = `${y}년`;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
    c.alignment = CENTER_ALIGN;
  });
  for (let c = 1; c <= 1 + sortedYears.length; c++) ws.getCell(row, c).border = THIN_BORDER;
  ws.getRow(row).height = 22;
  row += 1;

  const isItems = data.hasOfs && data.isItemsOfs?.length ? data.isItemsOfs : data.isItemsCfs;
  const cfItems = data.hasOfs && data.cfItemsOfs?.length ? data.cfItemsOfs : data.cfItemsCfs;
  const trendItems: Array<{ label: string; aliases: string[] }> = [
    { label: "매출액", aliases: ["매출액", "매출", "수익(매출액)", "영업수익", "매출수익"] },
    { label: "영업이익", aliases: ["영업이익", "영업손실", "영업이익(손실)", "영업손익"] },
    { label: "당기순이익", aliases: ["당기순이익", "당기순손실", "당기순이익(손실)", "당기순손익", "연결당기순이익"] },
  ];
  const trendRowStart = row;
  for (const t of trendItems) {
    const r = findStatementRow(isItems, t.aliases);
    ws.getCell(row, 1).value = t.label;
    ws.getCell(row, 1).font = SECTION_FONT;
    ws.getCell(row, 1).alignment = LEFT_ALIGN;
    ws.getCell(row, 1).fill = LABEL_FILL;
    sortedYears.forEach((y, i) => {
      const c = ws.getCell(row, 2 + i);
      const num = statementNumber(r, y);
      if (num !== null) {
        c.value = num;
        c.numFmt = "#,##0";
      } else {
        c.value = statementValue(r, y);
      }
      c.font = NORMAL_FONT;
      c.alignment = RIGHT_ALIGN;
    });
    for (let c = 1; c <= 1 + sortedYears.length; c++) ws.getCell(row, c).border = THIN_BORDER;
    row += 1;
  }
  // 데이터바: 손익 추이 각 행의 연도 셀에 막대 그래프
  if (sortedYears.length > 0) {
    const lastCol = colLetter(1 + sortedYears.length);
    const trendBarColors: Array<{ ref: string; color: string }> = [
      { ref: `B${trendRowStart}:${lastCol}${trendRowStart}`, color: "FF3B82F6" },           // 매출 — 파랑
      { ref: `B${trendRowStart + 1}:${lastCol}${trendRowStart + 1}`, color: "FF10B981" },   // 영업이익 — 녹색
      { ref: `B${trendRowStart + 2}:${lastCol}${trendRowStart + 2}`, color: "FFF59E0B" },   // 당기순이익 — 주황
    ];
    for (const { ref, color } of trendBarColors) {
      ws.addConditionalFormatting({
        ref,
        rules: [{
          type: "dataBar",
          priority: 1,
          cfvo: [{ type: "min" }, { type: "max" }],
          showValue: true,
          gradient: false,
          color: { argb: color },
        } as ExcelJS.DataBarRuleType & { color: { argb: string } }],
      });
    }
  }
  row += 1;

  // ─── 현금흐름 (최신연도) ───
  if (cfItems?.length) {
    dashboardSectionHeader(ws, row, `현금흐름 (${latestYear} · 단위: 백만원)`, LAST_COL); row += 1;
    const cfRows: Array<{ label: string; aliases: string[] }> = [
      { label: "영업활동", aliases: ["영업활동현금흐름", "영업활동으로인한현금흐름", "영업활동순현금흐름"] },
      { label: "투자활동", aliases: ["투자활동현금흐름", "투자활동으로인한현금흐름", "투자활동순현금흐름"] },
      { label: "재무활동", aliases: ["재무활동현금흐름", "재무활동으로인한현금흐름", "재무활동순현금흐름"] },
      { label: "현금 순증감", aliases: ["현금및현금성자산의순증감", "현금의증감", "현금및현금성자산의증감"] },
    ];
    const cfStart = row;
    for (const c of cfRows) {
      const r = findStatementRow(cfItems, c.aliases);
      ws.getCell(row, 1).value = c.label;
      ws.getCell(row, 1).font = SECTION_FONT;
      ws.getCell(row, 1).fill = LABEL_FILL;
      ws.getCell(row, 1).alignment = LEFT_ALIGN;
      const num = statementNumber(r, latestYear);
      const valCell = ws.getCell(row, 2);
      if (num !== null) {
        valCell.value = num;
        valCell.numFmt = "#,##0";
      } else {
        valCell.value = statementValue(r, latestYear);
      }
      valCell.font = NORMAL_FONT;
      valCell.alignment = RIGHT_ALIGN;
      // 음수면 빨강, 양수면 녹색
      if (num !== null) {
        valCell.font = { ...NORMAL_FONT, color: { argb: num < 0 ? "FFB91C1C" : "FF15803D" }, bold: true };
      }
      // 빈 칸은 LAST_COL까지 테두리만
      for (let c2 = 3; c2 <= LAST_COL; c2++) {
        const blank = ws.getCell(row, c2);
        blank.border = THIN_BORDER;
      }
      ws.getCell(row, 1).border = THIN_BORDER;
      ws.getCell(row, 2).border = THIN_BORDER;
      row += 1;
    }
    // 현금흐름 4행 데이터바 (음수도 표시)
    ws.addConditionalFormatting({
      ref: `B${cfStart}:B${cfStart + cfRows.length - 1}`,
      rules: [{
        type: "dataBar",
        priority: 2,
        cfvo: [{ type: "min" }, { type: "max" }],
        showValue: true,
        gradient: false,
        color: { argb: "FF10B981" },
      } as ExcelJS.DataBarRuleType & { color: { argb: string } }],
    });
    row += 1;
  }

  // ─── 재무비율 (전체 카테고리) ───
  if (a) {
    dashboardSectionHeader(ws, row, "재무비율 분석", LAST_COL); row += 1;

    const ratioCategories: Array<[string, RatioDetail[]]> = [
      ["안정성", a.stability || []],
      ["수익성", a.profitability || []],
      ["성장성", a.growth || []],
      ["활동성", a.activity || []],
    ];
    // header — 카테고리 / 지표 / 연도들 / 업종평균 / 추이 / 판정
    const headers = ["카테고리", "지표", ...sortedYears.map((y) => `${y}년`), "업종평균", "추이", "판정"];
    headers.forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = HEADER_FONT;
      c.fill = HEADER_FILL;
      c.alignment = CENTER_ALIGN;
      c.border = THIN_BORDER;
    });
    ws.getRow(row).height = 22;
    row += 1;

    const ratioFirstDataRow = row;
    for (const [catName, ratios] of ratioCategories) {
      if (!ratios.length) continue;
      ratios.forEach((r, idx) => {
        const benchCol = 3 + sortedYears.length;
        const trendCol = 3 + sortedYears.length + 1;
        const judgeCol = 3 + sortedYears.length + 2;
        const cells: Array<{ col: number; value: string | number; align?: Partial<ExcelJS.Alignment> }> = [
          { col: 1, value: idx === 0 ? catName : "", align: CENTER_ALIGN },
          { col: 2, value: r.name, align: LEFT_ALIGN },
        ];
        sortedYears.forEach((y, i) => {
          cells.push({ col: 3 + i, value: r.valuesStr[y] || "-", align: RIGHT_ALIGN });
        });
        cells.push({ col: benchCol, value: r.benchmark || "-", align: RIGHT_ALIGN });
        cells.push({ col: trendCol, value: `${r.trendIcon || ""} ${r.trend || ""}`.trim() || "-", align: CENTER_ALIGN });
        cells.push({ col: judgeCol, value: r.vsBenchmark || "-", align: CENTER_ALIGN });
        cells.forEach(({ col, value, align }) => {
          const cell = ws.getCell(row, col);
          cell.value = value;
          cell.font = NORMAL_FONT;
          cell.alignment = align ?? LEFT_ALIGN;
          cell.border = THIN_BORDER;
        });
        // category cell highlight on first row
        if (idx === 0) {
          ws.getCell(row, 1).fill = CATEGORY_HEADER_FILL;
          ws.getCell(row, 1).font = SECTION_FONT;
        }
        // 판정 fill — vsBenchmark 양호/보통/주의 색상
        const vsFill = ratioVsBenchmarkFill(r.vsBenchmark);
        if (vsFill) {
          ws.getCell(row, judgeCol).fill = vsFill;
          ws.getCell(row, judgeCol).font = { ...NORMAL_FONT, bold: true };
        }
        row += 1;
      });
    }
    void ratioFirstDataRow;
    row += 1;
  }

  // ─── 차입금 현황 ───
  if (data.borrowingNotes && data.borrowingNotes.details.length > 0) {
    const bn = data.borrowingNotes;
    dashboardSectionHeader(ws, row, `차입금 현황 (${bn.fiscalYear})`, LAST_COL); row += 1;
    const bHeaders = ["구분", "차입처", "이자율", "만기", "당기말", "전기말", "통화"];
    bHeaders.forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = HEADER_FONT;
      c.fill = HEADER_FILL;
      c.alignment = CENTER_ALIGN;
      c.border = THIN_BORDER;
    });
    row += 1;
    bn.details.slice(0, 12).forEach((d) => {
      const vals = [d.category, d.lender, d.interestRate, d.maturityDate, d.currentAmount, d.previousAmount, d.currency || "-"];
      vals.forEach((v, i) => {
        const c = ws.getCell(row, i + 1);
        c.value = v || "-";
        c.font = NORMAL_FONT;
        c.alignment = i >= 4 && i <= 5 ? RIGHT_ALIGN : (i >= 0 && i <= 1 ? LEFT_ALIGN : CENTER_ALIGN);
        c.border = THIN_BORDER;
      });
      row += 1;
    });
    if (bn.details.length > 12) {
      ws.getCell(row, 1).value = `※ 상위 12건 표시 · 전체 ${bn.details.length}건 (자세한 내역은 차입금내역 시트 참조)`;
      ws.getCell(row, 1).font = SOURCE_FONT;
      ws.mergeCells(row, 1, row, LAST_COL);
      row += 1;
    }
    row += 1;
  }

  // ─── 주주 현황 ───
  if (data.shareholders && data.shareholders.length > 0) {
    dashboardSectionHeader(ws, row, "주주 현황 (Top 10)", LAST_COL); row += 1;
    const sHeaders = ["주주명", "주식종류", "관계", "지분율(%)", "소유주식수", "비고"];
    sHeaders.forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = HEADER_FONT;
      c.fill = HEADER_FILL;
      c.alignment = CENTER_ALIGN;
      c.border = THIN_BORDER;
    });
    ws.mergeCells(row, 6, row, LAST_COL);
    row += 1;
    data.shareholders.slice(0, 10).forEach((s) => {
      const vals = [s.name, s.stockType, s.relation, s.shareRatio, s.shareCount, s.remark];
      vals.forEach((v, i) => {
        const c = ws.getCell(row, i + 1);
        c.value = v || "-";
        c.font = NORMAL_FONT;
        c.alignment = i >= 3 && i <= 4 ? RIGHT_ALIGN : LEFT_ALIGN;
        c.border = THIN_BORDER;
      });
      ws.mergeCells(row, 6, row, LAST_COL);
      row += 1;
    });
    row += 1;
  }

  // ─── 감사인 의견 ───
  if (data.auditOpinion) {
    const ao = data.auditOpinion;
    dashboardSectionHeader(ws, row, "감사인 의견", LAST_COL); row += 1;
    const aoFields: Array<[string, string]> = [
      ["감사인", ao.auditorName || "-"],
      ["감사의견", ao.opinionType || "-"],
      ["감사보고서일", ao.reportDate || "-"],
      ["사업연도", ao.fiscalYear || "-"],
    ];
    aoFields.forEach(([l, v]) => {
      ws.getCell(row, 1).value = l;
      ws.getCell(row, 1).font = SECTION_FONT;
      ws.getCell(row, 1).fill = LABEL_FILL;
      ws.getCell(row, 1).alignment = LEFT_ALIGN;
      ws.mergeCells(row, 2, row, LAST_COL);
      ws.getCell(row, 2).value = v;
      ws.getCell(row, 2).font = NORMAL_FONT;
      ws.getCell(row, 2).alignment = LEFT_ALIGN;
      for (let c = 1; c <= LAST_COL; c++) ws.getCell(row, c).border = THIN_BORDER;
      row += 1;
    });
    row += 1;
  }

  // ─── 리스크 / 기회 요인 ───
  if (a && (a.riskFactors?.length || a.opportunityFactors?.length)) {
    dashboardSectionHeader(ws, row, "리스크 / 기회 요인", LAST_COL); row += 1;
    const startRow = row;
    // 리스크 (left half)
    ws.getCell(row, 1).value = "▼ 리스크 요인";
    ws.getCell(row, 1).font = { ...SECTION_FONT, color: { argb: "FFB91C1C" } };
    ws.mergeCells(row, 1, row, 4);
    ws.getCell(row, 1).fill = RISK_BG_FILL;
    // 기회 (right half)
    ws.getCell(row, 5).value = "▲ 기회 요인";
    ws.getCell(row, 5).font = { ...SECTION_FONT, color: { argb: "FF15803D" } };
    ws.mergeCells(row, 5, row, LAST_COL);
    ws.getCell(row, 5).fill = OPPORTUNITY_BG_FILL;
    row += 1;
    const maxLen = Math.max(a.riskFactors?.length ?? 0, a.opportunityFactors?.length ?? 0);
    for (let i = 0; i < maxLen; i++) {
      const rf = a.riskFactors?.[i];
      const of = a.opportunityFactors?.[i];
      ws.mergeCells(row, 1, row, 4);
      const lc = ws.getCell(row, 1);
      lc.value = rf ? `• ${rf}` : "";
      lc.font = NORMAL_FONT;
      lc.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
      lc.fill = RISK_BG_FILL;
      ws.mergeCells(row, 5, row, LAST_COL);
      const rc = ws.getCell(row, 5);
      rc.value = of ? `• ${of}` : "";
      rc.font = NORMAL_FONT;
      rc.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
      rc.fill = OPPORTUNITY_BG_FILL;
      ws.getRow(row).height = 24;
      row += 1;
    }
    void startRow;
    row += 1;
  }

  // ─── 분석가 소견 ───
  if (a?.analystOpinion) {
    dashboardSectionHeader(ws, row, "분석가 소견", LAST_COL); row += 1;
    ws.mergeCells(row, 1, row, LAST_COL);
    const oc = ws.getCell(row, 1);
    oc.value = a.analystOpinion;
    oc.font = NORMAL_FONT;
    oc.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
    oc.fill = ANALYSIS_SECTION_FILL;
    ws.getRow(row).height = Math.min(180, Math.max(40, Math.ceil(a.analystOpinion.length / 60) * 18));
    row += 2;
  }

  // ─── 출처 ───
  ws.getCell(row, 1).value = `※ 출처: ${data.source || "DART Open API"} · 단위는 별도 표시한 부분 외 모두 백만원`;
  ws.getCell(row, 1).font = SOURCE_FONT;
  ws.mergeCells(row, 1, row, LAST_COL);
}

function getCorpTypeLabel(corpCls: string, stockCode: string): string {
  if (corpCls === "Y") return "대기업 (유가증권시장)";
  if (corpCls === "K") return "중소기업 (코스닥)";
  if (corpCls === "N") return "중소기업 (코넥스)";
  if (corpCls === "E") return "기타";
  if (stockCode) return "상장기업";
  return "비상장기업";
}

function getIndustryLabel(indutyCode: string): string {
  const prefix = indutyCode.substring(0, 2);
  const labels: Record<string, string> = {
    "01": "농업", "02": "임업", "03": "어업",
    "05": "석탄광업", "06": "원유/천연가스광업", "07": "금속광업", "08": "비금속광업",
    "10": "식료품제조업", "11": "음료제조업", "13": "섬유제조업", "14": "의복제조업",
    "20": "화학제조업", "21": "의약품제조업", "22": "고무/플라스틱제조업",
    "24": "1차금속제조업", "25": "금속가공제조업", "26": "전자부품/컴퓨터제조업",
    "27": "의료/광학기기제조업", "28": "전기장비제조업", "29": "기계장비제조업",
    "30": "자동차/트레일러제조업", "31": "기타운송장비제조업",
    "35": "전기/가스공급업", "36": "수도사업", "37": "하수/폐수처리업",
    "41": "건설업", "42": "토목건설업", "45": "자동차판매업",
    "46": "도매업", "47": "소매업",
    "49": "육상운송업", "50": "수상운송업", "51": "항공운송업", "52": "창고/운송업",
    "55": "숙박업", "56": "음식점업",
    "58": "출판업", "59": "영상/오디오제작업", "60": "방송업", "61": "통신업",
    "62": "컴퓨터프로그래밍/시스템", "63": "정보서비스업",
    "64": "금융업", "65": "보험/연금업", "66": "금융/보험관련업",
    "68": "부동산업",
    "70": "연구개발업", "71": "전문서비스업", "72": "건축/엔지니어링업", "73": "광고업",
    "74": "기타전문/과학업", "75": "사업시설관리업",
    "84": "공공행정", "85": "교육서비스업",
    "86": "보건업", "87": "사회복지업",
    "90": "예술/스포츠업", "91": "스포츠/오락업",
    "94": "협회/단체", "95": "수리업", "96": "기타서비스업",
  };
  const label = labels[prefix] || "기타";
  return `${indutyCode} (${label})`;
}

function createFinancialSheet(
  wb: ExcelJS.Workbook,
  data: ExcelReportData,
  sheetName: string,
  stmtType: "BS" | "IS" | "CF",
  fsDiv: "OFS" | "CFS",
  // IS 시트의 EBITDA/이자보상배율 수식이 참조할 CF 시트명.
  // CF 시트는 IS보다 늦게 생성되므로 generateExcelReport가 미리 계산해 전달.
  cfSheetNameHint?: string
): void {
  const ws = wb.addWorksheet(sheetName);
  setColWidths(ws, { 1: 40, 2: 15, 3: 15, 4: 15, 5: 15, 6: 12 });

  const years = [...(data.years || [])].sort();
  // Set column widths dynamically for year columns and change column
  for (let i = 0; i < years.length; i++) {
    ws.getColumn(i + 2).width = 15;
  }
  if (years.length > 0) {
    ws.getColumn(years.length + 2).width = 15; // 증감액
    ws.getColumn(years.length + 3).width = 12; // 증감률
    if (data.yoyAnalysis && data.yoyAnalysis.length > 0) {
      ws.getColumn(years.length + 4).width = 50; // 증감사유
    }
  }

  let row = 1;
  const fsLabel = fsDiv === "OFS" ? "[개별]" : "[연결]";

  // Company info section (only on BS + OFS)
  if (stmtType === "BS" && fsDiv === "OFS" && data.companyInfo) {
    const c = data.companyInfo;
    ws.getCell(row, 1).value = "1-1. 기본정보";
    ws.getCell(row, 1).font = SECTION_FONT;
    row += 1;

    const infoRows: [string, string][] = [
      ["기업명", c.corpName || "-"],
      ["대표자", c.ceoNm || "-"],
      ["법인등록번호", c.jurirNo || "-"],
      ["사업자번호", c.bizrNo || "-"],
      ["기업유형", getCorpTypeLabel(c.corpCls, c.stockCode) || "-"],
      ["업종분류", c.indutyCode ? getIndustryLabel(c.indutyCode) : "-"],
      ["주소", c.adres || "-"],
      ["설립일", formatEstDate(c.estDt)],
      ["주식코드", c.stockCode || "-"],
      ["결산월", c.accMt ? `${c.accMt}월` : "-"],
    ];

    // 감사의견
    if (data.auditOpinion) {
      const ao = data.auditOpinion;
      infoRows.push(["감사의견", `${ao.fiscalYear}년 ${ao.reportDate} (${ao.auditorName}) / ${ao.opinionType}`]);
    }

    for (const [label, value] of infoRows) {
      ws.getCell(row, 1).value = label;
      ws.getCell(row, 1).font = { name: FONT_NAME, size: FONT_SIZE, bold: true };
      ws.getCell(row, 1).border = THIN_BORDER;
      ws.getCell(row, 1).fill = LABEL_FILL;
      ws.getCell(row, 2).value = value;
      ws.getCell(row, 2).font = NORMAL_FONT;
      ws.getCell(row, 2).border = THIN_BORDER;
      row += 1;
    }

    // 주주구성
    if (data.shareholders && data.shareholders.length > 0) {
      row += 1;
      ws.getCell(row, 1).value = "1-1-2. 주주구성";
      ws.getCell(row, 1).font = SECTION_FONT;
      row += 1;

      // Header
      const shHeaders = ["주주명", "주식종류", "소유주식수", "지분율(%)", "회사와의 관계", "비고"];
      for (let i = 0; i < shHeaders.length; i++) {
        ws.getCell(row, i + 1).value = shHeaders[i];
      }
      applyHeaderStyle(ws, row, 1, shHeaders.length);
      row += 1;

      // Data rows
      for (const sh of data.shareholders) {
        ws.getCell(row, 1).value = sh.name;
        ws.getCell(row, 2).value = sh.stockType;
        ws.getCell(row, 3).value = sh.shareCount;
        ws.getCell(row, 3).alignment = RIGHT_ALIGN;
        ws.getCell(row, 4).value = sh.shareRatio;
        ws.getCell(row, 4).alignment = RIGHT_ALIGN;
        ws.getCell(row, 5).value = sh.relation;
        ws.getCell(row, 6).value = sh.remark;
        applyDataStyle(ws, row, 1, shHeaders.length);
        row += 1;
      }
    }

    row += 1; // empty separator
    const finSectionNum = (data.shareholders && data.shareholders.length > 0) ? "1-3" : "1-2";
    ws.getCell(row, 1).value = `${finSectionNum}. 주요 재무현황`;
    ws.getCell(row, 1).font = SECTION_FONT;
    row += 1;
  }

  // Title
  const stmtLabels: Record<string, string> = { BS: "재무상태표", IS: "손익계산서", CF: "현금흐름표" };
  const titleText = `■ ${stmtLabels[stmtType] || stmtType}${fsLabel}                                              (단위:백만원)`;
  ws.getCell(row, 1).value = titleText;
  ws.getCell(row, 1).font = SECTION_FONT;
  row += 1;

  // Pick data
  const items =
    stmtType === "CF"
      ? fsDiv === "OFS" ? data.cfItemsOfs : data.cfItemsCfs
      : fsDiv === "OFS"
        ? stmtType === "BS" ? data.bsItemsOfs : data.isItemsOfs
        : stmtType === "BS" ? data.bsItemsCfs : data.isItemsCfs;

  const ratios = fsDiv === "OFS" ? data.ratiosOfs : data.ratiosCfs;
  const hasData = fsDiv === "OFS" ? data.hasOfs : data.hasCfs;

  if (hasData && items && items.length > 0) {
    // Header row
    ws.getCell(row, 1).value = "계정과목";
    for (let ci = 0; ci < years.length; ci++) {
      const yr = years[ci];
      // "2025.09" → "'25.09.30", "2025" → "'25.12.31"
      const dotIdx = yr.indexOf(".");
      if (dotIdx > 0) {
        const yy = yr.slice(2, dotIdx);
        const mm = yr.slice(dotIdx + 1);
        const lastDay = mm === "09" ? "30" : mm === "06" ? "30" : mm === "03" ? "31" : "31";
        ws.getCell(row, ci + 2).value = `'${yy}.${mm}.${lastDay}`;
      } else {
        ws.getCell(row, ci + 2).value = `'${yr.slice(2)}.12.31`;
      }
    }
    ws.getCell(row, years.length + 2).value = "전년비 증감액";
    ws.getCell(row, years.length + 3).value = "전년비 증감률";
    const hasYoyAnalysis = data.yoyAnalysis && data.yoyAnalysis.length > 0;
    const totalCols = hasYoyAnalysis ? years.length + 4 : years.length + 3;
    if (hasYoyAnalysis) {
      ws.getCell(row, years.length + 4).value = "증감사유 (주석)";
    }
    applyHeaderStyle(ws, row, 1, totalCols);
    row += 1;

    // Freeze panes below header
    ws.views = [{ state: "frozen", ySplit: row - 1, xSplit: 0 }];

    // 행 번호 추적 (셀 수식용)
    const acctRowMap = new Map<string, number>(); // 정규화된 계정명 → 행번호

    // Data rows — depth 기반 들여쓰기
    for (const item of items) {
      const rawAcct = item.account || "";
      // 계정명에서 번호 기호 제거: Ⅰ., Ⅱ., III., (1), 1. 등
      const acct = rawAcct
        .replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVXivx]+[.·]\s*/, "")
        .replace(/^\([0-9]+\)\s*/, "")
        .replace(/^[0-9]+[.·]\s*/, "")
        .replace(/^\s+/, "");
      const depth = typeof item.depth === "number" ? item.depth : 2;
      const isBold = depth <= 1;
      const indent = depth === 0 ? "" : depth === 1 ? "  " : "    ";

      ws.getCell(row, 1).value = indent + acct;
      ws.getCell(row, 1).font = {
        name: FONT_NAME,
        size: FONT_SIZE,
        bold: isBold,
      };
      ws.getCell(row, 1).border = THIN_BORDER;
      if (depth === 0) {
        ws.getCell(row, 1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF0F0F0" },
        };
      }

      let prevVal: string | undefined;
      for (let ci = 0; ci < years.length; ci++) {
        const yr = years[ci];
        const valRaw = item[yr] ?? "-";
        const valStr = String(valRaw);
        const cell = ws.getCell(row, ci + 2);

        // Convert numeric strings to actual numbers
        const valString = valStr;
        const stripped = valString.replace(/,/g, "").trim();
        const parsed = parseFloat(stripped);
        if (valString !== "-" && !isNaN(parsed) && stripped !== "") {
          cell.value = parsed;
          cell.numFmt = "#,##0";
        } else {
          cell.value = valStr;
        }

        cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: isBold };
        cell.alignment = RIGHT_ALIGN;
        cell.border = THIN_BORDER;
        if (depth === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
        }

        // YoY change for last year — 증감액 + 증감률 두 컬럼
        if (ci === years.length - 1 && prevVal !== undefined) {
          const currNum = parseFloat(String(valStr).replace(/,/g, "").trim());
          const prevNum = parseFloat(String(prevVal).replace(/,/g, "").trim());
          if (!isNaN(currNum) && !isNaN(prevNum)) {
            // 증감액 (절대 금액)
            const diff = currNum - prevNum;
            const diffCell = ws.getCell(row, years.length + 2);
            diffCell.value = diff;
            diffCell.numFmt = "#,##0";
            diffCell.font = NORMAL_FONT;
            diffCell.alignment = RIGHT_ALIGN;
            diffCell.border = THIN_BORDER;

            // 증감률 (%)
            if (prevNum !== 0) {
              const pctChange = ((currNum - prevNum) / Math.abs(prevNum)) * 100;
              const pctCell = ws.getCell(row, years.length + 3);
              pctCell.value = pctChange / 100;
              pctCell.numFmt = "0.0%";
              pctCell.font = NORMAL_FONT;
              pctCell.alignment = RIGHT_ALIGN;
              pctCell.border = THIN_BORDER;
            }

            // 증감사유 간략 참조 (상세는 별도 시트)
            if (hasYoyAnalysis && data.yoyAnalysis) {
              const targetType = stmtType === "BS" ? "BS" : "IS";
              const yoyItem = data.yoyAnalysis.find(
                (y) => y.account === rawAcct && y.stmtType === targetType
              );
              if (yoyItem && yoyItem.briefRef) {
                const noteCell = ws.getCell(row, years.length + 4);
                noteCell.value = yoyItem.briefRef;
                noteCell.font = { name: FONT_NAME, size: 9, color: { argb: "FF4472C4" } };
                noteCell.alignment = { vertical: "middle" };
                noteCell.border = THIN_BORDER;
              }
            }
          }
        }
        prevVal = String(valStr);
      }
      // 계정명 → 행번호 매핑 (수식 참조용)
      const acctNorm = acct.replace(/[\s()]/g, "");
      if (!acctRowMap.has(acctNorm)) acctRowMap.set(acctNorm, row);
      row += 1;
    }

    // Ratio rows — 셀 수식 적용
    row += 1;

    // 계정 행 찾기 헬퍼
    function findRow(...names: string[]): number | null {
      for (const name of names) {
        const norm = name.replace(/[\s()]/g, "");
        const r = acctRowMap.get(norm);
        if (r) return r;
      }
      return null;
    }
    // 엑셀 컬럼 문자 (B=2, C=3, ...)
    function colLetter(ci: number): string {
      return String.fromCharCode(65 + ci + 1); // 0→B, 1→C, ...
    }

    // 비율 행 렌더링 공통 함수
    type RatioCfg = { name: string; formula: (col: string, ci: number) => string | null; fmt: string; desc: string };
    function renderRatioRows(configs: RatioCfg[]) {
      for (const cfg of configs) {
        ws.getCell(row, 1).value = cfg.name;
        ws.getCell(row, 1).font = { name: FONT_NAME, size: FONT_SIZE, bold: true };
        ws.getCell(row, 1).border = THIN_BORDER;
        ws.getCell(row, 1).fill = RATIO_FILL;

        for (let ci = 0; ci < years.length; ci++) {
          const yr = years[ci];
          const cell = ws.getCell(row, ci + 2);
          const col = colLetter(ci);
          const formula = cfg.formula(col, ci);

          if (formula) {
            cell.value = { formula } as any;
          } else {
            const yrRatios = ratios?.[yr] ?? {};
            const val = yrRatios[cfg.name] ?? "-";
            const valStr = String(val);
            const n = parseFloat(valStr.replace(/%|배|,/g, ""));
            cell.value = !isNaN(n) ? n : val;
          }
          cell.numFmt = cfg.fmt;
          cell.font = NORMAL_FONT;
          cell.alignment = RIGHT_ALIGN;
          cell.border = THIN_BORDER;
          cell.fill = RATIO_FILL;
        }
        // 증감액/증감률 컬럼도 채우기 (빈칸 방지)
        for (let extra = years.length + 2; extra <= totalCols; extra++) {
          const ec = ws.getCell(row, extra);
          if (!ec.value) { ec.value = ""; ec.border = THIN_BORDER; ec.fill = RATIO_FILL; }
        }
        row += 1;
      }
    }

    if (ratios && stmtType === "BS") {
      const rDebt = findRow("부채총계");
      const rEquity = findRow("자본총계");
      const rAssets = findRow("자산총계");
      const rCash = findRow("현금및현금성자산", "현금및예치금", "현금");
      const rCurAsset = findRow("유동자산");
      const rCurLiab = findRow("유동부채");
      // 차입금 관련 행 수집 (SUM 수식용)
      const borrowingKeywords = ["단기차입금", "장기차입금", "유동성장기부채", "유동성장기차입금",
        "사채", "전환사채", "교환사채", "단기사채", "유동성사채",
        "유동리스부채", "비유동리스부채", "리스부채", "차입부채",
        "유동금융부채", "비유동금융부채"];
      const borrowRows: number[] = [];
      for (const kw of borrowingKeywords) {
        const r = findRow(kw);
        if (r) borrowRows.push(r);
      }

      // 총차입금 행 번호 (순차입금, 차입금의존도에서 참조)
      let totalBorrRow = 0;

      const bsCfg: RatioCfg[] = [
        // borrowRows 셀에 "-" 텍스트가 들어가면 SUM이 #VALUE! → 텍스트→숫자 강제 변환 후 0 fallback.
        // IFERROR(셀,0)은 에러일 때만 발동하므로 "-" 텍스트는 통과 → SUM 깨짐.
        // IFERROR(셀*1,0)은 텍스트*1 = #VALUE! 에러 발생 → IFERROR 정상 발동 → 0
        // REIT 등 일부 회사는 연도별 차입금 reclassify로 특정 연도 셀이 빈/텍스트
        { name: "총차입금", desc: "차입금 관련 계정 합계", fmt: "#,##0",
          formula: (c) => borrowRows.length > 0 ? `=${borrowRows.map(r => `IFERROR(${c}${r}*1,0)`).join("+")}` : null },
        { name: "순차입금", desc: "총차입금 - 현금및현금성자산", fmt: "#,##0",
          formula: (c) => rCash ? `=${c}${row}-IFERROR(${c}${rCash}*1,0)` : null }, // row = 총차입금 행 (이 시점)
        { name: "부채비율", desc: "(부채총계/자본총계)×100", fmt: '0.0"%"',
          formula: (c) => rDebt && rEquity ? `=IF(${c}${rEquity}=0,"-",${c}${rDebt}/${c}${rEquity}*100)` : null },
        { name: "유동비율", desc: "(유동자산/유동부채)×100", fmt: '0.0"%"',
          formula: (c) => rCurAsset && rCurLiab ? `=IF(${c}${rCurLiab}=0,"-",${c}${rCurAsset}/${c}${rCurLiab}*100)` : null },
        { name: "자기자본비율", desc: "(자본총계/자산총계)×100", fmt: '0.0"%"',
          formula: (c) => rEquity && rAssets ? `=IF(${c}${rAssets}=0,"-",${c}${rEquity}/${c}${rAssets}*100)` : null },
        { name: "차입금의존도", desc: "(총차입금/자산총계)×100", fmt: '0.0"%"',
          formula: () => null }, // 아래에서 totalBorrRow 설정 후 수동
      ];

      // 총차입금/순차입금 행 번호 미리 계산
      totalBorrRow = row; // 총차입금이 첫 번째 비율 행
      // 순차입금의 formula에서 총차입금 행 참조 수정 — rCash 셀이 텍스트(-)일 수 있어 *1 강제 변환
      bsCfg[1].formula = (c) => rCash ? `=${c}${totalBorrRow}-IFERROR(${c}${rCash}*1,0)` : null;
      // 차입금의존도: 총차입금행/자산총계행*100 — rAssets가 0일 때만 "-"
      bsCfg[5].formula = (c) => rAssets ? `=IF(${c}${rAssets}=0,"-",${c}${totalBorrRow}/${c}${rAssets}*100)` : null;

      renderRatioRows(bsCfg);

    } else if (ratios && stmtType === "IS") {
      const rRevenue = findRow("영업수익", "매출액", "공사수익", "보험수익");
      const rOpIncome = findRow("영업이익", "영업이익(손실)", "영업손익");
      const rNI = findRow("당기순이익", "당기순이익(손실)", "당기순손익", "연결당기순이익");
      // 이자비용 우선순위: IS의 정확한 "이자비용" 행 → IS "금융비용"(통합값) fallback
      // 금융비용은 외환손실/파생손실 포함되어 이자보상배율을 과소평가시킴
      const rInterestExact = findRow("이자비용", "이자비용(손실)");
      const rFinCost = rInterestExact ?? findRow("금융비용", "금융원가");

      // BS 시트 참조 (ROA, ROE용) — 같은 fsDiv의 BS 시트명 찾기
      const bsSheetName = wb.worksheets.find(s =>
        s.name.includes("재무상태표") && s.name.includes(fsDiv === "OFS" ? "개별" : "연결")
      )?.name;
      const bsRef = bsSheetName ? `'${bsSheetName}'!` : "";
      // BS 시트에서 자산총계/자본총계 행 찾기 (BS 시트 구조에서 추정)
      let bsAssetRow = 0, bsEquityRow = 0;
      if (bsSheetName) {
        const bsSheet = wb.getWorksheet(bsSheetName);
        if (bsSheet) {
          bsSheet.eachRow((r, rn) => {
            const v = String(r.getCell(1).value || "").replace(/\s/g, "");
            if (v === "자산총계") bsAssetRow = rn;
            if (v === "자본총계") bsEquityRow = rn;
          });
        }
      }

      // CF 시트 참조 (EBITDA + 이자비용용)
      // 핵심: CF 시트는 generateExcelReport에서 IS보다 늦게 생성되므로, IS 빌드 시점에 wb에는 없음.
      //   → cfSheetNameHint(미래 시트명)를 우선 사용
      //   → 행 번호는 data.cfItemsOfs/cfItemsCfs 배열에서 직접 산출 (CF 시트 row 1=title, 2=header, 3+=items)
      const cfData = fsDiv === "OFS" ? data.cfItemsOfs : data.cfItemsCfs;
      const cfSheetName = cfSheetNameHint ?? wb.worksheets.find(s =>
        s.name.includes("현금흐름표") && s.name.includes(fsDiv === "OFS" ? "개별" : "연결")
      )?.name;
      let cfDeprRow = 0, cfAmortRow = 0, cfInterestPayRow = 0, cfCombinedDARow = 0;
      if (cfData && cfData.length > 0) {
        for (let i = 0; i < cfData.length; i++) {
          const acctRaw = String(cfData[i].account || "");
          const v = acctRaw.replace(/\s/g, "");
          const rn = i + 3; // CF 시트의 데이터 행 번호 (title=1, header=2, items=3+)
          // (참고) 행은 정보용 — EBITDA 합산에서 제외
          if (/\(참고\)/.test(acctRaw)) continue;
          // 통합 라벨 우선 — 잡히면 cfCombinedDARow에 기록 (감가/무형 별도 행 매칭은 skip)
          if (!cfCombinedDARow && /감가상각비(및|와)무형자산상각비/.test(v)) {
            cfCombinedDARow = rn;
            continue;
          }
          if (!cfDeprRow && (v.includes("감가상각비") || v.includes("유형자산감가상각비"))) cfDeprRow = rn;
          if (!cfAmortRow && (v.includes("무형자산상각비") || v.includes("사용권자산상각비"))) cfAmortRow = rn;
          if (!cfInterestPayRow &&
              (v === "이자지급" || v === "이자납부" || v === "이자의지급" || v.endsWith("이자지급") || v.endsWith("이자납부"))) {
            cfInterestPayRow = rn;
          }
        }
        // 통합 행이 있으면 분리 행은 무시 (이중 합산 방지)
        if (cfCombinedDARow) {
          cfDeprRow = cfCombinedDARow;
          cfAmortRow = 0;
        }
      }
      const cfRef = cfSheetName ? `'${cfSheetName}'!` : "";

      // IS 시트 내부에서도 감가/무형 행 검색 (REIT처럼 CF 시트가 없는 회사 fallback)
      // findRow는 IS 시트 acctRowMap을 사용 — 같은 시트 안의 행 번호 반환 (sheet 참조 prefix 불필요)
      const rDeprIS = findRow("감가상각비", "감가상각비용");
      const rAmortIS = findRow("무형자산상각비", "무형자산감가상각비", "사용권자산상각비");

      // 이자비용 셀 참조 빌더: IS "이자비용" > CF "이자지급/이자납부" > IS "금융비용"
      // formula 문자열 형태로 반환 (예: `'7.현금흐름표(연결)'!B30` 또는 `B11`)
      function interestRef(c: string): string | null {
        if (rInterestExact) return `${c}${rInterestExact}`;
        if (cfInterestPayRow) return `${cfRef}${c}${cfInterestPayRow}`;
        if (rFinCost) return `${c}${rFinCost}`;
        return null;
      }

      // EBITDA 행 번호 (EBITDA/이자비용에서 참조)
      const ebitdaRowNum = row + 3; // 영업이익률(0), ROA(1), ROE(2), EBITDA(3)

      const isCfg: RatioCfg[] = [
        { name: "영업이익률", desc: "(영업이익/매출)×100", fmt: '0.0"%"',
          formula: (c) => rOpIncome && rRevenue ? `=IF(${c}${rRevenue}=0,"-",${c}${rOpIncome}/${c}${rRevenue}*100)` : null },
        { name: "총자산이익률(ROA)", desc: "(당기순이익/자산총계)×100", fmt: '0.0"%"',
          formula: (c) => rNI && bsAssetRow ? `=IF(${bsRef}${c}${bsAssetRow}=0,"-",${c}${rNI}/${bsRef}${c}${bsAssetRow}*100)` : null },
        { name: "자기자본이익률(ROE)", desc: "(당기순이익/자본총계)×100", fmt: '0.0"%"',
          formula: (c) => rNI && bsEquityRow ? `=IF(${bsRef}${c}${bsEquityRow}=0,"-",${c}${rNI}/${bsRef}${c}${bsEquityRow}*100)` : null },
        { name: "EBITDA", desc: "영업이익+감가상각비+무형자산상각비", fmt: "#,##0",
          formula: (c) => {
            if (!rOpIncome) return null;
            // rOpIncome 셀도 텍스트(-)일 수 있어 *1 강제 변환
            let f = `=IFERROR(${c}${rOpIncome}*1,0)`;
            // 우선순위 1: CF 통합/분리 행 (보강된 데이터)
            if (cfDeprRow) f += `+IFERROR(ABS(${cfRef}${c}${cfDeprRow}*1),0)`;
            if (cfAmortRow) f += `+IFERROR(ABS(${cfRef}${c}${cfAmortRow}*1),0)`;
            // 우선순위 2: CF에 행이 없을 때만 IS 시트 내부 감가/무형 fallback (REIT 등 CF 미존재 회사용)
            if (!cfDeprRow && !cfAmortRow) {
              if (rDeprIS) f += `+IFERROR(ABS(${c}${rDeprIS}*1),0)`;
              if (rAmortIS) f += `+IFERROR(ABS(${c}${rAmortIS}*1),0)`;
            }
            return f;
          }},
        { name: "EBITDA/이자비용", desc: "EBITDA/|이자비용|", fmt: '0.0"배"',
          formula: (c) => {
            const ref = interestRef(c);
            return ref ? `=IF(${ref}=0,"-",${c}${ebitdaRowNum}/ABS(${ref}))` : null;
          }},
        { name: "이자보상배율", desc: "영업이익/|이자비용|", fmt: '0.0"배"',
          formula: (c) => {
            if (!rOpIncome) return null;
            const ref = interestRef(c);
            return ref ? `=IF(${ref}=0,"-",${c}${rOpIncome}/ABS(${ref}))` : null;
          }},
        { name: "매출증가율", desc: "((당기-전기)/|전기|)×100", fmt: '0.0"%"',
          formula: (c, ci) => {
            if (ci === 0 || !rRevenue) return null;
            const pc = colLetter(ci - 1);
            return `=IF(${pc}${rRevenue}=0,"-",(${c}${rRevenue}-${pc}${rRevenue})/ABS(${pc}${rRevenue})*100)`;
          }},
      ];

      renderRatioRows(isCfg);
    }

    // Formula reference notes
    row += 1;
    ws.getCell(row, 1).value = "※ 주요 재무지표 산출근거";
    ws.getCell(row, 1).font = { name: FONT_NAME, size: 9, bold: true, color: { argb: "FF1F4E79" } };
    row += 1;

    if (stmtType === "BS") {
      const bsFormulas = [
        "총차입금 = 단기차입금 + 장기차입금 + 유동성장기부채 + 사채(전환사채/교환사채 포함) + 리스부채(유동/비유동) + 유동성사채 + 금융부채 등",
        "순차입금 = 총차입금 - 현금및현금성자산",
        "부채비율 = (부채총계 / 자본총계) × 100",
        "유동비율 = (유동자산 / 유동부채) × 100",
        "자기자본비율 = (자본총계 / 자산총계) × 100",
        "차입금의존도 = (총차입금 / 자산총계) × 100",
      ];
      for (const f of bsFormulas) {
        ws.getCell(row, 1).value = f;
        ws.getCell(row, 1).font = { name: FONT_NAME, size: 9, italic: true, color: { argb: "FF666666" } };
        row += 1;
      }
    } else {
      const isFormulas = [
        "영업이익률 = (영업이익 / 매출액) × 100",
        "총자산이익률(ROA) = (당기순이익 / 자산총계) × 100",
        "자기자본이익률(ROE) = (당기순이익 / 자본총계) × 100",
        "EBITDA = 영업이익 + 감가상각비(CF) + 무형자산상각비(CF)",
        "EBITDA/이자비용 = EBITDA / 이자비용  (IS 이자비용 > CF 이자지급 > IS 금융비용)",
        "이자보상배율 = 영업이익 / 이자비용  (IS 이자비용 > CF 이자지급 > IS 금융비용)",
        "매출증가율 = ((당기매출액 - 전기매출액) / |전기매출액|) × 100",
      ];
      for (const f of isFormulas) {
        ws.getCell(row, 1).value = f;
        ws.getCell(row, 1).font = { name: FONT_NAME, size: 9, italic: true, color: { argb: "FF666666" } };
        row += 1;
      }
    }

    row += 1;
    writeSourceNote(ws, row, 1, data.source || "DART Open API");
  } else {
    // No data
    writeMissingNote(
      ws,
      row,
      1,
      "[자료없음] 해당 기업의 공시자료가 없거나 데이터를 조회할 수 없습니다."
    );
    row += 1;
    writeSourceNote(
      ws,
      row,
      1,
      "DART API 키 발급: https://opendart.fss.or.kr/ → 인증키 신청"
    );
  }
}

function createAnalysisSheet(
  wb: ExcelJS.Workbook,
  data: ExcelReportData,
  sheetName: string
): void {
  const ws = wb.addWorksheet(sheetName);
  setColWidths(ws, {
    1: 20,
    2: 14,
    3: 14,
    4: 14,
    5: 16,
    6: 10,
    7: 10,
    8: 45,
  });

  let row = 1;
  const totalCols = 8;

  // Title
  ws.mergeCells(row, 1, row, totalCols);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = "재무 분석 보고서";
  titleCell.font = {
    name: FONT_NAME,
    size: 16,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  titleCell.alignment = CENTER_ALIGN;
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(row, c).fill = ANALYSIS_TITLE_FILL;
    ws.getCell(row, c).border = THIN_BORDER;
  }
  row += 2;

  const report = data.analysis;
  if (!report || !report.corpName) {
    ws.getCell(row, 1).value =
      "재무데이터가 없어 분석을 수행할 수 없습니다.";
    ws.getCell(row, 1).font = NORMAL_FONT;
    return;
  }

  // 1. Company overview
  row = writeSectionHeader(ws, row, "1. 기업 개요 및 산업 벤치마크", totalCols);

  const overviewItems: [string, string][] = [
    ["기업명", report.corpName],
    ["업종 분류", report.industryLabel || "-"],
    ["재무제표 구분", report.fsType || "-"],
    [
      "분석 기간",
      report.years?.length ? report.years.sort().join(", ") : "-",
    ],
  ];

  // Add company info if available
  if (data.companyInfo) {
    overviewItems.splice(1, 0, ["대표이사", data.companyInfo.ceoNm || "-"]);
    overviewItems.splice(2, 0, ["사업자번호", data.companyInfo.bizrNo || "-"]);
    overviewItems.splice(3, 0, ["소재지", data.companyInfo.adres || "-"]);
    overviewItems.splice(4, 0, ["설립일", formatEstDate(data.companyInfo.estDt)]);
  }

  for (const [label, value] of overviewItems) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = {
      name: FONT_NAME,
      size: FONT_SIZE,
      bold: true,
    };
    ws.getCell(row, 1).border = THIN_BORDER;
    ws.getCell(row, 1).fill = LABEL_FILL;
    ws.mergeCells(row, 2, row, 4);
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).font = NORMAL_FONT;
    ws.getCell(row, 2).border = THIN_BORDER;
    row += 1;
  }
  row += 1;

  // Overall grade
  const gradeFill =
    GRADE_FILLS[report.overallGrade] ?? WARN_FILL;
  const gradeTextMap: Record<string, string> = {
    AAA: "AAA등급 (최우량)",
    AA: "AA등급 (우량)",
    A: "A등급 (양호)",
    BBB: "BBB등급 (양호/주의)",
    BB: "BB등급 (보통)",
    B: "B등급 (보통/주의)",
    CCC: "CCC등급 (보통이하)",
    CC: "CC등급 (취약)",
    C: "C등급 (최하위)",
    D: "D등급 (위험)",
  };

  ws.mergeCells(row, 1, row, totalCols);
  const gradeCell = ws.getCell(row, 1);
  gradeCell.value = `종합 재무등급: ${gradeTextMap[report.overallGrade] ?? "-"}`;
  gradeCell.font = { name: FONT_NAME, size: 13, bold: true };
  gradeCell.alignment = CENTER_ALIGN;
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(row, c).fill = gradeFill;
    ws.getCell(row, c).border = THIN_BORDER;
  }
  row += 1;

  // Summary
  ws.mergeCells(row, 1, row, totalCols);
  const summaryCell = ws.getCell(row, 1);
  summaryCell.value = report.overallSummary;
  summaryCell.font = NORMAL_FONT;
  summaryCell.alignment = {
    horizontal: "left",
    vertical: "middle",
    wrapText: true,
  };
  ws.getRow(row).height = 40;
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(row, c).border = THIN_BORDER;
  }
  row += 2;

  // 2. Ratio analysis
  row = writeSectionHeader(ws, row, "2. 주요 재무비율 분석", totalCols);

  const sortedYears = [...(report.years || [])].sort();

  // Table header
  const tableHeaders = [
    "분석 항목",
    ...sortedYears.map((y) => {
      const dotIdx = y.indexOf(".");
      if (dotIdx > 0) return `'${y.slice(2, dotIdx)}.${y.slice(dotIdx + 1)}`;
      return `'${y.slice(2)}년`;
    }),
    "업종평균",
    "추이",
    "판정",
    "진단",
  ];
  for (let ci = 0; ci < tableHeaders.length; ci++) {
    ws.getCell(row, ci + 1).value = tableHeaders[ci];
  }
  applyHeaderStyle(ws, row, 1, tableHeaders.length);
  row += 1;

  const categories: [string, RatioDetail[]][] = [
    ["【 안정성 지표 】", report.stability || []],
    ["【 수익성 지표 】", report.profitability || []],
    ["【 성장성 지표 】", report.growth || []],
    ["【 활동성 지표 】", report.activity || []],
  ];

  for (const [catName, ratioList] of categories) {
    // Category header
    ws.mergeCells(row, 1, row, tableHeaders.length);
    ws.getCell(row, 1).value = catName;
    ws.getCell(row, 1).font = {
      name: FONT_NAME,
      size: FONT_SIZE,
      bold: true,
      color: { argb: "FF1F4E79" },
    };
    for (let c = 1; c <= tableHeaders.length; c++) {
      ws.getCell(row, c).fill = CATEGORY_HEADER_FILL;
      ws.getCell(row, c).border = THIN_BORDER;
    }
    row += 1;

    for (const ra of ratioList) {
      let col = 1;

      // Name
      ws.getCell(row, col).value = ra.name;
      ws.getCell(row, col).font = {
        name: FONT_NAME,
        size: FONT_SIZE,
        bold: true,
      };
      ws.getCell(row, col).border = THIN_BORDER;
      col += 1;

      // Year values
      for (const y of sortedYears) {
        const valStr = ra.valuesStr?.[y] ?? "-";
        const cell = ws.getCell(row, col);
        const valString = String(valStr);
        if (valString.endsWith("%")) {
          const numStr = valString.replace(/%/g, "").replace(/,/g, "").trim();
          const numVal = parseFloat(numStr);
          if (!isNaN(numVal)) {
            cell.value = numVal;
            cell.numFmt = '0.0"%"';
          } else {
            cell.value = valStr;
          }
        } else if (valString !== "-") {
          const numStr = valString.replace(/,/g, "").trim();
          const numVal = parseFloat(numStr);
          if (!isNaN(numVal)) {
            cell.value = numVal;
            cell.numFmt = "#,##0";
          } else {
            cell.value = valStr;
          }
        } else {
          cell.value = valStr;
        }
        cell.font = NORMAL_FONT;
        cell.alignment = RIGHT_ALIGN;
        cell.border = THIN_BORDER;
        col += 1;
      }

      // Benchmark
      ws.getCell(row, col).value = ra.benchmark || "-";
      ws.getCell(row, col).font = SMALL_FONT;
      ws.getCell(row, col).alignment = RIGHT_ALIGN;
      ws.getCell(row, col).border = THIN_BORDER;
      col += 1;

      // Trend
      const trendText = `${ra.trendIcon || ""} ${ra.trend || ""}`.trim();
      ws.getCell(row, col).value = trendText;
      ws.getCell(row, col).font = NORMAL_FONT;
      ws.getCell(row, col).alignment = CENTER_ALIGN;
      ws.getCell(row, col).border = THIN_BORDER;
      col += 1;

      // Judgment (vsBenchmark)
      ws.getCell(row, col).value = ra.vsBenchmark || "-";
      ws.getCell(row, col).font = {
        name: FONT_NAME,
        size: FONT_SIZE,
        bold: true,
      };
      ws.getCell(row, col).alignment = CENTER_ALIGN;
      ws.getCell(row, col).border = THIN_BORDER;
      const vsFill = getVsBenchmarkFill(ra.vsBenchmark);
      if (vsFill) {
        ws.getCell(row, col).fill = vsFill;
      }
      col += 1;

      // Diagnosis
      ws.getCell(row, col).value = ra.diagnosis || "-";
      ws.getCell(row, col).font = SMALL_FONT;
      ws.getCell(row, col).alignment = {
        horizontal: "left",
        vertical: "middle",
        wrapText: true,
      };
      ws.getCell(row, col).border = THIN_BORDER;
      ws.getRow(row).height = 35;
      row += 1;
    }
    row += 1; // gap between categories
  }

  // 3. Detailed diagnosis
  row = writeSectionHeader(ws, row, "3. 항목별 심층 진단", totalCols);

  for (const [catName, ratioList] of categories) {
    const catLabel = catName.replace("【 ", "").replace(" 】", "");
    ws.mergeCells(row, 1, row, totalCols);
    ws.getCell(row, 1).value = `▶ ${catLabel}`;
    ws.getCell(row, 1).font = {
      name: FONT_NAME,
      size: 11,
      bold: true,
      color: { argb: "FF1F4E79" },
    };
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(row, c).border = THIN_BORDER;
    }
    row += 1;

    for (const ra of ratioList) {
      ws.mergeCells(row, 1, row, totalCols);
      const detail = `• ${ra.name} [${ra.vsBenchmark}/${ra.riskLevel} 리스크]: ${ra.diagnosis}`;
      ws.getCell(row, 1).value = detail;
      ws.getCell(row, 1).font = NORMAL_FONT;
      ws.getCell(row, 1).alignment = {
        horizontal: "left",
        vertical: "middle",
        wrapText: true,
      };
      ws.getRow(row).height = 30;
      for (let c = 1; c <= totalCols; c++) {
        ws.getCell(row, c).border = THIN_BORDER;
      }
      row += 1;
    }
    row += 1;
  }

  // 4. Analyst opinion
  row = writeSectionHeader(
    ws,
    row,
    "4. 재무 분석가 소견 및 향후 전망",
    totalCols
  );

  // Risk factors
  if (report.riskFactors && report.riskFactors.length > 0) {
    ws.mergeCells(row, 1, row, totalCols);
    ws.getCell(row, 1).value = "▶ 주요 리스크 요인";
    ws.getCell(row, 1).font = {
      name: FONT_NAME,
      size: FONT_SIZE,
      bold: true,
      color: { argb: "FFC00000" },
    };
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(row, c).border = THIN_BORDER;
    }
    row += 1;

    for (const rf of report.riskFactors) {
      ws.mergeCells(row, 1, row, totalCols);
      ws.getCell(row, 1).value = `  - ${rf}`;
      ws.getCell(row, 1).font = NORMAL_FONT;
      for (let c = 1; c <= totalCols; c++) {
        ws.getCell(row, c).fill = RISK_BG_FILL;
        ws.getCell(row, c).border = THIN_BORDER;
      }
      row += 1;
    }
    row += 1;
  }

  // Opportunity factors
  if (report.opportunityFactors && report.opportunityFactors.length > 0) {
    ws.mergeCells(row, 1, row, totalCols);
    ws.getCell(row, 1).value = "▶ 긍정 요인";
    ws.getCell(row, 1).font = {
      name: FONT_NAME,
      size: FONT_SIZE,
      bold: true,
      color: { argb: "FF006100" },
    };
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(row, c).border = THIN_BORDER;
    }
    row += 1;

    for (const of_ of report.opportunityFactors) {
      ws.mergeCells(row, 1, row, totalCols);
      ws.getCell(row, 1).value = `  - ${of_}`;
      ws.getCell(row, 1).font = NORMAL_FONT;
      for (let c = 1; c <= totalCols; c++) {
        ws.getCell(row, c).fill = OPPORTUNITY_BG_FILL;
        ws.getCell(row, c).border = THIN_BORDER;
      }
      row += 1;
    }
    row += 1;
  }

  // Overall opinion
  ws.mergeCells(row, 1, row, totalCols);
  ws.getCell(row, 1).value = "▶ 종합 소견";
  ws.getCell(row, 1).font = {
    name: FONT_NAME,
    size: FONT_SIZE,
    bold: true,
  };
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(row, c).border = THIN_BORDER;
  }
  row += 1;

  // 종합 소견 — 1행 N칸 병합 + 행 높이 + wrapText로 자동 줄바꿈.
  // (이전: 3행 N칸 병합 → ExcelJS dump 시 3행 모두 동일 텍스트로 보여 검색·복사 시 불편)
  ws.mergeCells(row, 1, row, totalCols);
  const opinionCell = ws.getCell(row, 1);
  opinionCell.value = report.analystOpinion || "-";
  opinionCell.font = NORMAL_FONT;
  opinionCell.alignment = {
    horizontal: "left",
    vertical: "top",
    wrapText: true,
  };
  ws.getRow(row).height = 60; // 약 3행 분량의 높이 확보 (텍스트 wrap 시각 영역)
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(row, c).border = THIN_BORDER;
  }
  row += 2;

  // Source
  writeSourceNote(
    ws,
    row,
    1,
    "DART Open API (금융감독원 전자공시시스템) 기반 자동 분석 / 산업 벤치마크: 한국은행 기업경영분석 참고"
  );

  row += 1;
  ws.getCell(row, 1).value = "※ 분석 모델: NICE BizLine 기반 전문가 분석 엔진 v3.0 + Gemini 2.5 Pro / GPT-4o 병행 분석";
  ws.getCell(row, 1).font = SOURCE_FONT;
}

function createPlaceholderSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string
): void {
  const ws = wb.addWorksheet(sheetName);
  setColWidths(ws, { 1: 20, 2: 40 });

  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = SECTION_FONT;

  ws.getCell(3, 1).value = "[수동입력 필요]";
  ws.getCell(3, 1).font = SOURCE_FONT;
  ws.getCell(3, 1).fill = MISSING_FILL;
}

// ============================================================
// Main export
// ============================================================

// ============================================================
// 증감사유분석 시트
// ============================================================

function createYoYAnalysisSheet(
  wb: ExcelJS.Workbook,
  data: ExcelReportData,
  sheetName: string
): Map<string, number> {
  const rowMap = new Map<string, number>(); // "BS|계정명" → row번호
  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  const items = data.yoyAnalysis || [];
  const bsItems = items.filter(i => i.stmtType === "BS");
  const isItems = items.filter(i => i.stmtType === "IS");

  // 제목
  ws.mergeCells("A1:G1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "■ 전년대비 주요 증감사유 분석                                              (단위:백만원)";
  titleCell.font = { name: FONT_NAME, size: 13, bold: true };
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 30;

  let row = 3;

  function renderSection(sectionItems: typeof items, sectionTitle: string) {
    ws.mergeCells(row, 1, row, 7);
    const secCell = ws.getCell(row, 1);
    secCell.value = sectionTitle;
    secCell.font = { name: FONT_NAME, size: 11, bold: true };
    secCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
    secCell.alignment = { vertical: "middle" };
    ws.getRow(row).height = 24;
    row += 1;

    const headers = ["계정과목", "전기(백만원)", "당기(백만원)", "증감액", "증감률", "출처", "증감사유 분석"];
    headers.forEach((h, ci) => {
      const cell = ws.getCell(row, ci + 1);
      cell.value = h;
      cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = THIN_BORDER;
    });
    ws.getRow(row).height = 22;
    row += 1;

    for (const item of sectionItems) {
      ws.getCell(row, 1).value = item.account;
      ws.getCell(row, 1).font = { name: FONT_NAME, size: FONT_SIZE, bold: true };
      ws.getCell(row, 1).border = THIN_BORDER;

      ws.getCell(row, 2).value = item.prevValue;
      ws.getCell(row, 2).numFmt = "#,##0";
      ws.getCell(row, 2).font = NORMAL_FONT;
      ws.getCell(row, 2).alignment = RIGHT_ALIGN;
      ws.getCell(row, 2).border = THIN_BORDER;

      ws.getCell(row, 3).value = item.curValue;
      ws.getCell(row, 3).numFmt = "#,##0";
      ws.getCell(row, 3).font = NORMAL_FONT;
      ws.getCell(row, 3).alignment = RIGHT_ALIGN;
      ws.getCell(row, 3).border = THIN_BORDER;

      ws.getCell(row, 4).value = item.changeAmount;
      ws.getCell(row, 4).numFmt = "#,##0";
      ws.getCell(row, 4).font = {
        name: FONT_NAME, size: FONT_SIZE,
        color: { argb: item.changeAmount >= 0 ? "FF0070C0" : "FFFF0000" },
      };
      ws.getCell(row, 4).alignment = RIGHT_ALIGN;
      ws.getCell(row, 4).border = THIN_BORDER;

      if (item.changePercent !== null) {
        ws.getCell(row, 5).value = item.changePercent / 100;
        ws.getCell(row, 5).numFmt = "0.0%";
      } else {
        ws.getCell(row, 5).value = "-";
      }
      ws.getCell(row, 5).font = NORMAL_FONT;
      ws.getCell(row, 5).alignment = RIGHT_ALIGN;
      ws.getCell(row, 5).border = THIN_BORDER;

      ws.getCell(row, 6).value = item.noteSource || "-";
      ws.getCell(row, 6).font = { name: FONT_NAME, size: 9, color: { argb: "FF4472C4" } };
      ws.getCell(row, 6).alignment = { vertical: "middle" };
      ws.getCell(row, 6).border = THIN_BORDER;

      ws.getCell(row, 7).value = item.noteDetail || "(주석 미매칭)";
      ws.getCell(row, 7).font = { name: FONT_NAME, size: 9 };
      ws.getCell(row, 7).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, 7).border = THIN_BORDER;

      const textLen = (item.noteDetail || "").length;
      ws.getRow(row).height = Math.max(20, Math.min(80, Math.ceil(textLen / 60) * 15));
      rowMap.set(`${item.stmtType}|${item.account}`, row);
      row += 1;
    }
    row += 1;
  }

  if (bsItems.length > 0) renderSection(bsItems, "【 재무상태표 (BS) 주요 증감 】");
  if (isItems.length > 0) renderSection(isItems, "【 손익계산서 (IS) 주요 증감 】");

  ws.getColumn(1).width = 25;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 28;
  ws.getColumn(7).width = 60;
  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 0 }];

  ws.getCell(row, 1).value = "※ DART 감사보고서 주석에서 자동 추출";
  ws.getCell(row, 1).font = { name: FONT_NAME, size: 9, italic: true, color: { argb: "FF888888" } };

  return rowMap;
}

/** 재무제표 시트의 증감사유 셀에 증감사유분석 시트로의 하이퍼링크 적용 */
function applyYoYHyperlinks(
  wb: ExcelJS.Workbook,
  data: ExcelReportData,
  yoySheetName: string,
  rowMap: Map<string, number>
) {
  if (!data.yoyAnalysis || data.yoyAnalysis.length === 0) return;
  const years = [...(data.years || [])].sort();
  const noteCol = years.length + 4; // 증감사유 컬럼 위치

  // 모든 재무제표 시트 순회
  for (const ws of wb.worksheets) {
    const wsName = ws.name;
    // 재무상태표/손익계산서 시트만 대상
    let stmtType: "BS" | "IS" | null = null;
    if (wsName.includes("재무상태표")) stmtType = "BS";
    else if (wsName.includes("손익계산서")) stmtType = "IS";
    if (!stmtType) continue;

    ws.eachRow((row, rowNum) => {
      const noteCell = row.getCell(noteCol);
      if (!noteCell.value || typeof noteCell.value !== "string") return;
      const val = noteCell.value as string;
      if (!val.startsWith("→ 주석")) return;

      // 이 행의 계정명 추출
      const acctCell = row.getCell(1);
      const acctRaw = String(acctCell.value || "").trim();

      // rowMap에서 해당 항목 찾기
      const key = `${stmtType}|${acctRaw}`;
      const targetRow = rowMap.get(key);
      if (!targetRow) return;

      // 하이퍼링크 설정
      noteCell.value = {
        text: val,
        hyperlink: `#'${yoySheetName}'!A${targetRow}`,
      } as ExcelJS.CellHyperlinkValue;
      noteCell.font = {
        name: FONT_NAME, size: 9,
        color: { argb: "FF4472C4" },
        underline: true,
      };
    });
  }
}

/**
 * Generate an Excel report buffer
 */
export async function generateExcelReport(
  data: ExcelReportData
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "여신승인신청서 자동화";
  wb.created = new Date();

  let tabNum = 1;

  // CF 시트명 사전 계산 — IS 시트의 EBITDA/이자보상배율 수식이 미리 참조 가능하도록.
  // 시트 생성 순서가 BS→IS→CF인데 IS 빌드 시점에 CF는 아직 없어서 wb.worksheets.find가 실패하던 버그 fix.
  const cfOfsAvailable = data.hasOfs && !!(data.cfItemsOfs && data.cfItemsOfs.length > 0);
  const cfCfsAvailable = data.hasCfs && !!(data.cfItemsCfs && data.cfItemsCfs.length > 0);
  const cfOfsTabNum = data.hasOfs ? 4 : 0; // Summary(1)+BS개별(2)+IS개별(3)+CF개별(4)
  const cfOfsSheetName = cfOfsAvailable ? `${cfOfsTabNum}.현금흐름표(개별)` : undefined;
  // CF 연결 시트 번호: cfOfsTabNum 다음 + BS연결(+1) + IS연결(+1) → +3 (CF 개별이 있을 때) 또는 +2
  const cfsTabBase = cfOfsAvailable ? cfOfsTabNum + 2 : (data.hasOfs ? 4 : 1);
  const cfCfsTabNum = data.hasCfs ? cfsTabBase + 1 : 0;
  const cfCfsSheetName = cfCfsAvailable ? `${cfCfsTabNum}.현금흐름표(연결)` : undefined;

  // 1. Dashboard (대시보드 — 화면 차트 대시보드와 동일 구성)
  createDashboardSheet(wb, data);

  // 2. BS Individual
  if (data.hasOfs) {
    tabNum += 1;
    createFinancialSheet(
      wb,
      data,
      `${tabNum}.재무상태표(개별)`,
      "BS",
      "OFS"
    );

    // 3. IS Individual — CF 시트명 hint 전달
    tabNum += 1;
    createFinancialSheet(
      wb,
      data,
      `${tabNum}.손익계산서(개별)`,
      "IS",
      "OFS",
      cfOfsSheetName
    );
  }

  // CF Individual (if available)
  if (cfOfsAvailable) {
    tabNum += 1;
    createFinancialSheet(wb, data, `${tabNum}.현금흐름표(개별)`, "CF", "OFS");
  }

  // Consolidated (if available)
  if (data.hasCfs) {
    tabNum += 1;
    createFinancialSheet(
      wb,
      data,
      `${tabNum}.재무상태표(연결)`,
      "BS",
      "CFS"
    );
    tabNum += 1;
    createFinancialSheet(
      wb,
      data,
      `${tabNum}.손익계산서(연결)`,
      "IS",
      "CFS",
      cfCfsSheetName
    );
    if (cfCfsAvailable) {
      tabNum += 1;
      createFinancialSheet(wb, data, `${tabNum}.현금흐름표(연결)`, "CF", "CFS");
    }
  }

  // 6. Financial analysis
  tabNum += 1;
  createAnalysisSheet(wb, data, `${tabNum}.재무분석`);

  // 차입금 내역 시트 (주석 데이터가 있을 때)
  if (data.borrowingNotes && data.borrowingNotes.details.length > 0) {
    tabNum += 1;
    const bnSheet = wb.addWorksheet(`${tabNum}.차입금내역`, {
      views: [{ showGridLines: true }],
    });

    const bn = data.borrowingNotes;

    // 제목
    bnSheet.mergeCells("A1:G1");
    const bnTitleCell = bnSheet.getCell("A1");
    bnTitleCell.value = `■ ${bn.title} (${bn.fiscalYear}년 기준)`;
    bnTitleCell.font = { name: FONT_NAME, size: 13, bold: true };
    bnTitleCell.alignment = { vertical: "middle" };
    bnSheet.getRow(1).height = 30;

    // 헤더
    const bnHeaders = ["구분", "차입처", "이자율", "만기일", "당기말", "전기말", "통화"];
    const bnHeaderRow = bnSheet.getRow(3);
    bnHeaders.forEach((h, ci) => {
      const cell = bnHeaderRow.getCell(ci + 1);
      cell.value = h;
      cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = THIN_BORDER;
    });
    bnHeaderRow.height = 22;

    // 데이터행
    let bnRow = 4;
    for (const detail of bn.details) {
      const isTotal = /합계|소계|계$/.test(detail.category.replace(/\s/g, ""));
      const row = bnSheet.getRow(bnRow);
      const vals = [
        detail.category,
        detail.lender,
        detail.interestRate,
        detail.maturityDate,
        detail.currentAmount,
        detail.previousAmount,
        detail.currency,
      ];
      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: isTotal };
        cell.border = THIN_BORDER;
        // 금액 컬럼 우측정렬
        if (ci >= 4 && ci <= 5) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
        if (isTotal) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F2F2" },
          };
        }
      });
      row.height = 20;
      bnRow++;
    }

    // 컬럼 너비 설정
    bnSheet.columns = [
      { width: 18 }, // 구분
      { width: 20 }, // 차입처
      { width: 14 }, // 이자율
      { width: 16 }, // 만기일
      { width: 18 }, // 당기말
      { width: 18 }, // 전기말
      { width: 10 }, // 통화
    ];

    // 출처 표시
    bnRow += 1;
    bnSheet.getCell(`A${bnRow}`).value = "※ DART 감사보고서 주석에서 자동 추출";
    bnSheet.getCell(`A${bnRow}`).font = { name: FONT_NAME, size: 9, italic: true, color: { argb: "FF888888" } };
  }

  // 증감사유분석 시트 (yoyAnalysis 데이터 있을 때)
  let yoySheetName: string | undefined;
  let yoyRowMap: Map<string, number> | undefined;
  if (data.yoyAnalysis && data.yoyAnalysis.length > 0) {
    tabNum += 1;
    yoySheetName = `${tabNum}.증감사유분석`;
    yoyRowMap = createYoYAnalysisSheet(wb, data, yoySheetName);
  }

  // 재무제표 시트에 증감사유 하이퍼링크 후처리 적용
  if (yoySheetName && yoyRowMap && yoyRowMap.size > 0) {
    applyYoYHyperlinks(wb, data, yoySheetName, yoyRowMap);
  }

  // Write to buffer
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
