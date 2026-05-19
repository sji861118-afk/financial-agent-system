import * as ExcelJS from "exceljs";
import type { InsolvencyRow, YearCells, WarningFlags } from "./types";
import { applyOverrides } from "./rules";

const FONT_NAME = "맑은 고딕";

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  left: { style: "thin", color: { argb: "FFB0B0B0" } },
  right: { style: "thin", color: { argb: "FFB0B0B0" } },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" },
};
const Y_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFFDD2D2" },
};

/**
 * DART buildStatements가 row[year]에 이미 백만원 단위 string을 저장한다
 * (toMillions, dart-api.ts:546). extract24Cells의 parseNum 결과는 이미
 * 백만 단위 number이므로 여기서는 정수화만.
 */
function toMillions(v: number): number {
  return Math.round(v);
}

/** YYYYMMDD → YYYY-MM-DD */
function fmtDate(s: string): string {
  if (!s) return "";
  if (s.length === 8 && /^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

/**
 * PDF 양식과 동일한 단일 가로형 시트 + 자동판정근거 보조 시트.
 *
 * 컬럼 구조 (총 35 + 1 근거):
 *   A: 고객명
 *   B: 법인설립일 or 사업자등록일
 *   C~J: 직전년도 (자산총계/부채총계/자본총계/차입금/매출액/영업손익/이자비용/당기순손익)
 *   K~R: 직전전년도 (동일 8항목)
 *   S~Z: 직전전전년도 (동일 8항목)
 *   AA~AH: N/Y 8개 부실징후 컬럼
 *   AI: 자동판정근거 (요약)
 */
export async function buildInsolvencyWorkbook(
  rows: InsolvencyRow[],
  branch: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "여신승인신청서 자동화";
  wb.created = new Date();

  const ws = wb.addWorksheet("부실징후점검", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3, showGridLines: true }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  // 컬럼 폭 설정
  const colWidths = [
    18, // A 고객명
    14, // B 설립일
    ...Array(8).fill(11), // C~J 직전년도
    ...Array(8).fill(11), // K~R 직전전년도
    ...Array(8).fill(11), // S~Z 직전전전년도
    ...Array(8).fill(11), // AA~AH N/Y
    50, // AI 자동판정근거
  ];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // ─── Row 1: 작성일 ───
  if (rows.length > 0) {
    ws.mergeCells("A1:B1");
    const a1 = ws.getCell("A1");
    a1.value = new Date().toISOString().slice(0, 10);
    a1.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: "FF808080" } };
    a1.alignment = { vertical: "middle", horizontal: "center" };
    // 작성지점 표기
    ws.mergeCells("AC1:AI1");
    const dotCell = ws.getCell("AC1");
    dotCell.value = `[전수조사] 부실징후점검 — ${branch}`;
    dotCell.font = { name: FONT_NAME, size: 11, bold: true };
    dotCell.alignment = { vertical: "middle", horizontal: "right" };
  }

  // ─── Row 2: 그룹 헤더 ───
  ws.mergeCells("A2:A3"); // 고객명 (2-3행 병합)
  ws.mergeCells("B2:B3"); // 설립일 (2-3행 병합)
  const years = rows[0]?.years || ["", "", ""];
  const groupHeader2 = (range: string, label: string) => {
    ws.mergeCells(range);
    const c = ws.getCell(range.split(":")[0]);
    c.value = label;
    c.font = { name: FONT_NAME, size: 10, bold: true };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.fill = HEADER_FILL;
    c.border = THIN;
  };
  groupHeader2("C2:J2", `${years[0]}년 (백만단위)`);
  groupHeader2("K2:R2", `${years[1]}년 (백만단위)`);
  groupHeader2("S2:Z2", `${years[2]}년 (백만단위)`);
  groupHeader2("AA2:AH2", "N / Y 값 입력");
  ws.mergeCells("AI2:AI3");

  // A2/B2 셀 스타일
  ["A2", "B2"].forEach((addr, i) => {
    const c = ws.getCell(addr);
    c.value = i === 0 ? "고객명" : "법인설립일\nor 사업자등록일";
    c.font = { name: FONT_NAME, size: 10, bold: true };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.fill = HEADER_FILL;
    c.border = THIN;
  });
  const aiHead = ws.getCell("AI2");
  aiHead.value = "자동판정근거";
  aiHead.font = { name: FONT_NAME, size: 10, bold: true };
  aiHead.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  aiHead.fill = HEADER_FILL;
  aiHead.border = THIN;

  // ─── Row 3: 컬럼 헤더 ───
  const fieldHeaders = [
    "자산총계", "부채총계", "자본총계", "차입금",
    "매출액", "영업손익", "이자비용", "당기순손익",
  ];
  const flagHeaders = [
    "최근3년연속\n결손여부",
    "최근결산일현재\n완전자본잠식여부",
    "1,2금융권차입금\n연간매출액초과여부",
    "경영상\n내분발생여부",
    "3개월이상\n조업중단여부",
    "감사의견\n거절여부",
    "부도여부",
    "컨소시엄대출여부",
  ];

  const row3 = ws.getRow(3);
  // C3~J3, K3~R3, S3~Z3 = 8 fields × 3 years
  for (let group = 0; group < 3; group++) {
    for (let i = 0; i < 8; i++) {
      const col = 3 + group * 8 + i; // C=3
      const c = row3.getCell(col);
      c.value = fieldHeaders[i];
      c.font = { name: FONT_NAME, size: 9, bold: true };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.fill = HEADER_FILL;
      c.border = THIN;
    }
  }
  // AA3~AH3 = 8 N/Y flag headers
  for (let i = 0; i < 8; i++) {
    const col = 27 + i; // AA=27
    const c = row3.getCell(col);
    c.value = flagHeaders[i];
    c.font = { name: FONT_NAME, size: 9, bold: true };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.fill = HEADER_FILL;
    c.border = THIN;
  }
  row3.height = 42;

  // ─── Row 4+: 데이터 ───
  rows.forEach((row, idx) => {
    const rowNum = 4 + idx;
    const r = ws.getRow(rowNum);

    const merged = applyOverrides(row.flags, row.flagOverrides);

    // A: 고객명
    r.getCell(1).value = row.corpName || row.inputName;
    // B: 설립일
    r.getCell(2).value = fmtDate(row.estDt);

    // C~Z: 24 재무셀 (백만단위)
    const yearCells: YearCells[] = row.years.map((y) =>
      row.cells.byYear[y] || ({} as YearCells),
    );
    yearCells.forEach((yc, gi) => {
      const baseCol = 3 + gi * 8;
      const vals = [
        yc.totalAssets,
        yc.totalLiab,
        yc.totalEquity,
        yc.borrowings,
        yc.revenue,
        yc.operatingIncome,
        yc.interestExpense,
        yc.netIncome,
      ];
      vals.forEach((v, i) => {
        const c = r.getCell(baseCol + i);
        if (v === undefined || v === null || isNaN(v)) {
          c.value = "-";
        } else {
          c.value = toMillions(v);
          c.numFmt = "#,##0;(#,##0);-";
        }
      });
    });

    // AA~AH: 8 N/Y 플래그
    const flagVals: Array<"Y" | "N" | "-"> = [
      merged.threeYearsLoss,
      merged.fullCapitalImpair,
      merged.borrowGtRevenue,
      merged.internalConflict,
      merged.operationStopped,
      merged.auditOpinionReject,
      merged.bankruptcy,
      merged.consortiumLoan,
    ];
    flagVals.forEach((val, i) => {
      const c = r.getCell(27 + i);
      c.value = val;
      c.alignment = { vertical: "middle", horizontal: "center" };
      if (val === "Y") c.fill = Y_FILL;
    });

    // AI: 자동판정근거
    const evid = merged.evidence;
    const evidStr = [
      evid.threeYearsLoss && `① ${evid.threeYearsLoss}`,
      evid.fullCapitalImpair && `② ${evid.fullCapitalImpair}`,
      evid.borrowGtRevenue && `③ ${evid.borrowGtRevenue}`,
      evid.auditOpinionReject && `④ ${evid.auditOpinionReject}`,
      row.error && `⚠ ${row.error}`,
    ].filter(Boolean).join("\n");
    const aiCell = r.getCell(35);
    aiCell.value = evidStr;
    aiCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    aiCell.font = { name: FONT_NAME, size: 8, color: { argb: "FF606060" } };

    // 행 전체 폰트/테두리
    for (let col = 1; col <= 35; col++) {
      const c = r.getCell(col);
      c.border = THIN;
      if (!c.font) c.font = { name: FONT_NAME, size: 10 };
      else c.font = { ...c.font, name: FONT_NAME };
    }
    r.height = Math.max(28, Math.ceil(evidStr.length / 60) * 14 + 10);
  });

  // N/Y 데이터 유효성 검증 (AA~AH × N rows) — 셀 단위 설정
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i++) {
      const rowNum = 4 + i;
      for (let col = 27; col <= 34; col++) {
        const c = ws.getCell(rowNum, col);
        c.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ['"Y,N,-"'],
          showErrorMessage: true,
          errorTitle: "잘못된 값",
          error: "Y, N, - 중 하나만 입력하세요.",
        };
      }
    }
  }

  // ─── 보조 시트: 자동판정근거 상세 ───
  const detail = wb.addWorksheet("자동판정근거", { views: [{ showGridLines: true }] });
  detail.getColumn(1).width = 22;
  detail.getColumn(2).width = 18;
  detail.getColumn(3).width = 60;

  let drow = 1;
  detail.mergeCells(`A${drow}:C${drow}`);
  const dTitle = detail.getCell(`A${drow}`);
  dTitle.value = "■ 부실징후점검 자동판정근거 상세";
  dTitle.font = { name: FONT_NAME, size: 13, bold: true };
  detail.getRow(drow).height = 26;
  drow += 2;

  rows.forEach((row) => {
    detail.mergeCells(`A${drow}:C${drow}`);
    const head = detail.getCell(`A${drow}`);
    head.value = `[${row.corpName}] (corp_code: ${row.corpCode})`;
    head.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: "FF1F4E79" } };
    detail.getRow(drow).height = 22;
    drow += 1;

    const evid = row.flags.evidence;
    const items: Array<[string, "Y" | "N" | "-", string]> = [
      ["3년연속결손", row.flags.threeYearsLoss, evid.threeYearsLoss || "—"],
      ["완전자본잠식", row.flags.fullCapitalImpair, evid.fullCapitalImpair || "—"],
      ["차입금>매출액", row.flags.borrowGtRevenue, evid.borrowGtRevenue || "—"],
      ["감사의견거절", row.flags.auditOpinionReject, evid.auditOpinionReject || "—"],
    ];
    items.forEach(([label, val, ev]) => {
      const r = detail.getRow(drow);
      r.getCell(1).value = label;
      r.getCell(2).value = val;
      r.getCell(3).value = ev;
      for (let col = 1; col <= 3; col++) {
        r.getCell(col).border = THIN;
        r.getCell(col).font = { name: FONT_NAME, size: 10 };
        r.getCell(col).alignment = { vertical: "top", wrapText: true };
      }
      if (val === "Y") r.getCell(2).fill = Y_FILL;
      drow += 1;
    });
    if (row.error) {
      const r = detail.getRow(drow);
      r.getCell(1).value = "조회 오류";
      detail.mergeCells(`B${drow}:C${drow}`);
      r.getCell(2).value = row.error;
      r.getCell(2).font = { name: FONT_NAME, size: 10, color: { argb: "FFC00000" } };
      drow += 1;
    }
    drow += 1; // gap
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
