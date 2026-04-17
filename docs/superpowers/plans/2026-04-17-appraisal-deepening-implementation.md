# 감정평가서 심층개발 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF(감정평가서/사업성평가보고서) 업로드 → 물건유형 자동감지 → 2개 감수 에이전트 검증 → 신청서 양식 Excel 생성 자동화 도구 구현.

**Architecture:** 단일 API 엔드포인트(`/api/appraisal/generate`) + 신규 `lib/appraisal/` 디렉토리(orchestrator + property-templates + sheet-builders + auditors). 기존 `appraisal-parser.ts`/`appraisal-excel.ts`(시산가액·경매통계 부분)는 보존. 양식 시트 단일 구조, 회수예상가 등 명확한 계산만 ExcelJS formula.

**Tech Stack:** Next.js 16 (App Router, breaking changes — node_modules/next/dist/docs/ 참조), TypeScript, ExcelJS, pdfjs-dist + pdf-parse(fallback), shadcn/ui, file-saver.

**Spec:** `docs/superpowers/specs/2026-04-17-appraisal-deepening-design.md`

**Key naming decision:** 기존 `PropertyType`(한글 8종 union)와 충돌을 피하기 위해 본 플랜의 신청서 양식 식별자는 **`ApplicationFormType`**(`'apartment-pf' | 'industrial-center' | 'land-pf'`)로 명명한다. 두 타입 간 매핑은 `mapToApplicationFormType()` 헬퍼로 처리.

---

## Phase 1 — 기반 모듈 (4 tasks, 순차 진행)

### Task 1: 타입 정의 확장 (`types/appraisal.ts`)

**Files:**
- Modify: `app/src/types/appraisal.ts` (파일 끝에 추가, 기존 타입 변경 금지)

- [ ] **Step 1: 기존 파일 끝에 신규 타입 추가**

```typescript
// === 신청서 양식 자동화 v3 (2026-04-17) ===

export type ApplicationFormType = 'apartment-pf' | 'industrial-center' | 'land-pf';

export interface ParsedReportMeta {
  fileName: string;
  pages: number;
  appraiser?: string;
  baseDate?: string;
  parseStatus: 'ok' | 'partial' | 'failed';
}

export interface AppraisalData {
  source: {
    appraisalReports: ParsedReportMeta[];
    feasibilityReports: ParsedReportMeta[];
    parsedAt: string;
  };
  formType: ApplicationFormType;
  detectionConfidence: number;

  collateral: CollateralAnalysis;
  collateralDetail: CollateralDetailItem[];
  comparatives: ComparativeCase[];
  supply?: SupplyOverview;

  missingFields: string[];
}

export interface ReviewFinding {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  perspective: 'appraiser' | 'reviewer';
  category: string;
  message: string;
  detail?: string;
  sectionRef?: { sheet: string; cell: string };
  suggestedAction?: string;
}

export interface GenerateAppraisalResponse {
  success: boolean;
  excelBase64?: string;
  detectedType: ApplicationFormType;
  detectionConfidence: number;
  findings: ReviewFinding[];
  warnings: string[];
  fileName: string;
}

export function mapToApplicationFormType(pt: PropertyType): ApplicationFormType | null {
  switch (pt) {
    case '아파트': return 'apartment-pf';
    case '지식산업센터': return 'industrial-center';
    case '토지': return 'land-pf';
    default: return null;
  }
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/types/appraisal.ts
git commit -m "feat(appraisal): ApplicationFormType + AppraisalData + ReviewFinding 타입 추가"
```

---

### Task 2: 디렉토리 구조 생성 + form-styles 헬퍼

**Files:**
- Create: `app/src/lib/appraisal/sheet-builders/form-styles.ts`

- [ ] **Step 1: form-styles.ts 작성**

```typescript
import type { Worksheet, Cell, Border } from 'exceljs';

export const COLORS = {
  TITLE_BG: '595959',       // 회색 (시트 제목)
  TITLE_FG: 'FFFFFF',       // 흰색 글자
  HEADER_BG: 'D9E1F2',      // 연한파랑 (표 헤더)
  INPUT_REQUIRED: 'FFF2CC', // 노랑 (사용자 입력 필요)
  AUTO_CALC: 'E2EFDA',      // 초록 (자동 수식)
  ERROR_BG: 'FF0000',       // 빨강 (감수 ERROR)
  WARNING_BG: 'FFC000',     // 주황 (WARNING)
  INFO_BG: 'BFBFBF',        // 회색 (INFO)
  SUBTITLE_FG: '808080',    // 부제 글자
} as const;

export const PLACEHOLDER = '_입력필요_';

export const NUMBER_FORMATS = {
  MILLION_KRW: '#,##0',           // 백만원 (소수점 없음)
  AREA_SQM: '#,##0.00',           // 면적 ㎡
  PERCENT: '0.00%',                // 비율
  DATE: 'yyyy-mm-dd',
} as const;

const THIN_BORDER: Partial<Border> = { style: 'thin', color: { argb: '000000' } };

export function applyTitle(ws: Worksheet, title: string, subtitle?: string): void {
  const titleCell = ws.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.TITLE_FG } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 24;

  if (subtitle) {
    const subCell = ws.getCell('A2');
    subCell.value = subtitle;
    subCell.font = { italic: true, size: 10, color: { argb: COLORS.SUBTITLE_FG } };
  }
}

export function applyHeader(ws: Worksheet, row: number, headers: string[], startCol = 1): void {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, startCol + i);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
  });
}

export function applyDataBorder(ws: Worksheet, row: number, colCount: number, startCol = 1): void {
  for (let i = 0; i < colCount; i++) {
    const cell = ws.getCell(row, startCol + i);
    cell.border = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
  }
}

export function markInputRequired(cell: Cell): void {
  cell.value = PLACEHOLDER;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.INPUT_REQUIRED } };
  cell.font = { italic: true, color: { argb: '808080' } };
}

export function markAutoCalc(cell: Cell, formula: string): void {
  cell.value = { formula } as never;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.AUTO_CALC } };
  cell.font = { bold: true };
}

export function applyFooter(ws: Worksheet, row: number, source: string): void {
  const cell = ws.getCell(row, 1);
  cell.value = `출처: ${source}`;
  cell.font = { size: 8, italic: true, color: { argb: COLORS.SUBTITLE_FG } };
}

export function setNumberFormat(cell: Cell, format: keyof typeof NUMBER_FORMATS): void {
  cell.numFmt = NUMBER_FORMATS[format];
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/sheet-builders/form-styles.ts
git commit -m "feat(appraisal): form-styles 공통 헬퍼 (색상/폰트/테두리/숫자포맷)"
```

---

### Task 3: Property type detector

**Files:**
- Create: `app/src/lib/appraisal/property-detector.ts`
- Test: `app/test-property-detector.mjs` (실데이터 검증용 스크립트, 코드베이스 패턴 따름)

- [ ] **Step 1: property-detector.ts 작성**

```typescript
import type { ApplicationFormType } from '@/types/appraisal';

const TYPE_KEYWORDS: Record<ApplicationFormType, { strong: string[]; weak: string[] }> = {
  'apartment-pf': {
    strong: ['아파트', '공동주택', '주택재건축', '주택재개발', '지역주택조합', 'PF대출'],
    weak: ['세대수', '평형', '단지'],
  },
  'industrial-center': {
    strong: ['지식산업센터', '지산센터', '집합건물(공장)', '아파트형공장'],
    weak: ['호실', '제조시설', '연구소'],
  },
  'land-pf': {
    strong: ['나대지', '브릿지대출', '필지', '용도지역', '개별공시지가'],
    weak: ['지번', '도로조건'],
  },
};

export interface PropertyDetectionResult {
  type: ApplicationFormType;
  confidence: number;
  scores: Record<ApplicationFormType, number>;
}

export function detectApplicationFormType(text: string): PropertyDetectionResult {
  const scores: Record<ApplicationFormType, number> = {
    'apartment-pf': 0,
    'industrial-center': 0,
    'land-pf': 0,
  };

  for (const [type, kws] of Object.entries(TYPE_KEYWORDS) as [ApplicationFormType, typeof TYPE_KEYWORDS['apartment-pf']][]) {
    for (const kw of kws.strong) {
      const matches = text.match(new RegExp(escapeRegex(kw), 'g'));
      scores[type] += (matches?.length ?? 0) * 3;
    }
    for (const kw of kws.weak) {
      const matches = text.match(new RegExp(escapeRegex(kw), 'g'));
      scores[type] += (matches?.length ?? 0) * 1;
    }
  }

  const sorted = (Object.entries(scores) as [ApplicationFormType, number][])
    .sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sorted[0];
  const [, secondScore] = sorted[1];

  const confidence = topScore === 0
    ? 0
    : Math.min(1, (topScore - secondScore) / topScore);

  return { type: topType, confidence, scores };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 2: test-property-detector.mjs 작성**

```javascript
// 실행: node app/test-property-detector.mjs
import { detectApplicationFormType } from './src/lib/appraisal/property-detector.ts';

const fixtures = [
  {
    name: '아파트PF (광명9R)',
    text: '재개발사업 광명9R구역 공동주택 354세대 아파트 PF대출',
    expectedType: 'apartment-pf',
  },
  {
    name: '지식산업센터 (에이엠플러스)',
    text: '지식산업센터 인덕원 호실 170개 제조시설',
    expectedType: 'industrial-center',
  },
  {
    name: '토지PF (휴먼스)',
    text: '나대지 필지 용도지역 일반주거 개별공시지가 브릿지대출',
    expectedType: 'land-pf',
  },
  {
    name: '혼합 (애매한 케이스)',
    text: '아파트 분양 호실 운영',
    expectedType: 'apartment-pf', // 'apartment-pf'가 더 강한 키워드
  },
];

