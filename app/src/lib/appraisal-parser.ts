import type {
  AppraisalParseResult,
  CollateralAnalysis,
  ComparativeCase,
  SupplyOverview,
  CollateralDetailItem,
  SupplyRow,
} from "@/types/appraisal";

// ── pdfjs-dist 폴리필 (upload/route.ts와 동일) ──
function ensurePdfjsPolyfills() {
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
}

/** Y좌표별 행 */
interface PdfRow {
  y: number;
  page: number;
  cells: { x: number; text: string }[];
}

/** 숫자 파싱: 쉼표 제거, 괄호/마이너스 처리 */
function parseNumber(raw: string): number | null {
  if (!raw || raw === "-" || raw === "—") return null;
  const cleaned = raw.replace(/\s/g, "");
  const negative = (cleaned.startsWith("(") && cleaned.endsWith(")")) || cleaned.startsWith("-");
  const numStr = cleaned.replace(/[(),\-\s]/g, "").replace(/,/g, "");
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

/** 날짜 패턴 추출 */
function extractDate(text: string): string | null {
  // 2024.01.01, 2024-01-01, 2024년 1월 1일
  const m = text.match(/(\d{4})[.\-년]\s*(\d{1,2})[.\-월]\s*(\d{1,2})[일]?/);
  if (m) return `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
  return null;
}

/** 전체 텍스트에서 pdfjs-dist로 좌표 기반 행 추출 */
async function extractPdfRows(buffer: Buffer): Promise<PdfRow[]> {
  try {
    ensurePdfjsPolyfills();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const allRows: PdfRow[] = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = (tc.items as any[]).filter((it: any) => it.str && it.str.trim());
      const rowMap: Record<number, { x: number; text: string }[]> = {};

      for (const it of items) {
        const y = Math.round(it.transform[5]);
        if (!rowMap[y]) rowMap[y] = [];
        rowMap[y].push({ x: Math.round(it.transform[4]), text: it.str.trim() });
      }

      const sortedYs = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
      for (const y of sortedYs) {
        allRows.push({ y, page: p, cells: rowMap[y].sort((a, b) => a.x - b.x) });
      }
    }
    doc.destroy();
    return allRows;
  } catch (e: any) {
    console.warn("[AppraisalParser] pdfjs-dist 추출 실패:", e?.message || e);
    return [];
  }
}

/** pdf-parse fallback으로 줄 단위 텍스트 추출 */
async function extractPdfLinesFallback(buffer: Buffer): Promise<string[]> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as any).default || mod;
  const data = await pdfParse(buffer);
  const text: string = data.text || "";
  if (!text || text.trim().length < 20) return [];
  return text.split(/\n/).filter((l: string) => l.trim().length > 0);
}

/** 행의 전체 텍스트 */
function rowText(row: PdfRow): string {
  return row.cells.map((c) => c.text).join(" ");
}

/** 행 배열에서 전체 plain text lines 생성 */
function rowsToLines(rows: PdfRow[]): string[] {
  return rows.map((r) => rowText(r));
}

// ──────────────────────────────────────────────
// Section parsers
// ──────────────────────────────────────────────

/** 키워드 매칭으로 행 인덱스 범위 찾기 */
function findSectionRange(
  lines: string[],
  startKeywords: RegExp,
  endKeywords?: RegExp,
): { start: number; end: number } | null {
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startKeywords.test(lines[i].replace(/\s/g, ""))) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;

  let endIdx = lines.length;
  if (endKeywords) {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (endKeywords.test(lines[i].replace(/\s/g, ""))) {
        endIdx = i;
        break;
      }
    }
  }
  return { start: startIdx, end: endIdx };
}

/** 키-값 쌍 추출: "소유자 홍길동" → { "소유자": "홍길동" } */
function extractKeyValuePairs(lines: string[]): Record<string, string> {
  const pairs: Record<string, string> = {};
  const kvPatterns: [RegExp, string][] = [
    [/소유자\s*[:：]?\s*(.+)/,   "소유자"],
    [/위탁자\s*[:：]?\s*(.+)/,   "위탁자"],
    [/평가기관\s*[:：]?\s*(.+)/, "평가기관"],
    [/채무자\s*[:：]?\s*(.+)/,   "채무자"],
    [/평가목적\s*[:：]?\s*(.+)/, "평가목적"],
    [/제출처\s*[:：]?\s*(.+)/,   "제출처"],
    [/기준시점\s*[:：]?\s*(.+)/, "기준시점"],
    [/가격시점\s*[:：]?\s*(.+)/, "기준시점"],
    [/일련번호\s*[:：]?\s*(.+)/, "일련번호"],
    [/의뢰인\s*[:：]?\s*(.+)/,   "의뢰인"],
  ];

  for (const line of lines) {
    for (const [re, key] of kvPatterns) {
      const m = line.match(re);
      if (m && m[1].trim()) {
        pairs[key] = m[1].trim();
      }
    }
  }
  return pairs;
}

/** 담보분석 추출 */
function parseCollateral(lines: string[]): { data: Partial<CollateralAnalysis>; confidence: number } {
  const sectionRange = findSectionRange(
    lines,
    /담보물\s*조사|담보분석|감정평가서|감정평가액|평가개요/,
    /비준사례|거래사례|공급개요|사업개요|담보\s*상세|당행\s*담보/,
  );

  if (!sectionRange) return { data: {}, confidence: 0 };

  const sectionLines = lines.slice(sectionRange.start, sectionRange.end);
  const kvPairs = extractKeyValuePairs(sectionLines);
  const fullText = sectionLines.join(" ");

  const result: Partial<CollateralAnalysis> = {};
  let fieldsFound = 0;

  if (kvPairs["소유자"])   { result.owner = kvPairs["소유자"]; fieldsFound++; }
  if (kvPairs["위탁자"])   { result.trustee = kvPairs["위탁자"]; fieldsFound++; }
  if (kvPairs["평가기관"]) { result.appraiser = kvPairs["평가기관"]; fieldsFound++; }
  if (kvPairs["채무자"])   { result.debtor = kvPairs["채무자"]; fieldsFound++; }
  if (kvPairs["의뢰인"])   { result.debtor = result.debtor || kvPairs["의뢰인"]; fieldsFound++; }
  if (kvPairs["평가목적"]) { result.purpose = kvPairs["평가목적"]; fieldsFound++; }
  if (kvPairs["제출처"])   { result.submittedTo = kvPairs["제출처"]; fieldsFound++; }
  if (kvPairs["일련번호"]) { result.serialNo = kvPairs["일련번호"]; fieldsFound++; }

  // 기준시점: kvPairs 또는 텍스트에서 날짜 추출
  if (kvPairs["기준시점"]) {
    const d = extractDate(kvPairs["기준시점"]);
    if (d) { result.baseDate = d; fieldsFound++; }
    else { result.baseDate = kvPairs["기준시점"]; fieldsFound++; }
  } else {
    const d = extractDate(fullText);
    if (d) { result.baseDate = d; fieldsFound++; }
  }

  // 감정평가액 추출
  try {
    const valuePatterns = [
      /감정평가액\s*[:：]?\s*([\d,]+)/,
      /결정\s*[:：]?\s*([\d,]+)/,
      /평가액\s*[:：]?\s*([\d,]+)/,
      /감정가\s*[:：]?\s*([\d,]+)/,
    ];
    for (const re of valuePatterns) {
      const m = fullText.replace(/\s/g, "").match(re);
      if (m) {
        const v = parseNumber(m[1]);
        if (v !== null && v > 0) { result.appraisalValue = v; fieldsFound++; break; }
      }
    }
  } catch { /* skip */ }

  const confidence = Math.min(1, fieldsFound / 5);
  return { data: result, confidence };
}

/** 비준사례 추출 */
function parseComparatives(lines: string[]): { data: ComparativeCase[]; confidence: number } {
  const sectionRange = findSectionRange(
    lines,
    /비준사례|거래사례|평가사례|사례비교/,
    /공급개요|사업개요|담보\s*상세|당행\s*담보|담보물\s*조사/,
  );
  if (!sectionRange) return { data: [], confidence: 0 };

  const sectionLines = lines.slice(sectionRange.start, sectionRange.end);
  const cases: ComparativeCase[] = [];

  // 테이블 헤더 탐지
  let headerIdx = -1;
  for (let i = 0; i < sectionLines.length; i++) {
    const cleaned = sectionLines[i].replace(/\s/g, "");
    const colHits = ["구분", "소재지", "면적", "금액", "평단가", "단가", "기준시점", "거래시점"].filter(
      (kw) => cleaned.includes(kw),
    );
    if (colHits.length >= 3) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx >= 0) {
    // 테이블 형태 파싱
    for (let i = headerIdx + 1; i < sectionLines.length; i++) {
      const line = sectionLines[i].trim();
      if (!line || /^\s*$/.test(line)) continue;
      // 새 섹션 시작 시 중단
      if (/공급개요|사업개요|담보\s*상세/.test(line)) break;

      try {
        const parts = line.split(/\s{2,}|\t/);
        if (parts.length < 3) continue;

        const label = parts[0].trim();
        const caseType: "거래" | "평가" = /평가/.test(label) ? "평가" : "거래";

        const c: ComparativeCase = {
          type: caseType,
          label: label,
          address: parts[1]?.trim() || "",
          buildingName: parts[2]?.trim() || "",
          unit: "",
          usage: "",
          purpose: "",
          source: "",
          areaSqm: 0,
          areaPyeong: 0,
          price: 0,
          pricePerPyeong: 0,
          baseDate: "",
        };

        // 숫자 컬럼 추출 (면적, 금액, 평단가 순)
        const nums = parts.slice(1).map((p) => parseNumber(p.trim())).filter((n): n is number => n !== null);
        if (nums.length >= 1) c.areaSqm = nums[0];
        if (nums.length >= 2) c.price = nums[1];
        if (nums.length >= 3) c.pricePerPyeong = nums[2];

        // 날짜 추출
        for (const part of parts) {
          const d = extractDate(part);
          if (d) { c.baseDate = d; break; }
        }

        cases.push(c);
      } catch { /* skip malformed row */ }
    }
  } else {
    // 비테이블: 키워드 기반 자유형식 추출
    let current: Partial<ComparativeCase> | null = null;
    for (const line of sectionLines) {
      const cleaned = line.replace(/\s/g, "");
      if (/거래사례|평가사례|사례\d/.test(cleaned)) {
        if (current && current.label) {
          cases.push(fillComparativeDefaults(current));
        }
        const caseType: "거래" | "평가" = /평가/.test(cleaned) ? "평가" : "거래";
        current = { type: caseType, label: cleaned.slice(0, 20) };
      }
      if (!current) continue;

      if (/소재지|주소/.test(line)) {
        const m = line.match(/소재지\s*[:：]?\s*(.+)/);
        if (m) current.address = m[1].trim();
      }
      if (/면적/.test(line)) {
        const m = line.match(/([\d,.]+)\s*㎡/);
        if (m) current.areaSqm = parseNumber(m[1]) || 0;
      }
      if (/금액|가격/.test(line)) {
        const m = line.match(/([\d,]+)/);
        if (m) current.price = parseNumber(m[1]) || 0;
      }
      const d = extractDate(line);
      if (d && !current.baseDate) current.baseDate = d;
    }
    if (current && current.label) {
      cases.push(fillComparativeDefaults(current));
    }
  }

  const confidence = cases.length > 0 ? Math.min(1, cases.length * 0.3) : 0;
  return { data: cases, confidence };
}

function fillComparativeDefaults(partial: Partial<ComparativeCase>): ComparativeCase {
  return {
    type: partial.type || "거래",
    label: partial.label || "",
    address: partial.address || "",
    buildingName: partial.buildingName || "",
    unit: partial.unit || "",
    usage: partial.usage || "",
    purpose: partial.purpose || "",
    source: partial.source || "",
    areaSqm: partial.areaSqm || 0,
    areaPyeong: partial.areaPyeong || 0,
    price: partial.price || 0,
    pricePerPyeong: partial.pricePerPyeong || 0,
    baseDate: partial.baseDate || "",
  };
}

/** 공급개요 추출 */
function parseSupplyOverview(lines: string[]): { data: Partial<SupplyOverview>; confidence: number } {
  const sectionRange = findSectionRange(
    lines,
    /공급개요|최초\s*공급|사업개요|사업현황/,
    /비준사례|거래사례|담보\s*상세|당행\s*담보|담보물\s*조사/,
  );
  if (!sectionRange) return { data: {}, confidence: 0 };

  const sectionLines = lines.slice(sectionRange.start, sectionRange.end);
  const fullText = sectionLines.join(" ");
  let fieldsFound = 0;

  const project: Record<string, any> = {};

  // 키워드-값 추출
  const projectKvPatterns: [RegExp, string][] = [
    [/사업명\s*[:：]?\s*(.+)/,    "name"],
    [/용도\s*[:：]?\s*(.+)/,      "purpose"],
    [/시행사\s*[:：]?\s*(.+)/,    "developer"],
    [/시공사\s*[:：]?\s*(.+)/,    "constructor"],
    [/소재지\s*[:：]?\s*(.+)/,    "address"],
    [/주소\s*[:：]?\s*(.+)/,      "address"],
    [/용도지역\s*[:：]?\s*(.+)/,  "zoning"],
    [/규모\s*[:：]?\s*(.+)/,      "scale"],
    [/공사기간\s*[:：]?\s*(.+)/,  "constructionPeriod"],
    [/준공\s*[:：]?\s*(.+)/,      "completionDate"],
    [/준공일\s*[:：]?\s*(.+)/,    "completionDate"],
    [/사용승인\s*[:：]?\s*(.+)/,  "completionDate"],
  ];

  for (const line of sectionLines) {
    for (const [re, key] of projectKvPatterns) {
      const m = line.match(re);
      if (m && m[1].trim()) {
        project[key] = m[1].trim();
        fieldsFound++;
      }
    }
  }

  // 면적/비율 추출
  try {
    const areaPatterns: [RegExp, string][] = [
      [/대지면적\s*[:：]?\s*([\d,.]+)/,   "landArea"],
      [/건축면적\s*[:：]?\s*([\d,.]+)/,   "buildingArea"],
      [/연면적\s*[:：]?\s*([\d,.]+)/,     "grossArea"],
    ];
    for (const [re, key] of areaPatterns) {
      const m = fullText.replace(/\n/g, " ").match(re);
      if (m) {
        const val = parseNumber(m[1]);
        if (val !== null) {
          project[key] = { sqm: val, pyeong: Math.round(val / 3.3058 * 100) / 100 };
          fieldsFound++;
        }
      }
    }

    const ratioPatterns: [RegExp, string][] = [
      [/건폐율\s*[:：]?\s*([\d.]+)/,  "coverageRatio"],
      [/용적률\s*[:：]?\s*([\d.]+)/,  "floorAreaRatio"],
    ];
    for (const [re, key] of ratioPatterns) {
      const m = fullText.replace(/\n/g, " ").match(re);
      if (m) {
        const val = parseFloat(m[1]);
        if (!isNaN(val)) { project[key] = val; fieldsFound++; }
      }
    }
  } catch { /* skip */ }

  // 공급 테이블 탐지
  const supplyTable: SupplyRow[] = [];
  let tableHeaderIdx = -1;
  for (let i = 0; i < sectionLines.length; i++) {
    const cleaned = sectionLines[i].replace(/\s/g, "");
    const colHits = ["구분", "타입", "세대", "호실", "면적", "평당가", "단가", "총액", "금액"].filter(
      (kw) => cleaned.includes(kw),
    );
    if (colHits.length >= 3) {
      tableHeaderIdx = i;
      break;
    }
  }

  if (tableHeaderIdx >= 0) {
    for (let i = tableHeaderIdx + 1; i < sectionLines.length; i++) {
      const line = sectionLines[i].trim();
      if (!line || /^\s*$/.test(line)) continue;
      if (/합계|소계/.test(line) && !/[가-힣]{4,}/.test(line.replace(/합계|소계/g, ""))) continue;

      const parts = line.split(/\s{2,}|\t/);
      if (parts.length < 3) break; // 테이블 끝

      try {
        const nums = parts.map((p) => parseNumber(p.trim())).filter((n): n is number => n !== null);
        supplyTable.push({
          category: parts[0]?.trim() || "",
          type: parts[1]?.trim() || "",
          units: nums[0] || 0,
          areaSqm: nums[1] || 0,
          areaPyeong: nums[1] ? Math.round(nums[1] / 3.3058 * 100) / 100 : 0,
          pricePerPyeong: nums[2] || 0,
          pricePerUnit: nums[3] || 0,
          totalPrice: nums[4] || 0,
          ratio: 0,
        });
      } catch { /* skip */ }
    }
  }

  const result: Partial<SupplyOverview> = {};
  if (fieldsFound > 0) {
    result.project = {
      name: project.name || "",
      purpose: project.purpose || "",
      developer: project.developer || "",
      constructor: project.constructor || "",
      address: project.address || "",
      zoning: project.zoning || "",
      landArea: project.landArea || { sqm: 0, pyeong: 0 },
      buildingArea: project.buildingArea || { sqm: 0, pyeong: 0 },
      grossArea: project.grossArea || { sqm: 0, pyeong: 0 },
      coverageRatio: project.coverageRatio || 0,
      floorAreaRatio: project.floorAreaRatio || 0,
      parking: project.parking || 0,
      scale: project.scale || "",
      constructionPeriod: project.constructionPeriod || "",
      completionDate: project.completionDate || "",
      salesRate: 0,
    };
  }
  if (supplyTable.length > 0) {
    result.supplyTable = supplyTable;
  }

  const confidence = Math.min(1, fieldsFound / 4);
  return { data: result, confidence };
}

/** 상세담보현황 추출 */
function parseCollateralDetail(lines: string[]): { data: CollateralDetailItem[]; confidence: number } {
  const sectionRange = findSectionRange(
    lines,
    /담보\s*상세|담보세대|상세담보|당행\s*담보대상|담보현황/,
    /비준사례|거래사례|공급개요|사업개요|담보물\s*조사/,
  );
  if (!sectionRange) return { data: [], confidence: 0 };

  const sectionLines = lines.slice(sectionRange.start, sectionRange.end);
  const items: CollateralDetailItem[] = [];

  // 테이블 헤더 탐지
  let headerIdx = -1;
  for (let i = 0; i < sectionLines.length; i++) {
    const cleaned = sectionLines[i].replace(/\s/g, "");
    const colHits = ["No", "호실", "면적", "감정가", "분양가", "해지", "평단가", "상태", "비고"].filter(
      (kw) => cleaned.includes(kw),
    );
    if (colHits.length >= 3) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) return { data: [], confidence: 0 };

  let rowNo = 1;
  for (let i = headerIdx + 1; i < sectionLines.length; i++) {
    const line = sectionLines[i].trim();
    if (!line || /^\s*$/.test(line)) continue;
    if (/합계|소계|총계/.test(line)) continue;

    const parts = line.split(/\s{2,}|\t/);
    if (parts.length < 3) break;

    try {
      const nums = parts.map((p) => parseNumber(p.trim())).filter((n): n is number => n !== null);

      // 호실: 숫자가 아닌 첫 번째 파트 또는 두 번째 파트
      let unit = "";
      let floor = "";
      for (const p of parts) {
        const trimmed = p.trim();
        if (/호$|호실$|\d{3,4}$/.test(trimmed) && !unit) {
          unit = trimmed;
        }
        if (/층$|\d+F$/i.test(trimmed) && !floor) {
          floor = trimmed;
        }
      }

      // 상태 추출
      let status: "분양" | "미분양" | "계약" | "잔금납부" = "분양";
      for (const p of parts) {
        if (/미분양/.test(p)) status = "미분양";
        else if (/계약/.test(p)) status = "계약";
        else if (/잔금/.test(p)) status = "잔금납부";
      }

      items.push({
        no: rowNo++,
        unit,
        floor,
        areaSqm: nums[0] || 0,
        areaPyeong: nums[0] ? Math.round(nums[0] / 3.3058 * 100) / 100 : 0,
        appraisalValue: nums[1] || 0,
        planPrice: nums[2] || 0,
        releaseCondition: nums[3] || 0,
        appraisalPricePerPyeong: 0,
        planPricePerPyeong: 0,
        status,
        remarks: "",
      });
    } catch { /* skip malformed row */ }
  }

  // 평당가 계산
  for (const item of items) {
    if (item.areaPyeong > 0) {
      if (item.appraisalValue > 0) {
        item.appraisalPricePerPyeong = Math.round(item.appraisalValue / item.areaPyeong);
      }
      if (item.planPrice > 0) {
        item.planPricePerPyeong = Math.round(item.planPrice / item.areaPyeong);
      }
    }
  }

  const confidence = items.length > 0 ? Math.min(1, items.length * 0.2) : 0;
  return { data: items, confidence };
}

// ──────────────────────────────────────────────
// Main parser
// ──────────────────────────────────────────────

export async function parseAppraisalPdf(
  buffer: Buffer,
  _propertyType: string,
): Promise<AppraisalParseResult> {
  const warnings: string[] = [];
  const confidence: Record<string, number> = {};

  // 1. pdfjs-dist 좌표 기반 텍스트 추출
  let lines: string[] = [];
  const pdfRows = await extractPdfRows(buffer);

  if (pdfRows.length >= 5) {
    lines = rowsToLines(pdfRows);
    console.log(`[AppraisalParser] pdfjs-dist: ${pdfRows.length}행, ${lines.length}줄`);
  } else {
    // fallback to pdf-parse
    try {
      lines = await extractPdfLinesFallback(buffer);
      console.log(`[AppraisalParser] pdf-parse fallback: ${lines.length}줄`);
    } catch (e: any) {
      warnings.push(`PDF 텍스트 추출 실패: ${e?.message || "알 수 없는 오류"}`);
    }
  }

  if (lines.length === 0) {
    return {
      collateral: {},
      comparatives: [],
      supply: {},
      collateralDetail: [],
      confidence: {},
      warnings: ["PDF에서 텍스트를 추출할 수 없습니다. 스캔(이미지) PDF가 아닌지 확인하세요."],
    };
  }

  // 2. 각 섹션 파싱 (개별 실패가 전체에 영향 없음)
  let collateral: Partial<CollateralAnalysis> = {};
  try {
    const r = parseCollateral(lines);
    collateral = r.data;
    confidence["collateral"] = r.confidence;
    if (r.confidence === 0) warnings.push("담보분석 섹션을 찾지 못했습니다.");
  } catch (e: any) {
    warnings.push(`담보분석 파싱 오류: ${e?.message || e}`);
    confidence["collateral"] = 0;
  }

  let comparatives: ComparativeCase[] = [];
  try {
    const r = parseComparatives(lines);
    comparatives = r.data;
    confidence["comparatives"] = r.confidence;
    if (r.confidence === 0) warnings.push("비준사례 섹션을 찾지 못했습니다.");
  } catch (e: any) {
    warnings.push(`비준사례 파싱 오류: ${e?.message || e}`);
    confidence["comparatives"] = 0;
  }

  let supply: Partial<SupplyOverview> = {};
  try {
    const r = parseSupplyOverview(lines);
    supply = r.data;
    confidence["supply"] = r.confidence;
    if (r.confidence === 0) warnings.push("공급개요 섹션을 찾지 못했습니다.");
  } catch (e: any) {
    warnings.push(`공급개요 파싱 오류: ${e?.message || e}`);
    confidence["supply"] = 0;
  }

  let collateralDetail: CollateralDetailItem[] = [];
  try {
    const r = parseCollateralDetail(lines);
    collateralDetail = r.data;
    confidence["collateralDetail"] = r.confidence;
    if (r.confidence === 0) warnings.push("상세담보현황 섹션을 찾지 못했습니다.");
  } catch (e: any) {
    warnings.push(`상세담보현황 파싱 오류: ${e?.message || e}`);
    confidence["collateralDetail"] = 0;
  }

  console.log("[AppraisalParser] 파싱 완료:", {
    collateralFields: Object.keys(collateral).length,
    comparatives: comparatives.length,
    supplyFields: Object.keys(supply).length,
    detailItems: collateralDetail.length,
    warnings: warnings.length,
  });

  return {
    collateral,
    comparatives,
    supply,
    collateralDetail,
    confidence,
    warnings,
  };
}
