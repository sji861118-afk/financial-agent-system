# Loan Engine Phase 0.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the loan-engine core that generates the same Techmate Korea DOCX output as the existing hardcoded `generate-docx.mjs`, but driven by a JSON data model + LoanTypeProfile section ordering.

**Architecture:** Hybrid engine in `app/src/lib/loan-engine/` (pure TypeScript, no Next.js deps). The engine reads a `LoanApplication` data object and assembles DOCX sections according to a `LoanTypeProfile`. A thin CLI wrapper in `docx-generator/cli.ts` invokes the engine with local file paths. Existing hardcoded data from `generate-docx.mjs` + `sections-supplement.mjs` (1300 lines total) is migrated into a comprehensive JSON input file and data-driven section builders.

**Tech Stack:** TypeScript (strict), docx library, tsx runtime, Zod validation

**Spec:** `docs/superpowers/specs/2026-03-30-loan-application-engine-design.md`

**Existing code reference:**
- `docx-generator/generate-docx.mjs` (806 lines) — hardcoded DOCX generator
- `docx-generator/sections-supplement.mjs` (494 lines) — 8 supplemental sections
- `docx-generator/01_입력데이터/기본조건_입력.json` — partial input (112 lines)

---

## File Structure

### New files to create:

```
app/src/lib/loan-engine/
├── types.ts                        # All type definitions
├── schema.ts                       # Zod validation schemas
├── generator.ts                    # Main pipeline: LoanApplication → DOCX Buffer
├── profiles/
│   └── equity-pledge.ts            # Section order for 지분담보
├── sections/
│   ├── helpers.ts                  # Shared DOCX helpers (headerCell, dataCell, fmt, etc.)
│   ├── registry.ts                 # SectionId → SectionBuilder mapping
│   ├── common/
│   │   ├── header.ts              # 결재란 + 제목
│   │   ├── overview.ts            # 신청개요
│   │   ├── basic-terms.ts         # 기본조건
│   │   ├── syndicate.ts           # 대주단 구성
│   │   ├── funding.ts             # 자금용도(안) + 소요자금
│   │   ├── conditions-security.ts # 여신조건 + 채권보전
│   │   ├── interest-rate.ts       # 금리산출
│   │   ├── structure.ts           # 금융구조도
│   │   ├── opinion.ts             # 종합의견
│   │   ├── obligor.ts             # 채무관련인 현황
│   │   ├── borrowings.ts          # 차입금 현황
│   │   ├── financial-opinion.ts   # 재무분석 소견 (AI placeholder)
│   │   ├── risk-analysis.ts       # 리스크 분석
│   │   ├── checklist.ts           # 자체점검
│   │   └── tbd-summary.ts         # TBD 항목 목록
│   └── plugins/
│       └── equity-pledge.ts       # 지분담보 플러그인 섹션
└── index.ts                        # Public API export

docx-generator/
├── cli.ts                          # CLI entry point (replaces generate-docx.mjs)
└── 01_입력데이터/
    └── techmate-full.json          # Complete Techmate data (expanded from 기본조건_입력.json)
```

---

## Task 1: Install dependencies + configure tsx

**Files:**
- Modify: `app/package.json`
- Create: `docx-generator/tsconfig.json`

