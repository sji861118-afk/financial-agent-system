<!-- STATUS: ACTIVE — app/src/lib/docx-v5/ 구현 진행 중 -->

# v5 DOCX 생성 파이프라인 통합 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업로드 파일 → 데이터 분석 → v5 품질 DOCX 자동 생성을 하나의 파이프라인으로 통합

**Architecture:** v5 하드코딩 스크립트(gen-techmate-v5.mjs 738줄)를 **데이터 기반 템플릿 엔진**으로 전환. `ParsedFileData` → `DealDataset` (중간 모델) → v5 DOCX. 기존 loan-engine은 유지하되, v5 생성기는 별도 모듈로 추가.

**Tech Stack:** TypeScript, docx-js, ExcelJS, pdf-parse, Next.js API Route

---

## 핵심 설계 결정

### 왜 기존 loan-engine이 아닌 별도 생성기인가

기존 loan-engine(sections/registry 패턴)은 **테이블 위주 자동 생성**에 최적화됨. v4/v5가 요구하는 **서술형 분석 코멘트**(NIM 분석, 외화사채 리스크, 가치산정 타당성 검토 등)를 섹션 빌더로 만들면 빌더 함수가 500줄+ 되면서 유지보수 불가.

**v5 생성기**: 구조화된 데이터(DealDataset) → 전문가 수준 서술을 섹션별 함수로 생성. 각 함수는 데이터를 받아서 docx-js Paragraph/Table 배열 반환.

### 파일 구조

```
app/src/lib/docx-v5/
├── types.ts              # DealDataset 중간 모델 (파서→생성기 인터페이스)
├── builder.ts            # docx-js 헬퍼 (t, p, cell, headerCell, makeTable 등)
├── generator.ts          # 메인 진입점: generateV5Docx(data: DealDataset) → Buffer
├── sections/
│   ├── title.ts          # 헤더 + 신청개요
│   ├── basic-terms.ts    # 기본조건 + 자금용도
│   ├── security.ts       # 채권보전 + 여신조건
│   ├── opinion.ts        # 검토의견 (6개 □ 단락)
│   ├── collateral.ts     # 담보분석 + 지분평가 + 담보가치
│   ├── valuation.ts      # 가치산정 상세 (Ke, FCFE, Sensitivity, Peer)
│   ├── analysis.ts       # 재무분석 코멘트 (6개 ▶ 섹션)
│   ├── obligor.ts        # 채무관련인 (차주 + 유미캐피탈)
│   ├── cashflow.ts       # 현금흐름 + 충당금 + 보증인
│   └── risk.ts           # 이자상환 + 리스크 + 체크리스트
├── data-assembler.ts     # ParsedFileData + DART → DealDataset 조립
└── comment-generator.ts  # 서술형 분석 코멘트 자동 생성 (룰기반)
```

---

## Task 1: DealDataset 타입 정의

**Files:**
- Create: `app/src/lib/docx-v5/types.ts`

- [ ] **Step 1: 타입 정의 작성**

DealDataset은 파서 출력(ParsedFileData)과 DART 데이터를 통합한 중간 모델. v5 생성기의 유일한 입력.

```typescript
// 핵심 타입만 (상세는 구현 시 확장)
export interface DealDataset {
  deal: DealOverview;
  borrower: BorrowerProfile;
  subsidiary: SubsidiaryProfile | null;  // 유미캐피탈
  valuation: ValuationDataset | null;    // 삼일PwC
  financials: FinancialsDataset;
  borrowings: BorrowingsDataset;
  cashflow: CashflowDataset | null;
  provisions: ProvisionDataset | null;
  guarantor: GuarantorDataset | null;
  opinion: OpinionDataset;
  risks: RiskDataset;
}

export interface DealOverview {
  borrowerName: string;        // "테크메이트코리아대부(주)"
  totalAmount: number;         // 30000 (백만원)
  purpose: string;
  repaymentSource: string;
  duration: number;            // 24 (개월)
  collateralType: string;
  tranches: TrancheInfo[];
  securityItems: string[];
  conditions: ConditionSet;
}
// ... 각 서브타입 상세
```

- [ ] **Step 2: 커밋**

---

## Task 2: DOCX 빌더 헬퍼 추출

**Files:**
- Create: `app/src/lib/docx-v5/builder.ts`
- Reference: `app/gen-techmate-v5.mjs` lines 9-115

