import type {
  AppraisalParseResult,
  CollateralAnalysis,
  ComparativeCase,
  ComparativeBuilding,
  SupplyOverview,
  CollateralDetailItem,
  AuctionQuote,
} from "@/types/appraisal";

// ── 유틸리티 ──────────────────────────────────────

/** 숫자 파싱: 쉼표 제거, 괄호/마이너스, 원화기호(\, ₩, \\) */
export function parseNum(raw: string): number | null {
  if (!raw || raw === "-" || raw === "—" || raw === "·") return null;
  let s = raw.replace(/[\s,]/g, "");
  s = s.replace(/^[\\₩￦]/, "");
  const negative = (s.startsWith("(") && s.endsWith(")")) || s.startsWith("-");
  s = s.replace(/[()\\₩￦\-]/g, "");
  s = s.replace(/[^\d.]/g, "");
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

/** 날짜 추출 */
export function extractDate(text: string): string | null {
  const m = text.match(/(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*일?/);
  if (m) return `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
  return null;
}

/** 공백 제거 후 패턴 매칭으로 줄 인덱스 찾기 */
export function findLineIndex(lines: string[], pattern: RegExp, startFrom = 0): number {
  for (let i = startFrom; i < lines.length; i++) {
    if (pattern.test(lines[i].replace(/\s/g, ""))) return i;
  }
  return -1;
}

/** 페이지 헤더 줄 판별 (무시 대상) */
export function isPageHeader(line: string): boolean {
  const c = line.replace(/\s/g, "");
  return /^감정평가액의산출근거및결정의견$/.test(c) ||
    /^\d{1,3}감정평가액의산출근거및결정의견$/.test(c) ||
    /^구분건물감정평가명세표$/.test(c);
}

/** 인라인 KV 추출: "소재지경기도 안양시건물명인덕원역 AK밸리" */
export function extractInlineKV(line: string, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const positions: { key: string; idx: number }[] = [];
  for (const key of keys) {
    const idx = line.indexOf(key);
    if (idx >= 0) positions.push({ key, idx });
  }
  positions.sort((a, b) => a.idx - b.idx);
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx + positions[i].key.length;
    const end = i + 1 < positions.length ? positions[i + 1].idx : line.length;
    const val = line.slice(start, end).trim();
    if (val) result[positions[i].key] = val;
  }
  return result;
}

// ── 텍스트 추출 ──

async function extractLines(buffer: Buffer): Promise<string[]> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as any).default || mod;
  const data = await pdfParse(buffer);
  const text: string = data.text || "";
  if (!text || text.trim().length < 50) return [];
  return text.split(/\n/).filter((l: string) => l.trim().length > 0);
}

// ── 섹션 파서 스텁 (Task 3~7에서 구현) ──

function parseBasicInfo(lines: string[]): {
  data: Partial<CollateralAnalysis>;
  confidence: number;
} {
  return { data: {}, confidence: 0 };
}

function parseUnitAppraisals(lines: string[]): {
  data: CollateralDetailItem[];
  confidence: number;
} {
  return { data: [], confidence: 0 };
}

function parseComparativeBuildings(lines: string[]): {
  data: { buildings: ComparativeBuilding[]; cases: ComparativeCase[] };
  confidence: number;
} {
  return { data: { buildings: [], cases: [] }, confidence: 0 };
}

function parseAuctionQuote(lines: string[]): {
  data: AuctionQuote | null;
  confidence: number;
} {
  return { data: null, confidence: 0 };
}

function parsePropertyOverview(lines: string[]): {
  data: Partial<SupplyOverview>;
  confidence: number;
} {
  return { data: {}, confidence: 0 };
}

function parseFloorSummary(lines: string[]): {
  data: CollateralDetailItem[];
  confidence: number;
} {
  return { data: [], confidence: 0 };
}

function parseValuationSummary(lines: string[]): {
  data: AppraisalParseResult["valuationSummary"];
  confidence: number;
} {
  return { data: null, confidence: 0 };
}

// ── 메인 파서 ──

export async function parseAppraisalPdf(
  buffer: Buffer,
  _propertyType: string,
): Promise<AppraisalParseResult> {
  const warnings: string[] = [];
  const confidence: Record<string, number> = {};

  const lines = await extractLines(buffer);
  if (lines.length === 0) {
    return {
      collateral: {},
      comparatives: [],
      comparativeBuildings: [],
      supply: {},
      collateralDetail: [],
      auctionQuote: null,
      valuationSummary: null,
      confidence: {},
      warnings: ["PDF에서 텍스트를 추출할 수 없습니다."],
    };
  }

  console.log(`[AppraisalParser v2] ${lines.length}줄 추출`);

  const parsers: [string, () => any][] = [
    ["basicInfo", () => parseBasicInfo(lines)],
    ["unitAppraisals", () => parseUnitAppraisals(lines)],
    ["comparatives", () => parseComparativeBuildings(lines)],
    ["auctionQuote", () => parseAuctionQuote(lines)],
    ["propertyOverview", () => parsePropertyOverview(lines)],
    ["floorSummary", () => parseFloorSummary(lines)],
    ["valuationSummary", () => parseValuationSummary(lines)],
  ];

  const results: Record<string, any> = {};
  for (const [name, fn] of parsers) {
    try {
      const r = fn();
      results[name] = r.data;
      confidence[name] = r.confidence;
      if (r.confidence === 0) warnings.push(`${name} 섹션을 찾지 못했습니다.`);
    } catch (e: any) {
      warnings.push(`${name} 파싱 오류: ${e?.message || e}`);
      confidence[name] = 0;
    }
  }

  const unitItems: CollateralDetailItem[] = results.unitAppraisals || [];
  const floorItems: CollateralDetailItem[] = results.floorSummary || [];
  const detail = unitItems.length > 0 ? unitItems : floorItems;
  const comp = results.comparatives || { buildings: [], cases: [] };

  return {
    collateral: results.basicInfo || {},
    comparatives: comp.cases,
    comparativeBuildings: comp.buildings,
    supply: results.propertyOverview || {},
    collateralDetail: detail,
    auctionQuote: results.auctionQuote || null,
    valuationSummary: results.valuationSummary || null,
    confidence,
    warnings,
  };
}
