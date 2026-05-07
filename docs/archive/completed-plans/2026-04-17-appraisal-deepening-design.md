# 감정평가서 분석 자동화 심층개발 설계서

> 작성일: 2026-04-17
> 상태: Draft → Review
> 선행 스펙: `2026-03-30-appraisal-analysis-design.md` (보강 + 신청서 엑셀 출력 별도 심화)

## 1. 개요

### 목적
감정평가서/사업성평가보고서 PDF를 업로드하면, 물건유형(아파트PF/지식산업센터/토지PF)을 자동 감지하고, 신청서 양식대로 재현된 Excel을 생성하는 도구. 생성 직전에 **감정평가사 관점**과 **심사역 관점** 두 개의 감수 에이전트가 자동 검증하여 그 결과를 "감수의견" 시트와 API 응답에 동시 포함한다.

### 확정 스코프
| 항목 | 결정 |
|---|---|
| 출발점 | 2026-03-30 스펙 보강 + 신청서 엑셀 출력 별도 심화 (병행 트랙) |
| 캐논 양식 | 아파트PF / 지식산업센터 / 토지PF — 3종 병행 |
| 외부데이터 | **제외** (인포케어/실거래가/공시지가 API 모두 v1 스코프 외) |
| 출력 섹션 | 담보분석 + 회수예상가 / 상세담보현황 / 비준사례 / 공급분양 (4개) |
| 편집 UX | 다운로드 후 사용자가 엑셀에서 직접 편집 (웹 폼 없음) |
| 시트 구조 | 양식 시트만 (단일 테이블), 회수예상가 등 명확한 계산만 수식 |
| 물건유형 | PDF 키워드 자동감지 + 사용자 수정 가능 (Step 1 드롭다운) |
| 감수 단계 | 추출 직전 2개 에이전트(감정평가사/심사역) 실행 → 감수의견 시트 + API findings |

### 비스코프 (명시적 제외)
- 인포케어 크롤링, data.go.kr API, HUG 분양정보 API
- Step 위저드 / 4탭 편집 UI / 수동 편집 폼
- 양식 시트 ↔ 데이터 시트 이원화 (수식 참조 구조)
- DOCX 생성 (Excel만)

---

## 2. 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│  /appraisal 페이지 (Next.js)                                  │
│   업로드 영역(감평서/사업성보고서) + 물건유형 자동감지+선택      │
│   [생성] 버튼                                                  │
└──────────┬─────────────────────────────────────────────────────┘
           │ POST /api/appraisal/generate (multipart)
           ▼
┌──────────────────────────────────────────────────────────────┐
│  Server pipeline (Node.js, Vercel serverless, maxDuration=60) │
│                                                                │
│  1. PDF parse        (uploaded-file-parser.ts)                 │
│  2. Type detect      (appraisal/property-detector.ts)          │
│  3. Data extract     (appraisal-parser.ts → AppraisalData)     │
│  4. ★ 전문가 감수 단계                                         │
│       ├─ appraiser-auditor.ts  (감정평가사 관점)               │
│       └─ reviewer-auditor.ts   (심사역 관점)                   │
│           → ReviewFinding[]                                    │
│  5. Excel build      (appraisal/orchestrator.ts)               │
│       └─ 4개 양식 시트 + 감수의견 시트 + (옵션) 부록 시트       │
│  6. writeBuffer → base64                                       │
└──────────┬─────────────────────────────────────────────────────┘
           │ JSON { excelBase64, detectedType, findings[], warnings[] }
           ▼
