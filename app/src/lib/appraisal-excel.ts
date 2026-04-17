/**
 * 본 파일은 시산가액검토 + 경매통계(감평) 시트만 보존합니다.
 * 신청서 양식 시트(담보분석/상세담보/비준사례/공급분양)는
 * lib/appraisal/sheet-builders/*로 이동했습니다 (2026-04-17, v3 리팩터).
 *
 * 외부 진입점: `generateAppraisalExcel(data, parseResult?)`
 *   - parseResult.valuationSummary 가 있으면 시산가액검토 시트 생성
 *   - parseResult.auctionQuote 가 있으면 경매통계(감평) 시트 생성
 *   - 둘 다 없으면 빈 워크북 반환 (레거시 호출 대비)
 *
 * 새로운 신청서 양식 엑셀은 `lib/appraisal/orchestrator.ts` 의
 * `generateAppraisalExcel` (OrchestratorOutput 반환) 을 사용하세요.
 */

import * as ExcelJS from "exceljs";
import type {
  AppraisalCase,
  AuctionQuote,
  AppraisalParseResult,
} from "@/types/appraisal";

// ============================================================
// Style constants
// ============================================================

const FONT = "맑은 고딕";

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F172A" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: FONT,
  bold: true,
  size: 10,
  color: { argb: "FFFFFFFF" },
};

const SUBTITLE_FONT: Partial<ExcelJS.Font> = {
  name: FONT,
  bold: true,
  size: 11,
};

const DATA_FONT: Partial<ExcelJS.Font> = {
  name: FONT,
  size: 10,
};

const LABEL_FONT: Partial<ExcelJS.Font> = {
  name: FONT,
  size: 10,
  bold: true,
};

const NUM_FMT = "#,##0";
const PCT_FMT = "0.00%";

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

const LABEL_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
};

const SUB_HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEEF2FF" },
};

const CENTER: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};

const LEFT: Partial<ExcelJS.Alignment> = {
  horizontal: "left",
  vertical: "middle",
  wrapText: true,
};

const RIGHT: Partial<ExcelJS.Alignment> = {
  horizontal: "right",
  vertical: "middle",
  wrapText: true,
};

// ============================================================
// Helpers
// ============================================================

function setCell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string | number,
  opts?: {
    font?: Partial<ExcelJS.Font>;
    fill?: ExcelJS.FillPattern;
    alignment?: Partial<ExcelJS.Alignment>;
    border?: Partial<ExcelJS.Borders>;
    numFmt?: string;
  }
) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  if (opts?.font) cell.font = opts.font;
  if (opts?.fill) cell.fill = opts.fill;
  if (opts?.alignment) cell.alignment = opts.alignment;
  if (opts?.border) cell.border = opts.border;
  if (opts?.numFmt) cell.numFmt = opts.numFmt;
}

function setHeaderRow(
  ws: ExcelJS.Worksheet,
  row: number,
  headers: string[],
  startCol = 1
) {
  headers.forEach((h, i) => {
    setCell(ws, row, startCol + i, h, {
      font: HEADER_FONT,
      fill: HEADER_FILL,
      alignment: CENTER,
      border: BORDER_THIN,
    });
  });
}

function setDataRow(
  ws: ExcelJS.Worksheet,
  row: number,
  values: (string | number)[],
  opts?: {
    numCols?: number[];
    pctCols?: number[];
    startCol?: number;
  }
) {
  const startCol = opts?.startCol ?? 1;
  const numCols = new Set(opts?.numCols ?? []);
  const pctCols = new Set(opts?.pctCols ?? []);

  values.forEach((v, i) => {
    const col = startCol + i;
    const isNum = numCols.has(i);
    const isPct = pctCols.has(i);
    setCell(ws, row, col, v, {
      font: DATA_FONT,
      alignment: isNum || isPct ? RIGHT : CENTER,
      border: BORDER_THIN,
      numFmt: isNum ? NUM_FMT : isPct ? PCT_FMT : undefined,
    });
  });
}

function setKvRow(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string | number,
  labelCols: [number, number],
  valueCols: [number, number],
  opts?: { numFmt?: string }
) {
  ws.mergeCells(row, labelCols[0], row, labelCols[1]);
  setCell(ws, row, labelCols[0], label, {
    font: LABEL_FONT,
    fill: LABEL_FILL,
    alignment: CENTER,
    border: BORDER_THIN,
  });
  ws.mergeCells(row, valueCols[0], row, valueCols[1]);
  setCell(ws, row, valueCols[0], value, {
    font: DATA_FONT,
    alignment: LEFT,
    border: BORDER_THIN,
    numFmt: opts?.numFmt,
  });
}