let passed = 0, failed = 0;
for (const fx of fixtures) {
  const result = detectApplicationFormType(fx.text);
  const ok = result.type === fx.expectedType;
  console.log(`${ok ? '✓' : '✗'} ${fx.name}: detected=${result.type} confidence=${result.confidence.toFixed(2)} scores=${JSON.stringify(result.scores)}`);
  if (ok) passed++; else failed++;
}
console.log(`\nResult: ${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 3: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 테스트 실행**

Run: `cd app && npx tsx test-property-detector.mjs`
Expected: `4/4 passed`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/appraisal/property-detector.ts app/test-property-detector.mjs
git commit -m "feat(appraisal): 물건유형 자동감지 (키워드 점수 기반) + 단위 테스트"
```

---

### Task 4: ReviewFinding 타입은 Task 1에서 이미 추가됨 — 헬퍼만 추가

**Files:**
- Create: `app/src/lib/appraisal/auditors/findings-helpers.ts`

- [ ] **Step 1: findings-helpers.ts 작성**

```typescript
import type { ReviewFinding } from '@/types/appraisal';

export function err(perspective: ReviewFinding['perspective'], category: string, message: string, opts?: Partial<ReviewFinding>): ReviewFinding {
  return { severity: 'ERROR', perspective, category, message, ...opts };
}

export function warn(perspective: ReviewFinding['perspective'], category: string, message: string, opts?: Partial<ReviewFinding>): ReviewFinding {
  return { severity: 'WARNING', perspective, category, message, ...opts };
}

export function info(perspective: ReviewFinding['perspective'], category: string, message: string, opts?: Partial<ReviewFinding>): ReviewFinding {
  return { severity: 'INFO', perspective, category, message, ...opts };
}

export function countBySeverity(findings: ReviewFinding[]): { error: number; warning: number; info: number } {
  return {
    error: findings.filter(f => f.severity === 'ERROR').length,
    warning: findings.filter(f => f.severity === 'WARNING').length,
    info: findings.filter(f => f.severity === 'INFO').length,
  };
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/auditors/findings-helpers.ts
git commit -m "feat(appraisal): ReviewFinding 헬퍼 (err/warn/info/countBySeverity)"
```

---

## Phase 2a — 감수 에이전트 (2 tasks)

### Task 5: 감정평가사 감수 에이전트

**Files:**
- Create: `app/src/lib/appraisal/auditors/appraiser-auditor.ts`
- Test: `app/test-appraiser-auditor.mjs`

- [ ] **Step 1: appraiser-auditor.ts 작성**

```typescript
import type { AppraisalData, ReviewFinding } from '@/types/appraisal';
import { err, warn, info } from './findings-helpers';

export function auditAsAppraiser(data: AppraisalData): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const c = data.collateral;

  // 1. 평가방법 비중 합계 100±0.1%
  const methodSum = c.method.comparison + c.method.cost + c.method.income;
  if (Math.abs(methodSum - 100) > 0.1) {
    findings.push(err('appraiser', '평가방법', `평가방법 비중 합계 ${methodSum}% (100±0.1% 위반)`, {
      sectionRef: { sheet: '담보분석', cell: 'D15' },
      suggestedAction: '비교/원가/수익 비중 재확인',
    }));
  }

  // 2. 평가방법이 물건유형 표준과 일치
  if (data.formType === 'land-pf' && c.method.comparison < 70) {
    findings.push(warn('appraiser', '평가방법', `토지 평가에서 비교방식 비중 ${c.method.comparison}% (통상 100%)`, {
      sectionRef: { sheet: '담보분석', cell: 'D15' },
    }));
  }
  if (data.formType === 'industrial-center' && c.method.income === 0) {
    findings.push(warn('appraiser', '평가방법', '지산센터에서 수익방식 비중 0% (수익형은 통상 수익방식 반영)', {
      sectionRef: { sheet: '담보분석', cell: 'D15' },
    }));
  }

  // 3. 비교사례 단가 평균 vs 본건 단가 괴리율 ±30%
  const tradeCases = data.comparatives.filter(cm => cm.type === '거래');
  if (tradeCases.length > 0 && c.appraisalValue > 0 && c.totalAreaPyeong > 0) {
    const ownPricePerPyeong = c.appraisalValue / c.totalAreaPyeong;
    const avgComparativePrice = tradeCases.reduce((s, cm) => s + cm.pricePerPyeong, 0) / tradeCases.length;
    if (avgComparativePrice > 0) {
      const deviation = Math.abs(ownPricePerPyeong - avgComparativePrice) / avgComparativePrice;
      if (deviation > 0.3) {
        findings.push(warn('appraiser', '비교사례', `본건 평단가(${ownPricePerPyeong.toFixed(0)}만원) vs 거래사례 평균(${avgComparativePrice.toFixed(0)}만원) 괴리율 ${(deviation * 100).toFixed(1)}%`, {
          sectionRef: { sheet: '비준사례', cell: 'A4' },
        }));
      }
    }
  }

  // 4. 비교사례 4건 미만
  if (data.comparatives.length < 4) {
    findings.push(info('appraiser', '비교사례', `비교사례 ${data.comparatives.length}건 — 통상 4건 이상 권장`));
  }

  // 5. 호별 합계 ≈ 총 감정가 (오차 ±1%)
  if (data.collateralDetail.length > 0 && c.appraisalValue > 0) {
    const sumDetail = data.collateralDetail.reduce((s, d) => s + d.appraisalValue, 0);
    const ratio = Math.abs(sumDetail - c.appraisalValue) / c.appraisalValue;
    if (ratio > 0.01) {
      findings.push(err('appraiser', '호별합계', `호별 감정가 합계 ${sumDetail.toFixed(0)} ≠ 총 감정가 ${c.appraisalValue} (오차 ${(ratio * 100).toFixed(1)}%)`, {
        sectionRef: { sheet: '상세담보현황', cell: 'A4' },
        suggestedAction: '호별 감정가 또는 총 감정가 재확인',
      }));
    }
  }

  // 6. 면적 일관성 (오차 ±0.5%)
  if (data.collateralDetail.length > 0 && c.totalArea > 0) {
    const sumArea = data.collateralDetail.reduce((s, d) => s + d.areaSqm, 0);
    const ratio = Math.abs(sumArea - c.totalArea) / c.totalArea;
    if (ratio > 0.005) {
      findings.push(warn('appraiser', '면적', `호별 면적 합계 ${sumArea.toFixed(2)}㎡ ≠ 총 면적 ${c.totalArea}㎡`, {
        sectionRef: { sheet: '상세담보현황', cell: 'E4' },
      }));
    }
  }

  // 7. 누락 (기준시점/일련번호/평가기관)
  if (!c.baseDate) findings.push(info('appraiser', '누락', '기준시점 미추출'));
  if (!c.serialNo) findings.push(info('appraiser', '누락', '일련번호 미추출'));
  if (!c.appraiser) findings.push(info('appraiser', '누락', '평가기관명 미추출'));

  // 8. 평가가능기간 — 기준시점이 6개월 이상 경과
  if (c.baseDate) {
    const base = new Date(c.baseDate);
    const now = new Date();
    const diffMonths = (now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (diffMonths > 6) {
      findings.push(warn('appraiser', '기준시점', `기준시점 ${c.baseDate} (${diffMonths.toFixed(1)}개월 경과) — 통상 6개월 이내 평가 권장`, {
        sectionRef: { sheet: '담보분석', cell: 'C15' },
      }));
    }
  }

  return findings;
}
```

- [ ] **Step 2: 테스트 작성**

```javascript
// app/test-appraiser-auditor.mjs
import { auditAsAppraiser } from './src/lib/appraisal/auditors/appraiser-auditor.ts';

const baseData = {
  source: { appraisalReports: [], feasibilityReports: [], parsedAt: '2026-04-17' },
  formType: 'apartment-pf',
  detectionConfidence: 1,
  collateral: {
    method: { comparison: 80, cost: 20, income: 0 },
    appraisalValue: 95000,
    totalArea: 28500,
    totalAreaPyeong: 8624,
    baseDate: '2026-03-15',
    serialNo: 'A2026-001',
    appraiser: 'XX감정평가법인',
  },
  collateralDetail: [],
  comparatives: [],
  missingFields: [],
};

const tests = [
  {
    name: '평가방법 합계 110% → ERROR',
    data: { ...baseData, collateral: { ...baseData.collateral, method: { comparison: 90, cost: 20, income: 0 } } },
    expectError: '평가방법 비중 합계',
  },
  {
    name: '비교사례 4건 미만 → INFO',
    data: { ...baseData, comparatives: [{ type: '거래', pricePerPyeong: 1000 }] },
    expectInfo: '비교사례',
  },
  {
    name: '기준시점 12개월 경과 → WARNING',
    data: { ...baseData, collateral: { ...baseData.collateral, baseDate: '2025-04-01' } },
    expectWarning: '기준시점',
  },
  {
    name: '호별 합계 불일치 → ERROR',
    data: {
      ...baseData,
      collateralDetail: [{ appraisalValue: 50000, areaSqm: 100 }, { appraisalValue: 50000, areaSqm: 100 }],
    },
    expectError: '호별합계',
  },
  {
    name: '정상 데이터 → ERROR/WARNING 없음',
    data: { ...baseData, comparatives: Array.from({ length: 4 }, () => ({ type: '거래', pricePerPyeong: 11000 })) },
    expectNothing: true,
  },
];

let passed = 0, failed = 0;
for (const t of tests) {
  const findings = auditAsAppraiser(t.data);
  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARNING');
  const infos = findings.filter(f => f.severity === 'INFO');

  let ok = false;
  if (t.expectError) ok = errors.some(f => f.category === t.expectError);
  else if (t.expectWarning) ok = warnings.some(f => f.category === t.expectWarning);
  else if (t.expectInfo) ok = infos.some(f => f.category === t.expectInfo);
  else if (t.expectNothing) ok = errors.length === 0 && warnings.length === 0;

  console.log(`${ok ? '✓' : '✗'} ${t.name} — findings: ${errors.length}E/${warnings.length}W/${infos.length}I`);
  if (ok) passed++; else failed++;
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 3: 타입 검증 + 테스트 실행**

```bash
cd app && npx tsc --noEmit
cd app && npx tsx test-appraiser-auditor.mjs
```
Expected: 0 errors, `5/5 passed`

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/appraisal/auditors/appraiser-auditor.ts app/test-appraiser-auditor.mjs
git commit -m "feat(appraisal): 감정평가사 감수 에이전트 (8개 검증 규칙) + 단위 테스트"
```

---

### Task 6: 심사역 감수 에이전트

**Files:**
- Create: `app/src/lib/appraisal/auditors/reviewer-auditor.ts`
- Test: `app/test-reviewer-auditor.mjs`

- [ ] **Step 1: reviewer-auditor.ts 작성**

```typescript
import type { AppraisalData, ReviewFinding, ApplicationFormType } from '@/types/appraisal';
import { err, warn, info } from './findings-helpers';

const LTV_THRESHOLD: Record<ApplicationFormType, number> = {
  'apartment-pf': 80,
  'industrial-center': 70,
  'land-pf': 60,
};

export function auditAsReviewer(data: AppraisalData): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const c = data.collateral;

  // 1. LTV 임계 초과
  const threshold = LTV_THRESHOLD[data.formType];
  if (c.ltv > threshold) {
    findings.push(warn('reviewer', 'LTV', `LTV ${c.ltv}% (${data.formType} 임계 ${threshold}% 초과)`, {
      sectionRef: { sheet: '담보분석', cell: 'E15' },
    }));
  }

  // 2. 회수예상가 음수/0 — 단, 낙찰가율은 사용자 입력이므로 estimate가 없으면 스킵
  // (감정가 0이면 명백한 데이터 오류)
  if (c.appraisalValue <= 0) {
    findings.push(err('reviewer', '감정가', '감정가가 0 또는 음수 — 데이터 오류', {
      sectionRef: { sheet: '담보분석', cell: 'B28' },
    }));
  }

  // 3. 선순위 비중 > 50%
  if (c.appraisalValue > 0 && c.priorClaims > 0) {
    const priorRatio = (c.priorClaims / c.appraisalValue) * 100;
    if (priorRatio > 50) {
      findings.push(warn('reviewer', '선순위', `선순위 비중 ${priorRatio.toFixed(1)}% (감정가 대비)`, {
        sectionRef: { sheet: '담보분석', cell: 'B31' },
      }));
    }
  }

  // 4. 권리현황 누락
  if (c.rights && c.rights.length > 0) {
    const missingRights = c.rights.filter(r => !r.holder || r.principal === 0 || r.maxClaim === 0);
    if (missingRights.length > 0) {
      findings.push(warn('reviewer', '권리현황', `권리현황 ${missingRights.length}건의 권리자/원금/채권최고액 누락`, {
        sectionRef: { sheet: '담보분석', cell: 'A20' },
      }));
    }
  }

  // 5. 분양현황
  if (data.supply) {
    const sr = data.supply.project.salesRate;
    if (typeof sr === 'number' && sr < 50) {
      findings.push(warn('reviewer', '분양현황', `분양률 ${sr}% (50% 미만)`, {
        sectionRef: { sheet: '공급/분양', cell: 'B8' },
      }));
    }

    const totalUnits = data.supply.salesStatus.reduce((s, r) => s + (r.totalUnits ?? 0), 0);
    const unsoldUnits = data.supply.salesStatus.reduce((s, r) => s + (r.unsoldUnits ?? 0), 0);
    if (totalUnits > 0) {
      const unsoldRatio = (unsoldUnits / totalUnits) * 100;
      if (unsoldRatio > 30) {
        findings.push(info('reviewer', '미분양', `미분양 비중 ${unsoldRatio.toFixed(1)}% (${unsoldUnits}/${totalUnits} 호실)`));
      }
    }
  }

  // 6. 비교사례 평가목적이 '경매' 비중 > 50%
  const evalCases = data.comparatives.filter(cm => cm.type === '평가');
  if (evalCases.length > 0) {
    const auctionRatio = evalCases.filter(c => c.purpose?.includes('경매')).length / evalCases.length;
    if (auctionRatio > 0.5) {
      findings.push(info('reviewer', '비교사례', `평가사례 중 경매 목적 비중 ${(auctionRatio * 100).toFixed(0)}% (시장가 반영도 낮을 수 있음)`));
    }
  }

  return findings;
}
```

- [ ] **Step 2: 테스트 작성**

```javascript
// app/test-reviewer-auditor.mjs
import { auditAsReviewer } from './src/lib/appraisal/auditors/reviewer-auditor.ts';

const baseData = {
  source: { appraisalReports: [], feasibilityReports: [], parsedAt: '2026-04-17' },
  formType: 'apartment-pf',
  detectionConfidence: 1,
  collateral: {
    appraisalValue: 95000,
    priorClaims: 10000,
    ltv: 60,
    rights: [{ holder: 'XX', principal: 10000, maxClaim: 12000 }],
  },
  collateralDetail: [],
  comparatives: [],
  missingFields: [],
};

const tests = [
  {
    name: 'LTV 81% (apartment-pf 임계 80) → WARNING',
    data: { ...baseData, collateral: { ...baseData.collateral, ltv: 81 } },
    expectWarning: 'LTV',
  },
  {
    name: 'LTV 71% (industrial-center 임계 70) → WARNING',
    data: { ...baseData, formType: 'industrial-center', collateral: { ...baseData.collateral, ltv: 71 } },
    expectWarning: 'LTV',
  },
  {
    name: '감정가 0 → ERROR',
    data: { ...baseData, collateral: { ...baseData.collateral, appraisalValue: 0 } },
    expectError: '감정가',
  },
  {
    name: '선순위 비중 60% → WARNING',
    data: { ...baseData, collateral: { ...baseData.collateral, priorClaims: 60000 } },
    expectWarning: '선순위',
  },
  {
    name: '분양률 40% → WARNING',
    data: {
      ...baseData,
      supply: {
        project: { salesRate: 40 },
        salesStatus: [{ totalUnits: 100, unsoldUnits: 60 }],
      },
    },
    expectWarning: '분양현황',
  },
  {
    name: '정상 데이터 → ERROR/WARNING 없음',
    data: baseData,
    expectNothing: true,
  },
];

let passed = 0, failed = 0;
for (const t of tests) {
  const findings = auditAsReviewer(t.data);
  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARNING');

  let ok = false;
  if (t.expectError) ok = errors.some(f => f.category === t.expectError);
  else if (t.expectWarning) ok = warnings.some(f => f.category === t.expectWarning);
  else if (t.expectNothing) ok = errors.length === 0 && warnings.length === 0;

  console.log(`${ok ? '✓' : '✗'} ${t.name} — ${errors.length}E/${warnings.length}W`);
  if (ok) passed++; else failed++;
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 3: 타입 검증 + 테스트**

```bash
cd app && npx tsc --noEmit
cd app && npx tsx test-reviewer-auditor.mjs
```
Expected: 0 errors, `6/6 passed`

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/appraisal/auditors/reviewer-auditor.ts app/test-reviewer-auditor.mjs
git commit -m "feat(appraisal): 심사역 감수 에이전트 (LTV/회수/선순위/분양 규칙) + 단위 테스트"
```

---

## Phase 2b — 시트 빌더 (5 tasks, 순차)

### Task 7: 감수의견 시트 빌더

**Files:**
- Create: `app/src/lib/appraisal/sheet-builders/audit-findings.ts`

- [ ] **Step 1: audit-findings.ts 작성**

```typescript
import type { Workbook, Worksheet } from 'exceljs';
import type { ReviewFinding } from '@/types/appraisal';
import { applyTitle, applyHeader, applyDataBorder, COLORS } from './form-styles';
import { countBySeverity } from '../auditors/findings-helpers';

export function buildAuditFindingsSheet(wb: Workbook, findings: ReviewFinding[], extractedAt: string): Worksheet {
  const ws = wb.addWorksheet('감수의견', { views: [{ state: 'frozen', ySplit: 4 }] });
  const counts = countBySeverity(findings);
  applyTitle(ws, '감수의견 종합', `ERROR ${counts.error}건 / WARNING ${counts.warning}건 / INFO ${counts.info}건  |  추출 시점: ${extractedAt}`);

  applyHeader(ws, 4, ['심각도', '관점', '카테고리', '메시지', '상세', '참조시트', '권고조치']);

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 50;
  ws.getColumn(5).width = 40;
  ws.getColumn(6).width = 18;
  ws.getColumn(7).width = 30;

  findings.forEach((f, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = f.severity;
    ws.getCell(row, 2).value = f.perspective === 'appraiser' ? '감정평가사' : '심사역';
    ws.getCell(row, 3).value = f.category;
    ws.getCell(row, 4).value = f.message;
    ws.getCell(row, 5).value = f.detail ?? '';
    ws.getCell(row, 6).value = f.sectionRef ? `${f.sectionRef.sheet}!${f.sectionRef.cell}` : '';
    ws.getCell(row, 7).value = f.suggestedAction ?? '';

    const sevColor = f.severity === 'ERROR' ? COLORS.ERROR_BG
                   : f.severity === 'WARNING' ? COLORS.WARNING_BG
                   : COLORS.INFO_BG;
    ws.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sevColor } };
    ws.getCell(row, 1).font = { bold: true, color: { argb: f.severity === 'INFO' ? '000000' : 'FFFFFF' } };
    applyDataBorder(ws, row, 7);
  });

  if (findings.length === 0) {
    ws.getCell(5, 1).value = '✓ 검토할 사항이 없습니다.';
    ws.mergeCells(5, 1, 5, 7);
  }

  return ws;
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/sheet-builders/audit-findings.ts
git commit -m "feat(appraisal): 감수의견 시트 빌더 (severity 색상 + 참조시트 링크)"
```

---

### Task 8: 담보분석 시트 빌더

**Files:**
- Create: `app/src/lib/appraisal/sheet-builders/collateral-summary.ts`

- [ ] **Step 1: collateral-summary.ts 작성**

```typescript
import type { Workbook, Worksheet } from 'exceljs';
import type { CollateralAnalysis } from '@/types/appraisal';
import { applyTitle, applyHeader, applyDataBorder, applyFooter, markInputRequired, markAutoCalc, setNumberFormat } from './form-styles';

export function buildCollateralSummarySheet(wb: Workbook, c: CollateralAnalysis, sourceLabel: string): Worksheet {
  const ws = wb.addWorksheet('담보분석');
  applyTitle(ws, '담보분석', `출처: ${sourceLabel}`);

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 18;

  // 담보물 표
  applyHeader(ws, 4, ['구분', '종류', '수량', '면적(㎡)', '감정가(백만원)', '담보가용가']);
  c.items.forEach((it, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = i + 1;
    ws.getCell(row, 2).value = it.type;
    ws.getCell(row, 3).value = it.quantity;
    ws.getCell(row, 4).value = it.areaSqm;
    setNumberFormat(ws.getCell(row, 4), 'AREA_SQM');
    ws.getCell(row, 5).value = it.appraisalValue;
    setNumberFormat(ws.getCell(row, 5), 'MILLION_KRW');
    ws.getCell(row, 6).value = it.availableValue;
    setNumberFormat(ws.getCell(row, 6), 'MILLION_KRW');
    applyDataBorder(ws, row, 6);
  });
  const subtotalRow = 5 + c.items.length;
  ws.getCell(subtotalRow, 1).value = '합계';
  ws.getCell(subtotalRow, 4).value = c.totalArea;
  setNumberFormat(ws.getCell(subtotalRow, 4), 'AREA_SQM');
  ws.getCell(subtotalRow, 5).value = c.appraisalValue;
  setNumberFormat(ws.getCell(subtotalRow, 5), 'MILLION_KRW');
  ws.getCell(subtotalRow, 6).value = c.availableValue;
  setNumberFormat(ws.getCell(subtotalRow, 6), 'MILLION_KRW');
  ws.getRow(subtotalRow).font = { bold: true };
  applyDataBorder(ws, subtotalRow, 6);

  // 평가정보 표
  const infoStart = subtotalRow + 3;
  applyHeader(ws, infoStart, ['구분', '평가기관', '평가기준일', '평가방법', 'LTV(%)', '비고']);
  ws.getCell(infoStart + 1, 1).value = '본건';
  ws.getCell(infoStart + 1, 2).value = c.appraiser ?? '';
  ws.getCell(infoStart + 1, 3).value = c.baseDate ?? '';
  ws.getCell(infoStart + 1, 4).value = `비교 ${c.method.comparison}% / 원가 ${c.method.cost}% / 수익 ${c.method.income}%`;
  ws.getCell(infoStart + 1, 5).value = c.ltv;
  ws.getCell(infoStart + 1, 6).value = c.remarks ?? '';
  applyDataBorder(ws, infoStart + 1, 6);

  // 권리현황
  const rightsStart = infoStart + 4;
  ws.getCell(rightsStart, 1).value = '권리현황';
  ws.getCell(rightsStart, 1).font = { bold: true };
  applyHeader(ws, rightsStart + 1, ['순위', '권리종류', '권리자', '원금', '설정비율', '채권최고액']);
  c.rights.forEach((r, i) => {
    const row = rightsStart + 2 + i;
    ws.getCell(row, 1).value = r.order;
    ws.getCell(row, 2).value = r.type;
    ws.getCell(row, 3).value = r.holder;
    ws.getCell(row, 4).value = r.principal;
    setNumberFormat(ws.getCell(row, 4), 'MILLION_KRW');
    ws.getCell(row, 5).value = r.settingRatio;
    ws.getCell(row, 6).value = r.maxClaim;
    setNumberFormat(ws.getCell(row, 6), 'MILLION_KRW');
    applyDataBorder(ws, row, 6);
  });

  // 회수예상가 계산 블록
  const recoveryStart = rightsStart + 2 + c.rights.length + 2;
  ws.getCell(recoveryStart, 1).value = '회수예상가 계산';
  ws.getCell(recoveryStart, 1).font = { bold: true, size: 12 };

  ws.getCell(recoveryStart + 1, 1).value = '감정가(백만원)';
  ws.getCell(recoveryStart + 1, 2).value = c.appraisalValue;
  setNumberFormat(ws.getCell(recoveryStart + 1, 2), 'MILLION_KRW');

  ws.getCell(recoveryStart + 2, 1).value = '낙찰가율(%)';
  markInputRequired(ws.getCell(recoveryStart + 2, 2));

  ws.getCell(recoveryStart + 3, 1).value = '회수액 = 감정가 × 낙찰가율';
  markAutoCalc(ws.getCell(recoveryStart + 3, 2),
    `B${recoveryStart + 1}*B${recoveryStart + 2}/100`);
  setNumberFormat(ws.getCell(recoveryStart + 3, 2), 'MILLION_KRW');

  ws.getCell(recoveryStart + 4, 1).value = '선순위(백만원)';
  ws.getCell(recoveryStart + 4, 2).value = c.priorClaims;
  setNumberFormat(ws.getCell(recoveryStart + 4, 2), 'MILLION_KRW');

  ws.getCell(recoveryStart + 5, 1).value = '당사 회수가';
  markAutoCalc(ws.getCell(recoveryStart + 5, 2),
    `B${recoveryStart + 3}-B${recoveryStart + 4}`);
  setNumberFormat(ws.getCell(recoveryStart + 5, 2), 'MILLION_KRW');

  applyFooter(ws, recoveryStart + 7, sourceLabel);

  return ws;
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/sheet-builders/collateral-summary.ts
git commit -m "feat(appraisal): 담보분석 시트 빌더 (담보물/평가정보/권리현황/회수예상가)"
```

---

### Task 9: 상세담보 시트 빌더 (유형별 분기)

**Files:**
- Create: `app/src/lib/appraisal/sheet-builders/collateral-detail.ts`

- [ ] **Step 1: collateral-detail.ts 작성**

```typescript
import type { Workbook, Worksheet } from 'exceljs';
import type { CollateralDetailItem, ApplicationFormType } from '@/types/appraisal';
import { applyTitle, applyHeader, applyDataBorder, applyFooter, setNumberFormat } from './form-styles';

const HEADERS_BY_TYPE: Record<ApplicationFormType, string[]> = {
  'apartment-pf':       ['No', '동', '호', '타입', '전용면적(㎡)', '공급면적(㎡)', '감정가(백만원)', '평단가(백만원)', '분양상태'],
  'industrial-center':  ['No', '동', '층', '호실', '전용면적(㎡)', '감정가(백만원)', '평단가(백만원)', '임대상태'],
  'land-pf':            ['No', '지번', '지목', '면적(㎡)', '면적(평)', '공시지가(백만원/㎡)', '감정가(백만원)', '용도지역'],
};

export function buildCollateralDetailSheet(
  wb: Workbook,
  items: CollateralDetailItem[],
  formType: ApplicationFormType,
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('상세담보현황');
  applyTitle(ws, '상세담보현황', `출처: ${sourceLabel}`);

  const headers = HEADERS_BY_TYPE[formType];
  applyHeader(ws, 4, headers);

  ws.getColumn(1).width = 6;
  for (let i = 2; i <= headers.length; i++) ws.getColumn(i).width = 14;

  items.forEach((it, i) => {
    const row = 5 + i;
    if (formType === 'apartment-pf') {
      ws.getCell(row, 1).value = it.no;
      ws.getCell(row, 2).value = (it.unit ?? '').split('-')[0] || '';
      ws.getCell(row, 3).value = (it.unit ?? '').split('-')[1] || it.unit;
      ws.getCell(row, 4).value = '';
      ws.getCell(row, 5).value = it.areaSqm;
      ws.getCell(row, 6).value = '';
      ws.getCell(row, 7).value = it.appraisalValue;
      ws.getCell(row, 8).value = it.appraisalPricePerPyeong;
      ws.getCell(row, 9).value = it.status;
    } else if (formType === 'industrial-center') {
      ws.getCell(row, 1).value = it.no;
      ws.getCell(row, 2).value = '';
      ws.getCell(row, 3).value = it.floor;
      ws.getCell(row, 4).value = it.unit;
      ws.getCell(row, 5).value = it.areaSqm;
      ws.getCell(row, 6).value = it.appraisalValue;
      ws.getCell(row, 7).value = it.appraisalPricePerPyeong;
      ws.getCell(row, 8).value = it.status;
    } else { // land-pf
      ws.getCell(row, 1).value = it.no;
      ws.getCell(row, 2).value = it.unit;
      ws.getCell(row, 3).value = '';
      ws.getCell(row, 4).value = it.areaSqm;
      ws.getCell(row, 5).value = it.areaPyeong;
      ws.getCell(row, 6).value = it.appraisalPricePerPyeong;
      ws.getCell(row, 7).value = it.appraisalValue;
      ws.getCell(row, 8).value = '';
    }
    for (let c = 1; c <= headers.length; c++) {
      const cell = ws.getCell(row, c);
      if (typeof cell.value === 'number') setNumberFormat(cell, 'MILLION_KRW');
    }
    applyDataBorder(ws, row, headers.length);
  });

  // 합계
  const sumRow = 5 + items.length;
  ws.getCell(sumRow, 1).value = '합계';
  ws.getRow(sumRow).font = { bold: true };
  const sumArea = items.reduce((s, it) => s + (it.areaSqm ?? 0), 0);
  const sumValue = items.reduce((s, it) => s + (it.appraisalValue ?? 0), 0);
  if (formType === 'apartment-pf') {
    ws.getCell(sumRow, 5).value = sumArea;
    ws.getCell(sumRow, 7).value = sumValue;
  } else if (formType === 'industrial-center') {
    ws.getCell(sumRow, 5).value = sumArea;
    ws.getCell(sumRow, 6).value = sumValue;
  } else {
    ws.getCell(sumRow, 4).value = sumArea;
    ws.getCell(sumRow, 7).value = sumValue;
  }
  applyDataBorder(ws, sumRow, headers.length);

  applyFooter(ws, sumRow + 2, sourceLabel);
  return ws;
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/sheet-builders/collateral-detail.ts
git commit -m "feat(appraisal): 상세담보현황 시트 빌더 (apt/industrial/land 헤더 분기)"
```

---

### Task 10: 비준사례 시트 빌더

**Files:**
- Create: `app/src/lib/appraisal/sheet-builders/comparatives.ts`

- [ ] **Step 1: comparatives.ts 작성**

```typescript
import type { Workbook, Worksheet } from 'exceljs';
import type { ComparativeCase } from '@/types/appraisal';
import { applyTitle, applyHeader, applyDataBorder, applyFooter, setNumberFormat } from './form-styles';

export function buildComparativesSheet(
  wb: Workbook,
  comparatives: ComparativeCase[],
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('비준사례');
  applyTitle(ws, '비준사례', `출처: ${sourceLabel}`);

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 30;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 14;
  ws.getColumn(7).width = 14;
  ws.getColumn(8).width = 18;
  ws.getColumn(9).width = 20;

  applyHeader(ws, 4, ['구분', '라벨', '소재지', '면적(㎡)', '평단가(백만원)', '거래일/기준시점', '평가목적', '출처', '비고']);

  // 거래사례 먼저, 평가사례 다음
  const trades = comparatives.filter(c => c.type === '거래');
  const evals = comparatives.filter(c => c.type === '평가');
  const ordered = [...trades, ...evals];

  ordered.forEach((c, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = c.type;
    ws.getCell(row, 2).value = c.label;
    ws.getCell(row, 3).value = c.address;
    ws.getCell(row, 4).value = c.areaSqm;
    setNumberFormat(ws.getCell(row, 4), 'AREA_SQM');
    ws.getCell(row, 5).value = c.pricePerPyeong;
    setNumberFormat(ws.getCell(row, 5), 'MILLION_KRW');
    ws.getCell(row, 6).value = c.baseDate;
    ws.getCell(row, 7).value = c.purpose ?? '';
    ws.getCell(row, 8).value = c.source;
    ws.getCell(row, 9).value = `${c.buildingName ?? ''} ${c.unit ?? ''}`.trim();
    applyDataBorder(ws, row, 9);
  });

  applyFooter(ws, 5 + ordered.length + 2, sourceLabel);
  return ws;
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/sheet-builders/comparatives.ts
git commit -m "feat(appraisal): 비준사례 시트 빌더 (거래사례 → 평가사례 순)"
```

---

### Task 11: 공급/분양 시트 빌더

**Files:**
- Create: `app/src/lib/appraisal/sheet-builders/supply-status.ts`

- [ ] **Step 1: supply-status.ts 작성**

```typescript
import type { Workbook, Worksheet } from 'exceljs';
import type { SupplyOverview } from '@/types/appraisal';
import { applyTitle, applyHeader, applyDataBorder, applyFooter, markInputRequired, setNumberFormat } from './form-styles';

export function buildSupplyStatusSheet(
  wb: Workbook,
  supply: SupplyOverview,
  sourceLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('공급분양');
  applyTitle(ws, '공급개요 + 분양현황', `출처: ${sourceLabel}`);

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 30;

  // 사업 개요
  const p = supply.project;
  const labelValuePairs: [string, string | number | undefined][] = [
    ['사업명', p.name],
    ['사업목적물', p.purpose],
    ['시행사', p.developer],
    ['시공사', p.constructor],
    ['소재지', p.address],
    ['용도지역', p.zoning],
    ['연면적(㎡)', p.grossArea?.sqm],
    ['건폐율(%)', p.coverageRatio],
    ['용적률(%)', p.floorAreaRatio],
    ['주차대수', p.parking],
    ['규모', p.scale],
    ['공사기간', p.constructionPeriod],
    ['준공일', p.completionDate],
    ['분양률(%)', p.salesRate],
  ];

  labelValuePairs.forEach((pair, i) => {
    const row = 4 + i;
    ws.getCell(row, 1).value = pair[0];
    ws.getCell(row, 1).font = { bold: true };
    if (pair[1] === undefined || pair[1] === null || pair[1] === '') {
      markInputRequired(ws.getCell(row, 2));
    } else {
      ws.getCell(row, 2).value = pair[1];
      if (typeof pair[1] === 'number') setNumberFormat(ws.getCell(row, 2), 'MILLION_KRW');
    }
    applyDataBorder(ws, row, 2);
  });

  // 분양현황 표
  const tableStart = 4 + labelValuePairs.length + 2;
  ws.getCell(tableStart, 1).value = '분양현황';
  ws.getCell(tableStart, 1).font = { bold: true, size: 12 };
  applyHeader(ws, tableStart + 1, ['타입', '세대수', '분양가(백만원)', '분양완료', '미분양', '분양률(%)']);

  const rows = supply.salesStatus ?? [];
  rows.forEach((r, i) => {
    const row = tableStart + 2 + i;
    ws.getCell(row, 1).value = r.type;
    ws.getCell(row, 2).value = r.totalUnits;
    ws.getCell(row, 3).value = r.totalAmount;
    setNumberFormat(ws.getCell(row, 3), 'MILLION_KRW');
    ws.getCell(row, 4).value = r.soldUnits;
    ws.getCell(row, 5).value = r.unsoldUnits;
    ws.getCell(row, 6).value = r.salesRateUnits;
    applyDataBorder(ws, row, 6);
  });

  applyFooter(ws, tableStart + 2 + rows.length + 2, sourceLabel);
  return ws;
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/sheet-builders/supply-status.ts
git commit -m "feat(appraisal): 공급/분양 시트 빌더 (사업개요 + 분양현황 표)"
```

---

## Phase 3 — 유형별 템플릿 + 오케스트레이터 (4 tasks)

### Task 12: 아파트PF 템플릿

**Files:**
- Create: `app/src/lib/appraisal/property-templates/apartment-pf.ts`

- [ ] **Step 1: apartment-pf.ts 작성**

```typescript
import type { Workbook } from 'exceljs';
import type { AppraisalData, ReviewFinding } from '@/types/appraisal';
import { buildAuditFindingsSheet } from '../sheet-builders/audit-findings';
import { buildCollateralSummarySheet } from '../sheet-builders/collateral-summary';
import { buildCollateralDetailSheet } from '../sheet-builders/collateral-detail';
import { buildComparativesSheet } from '../sheet-builders/comparatives';
import { buildSupplyStatusSheet } from '../sheet-builders/supply-status';

export function buildApartmentPfWorkbook(
  wb: Workbook,
  data: AppraisalData,
  findings: ReviewFinding[],
): void {
  const sourceLabel = sourceLabelFrom(data);
  buildAuditFindingsSheet(wb, findings, data.source.parsedAt);
  buildCollateralSummarySheet(wb, data.collateral, sourceLabel);
  buildCollateralDetailSheet(wb, data.collateralDetail, 'apartment-pf', sourceLabel);
  buildComparativesSheet(wb, data.comparatives, sourceLabel);
  if (data.supply) {
    buildSupplyStatusSheet(wb, data.supply, sourceLabel);
  }
}

function sourceLabelFrom(data: AppraisalData): string {
  const a = data.source.appraisalReports[0];
  return a ? `${a.appraiser ?? '감정평가서'} (${a.baseDate ?? data.source.parsedAt})` : '감정평가서';
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/property-templates/apartment-pf.ts
git commit -m "feat(appraisal): apartment-pf 템플릿 (감수의견+담보4시트+공급)"
```

---

### Task 13: 지식산업센터 템플릿

**Files:**
- Create: `app/src/lib/appraisal/property-templates/industrial-center.ts`

- [ ] **Step 1: industrial-center.ts 작성**

```typescript
import type { Workbook } from 'exceljs';
import type { AppraisalData, ReviewFinding } from '@/types/appraisal';
import { buildAuditFindingsSheet } from '../sheet-builders/audit-findings';
import { buildCollateralSummarySheet } from '../sheet-builders/collateral-summary';
import { buildCollateralDetailSheet } from '../sheet-builders/collateral-detail';
import { buildComparativesSheet } from '../sheet-builders/comparatives';
import { buildSupplyStatusSheet } from '../sheet-builders/supply-status';

export function buildIndustrialCenterWorkbook(
  wb: Workbook,
  data: AppraisalData,
  findings: ReviewFinding[],
): void {
  const sourceLabel = sourceLabelFrom(data);
  buildAuditFindingsSheet(wb, findings, data.source.parsedAt);
  buildCollateralSummarySheet(wb, data.collateral, sourceLabel);
  buildCollateralDetailSheet(wb, data.collateralDetail, 'industrial-center', sourceLabel);
  buildComparativesSheet(wb, data.comparatives, sourceLabel);
  if (data.supply) {
    buildSupplyStatusSheet(wb, data.supply, sourceLabel);
  }
}

function sourceLabelFrom(data: AppraisalData): string {
  const a = data.source.appraisalReports[0];
  return a ? `${a.appraiser ?? '감정평가서'} (${a.baseDate ?? data.source.parsedAt})` : '감정평가서';
}
```

- [ ] **Step 2: 타입 검증 + Commit**

```bash
cd app && npx tsc --noEmit
git add app/src/lib/appraisal/property-templates/industrial-center.ts
git commit -m "feat(appraisal): industrial-center 템플릿"
```

---

### Task 14: 토지PF 템플릿 (공급 시트 제외)

**Files:**
- Create: `app/src/lib/appraisal/property-templates/land-pf.ts`

- [ ] **Step 1: land-pf.ts 작성**

```typescript
import type { Workbook } from 'exceljs';
import type { AppraisalData, ReviewFinding } from '@/types/appraisal';
import { buildAuditFindingsSheet } from '../sheet-builders/audit-findings';
import { buildCollateralSummarySheet } from '../sheet-builders/collateral-summary';
import { buildCollateralDetailSheet } from '../sheet-builders/collateral-detail';
import { buildComparativesSheet } from '../sheet-builders/comparatives';

export function buildLandPfWorkbook(
  wb: Workbook,
  data: AppraisalData,
  findings: ReviewFinding[],
): void {
  const sourceLabel = sourceLabelFrom(data);
  buildAuditFindingsSheet(wb, findings, data.source.parsedAt);
  buildCollateralSummarySheet(wb, data.collateral, sourceLabel);
  buildCollateralDetailSheet(wb, data.collateralDetail, 'land-pf', sourceLabel);
  buildComparativesSheet(wb, data.comparatives, sourceLabel);
  // 공급/분양 시트는 토지PF에서 생략 (해당 없음)
}

function sourceLabelFrom(data: AppraisalData): string {
  const a = data.source.appraisalReports[0];
  return a ? `${a.appraiser ?? '감정평가서'} (${a.baseDate ?? data.source.parsedAt})` : '감정평가서';
}
```

- [ ] **Step 2: 타입 검증 + Commit**

```bash
cd app && npx tsc --noEmit
git add app/src/lib/appraisal/property-templates/land-pf.ts
git commit -m "feat(appraisal): land-pf 템플릿 (공급/분양 제외)"
```

---

### Task 15: Orchestrator (전 파이프라인 조립)

**Files:**
- Create: `app/src/lib/appraisal/orchestrator.ts`

- [ ] **Step 1: orchestrator.ts 작성**

```typescript
import ExcelJS from 'exceljs';
import type { AppraisalData, ReviewFinding, ApplicationFormType, GenerateAppraisalResponse } from '@/types/appraisal';
import { auditAsAppraiser } from './auditors/appraiser-auditor';
import { auditAsReviewer } from './auditors/reviewer-auditor';
import { buildApartmentPfWorkbook } from './property-templates/apartment-pf';
import { buildIndustrialCenterWorkbook } from './property-templates/industrial-center';
import { buildLandPfWorkbook } from './property-templates/land-pf';

export interface OrchestratorInput {
  data: AppraisalData;
  fileNamePrefix?: string;
}

export interface OrchestratorOutput {
  buffer: Buffer;
  findings: ReviewFinding[];
  fileName: string;
}

export async function generateAppraisalExcel(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const { data } = input;

  // 감수 단계 (per-auditor try/catch)
  const findings: ReviewFinding[] = [];
  try {
    findings.push(...auditAsAppraiser(data));
  } catch (e) {
    console.error('appraiser-auditor failed:', e);
  }
  try {
    findings.push(...auditAsReviewer(data));
  } catch (e) {
    console.error('reviewer-auditor failed:', e);
  }

  // 워크북 빌드
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OK저축은행 감정평가 자동화 도구';
  wb.created = new Date();

  const builderByType: Record<ApplicationFormType, (wb: ExcelJS.Workbook, d: AppraisalData, f: ReviewFinding[]) => void> = {
    'apartment-pf': buildApartmentPfWorkbook,
    'industrial-center': buildIndustrialCenterWorkbook,
    'land-pf': buildLandPfWorkbook,
  };

  builderByType[data.formType](wb, data, findings);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);

  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13);
  const fileName = `appraisal_${input.fileNamePrefix ?? data.formType}_${ts}.xlsx`;

  return { buffer, findings, fileName };
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/appraisal/orchestrator.ts
git commit -m "feat(appraisal): orchestrator (감수+빌드 파이프라인 조립)"
```

---

## Phase 4 — API + UI (3 tasks)

### Task 16a: 파서 어댑터 (parser → AppraisalData 정규화)

**배경**: `parseAppraisalPdf`는 두 번째 인자(`_propertyType`)를 요구하고, 반환 타입은 `AppraisalParseResult`(부분 필드만 채워진 `collateral`/`supply`/`comparatives`/`collateralDetail`/`auctionQuote`/`valuationSummary`)임. `extractLines`는 비-export. 라우트에서 직접 사용하면 type/runtime 양쪽 깨짐. 어댑터로 격리.

**Files:**
- Modify: `app/src/lib/appraisal-parser.ts` (`extractLines` export로 공개 + raw text 헬퍼 추가)
- Create: `app/src/lib/appraisal/parser-adapter.ts`

- [ ] **Step 1: 파서에서 `extractLines`와 `extractRawText` 노출**

Edit `app/src/lib/appraisal-parser.ts` 174줄 부근:

```typescript
// 변경 전: async function extractLines(...
// 변경 후:
export async function extractLines(buffer: Buffer): Promise<string[]> {
  // 기존 본문 그대로
}

// 파일 하단에 추가:
export async function extractRawText(buffer: Buffer): Promise<string> {
  const lines = await extractLines(buffer);
  return lines.join('\n');
}
```

- [ ] **Step 2: parser-adapter.ts 작성 (normalizer + defaults)**

```typescript
import type {
  AppraisalParseResult,
  AppraisalData,
  CollateralAnalysis,
  CollateralDetailItem,
  ComparativeCase,
  SupplyOverview,
  ApplicationFormType,
  ParsedReportMeta,
} from '@/types/appraisal';

const EMPTY_COLLATERAL: CollateralAnalysis = {
  owner: '', trustee: '', appraiser: '', debtor: '',
  purpose: '', submittedTo: '', baseDate: '', serialNo: '',
  method: { comparison: 0, cost: 0, income: 0 },
  appraisalValue: 0,
  formRequirements: {
    officialAppraisal: false, signatureComplete: false,
    forFinancialUse: false, reused: false, reusedNote: '', conditional: false,
  },
  items: [],
  totalArea: 0, totalAreaPyeong: 0,
  collateralRatio: 0, priorClaims: 0, availableValue: 0, ltv: 0,
  rights: [],
  remarks: '', opinion: '',
};

export function adaptParserResult(
  parsed: AppraisalParseResult,
  formType: ApplicationFormType,
  detectionConfidence: number,
  appraisalMetas: ParsedReportMeta[],
  feasibilityMetas: ParsedReportMeta[],
  feasibilityParsed?: AppraisalParseResult | null,
): AppraisalData {
  const collateral: CollateralAnalysis = { ...EMPTY_COLLATERAL, ...(parsed.collateral as Partial<CollateralAnalysis>) };
  // method 누락 시 기본값
  if (!collateral.method) collateral.method = { comparison: 0, cost: 0, income: 0 };
  // rights/items 누락 시 빈 배열
  if (!Array.isArray(collateral.rights)) collateral.rights = [];
  if (!Array.isArray(collateral.items)) collateral.items = [];

  const collateralDetail: CollateralDetailItem[] = Array.isArray(parsed.collateralDetail) ? parsed.collateralDetail : [];
  const comparatives: ComparativeCase[] = Array.isArray(parsed.comparatives) ? parsed.comparatives : [];

  // supply는 사업성보고서 우선, 없으면 감평서의 propertyOverview
  let supply: SupplyOverview | undefined;
  const supplyRaw = (feasibilityParsed?.supply ?? parsed.supply) as Partial<SupplyOverview> | undefined;
  if (supplyRaw && Object.keys(supplyRaw).length > 0) {
    supply = {
      project: supplyRaw.project ?? {} as SupplyOverview['project'],
      supplyTable: supplyRaw.supplyTable ?? [],
      salesStatus: supplyRaw.salesStatus ?? [],
    };
  }

  // missing fields 추적 (중요 누락만)
  const missingFields: string[] = [];
  if (!collateral.appraiser) missingFields.push('collateral.appraiser');
  if (!collateral.baseDate) missingFields.push('collateral.baseDate');
  if (collateral.appraisalValue === 0) missingFields.push('collateral.appraisalValue');
  if (collateralDetail.length === 0) missingFields.push('collateralDetail');
  if (comparatives.length === 0) missingFields.push('comparatives');

  return {
    source: {
      appraisalReports: appraisalMetas,
      feasibilityReports: feasibilityMetas,
      parsedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    },
    formType,
    detectionConfidence,
    collateral,
    collateralDetail,
    comparatives,
    supply,
    missingFields,
  };
}
```

- [ ] **Step 3: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/appraisal-parser.ts app/src/lib/appraisal/parser-adapter.ts
git commit -m "feat(appraisal): parser-adapter (부분 결과 → 완전한 AppraisalData 정규화)"
```

---

### Task 16b: API 엔드포인트 `/api/appraisal/generate`

**Files:**
- Create: `app/src/app/api/appraisal/generate/route.ts`

**중요**: Next.js 16 breaking changes 확인 필요. `node_modules/next/dist/docs/`에서 App Router + multipart 처리 가이드 참조 후 작성.

- [ ] **Step 1: 기존 multipart 처리 패턴 확인**

Run: `grep -r "formData()" app/src/app/api/ -l | head -5`
이미 multipart를 처리하는 라우트가 있으면 그 패턴을 그대로 따름.

- [ ] **Step 2: route.ts 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { parseAppraisalPdf, extractRawText } from '@/lib/appraisal-parser';
import { detectApplicationFormType } from '@/lib/appraisal/property-detector';
import { generateAppraisalExcel } from '@/lib/appraisal/orchestrator';
import { adaptParserResult } from '@/lib/appraisal/parser-adapter';
import type { AppraisalParseResult } from '@/types/appraisal';
import type { ApplicationFormType, GenerateAppraisalResponse, ParsedReportMeta } from '@/types/appraisal';

export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse<GenerateAppraisalResponse | { error: string }>> {
  try {
    const formData = await req.formData();
    const appraisalFiles = formData.getAll('appraisalFiles') as File[];
    const feasibilityFiles = formData.getAll('feasibilityFiles') as File[];
    const requestedType = formData.get('propertyType') as string | null;

    if (appraisalFiles.length === 0) {
      return NextResponse.json({ error: '감정평가서 PDF를 업로드해주세요' }, { status: 400 });
    }

    // 물건유형 사전 결정 (parseAppraisalPdf의 2번째 인자로 필요)
    let preliminaryType: ApplicationFormType = 'apartment-pf'; // 기본값
    let detectionConfidence = 0;

    // 1차: 감지용 raw text 추출
    let combinedText = '';
    for (const file of appraisalFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        combinedText += (await extractRawText(buffer)) + '\n';
      } catch {
        // 무시 - 파싱 단계에서 에러 처리
      }
    }

    if (requestedType && requestedType !== 'auto' &&
        ['apartment-pf', 'industrial-center', 'land-pf'].includes(requestedType)) {
      preliminaryType = requestedType as ApplicationFormType;
      detectionConfidence = 1;
    } else {
      const detected = detectApplicationFormType(combinedText);
      if (detected.confidence === 0) {
        return NextResponse.json({
          error: '물건유형 자동감지 실패 — 수동으로 선택 후 재요청해주세요'
        }, { status: 422 });
      }
      preliminaryType = detected.type;
      detectionConfidence = detected.confidence;
    }

    // 2차: 실제 PDF 파싱 (감정평가서)
    const appraisalMetas: ParsedReportMeta[] = [];
    let parsedAppraisal: AppraisalParseResult | null = null;
    for (const file of appraisalFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        const result = await parseAppraisalPdf(buffer, preliminaryType);
        if (!parsedAppraisal) parsedAppraisal = result;
        appraisalMetas.push({
          fileName: file.name,
          pages: 0,  // parseAppraisalPdf가 페이지 수를 반환하지 않음
          appraiser: (result.collateral as { appraiser?: string })?.appraiser,
          baseDate: (result.collateral as { baseDate?: string })?.baseDate,
          parseStatus: result.warnings.length > 0 ? 'partial' : 'ok',
        });
      } catch (e) {
        console.error(`PDF 파싱 실패 ${file.name}:`, e);
        appraisalMetas.push({ fileName: file.name, pages: 0, parseStatus: 'failed' });
      }
    }

    if (!parsedAppraisal) {
      return NextResponse.json({ error: 'PDF 파싱 실패 — 모든 감정평가서를 읽을 수 없습니다' }, { status: 400 });
    }

    // 3차: 사업성평가보고서 파싱 (있으면)
    const feasibilityMetas: ParsedReportMeta[] = [];
    let parsedFeasibility: AppraisalParseResult | null = null;
    for (const file of feasibilityFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        const result = await parseAppraisalPdf(buffer, preliminaryType);
        if (!parsedFeasibility) parsedFeasibility = result;
        feasibilityMetas.push({
          fileName: file.name,
          pages: 0,
          parseStatus: result.warnings.length > 0 ? 'partial' : 'ok',
        });
      } catch (e) {
        feasibilityMetas.push({ fileName: file.name, pages: 0, parseStatus: 'failed' });
      }
    }

    // 4차: 어댑터로 정규화
    const data = adaptParserResult(
      parsedAppraisal,
      preliminaryType,
      detectionConfidence,
      appraisalMetas,
      feasibilityMetas,
      parsedFeasibility,
    );

    // 5차: Excel 생성
    const { buffer, findings, fileName } = await generateAppraisalExcel({ data });

    return NextResponse.json({
      success: true,
      excelBase64: buffer.toString('base64'),
      detectedType: preliminaryType,
      detectionConfidence,
      findings,
      warnings: data.missingFields.length > 0
        ? [`주요 필드 누락: ${data.missingFields.join(', ')}`]
        : [],
      fileName,
    });
  } catch (e) {
    console.error('/api/appraisal/generate failed:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add app/src/app/api/appraisal/generate/route.ts
git commit -m "feat(appraisal): /api/appraisal/generate 라우트 (어댑터로 부분 결과 정규화)"
```

---

### Task 17: `/appraisal` 페이지 재작성

**Files:**
- Modify: `app/src/app/appraisal/page.tsx` (전면 재작성)

- [ ] **Step 1: 기존 page.tsx 백업 및 재작성**

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ApplicationFormType, ReviewFinding, GenerateAppraisalResponse } from '@/types/appraisal';