- [ ] **Step 1: Install docx and zod in app/**

```bash
cd app && npm install --save docx zod && npm install --save-dev tsx
```

- [ ] **Step 2: Create docx-generator/tsconfig.json for tsx**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": ".",
    "paths": {
      "@loan-engine/*": ["../app/src/lib/loan-engine/*"]
    }
  },
  "include": ["*.ts", "../app/src/lib/loan-engine/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Verify tsx can import from app/src/lib**

Create a minimal test file `docx-generator/_test-import.ts`:

```typescript
import { Document, Packer, Paragraph, TextRun } from 'docx';
console.log('docx import OK');
// We'll test cross-project import after creating the engine files
```

Run: `cd docx-generator && npx tsx _test-import.ts`
Expected: `docx import OK`

- [ ] **Step 4: Clean up test file and commit**

```bash
rm docx-generator/_test-import.ts
git add app/package.json app/package-lock.json docx-generator/tsconfig.json
git commit -m "chore: add docx, zod, tsx dependencies for loan engine"
```

---

## Task 2: Type definitions (types.ts)

**Files:**
- Create: `app/src/lib/loan-engine/types.ts`

- [ ] **Step 1: Write all type definitions**

```typescript
// app/src/lib/loan-engine/types.ts
import type { Paragraph, Table } from 'docx';

// ─── Loan Types ───

export type LoanType =
  | 'equity-pledge'       // 지분담보
  | 'pf-bridge'           // PF브릿지
  | 'unsold-collateral'   // 미분양담보
  | 'private-bond'        // 사모사채
  | 'construction';       // 공사비유동화

// ─── Section System ───

export type SectionContent = (Paragraph | Table)[];
export type SectionBuilder = (data: LoanApplication) => SectionContent | null;

export type SectionId =
  // Common
  | 'header' | 'overview' | 'basic-terms' | 'syndicate'
  | 'funding' | 'funding-plan'
  | 'conditions-security' | 'conditions' | 'security'
  | 'interest-rate' | 'structure' | 'opinion'
  | 'obligor-borrower' | 'borrowings' | 'obligor-related'
  | 'financial-opinion' | 'risk-analysis'
  | 'checklist' | 'tbd-summary'
  | 'PAGE_BREAK'
  // Plugins
  | 'plugin:equity-pledge'
  | 'plugin:collateral' | 'plugin:land-registry'
  | 'plugin:trigger' | 'plugin:interest-reserve' | 'plugin:equity-ratio'
  | 'plugin:sales-status' | 'plugin:sensitivity' | 'plugin:recovery'
  | 'plugin:term-sheet' | 'plugin:industry-compare'
  | 'plugin:credit-rating' | 'plugin:issuance-history'
  | 'plugin:construction';

export interface LoanTypeProfile {
  type: LoanType;
  sectionOrder: SectionId[];
  conditionsAndSecurity: 'merged' | 'separate';
}

// ─── Core Data Model ───

export interface LoanApplication {
  meta: ApplicationMeta;
  borrower: BorrowerInfo;
  loanTerms: LoanTerms;
  funding: FundingPlan;
  collateralSecurity: CollateralSecurityItem[];
  loanConditions: LoanConditions;
  syndicate?: SyndicateInfo;
  interestRate: InterestRateBreakdown;
  financials: {
    borrower: FinancialStatements;
    subsidiaries?: RelatedEntityFinancials[];
    relatedCompanies?: RelatedEntityFinancials[];
  };
  borrowings: BorrowingDetail[];
  typeSpecific: TypeSpecificData;
  aiContent: {
    opinion?: string;
    financialAnalysis?: string;
    riskAnalysis?: string;
  };
  unresolvedItems: UnresolvedItem[];
}

export type TypeSpecificData =
  | { type: 'equity-pledge'; data: EquityPledgeData }
  | { type: 'pf-bridge'; data: PFBridgeData }
  | { type: 'unsold-collateral'; data: UnsoldCollateralData }
  | { type: 'private-bond'; data: PrivateBondData }
  | { type: 'construction'; data: ConstructionFinanceData };

// ─── Sub-types ───

export interface ApplicationMeta {
  applicationDate: string;     // "2026-03-24"
  applicationType: '신규' | '기한연장' | '조건변경' | '증액' | '재신청' | '대환';
  branch: string;              // "기업금융1본부"
  officer?: string;
}

export interface BorrowerInfo {
  name: string;
  representative: string;
  businessNumber: string;       // 사업자번호
  corporateNumber?: string;     // 법인등록번호
  establishedDate: string;
  industry: string;
  address: string;
  companyType?: string;         // "비상장 / 외감"
  employeeCount?: number;
  capital?: number;             // 자본금 (백만원)
  fiscalMonth?: number;         // 결산월
  shareholders?: ShareholderInfo[];
  operatingStatus?: OperatingStatusItem[];
}

export interface ShareholderInfo {
  name: string;
  stockType: string;            // "보통주", "우선주"
  shares: number;
  ownershipPct: number;
  note?: string;
}

export interface OperatingStatusItem {
  label: string;
  value: string;
  note?: string;
}

export interface LoanTerms {
  loanType: LoanType;
  amount: number;               // 백만원
  durationMonths: number;
  repaymentMethod: string;
  repaymentDetail?: string;
  earlyRepaymentFee?: string;
  interestPayment?: string;
  rateType?: string;            // "고정" | "변동" | "TBD"
  ratePercent?: number;
  collateralType: string;
  purpose: string;
  repaymentSource: string;
  creditClassification: string;
  guarantor?: string;
}

export interface FundingPlan {
  cashIn: { item: string; amount: number }[];
  cashOut: { item: string; amount: number }[];
  detailedFunding?: {
    label: string;
    items: { category: string; amount: number; pct?: number; note?: string }[];
    total: number;
  };
}

export interface CollateralSecurityItem {
  no: number;
  description: string;
}

export interface LoanConditions {
  physical?: string[];          // 물적담보 조건
  personal?: string[];          // 인적담보 조건
  interestReserve?: string[];   // 이자유보 조건
  general?: string[];           // 기타 일반 조건
  approvalValidity?: string;    // 승인유효기간
}

export interface SyndicateInfo {
  totalAmount: number;
  tranches: TrancheInfo[];
}

export interface TrancheInfo {
  name: string;
  amount: number;
  rate?: number;
  participants: { name: string; amount: number; role?: string }[];
  conditions?: string[];
}

export interface InterestRateBreakdown {
  baseRate?: number;
  addOnRates?: { item: string; rate: number }[];
  totalCalculated?: number;
  adjustment?: number;
  adjustmentReason?: string;
  appliedRate?: number;
}

// ─── Financial Statements ───

export interface FinancialStatements {
  years: string[];              // ["22.12", "23.12", "24.12", "25.12"]
  balanceSheet: StatementLineItem[];
  incomeStatement: StatementLineItem[];
  ratios?: StatementLineItem[];
}

export interface StatementLineItem {
  account: string;
  values: Record<string, number | string | null>;  // year → value
  yoyChange?: string;
  bold?: boolean;
  indent?: number;
}

export interface RelatedEntityFinancials {
  entity: EntityInfo;
  detailLevel: 'full' | 'summary' | 'minimal';
  statements?: FinancialStatements;
  summaryRow?: FinancialSummaryRow;
  operatingStatus?: OperatingStatusItem[];
  borrowings?: BorrowingDetail[];
}

export interface EntityInfo {
  name: string;
  relationship: string;
  representative?: string;
  businessNumber?: string;
  corporateNumber?: string;
  establishedDate?: string;
  industry?: string;
  address?: string;
  companyType?: string;
  employeeCount?: number;
  capital?: number;
  shareholders?: ShareholderInfo[];
  note?: string;
}

export interface FinancialSummaryRow {
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  borrowings?: number;
  year?: string;
}

export interface BorrowingDetail {
  entityName: string;
  summary: BorrowingSummaryRow[];
  topLenders?: BorrowingLenderRow[];
  note?: string;
}

export interface BorrowingSummaryRow {
  category: string;
  count: number;
  balance: number;
  weightedAvgRate: string;
  maturityRange: string;
}

export interface BorrowingLenderRow {
  lender: string;
  type: string;
  balance: number;
  rate: string;
  maturity: string;
  repayment: string;
}

// ─── Type-Specific Data ───

export interface EquityPledgeData {
  pledgedEquities: PledgedEquityItem[];
  valuationStatus?: ValuationInfo[];
  collateralValue?: {
    valuationBasis: string;
    valuationAmount: number;
    ltv: number;
    note?: string;
  };
  unlistedValuation?: UnlistedStockValuation;
  guarantorIncome?: GuarantorIncome;
  cashFlow?: CashFlowData;
  provisioningRates?: ProvisioningData;
  consolidatedFinancials?: FinancialStatements;
}

export interface PledgedEquityItem {
  targetCompany: string;
  holder: string;
  stockType: string;
  shares: number;
  ownershipPct: number;
  appraiser?: string;
  valuationAmount?: number | string;  // number or "TBD"
  valuationDate?: string;
  note?: string;
}

export interface ValuationInfo {
  method: string;
  items: { label: string; value: string | number }[];
}

export interface UnlistedStockValuation {
  method: string;
  items: { label: string; value: string | number }[];
}

export interface GuarantorIncome {
  name: string;
  items: { label: string; value: string }[];
}

export interface CashFlowData {
  entities: CashFlowEntity[];
  consolidatedMetrics?: { label: string; value: string; note?: string }[];
}

export interface CashFlowEntity {
  name: string;
  source: string;
  period: string;
  quarters: string[];
  items: CashFlowLineItem[];
}

export interface CashFlowLineItem {
  label: string;
  values: (number | string)[];
  annual?: number | string;
  bold?: boolean;
  indent?: number;
}

export interface ProvisioningData {
  items: { category: string; values: Record<string, string | number> }[];
  years: string[];
}

export interface RiskAnalysisItem {
  category: string;
  analysis: string;
  likelihood: string;         // "● 낮음" | "● 보통" | "● 높음"
}

// ─── Placeholder types for future loan types ───

export interface PFBridgeData { [key: string]: unknown }
export interface UnsoldCollateralData { [key: string]: unknown }
export interface PrivateBondData { [key: string]: unknown }
export interface ConstructionFinanceData { [key: string]: unknown }

// ─── Unresolved Items ───

export interface UnresolvedItem {
  no: number;
  section: string;
  item: string;
  status: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/lib/loan-engine/types.ts
git commit -m "feat(loan-engine): define core type system (LoanApplication, LoanTypeProfile, sections)"
```

---

## Task 3: Section helpers (helpers.ts)

**Files:**
- Create: `app/src/lib/loan-engine/sections/helpers.ts`

Migrate all shared DOCX helpers from `generate-docx.mjs` lines 20-128 into typed functions.

- [ ] **Step 1: Write helpers.ts**

```typescript
// app/src/lib/loan-engine/sections/helpers.ts
import {
  Paragraph, Table, TableRow, TableCell, TextRun,
  AlignmentType, BorderStyle, WidthType, VerticalAlign,
  ShadingType, PageBreak,
} from 'docx';

// ─── Style Constants ───
export const FONT = '맑은 고딕';
export const FONT_SIZE = 18;        // 9pt = 18 half-points
export const FONT_SIZE_SMALL = 16;  // 8pt
export const FONT_SIZE_TITLE = 28;  // 14pt
export const FONT_SIZE_SECTION = 22; // 11pt
export const HEADER_SHADING = { type: ShadingType.SOLID, color: 'D9D9D9' };
export const TBD_COLOR = '0000FF';
export const CONFIRM_COLOR = 'FF0000';

const thinBorder = { style: BorderStyle.SINGLE, size: 1 };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

// ─── Formatting ───

export function fmt(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return '-';
  if (typeof num === 'string') {
    if (num.includes('TBD')) return '[TBD]';
    // Try to parse as number
    const parsed = Number(num.replace(/,/g, ''));
    if (!isNaN(parsed)) return parsed.toLocaleString('ko-KR');
    return num;
  }
  return num.toLocaleString('ko-KR');
}

export function pct(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return num.toFixed(2) + '%';
}

// ─── Cell Builders ───

interface CellOpts {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  width?: number;
  colspan?: number;
  rowspan?: number;
  bold?: boolean;
}

export function headerCell(text: string, opts: CellOpts = {}): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, font: FONT, size: FONT_SIZE })],
      alignment: opts.align || AlignmentType.CENTER,
    })],
    shading: HEADER_SHADING,
    borders,
    verticalAlign: VerticalAlign.CENTER,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.colspan,
    rowSpan: opts.rowspan,
  });
}

export function dataCell(text: string, opts: CellOpts = {}): TableCell {
  const str = String(text ?? '');
  let color: string | undefined;
  if (str.includes('[TBD')) color = TBD_COLOR;
  else if (str.includes('[확인필요')) color = CONFIRM_COLOR;

  // Auto-detect numeric alignment
  const isNumeric = typeof text === 'string' && /^[\d,.()\-]+[%원]?$/.test(text.replace(/\s/g, ''));
  const alignment = opts.align || (isNumeric ? AlignmentType.RIGHT : AlignmentType.LEFT);

  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: str, font: FONT, size: FONT_SIZE, bold: opts.bold, color })],
      alignment,
    })],
    borders,
    verticalAlign: VerticalAlign.CENTER,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.colspan,
    rowSpan: opts.rowspan,
  });
}

// ─── Paragraph Builders ───

export function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `■ ${text}`, bold: true, font: FONT, size: FONT_SIZE_SECTION })],
    spacing: { before: 300, after: 100 },
  });
}

export function subTitle(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, font: FONT, size: FONT_SIZE })],
    spacing: { before: 200, after: 80 },
  });
}

export function bodyText(text: string, opts: { color?: string } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, color: opts.color })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 60 },
  });
}

export function tbdText(text: string): Paragraph {
  return bodyText(text, { color: TBD_COLOR });
}

export function bulletText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `□ ${text}`, font: FONT, size: FONT_SIZE })],
    spacing: { after: 80 },
  });
}

export function emptyLine(): Paragraph {
  return new Paragraph({ children: [], spacing: { after: 60 } });
}

export function unitLabel(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE_SMALL })],
    alignment: AlignmentType.RIGHT,
    spacing: { after: 40 },
  });
}

export function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// ─── Table Builder ───

export function makeTable(rows: TableRow[], width = 100): Table {
  return new Table({ width: { size: width, type: WidthType.PERCENTAGE }, rows });
}

export function row(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells });
}

// ─── Shorthand aliases (matching sections-supplement.mjs style) ───

export const hc = headerCell;
export const dc = dataCell;
export function rc(text: string, opts: CellOpts = {}): TableCell {
  return dataCell(text, { ...opts, align: AlignmentType.RIGHT });
}
export function cc(text: string, opts: CellOpts = {}): TableCell {
  return dataCell(text, { ...opts, align: AlignmentType.CENTER });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/lib/loan-engine/sections/helpers.ts
git commit -m "feat(loan-engine): DOCX section helpers (cells, paragraphs, tables)"
```

---

## Task 4: Equity pledge profile + section registry

**Files:**
- Create: `app/src/lib/loan-engine/profiles/equity-pledge.ts`
- Create: `app/src/lib/loan-engine/sections/registry.ts`

- [ ] **Step 1: Write equity-pledge profile**

```typescript
// app/src/lib/loan-engine/profiles/equity-pledge.ts
import type { LoanTypeProfile } from '../types.js';

export const equityPledgeProfile: LoanTypeProfile = {
  type: 'equity-pledge',
  sectionOrder: [
    'header',
    'overview',
    'basic-terms',
    'syndicate',           // skipped if no data
    'funding',
    'conditions-security',
    'opinion',
    'PAGE_BREAK',
    'plugin:equity-pledge',
    'PAGE_BREAK',
    'obligor-borrower',
    'borrowings',
    'obligor-related',
    'financial-opinion',
    'risk-analysis',
    'checklist',
    'tbd-summary',
  ],
  conditionsAndSecurity: 'merged',
};
```

- [ ] **Step 2: Write section registry**

```typescript
// app/src/lib/loan-engine/sections/registry.ts
import type { SectionId, SectionBuilder } from '../types.js';

const registry = new Map<SectionId, SectionBuilder>();

export function registerSection(id: SectionId, builder: SectionBuilder): void {
  registry.set(id, builder);
}

export function getSection(id: SectionId): SectionBuilder | undefined {
  return registry.get(id);
}

export function getAllRegistered(): SectionId[] {
  return [...registry.keys()];
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/loan-engine/profiles/equity-pledge.ts app/src/lib/loan-engine/sections/registry.ts
git commit -m "feat(loan-engine): equity-pledge profile + section registry"
```

---

## Task 5: Common section builders (Part 1 — header through funding)

**Files:**
- Create: `app/src/lib/loan-engine/sections/common/header.ts`
- Create: `app/src/lib/loan-engine/sections/common/overview.ts`
- Create: `app/src/lib/loan-engine/sections/common/basic-terms.ts`
- Create: `app/src/lib/loan-engine/sections/common/syndicate.ts`
- Create: `app/src/lib/loan-engine/sections/common/funding.ts`

Each builder is a direct port of the corresponding function from `generate-docx.mjs`, but reading from `LoanApplication` instead of hardcoded values.

- [ ] **Step 1: Write header.ts**

```typescript
// app/src/lib/loan-engine/sections/common/header.ts
import { Paragraph, Table, TextRun, AlignmentType, WidthType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { FONT, FONT_SIZE_TITLE, headerCell, dataCell, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildHeader(data: LoanApplication): SectionContent {
  return [
    new Paragraph({
      children: [new TextRun({ text: '여 신 승 인 신 청 서', bold: true, font: FONT, size: FONT_SIZE_TITLE })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    // 결재란
    new Table({
      width: { size: 50, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.RIGHT,
      rows: [
        row([headerCell('담당'), headerCell('책임자'), headerCell('본부장'), headerCell('담당'), headerCell('임원')]),
        row([dataCell(' '), dataCell(' '), dataCell(' '), dataCell(' '), dataCell(' ')]),
      ],
    }),
    emptyLine(),
  ];
}

registerSection('header', buildHeader);
export { buildHeader };
```

- [ ] **Step 2: Write overview.ts**

```typescript
// app/src/lib/loan-engine/sections/common/overview.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, bodyText, emptyLine, fmt } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildOverview(data: LoanApplication): SectionContent {
  const b = data.borrower;
  const t = data.loanTerms;
  const overviewText = `본건은 ${b.name}(이하 "차주")가 ${t.purpose} 목적으로 ` +
    `${fmt(t.amount)}백만원(${Math.round(t.amount / 100)}억원)을 ` +
    `대출 신청하는 건임.`;

  return [
    sectionTitle(`차주명 : ${b.name}`),
    emptyLine(),
    sectionTitle('신청개요'),
    bodyText(overviewText),
    emptyLine(),
  ];
}

registerSection('overview', buildOverview);
export { buildOverview };
```

- [ ] **Step 3: Write basic-terms.ts**

```typescript
// app/src/lib/loan-engine/sections/common/basic-terms.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, unitLabel, headerCell, dataCell, emptyLine, row, fmt } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildBasicTerms(data: LoanApplication): SectionContent {
  const t = data.loanTerms;
  const f = data.funding;
  const content: SectionContent = [
    subTitle('1. 기본조건'),
    unitLabel('(단위:백만원)'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([
          headerCell('구분'), headerCell('신청금액'), headerCell('대출기간'),
          headerCell('상환방법'), headerCell('대출금리'), headerCell('연대보증'),
        ]),
        row([
          dataCell(data.meta.applicationType, { align: AlignmentType.CENTER }),
          dataCell(fmt(t.amount), { align: AlignmentType.RIGHT }),
          dataCell(`${t.durationMonths}개월`, { align: AlignmentType.CENTER }),
          dataCell(t.repaymentMethod, { align: AlignmentType.CENTER }),
          dataCell(t.ratePercent ? `${t.ratePercent}%` : '[TBD]', { align: AlignmentType.CENTER }),
          dataCell(t.guarantor || '-', { align: AlignmentType.CENTER }),
        ]),
      ],
    }),
    emptyLine(),
    // Key-value info table
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([
          headerCell('담보종류', { width: 15 }), dataCell(t.collateralType, { width: 35 }),
          headerCell('건전성분류', { width: 15 }), dataCell(t.creditClassification, { width: 35 }),
        ]),
        row([
          headerCell('자금용도'), dataCell(t.purpose),
          headerCell('상환재원'), dataCell(t.repaymentSource),
        ]),
        row([
          headerCell('이자지급'), dataCell(t.interestPayment || '-'),
          headerCell('조기상환수수료'), dataCell(t.earlyRepaymentFee || '-'),
        ]),
      ],
    }),
    emptyLine(),
  ];

  // Cash In/Out table
  if (f.cashIn.length > 0) {
    content.push(
      subTitle('■ 자금용도(안)'),
      unitLabel('(단위:백만원)'),
    );
    const maxRows = Math.max(f.cashIn.length, f.cashOut.length);
    const tableRows = [
      row([headerCell('Cash In', { width: 25 }), headerCell('금액', { width: 25 }),
           headerCell('Cash Out', { width: 25 }), headerCell('금액', { width: 25 })]),
    ];
    for (let i = 0; i < maxRows; i++) {
      const ci = f.cashIn[i];
      const co = f.cashOut[i];
      tableRows.push(row([
        dataCell(ci?.item || ''), dataCell(ci ? fmt(ci.amount) : '', { align: AlignmentType.RIGHT }),
        dataCell(co?.item || ''), dataCell(co ? fmt(co.amount) : '', { align: AlignmentType.RIGHT }),
      ]));
    }
    const totalIn = f.cashIn.reduce((s, x) => s + x.amount, 0);
    const totalOut = f.cashOut.reduce((s, x) => s + x.amount, 0);
    tableRows.push(row([
      headerCell('합계'), dataCell(fmt(totalIn), { align: AlignmentType.RIGHT, bold: true }),
      headerCell('합계'), dataCell(fmt(totalOut), { align: AlignmentType.RIGHT, bold: true }),
    ]));
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
    content.push(emptyLine());
  }

  // Detailed funding structure (if present)
  if (f.detailedFunding) {
    const df = f.detailedFunding;
    content.push(subTitle(`■ ${df.label}`), unitLabel('(단위:백만원)'));
    const headers = df.items.map(i => i.category);
    const fundRows = [
      row([headerCell('구분'), ...headers.map(h => headerCell(h)), headerCell('합계')]),
      row([headerCell('금액'), ...df.items.map(i => dataCell(fmt(i.amount), { align: AlignmentType.RIGHT })),
           dataCell(fmt(df.total), { align: AlignmentType.RIGHT, bold: true })]),
    ];
    if (df.items.some(i => i.pct !== undefined)) {
      fundRows.push(row([headerCell('비율'),
        ...df.items.map(i => dataCell(i.pct !== undefined ? `${i.pct.toFixed(2)}%` : '-', { align: AlignmentType.CENTER })),
        dataCell('100.00%', { align: AlignmentType.CENTER }),
      ]));
    }
    if (df.items.some(i => i.note)) {
      fundRows.push(row([headerCell('비고'),
        ...df.items.map(i => dataCell(i.note || '')),
        dataCell(' '),
      ]));
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fundRows }));
    content.push(emptyLine());
  }

  return content;
}

registerSection('basic-terms', buildBasicTerms);
export { buildBasicTerms };
```

- [ ] **Step 4: Write syndicate.ts**

```typescript
// app/src/lib/loan-engine/sections/common/syndicate.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, unitLabel, headerCell, dataCell, emptyLine, row, fmt } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildSyndicate(data: LoanApplication): SectionContent | null {
  if (!data.syndicate) return null;
  const s = data.syndicate;

  const content: SectionContent = [
    subTitle('■ 대주단 구성'),
    unitLabel('(단위:백만원)'),
  ];

  for (const tranche of s.tranches) {
    const trRows = [
      row([headerCell('참여기관'), headerCell('금액'), headerCell('비율'), headerCell('역할')]),
      ...tranche.participants.map(p => row([
        dataCell(p.name),
        dataCell(fmt(p.amount), { align: AlignmentType.RIGHT }),
        dataCell((p.amount / s.totalAmount * 100).toFixed(1) + '%', { align: AlignmentType.CENTER }),
        dataCell(p.role || '-', { align: AlignmentType.CENTER }),
      ])),
    ];
    content.push(
      subTitle(`${tranche.name} (금리: ${tranche.rate ? tranche.rate + '%' : 'TBD'})`),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: trRows }),
      emptyLine(),
    );
  }

  return content;
}

registerSection('syndicate', buildSyndicate);
export { buildSyndicate };
```

- [ ] **Step 5: Write funding.ts (funding-plan for PF/construction)**

```typescript
// app/src/lib/loan-engine/sections/common/funding.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { registerSection } from '../registry.js';

// funding is handled inline by basic-terms.ts (cashIn/cashOut + detailedFunding)
// This separate builder is for the extended "소요자금 조달·지출계획" in PF/construction
function buildFundingPlan(data: LoanApplication): SectionContent | null {
  // Phase 4: Implement when PF/construction plugins are added
  return null;
}

registerSection('funding', buildFundingPlan);
registerSection('funding-plan', buildFundingPlan);
export { buildFundingPlan };
```

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/loan-engine/sections/common/header.ts \
       app/src/lib/loan-engine/sections/common/overview.ts \
       app/src/lib/loan-engine/sections/common/basic-terms.ts \
       app/src/lib/loan-engine/sections/common/syndicate.ts \
       app/src/lib/loan-engine/sections/common/funding.ts
git commit -m "feat(loan-engine): common section builders part 1 (header → funding)"
```

---

## Task 6: Common section builders (Part 2 — conditions through tbd-summary)

**Files:**
- Create: `app/src/lib/loan-engine/sections/common/conditions-security.ts`
- Create: `app/src/lib/loan-engine/sections/common/interest-rate.ts`
- Create: `app/src/lib/loan-engine/sections/common/structure.ts`
- Create: `app/src/lib/loan-engine/sections/common/opinion.ts`
- Create: `app/src/lib/loan-engine/sections/common/obligor.ts`
- Create: `app/src/lib/loan-engine/sections/common/borrowings.ts`
- Create: `app/src/lib/loan-engine/sections/common/financial-opinion.ts`
- Create: `app/src/lib/loan-engine/sections/common/risk-analysis.ts`
- Create: `app/src/lib/loan-engine/sections/common/checklist.ts`
- Create: `app/src/lib/loan-engine/sections/common/tbd-summary.ts`

Due to the volume, each file follows the same pattern: import types + helpers, implement builder, register in registry.

- [ ] **Step 1: Write conditions-security.ts**

Port from `buildCollateralPreservation()` in generate-docx.mjs:269-286. Supports both merged and separate modes.

```typescript
// app/src/lib/loan-engine/sections/common/conditions-security.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, headerCell, dataCell, bodyText, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildConditionsSecurity(data: LoanApplication): SectionContent {
  const content: SectionContent = [];

  // Loan conditions (if any)
  const cond = data.loanConditions;
  const hasConditions = cond.physical?.length || cond.personal?.length ||
    cond.interestReserve?.length || cond.general?.length;

  if (hasConditions) {
    content.push(subTitle('2. 여신조건 상세'));
    if (cond.physical?.length) {
      content.push(bodyText('□ 물적담보'));
      cond.physical.forEach(c => content.push(bodyText(`  ${c}`)));
    }
    if (cond.personal?.length) {
      content.push(bodyText('□ 인적담보'));
      cond.personal.forEach(c => content.push(bodyText(`  ${c}`)));
    }
    if (cond.interestReserve?.length) {
      content.push(bodyText('□ 이자유보'));
      cond.interestReserve.forEach(c => content.push(bodyText(`  ${c}`)));
    }
    if (cond.general?.length) {
      cond.general.forEach(c => content.push(bodyText(`□ ${c}`)));
    }
    if (cond.approvalValidity) {
      content.push(bodyText(`□ 승인 유효기간: ${cond.approvalValidity}`));
    }
    content.push(emptyLine());
  }

  // Collateral security items
  if (data.collateralSecurity.length > 0) {
    const secTitle = hasConditions ? '채권보전사항' : '2. 채권보전사항';
    content.push(subTitle(secTitle));
    const secRows = [
      row([headerCell('No.', { width: 8 }), headerCell('채권보전 내용', { width: 92 })]),
      ...data.collateralSecurity.map(item =>
        row([dataCell(String(item.no), { align: AlignmentType.CENTER }), dataCell(item.description)])
      ),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: secRows }));
    content.push(emptyLine());
  }

  return content;
}

registerSection('conditions-security', buildConditionsSecurity);
export { buildConditionsSecurity };
```

- [ ] **Step 2: Write interest-rate.ts**

```typescript
// app/src/lib/loan-engine/sections/common/interest-rate.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, unitLabel, headerCell, dataCell, bodyText, tbdText, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildInterestRate(data: LoanApplication): SectionContent {
  const r = data.interestRate;
  if (!r.baseRate && !r.appliedRate) {
    return [subTitle('금리산출 및 적용'), tbdText('[TBD: 금리 확정 후 반영]'), emptyLine()];
  }

  const addOnItems = r.addOnRates || [];
  const addOnTotal = addOnItems.reduce((s, x) => s + x.rate, 0);
  const calcTotal = (r.baseRate || 0) + addOnTotal;

  const content: SectionContent = [
    subTitle('금리산출 및 적용'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([headerCell(' '), headerCell('기준금리'), headerCell('가산금리'), headerCell('산출금리'),
             headerCell('금리조정'), headerCell('적용금리')]),
        row([
          headerCell('금리'),
          dataCell(r.baseRate ? `${r.baseRate.toFixed(2)}%` : '-', { align: AlignmentType.CENTER }),
          dataCell(`${addOnTotal.toFixed(2)}%`, { align: AlignmentType.CENTER }),
          dataCell(`${calcTotal.toFixed(2)}%`, { align: AlignmentType.CENTER }),
          dataCell(r.adjustment ? `${r.adjustment > 0 ? '+' : ''}${r.adjustment.toFixed(2)}%` : '-', { align: AlignmentType.CENTER }),
          dataCell(r.appliedRate ? `${r.appliedRate.toFixed(2)}%` : '[TBD]', { align: AlignmentType.CENTER }),
        ]),
      ],
    }),
    emptyLine(),
  ];

  if (addOnItems.length > 0) {
    content.push(
      new Table({
        width: { size: 80, type: WidthType.PERCENTAGE },
        rows: [
          row([headerCell('가산금리 항목'), headerCell('요율')]),
          ...addOnItems.map(a => row([dataCell(a.item), dataCell(`${a.rate.toFixed(2)}%`, { align: AlignmentType.CENTER })])),
        ],
      }),
      emptyLine(),
    );
  }

  if (r.adjustmentReason) {
    content.push(bodyText(`금리조정사유: ${r.adjustmentReason}`), emptyLine());
  }

  return content;
}

registerSection('interest-rate', buildInterestRate);
export { buildInterestRate };
```

- [ ] **Step 3: Write structure.ts, opinion.ts, financial-opinion.ts**

```typescript
// app/src/lib/loan-engine/sections/common/structure.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, tbdText, emptyLine } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildStructure(data: LoanApplication): SectionContent | null {
  // Phase 2+: render from typeSpecific data or image
  return [sectionTitle('금융구조도'), tbdText('[TBD: 금융구조도 향후 업데이트]'), emptyLine()];
}

registerSection('structure', buildStructure);
export { buildStructure };
```

```typescript
// app/src/lib/loan-engine/sections/common/opinion.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, bulletText, bodyText, tbdText, emptyLine } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildOpinion(data: LoanApplication): SectionContent {
  const branch = data.meta.branch;
  const content: SectionContent = [
    subTitle(`3. 신청점 종합의견 (${branch})`),
    emptyLine(),
  ];

  if (data.aiContent.opinion) {
    // AI-generated opinion: split by paragraphs
    const paragraphs = data.aiContent.opinion.split('\n').filter(p => p.trim());
    paragraphs.forEach(p => {
      const trimmed = p.trim();
      if (trimmed.startsWith('□') || trimmed.startsWith('-')) {
        content.push(bulletText(trimmed.replace(/^[□\-]\s*/, '')));
      } else {
        content.push(bodyText(trimmed));
      }
    });
  } else {
    content.push(tbdText('[AI 종합의견 미생성 — 수동 작성 필요]'));
  }

  content.push(emptyLine());
  return content;
}