- [ ] **Step 1: gen-techmate-v5.mjs의 헬퍼 함수를 TypeScript로 이식**

`t()`, `p()`, `cell()`, `headerCell()`, `makeTable()`, `sectionTitle()`, `subTitle()`, `bullet()`, `kvRow()`, `kvTable()`, `dataRow()`, `headerRow()`, `pageBreak()`, `emptyP()` — 14개 함수.

동일 로직 유지, TypeScript 타입만 추가.

- [ ] **Step 2: 커밋**

---

## Task 3: 섹션별 생성 함수 구현 (10개 파일)

**Files:**
- Create: `app/src/lib/docx-v5/sections/title.ts` ~ `risk.ts`
- Reference: `app/gen-techmate-v5.mjs` lines 116-695 (각 섹션 변수)

각 섹션 함수는 `(data: DealDataset) => (Paragraph | Table)[]` 시그니처.

- [ ] **Step 1: title.ts** — 헤더, 결재란, 차주명, 신청개요, 핵심 재무지표
- [ ] **Step 2: basic-terms.ts** — 트랜치 테이블, KV 조건, 자금용도, 매입예정채권
- [ ] **Step 3: security.ts** — 채권보전 6항목, 선행/후행조건, 여신조건, 기한이익상실
- [ ] **Step 4: opinion.ts** — 6개 □ 단락 (딜 개요, 차주 설명, 가치산정 결과, 이자상환, 리스크, 결론)
- [ ] **Step 5: collateral.ts** — 담보지분 내역, 지분평가, 담보가치/LTV
- [ ] **Step 6: valuation.ts** — Valuation Summary, 할인율, Peer Group, TM FCFE, YM FCFE, 민감도 2개
- [ ] **Step 7: analysis.ts** — ▶①수익성 ▶②건전성 ▶③자본구조 ▶④조달구조 ▶⑤성장성 ▶⑥종합리스크
- [ ] **Step 8: obligor.ts** — 차주 기본정보, 주주구성, BS/IS 테이블, 영업현황, 차입금 상세, 연결재무, 유미캐피탈 전체
- [ ] **Step 9: cashflow.ts** — 분기별 현금흐름(TM+YM), 합산지표, 충당금 설정률
- [ ] **Step 10: risk.ts** — 금리산출, 이자납입분석, 원금상환분석, 리스크 5항목, 체크리스트, TBD

v5 스크립트에서 하드코딩된 숫자를 `data.xxx`로 대체하는 것이 핵심.

- [ ] **Step 11: 커밋**

---

## Task 4: 서술형 코멘트 자동 생성기

**Files:**
- Create: `app/src/lib/docx-v5/comment-generator.ts`

이 모듈이 **v4 품질의 핵심**. 파싱된 수치를 기반으로 전문가 수준 서술을 생성.

- [ ] **Step 1: 검토의견 생성 함수**

```typescript
export function generateOpinionParagraphs(data: DealDataset): string[] {
  // 6개 □ 단락 각각을 문자열로 생성
  // data.deal, data.valuation, data.financials 등에서 수치 추출
  // v4 패턴: "본건은 {차주명}(이하 "차주")가 {목적}을 위하여..."
}
```

- [ ] **Step 2: 재무분석 6개 섹션 생성 함수**

```typescript
export function generateFinancialAnalysis(data: DealDataset): AnalysisSection[] {
  return [
    generateProfitabilityAnalysis(data),   // ▶① NIM, 관리기준 vs DART
    generateAssetQualityAnalysis(data),     // ▶② 대손상각비, 연체율, 충당금
    generateCapitalStructureAnalysis(data), // ▶③ 부채비율, 레버리지
    generateFundingAnalysis(data),          // ▶④ 조달 포트폴리오, 외화사채
    generateGrowthAnalysis(data),           // ▶⑤ 대출채권, 실적 vs 추정
    generateComprehensiveRisk(data),        // ▶⑥ 담보견고성, 이자상환
  ];
}
```

각 함수는 data에서 수치를 추출하고, v4 패턴의 bullet point 텍스트를 생성.
예: NIM = (이자수익/평균잔액) - (이자비용/평균차입금) → "NIM(스프레드): 약 5.95%p → 충분한 마진 유지"

- [ ] **Step 3: 리스크 분석 5항목 생성 함수**

- [ ] **Step 4: 커밋**

---

