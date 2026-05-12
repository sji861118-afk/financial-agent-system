<!-- STATUS: INCOMPLETE — CLAUDE.md에 완료 마커 없음. CLAUDE.md "완료 (2026-03-31) 여신검토 워크플로우 Phase 1~3"이 부분적으로 본 plan을 실행함. Phase 4~5(viewpoint 검색, 승인, 신청서 연동) 미구현 -->

# Phase 1: ReviewDeal → DOCX 초안 생성 웹앱 통합

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여신검토 딜 상세 페이지(`/review/[id]`)에서 "초안 생성" 버튼 클릭 → DOCX 다운로드까지의 플로우 완성

**Architecture:** ReviewDeal 데이터를 LoanApplication으로 변환하는 매퍼 함수를 만들고, 서버사이드 API에서 loan-engine의 generateDocx()를 호출하여 DOCX Buffer를 응답. 부족한 필드는 [TBD]로 채움. DART API로 상세 재무데이터를 실시간 조회하여 BS/IS line item을 확보.

**Tech Stack:** Next.js 16, docx 9.6.1, Firebase Firestore, shadcn/ui, DART API

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/src/lib/deal-to-loan-mapper.ts` | ReviewDeal → LoanApplication 변환 |
| Create | `app/src/app/api/review/generate-docx/route.ts` | DOCX 생성 API endpoint |
| Modify | `app/src/app/review/[id]/page.tsx` | "초안 생성" 버튼 추가 |
| Modify | `app/src/lib/loan-engine/types.ts` | LoanConditions에 누락된 필드 추가 |

---

### Task 1: ReviewDeal → LoanApplication 매퍼 함수

**Files:**
- Create: `app/src/lib/deal-to-loan-mapper.ts`

- [ ] **Step 1: 매퍼 함수 작성**

이 함수는 ReviewDeal + ReviewOpinion[] → LoanApplication 변환을 담당한다.
부족한 필드는 빈값/[TBD]로 채운다.

```ts
// app/src/lib/deal-to-loan-mapper.ts
import type { ReviewDeal, ReviewOpinion, FinancialSnapshot } from '@/types/review';
import type { LoanApplication, LoanType, FinancialStatements, StatementLineItem } from '@/lib/loan-engine/types';

/**
 * ReviewDeal의 금리수수료기간 문자열 파싱
 * 예: "6.0%(참여수수료 1.0%) / 24개월" → { rate: 6.0, months: 24 }
 */
function parseLoanTermsString(s: string): { rate: number | null; months: number | null } {
  const rateMatch = s.match(/([\d.]+)%/);
  const monthMatch = s.match(/(\d+)\s*개월/);
  return {
    rate: rateMatch ? parseFloat(rateMatch[1]) : null,
    months: monthMatch ? parseInt(monthMatch[1]) : null,
  };
}

/**
 * ReviewDeal의 모집금액 문자열 파싱
 * 예: "총 285억원" → 28500 (백만원)
 */