registerSection('opinion', buildOpinion);
export { buildOpinion };
```

```typescript
// app/src/lib/loan-engine/sections/common/financial-opinion.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, bodyText, tbdText, emptyLine } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildFinancialOpinion(data: LoanApplication): SectionContent | null {
  if (!data.aiContent.financialAnalysis) return null;
  return [
    subTitle('재무분석 소견'),
    bodyText(data.aiContent.financialAnalysis),
    emptyLine(),
  ];
}

registerSection('financial-opinion', buildFinancialOpinion);
export { buildFinancialOpinion };
```

- [ ] **Step 4: Write obligor.ts — the largest common builder**

```typescript
// app/src/lib/loan-engine/sections/common/obligor.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, FinancialStatements, RelatedEntityFinancials } from '../../types.js';
import {
  sectionTitle, subTitle, unitLabel, bodyText, headerCell, dataCell, emptyLine, row, fmt, pageBreak,
} from '../helpers.js';
import { registerSection } from '../registry.js';

function renderEntityInfo(prefix: string, entity: {
  name: string; representative?: string; businessNumber?: string;
  corporateNumber?: string; establishedDate?: string; industry?: string;
  address?: string; companyType?: string; employeeCount?: number;
  capital?: number; fiscalMonth?: number;
}): SectionContent {
  const rows = [
    row([headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 }),
         headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 })]),
    row([dataCell('기업명'), dataCell(entity.name),
         dataCell('대표자'), dataCell(entity.representative || '-')]),
  ];
  if (entity.businessNumber) {
    rows.push(row([dataCell('사업자번호'), dataCell(entity.businessNumber),
                    dataCell('법인등록번호'), dataCell(entity.corporateNumber || '-')]));
  }
  if (entity.establishedDate) {
    rows.push(row([dataCell('설립일'), dataCell(entity.establishedDate),
                    dataCell('업종'), dataCell(entity.industry || '-')]));
  }
  if (entity.address) {
    rows.push(row([dataCell('소재지'), dataCell(entity.address, { colspan: 3 })]));
  }
  if (entity.companyType || entity.employeeCount) {
    rows.push(row([dataCell('기업형태'), dataCell(entity.companyType || '-'),
                    dataCell('임직원수'), dataCell(entity.employeeCount ? `${entity.employeeCount}명` : '-')]));
  }
  if (entity.capital) {
    rows.push(row([dataCell('자본금'), dataCell(`${fmt(entity.capital)}백만원`),
                    dataCell('결산월'), dataCell(entity.fiscalMonth ? `${entity.fiscalMonth}월` : '-')]));
  }

  return [
    subTitle(`${prefix}. 기본정보`),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    emptyLine(),
  ];
}

