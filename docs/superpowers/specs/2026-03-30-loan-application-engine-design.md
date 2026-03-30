# 여신승인신청서 생성 엔진 설계서

> 작성일: 2026-03-30
> 상태: 확정
> 목적: 범용 여신승인신청서 DOCX 생성 엔진 구현 참조

---

## 1. 개요

### 배경
OK저축은행 기업금융본부 담당자가 여신승인신청서를 작성하는 데 건당 수시간~수일 소요.
Phase 0에서 테크메이트코리아대부 지분담보대출 건을 하드코딩 방식으로 생성(`docx-generator/generate-docx.mjs`)하였으나,
범용 엔진으로 전환하여 모든 대출 유형을 지원하는 시스템을 구축한다.

### 아키텍처 결정: 하이브리드 (접근법 C)

- **핵심 엔진**: `app/src/lib/loan-engine/` — 데이터 모델, 파서, 섹션 빌더, AI 연동 일체
- **Track A (로컬 CLI)**: `docx-generator/cli.mjs` — 엔진을 import하는 얇은 CLI 래퍼
- **Track B (웹 서비스)**: `app/` Next.js API route에서 엔진 직접 호출

양 트랙이 동일한 엔진 코드를 공유하여 코드 중복 없이 운영.

### 입출력 정의

| 항목 | 내용 |
|------|------|
| **입력 1** | `기본조건_입력.json` — 대출 기본조건 + 유형별 데이터 |
| **입력 2** | `재무현황_*.xlsx` — ok-cf1에서 추출한 재무현황 (복수 파일 가능) |
| **입력 3** | 추가자료 PDF — 회계실사보고서, IM, 감정평가서, 지분평가서 등 (선택) |
| **출력** | `{차주명}_{작성일}_초안.docx` + `UnresolvedItem[]` 미확인 항목 목록 |

---

## 2. 데이터 모델

### 최상위 모델: LoanApplication

```typescript
interface LoanApplication {
  meta: ApplicationMeta;
  borrower: BorrowerInfo;
  loanTerms: LoanTerms;
  funding: FundingPlan;
  collateralSecurity: CollateralSecurity[];
  loanConditions: LoanConditions;
  syndicate?: SyndicateInfo;       // 트랜치별 조건 포함 (금리/담보비율/참여기관)
  interestRate: InterestRateBreakdown;

  financials: {
    borrower: FinancialStatements;
    subsidiaries?: RelatedEntityFinancials[];   // detailLevel 포함
    relatedCompanies?: RelatedEntityFinancials[];
  };
  borrowings: BorrowingDetail[];

  typeSpecific: EquityPledgeData | PFBridgeData | UnsoldCollateralData
    | PrivateBondData | ConstructionFinanceData;

  aiContent: {
    opinion?: string;
    financialAnalysis?: string;
    riskAnalysis?: string;
  };

  unresolvedItems: UnresolvedItem[];
}

/** 관련사/자회사 재무 — 데이터 깊이에 따라 렌더링 수준 결정 */
interface RelatedEntityFinancials {
  entity: EntityInfo;              // 기본정보 (회사명, 대표, 설립일 등)
  detailLevel: 'full' | 'summary' | 'minimal';
  // full: BS/IS 전체 (유미캐피탈 수준)
  // summary: 간략재무 1줄 (자산/부채/자본/매출/순이익) — PF 이자자금보충인 등
  // minimal: 기본정보만 (소버린JL 수준)
  statements?: FinancialStatements;  // full일 때
  summaryRow?: FinancialSummaryRow;  // summary일 때
}

/** 대주단 — 트랜치별 조건 차이 지원 */
interface SyndicateInfo {
  totalAmount: number;
  tranches: TrancheInfo[];
}
interface TrancheInfo {
  name: string;            // "Tr.A", "Tr.B" 등
  amount: number;
  rate?: number;
  participants: { name: string; amount: number; role?: string }[];
  conditions?: string[];   // 트랜치별 특수조건
}
```

### 유형별 데이터

| 유형 | 타입명 | 핵심 필드 |
|------|--------|----------|
| 지분담보 | `EquityPledgeData` | 담보지분내역, 지분평가, LTV, 보증인소득, 비상장주식평가 |
| PF브릿지 | `PFBridgeData` | 사업개요, 토지조서, 트리거조항, 이자자금보충인[], 에쿼티비율, 금융구조도 |
| 미분양담보 | `UnsoldCollateralData` | 담보현황(감정가/LTV/인정비율), 분양현황, 민감도분석, 회수예상가, 입주현황 |
| 사모사채 | `PrivateBondData` | Term표, 업권비교(NCR등), 신용등급, 발행실적 |
| 공사비유동화 | `ConstructionFinanceData` | 공사진척, 기성검수, 분양률, 자금집행계획 |

