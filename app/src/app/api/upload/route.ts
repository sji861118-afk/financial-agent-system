import { type NextRequest } from "next/server";
import * as ExcelJS from "exceljs";

interface ParsedRow {
  account: string;
  [year: string]: string;
}

/**
 * 업로드된 Excel/PDF 파일에서 재무상태표/손익계산서 데이터를 파싱
 *
 * 지원 형식:
 * 1) Excel: 시트명에 "재무상태표" 또는 "BS" → BS 시트, "손익계산서" 또는 "IS" → IS 시트
 * 2) Excel: 단일 시트에 BS/IS가 함께 있는 경우 자동 분리
 * 3) PDF: 텍스트 기반 테이블 파싱 (재무상태표/손익계산서 자동 인식)
 * 4) 첫 열 = 계정과목, 이후 열 = 연도별 금액
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const unitStr = formData.get("unit") as string | null; // "원", "천원", "백만원"

    if (!file) {
      return Response.json({ success: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "pdf"].includes(ext || "")) {
      return Response.json({ success: false, error: "Excel(.xlsx, .xls) 또는 PDF 파일만 지원합니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 단위 배율 결정 (백만원 기준으로 변환)
    let divisor = 1;
    if (unitStr === "원") divisor = 1_000_000;
    else if (unitStr === "천원") divisor = 1_000;
    else if (unitStr === "백만원") divisor = 1;

    let bsRows: ParsedRow[] = [];
    let isRows: ParsedRow[] = [];
    let years: string[] = [];

    if (ext === "pdf") {
      // ── PDF 파싱 ──
      const result = await parsePdf(buffer, divisor);
      bsRows = result.bsRows;
      isRows = result.isRows;
      years = result.years;
    } else {
      // ── Excel 파싱 ──
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      let bsSheet: ExcelJS.Worksheet | null = null;
      let isSheet: ExcelJS.Worksheet | null = null;
      let combinedSheet: ExcelJS.Worksheet | null = null;

      for (const ws of workbook.worksheets) {
        const name = ws.name.replace(/\s/g, "");
        if (/재무상태표|BS|대차대조표|BalanceSheet/i.test(name)) {
          bsSheet = ws;
        } else if (/손익계산서|IS|IncomeStatement|포괄손익/i.test(name)) {
          isSheet = ws;
        }
      }

      if (!bsSheet && !isSheet) {
        combinedSheet = workbook.worksheets[0];
        if (!combinedSheet) {
          return Response.json({ success: false, error: "시트를 찾을 수 없습니다." }, { status: 400 });
        }
      }

      if (combinedSheet) {
        const result = parseSheet(combinedSheet, divisor);
        years = result.years;
        const split = splitCombined(result.rows);
        bsRows = split.bsRows;
        isRows = split.isRows;
      } else {
        if (bsSheet) {
          const bs = parseSheet(bsSheet, divisor);
          bsRows = bs.rows;
          years = bs.years;
        }
        if (isSheet) {
          const is_ = parseSheet(isSheet, divisor);
          isRows = is_.rows;
          if (!years.length) years = is_.years;
          else {
            for (const y of is_.years) {
              if (!years.includes(y)) years.push(y);
            }
          }
        }
      }
    }

    years.sort();

    if (bsRows.length === 0 && isRows.length === 0) {
      const debugInfo = ext === "pdf"
        ? ` (PDF 텍스트 추출 결과: ${years.length}개 연도 감지, 추출 텍스트 없음 — PDF가 스캔 이미지이거나 DRM 보호 문서일 수 있습니다)`
        : "";
      return Response.json({
        success: false,
        error: `재무제표 데이터를 인식할 수 없습니다.${debugInfo} 첫 열에 계정과목, 이후 열에 연도별 금액이 있는 형식이어야 합니다.`,
      }, { status: 400 });
    }

    return Response.json({
      success: true,
      result: {
        fileName: file.name,
        years,
        bsItems: bsRows,
        isItems: isRows,
        bsCount: bsRows.length,
        isCount: isRows.length,
      },
    });
  } catch (error) {
    console.error("Upload parse error:", error);
    return Response.json(
      { success: false, error: `파일 파싱 오류: ${error}` },
      { status: 500 }
    );
  }
}

// ── Excel 시트 파싱 ──
function parseSheet(ws: ExcelJS.Worksheet, divisor: number): { years: string[]; rows: ParsedRow[] } {
  const rows: ParsedRow[] = [];
  let years: string[] = [];

  let headerRowIdx = -1;
  ws.eachRow((row, rowNumber) => {
    if (headerRowIdx > 0) return;
    const vals = row.values as (string | number | null)[];
    const yearCandidates: string[] = [];
    for (let c = 2; c < vals.length; c++) {
      const v = String(vals[c] || "").replace(/\s/g, "").replace(/년$/, "").replace(/기$/, "");
      if (/^20\d{2}$/.test(v)) {
        yearCandidates.push(v);
      } else if (/^\d{4}$/.test(v) && parseInt(v) >= 2018 && parseInt(v) <= 2030) {
        yearCandidates.push(v);
      }
    }
    if (yearCandidates.length >= 1) {
      headerRowIdx = rowNumber;
      years = yearCandidates;
    }
  });

  if (headerRowIdx < 0 || years.length === 0) {
    const firstRow = ws.getRow(1).values as (string | number | null)[];
    for (let c = 2; c < (firstRow?.length || 0); c++) {
      const v = String(firstRow[c] || "").replace(/\s/g, "").replace(/년$/, "");
      if (/^20\d{2}$/.test(v)) years.push(v);
    }
    headerRowIdx = 1;
  }

  if (years.length === 0) return { years: [], rows: [] };

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;
    const vals = row.values as (string | number | null)[];
    if (!vals || vals.length < 2) return;

    const account = String(vals[1] || "").trim();
    if (!account || /^[\d\s.,]+$/.test(account)) return;

    const parsed: ParsedRow = { account };
    for (let yi = 0; yi < years.length; yi++) {
      const cellIdx = yi + 2;
      const raw = vals[cellIdx];
      if (raw === null || raw === undefined || raw === "") {
        parsed[years[yi]] = "-";
      } else {
        const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
        if (isNaN(num)) {
          parsed[years[yi]] = String(raw);
        } else {
          const inMillions = divisor === 1 ? num : num / divisor;
          parsed[years[yi]] = inMillions === 0 ? "-" : Math.round(inMillions).toLocaleString("ko-KR");
        }
      }
    }
    rows.push(parsed);
  });

  return { years, rows };
}

// ── BS/IS 분리 (combined 시트 또는 PDF 통합 텍스트용) ──
function splitCombined(allRows: ParsedRow[]): { bsRows: ParsedRow[]; isRows: ParsedRow[] } {
  const bsRows: ParsedRow[] = [];
  const isRows: ParsedRow[] = [];
  let section: "bs" | "is" | null = null;
  let bsDone = false;

  for (const row of allRows) {
    const acct = row.account.replace(/\s/g, "");

    // BS 시작: "자산", "유동자산", "재무상태표" 등
    if (!bsDone && /^(Ⅰ\.?)?자산$|^유동자산$|^자산총계$|재무상태표/.test(acct)) {
      section = "bs";
      if (/재무상태표/.test(acct)) continue;
    }

    // BS 종료: "부채및자본총계" 이후 → IS 대기
    if (section === "bs" && /부채및자본총계|부채와자본총계/.test(acct)) {
      bsRows.push(row);
      bsDone = true;
      section = null; // IS 시작 대기
      continue;
    }

    // IS 시작: "손익계산서", "매출액" 등
    if (/^(Ⅰ\.?)?(매출액|영업수익|공사수익|분양수익)$|손익계산서|포괄손익계산서/.test(acct)) {
      section = "is";
      if (/손익계산서|포괄손익계산서/.test(acct)) continue;
    }

    // IS 종료: 다른 재무제표/명세서 시작 시 IS 섹션 종료
    if (section === "is" && /당기순이익|당기순손실|당기순손익/.test(acct)) {
      isRows.push(row);
      section = null; // IS 종료 — 이후 분양원가명세서/결손금처리계산서 등 제외
      continue;
    }
    if (section === "is" && /분양원가명세서|원가명세서|결손금처리|이익잉여금처분|현금흐름표|자본변동표/.test(acct)) {
      section = null;
      continue;
    }

    if (section === "bs") bsRows.push(row);
    else if (section === "is") isRows.push(row);
    else if (!bsDone) {
      // section이 아직 결정 안 됐으면 키워드로 분류
      if (/자산|부채|자본|유동|비유동|현금|재고|보증금|차입금|미지급|예수/.test(acct)) {
        bsRows.push(row);
      } else if (/매출|영업|이익|손실|비용|수익|감가|이자|공사/.test(acct)) {
        isRows.push(row);
      }
    }
  }

  return { bsRows, isRows };
}

// ── PDF 텍스트 줄 추출 (pdfjs-dist 좌표 기반 → pdf-parse fallback) ──
async function extractPdfLines(buffer: Buffer): Promise<string[]> {
  // 1차: pdfjs-dist 좌표 기반 (글자 분리 PDF 완벽 대응)
  try {
    if (typeof globalThis.DOMMatrix === "undefined") {
      (globalThis as any).DOMMatrix = class DOMMatrix {
        a: number; b: number; c: number; d: number; e: number; f: number;
        constructor(init?: number[]) {
          if (Array.isArray(init)) { this.a=init[0]??1;this.b=init[1]??0;this.c=init[2]??0;this.d=init[3]??1;this.e=init[4]??0;this.f=init[5]??0; }
          else { this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0; }
        }
        get is2D() { return true; }
        isIdentity() { return this.a===1&&this.b===0&&this.c===0&&this.d===1&&this.e===0&&this.f===0; }
      };
    }
    if (typeof globalThis.Path2D === "undefined") {
      (globalThis as any).Path2D = class Path2D { constructor() {} };
    }

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const getDocument = pdfjs.getDocument;
    const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;

    const allLines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = (tc.items as any[]).filter((it: any) => it.str && it.str.trim());
      const rows: Record<number, { x: number; text: string }[]> = {};
      for (const it of items) {
        const y = Math.round(it.transform[5]);
        if (!rows[y]) rows[y] = [];
        rows[y].push({ x: it.transform[4], text: it.str.trim() });
      }
      const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const cells = rows[y].sort((a, b) => a.x - b.x);
        allLines.push(cells.map((c) => c.text).join(""));
      }
    }
    doc.destroy();

    if (allLines.length >= 5) {
      console.log("[PDF] pdfjs-dist 좌표 기반 추출 성공:", allLines.length, "줄");
      return allLines;
    }
  } catch (e: any) {
    console.warn("[PDF] pdfjs-dist 실패, pdf-parse fallback:", e?.message || e);
  }

  // 2차: pdf-parse 텍스트 기반 fallback (원래 작동하던 방식 그대로)
  const mod = await import("pdf-parse");
  const pdfParse = (mod as any).default || mod;
  const data = await pdfParse(buffer);
  const text: string = data.text || "";
  if (!text || text.trim().length < 20) {
    throw new Error("PDF에서 텍스트를 추출할 수 없습니다.");
  }
  console.log("[PDF] pdf-parse fallback 사용, 텍스트 길이:", text.length);
  // 글자 단위 분리 PDF 대응: 모든 공백 제거 후 줄바꿈만으로 분리,
  // 그 다음 짧은 줄을 이전 줄에 병합하여 완전한 계정행 재구성
  const rawLines = text.split(/\n/).map((l: string) => l.replace(/\s/g, "")).filter((l: string) => l.length > 0);

  // 1단계: 짧은 줄(5글자 미만)은 이전 줄에 병합
  const step1: string[] = [];
  for (const line of rawLines) {
    if (line.length < 5 && step1.length > 0) {
      step1[step1.length - 1] += line;
    } else {
      step1.push(line);
    }
  }

  // 2단계: 숫자만 있는 줄을 이전 한글 줄에 병합
  const merged: string[] = [];
  let current = "";
  for (const line of step1) {
    const hasKorean = /[가-힣]/.test(line);
    const isNumOnly = /^[\d,.()\-]+$/.test(line);
    if (hasKorean) {
      if (current) merged.push(current);
      current = line;
    } else if (isNumOnly && current) {
      current += line;
    } else {
      if (current) merged.push(current);
      current = line;
    }
  }
  if (current) merged.push(current);
  console.log("[PDF] pdf-parse fallback 추출:", merged.length, "줄");
  return merged;
}

// ── PDF 파싱 ──
async function parsePdf(buffer: Buffer, divisor: number): Promise<{ bsRows: ParsedRow[]; isRows: ParsedRow[]; years: string[] }> {
  const allLines = await extractPdfLines(buffer);

  if (allLines.length < 5) {
    throw new Error("PDF에서 텍스트를 추출할 수 없습니다. 스캔 이미지 PDF이거나 DRM 보호 문서일 수 있습니다.");
  }

  // ── 1) 연도 추출 ──
  const years: string[] = [];
  const yearSet = new Set<string>();
  const fullText = allLines.join("\n");

  for (const line of allLines) {
    const m = line.match(/20[12]\d/g);
    if (m && m.length >= 2) {
      for (const y of m) {
        if (parseInt(y) >= 2018 && parseInt(y) <= 2030 && !yearSet.has(y)) {
          yearSet.add(y); years.push(y);
        }
      }
      if (years.length >= 2) break;
    }
  }
  // 빈도 기반 fallback
  if (years.length === 0) {
    const allYrs = fullText.match(/20[12]\d/g) || [];
    const freq: Record<string, number> = {};
    for (const y of allYrs) freq[y] = (freq[y] || 0) + 1;
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    for (const [y] of sorted.slice(0, 2)) {
      if (!yearSet.has(y)) { years.push(y); yearSet.add(y); }
    }
  }

  // ── 2) 계정 행 파싱 ──
  const allRows: ParsedRow[] = [];
  const skipRe = /^(제\d|단위|회사명|과목|금액|재무상태표|손익계산서|포괄손익|결산|회계|주석|감사|독립|페이지|Page|처분예정|처분확정)/;

  for (const line of allLines) {
    // 공백 제거 후 계정과목 + 숫자 분리
    const cleaned = line.replace(/\s/g, "");
    // 계정명 끝(한글/괄호) + 숫자 시작 지점 분리
    const match = cleaned.match(/^(.*?[가-힣)）])([\d,()\-].*)$/);
    if (!match) continue;

    let account = match[1];
    const numPart = match[2];

    if (skipRe.test(account)) continue;
    if (account.length > 25) continue;
    // 로마숫자/번호 접두사 제거
    account = account.replace(/^[IⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\./, "");
    account = account.replace(/^\(\d+\)/, "");
    account = account.replace(/^\d+\./, "");
    if (!account || !/[가-힣]/.test(account)) continue;
    const koreanChars = account.match(/[가-힣]/g);
    if (!koreanChars || koreanChars.length < 2) continue;

    // 금액 추출
    const amounts: string[] = [];
    const amountRe = /\([\d,]+\)|\d{1,3}(,\d{3})*/g;
    let m2;
    while ((m2 = amountRe.exec(numPart)) !== null) {
      if (m2[0].length >= 1) amounts.push(m2[0]);
    }
    if (amounts.length === 0) continue;

    const parsed: ParsedRow = { account };
    for (let yi = 0; yi < years.length && yi < amounts.length; yi++) {
      parsed[years[yi]] = formatAmount(amounts[yi], divisor);
    }
    allRows.push(parsed);
  }

  console.log("[PDF] 좌표기반 행:", allLines.length, "/ 파싱 행:", allRows.length, "/ 연도:", years);

  const split = splitCombined(allRows);
  const sortedYears = [...years].sort();
  return { bsRows: split.bsRows, isRows: split.isRows, years: sortedYears };
}

function formatAmount(raw: string, divisor: number): string {
  const negative = (raw.startsWith("(") && raw.endsWith(")"));
  const numStr = raw.replace(/[(),\s]/g, "");
  const num = parseFloat(numStr);
  if (isNaN(num)) return raw;
  const val = negative ? -num : num;
  const inMillions = divisor === 1 ? val : val / divisor;
  return inMillions === 0 ? "-" : Math.round(inMillions).toLocaleString("ko-KR");
}