// ============================================================
// Sheet: 시산가액검토
// ============================================================

function buildValuationSheet(
  wb: ExcelJS.Workbook,
  summary: NonNullable<AppraisalParseResult["valuationSummary"]>,
) {
  const ws = wb.addWorksheet("시산가액검토");
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 25;
  ws.getColumn(3).width = 25;

  let r = 1;

  // Title
  ws.mergeCells(r, 1, r, 3);
  setCell(ws, r, 1, "시산가액 검토", {
    font: { name: FONT, bold: true, size: 14 },
    alignment: CENTER,
  });
  r++;

  // Subtitle
  ws.mergeCells(r, 1, r, 3);
  setCell(ws, r, 1, "거래사례비교법 vs 수익환원법", {
    font: SUBTITLE_FONT,
    alignment: CENTER,
  });
  r++;
  r++; // blank row

  // Header
  setHeaderRow(ws, r, ["구분", "비교방식(원)", "수익방식(원)"]);
  r++;

  // Data row
  setDataRow(ws, r, ["합계", summary.comparisonTotal, summary.incomeTotal], {
    numCols: [1, 2],
  });
  r++;
  r++; // blank row

  // 감정평가액 결정
  ws.mergeCells(r, 1, r, 3);
  setCell(ws, r, 1, "감정평가액 결정", {
    font: SUBTITLE_FONT,
    fill: SUB_HEADER_FILL,
    alignment: CENTER,
    border: BORDER_THIN,
  });
  r++;

  setKvRow(ws, r, "결정방법", summary.method, [1, 1], [2, 3]);
  r++;

  setKvRow(ws, r, "최종 감정평가액", summary.finalValue, [1, 1], [2, 3], {
    numFmt: NUM_FMT,
  });
  r++;
}

// ============================================================
// Sheet: 경매통계(감평)
// ============================================================

function buildAuctionQuoteSheet(
  wb: ExcelJS.Workbook,
  aq: AuctionQuote,
) {
  const ws = wb.addWorksheet("경매통계(감평)");
  ws.getColumn(1).width = 15;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 10;
  ws.getColumn(7).width = 12;

  let r = 1;

  // Title
  ws.mergeCells(r, 1, r, 7);
  setCell(ws, r, 1, "경매통계 (감정평가서 인용)", {
    font: { name: FONT, bold: true, size: 14 },
    alignment: CENTER,
  });
  r++;

  // KV rows
  setKvRow(ws, r, "지역", aq.region, [1, 1], [2, 7]);
  r++;
  setKvRow(ws, r, "기간", aq.period, [1, 1], [2, 7]);
  r++;
  setKvRow(ws, r, "출처", aq.source, [1, 1], [2, 7]);
  r++;
  r++; // blank row

  // Header
  setHeaderRow(ws, r, [
    "용도", "총감정가", "총낙찰가", "낙찰가율(%)",
    "총건수", "낙찰건수", "낙찰률(%)",
  ]);
  r++;

  // Data rows
  for (const row of aq.rows) {
    setDataRow(
      ws,
      r,
      [
        row.usage,
        row.totalAppraisal,
        row.totalBid,
        row.bidRate,
        row.totalCases,
        row.bidCases,
        row.bidCaseRate,
      ],
      { numCols: [1, 2, 4, 5], pctCols: [3, 6] },
    );
    r++;
  }
}

// ============================================================
// Main export
// ============================================================

export async function generateAppraisalExcel(
  _data: AppraisalCase,
  parseResult?: Partial<AppraisalParseResult>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  if (parseResult?.valuationSummary) {
    buildValuationSheet(wb, parseResult.valuationSummary);
  }
  if (parseResult?.auctionQuote) {
    buildAuctionQuoteSheet(wb, parseResult.auctionQuote);
  }

  // 양 시트 모두 미해당일 경우 최소 워크시트 1개 보장(ExcelJS가 빈 워크북 저장 시 에러)
  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet("안내");
    ws.getCell("A1").value =
      "이 워크북은 시산가액검토/경매통계 데이터가 없어 비어 있습니다. 신청서 양식은 /api/appraisal/generate 를 사용하세요.";
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