function renderStatements(prefix: string, fs: FinancialStatements): SectionContent {
  const content: SectionContent = [];

  // Balance Sheet
  if (fs.balanceSheet.length > 0) {
    content.push(subTitle(`${prefix}. 주요 재무현황`), subTitle('■ 재무상태표'), unitLabel('(단위:백만원)'));
    const bsRows = [
      row([headerCell('계정과목', { width: 22 }), ...fs.years.map(y => headerCell(y)), headerCell('전년비')]),
      ...fs.balanceSheet.map(item =>
        row([
          dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.account}` : item.account, { bold: item.bold }),
          ...fs.years.map(y => dataCell(
            item.values[y] !== null && item.values[y] !== undefined ? String(item.values[y]) : '-',
            { align: AlignmentType.RIGHT, bold: item.bold }
          )),
          dataCell(item.yoyChange || '-', { align: AlignmentType.CENTER }),
        ])
      ),
    ];
    if (fs.ratios?.length) {
      fs.ratios.filter(r => ['부채비율', '자기자본비율', '차입금의존도'].includes(r.account))
        .forEach(r => {
          bsRows.push(row([
            headerCell(r.account),
            ...fs.years.map(y => dataCell(String(r.values[y] ?? '-'), { align: AlignmentType.CENTER })),
            dataCell(r.yoyChange || '-', { align: AlignmentType.CENTER }),
          ]));
        });
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: bsRows }), emptyLine());
  }

  // Income Statement
  if (fs.incomeStatement.length > 0) {
    content.push(subTitle('■ 손익계산서'), unitLabel('(단위:백만원)'));
    const isRows = [
      row([headerCell('계정과목', { width: 22 }), ...fs.years.map(y => headerCell(y)), headerCell('전년비')]),
      ...fs.incomeStatement.map(item =>
        row([
          dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.account}` : item.account, { bold: item.bold }),
          ...fs.years.map(y => dataCell(
            item.values[y] !== null && item.values[y] !== undefined ? String(item.values[y]) : '-',
            { align: AlignmentType.RIGHT, bold: item.bold }
          )),
          dataCell(item.yoyChange || '-', { align: AlignmentType.CENTER }),
        ])
      ),
    ];
    if (fs.ratios?.length) {
      fs.ratios.filter(r => ['영업이익률', '순이익률'].includes(r.account))
        .forEach(r => {
          isRows.push(row([
            headerCell(r.account),
            ...fs.years.map(y => dataCell(String(r.values[y] ?? '-'), { align: AlignmentType.CENTER })),
            dataCell(r.yoyChange || '-', { align: AlignmentType.CENTER }),
          ]));
        });
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: isRows }), emptyLine());
  }

  return content;
}