const TYPE_LABELS: Record<ApplicationFormType | 'auto', string> = {
  'auto': '자동 감지',
  'apartment-pf': '아파트 PF',
  'industrial-center': '지식산업센터',
  'land-pf': '토지 PF (브릿지)',
};

export default function AppraisalPage() {
  const [appraisalFiles, setAppraisalFiles] = useState<File[]>([]);
  const [feasibilityFiles, setFeasibilityFiles] = useState<File[]>([]);
  const [propertyType, setPropertyType] = useState<ApplicationFormType | 'auto'>('auto');
  const [loading, setLoading] = useState(false);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [result, setResult] = useState<GenerateAppraisalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (appraisalFiles.length === 0) {
      setError('감정평가서 PDF를 1개 이상 업로드해주세요');
      return;
    }
    setLoading(true);
    setError(null);
    setFindings([]);
    setResult(null);

    const fd = new FormData();
    appraisalFiles.forEach(f => fd.append('appraisalFiles', f));
    feasibilityFiles.forEach(f => fd.append('feasibilityFiles', f));
    fd.append('propertyType', propertyType);

    try {
      const res = await fetch('/api/appraisal/generate', { method: 'POST', body: fd });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('서버 응답 파싱 실패: ' + text.slice(0, 200));
      }

      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      setResult(json);
      setFindings(json.findings ?? []);

      // 다운로드 트리거
      const bin = atob(json.excelBase64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = json.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const errorCount = findings.filter(f => f.severity === 'ERROR').length;
  const warningCount = findings.filter(f => f.severity === 'WARNING').length;
  const infoCount = findings.filter(f => f.severity === 'INFO').length;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">감정평가서 분석 → 신청서 양식 Excel</h1>

      <Card>
        <CardHeader>
          <CardTitle>업로드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>감정평가서 PDF (필수, 1~2개)</Label>
            <input type="file" multiple accept="application/pdf"
              onChange={e => setAppraisalFiles(Array.from(e.target.files ?? []))}
              className="mt-2 block w-full text-sm" />
            <p className="text-xs text-gray-500 mt-1">선택됨: {appraisalFiles.length}개</p>
          </div>

          <div>
            <Label>사업성평가보고서 PDF (선택, 0~2개)</Label>
            <input type="file" multiple accept="application/pdf"
              onChange={e => setFeasibilityFiles(Array.from(e.target.files ?? []))}
              className="mt-2 block w-full text-sm" />
            <p className="text-xs text-gray-500 mt-1">선택됨: {feasibilityFiles.length}개</p>
          </div>

          <div>
            <Label>물건유형</Label>
            <Select value={propertyType} onValueChange={v => setPropertyType(v as ApplicationFormType | 'auto')}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(TYPE_LABELS) as [ApplicationFormType | 'auto', string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleGenerate} disabled={loading || appraisalFiles.length === 0} className="w-full">
            {loading ? '생성 중...' : '신청서 Excel 생성'}
          </Button>

          {error && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700 text-sm">{error}</div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>감수 결과</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4 text-sm">
              <span className="bg-red-500 text-white px-2 py-1 rounded">ERROR {errorCount}</span>
              <span className="bg-orange-500 text-white px-2 py-1 rounded">WARNING {warningCount}</span>
              <span className="bg-gray-500 text-white px-2 py-1 rounded">INFO {infoCount}</span>
              <span className="text-gray-500">감지 유형: {TYPE_LABELS[result.detectedType]} (신뢰도 {(result.detectionConfidence * 100).toFixed(0)}%)</span>
            </div>
            {findings.length === 0 ? (
              <p className="text-green-600">검토할 사항 없음</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {findings.map((f, i) => (
                  <div key={i} className={`p-2 border-l-4 text-sm ${
                    f.severity === 'ERROR' ? 'border-red-500 bg-red-50'
                    : f.severity === 'WARNING' ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-400 bg-gray-50'
                  }`}>
                    <div className="font-medium">[{f.perspective === 'appraiser' ? '감정평가사' : '심사역'}] {f.category} — {f.message}</div>
                    {f.detail && <div className="text-xs text-gray-600 mt-1">{f.detail}</div>}
                    {f.suggestedAction && <div className="text-xs text-blue-700 mt-1">💡 {f.suggestedAction}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors. shadcn/ui Select/Card/Button/Label 컴포넌트 누락 시 `npx shadcn@latest add select card button label`로 추가.

- [ ] **Step 3: dev 서버 실행 확인**

Run: `cd app && npm run dev`
브라우저에서 http://localhost:3000/appraisal 접속 → UI 렌더링 확인 (PDF 없이 버튼 동작만)

- [ ] **Step 4: Commit**

```bash
git add app/src/app/appraisal/page.tsx
git commit -m "feat(appraisal): /appraisal 페이지 재작성 (업로드+자동감지+다운로드+감수결과)"
```

---

## Phase 5 — 기존 코드 정리 + 통합 검증 (2 tasks)

### Task 18: 통합 E2E 테스트 (실데이터)

**Files:**
- Create: `app/test-appraisal-e2e.mjs`

- [ ] **Step 1: 테스트 PDF 준비 확인**

Run: `ls _archive/*감정* _reference/*감정* 2>/dev/null`
실데이터 경로 확인. 없으면 사용자에게 PDF 경로 요청.

- [ ] **Step 2: E2E 테스트 스크립트 작성**

```javascript
// app/test-appraisal-e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import { parseAppraisalPdf, extractRawText } from './src/lib/appraisal-parser.ts';
import { detectApplicationFormType } from './src/lib/appraisal/property-detector.ts';
import { adaptParserResult } from './src/lib/appraisal/parser-adapter.ts';
import { generateAppraisalExcel } from './src/lib/appraisal/orchestrator.ts';

const SAMPLES = [
  // 사용자 PDF 경로로 교체
  { name: '아파트PF', path: '../_archive/광명9R_감정평가서.pdf', expectedType: 'apartment-pf' },
  { name: '지산센터', path: '../_archive/에이엠플러스인덕원_감정평가서.pdf', expectedType: 'industrial-center' },
  { name: '토지PF',   path: '../_archive/휴먼스PFV_감정평가서.pdf', expectedType: 'land-pf' },
];

let passed = 0, failed = 0;
for (const s of SAMPLES) {
  if (!fs.existsSync(s.path)) {
    console.log(`⊘ ${s.name}: 파일 없음 (${s.path}) — 스킵`);
    continue;
  }
  console.log(`\n--- ${s.name} ---`);
  const buffer = fs.readFileSync(s.path);

  // 1. 자동감지용 raw text
  const rawText = await extractRawText(buffer);
  const detected = detectApplicationFormType(rawText);
  console.log(`  detected: ${detected.type} (confidence: ${detected.confidence.toFixed(2)})`);

  if (detected.type !== s.expectedType) {
    console.log(`  ✗ type mismatch (expected ${s.expectedType})`);
    failed++; continue;
  }

  // 2. PDF 파싱 (2번째 인자 필수)
  const parsed = await parseAppraisalPdf(buffer, detected.type);

  // 3. 어댑터로 정규화
  const meta = { fileName: path.basename(s.path), pages: 0, parseStatus: 'ok' };
  const data = adaptParserResult(parsed, detected.type, detected.confidence, [meta], [], null);

  // 4. Excel 생성
  const { buffer: excelBuf, findings, fileName } = await generateAppraisalExcel({ data, fileNamePrefix: s.name });
  const outPath = `/tmp/${fileName}`;
  fs.writeFileSync(outPath, excelBuf);
  console.log(`  ✓ Excel 생성: ${outPath} (${(excelBuf.length / 1024).toFixed(1)} KB)`);
  console.log(`  findings: ${findings.length}건 (E${findings.filter(f => f.severity === 'ERROR').length} W${findings.filter(f => f.severity === 'WARNING').length} I${findings.filter(f => f.severity === 'INFO').length})`);
  passed++;
}
console.log(`\n${passed}/${passed + failed} samples passed`);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd app && npx tsx test-appraisal-e2e.mjs`
Expected: 사용 가능한 모든 샘플에서 Excel 생성 성공 + 적절한 findings

- [ ] **Step 4: 생성된 Excel 수동 확인**

Excel 파일을 열어 다음 점검:
- 감수의견 시트가 첫 번째인지
- 담보분석/상세담보/비준사례 시트가 신청서 양식과 유사한지
- 회수예상가 셀에 수식 (`=B5*B6/100`)이 보이는지
- 노란 셀(_입력필요_) / 초록 셀 (자동계산) 색상 구분이 적용됐는지

- [ ] **Step 5: Commit**

```bash
git add app/test-appraisal-e2e.mjs
git commit -m "test(appraisal): 3종 실데이터 E2E 검증 스크립트"
```

---

### Task 19: 기존 코드 정리 (`appraisal-excel.ts` 슬림화)

**Files:**
- Modify: `app/src/lib/appraisal-excel.ts` (시산가액검토 + 경매통계 시트 함수만 남김)

**중요**: 이 작업은 비파괴적으로 진행. 먼저 현재 export 목록을 확인하고, 어떤 함수가 어디서 import되는지 grep으로 확인 후 안전하게 정리.

- [ ] **Step 1: 현재 export + 호출처 확인**

```bash
grep -n "^export" app/src/lib/appraisal-excel.ts
grep -rn "from '@/lib/appraisal-excel'" app/src/ | grep -v "appraisal-excel.ts:"
grep -rn "from '@/lib/appraisal-excel'" app/test-*.mjs app/test-*.ts 2>/dev/null
```

- [ ] **Step 2: 보존할 함수 식별**

시산가액검토 + 경매통계와 관련된 함수만 식별 (e.g., `buildValuationReviewSheet`, `buildAuctionStatsSheet`). 나머지는 외부 호출처가 없으면 삭제 대상.

- [ ] **Step 3: 외부 호출처 있는 함수는 보존 + 마이그레이션 노트 추가**

만약 외부에서 `import { buildXxx } from '@/lib/appraisal-excel'`로 사용 중이라면, 해당 함수는 그대로 두되 파일 상단에 주석 추가:

```typescript
// 본 파일은 시산가액검토 + 경매통계 시트만 보존합니다.
// 신청서 양식 시트는 lib/appraisal/sheet-builders/* 로 이동했습니다 (2026-04-17).
```

- [ ] **Step 4: 사용처 없는 시트 빌더 함수 삭제**

호출처가 없는 함수는 코드에서 삭제. 삭제 후:

```bash
cd app && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/appraisal-excel.ts
git commit -m "refactor(appraisal): appraisal-excel.ts 슬림화 (시산가액·경매통계만 보존)"
```

---

## 배포 (선택, 통합 검증 후)

배포는 사용자 명시적 요청 시에만 진행. 본 플랜에서는 코드 작성 + 로컬 검증까지로 종료.

배포 절차 (참고):
```bash
# CLAUDE.md에 명시된 배포 방법
cp -r app/src/lib/appraisal loan-app-next/src/lib/
cp app/src/lib/appraisal-excel.ts loan-app-next/src/lib/
cp app/src/app/appraisal/page.tsx loan-app-next/src/app/appraisal/page.tsx
cp -r app/src/app/api/appraisal loan-app-next/src/app/api/
cp app/src/types/appraisal.ts loan-app-next/src/types/

cd loan-app-next && npx vercel --prod
npx vercel ls  # ● Ready 확인
```

---

## 자가 검증 체크리스트

- [x] **Spec 커버리지**: 13 섹션 모두 task에 매핑 (1~17), Task 18은 검증, Task 19는 정리
- [x] **Placeholder 없음**: 모든 step에 실제 코드/명령 명시 (`TBD`, `TODO`, "appropriate error handling" 등 없음)
- [x] **타입 일관성**: `ApplicationFormType`, `AppraisalData`, `ReviewFinding`이 모든 task에서 동일 시그니처
- [x] **모듈 의존성 단방향**: page → route → orchestrator → templates → builders → form-styles (순환 없음)
- [x] **테스트 패턴**: 코드베이스의 `test-*.mjs` 패턴 따름 (단위 = 픽스처 기반, E2E = 실파일)
- [x] **Vercel 60초 budget**: PDF~10s + audit~1s + build~2s = ~13s, 여유 충분