┌──────────────────────────────────────────────────────────────┐
│  Browser:                                                     │
│   • 자동 다운로드 (file-saver)                                 │
│   • 감수의견 미리보기 (배지: 🔴 ERROR n / 🟡 WARNING n)         │
│   • 사용자가 엑셀 열어 검토·수정                               │
└──────────────────────────────────────────────────────────────┘
```

**핵심 결정**:
- **단일 API 엔드포인트** (`/api/appraisal/generate`) — 웹 폼이 없으므로 다단계 API 불필요
- **감수 단계는 추출 차단 X** — ERROR 있어도 Excel 생성. 사용자가 PDF와 대조하여 판단해야 할 케이스 多
- **기존 자산 보존** — `appraisal-parser.ts`(1,086줄), `appraisal-excel.ts`의 시산가액·경매통계(~450줄) 유지
- **신규 디렉토리** `lib/appraisal/`로 모듈화 — 향후 물건유형 추가 시 templates 한 파일 추가만으로 확장

---

## 3. 모듈 구조

```
app/src/
├── app/
│   ├── appraisal/
│   │   └── page.tsx                          ← 전면 재작성
│   └── api/appraisal/
│       └── generate/
│           └── route.ts                       ← 신규 단일 엔드포인트
│
├── lib/
│   ├── appraisal-parser.ts                    ← 유지 (output 타입 명세화)
│   ├── appraisal-excel.ts                     ← 슬림화 (시산가액·경매통계만 보존)
│   ├── uploaded-file-parser.ts                ← 유지
│   │
│   └── appraisal/                             ← 신규 디렉토리
│       ├── orchestrator.ts                    ← 진입점
│       ├── property-detector.ts               ← 자동감지
│       │
│       ├── auditors/
│       │   ├── appraiser-auditor.ts           ← 감정평가사 관점
│       │   ├── reviewer-auditor.ts            ← 심사역 관점
│       │   └── findings-types.ts              ← ReviewFinding 인터페이스
│       │
│       ├── sheet-builders/
│       │   ├── form-styles.ts                 ← 셀 병합/테두리/색상 헬퍼
│       │   ├── audit-findings.ts              ← 감수의견 시트
│       │   ├── collateral-summary.ts          ← 담보분석 시트
│       │   ├── collateral-detail.ts           ← 상세담보 시트 (호별/필지별)
│       │   ├── comparatives.ts                ← 비준사례 시트
│       │   └── supply-status.ts               ← 공급분양 시트
│       │
│       └── property-templates/
│           ├── apartment-pf.ts                ← 아파트PF 시트 조합
│           ├── industrial-center.ts           ← 지산센터 시트 조합
│           └── land-pf.ts                     ← 토지PF 시트 조합
│
└── types/
    └── appraisal.ts                           ← 확장 (PropertyType, AppraisalData, ReviewFinding)
```

**의존성 방향** (단방향):
```
page/route → orchestrator → property-templates → sheet-builders → form-styles
                         → auditors            → findings-types
                         → property-detector
                         → appraisal-parser (existing)
                         → uploaded-file-parser (existing)
```

**기존 코드 처리**:
- `appraisal-excel.ts` 1,449줄 → 시산가액(~250줄) + 경매통계(~200줄)만 보존 (~500줄로 슬림). 나머지 삭제.
- `appraisal-parser.ts` 1,086줄: 코드 유지, `parseAppraisalPdf()` 반환 타입을 `AppraisalData`로 명세화
- `appraisal/page.tsx`: mock UI 전면 삭제

---

## 4. 데이터 타입

```typescript
// types/appraisal.ts에 추가

export type PropertyType = 'apartment-pf' | 'industrial-center' | 'land-pf';

export interface AppraisalData {
  source: {
    appraisalReports: ParsedReportMeta[];   // 감정평가서 메타
    feasibilityReports: ParsedReportMeta[]; // 사업성평가보고서 메타
    parsedAt: string;
  };
  propertyType: PropertyType;
  detectionConfidence: number;              // 0~1, 사용자 override 시 1

  collateral: CollateralAnalysis;           // 기존 v2 타입 (2026-04-01)
  collateralDetail: CollateralDetailItem[]; // 기존 v2 타입
  comparatives: ComparativeCase[];          // 기존 v2 타입
  supply?: SupplyOverview;                  // 사업성보고서 없으면 undefined

  missingFields: string[];                  // 예: ['supply.salesRate']
}