function buildObligorBorrower(data: LoanApplication): SectionContent {
  const b = data.borrower;
  const fs = data.financials.borrower;
  const content: SectionContent = [
    pageBreak(),
    sectionTitle('채무관련인 현황'),
    emptyLine(),
    subTitle('1. 차주사 현황'),
    bodyText(`(조사기준일: ${fs.years[fs.years.length - 1] || '-'})`),
    ...renderEntityInfo('1-1', { ...b, fiscalMonth: b.fiscalMonth }),
  ];

  // Shareholders
  if (b.shareholders?.length) {
    content.push(subTitle('■ 주주구성'));
    const shRows = [
      row([headerCell('주주명'), headerCell('주식종류'), headerCell('주식수'), headerCell('지분율'), headerCell('비고')]),
      ...b.shareholders.map(s => row([
        dataCell(s.name), dataCell(s.stockType),
        dataCell(fmt(s.shares), { align: AlignmentType.RIGHT }),
        dataCell(`${s.ownershipPct.toFixed(2)}%`, { align: AlignmentType.CENTER }),
        dataCell(s.note || ''),
      ])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: shRows }), emptyLine());
  }

  // Financial statements
  content.push(...renderStatements('1-2', fs));

  // Operating status
  if (b.operatingStatus?.length) {
    content.push(subTitle('1-3. 영업현황'));
    const opRows = [
      row([headerCell('항목'), headerCell('수치'), headerCell('비고')]),
      ...b.operatingStatus.map(o => row([dataCell(o.label), dataCell(o.value), dataCell(o.note || '')])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: opRows }), emptyLine());
  }

  return content;
}