### 데이터 처리 원칙

- **있으면 렌더링, 없으면 생략**: 필드가 존재하되 값이 미정이면 `[TBD]` 마커, 섹션 자체가 해당 유형에 불필요하면 생략
- **[TBD]**: 파란색(#0000FF) — 미수령/미확정 데이터
- **[확인필요]**: 빨간색(#FF0000) — 데이터 불일치 또는 검증 필요
- 모든 [TBD]/[확인필요]는 `unresolvedItems`에 자동 수집

---

## 3. 신청서 섹션 구조

### 3.1 유형별 섹션 순서 프로필 (LoanTypeProfile)

> **설계 결정**: 샘플 분석 결과, 유형마다 섹션 순서와 포함 여부가 상이함.
> 공통 섹션의 고정 번호 대신 **유형별 프로필이 섹션 조립 순서를 정의**하는 구조를 채택.

```typescript
/** 유형별로 섹션 조립 순서를 정의 */
interface LoanTypeProfile {
  type: LoanType;
  sectionOrder: SectionId[];   // 이 순서대로 빌더를 호출
  conditionsAndSecurity: 'merged' | 'separate';  // 여신조건+채권보전 합칠지 여부
}

// 예시: 지분담보
const equityPledgeProfile: LoanTypeProfile = {
  type: 'equity-pledge',
  sectionOrder: [
    'header', 'overview', 'basic-terms', 'syndicate?', 'funding',
    'conditions-security',     // 합침
    'interest-rate', 'structure?',
    'opinion',                 // 종합의견 (앞쪽 배치)
    'PAGE_BREAK',
    'plugin:equity-pledge',    // 유형별 플러그인
    'PAGE_BREAK',
    'obligor-borrower', 'borrowings', 'obligor-related*',
    'financial-opinion?', 'risk-analysis?',
    'checklist', 'tbd-summary',
  ],
  conditionsAndSecurity: 'merged',
};

// 예시: PF브릿지 — 종합의견이 담보현황/소요자금 뒤
const pfBridgeProfile: LoanTypeProfile = {
  type: 'pf-bridge',
  sectionOrder: [
    'header', 'overview', 'basic-terms', 'syndicate',
    'conditions-security',
    'interest-rate', 'structure',
    'plugin:collateral',       // 담보현황 (PF 전용)
    'plugin:funding-plan',     // 소요자금 조달·지출 (PF 전용)
    'opinion',                 // 종합의견 (뒤쪽 배치)
    'PAGE_BREAK',
    'obligor-borrower', 'borrowings',
    'plugin:trigger', 'plugin:interest-reserve',  // PF 전용
    'obligor-related*',
    'financial-opinion?', 'risk-analysis?',
    'checklist', 'tbd-summary',
  ],
  conditionsAndSecurity: 'merged',
};

// '?' 접미사 = 데이터 있을 때만, '*' 접미사 = 반복 (관련사 수만큼)
```

### 3.2 사용 가능한 섹션 빌더 전체 목록

**공통 (모든 유형에서 사용 가능):**

| SectionId | 섹션 | 데이터 소스 |
|-----------|------|------------|
| `header` | 결재란 + 제목 | meta |
| `overview` | 신청개요 | loanTerms + borrower |
| `basic-terms` | 기본조건 | loanTerms |
| `syndicate` | 대주단 구성 | syndicate (트랜치별) |
| `funding` | 자금용도(안) | funding |
| `funding-plan` | 소요자금 조달·지출계획 | funding (확장) |
| `conditions-security` | 여신조건 + 채권보전 (통합) | loanConditions + collateralSecurity |
| `conditions` | 여신조건 상세 (분리) | loanConditions |
| `security` | 채권보전사항 (분리) | collateralSecurity |
| `interest-rate` | 금리산출 및 적용 | interestRate |
| `structure` | 금융구조도 | typeSpecific or 별도 |
| `opinion` | **종합의견** (AI) | aiContent.opinion |
| `obligor-borrower` | 채무관련인 — 차주 | borrower + financials |
| `borrowings` | 차입금 현황 | borrowings |
| `obligor-related` | 채무관련인 — 자회사/관련사 (반복) | financials.subsidiaries/related |
| `financial-opinion` | **재무분석 소견** (AI) | aiContent.financialAnalysis |
| `risk-analysis` | **리스크 분석** (AI) | aiContent.riskAnalysis |
| `checklist` | 자체점검 체크리스트 | 고정 8항목 |
| `tbd-summary` | [TBD]/[확인필요] 항목 목록 | unresolvedItems |

**유형별 플러그인:**

| SectionId | 유형 | 내용 |
|-----------|------|------|
| `plugin:equity-pledge` | 지분담보 | 담보지분+지분평가+LTV+비상장평가+보증인소득 |
| `plugin:collateral` | PF/미분양 | 담보현황 (감정가/LTV/인정비율) |
| `plugin:land-registry` | PF | 토지조서 |
| `plugin:trigger` | PF | 트리거조항 |
| `plugin:interest-reserve` | PF | 이자자금보충인 현황 (반복) |
| `plugin:equity-ratio` | PF | 에쿼티비율 산정 |
| `plugin:sales-status` | 미분양 | 분양현황 + 입주현황 |
| `plugin:sensitivity` | 미분양 | 민감도분석 |
| `plugin:recovery` | 미분양 | 회수예상가 |
| `plugin:term-sheet` | 사모사채 | Term표 |
| `plugin:industry-compare` | 사모사채 | 업권비교 (NCR 등) |
| `plugin:credit-rating` | 사모사채 | 신용등급 |
| `plugin:issuance-history` | 사모사채 | 발행실적 |
| `plugin:construction` | 공사비 | 공사진척+기성검수+자금집행 |

### 3.3 유형별 플러그인 섹션 상세

**지분담보 (EquityPledge):**
1. 담보지분 내역 (대상회사/보유자/주식수/지분율/평가금액)
2. 지분평가 현황 (DCF 등 평가방법론 + 결과)
3. 담보가치 산출 (LTV)
4. 비상장주식평가 — 세법기준 (데이터 있을 때만)
5. 보증인 소득분석 (데이터 있을 때만)

**PF브릿지 (PFBridge):**
1. 사업개요
2. 담보현황 (토지감정/LTV/담보인정비율/감정서심사)
3. 토지조서
4. 트리거조항
5. 이자자금보충인 현황 (각 보충인 기본정보 + 간략재무 — detailLevel: summary)
6. 에쿼티비율 산정

**미분양담보 (UnsoldCollateral):**
1. 담보현황 (감정가/LTV/담보인정비율)
2. 분양현황 + 입주현황
3. 민감도분석 (분양률별)
4. 회수예상가

**사모사채 (PrivateBond):**
1. Term표
2. 업권비교 (NCR 등)
3. 신용등급 현황
4. 채무증권 발행실적

**공사비유동화 (ConstructionFinance):**
1. 공사진척현황
2. 분양률 / 기성검수
3. 자금집행계획

---

## 4. 엔진 파이프라인

### 처리 흐름

```
입력 수집          파싱/병합           계산            AI 생성          DOCX 조립
─────────────    ──────────────    ──────────    ──────────────    ──────────────
기본조건.json ─┐
재무현황.xlsx ─┤→ Parser들 → 통합 LoanApplication → Calculator → AI(선택) → SectionBuilder[] → DOCX
추가자료.pdf ──┘   (각 파서가        데이터 모델        (LTV,금리,      (종합의견,       (공통+플러그인
                    담당 영역만                         민감도 등)      재무소견,         순서대로 조립)
                    채움)                                              리스크)
```

### 파일 구조

```
app/src/lib/loan-engine/
├── types.ts                    # LoanApplication + 유형별 데이터 모델
├── schema.ts                   # Zod 검증 스키마
├── generator.ts                # 메인 파이프라인 (진입점)
│
├── parsers/
│   ├── json-parser.ts          # 기본조건 JSON → LoanApplication 부분 채움
│   ├── excel-parser.ts         # 재무현황 Excel → financials + borrowings
│   └── pdf-parser.ts           # 회계실사/IM/감정평가서 → typeSpecific 보강
│
├── calculators/
│   ├── interest-rate.ts        # 금리산출 (기준+가산+조정)
│   ├── ltv.ts                  # LTV, 담보가용가
│   ├── sensitivity.ts          # 민감도분석 (미분양담보)
│   └── recovery.ts             # 회수예상가
│
├── ai/
│   ├── client.ts               # Claude API 호출 래퍼
│   ├── prompts/
│   │   ├── opinion.ts          # 종합의견 프롬프트 빌더
│   │   ├── financial-analysis.ts  # 재무분석 소견
│   │   └── risk-analysis.ts    # 리스크 분석
│   └── index.ts
│
├── sections/
│   ├── helpers.ts              # 공통 헬퍼 (headerCell, dataCell, fmt, pct 등)
│   ├── registry.ts             # SectionId → SectionBuilder 매핑 레지스트리
│   ├── common/                 # 공통 섹션 빌더 (번호 없음 — 순서는 LoanTypeProfile이 결정)
│   │   ├── header.ts
│   │   ├── overview.ts
│   │   ├── basic-terms.ts
│   │   ├── syndicate.ts
│   │   ├── funding.ts
│   │   ├── conditions-security.ts  # 통합 or 분리 모드 지원
│   │   ├── interest-rate.ts
│   │   ├── structure.ts
│   │   ├── opinion.ts
│   │   ├── obligor.ts              # detailLevel별 렌더링 분기
│   │   ├── borrowings.ts
│   │   ├── financial-opinion.ts
│   │   ├── risk-analysis.ts
│   │   ├── checklist.ts
│   │   └── tbd-summary.ts
│   └── plugins/                # 유형별 플러그인
│       ├── equity-pledge.ts
│       ├── pf-bridge.ts
│       ├── unsold-collateral.ts
│       ├── private-bond.ts
│       └── construction.ts
│
├── profiles/                   # 유형별 섹션 순서 프로필
│   ├── equity-pledge.ts
│   ├── pf-bridge.ts
│   ├── unsold-collateral.ts
│   ├── private-bond.ts
│   └── construction.ts
│
└── index.ts                    # public API export

docx-generator/
├── cli.ts                      # CLI 진입점 (npx tsx cli.ts)
├── 01_입력데이터/
└── 02_초안출력/
```

### 메인 API

```typescript
export async function generateLoanApplication(
  input: {
    jsonPath: string;
    excelPaths?: string[];
    supplementPaths?: string[];
  },
  options: {
    aiEnabled?: boolean;
    aiSections?: ('opinion' | 'financial' | 'risk')[];
    anthropicApiKey?: string;
    loanType?: LoanType;
  }
): Promise<{ buffer: Buffer; unresolvedItems: UnresolvedItem[] }>
```

### 섹션 빌더 인터페이스

```typescript
import { Paragraph, Table } from 'docx';

/** 섹션 빌더 반환 타입 — Paragraph + Table 혼합 지원 */
type SectionContent = (Paragraph | Table)[];

type SectionBuilder = (data: LoanApplication) => SectionContent | null;
// null 반환 = 해당 섹션 생략 (데이터 없음)
```

generator가 `LoanTypeProfile.sectionOrder`에 정의된 순서대로 빌더를 호출하고,
`?` 접미사 섹션은 null 반환 시 생략, `*` 접미사 섹션은 관련사 수만큼 반복 호출.

### CLI 실행 경로 (Track A ↔ 엔진 연결)

> **설계 결정**: `docx-generator/cli.mjs`에서 `app/src/lib/loan-engine/`을 import하기 위해
> `tsx` 런타임을 사용. Next.js 빌드 시스템에 의존하지 않고 순수 TypeScript 직접 실행.

```
docx-generator/cli.ts          ← TypeScript CLI 진입점
  ↓ (tsx 런타임)
app/src/lib/loan-engine/       ← 순수 TS (Next.js 의존성 없음)
  ↓
DOCX 출력
```

- `cli.ts`를 `npx tsx cli.ts` 또는 `node --import tsx cli.ts`로 실행
- loan-engine 코드는 Next.js 전용 API (headers, cookies 등) 사용 금지
- Track B에서는 Next.js API route가 동일 엔진 코드를 직접 import

---

## 5. AI 연동 설계

### AI 적용 섹션

| 섹션 | 목적 | 입력 | 출력 |
|------|------|------|------|
| 종합의견 | 승인 근거 요약 | LoanApplication 전체 | 5~6개 bullet 문단 + 결론 |
| 재무분석 소견 | 재무현황 해석 + 트렌드 | financials + borrowings | 5~8문장 분석 문단 |
| 리스크 분석 | 리스크 요인 + 완화방안 | 전체 데이터 | 리스크 항목별 2~3문장 |

### 프롬프트 구조

시스템 프롬프트(고정 — 문체규칙, 금지사항) + 데이터 컨텍스트(동적 — 핵심 수치만 추출하여 토큰 절약)

**문체 규칙:**
- 공문서체 (존칭 제외, 간결한 서술체)
- "~임", "~됨", "~것으로 판단됨" 종결
- 수치는 반드시 단위 표기
- 긍정요소 → 리스크 → 결론 순서
- 마지막 문장: "~승인하여 주시기 바랍니다"

**금지:**
- 추측성 표현 사용 금지
- [TBD] 항목 확정적 서술 금지
- 재무분석 시트 소견 그대로 복붙 금지

### API 설정

- **모델**: claude-sonnet-4-20250514 (비용/속도 균형, 필요시 opus 업그레이드 옵션)
- **스트리밍**: Track B(웹)에서 종합의견 미리보기 시 실시간 표시
- **비활성화**: `aiEnabled: false` → 해당 섹션에 `[AI 미생성 — 수동 작성 필요]` 마커
- **섹션 선택**: 담당자가 체크박스로 AI 적용 섹션 토글
- **병렬 호출**: AI 3건은 `Promise.all`로 병렬 실행 (순차 시 Vercel 60초 타임아웃 초과 위험)

### Track B 성능 대책 (Vercel 서버리스)

> **이슈**: Excel 파싱 + PDF 파싱 + AI 호출 3건 + DOCX 조립이 60초를 초과할 수 있음.

**대책:**
1. AI 3건 `Promise.all` 병렬 호출 (순차 15초×3 → 병렬 ~15초)
2. 단계별 분리 API: 프론트에서 파싱 → AI → DOCX를 개별 호출 (각 단계 < 60초)
3. 대형 PDF 처리 시 Vercel Pro 300초 타임아웃 또는 background function 활용 검토

---

## 6. 개발 페이즈 계획

### Phase 0.5: 테크메이트 확정본 반영 + 엔진 기초 (최우선)

**목표**: 확정 자료로 테크메이트 건 정확하게 완성 + 엔진 뼈대 구축

> **순서 원칙**: 확정 자료 수령 → 자료 분석 → 스키마 확정 → 구현
> (스키마를 먼저 확정하고 자료를 끼워맞추지 않음 — 중요 데이터 누락 방지)

**Step A: 자료 분석 (확정본 수령 후)**
1. 확정 자료와 기존 `기본조건_입력.json` diff 확인
2. 기존 스키마에 없는 필드/구조 식별
3. 데이터 모델(types.ts) 확정

**Step B: 엔진 구현**
4. `types.ts` — 데이터 모델 정의 (LoanApplication + EquityPledgeData + LoanTypeProfile)
5. `parsers/json-parser.ts` — 기본조건 JSON → LoanApplication 변환
6. `sections/helpers.ts` — 기존 generate-docx.mjs 헬퍼 이관
7. `sections/common/` — 공통 섹션 빌더 (하드코딩 → 데이터 기반 전환)
8. `sections/plugins/equity-pledge.ts` — 지분담보 플러그인
9. `generator.ts` — 파이프라인 조립 (LoanTypeProfile 기반 섹션 순서)
10. `기본조건_입력.json` 확장 — 확정 자료 반영

**Step C: 검증**
11. 테크메이트 확정본 vs 엔진 생성 결과 diff 검증

**완료 기준**: `npx tsx cli.ts`로 테크메이트 건 DOCX가 확정본 기준으로 생성됨

### Phase 1: 파서 확장 (Excel + PDF)

1. `parsers/excel-parser.ts` — ok-cf1 재무현황 Excel 파싱
   - ok-cf1이 생성하는 Excel 포맷을 역으로 읽는 파서
2. `parsers/pdf-parser.ts` — 회계실사보고서/IM PDF 파싱
   - **하이브리드 방식**: 구조화된 표는 규칙기반 추출, 비정형 텍스트는 Claude AI로 필드 추출
   - PDF 발행기관마다 포맷이 완전히 다르므로 범용 규칙기반 파서는 비현실적
3. `calculators/` — LTV, 금리산출, 민감도 계산기

**완료 기준**: JSON + Excel + PDF 3종 입력으로 LoanApplication 자동 조립

### Phase 2: AI 연동

1. `ai/client.ts` — Claude API 연동
2. 프롬프트 3종 (종합의견, 재무분석, 리스크)
3. Track A: CLI `--ai` 플래그 / Track B: API route + 프론트 토글

**완료 기준**: AI 종합의견이 테크메이트 건 데이터 기반으로 적절하게 생성

### Phase 3: Track B 웹 UI

1. `/loan/new/page.tsx` — 신규 신청서 (스텝 위자드)
2. `/loan/[id]/page.tsx` — 수정/미리보기
3. `/api/loan/generate/route.ts` — DOCX 생성 API
4. `/api/ai/opinion/route.ts` — AI 스트리밍 API

### Phase 4: 추가 유형 플러그인 (우선순위순)

1. 미분양담보 (민감도분석, 회수예상가 포함)
2. PF브릿지 (트리거, 이자자금보충인, 토지조서)
3. 사모사채 (Term표, 업권비교)
4. 공사비유동화

---

## 7. 스타일 규격

| 항목 | 값 |
|------|-----|
| 용지 | A4 |
| 여백 | 15mm 전방향 |
| 본문 폰트 | 맑은 고딕 9pt |
| 소형 폰트 | 맑은 고딕 8pt |
| 섹션 제목 | 맑은 고딕 11pt, ■ 접두사, bold |
| 문서 제목 | 맑은 고딕 14pt, bold, 가운데 정렬 |
| 테이블 헤더 | 배경 #D9D9D9, bold, 가운데 정렬 |
| 숫자 | 우측 정렬, 천단위 콤마 |
| [TBD] | 파란색 #0000FF |
| [확인필요] | 빨간색 #FF0000 |

---

## 8. 참고: 샘플 분석 결과

분석 대상 샘플 (5종):
- 휴먼스홀딩스 PF브릿지 (25p)
- KB부동산신탁 사모사채
- 아이에스동서 미분양담보 (3p)
- 계림4유동화 공사비유동화 (28p)
- HB캐피탈 사모사채

샘플에서 발견되어 본 설계에 반영된 섹션:
- 금리산출 및 적용 (기준+가산 breakdown) → 공통 섹션 interest-rate
- 대주단 구성 → 공통 섹션 syndicate
- 여신조건 상세 (물적/인적/이자유보) → 공통 섹션 conditions-security
- 금융구조도 → 공통 섹션 structure
- 소요자금 조달·지출계획 → 공통 섹션 funding-plan
- 트리거조항 → PF브릿지 플러그인
- 이자자금보충인 현황 → PF브릿지 플러그인
- 에쿼티비율 산정 → PF브릿지 플러그인
- 토지조서 → PF브릿지 플러그인

---

## 9. 설계 리뷰 결과 및 반영 사항

> 시니어 엔지니어 관점 리뷰 (2026-03-30) — 아래 이슈 모두 본 설계서에 반영 완료.

### 반영 완료 (P0 — 즉시)

| 이슈 | 반영 내용 |
|------|----------|
| 유형별 섹션 순서가 다름 | `LoanTypeProfile`에 `sectionOrder` 배열 추가 (섹션 3.1) |
| 확정 자료 → 스키마 순서 | Phase 0.5를 "자료 먼저 → 분석 → 스키마 확정 → 구현" 순서로 변경 (섹션 6) |
| TS import 경로 문제 | `tsx` 런타임 사용, loan-engine은 Next.js 의존성 없는 순수 TS (섹션 4) |
| SectionBuilder 반환 타입 | `(Paragraph \| Table)[]`로 확장 (섹션 4) |

### 반영 완료 (P1 — 중요)

| 이슈 | 반영 내용 |
|------|----------|
| Vercel 60초 타임아웃 | AI 병렬 호출 + 단계별 분리 API 전략 (섹션 5) |
| PDF 파서 현실성 | 규칙기반 + AI 추출 하이브리드 방식 (섹션 6 Phase 1) |
| 관련사 데이터 깊이 차이 | `RelatedEntityFinancials`에 `detailLevel: full/summary/minimal` (섹션 2) |
| 대주단 트랜치별 조건 | `SyndicateInfo`에 `TrancheInfo[]` 구조 (섹션 2) |

### 반영 완료 (P2 — 보통)

| 이슈 | 반영 내용 |
|------|----------|
| 여신조건/채권보전 경계 모호 | `LoanTypeProfile.conditionsAndSecurity: 'merged' \| 'separate'`로 유형별 결정 (섹션 3.1) |

### 잔여 리스크 (모니터링)

- **docx 메모리 사용**: 대형 문서(30p+, 테이블 수십 개) 생성 시 Vercel 서버리스 OOM 가능성 → Phase 3에서 실측 후 대응
- **PDF 파서 정확도**: 하이브리드 방식이라도 회계법인/증권사별 포맷 차이가 클 수 있음 → Phase 1에서 실데이터 3종 이상으로 검증 필요