export interface ParsedReportMeta {
  fileName: string;
  pages: number;
  appraiser?: string;                       // 감정평가법인명
  baseDate?: string;                        // 기준시점
  parseStatus: 'ok' | 'partial' | 'failed';
}

export interface ReviewFinding {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  perspective: 'appraiser' | 'reviewer';
  category: string;                         // '평가방법'|'LTV'|'비교사례' 등
  message: string;
  detail?: string;
  sectionRef?: { sheet: string; cell: string };
  suggestedAction?: string;
}

export interface GenerateResponse {
  success: boolean;
  excelBase64?: string;
  detectedType: PropertyType;
  detectionConfidence: number;
  findings: ReviewFinding[];
  warnings: string[];
  fileName: string;                         // 다운로드 파일명
}
```

---

## 5. 물건유형 자동감지

### 5.1 알고리즘 (`property-detector.ts`)

```typescript
const TYPE_KEYWORDS: Record<PropertyType, { strong: string[]; weak: string[] }> = {
  'apartment-pf': {
    strong: ['아파트', '공동주택', '주택재건축', '주택재개발', '지역주택조합', 'PF대출'],
    weak: ['세대수', '평형', '단지'],
  },
  'industrial-center': {
    strong: ['지식산업센터', '지산센터', '집합건물(공장)', '아파트형공장'],
    weak: ['호실', '제조시설', '연구소'],
  },
  'land-pf': {
    strong: ['토지', '나대지', '브릿지대출', '필지', '용도지역', '개별공시지가'],
    weak: ['지번', '도로조건'],
  },
};