function buildObligorRelated(data: LoanApplication): SectionContent | null {
  const subs = data.financials.subsidiaries || [];
  const related = data.financials.relatedCompanies || [];
  const all = [...subs, ...related];
  if (all.length === 0) return null;

  const content: SectionContent = [];
  let idx = 2; // starts at 2 (1 = borrower)

  for (const rel of all) {
    content.push(pageBreak());
    content.push(subTitle(`${idx}. ${rel.entity.relationship} 현황 - ${rel.entity.name}`));
    if (rel.entity.establishedDate) {
      content.push(bodyText(`(조사기준일: ${rel.statements?.years[rel.statements.years.length - 1] || '-'})`));
    }
    content.push(emptyLine());

    if (rel.detailLevel === 'full' && rel.statements) {
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      content.push(...renderStatements(`${idx}-2`, rel.statements));
      if (rel.operatingStatus?.length) {
        content.push(subTitle(`${idx}-3. 영업현황`));
        const opRows = [
          row([headerCell('항목'), headerCell('수치'), headerCell('비고')]),
          ...rel.operatingStatus.map(o => row([dataCell(o.label), dataCell(o.value), dataCell(o.note || '')])),
        ];
        content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: opRows }), emptyLine());
      }
    } else if (rel.detailLevel === 'summary' && rel.summaryRow) {
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      const s = rel.summaryRow;
      content.push(subTitle(`${idx}-2. 간략 재무현황`), unitLabel('(단위:백만원)'));
      content.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row([headerCell('자산총계'), headerCell('부채총계'), headerCell('자본총계'),
               headerCell('매출액'), headerCell('영업이익'), headerCell('당기순이익')]),
          row([
            dataCell(s.totalAssets != null ? fmt(s.totalAssets) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.totalLiabilities != null ? fmt(s.totalLiabilities) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.totalEquity != null ? fmt(s.totalEquity) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.revenue != null ? fmt(s.revenue) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.operatingIncome != null ? fmt(s.operatingIncome) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.netIncome != null ? fmt(s.netIncome) : '-', { align: AlignmentType.RIGHT }),
          ]),
        ],
      }), emptyLine());
    } else {
      // minimal — just entity info
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      if (rel.entity.note) {
        content.push(bodyText(rel.entity.note), emptyLine());
      }
    }

    idx++;
  }

  return content;
}

registerSection('obligor-borrower', buildObligorBorrower);
registerSection('obligor-related', buildObligorRelated);
export { buildObligorBorrower, buildObligorRelated, renderStatements, renderEntityInfo };
```

- [ ] **Step 5: Write borrowings.ts**

```typescript
// app/src/lib/loan-engine/sections/common/borrowings.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, BorrowingDetail } from '../../types.js';
import { subTitle, unitLabel, headerCell, dataCell, bodyText, emptyLine, row, fmt, pageBreak } from '../helpers.js';
import { registerSection } from '../registry.js';

function renderBorrowingDetail(detail: BorrowingDetail, prefix: string): SectionContent {
  const content: SectionContent = [
    subTitle(`${prefix}. 차입금 현황`),
    unitLabel(`(단위:백만원 / 출처: ${detail.entityName})`),
    subTitle('■ 차입금 유형별 요약'),
  ];

  const summaryRows = [
    row([headerCell('구분'), headerCell('건수'), headerCell('잔액'),
         headerCell('가중평균금리'), headerCell('만기범위')]),
    ...detail.summary.map(s => row([
      dataCell(s.category, { bold: s.category === '합계' }),
      dataCell(String(s.count), { align: AlignmentType.CENTER, bold: s.category === '합계' }),
      dataCell(fmt(s.balance), { align: AlignmentType.RIGHT, bold: s.category === '합계' }),
      dataCell(s.weightedAvgRate, { align: AlignmentType.CENTER }),
      dataCell(s.maturityRange, { align: AlignmentType.CENTER }),
    ])),
  ];
  content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: summaryRows }), emptyLine());

  if (detail.topLenders?.length) {
    content.push(subTitle('■ 주요 차입처 (잔액 상위)'));
    const lenderRows = [
      row([headerCell('차입처'), headerCell('구분'), headerCell('잔액'),
           headerCell('금리'), headerCell('만기'), headerCell('상환방식')]),
      ...detail.topLenders.map(l => row([
        dataCell(l.lender), dataCell(l.type),
        dataCell(fmt(l.balance), { align: AlignmentType.RIGHT }),
        dataCell(l.rate, { align: AlignmentType.CENTER }),
        dataCell(l.maturity, { align: AlignmentType.CENTER }),
        dataCell(l.repayment),
      ])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: lenderRows }), emptyLine());
  }

  if (detail.note) {
    content.push(bodyText(detail.note), emptyLine());
  }

  return content;
}

function buildBorrowings(data: LoanApplication): SectionContent | null {
  if (data.borrowings.length === 0) return null;

  const content: SectionContent = [];
  // Borrower's own borrowings (prefix: 1-4, etc.)
  for (let i = 0; i < data.borrowings.length; i++) {
    const detail = data.borrowings[i];
    const prefix = i === 0 ? '1-4' : `${i + 1}-4`;
    content.push(...renderBorrowingDetail(detail, prefix));
  }

  return content;
}

registerSection('borrowings', buildBorrowings);
export { buildBorrowings };
```

- [ ] **Step 6: Write risk-analysis.ts, checklist.ts, tbd-summary.ts**

```typescript
// app/src/lib/loan-engine/sections/common/risk-analysis.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, subTitle, bodyText, tbdText, headerCell, dataCell, emptyLine, row, pageBreak } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildRiskAnalysis(data: LoanApplication): SectionContent {
  const content: SectionContent = [pageBreak(), sectionTitle('이자 상환능력 및 리스크 분석'), emptyLine()];

  if (data.aiContent.riskAnalysis) {
    content.push(bodyText(data.aiContent.riskAnalysis), emptyLine());
    return content;
  }

  // Fallback: manual [TBD] or static content from typeSpecific
  content.push(tbdText('[리스크 분석 — AI 생성 또는 수동 작성 필요]'), emptyLine());
  return content;
}

registerSection('risk-analysis', buildRiskAnalysis);
export { buildRiskAnalysis };
```

```typescript
// app/src/lib/loan-engine/sections/common/checklist.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, headerCell, dataCell, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

const DEFAULT_ITEMS = [
  '차주 신용도 및 재무건전성 확인',
  '담보물 평가의 적정성',
  '자금용도의 합리성 및 상환재원의 확실성',
  '대출금리의 적정성',
  '채권보전 조건의 충분성',
  '관련 법규 및 내규 준수 여부',
  '이해상충 여부 확인',
  '차주 및 보증인 동의서 징구 여부',
];