## Task 5: 데이터 조립기 (ParsedFileData + DART → DealDataset)

**Files:**
- Create: `app/src/lib/docx-v5/data-assembler.ts`
- Reference: `app/src/lib/uploaded-file-parser.ts` (입력)

- [ ] **Step 1: assembleDealDataset 함수 구현**

```typescript
export function assembleDealDataset(
  parsed: ParsedFileData,
  dartResult: DartResultForDocx,
  borrowerName: string,
  memo: string,
): DealDataset
```

ParsedFileData의 각 필드를 DealDataset으로 매핑. DART 데이터로 보강. 누락 데이터는 합리적 기본값.

- [ ] **Step 2: 커밋**

---

## Task 6: 메인 생성기 조립

**Files:**
- Create: `app/src/lib/docx-v5/generator.ts`

- [ ] **Step 1: generateV5Docx 구현**

```typescript
export async function generateV5Docx(data: DealDataset): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: '맑은 고딕', size: 18 } } } },
    sections: [{
      properties: { page: { margin: { ... }, size: A4 } },
      headers: { default: ... },
      footers: { default: ... },
      children: [
        ...buildTitle(data),
        ...buildBasicTerms(data),
        ...buildSecurity(data),
        ...buildOpinion(data),
        ...buildCollateral(data),
        ...buildValuation(data),
        ...buildAnalysis(data),
        ...buildObligor(data),
        ...buildCashflow(data),
        ...buildRisk(data),
      ],
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
```

- [ ] **Step 2: 커밋**

---

## Task 7: API Route 통합

**Files:**
- Modify: `app/src/app/api/review/upload-and-generate/route.ts`

- [ ] **Step 1: v5 생성기 연결**

기존 `generateDocx(app, { profile })` 대신 `generateV5Docx(dataset)` 호출.

```typescript
import { assembleDealDataset } from '@/lib/docx-v5/data-assembler';
import { generateV5Docx } from '@/lib/docx-v5/generator';

// 기존 코드 유지 (DART 조회, 파일 파싱)
const parsedFiles = await parseUploadedFiles(extractedTexts);
const dataset = assembleDealDataset(parsedFiles, dartResult, borrowerName, memo);
const buffer = await generateV5Docx(dataset);
```

- [ ] **Step 2: 커밋**

---

## Task 8: E2E 테스트

**Files:**
- Create: `app/test-v5-pipeline.mjs`

- [ ] **Step 1: 테크메이트 실데이터 E2E 테스트**

실제 파일 31개를 API에 업로드 → DOCX 생성 → v4 대비 검증 (텍스트, 테이블 수, 핵심 데이터 34항목)

- [ ] **Step 2: 품질 검증 스크립트**

생성된 DOCX에서 34개 핵심 항목 자동 체크.

- [ ] **Step 3: 커밋**

---

## Task 9: 파서 정밀화

**Files:**
- Modify: `app/src/lib/uploaded-file-parser.ts`

현재 파서가 가치산정 Excel에서 FCFE 데이터를 제대로 추출 못하는 문제 수정. ExcelJS로 직접 시트별 읽기 전환 (텍스트 변환 대신).

- [ ] **Step 1: ExcelJS 직접 파싱 모드 추가**

`parseUploadedFiles`에 `buffer` 파라미터가 있는 파일은 ExcelJS로 직접 읽기.

- [ ] **Step 2: 가치산정 Excel 전용 파서**

p13_할인율, p17, p36_TM_FCFE, p39_Valuation, p55_YM_FCFE, p56_YM_Equity, p37 시트를 정확히 파싱.

- [ ] **Step 3: 커밋**

---

## 품질 향상 방향

### 현재 v5 → 목표 v6 개선점

1. **서술형 코멘트 품질**: comment-generator에서 v4 수준의 자연스러운 한국어 서술 생성. 현재는 룰기반, 향후 LLM 호출로 고도화 가능.

2. **파서 정밀도**: Excel 시트를 텍스트 변환 없이 ExcelJS로 직접 읽어 셀 단위 정확도 확보.

3. **동적 섹션**: 대출유형(지분담보/미분양/PF브릿지)에 따라 섹션 자동 선택.

4. **서식 완성도**: v4 대비 부족한 테이블 서식(셀 병합, 들여쓰기, 음영 등) 보완.

5. **메모 → 검토의견 반영**: 사용자 메모의 핵심 정보를 검토의견에 자동 통합.
