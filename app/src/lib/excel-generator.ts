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
  bsItemsCfs: StatementItem[];
  isItemsCfs: StatementItem[];
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

/**
 * Calculate year-over-year percentage change between two string-formatted numbers.
 * Returns formatted string like "12.3%" or null if not calculable.
 */
function calcYoyChange(
  currentStr: string,
  previousStr: string
): string | null {
  try {
    const curr = parseFloat(
      String(currentStr).replace(/,/g, "").replace(/\s/g, "")
    );
    const prev = parseFloat(
      String(previousStr).replace(/,/g, "").replace(/\s/g, "")
    );
    if (isNaN(curr) || isNaN(prev) || prev === 0) return null;
    const change = ((curr - prev) / Math.abs(prev)) * 100;
    return `${change.toFixed(1)}%`;
  } catch {
    return null;
  }
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

function createSummarySheet(
  wb: ExcelJS.Workbook,
  data: ExcelReportData
): void {
  const ws = wb.addWorksheet("1.요약");
  setColWidths(ws, { 1: 20, 2: 40, 3: 20, 4: 30 });

  let row = 1;

  // Title
  ws.getCell(row, 1).value = "여신승인신청서 - 재무현황 분석 결과";
  ws.getCell(row, 1).font = TITLE_FONT;
  row += 2;

  // Company name
  ws.getCell(row, 1).value = "기업명";
  ws.getCell(row, 1).font = SECTION_FONT;
  ws.getCell(row, 2).value = data.corpName;
  ws.getCell(row, 2).font = NORMAL_FONT;
  row += 1;

  // Analysis date
  ws.getCell(row, 1).value = "분석일자";
  ws.getCell(row, 1).font = SECTION_FONT;
  ws.getCell(row, 2).value = new Date().toISOString().split("T")[0];
  ws.getCell(row, 2).font = NORMAL_FONT;
  row += 2;

  // Extraction status table
  const headers = ["항목", "추출 상태", "데이터 건수", "출처"];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
  });
  applyHeaderStyle(ws, row, 1, headers.length);
  row += 1;

  const bsOfsCount = data.bsItemsOfs?.length ?? 0;
  const isOfsCount = data.isItemsOfs?.length ?? 0;
  const bsCfsCount = data.bsItemsCfs?.length ?? 0;
  const isCfsCount = data.isItemsCfs?.length ?? 0;

  const items: [string, string, string, string][] = [
    [
      "재무상태표 (BS) [개별]",
      data.hasOfs && bsOfsCount > 0 ? "추출완료" : "자료없음",
      data.hasOfs && bsOfsCount > 0 ? `${bsOfsCount}개 항목` : "-",
      data.hasOfs ? "DART Open API (금융감독원)" : "DART 데이터 없음",
    ],
    [
      "손익계산서 (IS) [개별]",
      data.hasOfs && isOfsCount > 0 ? "추출완료" : "자료없음",
      data.hasOfs && isOfsCount > 0 ? `${isOfsCount}개 항목` : "-",
      data.hasOfs ? "DART Open API (금융감독원)" : "DART 데이터 없음",
    ],
    [
      "재무상태표 (BS) [연결]",
      data.hasCfs && bsCfsCount > 0 ? "추출완료" : "자료없음",
      data.hasCfs && bsCfsCount > 0 ? `${bsCfsCount}개 항목` : "-",
      data.hasCfs ? "DART Open API (금융감독원)" : "연결재무제표 없음",
    ],
    [
      "손익계산서 (IS) [연결]",
      data.hasCfs && isCfsCount > 0 ? "추출완료" : "자료없음",
      data.hasCfs && isCfsCount > 0 ? `${isCfsCount}개 항목` : "-",
      data.hasCfs ? "DART Open API (금융감독원)" : "연결재무제표 없음",
    ],
    [
      "재무분석",
      data.analysis ? "분석완료" : "자료없음",
      data.analysis ? "1건" : "-",
      data.analysis ? "AI 기반 재무비율 분석" : "-",
    ],
  ];

  for (const [itemName, status, count, source] of items) {
    const isMissing = status.includes("자료없음");
    ws.getCell(row, 1).value = itemName;
    ws.getCell(row, 2).value = status;
    ws.getCell(row, 3).value = count;
    ws.getCell(row, 4).value = source;
    applyDataStyle(ws, row, 1, 4, isMissing);
    row += 1;
  }

  row += 1;
  writeSourceNote(ws, row, 1, data.source || "DART Open API");
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
  stmtType: "BS" | "IS",
  fsDiv: "OFS" | "CFS"
): void {
  const ws = wb.addWorksheet(sheetName);
  setColWidths(ws, { 1: 40, 2: 15, 3: 15, 4: 15, 5: 15, 6: 12 });

  const years = [...(data.years || [])].sort();
  // Set column widths dynamically for year columns and change column
  for (let i = 0; i < years.length; i++) {
    ws.getColumn(i + 2).width = 15;
  }
  if (years.length > 0) {
    ws.getColumn(years.length + 2).width = 12;
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
  const titleText =
    stmtType === "BS"
      ? `■ 재무상태표${fsLabel}                                              (단위:백만원)`
      : `■ 손익계산서${fsLabel}                                              (단위:백만원)`;
  ws.getCell(row, 1).value = titleText;
  ws.getCell(row, 1).font = SECTION_FONT;
  row += 1;

  // Pick data
  const items =
    fsDiv === "OFS"
      ? stmtType === "BS"
        ? data.bsItemsOfs
        : data.isItemsOfs
      : stmtType === "BS"
        ? data.bsItemsCfs
        : data.isItemsCfs;

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
    ws.getCell(row, years.length + 2).value = "전년비 증감";
    applyHeaderStyle(ws, row, 1, years.length + 2);
    row += 1;

    // Freeze panes below header
    ws.views = [{ state: "frozen", ySplit: row - 1, xSplit: 0 }];

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

        // YoY change for last year
        if (ci === years.length - 1 && prevVal !== undefined) {
          const chg = calcYoyChange(String(valStr), prevVal);
          if (chg !== null) {
            const chgCell = ws.getCell(row, years.length + 2);
            // Parse YoY change percentage as number
            const chgStripped = chg.replace(/%/g, "").trim();
            const chgParsed = parseFloat(chgStripped);
            if (!isNaN(chgParsed)) {
              chgCell.value = chgParsed / 100;
              chgCell.numFmt = "0.0%";
            } else {
              chgCell.value = chg;
            }
            chgCell.font = NORMAL_FONT;
            chgCell.alignment = RIGHT_ALIGN;
            chgCell.border = THIN_BORDER;
          }
        }
        prevVal = String(valStr);
      }
      row += 1;
    }

    // Ratio rows
    row += 1;
    const ratioNames =
      stmtType === "BS"
        ? ["총차입금", "순차입금", "부채비율", "유동비율", "자기자본비율", "차입금의존도"]
        : ["영업이익률", "총자산이익률(ROA)", "자기자본이익률(ROE)", "EBITDA", "EBITDA/이자비용", "이자보상배율", "매출증가율"];

    if (ratios) {
      const amountRatios = ["총차입금", "순차입금", "EBITDA"];
      for (const rName of ratioNames) {
        ws.getCell(row, 1).value = rName;
        ws.getCell(row, 1).font = {
          name: FONT_NAME,
          size: FONT_SIZE,
          bold: true,
        };
        ws.getCell(row, 1).border = THIN_BORDER;
        ws.getCell(row, 1).fill = RATIO_FILL;

        for (let ci = 0; ci < years.length; ci++) {
          const yr = years[ci];
          const yrRatios = ratios[yr] ?? {};
          const val = yrRatios[rName] ?? "-";
          const cell = ws.getCell(row, ci + 2);

          const valString = String(val);
          if (valString.endsWith("%")) {
            const numStr = valString.replace(/%/g, "").replace(/,/g, "").trim();
            const numVal = parseFloat(numStr);
            if (!isNaN(numVal)) {
              cell.value = numVal;
              cell.numFmt = '0.0"%"';
            } else {
              cell.value = val;
            }
          } else if (amountRatios.includes(rName)) {
            const numStr = valString.replace(/,/g, "").trim();
            const numVal = parseFloat(numStr);
            if (!isNaN(numVal)) {
              cell.value = numVal;
              cell.numFmt = "#,##0";
            } else {
              cell.value = val;
            }
          } else {
            cell.value = val;
          }

          cell.font = NORMAL_FONT;
          cell.alignment = RIGHT_ALIGN;
          cell.border = THIN_BORDER;
          cell.fill = RATIO_FILL;
        }
        row += 1;
      }
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
        "EBITDA = 영업이익 + 감가상각비 + 무형자산상각비",
        "EBITDA/이자비용 = EBITDA / 이자비용(금융비용) — 배수 표시",
        "이자보상배율 = 영업이익 / 이자비용(금융비용) — 배수 표시",
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

  ws.mergeCells(row, 1, row + 2, totalCols);
  const opinionCell = ws.getCell(row, 1);
  opinionCell.value = report.analystOpinion || "-";
  opinionCell.font = NORMAL_FONT;
  opinionCell.alignment = {
    horizontal: "left",
    vertical: "top",
    wrapText: true,
  };
  for (let r = row; r <= row + 2; r++) {
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(r, c).border = THIN_BORDER;
    }
  }
  row += 4;

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

