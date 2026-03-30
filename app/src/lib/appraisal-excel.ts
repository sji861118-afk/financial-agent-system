/**
 * 감정평가 담보분석 Excel 생성기
 *
 * 시트 구성:
 *   1. 담보분석      - 담보물 조사, 권리현황, 낙찰통계, 회수예상가
 *   2. 공급개요      - 사업개요, 공급테이블
 *   3. 상세담보현황  - 호실별 상세 담보 데이터
 *   4. DATA_담보     - 담보 raw 데이터
 *   5. DATA_공급     - 공급 raw 데이터
 */

import * as ExcelJS from "exceljs";
import type {
  AppraisalCase,
  CollateralItem,
  RightEntry,
  AuctionStatRow,
  SupplyRow,
  CollateralDetailItem,
} from "@/types/appraisal";

// ============================================================
// Style constants (matching excel-generator.ts)
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

const TITLE_FONT: Partial<ExcelJS.Font> = {
  name: FONT,
  bold: true,
  size: 14,
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
// Sheet 1: 담보분석
// ============================================================

function buildCollateralSheet(wb: ExcelJS.Workbook, data: AppraisalCase) {
  const ws = wb.addWorksheet("담보분석");
  const c = data.collateral;
  const auction = data.auctionStats;
  const recovery = data.recoveryEstimate;

  // Column widths (A~J = 10 columns)
  ws.columns = [
    { width: 14 }, // A
    { width: 14 }, // B
    { width: 14 }, // C
    { width: 14 }, // D
    { width: 14 }, // E
    { width: 16 }, // F
    { width: 16 }, // G
    { width: 16 }, // H
    { width: 16 }, // I
    { width: 14 }, // J
  ];

  let r = 1;

  // Title
  ws.mergeCells(r, 1, r, 10);
  setCell(ws, r, 1, "■ 담보분석", { font: TITLE_FONT, alignment: LEFT });
  r += 2;

  // Subtitle: 1. 담보물 조사
  ws.mergeCells(r, 1, r, 10);
  setCell(ws, r, 1, "1. 담보물 조사", { font: SUBTITLE_FONT, alignment: LEFT });
  r += 1;

  // Key-value pairs (2 columns of key-value per row)
  const kvPairs: [string, string | number, string, string | number][] = [
    ["소유자", c.owner, "위탁자", c.trustee],
    ["평가기관", c.appraiser, "채무자", c.debtor],
    ["목적", c.purpose, "제출처", c.submittedTo],
    ["기준일", c.baseDate, "일련번호", c.serialNo],
    ["감정가", c.appraisalValue, "비준가치", `비교: ${c.method.comparison}, 원가: ${c.method.cost}, 수익: ${c.method.income}`],
  ];

  for (const [lbl1, val1, lbl2, val2] of kvPairs) {
    setKvRow(ws, r, lbl1, val1, [1, 1], [2, 4], {
      numFmt: typeof val1 === "number" ? NUM_FMT : undefined,
    });
    // Second pair in same row
    ws.mergeCells(r, 5, r, 5);
    setCell(ws, r, 5, lbl2, {
      font: LABEL_FONT,
      fill: LABEL_FILL,
      alignment: CENTER,
      border: BORDER_THIN,
    });
    ws.mergeCells(r, 6, r, 10);
    setCell(ws, r, 6, val2, {
      font: DATA_FONT,
      alignment: LEFT,
      border: BORDER_THIN,
      numFmt: typeof val2 === "number" ? NUM_FMT : undefined,
    });
    r++;
  }

  r += 1;

  // Collateral items table
  ws.mergeCells(r, 1, r, 10);
  setCell(ws, r, 1, "2. 담보물건", { font: SUBTITLE_FONT, alignment: LEFT });
  r += 1;

  const itemHeaders = [
    "구분",
    "수량",
    "면적(㎡)",
    "면적(평)",
    "감정가",
    "담보인정비율",
    "선순위",
    "담보가용가",
    "LTV",
  ];
  // Merge col J into I header for now; use 9 columns A~I
  setHeaderRow(ws, r, itemHeaders);
  r += 1;

  const items: CollateralItem[] = c.items ?? [];
  for (const item of items) {
    setDataRow(ws, r, [
      item.type,
      item.quantity,
      item.areaSqm,
      item.areaPyeong,
      item.appraisalValue,
      item.collateralRatio,
      item.priorClaims,
      item.availableValue,
      item.ltv,
    ], { numCols: [1, 2, 3, 4, 6, 7], pctCols: [5, 8] });
    r++;
  }

  // Totals row
  setCell(ws, r, 1, "합계", {
    font: LABEL_FONT,
    fill: SUB_HEADER_FILL,
    alignment: CENTER,
    border: BORDER_THIN,
  });
  const totals = [
    "",
    c.totalArea,
    c.totalAreaPyeong,
    c.appraisalValue,
    c.collateralRatio,
    c.priorClaims,
    c.availableValue,
    c.ltv,
  ];
  totals.forEach((v, i) => {
    const col = i + 2;
    const isPct = i === 4 || i === 7;
    setCell(ws, r, col, v, {
      font: LABEL_FONT,
      fill: SUB_HEADER_FILL,
      alignment: isPct ? RIGHT : RIGHT,
      border: BORDER_THIN,
      numFmt: isPct ? PCT_FMT : (typeof v === "number" ? NUM_FMT : undefined),
    });
  });
  r += 2;

  // Rights section
  ws.mergeCells(r, 1, r, 10);
  setCell(ws, r, 1, "3. 권리현황", { font: SUBTITLE_FONT, alignment: LEFT });
  r += 1;

  const rightHeaders = [
    "순위",
    "권리종류",
    "권리자명",
    "원금",
    "설정비율(%)",
    "채권최고액",
    "LTV(%)",
  ];
  setHeaderRow(ws, r, rightHeaders);
  r += 1;

  const rights: RightEntry[] = c.rights ?? [];
  for (const rt of rights) {
    setDataRow(ws, r, [
      rt.order,
      rt.type,
      rt.holder,
      rt.principal,
      rt.settingRatio,
      rt.maxClaim,
      rt.ltv,
    ], { numCols: [0, 3, 5], pctCols: [4, 6] });
    r++;
  }

  r += 1;

  // Auction stats
  ws.mergeCells(r, 1, r, 7);
  setCell(ws, r, 1, "4. 지역·용도별 낙찰통계", {
    font: SUBTITLE_FONT,
    alignment: LEFT,
  });
  ws.mergeCells(r, 8, r, 10);
  setCell(ws, r, 8, `출처: ${auction.source}`, {
    font: { name: FONT, size: 9, italic: true, color: { argb: "FF888888" } },
    alignment: RIGHT,
  });
  r += 1;

  const regionLabel = auction.region || "광역시도";
  const districtLabel = auction.district || "시군구";
  const dongLabel = auction.dong || "읍면동";

  setHeaderRow(ws, r, [
    "기간",
    `${regionLabel} 낙찰가율`,
    "건수",
    `${districtLabel} 낙찰가율`,
    "건수",
    `${dongLabel} 낙찰가율`,
    "건수",
  ]);
  r += 1;

  const stats: AuctionStatRow[] = auction.stats ?? [];
  for (const s of stats) {
    setDataRow(ws, r, [
      s.period,
      s.regional.rate,
      s.regional.count,
      s.district.rate,
      s.district.count,
      s.dong.rate,
      s.dong.count,
    ], { pctCols: [1, 3, 5], numCols: [2, 4, 6] });
    r++;
  }

  r += 1;

  // Recovery estimate
  ws.mergeCells(r, 1, r, 10);
  setCell(ws, r, 1, "5. 회수예상가 산출", {
    font: SUBTITLE_FONT,
    alignment: LEFT,
  });
  r += 1;

  const recHeaders = [
    "감정가",
    "적용낙찰가율",
    "선순위",
    "동순위 당사지분",
    "배분액",
    "회수액",
    "손실액",
  ];
  setHeaderRow(ws, r, recHeaders);
  r += 1;

  setDataRow(ws, r, [
    recovery.appraisalValue,
    recovery.appliedRate,
    recovery.priorClaims,
    recovery.pariPassuShare,
    recovery.distributionAmount,
    recovery.recoveryAmount,
    recovery.lossAmount,
  ], { numCols: [0, 2, 3, 4, 5, 6], pctCols: [1] });
  r += 2;

  // Opinion
  ws.mergeCells(r, 1, r, 10);
  setCell(ws, r, 1, "심사의견", { font: SUBTITLE_FONT, alignment: LEFT });
  r += 1;

  ws.mergeCells(r, 1, r, 10);
  const opinionRow = ws.getRow(r);
  opinionRow.height = 60;
  setCell(ws, r, 1, recovery.opinion || c.opinion || "", {
    font: DATA_FONT,
    alignment: { ...LEFT, wrapText: true },
    border: BORDER_THIN,
  });
}

// ============================================================
// Sheet 2: 공급개요
// ============================================================

function buildSupplySheet(wb: ExcelJS.Workbook, data: AppraisalCase) {
  const ws = wb.addWorksheet("공급개요");
  const s = data.supply;
  const p = s.project;

  ws.columns = [
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 12 },
  ];

  let r = 1;

  // Title
  ws.mergeCells(r, 1, r, 9);
  setCell(ws, r, 1, "■ 공급개요", { font: TITLE_FONT, alignment: LEFT });
  r += 2;

  // Subtitle: 1. 사업개요
  ws.mergeCells(r, 1, r, 9);
  setCell(ws, r, 1, "1. 사업개요", { font: SUBTITLE_FONT, alignment: LEFT });
  r += 1;

  const projectKv: [string, string | number][] = [
    ["사업명", p.name],
    ["사업목적", p.purpose],
    ["시행사", p.developer],
    ["시공사", p.constructor],
    ["소재지", p.address],
    ["용도지역", p.zoning],
    ["대지면적", `${p.landArea.sqm}㎡ (${p.landArea.pyeong}평)`],
    ["건축면적", `${p.buildingArea.sqm}㎡ (${p.buildingArea.pyeong}평)`],
    ["연면적", `${p.grossArea.sqm}㎡ (${p.grossArea.pyeong}평)`],
    ["건폐율", `${(p.coverageRatio * 100).toFixed(2)}%`],
    ["용적률", `${(p.floorAreaRatio * 100).toFixed(2)}%`],
    ["주차대수", `${p.parking}대`],
    ["규모", p.scale],
    ["공사기간", p.constructionPeriod],
    ["준공예정일", p.completionDate],
    ["분양률", `${(p.salesRate * 100).toFixed(2)}%`],
  ];

  for (const [label, value] of projectKv) {
    setKvRow(ws, r, label, value, [1, 2], [3, 9]);
    r++;
  }

  r += 1;

  // Subtitle: 2. 공급 테이블
  ws.mergeCells(r, 1, r, 9);
  setCell(ws, r, 1, "2. 공급 테이블", {
    font: SUBTITLE_FONT,
    alignment: LEFT,
  });
  r += 1;

  const supHeaders = [
    "구분",
    "타입",
    "세대수",
    "전용면적(㎡)",
    "전용면적(평)",
    "평당가",
    "세대당가",
    "총액",
    "비중(%)",
  ];
  setHeaderRow(ws, r, supHeaders);
  r += 1;

  const rows: SupplyRow[] = s.supplyTable ?? [];
  let totalUnits = 0;
  let totalPrice = 0;

  for (const row of rows) {
    totalUnits += row.units;
    totalPrice += row.totalPrice;
    setDataRow(ws, r, [
      row.category,
      row.type,
      row.units,
      row.areaSqm,
      row.areaPyeong,
      row.pricePerPyeong,
      row.pricePerUnit,
      row.totalPrice,
      row.ratio,
    ], { numCols: [2, 3, 4, 5, 6, 7], pctCols: [8] });
    r++;
  }

  // Totals
  setCell(ws, r, 1, "합계", {
    font: LABEL_FONT,
    fill: SUB_HEADER_FILL,
    alignment: CENTER,
    border: BORDER_THIN,
  });
  setCell(ws, r, 2, "", {
    font: LABEL_FONT,
    fill: SUB_HEADER_FILL,
    border: BORDER_THIN,
  });
  setCell(ws, r, 3, totalUnits, {
    font: LABEL_FONT,
    fill: SUB_HEADER_FILL,
    alignment: RIGHT,
    border: BORDER_THIN,
    numFmt: NUM_FMT,
  });
  for (let col = 4; col <= 7; col++) {
    setCell(ws, r, col, "", {
      fill: SUB_HEADER_FILL,
      border: BORDER_THIN,
    });
  }
  setCell(ws, r, 8, totalPrice, {
    font: LABEL_FONT,
    fill: SUB_HEADER_FILL,
    alignment: RIGHT,
    border: BORDER_THIN,
    numFmt: NUM_FMT,
  });
  setCell(ws, r, 9, "", {
    fill: SUB_HEADER_FILL,
    border: BORDER_THIN,
  });
}