export function detectPropertyType(text: string): {
  type: PropertyType;
  confidence: number;
  scores: Record<PropertyType, number>;
}
```

- strong = 3점, weak = 1점, 빈도 가중치 곱셈
- `confidence = (top - second) / top` — 0~1 정규화

### 5.2 신뢰도 임계치
| 신뢰도 | UI 표시 | 동작 |
|---|---|---|
| `>= 0.5` | ✓ 자동감지됨 | 자동 적용 |
| `0 < x < 0.5` | ⚠️ 확인 필요 | 자동 적용하되 사용자 변경 권유 |
| `0` | ❌ 감지 실패 | 422 반환, 사용자 수동 선택 후 재요청 |
| 사용자 수동 선택 | (감지 결과 무시) | `confidence = 1`로 저장 |

---

## 6. 감수 에이전트

### 6.1 감정평가사 관점 (`appraiser-auditor.ts`)

평가 자체의 적정성 검증 (여신 의사결정 무관, 평가서가 평가서로서 적정한가):

| 카테고리 | 규칙 | 심각도 |
|---|---|---|
| 평가방법 | 비교+원가+수익 비중 합계가 100±0.1%인가 | ERROR |
| 평가방법 | 본건 평가방법이 물건유형 표준과 일치하는가 (예: 토지=비교100, 수익형=수익우선) | WARNING |
| 비교사례 | 비교사례 단가 평균 vs 본건 단가 괴리율이 ±30% 이내인가 | WARNING |
| 비교사례 | 비교사례 4건 미만 시 표본 부족 | INFO |
| 호별 합계 | Σ(호별 감정가) ≈ 총 감정가 (오차 ±1%) | ERROR |
| 면적 일관성 | 호별 면적 합계 ≈ 총 면적 (오차 ±0.5%) | WARNING |
| 누락 | 기준시점/일련번호/감정평가법인명 누락 | INFO |
| 평가가능기간 | 기준시점이 6개월 이상 경과한 경우 | WARNING |

### 6.2 심사역 관점 (`reviewer-auditor.ts`)

여신 의사결정 관점의 위험 검증:

| 카테고리 | 규칙 | 심각도 |
|---|---|---|
| LTV | 담보유형별 임계 초과 (아파트>80%, 지산>70%, 토지>60%) | WARNING |
| 회수예상가 | 회수액이 음수 또는 0 | ERROR |
| 회수예상가 | 손실액 > 0 (감정가 × 낙찰가율 < 선순위 + 채권액) | ERROR |
| 선순위 | 선순위 비중 (선순위 / 감정가) > 50% | WARNING |
| 권리현황 | 권리자/원금/채권최고액 칼럼에 누락 행 존재 | WARNING |
| 분양현황 | 분양률 < 50% (사업성보고서 있는 경우) | WARNING |
| 분양현황 | 미분양 호실 > 30% | INFO |
| 비교사례 | 평가목적이 '경매' 사례 비중 > 50% | INFO |

### 6.3 출력 형태
- **API 응답**: `findings: ReviewFinding[]`
- **Excel "감수의견" 시트**: 첫 번째 시트로 배치, 심각도별 색상 코딩
- **추출 차단 없음**: ERROR라도 Excel은 생성 (사용자 판단 영역)

---

## 7. 시트 레이아웃

### 7.1 물건유형 × 시트 매트릭스

| 시트 | 아파트PF | 지산센터 | 토지PF |
|---|---|---|---|
| 0. 감수의견 | ✓ (첫 번째) | ✓ | ✓ |
| 1. 담보분석 | ✓ 표준 | ✓ 표준 | ✓ 표준 |
| 2. 상세담보현황 | 호별 (세대수,타입,평형) | 호별 (호실,층,전용) | 필지별 (지번,지목,공시지가) |
| 3. 비준사례 | ✓ | ✓ | 거래사례 위주 |
| 4. 공급/분양 | ✓ 타입별 분양현황 | ✓ 호실별 분양현황 | ✗ 해당 없음 |
| 5. 시산가액검토 (부록) | 옵션 | 옵션 | 옵션 |
| 6. 경매통계(감평) (부록) | 옵션 | 옵션 | 옵션 |

### 7.2 공통 시트 레이아웃 규약 (`form-styles.ts`)

- **A1**: 시트 제목 (16pt, 굵게, 회색 #595959 배경, 흰 글자)
- **A2**: 부제 / 출처 (10pt, 이탤릭, #808080)
- **A4부터**: 표 본문
- **표 헤더**: 굵게 + 연한파랑 #D9E1F2
- **사용자 입력 셀**: 노랑 #FFF2CC + `_입력필요_` placeholder
- **자동 계산 셀**: 초록 #E2EFDA + ExcelJS formula
- **표 마지막 행 아래**: "출처: 감정평가서 (XXX감정평가법인, YYYY-MM-DD)" 푸터 (8pt, 회색)
- **테두리**: 모든 데이터 셀 thin black
- **숫자 포맷**: 백만원 단위, `#,##0` (소수점 없음), 면적 `#,##0.00`, 율 `0.00%`

### 7.3 핵심 시트별 레이아웃

#### 시트 1: 담보분석 (3종 동일 골격)
```
A1   : 담보분석
A2   : 출처: XXX감정평가법인 (2026-04-15)

A4:F4 [헤더1] : 구분 | 종류     | 수량    | 면적(㎡) | 감정가(백만원) | 담보가용가
A5:F5 [행1]   : 1   | 공동주택 | 354세대 | 28,500   | 95,000        | 76,000
A6:F6 ...
A12   [소계]  : 합계 |          | -       | 28,500   | 95,000        | 76,000

A14:F14 [헤더2]: 구분 | 평가기관       | 평가기준일 | 평가방법       | LTV  | 비고
A15:F15        : 본건 | XXX감정평가법인 | 2026-03-15| 비교80%/원가20%| 60%  | -

A20: 권리현황표 (RightEntry[])
   순위 | 권리종류 | 권리자 | 원금 | 설정비율 | 채권최고액 | LTV

A28: 회수예상가 계산
   B28 (감정가)         : 95,000
   B29 (낙찰가율)       : _입력필요_  ← 노랑
   B30 (=B28*B29/100)   : 회수액      ← 초록 수식
   B31 (선순위)         : _입력필요_  ← 노랑
   B32 (=B30-B31)       : 당사회수가  ← 초록 수식
```