/**
 * Generate an Excel report buffer for the 여신승인신청서 자동화 system.
 *
 * @param data - Report data including financial statements and analysis
 * @returns Buffer containing the xlsx file
 */
export async function generateExcelReport(
  data: ExcelReportData
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "여신승인신청서 자동화";
  wb.created = new Date();

  let tabNum = 1;

  // 1. Summary
  createSummarySheet(wb, data);

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

    // 3. IS Individual
    tabNum += 1;
    createFinancialSheet(
      wb,
      data,
      `${tabNum}.손익계산서(개별)`,
      "IS",
      "OFS"
    );
  }

  // 4-5. Consolidated (if available)
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
      "CFS"
    );
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

  // 7-10. Placeholder sheets for collateral analysis
  tabNum += 1;
  createPlaceholderSheet(
    wb,
    `${tabNum}.담보물조사`,
    "■ 담보물 조사"
  );

  tabNum += 1;
  createPlaceholderSheet(
    wb,
    `${tabNum}.낙찰률통계`,
    "■ 지역·용도별 낙찰통계"
  );

  tabNum += 1;
  createPlaceholderSheet(
    wb,
    `${tabNum}.담보물사진`,
    "■ 위치도 및 현장사진"
  );

  tabNum += 1;
  createPlaceholderSheet(
    wb,
    `${tabNum}.비준사례`,
    "■ 비준사례"
  );

  // Write to buffer
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