function buildChecklist(data: LoanApplication): SectionContent {
  return [
    sectionTitle('신청내용 영업점 자체점검 Check List'),
    emptyLine(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([headerCell('No.', { width: 6 }), headerCell('자체 점검사항', { width: 64 }), headerCell('점검결과', { width: 30 })]),
        ...DEFAULT_ITEMS.map((item, i) => row([
          dataCell(String(i + 1), { align: AlignmentType.CENTER }),
          dataCell(item),
          dataCell('적합', { align: AlignmentType.CENTER }),
        ])),
      ],
    }),
    emptyLine(),
  ];
}

registerSection('checklist', buildChecklist);
export { buildChecklist };
```

```typescript
// app/src/lib/loan-engine/sections/common/tbd-summary.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, headerCell, dataCell, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildTBDSummary(data: LoanApplication): SectionContent | null {
  if (data.unresolvedItems.length === 0) return null;
  return [
    emptyLine(),
    sectionTitle('확인필요 / TBD 항목 목록'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([headerCell('No.'), headerCell('섹션'), headerCell('항목'), headerCell('상태')]),
        ...data.unresolvedItems.map(item => row([
          dataCell(String(item.no), { align: AlignmentType.CENTER }),
          dataCell(item.section),
          dataCell(item.item),
          dataCell(item.status),
        ])),
      ],
    }),
  ];
}

registerSection('tbd-summary', buildTBDSummary);
export { buildTBDSummary };
```

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/loan-engine/sections/common/
git commit -m "feat(loan-engine): common section builders part 2 (conditions → tbd-summary)"
```

---

## Task 7: Equity pledge plugin

**Files:**
- Create: `app/src/lib/loan-engine/sections/plugins/equity-pledge.ts`

Port from `buildEquityPledgeAnalysis()` (generate-docx.mjs:332-391) + supplement sections.

- [ ] **Step 1: Write equity-pledge.ts plugin**

```typescript
// app/src/lib/loan-engine/sections/plugins/equity-pledge.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, EquityPledgeData } from '../../types.js';
import {
  sectionTitle, subTitle, unitLabel, bodyText, tbdText, headerCell, dataCell,
  emptyLine, row, fmt, pageBreak,
} from '../helpers.js';
import { registerSection } from '../registry.js';
import { renderStatements } from '../common/obligor.js';

function buildEquityPledge(data: LoanApplication): SectionContent | null {
  if (data.typeSpecific.type !== 'equity-pledge') return null;
  const ep = data.typeSpecific.data;
  const content: SectionContent = [
    sectionTitle('담보분석 (지분담보)'),
    emptyLine(),
  ];

  // 1. Pledged equity details
  content.push(subTitle('1. 담보지분 내역'), unitLabel('(단위:백만원)'));
  const eqRows = [
    row([headerCell('대상회사'), headerCell('보유자'), headerCell('주식종류'),
         headerCell('주식수'), headerCell('지분율'), headerCell('평가금액'), headerCell('비고')]),
    ...ep.pledgedEquities.map(eq => row([
      dataCell(eq.targetCompany), dataCell(eq.holder), dataCell(eq.stockType),
      dataCell(`${fmt(eq.shares)}주`, { align: AlignmentType.RIGHT }),
      dataCell(`${eq.ownershipPct.toFixed(2)}%`, { align: AlignmentType.CENTER }),
      dataCell(typeof eq.valuationAmount === 'number' ? fmt(eq.valuationAmount) : String(eq.valuationAmount || '[TBD]')),
      dataCell(eq.note || ''),
    ])),
  ];
  content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: eqRows }), emptyLine());

  // 2. Valuation status
  content.push(subTitle('2. 지분평가 현황'));
  if (ep.valuationStatus?.length) {
    for (const v of ep.valuationStatus) {
      content.push(bodyText(`(${v.method})`));
      const valRows = [
        row([headerCell('항목'), headerCell('금액(백만원)')]),
        ...v.items.map(i => row([
          dataCell(String(i.label), { bold: String(i.label).includes('Equity Value') }),
          dataCell(String(i.value), { align: AlignmentType.RIGHT, bold: String(i.label).includes('Equity Value') }),
        ])),
      ];
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: valRows }), emptyLine());
    }
  } else {
    content.push(tbdText('[TBD: 지분평가서 수령 후 반영 예정]'), emptyLine());
  }

  // 3. Collateral value / LTV
  content.push(subTitle('3. 담보가치 산출'));
  if (ep.collateralValue) {
    const cv = ep.collateralValue;
    content.push(
      bodyText(`${cv.valuationBasis} 기준 LTV = ${fmt(data.loanTerms.amount)} / ${fmt(cv.valuationAmount)} = ${cv.ltv.toFixed(1)}%`),
    );
    if (cv.note) content.push(bodyText(cv.note));
  } else {
    content.push(tbdText('[TBD: 평가액 확정 후 산출]'));
  }
  content.push(emptyLine());

  // 4. Unlisted stock valuation (optional)
  if (ep.unlistedValuation) {
    content.push(pageBreak(), subTitle('비상장주식평가 (세법기준)'));
    const uRows = [
      row([headerCell('항목'), headerCell('금액/수치')]),
      ...ep.unlistedValuation.items.map(i => row([
        dataCell(String(i.label), { bold: String(i.label).includes('Value') || String(i.label).includes('주당') }),
        dataCell(String(i.value), { align: AlignmentType.RIGHT }),
      ])),
    ];
    content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: uRows }), emptyLine());
  }

  // 5. Guarantor income (optional)
  if (ep.guarantorIncome) {
    content.push(subTitle(`보증인 소득분석 (${ep.guarantorIncome.name})`));
    const gRows = [
      row([headerCell('항목'), headerCell('내용')]),
      ...ep.guarantorIncome.items.map(i => row([dataCell(i.label), dataCell(i.value)])),
    ];
    content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: gRows }), emptyLine());
  }

  // 6. Consolidated financials (optional)
  if (ep.consolidatedFinancials) {
    content.push(pageBreak(), subTitle('연결재무제표'));
    content.push(...renderStatements('', ep.consolidatedFinancials));
  }

  // 7. Cash flow (optional)
  if (ep.cashFlow) {
    content.push(pageBreak(), sectionTitle('영업현금흐름 분석'), emptyLine());
    for (const entity of ep.cashFlow.entities) {
      content.push(subTitle(entity.name), unitLabel(`(단위:백만원 / 출처: ${entity.source})`));
      const cfRows = [
        row([headerCell('항목', { width: 25 }), ...entity.quarters.map(q => headerCell(q)), headerCell('연간합계')]),
        ...entity.items.map(item => row([
          dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.label}` : item.label, { bold: item.bold }),
          ...item.values.map(v => dataCell(String(v), { align: AlignmentType.RIGHT, bold: item.bold })),
          dataCell(String(item.annual ?? '-'), { align: AlignmentType.RIGHT, bold: item.bold }),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: cfRows }), emptyLine());
    }
    if (ep.cashFlow.consolidatedMetrics?.length) {
      content.push(subTitle('합산 연간 핵심 지표'));
      const mRows = [
        row([headerCell('지표'), headerCell('수치'), headerCell('비고')]),
        ...ep.cashFlow.consolidatedMetrics.map(m => row([
          dataCell(m.label), dataCell(m.value), dataCell(m.note || ''),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: mRows }), emptyLine());
    }
  }

  // 8. Provisioning rates (optional)
  if (ep.provisioningRates) {
    content.push(subTitle('대손충당금 설정률'));
    const pr = ep.provisioningRates;
    const prRows = [
      row([headerCell('구분'), ...pr.years.map(y => headerCell(y))]),
      ...pr.items.map(item => row([
        dataCell(item.category),
        ...pr.years.map(y => dataCell(String(item.values[y] ?? '-'), { align: AlignmentType.RIGHT })),
      ])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: prRows }), emptyLine());
  }

  return content;
}