#### 시트 2: 상세담보현황 (유형별 분기)
- **아파트**: `No | 동 | 호 | 타입 | 전용면적 | 공급면적 | 감정가 | 평단가 | 분양상태`
- **지산**: `No | 동 | 층 | 호실 | 전용면적 | 감정가 | 평단가 | 임대상태`
- **토지**: `No | 지번 | 지목 | 면적(㎡) | 면적(평) | 공시지가 | 감정가 | 용도지역`

#### 시트 3: 비준사례 (3종 동일)
```
A1: 비준사례
A4:I4: 구분 | 라벨 | 소재지 | 면적(㎡) | 평단가 | 거래일/기준시점 | 평가목적 | 출처 | 비고
A5~A8 : 거래A~D (거래사례)
A10~A13: 평가1~4 (평가사례)
```

#### 시트 4: 공급/분양 (아파트/지산만)
```
A1: 공급개요

A4: 사업명     | XX재건축
A5: 시행사     | XX
A6: 시공사     | XX
A7: 규모       | 354세대 6개동
A8: 분양률     | _입력필요_
A9: 공사기간   | _입력필요_

A12: 분양현황 표
   타입 | 세대수 | 분양가 | 분양완료 | 미분양 | 분양률
```

#### 감수의견 시트 (시트 0, 첫 번째 배치)
```
A1: 감수의견 종합  (ERROR n건 / WARNING n건 / INFO n건)
A2: 추출 시점: 2026-04-17 14:30

A4:G4: 심각도 | 관점 | 카테고리 | 메시지 | 상세 | 참조시트 | 권고조치
A5~  : ERROR  | 심사역 | 회수예상가 | 회수액 음수 | 손실액 1.2억 | 담보분석!B30 | 낙찰가율 재검토
       (severity별 색상: ERROR 빨강 #FF0000 배경, WARNING 주황 #FFC000, INFO 회색 #BFBFBF)
```

---

## 8. API 명세

### POST `/api/appraisal/generate`

**Request** (`multipart/form-data`):
- `appraisalFiles`: PDF[] (필수, 1~2개)
- `feasibilityFiles`: PDF[] (선택, 0~2개)
- `propertyType`: PropertyType | 'auto' (auto면 자동감지)

**Response** (`application/json`):
```typescript
{
  success: true,
  excelBase64: string,                  // base64 encoded .xlsx
  detectedType: PropertyType,
  detectionConfidence: number,
  findings: ReviewFinding[],
  warnings: string[],
  fileName: string                      // "appraisal_광명9R_20260417_1430.xlsx"
}
```

**에러 응답**:
- `400`: PDF 손상 / 파일 누락 / 형식 오류
- `422`: `propertyType=auto` + 자동감지 confidence=0 → "수동 선택 필요"
- `500`: 서버 내부 오류 (Excel 빌드 실패 등)

---

## 9. 에러 처리

| 상황 | 처리 |
|---|---|
| PDF 파싱 전체 실패 | 400 반환, "PDF 손상" 메시지 |
| PDF 부분 추출 실패 | 해당 시트는 `_입력필요_`로 채워서 생성, INFO finding 추가 |
| 물건유형 감지 실패 | 422 반환, 사용자 수동 선택 후 재요청 |
| 사업성보고서 누락 | 공급/분양 시트 스킵 (토지PF처럼), INFO finding |
| 감수 에이전트 throw | 해당 에이전트만 빈 결과 반환, 다른 에이전트 계속 (per-auditor try/catch) |
| Excel 빌드 throw | 500 반환, 서버 로그 |

**Vercel 60초 budget**:
- PDF 파싱 ~10초 (감정평가서 100p+) + 데이터 추출 ~2초 + 감수 ~1초 + Excel 빌드 ~2초 = **여유 ~45초**

---

## 10. 테스트 전략

