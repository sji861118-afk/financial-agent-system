# 감정평가서 파서 고도화 (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 감정평가서 PDF에서 여신승인신청서에 필요한 8개 블록을 정확히 추출하여 엑셀로 내보낼 수 있는 구조로 파서를 전면 재작성한다.

**Architecture:** 기존 `appraisal-parser.ts`를 전면 교체. pdf-parse 기반 줄 단위 텍스트에서 섹션별 파서 8개를 순차 적용. 각 파서는 독립적으로 동작하며 실패해도 다른 파서에 영향 없음. 테스트는 실제 에이엠플러스인덕원 감정평가서 텍스트 스냅샷 기반.

**Tech Stack:** pdf-parse (텍스트 추출), TypeScript, Node.js test runner

**검증 대상 PDF:** `_reference/2.감정평가서 샘플/에이엠플러스인덕원_감정평가서 C32508-2-1401 DRAFT(170개호)_1 (1).pdf`

---

## 핵심 발견사항 (PDF 텍스트 패턴)

에이엠플러스인덕원 감정평가서 (157페이지, 7519줄)에서 확인된 패턴:

1. **키-값이 공백 없이 연결**: `소재지경기도 안양시`, `대지면적(㎡)14,674.40연면적(㎡)94,081.50`
2. **감정평가액에 원화기호**: `\78,022,000,000부동산(구분건물)`
3. **날짜 3개 연결**: `2025. 08. 182025. 08. 182025. 08. 18`
4. **테이블 헤더가 여러 줄에 걸침**: 헤더 키워드가 2-4줄에 분산
5. **페이지 헤더 반복**: `감정평가액의 산출근거 및 결정 의견` + 페이지번호가 섹션 중간에 삽입
6. **비준가액 테이블**: 일련번호/층·호/적용단가/전유면적/비준가액 이 3줄씩 반복 (번호, 층, 호+숫자들)
7. **사례 데이터**: 건물별 소개 후 거래사례/감정평가사례 테이블이 따라옴

## 파일 구조

```
app/src/lib/
  appraisal-parser.ts          ← 전면 재작성 (메인 오케스트레이터 + 8개 섹션 파서)
app/src/types/
  appraisal.ts                 ← ComparativeBuilding 타입 추가, AuctionQuote 타입 추가
app/src/app/api/appraisal/parse/
  route.ts                     ← 변경 없음 (이미 파서 호출 구조)
app/
  test-appraisal-v2.mjs        ← 실제 PDF 기반 통합 테스트 스크립트
```

---

### Task 1: 타입 확장 — ComparativeBuilding, AuctionQuote 추가

**Files:**
- Modify: `app/src/types/appraisal.ts`

현재 `ComparativeCase`는 개별 거래/평가 행만 표현. 신청서에는 **건물 단위**로 묶여야 함 (소재지, 대지면적, 연면적 등 + 하위 거래/평가 행 배열). 또한 감정평가서 내 경매통계 인용 데이터를 위한 타입 필요.

- [ ] **Step 1: ComparativeBuilding 타입 추가**

`app/src/types/appraisal.ts`에서 `ComparativeCase` 인터페이스 뒤에 추가:

```typescript
/** 비준사례 건물 단위 (건물 정보 + 하위 거래/평가 행) */
export interface ComparativeBuilding {
  label: string;               // "사례 A: 평촌역 하이필드 지식산업센터"
  category: string;            // "근린생활시설" | "공장(지식산업센터)" 등
  address: string;             // "경기도 안양시 동안구 관양동 922"
  buildingName: string;        // "평촌역 하이필드 지식산업센터"
  landAreaSqm: number;         // 대지면적
  grossAreaSqm: number;        // 연면적
  buildingAreaSqm: number;     // 건축면적
  coverageFloorRatio: string;  // "69.89% / 379.05%"
  scale: string;               // "지하 2 / 지상 17"
  approvalDate: string;        // 사용승인일 "2018-11-15"
  source: string;              // "등기사항전부증명서"
  transactions: ComparativeCase[];  // 거래사례 행
  appraisals: ComparativeCase[];    // 감정평가사례 행
}

/** 감정평가서 내 경매통계 인용 */
export interface AuctionQuote {
  region: string;              // "경기 안양시 동안구"
  period: string;              // "2024년 08월 ~ 2025년 07월"
  rows: {
    usage: string;             // "근린상가" | "아파트형공장"
    totalAppraisal: number;    // 총감정가
    totalBid: number;          // 총낙찰가
    bidRate: number;           // 낙찰가율(%)
    totalCases: number;        // 총건수
    bidCases: number;          // 낙찰건수
    bidCaseRate: number;       // 낙찰률(%)
  }[];
  source: string;              // "인포케어"
}
```

- [ ] **Step 2: AppraisalParseResult 확장**

같은 파일에서 `AppraisalParseResult` 인터페이스 수정:

```typescript
export interface AppraisalParseResult {
  collateral: Partial<CollateralAnalysis>;
  comparatives: ComparativeCase[];
  comparativeBuildings: ComparativeBuilding[];  // 추가: 건물 단위 비준사례
  supply: Partial<SupplyOverview>;
  collateralDetail: CollateralDetailItem[];
  auctionQuote: AuctionQuote | null;            // 추가: 경매통계 인용
  valuationSummary: {                           // 추가: 시산가액 검토 + 결정
    comparisonTotal: number;                    // 비교방식 합계
    incomeTotal: number;                        // 수익방식 합계
    finalValue: number;                         // 최종 감정평가액
    method: string;                             // 결정 근거 ("거래사례비교법")
  } | null;
  confidence: Record<string, number>;
  warnings: string[];
}
```

- [ ] **Step 3: 타입 체크**

```bash
cd app && npx tsc --noEmit 2>&1 | head -20
```

기존 코드에서 `AppraisalParseResult`를 사용하는 곳에 새 필드가 optional이 아니므로 파서 반환부도 함께 수정 필요 → Task 2에서 처리.

- [ ] **Step 4: Commit**

```bash
git add app/src/types/appraisal.ts
git commit -m "feat(appraisal): add ComparativeBuilding, AuctionQuote, valuationSummary types"
```

---

### Task 2: 파서 유틸리티 함수 + 텍스트 추출 리팩토링

**Files:**
- Modify: `app/src/lib/appraisal-parser.ts` (전체 재작성 시작)

기존 파서의 `parseNumber`, `extractDate`, `extractPdfLinesFallback` 등 유틸은 유지하되, 새로운 패턴 매칭 유틸을 추가하고 메인 함수 구조를 변경.

- [ ] **Step 1: 파서 파일 상단 유틸리티 재작성**

`app/src/lib/appraisal-parser.ts` 전체를 다음으로 교체 (이 Task에서는 유틸 + 메인 스켈레톤만):