registerSection('plugin:equity-pledge', buildEquityPledge);
export { buildEquityPledge };
```

- [ ] **Step 2: Commit**

```bash
git add app/src/lib/loan-engine/sections/plugins/equity-pledge.ts
git commit -m "feat(loan-engine): equity-pledge plugin (pledged equity, valuation, LTV, cash flow)"
```

---

## Task 8: Generator pipeline + index.ts

**Files:**
- Create: `app/src/lib/loan-engine/generator.ts`
- Create: `app/src/lib/loan-engine/index.ts`

- [ ] **Step 1: Write generator.ts**

```typescript
// app/src/lib/loan-engine/generator.ts
import { Document, Packer, Paragraph, convertInchesToTwip } from 'docx';
import type { LoanApplication, LoanTypeProfile, SectionContent } from './types.js';
import { getSection } from './sections/registry.js';
import { pageBreak } from './sections/helpers.js';

// Import all section builders to trigger registration
import './sections/common/header.js';
import './sections/common/overview.js';
import './sections/common/basic-terms.js';
import './sections/common/syndicate.js';
import './sections/common/funding.js';
import './sections/common/conditions-security.js';
import './sections/common/interest-rate.js';
import './sections/common/structure.js';
import './sections/common/opinion.js';
import './sections/common/obligor.js';
import './sections/common/borrowings.js';
import './sections/common/financial-opinion.js';
import './sections/common/risk-analysis.js';
import './sections/common/checklist.js';
import './sections/common/tbd-summary.js';
import './sections/plugins/equity-pledge.js';

export interface GenerateOptions {
  profile: LoanTypeProfile;
}

export async function generateDocx(
  data: LoanApplication,
  options: GenerateOptions,
): Promise<Buffer> {
  const { profile } = options;
  const allChildren: SectionContent = [];

  for (const sectionId of profile.sectionOrder) {
    if (sectionId === 'PAGE_BREAK') {
      allChildren.push(pageBreak());
      continue;
    }

    const builder = getSection(sectionId);
    if (!builder) {
      console.warn(`[loan-engine] No builder registered for section: ${sectionId}`);
      continue;
    }

    const result = builder(data);
    if (result !== null) {
      allChildren.push(...result);
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: '맑은 고딕', size: 18 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.59),
            bottom: convertInchesToTwip(0.59),
            left: convertInchesToTwip(0.59),
            right: convertInchesToTwip(0.59),
          },
        },
      },
      children: allChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
```

- [ ] **Step 2: Write index.ts**

```typescript
// app/src/lib/loan-engine/index.ts
export { generateDocx } from './generator.js';
export type {
  LoanApplication, LoanType, LoanTypeProfile,
  SectionId, SectionBuilder, SectionContent,
  TypeSpecificData, EquityPledgeData,
  ApplicationMeta, BorrowerInfo, LoanTerms, FundingPlan,
  CollateralSecurityItem, LoanConditions, SyndicateInfo,
  InterestRateBreakdown, FinancialStatements, RelatedEntityFinancials,
  BorrowingDetail, UnresolvedItem,
} from './types.js';

// Profile exports
export { equityPledgeProfile } from './profiles/equity-pledge.js';
```

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/loan-engine/generator.ts app/src/lib/loan-engine/index.ts
git commit -m "feat(loan-engine): generator pipeline + public API index"
```

---

## Task 9: Techmate full JSON data file

**Files:**
- Create: `docx-generator/01_입력데이터/techmate-full.json`

Extract ALL hardcoded data from generate-docx.mjs + sections-supplement.mjs into a single comprehensive JSON file that conforms to the `LoanApplication` type.

- [ ] **Step 1: Write techmate-full.json**

This is the largest task — all 1300 lines of hardcoded data must be captured as structured JSON. The file will be ~800-1000 lines. Key sections to extract:

- `meta` — from 기본조건_입력.json + hardcoded dates
- `borrower` — from `buildBorrowerInfo()` lines 419-539
- `loanTerms` — from `buildBasicConditions()` lines 171-267
- `funding` — from cashIn/cashOut + 매입예정채권 자금조달
- `collateralSecurity` — from `buildCollateralPreservation()` lines 269-286
- `interestRate` — TBD markers from 기본조건_입력.json
- `financials.borrower` — from BS/IS tables in `buildBorrowerInfo()`
- `financials.subsidiaries[0]` (유미캐피탈) — from `buildYoumeCapitalSection()`
- `financials.relatedCompanies` (테크메이트홀딩스, 소버린JL) — from supplement sections
- `borrowings[0]` (테크메이트) — from `buildTechmateBorrowings()`
- `borrowings[1]` (유미캐피탈) — from `buildYoumeBorrowings()`
- `typeSpecific` (equity-pledge) — from `buildEquityPledgeAnalysis()` + supplement
- `unresolvedItems` — from `buildTBDSummary()`

Due to the size of this file, the implementing agent should read the hardcoded values directly from generate-docx.mjs and sections-supplement.mjs and transcribe them faithfully into JSON. Every number, every string, must match the existing DOCX output.

- [ ] **Step 2: Validate JSON is parseable**

```bash
cd docx-generator && node -e "const d = require('./01_입력데이터/techmate-full.json'); console.log('OK, keys:', Object.keys(d).join(', '))"
```

Expected: `OK, keys: meta, borrower, loanTerms, funding, collateralSecurity, ...`

- [ ] **Step 3: Commit**

```bash
git add "docx-generator/01_입력데이터/techmate-full.json"
git commit -m "feat(loan-engine): comprehensive Techmate Korea data JSON (from hardcoded generator)"
```

---

## Task 10: CLI entry point + end-to-end test

**Files:**
- Create: `docx-generator/cli.ts`

- [ ] **Step 1: Write cli.ts**

```typescript
// docx-generator/cli.ts
import fs from 'fs';
import path from 'path';
import { generateDocx, equityPledgeProfile } from '../app/src/lib/loan-engine/index.js';
import type { LoanApplication } from '../app/src/lib/loan-engine/types.js';

const inputPath = path.resolve(__dirname, '01_입력데이터/techmate-full.json');
const outputDir = path.resolve(__dirname, '02_초안출력');

async function main() {
  console.log('Reading input:', inputPath);
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const data: LoanApplication = JSON.parse(raw);

  console.log(`Generating DOCX for: ${data.borrower.name} (${data.typeSpecific.type})`);

  const profile = equityPledgeProfile; // TODO: auto-detect from data.loanTerms.loanType
  const buffer = await generateDocx(data, { profile });

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${data.borrower.name}_${today}_초안_v2.docx`;
  const outputPath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, buffer);

  console.log(`\n✅ 초안 생성 완료: ${outputPath}`);
  console.log(`   파일 크기: ${(buffer.length / 1024).toFixed(1)} KB`);

  if (data.unresolvedItems.length > 0) {
    console.log(`\n⚠️ 확인 필요 항목 (${data.unresolvedItems.length}건):`);
    data.unresolvedItems.forEach(item => {
      console.log(`  ${item.no}. [${item.section}] ${item.item} — ${item.status}`);
    });
  }

  console.log('\n📋 다음 단계: 한글(HWP)에서 열어 hwp로 변환 저장');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run end-to-end test**

```bash
cd docx-generator && npx tsx cli.ts
```

Expected:
```
Reading input: .../01_입력데이터/techmate-full.json
Generating DOCX for: 테크메이트코리아대부(주) (equity-pledge)
✅ 초안 생성 완료: .../02_초안출력/테크메이트코리아대부(주)_2026-03-30_초안_v2.docx
```

- [ ] **Step 3: Manually compare v2 DOCX with original generate-docx.mjs output**

Open both DOCX files in Word/한글 and verify:
1. All sections present in same order
2. All tables have same data
3. Styling matches (font, size, colors, alignment)
4. [TBD] markers are blue, all present

- [ ] **Step 4: Fix any discrepancies found in comparison**

- [ ] **Step 5: Commit**

```bash
git add docx-generator/cli.ts
git commit -m "feat(loan-engine): CLI entry point + end-to-end Techmate DOCX generation"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `npx tsx docx-generator/cli.ts` generates DOCX without errors
- [ ] Generated DOCX opens correctly in Microsoft Word / 한글
- [ ] All 19 section types from the spec are represented in the registry
- [ ] Equity pledge profile produces correct section ordering
- [ ] All Techmate data from the original hardcoded generator is captured in JSON
- [ ] [TBD] markers appear in blue, no data is lost
- [ ] `app/` still builds successfully: `cd app && npm run build`