// ============================================================
// Sheet 3: 상세담보현황
// ============================================================

function buildDetailSheet(wb: ExcelJS.Workbook, data: AppraisalCase) {
  const ws = wb.addWorksheet("상세담보현황");
  const items: CollateralDetailItem[] = data.collateralDetail ?? [];

  ws.columns = [
    { width: 6 },  // No
    { width: 10 }, // 호실
    { width: 8 },  // 층
    { width: 14 }, // 전용면적(㎡)
    { width: 14 }, // 전용면적(평)
    { width: 16 }, // 감정가
    { width: 16 }, // 계획분양가
    { width: 16 }, // 해지조건
    { width: 14 }, // 감정평단가
    { width: 14 }, // 분양평단가
    { width: 10 }, // 상태
    { width: 14 }, // 비고
  ];

  let r = 1;

  // Title
  ws.mergeCells(r, 1, r, 12);
  setCell(ws, r, 1, "■ 상세담보현황", { font: TITLE_FONT, alignment: LEFT });
  r += 2;

  const headers = [
    "No",
    "호실",
    "층",
    "전용면적(㎡)",
    "전용면적(평)",
    "감정가",
    "계획분양가",
    "해지조건",
    "감정평단가",
    "분양평단가",
    "상태",
    "비고",
  ];
  setHeaderRow(ws, r, headers);
  r += 1;

  for (const item of items) {
    setDataRow(ws, r, [
      item.no,
      item.unit,
      item.floor,
      item.areaSqm,
      item.areaPyeong,
      item.appraisalValue,
      item.planPrice,
      item.releaseCondition,
      item.appraisalPricePerPyeong,
      item.planPricePerPyeong,
      item.status,
      item.remarks,
    ], { numCols: [0, 3, 4, 5, 6, 7, 8, 9] });
    r++;
  }
}