| 레벨 | 대상 | 방법 |
|---|---|---|
| 단위 | `property-detector.ts` | 키워드 텍스트 픽스처 4종(apt/industrial/land/혼합) → 정확도 100% |
| 단위 | `appraiser-auditor.ts` | 위반 케이스 픽스처(평가방법 110%, 단가 50% 괴리 등) → ERROR/WARNING 정확 발생 |
| 단위 | `reviewer-auditor.ts` | LTV 81%, 회수액 음수 등 위반 픽스처 → ERROR 발생 |
| 단위 | `sheet-builders/*` | mock data → ExcelJS Workbook → 셀 값/병합/스타일 스냅샷 |
| 통합 | `orchestrator.ts` | parser→detector→auditors→builder mock E2E |
| 실데이터 | 3종 샘플 PDF | `_archive/`/`_reference/`의 광명9R/에이엠플러스/휴먼스 PDF 실파일 |

**검증 체크리스트** (실데이터):
- [ ] 아파트PF (광명9R 또는 남구덕림): 감수의견+4개 시트 생성, 핵심 필드 추출
- [ ] 지산센터 (에이엠플러스인덕원): 호별 상세 170개 행 정확
- [ ] 토지PF (휴먼스PFV): 필지별 상세 + 공급 시트 스킵 확인
- [ ] 감수 에이전트 false positive 미발생 확인

---

## 11. 구현 Phase

### Phase 1: 기반 모듈 (병렬 가능)
- `types/appraisal.ts` 확장 (PropertyType, AppraisalData, ReviewFinding)
- `appraisal/property-detector.ts`
- `appraisal/auditors/findings-types.ts`
- `appraisal/sheet-builders/form-styles.ts`

### Phase 2a: 감수 에이전트 (Phase 1 완료 후)
- `appraisal/auditors/appraiser-auditor.ts`
- `appraisal/auditors/reviewer-auditor.ts`
- 단위 테스트 (위반 케이스 픽스처)

### Phase 2b: 시트 빌더 (Phase 1 완료 후, 2a와 병렬)
- `appraisal/sheet-builders/audit-findings.ts`
- `appraisal/sheet-builders/collateral-summary.ts`
- `appraisal/sheet-builders/collateral-detail.ts`
- `appraisal/sheet-builders/comparatives.ts`
- `appraisal/sheet-builders/supply-status.ts`

### Phase 3: 유형별 템플릿 + 오케스트레이터 (2a/2b 완료 후)
- `appraisal/property-templates/apartment-pf.ts`
- `appraisal/property-templates/industrial-center.ts`
- `appraisal/property-templates/land-pf.ts`
- `appraisal/orchestrator.ts`

### Phase 4: API + UI (Phase 3 완료 후)
- `api/appraisal/generate/route.ts`
- `app/appraisal/page.tsx` 재작성
- 통합 테스트 + 실데이터 검증

### Phase 5: 기존 코드 정리
- `appraisal-excel.ts` 슬림화 (시산가액·경매통계만 보존)
- `appraisal-parser.ts` 반환 타입을 `AppraisalData`로 명세화

---

## 12. 기존 스펙(2026-03-30) 대비 변경 요약

| 항목 | 2026-03-30 스펙 | 본 스펙 |
|---|---|---|
| 외부 데이터 | 인포케어 + 공공API 포함 | **제외** |
| 편집 UX | Step 위저드 + 4탭 웹 폼 | **다운로드 후 엑셀 직접 편집** |
| 시트 구조 | 양식 ↔ 데이터 이원화 + 수식 참조 | **양식 시트 단일** (계산 셀만 수식) |
| 물건유형 | 8종(아파트/지산/오피/토지/근생/상가 등) | **3종 우선** (아파트PF/지산/토지PF) |
| 감수 단계 | 없음 | **2개 에이전트** (감정평가사/심사역) |
| 감지 방식 | 사용자 수동 | **자동감지 + 수동 수정** |
| 모듈 구조 | flat (`lib/*` 직접) | **`lib/appraisal/` 디렉토리 + sheet-builders/ + auditors/ + property-templates/** |

---

## 13. 다음 단계

1. 본 스펙 user 리뷰 → 승인
2. `writing-plans` skill로 구현 계획서 작성 (Phase 1~5 task 분해)
3. Phase 1부터 순차 구현