```typescript
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
  // 원화기호 제거
  s = s.replace(/^[\\₩￦]/, "");
  const negative = (s.startsWith("(") && s.endsWith(")")) || s.startsWith("-");
  s = s.replace(/[()\\₩￦\-]/g, "");
  // 숫자+소수점만 남기기
  s = s.replace(/[^\d.]/g, "");
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

/** 날짜 추출: "2025. 08. 18", "2025.08.18", "2025-08-18", "2025년 8월 18일" */
export function extractDate(text: string): string | null {
  const m = text.match(/(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*일?/);
  if (m) return `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
  return null;
}

/** 공백 제거된 텍스트로 키워드 검색 (원본 인덱스 반환) */
export function findLineIndex(
  lines: string[],
  pattern: RegExp,
  startFrom = 0,
): number {
  for (let i = startFrom; i < lines.length; i++) {
    if (pattern.test(lines[i].replace(/\s/g, ""))) return i;
  }
  return -1;
}

/** 여러 키워드 중 하나라도 매칭되는 줄 찾기 */
export function findLineAny(
  lines: string[],
  patterns: RegExp[],
  startFrom = 0,
): number {
  for (let i = startFrom; i < lines.length; i++) {
    const cleaned = lines[i].replace(/\s/g, "");
    for (const p of patterns) {
      if (p.test(cleaned)) return i;
    }
  }
  return -1;
}

/** 페이지 헤더 줄인지 판별 (무시 대상) */
export function isPageHeader(line: string): boolean {
  const c = line.replace(/\s/g, "");
  return /^감정평가액의산출근거및결정의견$/.test(c) ||
    /^\d{1,3}감정평가액의산출근거및결정의견$/.test(c) ||
    /^구분건물감정평가명세표$/.test(c);
}

/** 연속된 KV 쌍 추출: "소재지경기도 안양시" → { 소재지: "경기도 안양시" } */
export function extractInlineKV(
  line: string,
  keys: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  // 키 위치를 모두 찾고 다음 키까지가 값
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

// ── pdf-parse 텍스트 추출 ──

async function extractLines(buffer: Buffer): Promise<string[]> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as any).default || mod;
  const data = await pdfParse(buffer);
  const text: string = data.text || "";
  if (!text || text.trim().length < 50) return [];
  return text.split(/\n/).filter((l: string) => l.trim().length > 0);
}