// ============================================================
// Sheet 4: DATA_담보
// ============================================================

function buildDataCollateralSheet(wb: ExcelJS.Workbook, data: AppraisalCase) {
  const ws = wb.addWorksheet("DATA_담보");
  const c = data.collateral;
  const auction = data.auctionStats;
  const recovery = data.recoveryEstimate;

  ws.columns = [{ width: 24 }, { width: 30 }];

  let r = 1;
  const addKv = (key: string, val: string | number) => {
    setCell(ws, r, 1, key, { font: LABEL_FONT });
    setCell(ws, r, 2, val, { font: DATA_FONT });
    r++;
  };

  addKv("소유자", c.owner);
  addKv("위탁자", c.trustee);
  addKv("평가기관", c.appraiser);
  addKv("채무자", c.debtor);
  addKv("목적", c.purpose);
  addKv("제출처", c.submittedTo);
  addKv("기준일", c.baseDate);
  addKv("일련번호", c.serialNo);
  addKv("감정가", c.appraisalValue);
  addKv("비교방식", c.method.comparison);
  addKv("원가방식", c.method.cost);
  addKv("수익방식", c.method.income);
  addKv("총면적(㎡)", c.totalArea);
  addKv("총면적(평)", c.totalAreaPyeong);
  addKv("담보인정비율", c.collateralRatio);
  addKv("선순위합계", c.priorClaims);
  addKv("담보가용가", c.availableValue);
  addKv("LTV", c.ltv);
  addKv("비고", c.remarks);
  r++;

  addKv("[낙찰통계] 지역", auction.region);
  addKv("[낙찰통계] 시군구", auction.district);
  addKv("[낙찰통계] 읍면동", auction.dong);
  addKv("[낙찰통계] 물건유형", auction.propertyType);
  addKv("[낙찰통계] 기준월", auction.baseMonth);
  addKv("[낙찰통계] 출처", auction.source);
  addKv("[낙찰통계] 조회일", auction.retrievedAt);
  r++;

  addKv("[회수예상] 감정가", recovery.appraisalValue);
  addKv("[회수예상] 적용낙찰가율", recovery.appliedRate);
  addKv("[회수예상] 적용기간", recovery.appliedPeriod);
  addKv("[회수예상] 적용수준", recovery.appliedLevel);
  addKv("[회수예상] 선순위", recovery.priorClaims);
  addKv("[회수예상] 동순위당사지분", recovery.pariPassuShare);
  addKv("[회수예상] 배분액", recovery.distributionAmount);
  addKv("[회수예상] 회수액", recovery.recoveryAmount);
  addKv("[회수예상] 손실액", recovery.lossAmount);
  addKv("[회수예상] 의견", recovery.opinion);
}