function parseAmount(s: string): number {
  const match = s.replace(/,/g, '').match(/([\d.]+)\s*(억|백만|천만|만)?/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  switch (match[2]) {
    case '억': return num * 100;      // 억 → 백만원
    case '천만': return num * 10;
    case '만': return num * 0.01;
    default: return num;              // 백만원 or 단위 없음
  }
}

/**
 * ProductMajorType → LoanType 매핑
 */
function mapLoanType(productType: string): LoanType {
  const map: Record<string, LoanType> = {
    'PF': 'pf-bridge',
    '브릿지': 'pf-bridge',
    '기업신용': 'equity-pledge',
    '사모사채': 'private-bond',
    '담보대출': 'equity-pledge',
  };
  return map[productType] || 'equity-pledge';
}

/**
 * FinancialSnapshot (요약 6개 숫자) → FinancialStatements 변환
 * DART 상세 데이터가 없을 때 요약 수준으로 생성
 */
function snapshotToStatements(snapshot: FinancialSnapshot): FinancialStatements {
  const years = snapshot.데이터.map(r => r.결산년월);

  const makeItem = (account: string, getter: (r: typeof snapshot.데이터[0]) => number, bold?: boolean): StatementLineItem => ({
    account,
    values: Object.fromEntries(snapshot.데이터.map(r => [r.결산년월, getter(r)])),
    bold,
  });

  return {
    years,
    balanceSheet: [
      makeItem('자산총계', r => r.자산총계, true),
      makeItem('부채총계', r => r.부채총계, true),
      makeItem('자본총계', r => r.자본총계, true),
    ],
    incomeStatement: [
      makeItem('매출액', r => r.매출액, true),
      makeItem('영업이익', r => r.영업이익, true),
      makeItem('당기순이익', r => r.당기순이익, true),
    ],
    ratios: [],
  };
}

/**
 * 검토의견에서 opinion text 조합
 */
function buildOpinionText(opinions: ReviewOpinion[]): string {
  if (opinions.length === 0) return '';
  return opinions.map(op => {
    const parts: string[] = [`[${op.department} - ${op.authorName}] 의견: ${op.진행여부}`];
    if (op.장점?.length) parts.push(`장점: ${op.장점.join(', ')}`);
    if (op.단점?.length) parts.push(`단점: ${op.단점.join(', ')}`);
    if (op.보완사항) parts.push(`보완사항: ${op.보완사항}`);
    return parts.join('\n');
  }).join('\n\n');
}

/**
 * ReviewDeal + opinions → LoanApplication 변환
 * 부족한 필드는 [TBD] 또는 빈값으로 채움
 */
export function dealToLoanApplication(
  deal: ReviewDeal,
  opinions: ReviewOpinion[],
  dartFinancials?: FinancialStatements,
): LoanApplication {
  const parsed = parseLoanTermsString(deal.금리수수료기간 || '');
  const amount = parseAmount(deal.모집금액 || '');
  const loanType = mapLoanType(deal.productType);

  // 재무데이터: DART 상세가 있으면 우선, 없으면 요약 스냅샷 변환
  const borrowerFs: FinancialStatements = dartFinancials
    || (deal.재무현황?.length > 0
      ? snapshotToStatements(deal.재무현황.find(s => s.역할 === '차주') || deal.재무현황[0])
      : { years: [], balanceSheet: [], incomeStatement: [] });

  return {
    meta: {
      applicationDate: deal.접수일 || new Date().toISOString().slice(0, 10),
      applicationType: '신규',
      branch: '기업금융1본부',
      officer: deal.당행접수자 || '',
    },
    borrower: {
      name: deal.차주 || '[TBD]',
      representative: '[TBD]',
      businessNumber: '[TBD]',
      establishedDate: '[TBD]',
      industry: '[TBD]',
      address: deal.주소 || '[TBD]',
    },
    loanTerms: {
      loanType,
      amount,
      durationMonths: parsed.months || 0,
      repaymentMethod: '[TBD]',
      rateType: parsed.rate ? '고정' : 'TBD',
      ratePercent: parsed.rate || undefined,
      collateralType: deal.주요채권보전 || '[TBD]',
      purpose: deal.자금용도 || '[TBD]',
      repaymentSource: '[TBD]',
      creditClassification: '정상',
    },
    funding: {
      cashIn: [{ item: '본건대출', amount }],
      cashOut: [{ item: deal.자금용도 || '운영자금', amount }],
    },
    collateralSecurity: deal.주요채권보전
      ? [{ no: 1, description: deal.주요채권보전 }]
      : [],
    loanConditions: {
      general: ['[TBD: 대출조건 확정 후 기재]'],
    },
    interestRate: {
      baseRate: parsed.rate || undefined,
      appliedRate: parsed.rate || undefined,
    },
    financials: {
      borrower: borrowerFs,
    },
    borrowings: [],
    typeSpecific: {
      type: loanType,
      data: {} as any,
    },
    aiContent: {
      opinion: buildOpinionText(opinions),
    },
    unresolvedItems: [
      { no: 1, section: '기본정보', item: '차주 상세정보', status: '[TBD: 사업자등록증 확인 후]' },
      { no: 2, section: '기본조건', item: '대출금리', status: '[TBD: 협의 중]' },
      { no: 3, section: '담보/보전', item: '담보 상세', status: '[TBD: 담보평가 후]' },
      { no: 4, section: '재무현황', item: '상세 재무제표', status: '[TBD: DART/업로드 후]' },
    ],
  };
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/src/lib/deal-to-loan-mapper.ts
git commit -m "feat: add ReviewDeal → LoanApplication mapper for DOCX generation"
```

---

### Task 2: DOCX 생성 API 엔드포인트

**Files:**
- Create: `app/src/app/api/review/generate-docx/route.ts`

- [ ] **Step 1: API 라우트 작성**

```ts
// app/src/app/api/review/generate-docx/route.ts
import { type NextRequest } from 'next/server';
import { getReviewStore } from '@/lib/review-store';
import { dealToLoanApplication } from '@/lib/deal-to-loan-mapper';
import { generateDocx, equityPledgeProfile } from '@/lib/loan-engine/index';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { dealId } = await request.json();
    if (!dealId) {
      return Response.json({ error: 'dealId 필수' }, { status: 400 });
    }

    // 1. Firestore에서 딜 + 의견 조회
    const store = getReviewStore();
    const deal = await store.getDeal(dealId);
    if (!deal) {
      return Response.json({ error: '건을 찾을 수 없습니다' }, { status: 404 });
    }
    const opinions = await store.getOpinionsForDeal(dealId);

    // 2. ReviewDeal → LoanApplication 변환
    const loanApp = dealToLoanApplication(deal, opinions);

    // 3. 프로필 선택 (현재는 equity-pledge만)
    const profile = equityPledgeProfile;

    // 4. DOCX 생성
    const buffer = await generateDocx(loanApp, { profile });

    // 5. 파일명 생성
    const today = new Date().toISOString().slice(0, 10);
    const filename = encodeURIComponent(`${deal.차주}_${today}_초안.docx`);

    // 6. Buffer 응답
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('[generate-docx] Error:', error);
    return Response.json(
      { error: '초안 생성 실패', detail: String(error) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/src/app/api/review/generate-docx/route.ts
git commit -m "feat: add /api/review/generate-docx endpoint"
```

---

### Task 3: 딜 상세 페이지에 "초안 생성" 버튼 추가

**Files:**
- Modify: `app/src/app/review/[id]/page.tsx`

- [ ] **Step 1: import 추가 및 상태/핸들러 추가**

파일 상단 import에 `Download` 아이콘 추가:

```ts
// 변경: 기존 import 줄
import {
  Loader2,
  FileText,
  MessageSquarePlus,
  ArrowLeft,
  Building2,
  Download,
} from "lucide-react";
```

`DealDetailPage` 컴포넌트 내부, `useState` 선언부 아래에 상태와 핸들러 추가:

```ts
  const [generating, setGenerating] = useState(false);

  const handleGenerateDocx = async () => {
    if (!dealId) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/review/generate-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`초안 생성 실패: ${err.error || '알 수 없는 오류'}`);
        return;
      }
      // Blob 다운로드
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `${deal?.차주}_초안.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('초안 생성 중 오류가 발생했습니다');
    } finally {
      setGenerating(false);
    }
  };
```

- [ ] **Step 2: 버튼 UI 추가**

헤더 영역의 "의견 작성" 버튼 옆에 "초안 생성" 버튼 추가.
`<div className="flex gap-2">` 안에 기존 Link 앞에 추가:

```tsx
          <Button
            variant="outline"
            onClick={handleGenerateDocx}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            {generating ? '생성 중...' : '초안 생성'}
          </Button>
```

- [ ] **Step 3: 로컬에서 빌드 확인**

```bash
cd app && npx next build 2>&1 | tail -20
```

Expected: 빌드 성공 (exit 0)

- [ ] **Step 4: 커밋**

```bash
git add app/src/app/review/[id]/page.tsx
git commit -m "feat: add DOCX draft generation button to deal detail page"
```

---

### Task 4: LoanConditions 타입에 누락 필드 추가

**Files:**
- Modify: `app/src/lib/loan-engine/types.ts`

현재 `LoanConditions`에 `precedentConditions`, `subsequentConditions`, `accelerationEvents`가 없다.
`conditions-security.ts` 섹션 빌더가 이 필드를 참조하므로 추가 필요.

- [ ] **Step 1: LoanConditions 인터페이스 확장**

```ts
export interface LoanConditions {
  physical?: string[];
  personal?: string[];
  interestReserve?: string[];
  general?: string[];
  precedentConditions?: string[];      // 인출선행조건
  subsequentConditions?: string[];     // 인출후행조건
  accelerationEvents?: string[];       // 기한이익상실사유
  approvalValidity?: string;
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/src/lib/loan-engine/types.ts
git commit -m "fix: add missing LoanConditions fields (precedent/subsequent/acceleration)"
```

---

### Task 5: 통합 테스트 — 로컬에서 전체 플로우 확인

- [ ] **Step 1: 개발 서버 실행**

```bash
cd app && npm run dev
```

- [ ] **Step 2: 테스트 시나리오**

1. 브라우저에서 `/review` 접속
2. 기존 딜이 있으면 클릭하여 상세 페이지 진입, 없으면 `/review/new`에서 신규 딜 생성
3. 상세 페이지에서 "초안 생성" 버튼 클릭
4. DOCX 파일 다운로드 확인
5. Word에서 열어 내용 확인:
   - 차주명, 금액, 기간 등이 ReviewDeal에서 가져온 값인지
   - [TBD] 항목이 적절히 표시되는지
   - 재무현황 표가 출력되는지 (요약 수준)

- [ ] **Step 3: 문제 수정 후 최종 커밋**

```bash
git add -A
git commit -m "feat: Phase 1 complete — ReviewDeal to DOCX draft generation in web app"
```