// ── 섹션 파서 (Task 3~8에서 구현) ──

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

  // 각 섹션 독립 파싱
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

  // 층별 요약(floorSummary)을 collateralDetail로, 호실별(unitAppraisals)을 우선
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
```

- [ ] **Step 2: API route 업데이트 — 새 필드 전달**

`app/src/app/api/appraisal/parse/route.ts` 수정 — 병합 로직에 새 필드 추가:

`mergedCollateral` 선언 아래에 추가:

```typescript
const mergedBuildings: ComparativeBuilding[] = [];
let mergedAuctionQuote: AuctionQuote | null = null;
let mergedValuation: AppraisalParseResult["valuationSummary"] = null;
```

파일 결과 루프 내에 추가:
```typescript
if (result.comparativeBuildings.length > 0) {
  mergedBuildings.push(...result.comparativeBuildings);
}
if (!mergedAuctionQuote && result.auctionQuote) {
  mergedAuctionQuote = result.auctionQuote;
}
if (!mergedValuation && result.valuationSummary) {
  mergedValuation = result.valuationSummary;
}
```

merged 객체에 추가:
```typescript
comparativeBuildings: mergedBuildings,
auctionQuote: mergedAuctionQuote,
valuationSummary: mergedValuation,
```

- [ ] **Step 3: 타입 체크**

```bash
cd app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/appraisal-parser.ts app/src/app/api/appraisal/parse/route.ts
git commit -m "refactor(appraisal): parser v2 skeleton with utility functions"
```

---

### Task 3: 기본정보 파서 — parseBasicInfo

**Files:**
- Modify: `app/src/lib/appraisal-parser.ts` (parseBasicInfo 함수)

에이엠플러스 PDF 패턴 기반:
- line 5: `카카오페이증권` (의뢰인)
- line 7: `C32508-2-1401` (일련번호)
- line 8: `(주)태평양감정평가법인` (평가기관)
- line 29: `소 유 자` → line 31: `에이엠플러스자산개발(주)`
- line 32: `\78,022,000,000부동산(구분건물)` (감정평가액)
- line 33: `우리자산신탁(주)` (위탁자)
- line 89: `2025. 08. 182025. 08. 182025. 08. 18` (기준시점)
- line 85: `담보` (평가목적)
- line 87: `카카오페이증권` (제출처)
- line 94: `칠백팔십억이천이백만원정 (\78,022,000,000.-)` (감정평가액 확인)

- [ ] **Step 1: parseBasicInfo 구현**

`appraisal-parser.ts`에서 `parseBasicInfo` 함수를 교체:

```typescript
function parseBasicInfo(lines: string[]): {
  data: Partial<CollateralAnalysis>;
  confidence: number;
} {
  const result: Partial<CollateralAnalysis> = {};
  let fieldsFound = 0;

  // 1. 감정평가서번호 (일련번호): "C32508-2-1401" 또는 유사 패턴
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const m = lines[i].match(/([A-Z]?\d{3,6}-\d{1,2}-\d{3,5})/);
    if (m) { result.serialNo = m[1]; fieldsFound++; break; }
  }
  // P번호 패턴도 탐색 (일련번호 "P250820-C101")
  for (let i = 0; i < Math.min(200, lines.length); i++) {
    const m = lines[i].match(/(P\d{6}-[A-Z]\d{2,4})/);
    if (m && !result.serialNo) { result.serialNo = m[1]; fieldsFound++; break; }
  }

  // 2. 평가기관: "(주)XXX감정평가법인" 패턴
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (/감정평가법인/.test(lines[i])) {
      result.appraiser = lines[i].trim();
      fieldsFound++;
      break;
    }
  }

  // 3. 담보가치분석총괄표 영역 (line 25~100 부근)
  const summaryStart = findLineIndex(lines, /담보가치분석총괄표|담보물건/);
  if (summaryStart >= 0) {
    const block = lines.slice(summaryStart, Math.min(summaryStart + 80, lines.length));

    for (const line of block) {
      const cleaned = line.replace(/\s/g, "");

      // 소유자
      if (!result.owner && /소유자/.test(cleaned)) {
        // 소유자 키워드 다음 줄이 값인 경우가 많음
        const idx = block.indexOf(line);
        if (idx >= 0 && idx + 1 < block.length) {
          const nextLine = block[idx + 1].trim();
          if (nextLine && !/채무자|감정평가|물건종류/.test(nextLine)) {
            result.owner = nextLine;
            fieldsFound++;
          }
        }
      }

      // 감정평가액: \숫자 또는 ₩숫자 패턴
      if (!result.appraisalValue) {
        const valMatch = cleaned.match(/[\\₩￦]([\d,]+)/);
        if (valMatch) {
          const v = parseNum(valMatch[1]);
          if (v && v > 1_000_000) { // 최소 백만원 이상
            result.appraisalValue = v;
            fieldsFound++;
          }
        }
      }
    }
  }

  // 4. 위탁자: 신탁(주) 패턴
  for (let i = Math.max(0, (summaryStart || 0)); i < Math.min((summaryStart || 0) + 80, lines.length); i++) {
    if (/신탁\s*\(?\s*주\s*\)?/.test(lines[i]) && !result.trustee) {
      result.trustee = lines[i].trim();
      fieldsFound++;
      break;
    }
  }

  // 5. 감정평가표 영역 — 의뢰인, 기준시점, 평가목적, 제출처
  const evalTableStart = findLineIndex(lines, /감정평가표|괄호감정표/);
  if (evalTableStart >= 0) {
    const block = lines.slice(evalTableStart, Math.min(evalTableStart + 60, lines.length));

    for (let i = 0; i < block.length; i++) {
      const line = block[i];
      const cleaned = line.replace(/\s/g, "");

      // 기준시점: 날짜 패턴이 연속 (2025. 08. 182025. 08. 18...)
      if (!result.baseDate && /\d{4}\.\s*\d{2}\.\s*\d{2}/.test(line)) {
        const d = extractDate(line);
        if (d) { result.baseDate = d; fieldsFound++; }
      }

      // 평가목적: "담보" 단독 줄
      if (!result.purpose && /^담보$/.test(cleaned)) {
        result.purpose = "담보";
        fieldsFound++;
      }

      // 시장가치 확인
      if (/시장가치/.test(cleaned) && !result.purpose) {
        result.purpose = "담보";
      }

      // 제출처: 평가기관이 아닌 회사명 (증권, 은행 등)
      if (!result.submittedTo && /증권|은행|캐피탈|저축은행|신탁/.test(line) && !/감정평가/.test(line)) {
        // 의뢰인 또는 제출처일 가능성
        const candidate = line.trim();
        if (candidate.length < 30) {
          result.submittedTo = candidate;
          fieldsFound++;
        }
      }
    }
  }

  // 6. 채무자: "채무자" 키워드 다음 줄
  const debtorIdx = findLineIndex(lines, /채\s*무\s*자/);
  if (debtorIdx >= 0 && debtorIdx + 1 < lines.length) {
    const next = lines[debtorIdx + 1].trim();
    if (next && !/물건|소재|감정/.test(next)) {
      result.debtor = next;
      fieldsFound++;
    }
  }

  // 7. 평가방법: 비교방식/수익방식 금액은 valuationSummary에서 처리
  // 여기서는 method 구조만 초기화
  result.method = { comparison: 0, cost: 0, income: 0 };

  // 8. formRequirements: 감정평가표에서 서명날인 확인
  const signIdx = findLineIndex(lines, /서명날인|서명\s*또는\s*인/);
  result.formRequirements = {
    officialAppraisal: true, // 감정평가서가 존재하면 true
    signatureComplete: signIdx >= 0,
    forFinancialUse: (result.purpose || "").includes("담보"),
    reused: false,
    reusedNote: "",
    conditional: false,
  };
  // 조건부감정 확인
  const condIdx = findLineIndex(lines, /감정평가조건/);
  if (condIdx >= 0 && condIdx + 1 < lines.length) {
    const condLine = lines[condIdx + 1].replace(/\s/g, "");
    result.formRequirements.conditional = condLine !== "-" && condLine !== "없습니다" && condLine.length > 2;
  }

  const confidence = Math.min(1, fieldsFound / 6);
  return { data: result, confidence };
}
```

- [ ] **Step 2: 테스트 스크립트 생성**

`app/test-appraisal-v2.mjs` 생성:

```javascript
/**
 * 감정평가서 파서 v2 통합 테스트
 * Usage: node test-appraisal-v2.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const PDF_PATH = resolve("../_reference/2.감정평가서 샘플/에이엠플러스인덕원_감정평가서 C32508-2-1401 DRAFT(170개호)_1 (1).pdf");

// pdf-parse로 텍스트 추출
const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
const buffer = readFileSync(PDF_PATH);
const data = await pdfParse(buffer);
const lines = data.text.split(/\n/).filter(l => l.trim().length > 0);

console.log(`\n=== 감정평가서 파서 v2 테스트 ===`);
console.log(`PDF: ${lines.length}줄\n`);

// 유틸 함수 인라인 테스트
function parseNum(raw) {
  if (!raw || raw === "-") return null;
  let s = raw.replace(/[\s,]/g, "");
  s = s.replace(/^[\\₩￦]/, "");
  const negative = (s.startsWith("(") && s.endsWith(")")) || s.startsWith("-");
  s = s.replace(/[()\\₩￦\-]/g, "").replace(/[^\d.]/g, "");
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

// parseNum 테스트
const numTests = [
  ["\\78,022,000,000부동산(구분건물)", 78022000000],
  ["78,022,000,000", 78022000000],
  ["₩78,022,000,000", 78022000000],
  ["12,026,713", 12026713],
  ["-55.02", -55.02],
  ["(1,234)", -1234],
  ["4,083,000,000", 4083000000],
];
console.log("▶ parseNum 테스트:");
for (const [input, expected] of numTests) {
  const result = parseNum(input);
  const pass = result === expected;
  console.log(`  ${pass ? "✓" : "✗"} parseNum("${input}") = ${result} (expected ${expected})`);
}

// 기본정보 추출 테스트
console.log("\n▶ 기본정보 추출 테스트:");

// 일련번호
let serialNo = null;
for (let i = 0; i < 20; i++) {
  const m = lines[i].match(/([A-Z]?\d{3,6}-\d{1,2}-\d{3,5})/);
  if (m) { serialNo = m[1]; break; }
}
console.log(`  일련번호: ${serialNo} (expected: C32508-2-1401)`);

// 평가기관
let appraiser = null;
for (let i = 0; i < 20; i++) {
  if (/감정평가법인/.test(lines[i])) { appraiser = lines[i].trim(); break; }
}
console.log(`  평가기관: ${appraiser} (expected: (주)태평양감정평가법인)`);

// 감정평가액
let appraisalValue = null;
for (let i = 0; i < 120; i++) {
  const cleaned = lines[i].replace(/\s/g, "");
  const m = cleaned.match(/[\\₩￦]([\d,]+)/);
  if (m) {
    const v = parseNum(m[1]);
    if (v && v > 1000000) { appraisalValue = v; break; }
  }
}
console.log(`  감정평가액: ${appraisalValue?.toLocaleString()} (expected: 78,022,000,000)`);

// 기준시점
let baseDate = null;
for (let i = 60; i < 120; i++) {
  const m = lines[i].match(/(\d{4})\.\s*(\d{2})\.\s*(\d{2})/);
  if (m) { baseDate = `${m[1]}.${m[2]}.${m[3]}`; break; }
}
console.log(`  기준시점: ${baseDate} (expected: 2025.08.18)`);

console.log("\n=== 테스트 완료 ===");
```

- [ ] **Step 3: 테스트 실행**

```bash
cd app && node --max-old-space-size=512 test-appraisal-v2.mjs
```

Expected: parseNum 전체 통과, 기본정보 4개 필드 정확 매칭.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/appraisal-parser.ts app/test-appraisal-v2.mjs
git commit -m "feat(appraisal): parseBasicInfo - extract owner, appraiser, value, date"
```

---

### Task 4: 호실별 감정가 파서 — parseUnitAppraisals

**Files:**
- Modify: `app/src/lib/appraisal-parser.ts` (parseUnitAppraisals 함수)

에이엠플러스 PDF 비준가액 테이블 패턴 (line 1617~3085):
```
[비준가액: 유효숫자 셋째 자리 미만 절사]
일련
번호
층·호적용단가 (원/㎡)전유면적(㎡)비준가액 (원)
1                          ← 일련번호
제1층                      ← 층
제근생 103 호              ← 호
12,026,713  1.000  0.99386  0.998  11,928,963   ← 적용단가 행 (Task 4에서는 비준가액 테이블 사용)
```

비준가액 테이블이 더 깔끔함 (line 2800+ 구간):
```
일련
번호
층·호적용단가 (원/㎡)전유면적(㎡)비준가액 (원)
128
제12 층
제1213 호
 9,275,687  41.27  382,000,000
```

패턴: 일련번호(숫자 단독행) → 층(제N층) → 호(제NNNN호) → 숫자행(적용단가 면적 비준가액)

- [ ] **Step 1: parseUnitAppraisals 구현**

```typescript
function parseUnitAppraisals(lines: string[]): {
  data: CollateralDetailItem[];
  confidence: number;
} {
  const items: CollateralDetailItem[] = [];

  // 비준가액 테이블 시작 찾기: "비준가액" + "유효숫자" 키워드
  // 또는 "적용단가" 헤더
  let searchStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].replace(/\s/g, "");
    if (c.includes("적용단가") && (c.includes("비준가액") || c.includes("전유면적"))) {
      searchStart = i;
      break;
    }
  }
  if (searchStart === 0) {
    // fallback: "비준가액" + "절사" 키워드
    for (let i = 0; i < lines.length; i++) {
      if (/비준가액/.test(lines[i]) && /절사/.test(lines[i])) {
        searchStart = i;
        break;
      }
    }
  }
  if (searchStart === 0) return { data: [], confidence: 0 };

  // 3줄 단위 패턴 매칭: 일련번호 → 층 → 호+숫자
  let i = searchStart;
  while (i < lines.length) {
    // 페이지 헤더 건너뛰기
    if (isPageHeader(lines[i]) || /^\[비준가액|^\[적용단가|^일련$|^번호$/.test(lines[i].trim()) ||
        /^층·호/.test(lines[i].replace(/\s/g, ""))) {
      i++;
      continue;
    }

    // 감정평가액 결정 섹션 도달 시 종료
    if (/감정평가액\s*결정/.test(lines[i].replace(/\s/g, "")) && !/산출근거/.test(lines[i])) break;
    // 수익방식 섹션 도달 시 종료
    if (/수익방식의\s*적용|수익환원법/.test(lines[i].replace(/\s/g, ""))) break;

    // 일련번호: 순수 숫자만 있는 줄 (1~999)
    const numMatch = lines[i].trim().match(/^(\d{1,3})$/);
    if (numMatch) {
      const no = parseInt(numMatch[1]);
      if (no >= 1 && no <= 999) {
        // 다음 줄: 층 ("제N층" 또는 "제N 층")
        let floor = "";
        let unit = "";
        let j = i + 1;

        // 층 찾기
        while (j < Math.min(i + 5, lines.length)) {
          const floorMatch = lines[j].trim().match(/제\s*(\d{1,2})\s*층/);
          if (floorMatch) {
            floor = `${floorMatch[1]}층`;
            j++;
            break;
          }
          j++;
        }

        // 호 + 숫자 행 찾기
        while (j < Math.min(i + 8, lines.length)) {
          const line = lines[j].trim();
          // 호실 패턴: "제근생 103 호", "제1213 호", "제공장 101 호"
          const unitMatch = line.match(/제\s*(.+?)\s*호/);
          if (unitMatch) {
            unit = unitMatch[1].replace(/\s+/g, "").replace(/제/, "") + "호";
            // 같은 줄 또는 다음 줄에 숫자가 있을 수 있음
            // 호 뒤에 이어지는 숫자들: " 9,542,500 50.17 478,000,000"
            const afterUnit = line.replace(/.*호/, "").trim();
            const nums = afterUnit.match(/[\d,.]+/g);

            if (nums && nums.length >= 2) {
              const parsedNums = nums.map(n => parseNum(n)).filter((n): n is number => n !== null && n > 0);
              // 패턴: [적용단가, 전유면적, 비준가액] 또는 [전유면적, 비준가액]
              let areaSqm = 0;
              let appraisalValue = 0;
              let pricePerSqm = 0;

              if (parsedNums.length >= 3) {
                // 적용단가, 전유면적, 비준가액
                pricePerSqm = parsedNums[0];
                areaSqm = parsedNums[1];
                appraisalValue = parsedNums[2];
              } else if (parsedNums.length === 2) {
                areaSqm = parsedNums[0];
                appraisalValue = parsedNums[1];
              }

              if (appraisalValue > 0) {
                const areaPyeong = Math.round(areaSqm / 3.3058 * 100) / 100;
                items.push({
                  no,
                  unit: `${floor} ${unit}`,
                  floor,
                  areaSqm,
                  areaPyeong,
                  appraisalValue,
                  planPrice: 0,
                  releaseCondition: 0,
                  appraisalPricePerPyeong: areaPyeong > 0
                    ? Math.round(appraisalValue / areaPyeong)
                    : 0,
                  planPricePerPyeong: 0,
                  status: "분양",
                  remarks: "",
                });
              }
            } else {
              // 숫자가 다음 줄에 있는 경우
              j++;
              if (j < lines.length) {
                const numLine = lines[j].trim();
                const allNums = numLine.match(/[\d,.]+/g);
                if (allNums) {
                  const parsedNums = allNums.map(n => parseNum(n)).filter((n): n is number => n !== null && n > 0);
                  let areaSqm = 0;
                  let appraisalValue = 0;

                  if (parsedNums.length >= 3) {
                    areaSqm = parsedNums[parsedNums.length - 2];
                    appraisalValue = parsedNums[parsedNums.length - 1];
                  } else if (parsedNums.length === 2) {
                    areaSqm = parsedNums[0];
                    appraisalValue = parsedNums[1];
                  }

                  if (appraisalValue > 0) {
                    const areaPyeong = Math.round(areaSqm / 3.3058 * 100) / 100;
                    items.push({
                      no,
                      unit: `${floor} ${unit}`,
                      floor,
                      areaSqm,
                      areaPyeong,
                      appraisalValue,
                      planPrice: 0,
                      releaseCondition: 0,
                      appraisalPricePerPyeong: areaPyeong > 0
                        ? Math.round(appraisalValue / areaPyeong)
                        : 0,
                      planPricePerPyeong: 0,
                      status: "분양",
                      remarks: "",
                    });
                  }
                }
              }
            }
            i = j + 1;
            break;
          }
          j++;
        }
        if (j >= Math.min(i + 8, lines.length)) i = j;
        continue;
      }
    }
    i++;
  }

  const confidence = items.length > 0 ? Math.min(1, items.length / 50) : 0;
  return { data: items, confidence };
}
```

- [ ] **Step 2: 테스트에 호실별 검증 추가**

`test-appraisal-v2.mjs`에 추가:

```javascript
// 호실별 감정가 테스트 (비준가액 테이블)
console.log("\n▶ 호실별 감정가 추출 테스트:");
// 검증 포인트:
// - 총 170건 추출
// - 1번: 1층 근생103호, 55.02㎡, 656,000,000원 (11,928,963 × 55.02)
// - 170번: 14층 1422호, 50.17㎡, 478,000,000원
// - 합계: 78,022,000,000원
```

- [ ] **Step 3: 테스트 실행 및 검증**

```bash
cd app && node --max-old-space-size=512 test-appraisal-v2.mjs
```

Expected: 170개 호실, 합계 78,022,000,000원.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/appraisal-parser.ts app/test-appraisal-v2.mjs
git commit -m "feat(appraisal): parseUnitAppraisals - extract 170 unit-level valuations"
```

---

### Task 5: 비준사례 건물별 파서 — parseComparativeBuildings

**Files:**
- Modify: `app/src/lib/appraisal-parser.ts` (parseComparativeBuildings 함수)

에이엠플러스 PDF 사례 패턴 (line 1048~1235):
- 카테고리별: "1. 근린생활시설 사례" → "2. 공장(지식산업센터) 사례"
- 건물별: "2.1. 사례 A: 평촌역 하이필드 지식산업센터" (사진 포함)
- 건물 정보: `소재지경기도...` / `대지면적(㎡)14,674.40연면적(㎡)94,081.50`
- 거래사례 테이블: `구분층호전유면적(㎡)거래일자거래금액(원)단가(천원/전유㎡)비고`
- 감정평가사례 테이블: `구분층호전유면적(㎡)기준시점감정평가액(원)단가(원/전유㎡)비고`

그리고 근생시설 거래사례/평가사례 (line 1048~1160):
- 개별 행이 여러 줄에 걸침 (기호 → 소재지 → 건물명 → 층·호 → 용도 → 면적 → 일자 → 금액)

- [ ] **Step 1: parseComparativeBuildings 구현**

```typescript
function parseComparativeBuildings(lines: string[]): {
  data: { buildings: ComparativeBuilding[]; cases: ComparativeCase[] };
  confidence: number;
} {
  const buildings: ComparativeBuilding[] = [];
  const flatCases: ComparativeCase[] = [];

  // "사례 A:", "사례 B:" 등의 건물 블록 찾기
  const buildingStarts: { idx: number; label: string; category: string }[] = [];
  let currentCategory = "";

  for (let i = 0; i < lines.length; i++) {
    const cleaned = lines[i].replace(/\s/g, "");
    // 카테고리: "1. 근린생활시설 사례", "2. 공장(지식산업센터) 사례"
    const catMatch = cleaned.match(/^\d+\.\s*(근린생활시설|공장|지식산업센터|오피스텔|오피스|아파트).*사례/);
    if (catMatch) {
      currentCategory = catMatch[1].includes("공장") ? "공장(지식산업센터)" : catMatch[1];
    }
    // 건물: "2.1. 사례 A: ..." 또는 "사례 A:"
    const buildMatch = lines[i].match(/사례\s*([A-Z])\s*[:：]\s*(.+)/);
    if (buildMatch && currentCategory) {
      buildingStarts.push({
        idx: i,
        label: `사례 ${buildMatch[1]}: ${buildMatch[2].trim()}`,
        category: currentCategory,
      });
    }
  }

  // 각 건물 블록 파싱
  for (let b = 0; b < buildingStarts.length; b++) {
    const start = buildingStarts[b].idx;
    const end = b + 1 < buildingStarts.length
      ? buildingStarts[b + 1].idx
      : Math.min(start + 100, lines.length);

    const block = lines.slice(start, end);
    const building: ComparativeBuilding = {
      label: buildingStarts[b].label,
      category: buildingStarts[b].category,
      address: "",
      buildingName: "",
      landAreaSqm: 0,
      grossAreaSqm: 0,
      buildingAreaSqm: 0,
      coverageFloorRatio: "",
      scale: "",
      approvalDate: "",
      source: "",
      transactions: [],
      appraisals: [],
    };

    // 건물명은 사례 라벨에서 추출
    const nameMatch = buildingStarts[b].label.match(/[:：]\s*(.+)/);
    if (nameMatch) building.buildingName = nameMatch[1].trim();

    for (const line of block) {
      const c = line.replace(/\s/g, "");

      // 소재지
      if (c.startsWith("소재지") && !building.address) {
        building.address = c.replace("소재지", "").trim();
      }

      // 대지면적, 연면적 (같은 줄: "대지면적(㎡)14,674.40연면적(㎡)94,081.50")
      const landMatch = c.match(/대지면적\(㎡\)([\d,.]+)/);
      if (landMatch) building.landAreaSqm = parseNum(landMatch[1]) || 0;
      const grossMatch = c.match(/연면적\(㎡\)([\d,.]+)/);
      if (grossMatch) building.grossAreaSqm = parseNum(grossMatch[1]) || 0;
      const bldgMatch = c.match(/건축면적\(㎡\)([\d,.]+)/);
      if (bldgMatch) building.buildingAreaSqm = parseNum(bldgMatch[1]) || 0;

      // 건폐율/용적률
      const ratioMatch = c.match(/건폐율\s*\/?\s*용적률\s*\(%?\)?\s*([\d.]+%\s*\/\s*[\d.]+%)/);
      if (ratioMatch) building.coverageFloorRatio = ratioMatch[1];

      // 규모
      const scaleMatch = c.match(/규모(.+?)사용승인/);
      if (scaleMatch) building.scale = scaleMatch[1].trim();

      // 사용승인일
      const approvalMatch = c.match(/사용승인일?([\d\-\.]+)/);
      if (approvalMatch) building.approvalDate = approvalMatch[1];

      // 출처
      if (/출처/.test(line)) {
        const srcMatch = line.match(/출처\s*[:：]?\s*(.+)/);
        if (srcMatch) building.source = srcMatch[1].trim();
      }
    }

    // 거래사례/감정평가사례 행 파싱
    let mode: "none" | "transaction" | "appraisal" = "none";
    for (const line of block) {
      const c = line.replace(/\s/g, "");
      if (/실거래사례|거래사례$/.test(c) && !/비교법/.test(c)) { mode = "transaction"; continue; }
      if (/감정평가사례/.test(c)) { mode = "appraisal"; continue; }
      if (/^구분층호/.test(c)) continue; // 헤더 건너뛰기
      if (mode === "none") continue;

      // 데이터 행: 기호+층+호+면적+일자+금액+단가 (한 줄에 연결)
      // 예: "ᄅ6B-F60576.442023-01-11580,000,0007,587,650선정"
      const nums = line.match(/[\d,.]+/g);
      if (!nums || nums.length < 3) continue;

      const parsedNums = nums.map(n => parseNum(n)).filter((n): n is number => n !== null);
      if (parsedNums.length < 3) continue;

      // 날짜 추출
      const dateMatch = line.match(/(\d{4}[\-.]?\d{2}[\-.]?\d{2})/);
      const caseDate = dateMatch ? extractDate(dateMatch[0]) || dateMatch[0] : "";

      // 면적은 보통 100 미만, 금액은 100,000 이상
      let areaSqm = 0;
      let price = 0;
      let pricePerSqm = 0;
      for (const n of parsedNums) {
        if (n > 0 && n < 1000 && areaSqm === 0) areaSqm = n;
        else if (n > 100_000_000 && price === 0) price = n;
        else if (n > 100_000 && n < 100_000_000 && pricePerSqm === 0) pricePerSqm = n;
      }

      if (price > 0 || pricePerSqm > 0) {
        const c: ComparativeCase = {
          type: mode === "transaction" ? "거래" : "평가",
          label: building.buildingName,
          address: building.address,
          buildingName: building.buildingName,
          unit: "",
          usage: building.category,
          purpose: mode === "transaction" ? "거래" : "담보",
          source: building.source,
          areaSqm,
          areaPyeong: Math.round(areaSqm / 3.3058 * 100) / 100,
          price,
          pricePerPyeong: pricePerSqm,
          baseDate: caseDate,
        };
        if (mode === "transaction") {
          building.transactions.push(c);
        } else {
          building.appraisals.push(c);
        }
        flatCases.push(c);
      }
    }

    buildings.push(building);
  }

  // 근생시설 개별 거래사례/평가사례도 flatCases에 추가 (건물 블록이 없는 경우)
  // "기호소재지" 헤더 뒤의 개별 사례 행 파싱
  const indivStart = findLineIndex(lines, /기호소재지/);
  if (indivStart >= 0 && buildingStarts.length === 0) {
    // 건물 블록이 없을 때만 개별 파싱 (이미 건물별로 파싱됨)
  }

  const totalCases = flatCases.length;
  const confidence = totalCases > 0 ? Math.min(1, totalCases * 0.15) : 0;
  return { data: { buildings, cases: flatCases }, confidence };
}
```

- [ ] **Step 2: 테스트 검증 포인트 추가**

```javascript
// 비준사례 검증:
// - 건물 4개: 하이필드, LDC비즈타워, THE H TOWER 919, 더리브 디하우트
// - 각 건물에 거래사례 + 감정평가사례 행
// - 하이필드: 대지면적 14,674.40, 연면적 94,081.50
```

- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: Commit**

```bash
git add app/src/lib/appraisal-parser.ts app/test-appraisal-v2.mjs
git commit -m "feat(appraisal): parseComparativeBuildings - building-level case extraction"
```

---

### Task 6: 경매통계 + 시산가액 결정 파서

**Files:**
- Modify: `app/src/lib/appraisal-parser.ts` (parseAuctionQuote, parseValuationSummary)

경매통계 패턴 (line 1343-1350):
```
6. 경매통계
용도별경기 안양시 동안구 2024 년 08 월 ~ 2025 년 07 월
구분
낙찰가낙찰건
총감정가총낙찰가낙찰가율(%)총건수낙찰건수낙찰률(%)
근린상가4,083,000,0002,435,194,00059.6241041.7
아파트형공장17,021,000,00011,228,432,00066.0601931.7
[출처 :인포케어]
```

시산가액 결정 패턴 (line 4401-4416):
```
소 계78,022,000,00080,640,000,000
...
감정평가액 결정
1. 부동산 감정평가액 결정 및 결정 의견
거래사례비교법에 의한 시산가액이 수익환원법에 의한 시산가액에 의해 합리성이 인정됩니다.
따라서 거래사례비교법에 의한 시산가액을 대상물건의 감정평가액으로 결정하였습니다.
구 분감정평가액(원)
구분건물78,022,000,000
합 계78,022,000,000
```

- [ ] **Step 1: parseAuctionQuote 구현**

```typescript
function parseAuctionQuote(lines: string[]): {
  data: AuctionQuote | null;
  confidence: number;
} {
  const startIdx = findLineIndex(lines, /경매통계/);
  if (startIdx < 0) return { data: null, confidence: 0 };

  // 지역 + 기간
  let region = "";
  let period = "";
  for (let i = startIdx; i < Math.min(startIdx + 5, lines.length); i++) {
    const periodMatch = lines[i].match(/([\d]{4}\s*년\s*\d{2}\s*월\s*~\s*\d{4}\s*년\s*\d{2}\s*월)/);
    if (periodMatch) {
      period = periodMatch[1].replace(/\s+/g, " ");
      // 지역은 같은 줄 앞부분
      const regionPart = lines[i].replace(periodMatch[0], "").replace(/용도별/g, "").trim();
      if (regionPart) region = regionPart;
    }
  }

  // 데이터 행 파싱
  const rows: AuctionQuote["rows"] = [];
  for (let i = startIdx + 3; i < Math.min(startIdx + 15, lines.length); i++) {
    const line = lines[i];
    if (/출처|인포케어/.test(line)) break;
    if (/^구분$|^낙찰가$|^총감정가/.test(line.trim())) continue;

    // 용도 + 숫자들이 연결된 행
    const usageMatch = line.match(/^(근린상가|아파트형공장|지식산업센터|오피스텔|오피스|상가|공장)/);
    if (usageMatch) {
      const usage = usageMatch[1];
      const nums = line.replace(usage, "").match(/[\d,.]+/g);
      if (nums && nums.length >= 6) {
        const parsed = nums.map(n => parseNum(n)).filter((n): n is number => n !== null);
        if (parsed.length >= 6) {
          rows.push({
            usage,
            totalAppraisal: parsed[0],
            totalBid: parsed[1],
            bidRate: parsed[2],
            totalCases: parsed[3],
            bidCases: parsed[4],
            bidCaseRate: parsed[5],
          });
        }
      }
    }
  }

  if (rows.length === 0) return { data: null, confidence: 0 };

  return {
    data: { region, period, rows, source: "인포케어" },
    confidence: Math.min(1, rows.length * 0.5),
  };
}
```

- [ ] **Step 2: parseValuationSummary 구현**

```typescript
function parseValuationSummary(lines: string[]): {
  data: AppraisalParseResult["valuationSummary"];
  confidence: number;
} {
  // "시산가액 검토" 섹션에서 비교방식/수익방식 소계 찾기
  const checkIdx = findLineIndex(lines, /시산가액\s*검토/);
  if (checkIdx < 0) return { data: null, confidence: 0 };

  let comparisonTotal = 0;
  let incomeTotal = 0;

  // 소계 행 찾기: "소 계78,022,000,00080,640,000,000"
  for (let i = checkIdx; i < Math.min(checkIdx + 300, lines.length); i++) {
    const cleaned = lines[i].replace(/\s/g, "");
    if (/소계|합계/.test(cleaned)) {
      const nums = cleaned.match(/[\d,]{10,}/g);
      if (nums && nums.length >= 2) {
        comparisonTotal = parseNum(nums[0]) || 0;
        incomeTotal = parseNum(nums[1]) || 0;
        break;
      }
    }
  }

  // "감정평가액 결정" 섹션에서 최종가+방법 찾기
  const decisionIdx = findLineIndex(lines, /감정평가액\s*결정/, checkIdx);
  let finalValue = 0;
  let method = "";

  if (decisionIdx >= 0) {
    for (let i = decisionIdx; i < Math.min(decisionIdx + 20, lines.length); i++) {
      const line = lines[i];
      // 결정 방법
      if (/거래사례비교법/.test(line) && /결정/.test(line)) {
        method = "거래사례비교법";
      }
      if (/수익환원법/.test(line) && /결정/.test(line)) {
        method = "수익환원법";
      }
      // 합계 금액
      const cleaned = line.replace(/\s/g, "");
      if (/합계/.test(cleaned)) {
        const nums = cleaned.match(/[\d,]{10,}/g);
        if (nums) {
          finalValue = parseNum(nums[0]) || 0;
        }
      }
    }
  }

  if (comparisonTotal === 0 && finalValue === 0) return { data: null, confidence: 0 };

  return {
    data: {
      comparisonTotal,
      incomeTotal,
      finalValue: finalValue || comparisonTotal,
      method: method || "거래사례비교법",
    },
    confidence: finalValue > 0 ? 1 : 0.5,
  };
}
```

- [ ] **Step 3: 테스트 검증 포인트**

```
경매통계: 근린상가 59.62%, 아파트형공장 66.06%
시산가액: 비교방식 78,022,000,000 / 수익방식 80,640,000,000
최종결정: 78,022,000,000 (거래사례비교법)
```

- [ ] **Step 4: 테스트 실행 + Commit**

```bash
git add app/src/lib/appraisal-parser.ts app/test-appraisal-v2.mjs
git commit -m "feat(appraisal): auction quote + valuation summary parsers"
```

---

### Task 7: 대상물건 개요 + 층별 요약 파서

**Files:**
- Modify: `app/src/lib/appraisal-parser.ts` (parsePropertyOverview, parseFloorSummary)

대상물건 개요 패턴 (line 200-210):
```
대상물건 개요
1. 부동산
소 재 지경기도 안양시 동안구 평촌동 119건 물 명인덕원역 AK 밸리
주 용 도공장 (지식산업센터)사 용 승 인 일2025.01.10
구 조철근콘크리트구조 (철근)콘크리트지붕층수지하 2층/지상 15 층
동 수1동
세 대 수(호수)310 호
```

요항표 패턴 (line 210~1040): 170개 호실 × (일련번호, 층·호, 용도, 전유면적, 공용면적, 전용률, 대지권면적)

- [ ] **Step 1: parsePropertyOverview 구현**

```typescript
function parsePropertyOverview(lines: string[]): {
  data: Partial<SupplyOverview>;
  confidence: number;
} {
  const startIdx = findLineIndex(lines, /대상물건\s*개요/);
  if (startIdx < 0) return { data: {}, confidence: 0 };

  const block = lines.slice(startIdx, Math.min(startIdx + 20, lines.length));
  const project: Record<string, any> = {};
  let fieldsFound = 0;

  for (const line of block) {
    const c = line.replace(/\s/g, "");

    // 소재지 + 건물명 (같은 줄)
    const addrKV = extractInlineKV(c, ["소재지", "건물명"]);
    if (addrKV["소재지"]) { project.address = addrKV["소재지"]; fieldsFound++; }
    if (addrKV["건물명"]) { project.name = addrKV["건물명"]; fieldsFound++; }

    // 주용도 + 사용승인일
    const usageKV = extractInlineKV(c, ["주용도", "사용승인일"]);
    if (usageKV["주용도"]) { project.purpose = usageKV["주용도"]; fieldsFound++; }
    if (usageKV["사용승인일"]) { project.completionDate = usageKV["사용승인일"]; fieldsFound++; }

    // 구조 + 층수
    const structKV = extractInlineKV(c, ["구조", "층수"]);
    if (structKV["구조"]) project.structure = structKV["구조"];
    if (structKV["층수"]) { project.scale = structKV["층수"]; fieldsFound++; }

    // 동수, 세대수
    const dongMatch = c.match(/동수(\d+)동/);
    if (dongMatch) project.dongCount = parseInt(dongMatch[1]);
    const unitMatch = c.match(/호수\)?\s*(\d+)\s*호/);
    if (unitMatch) { project.totalUnits = parseInt(unitMatch[1]); fieldsFound++; }
  }

  const result: Partial<SupplyOverview> = {};
  if (fieldsFound > 0) {
    result.project = {
      name: project.name || "",
      purpose: project.purpose || "",
      developer: "",
      constructor: "",
      address: project.address || "",
      zoning: "",
      landArea: { sqm: 0, pyeong: 0 },
      buildingArea: { sqm: 0, pyeong: 0 },
      grossArea: { sqm: 0, pyeong: 0 },
      coverageRatio: 0,
      floorAreaRatio: 0,
      parking: 0,
      scale: project.scale || "",
      constructionPeriod: "",
      completionDate: project.completionDate || "",
      salesRate: 0,
    };
  }

  return { data: result, confidence: Math.min(1, fieldsFound / 4) };
}
```

- [ ] **Step 2: parseFloorSummary — 요항표에서 층별 집계**

```typescript
function parseFloorSummary(lines: string[]): {
  data: CollateralDetailItem[];
  confidence: number;
} {
  // 요항표: "일련\n번호\n동·층·호용도위치\n전유면적" 패턴
  const headerIdx = findLineIndex(lines, /동·?층·?호.*용\s*도/);
  if (headerIdx < 0) return { data: [], confidence: 0 };

  // 요항표에서 층별 데이터 수집 (호실별 감정가는 없고 면적만 있음)
  // → 이 데이터는 Task 4의 unitAppraisals가 우선이므로 fallback용
  const floorMap: Record<string, { count: number; totalArea: number }> = {};

  let i = headerIdx + 5; // 헤더 줄들 건너뛰기
  while (i < lines.length) {
    const line = lines[i].trim();

    // 요항표 끝 감지
    if (/감정평가액의산출근거|감정평가방법|감정평가액결정/.test(line.replace(/\s/g, "")) &&
        !/전유면적|공용면적/.test(line)) {
      // 페이지 헤더인지 확인
      if (!isPageHeader(lines[i])) break;
    }

    // 층 패턴: "제N층 제XXX호" 또는 "제N층 제근생NNN호"
    const floorMatch = line.match(/제\s*(\d{1,2})\s*층/);
    if (floorMatch) {
      const floor = `${floorMatch[1]}층`;
      // 면적 데이터는 보통 2-3줄 뒤
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        const nums = lines[j].match(/[\d.]+/g);
        if (nums) {
          const parsed = nums.map(Number).filter(n => !isNaN(n) && n > 10 && n < 500);
          if (parsed.length >= 2) {
            // 전유면적 (보통 첫 번째 40~90㎡ 범위)
            const area = parsed.find(n => n > 30 && n < 200) || 0;
            if (area > 0) {
              if (!floorMap[floor]) floorMap[floor] = { count: 0, totalArea: 0 };
              floorMap[floor].count++;
              floorMap[floor].totalArea += area;
              break;
            }
          }
        }
      }
    }
    i++;
  }

  const items: CollateralDetailItem[] = Object.entries(floorMap).map(([floor, data], idx) => ({
    no: idx + 1,
    unit: `${floor} (${data.count}호)`,
    floor,
    areaSqm: Math.round(data.totalArea * 100) / 100,
    areaPyeong: Math.round(data.totalArea / 3.3058 * 100) / 100,
    appraisalValue: 0, // 요항표에는 감정가 없음
    planPrice: 0,
    releaseCondition: 0,
    appraisalPricePerPyeong: 0,
    planPricePerPyeong: 0,
    status: "분양",
    remarks: `${data.count}호`,
  }));

  return { data: items, confidence: items.length > 0 ? 0.3 : 0 };
}
```

- [ ] **Step 3: 테스트 실행 + Commit**

```bash
git add app/src/lib/appraisal-parser.ts
git commit -m "feat(appraisal): property overview + floor summary parsers"
```

---

### Task 8: 통합 테스트 + 엑셀 출력 검증

**Files:**
- Modify: `app/test-appraisal-v2.mjs` (전체 파싱 결과 검증)
- Modify: `app/src/lib/appraisal-excel.ts` (새 필드 반영 — 필요시)

- [ ] **Step 1: 통합 테스트 완성**

`test-appraisal-v2.mjs`를 완성하여 실제 파서 import 없이 동일 로직 재현 + 검증:

```javascript
// 전체 파싱 검증 포인트:
console.log("\n=== 전체 파싱 결과 검증 ===");

const checks = [
  // 기본정보
  ["일련번호", serialNo === "C32508-2-1401"],
  ["평가기관", appraiser?.includes("태평양")],
  ["감정평가액", appraisalValue === 78022000000],
  ["기준시점", baseDate === "2025.08.18"],
  // 호실별 (Task 4 결과)
  ["호실 170건", unitCount === 170],
  ["호실 합계", Math.abs(unitTotal - 78022000000) < 1000000],
  // 비준사례 (Task 5 결과)
  ["건물 4개 이상", buildingCount >= 4],
  // 경매통계 (Task 6 결과)
  ["경매 근린상가", auctionRows?.find(r => r.usage === "근린상가")?.bidRate > 50],
  // 시산가액 (Task 6 결과)
  ["비교방식 합계", comparisonTotal === 78022000000],
  ["수익방식 합계", incomeTotal === 80640000000],
  ["최종결정", finalValue === 78022000000],
];

let passed = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (ok) passed++;
}
console.log(`\n결과: ${passed}/${checks.length} 통과`);
```

- [ ] **Step 2: 실제 파서로 통합 테스트 (TSX import)**

API를 직접 호출하거나, 별도 ESM 래퍼로 파서 호출:

```bash
cd app && node --max-old-space-size=512 test-appraisal-v2.mjs
```

- [ ] **Step 3: 타입 체크**

```bash
cd app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/test-appraisal-v2.mjs app/src/lib/appraisal-parser.ts
git commit -m "test(appraisal): integration test with real PDF - 170 units verified"
```

---

### Task 9: 엑셀 생성기에 새 시트 추가

**Files:**
- Modify: `app/src/lib/appraisal-excel.ts`

현재 엑셀에 없는 시트:
- **시산가액검토** 시트: 비교방식 vs 수익방식 합계, 최종결정
- **경매통계(감평)** 시트: 감정평가서 내 인용 경매통계

기존 시트 보강:
- **담보분석** 시트: formRequirements 체크리스트 행 추가
- **상세담보현황** 시트: 170호 데이터 반영 확인

- [ ] **Step 1: appraisal-excel.ts에 valuationSummary 시트 추가**

기존 `generateAppraisalExcel` 함수에 시트 추가 로직 작성 (AppraisalCase에 새 필드 전달 방식은 API/UI에서 처리).

- [ ] **Step 2: 테스트 — 엑셀 생성 검증**

```bash
# API 호출 또는 직접 함수 호출로 엑셀 생성 후 파일 크기 확인
```

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal-excel.ts
git commit -m "feat(appraisal): add valuation summary + auction quote sheets to Excel"
```

---

## 검증 체크리스트

| # | 항목 | 기대값 | Task |
|---|------|--------|------|
| 1 | 일련번호 | C32508-2-1401 | 3 |
| 2 | 평가기관 | (주)태평양감정평가법인 | 3 |
| 3 | 감정평가액 | 78,022,000,000 | 3 |
| 4 | 기준시점 | 2025.08.18 | 3 |
| 5 | 소유자 | 에이엠플러스자산개발(주) | 3 |
| 6 | 위탁자 | 우리자산신탁(주) | 3 |
| 7 | 호실 수 | 170 | 4 |
| 8 | 호실 합계 | 78,022,000,000 | 4 |
| 9 | 1번 호실 | 1층 근생103호, 55.02㎡, 656,000,000 | 4 |
| 10 | 170번 호실 | 14층 1422호, 50.17㎡, 478,000,000 | 4 |
| 11 | 비준사례 건물 | ≥4개 | 5 |
| 12 | 경매통계 행 | 2행 (근린상가, 아파트형공장) | 6 |
| 13 | 비교방식 합계 | 78,022,000,000 | 6 |
| 14 | 수익방식 합계 | 80,640,000,000 | 6 |
| 15 | 최종결정 | 78,022,000,000 (거래사례비교법) | 6 |
| 16 | 소재지 | 경기도 안양시 동안구 평촌동 119 | 7 |
| 17 | 건물명 | 인덕원역 AK 밸리 | 7 |
| 18 | 사용승인일 | 2025.01.10 | 7 |
| 19 | tsc --noEmit | 0 errors | 8 |
| 20 | 엑셀 생성 | 파일 생성 성공 | 9 |