// ============================================================
// Sheet 5: DATA_공급
// ============================================================

function buildDataSupplySheet(wb: ExcelJS.Workbook, data: AppraisalCase) {
  const ws = wb.addWorksheet("DATA_공급");
  const s = data.supply;
  const p = s.project;

  ws.columns = [
    { width: 20 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 12 },
  ];

  let r = 1;

  // Project info
  const kvData: [string, string | number][] = [
    ["사업명", p.name],
    ["시행사", p.developer],
    ["시공사", p.constructor],
    ["소재지", p.address],
    ["용도지역", p.zoning],
    ["대지면적(㎡)", p.landArea.sqm],
    ["건축면적(㎡)", p.buildingArea.sqm],
    ["연면적(㎡)", p.grossArea.sqm],
    ["건폐율", p.coverageRatio],
    ["용적률", p.floorAreaRatio],
    ["주차대수", p.parking],
    ["규모", p.scale],
    ["공사기간", p.constructionPeriod],
    ["준공예정일", p.completionDate],
    ["분양률", p.salesRate],
  ];

  for (const [k, v] of kvData) {
    setCell(ws, r, 1, k, { font: LABEL_FONT });
    setCell(ws, r, 2, v, { font: DATA_FONT });
    r++;
  }

  r += 1;

  // Supply table raw data
  const supHeaders = [
    "구분",
    "타입",
    "세대수",
    "전용면적(㎡)",
    "전용면적(평)",
    "평당가",
    "세대당가",
    "총액",
    "비중",
  ];
  supHeaders.forEach((h, i) => {
    setCell(ws, r, i + 1, h, { font: LABEL_FONT });
  });
  r++;

  const rows: SupplyRow[] = s.supplyTable ?? [];
  for (const row of rows) {
    const vals = [
      row.category,
      row.type,
      row.units,
      row.areaSqm,
      row.areaPyeong,
      row.pricePerPyeong,
      row.pricePerUnit,
      row.totalPrice,
      row.ratio,
    ];
    vals.forEach((v, i) => {
      setCell(ws, r, i + 1, v, { font: DATA_FONT });
    });
    r++;
  }
}

// ============================================================
// Main export
// ============================================================

export async function generateAppraisalExcel(
  data: AppraisalCase
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  buildCollateralSheet(wb, data);
  buildSupplySheet(wb, data);
  buildDetailSheet(wb, data);
  buildDataCollateralSheet(wb, data);
  buildDataSupplySheet(wb, data);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
