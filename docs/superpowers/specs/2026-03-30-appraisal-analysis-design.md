# 감정평가서 분석 자동화 도구 설계서

> 작성일: 2026-03-30
> 상태: Draft → Review

## 1. 개요

### 목적
감정평가서 및 사업성평가보고서 PDF를 업로드하고, 핵심 데이터를 자동/반자동으로 추출하여 여신승인신청서의 담보분석 섹션에 필요한 정보를 Excel로 생성하는 도구.

### 핵심 요구사항
- **입력**: 감정평가서 PDF 1~2개, 사업성평가보고서 PDF 0~2개, IM 등 참고자료
- **추출 수준**: 테이블 + 핵심 키워드 자동 추출, 서술형은 사용자 수동 입력
- **외부 데이터**: 인포케어 낙찰통계(크롤링), 실거래가/공시지가/분양가(API), 모두 출처 필수
- **출력**: Excel (신청서 양식 시트 + 데이터 시트), 사용자가 변형 가능
- **통합 위치**: 기존 웹앱 `/appraisal` 페이지

### 참고 샘플 신청서
1. `81.기업금융1본부_남구덕림지역주택조합` — 아파트 PF (담보분석 p4, 비준사례 p8, 사업성 p9, 공급 p11, 입지 p13)
2. `81.기업금융1본부_휴먼스홀딩스제1차PFV` — 토지 PF 브릿지 (담보 p3, 토지조서 p4)
3. `[오케이저축은행]에이엠플러스인덕원` — 지식산업센터 (담보 p3, 비준 p8-9, 사업성 p10, 공급 p12, 시장환경 p18)

---

## 2. 전체 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                /appraisal 페이지                      │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ PDF 업로드 │  │ 소재지 입력│  │ IM자료 첨부│            │
│  │(감정평가서)│  │(주소검색) │  │(PDF/Excel)│            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │              │              │                  │
│  ┌────▼──────────────▼──────────────▼────┐            │
│  │          데이터 수집 레이어             │            │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────┐ │            │
│  │  │PDF 파싱  │ │외부 API  │ │인포케어  │ │            │
│  │  │(서버)   │ │(실거래가 │ │크롤링   │ │            │
│  │  │         │ │공시지가) │ │(낙찰통계)│ │            │
│  │  └────┬────┘ └────┬─────┘ └────┬────┘ │            │
│  └───────┼───────────┼────────────┼──────┘            │
│          │           │            │                    │
│  ┌───────▼───────────▼────────────▼──────┐            │
│  │        구조화된 JSON (state)           │            │
│  └───────────────────┬───────────────────┘            │
│                      │                                │
│  ┌───────────────────▼───────────────────┐            │
│  │         편집 가능한 웹 폼               │            │
│  │  탭: 담보분석 | 공급개요 | 비준사례 |   │            │
│  │       시장환경                          │            │
│  └───────────────────┬───────────────────┘            │
│                      │                                │
│  ┌───────────────────▼───────────────────┐            │
│  │    Excel 다운로드 (양식시트+데이터시트)  │            │
│  └───────────────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

**접근 방식**: 서버 중심 파이프라인 (방식 A). 인포케어 크롤링은 Vercel 서버리스에서 `@sparticuz/chromium` + `puppeteer-core`로 시도, 실패 시 Cloud Functions로 분리 (방식 C fallback).

---

## 3. 데이터 모델

### 3.1 최상위 — AppraisalCase

```typescript
interface AppraisalCase {
  id: string;
  caseName: string;                  // 건명
  borrowerName: string;              // 차주명
  address: {
    sido: string;                    // 시/도
    gugun: string;                   // 구/군
    dong: string;                    // 동
    detail: string;                  // 상세주소
    full: string;                    // 전체주소
  };
  propertyType: PropertyType;
  files: UploadedFile[];
  collateral: CollateralAnalysis;
  auctionStats: AuctionStats;
  recoveryEstimate: RecoveryEstimate;
  supply: SupplyOverview;
  collateralDetail: CollateralDetailItem[];
  comparatives: ComparativeCase[];
  marketAnalysis: MarketAnalysis;
  createdAt: string;
  updatedAt: string;
}

type PropertyType = '아파트' | '지식산업센터' | '오피스텔' | '오피스' | '토지' | '근린생활시설' | '상가' | '기타';
```

### 3.2 담보분석 — CollateralAnalysis

```typescript
interface CollateralAnalysis {
  owner: string;                     // 소유자
  trustee: string;                   // 위탁자
  appraiser: string;                 // 평가기관
  debtor: string;                    // 채무자
  purpose: string;                   // 평가목적
  submittedTo: string;               // 제출처
  baseDate: string;                  // 기준시점
  serialNo: string;                  // 일련번호
  method: {                          // 평가방법
    comparison: number;              // 비교방식 비중(%)
    cost: number;                    // 원가방식 비중(%)
    income: number;                  // 수익방식 비중(%)
  };
  appraisalValue: number;            // 감정평가액 (백만원)
  formRequirements: {                // 형식요건
    officialAppraisal: boolean;      // 정식감정평가
    signatureComplete: boolean;      // 서명날인 완료
    forFinancialUse: boolean;        // 금융기관 제출용도
    reused: boolean;                 // 습용 여부
    reusedNote: string;              // 습용 조건
    conditional: boolean;            // 조건부감정
  };
  items: CollateralItem[];           // 담보물 목록
  totalArea: number;                 // 총 면적 (㎡)
  totalAreaPyeong: number;           // 총 면적 (평)
  collateralRatio: number;           // 담보인정비율 (%)
  priorClaims: number;               // 선순위 (백만원)
  availableValue: number;            // 담보가용가 (백만원)
  ltv: number;                       // LTV (%)
  rights: RightEntry[];              // 권리현황
  remarks: string;                   // 참고사항
  opinion: string;                   // 심사의견
}

interface CollateralItem {
  type: string;                      // 종류 (공동주택, 토지, 지산 등)
  quantity: number;                  // 수량 (세대수/호실수/필지수)
  areaSqm: number;                   // 면적 (㎡)
  areaPyeong: number;                // 면적 (평)
  appraisalValue: number;            // 감정가 (백만원)
  collateralRatio: number;           // 담보인정비율 (%)
  priorClaims: number;               // 선순위
  availableValue: number;            // 담보가용가
  ltv: number;
}

interface RightEntry {
  order: number;                     // 순위
  type: string;                      // 권리종류 (우선수익권, 수분양자 계약금 등)
  holder: string;                    // 권리자명
  principal: number;                 // 원금
  settingRatio: number;              // 설정비율 (%)
  maxClaim: number;                  // 채권최고액
  ltv: number;
}
```

### 3.3 낙찰통계 — AuctionStats

```typescript
interface AuctionStats {
  region: string;                    // 광역시/도 (예: "광주")
  district: string;                  // 구 (예: "남구")
  dong: string;                      // 동 (예: "월산동")
  propertyType: string;              // 용도 (아파트/공장/근생 등)
  baseMonth: string;                 // 기준월 (예: "2026.02")
  stats: AuctionStatRow[];
  source: '인포케어';
  retrievedAt: string;               // 조회일시 (ISO)
}

interface AuctionStatRow {
  period: '12개월' | '6개월' | '3개월';
  regional: { rate: number; count: number };  // 광역시/도 수준
  district: { rate: number; count: number };  // 구/군 수준
  dong: { rate: number; count: number };      // 동 수준
}
```

### 3.4 회수예상가 — RecoveryEstimate

```typescript
interface RecoveryEstimate {
  appraisalValue: number;            // 감정가 (백만원)
  appliedRate: number;               // 적용 낙찰가율 (%)
  appliedPeriod: string;             // 적용 기간 (예: "3개월")
  appliedLevel: string;              // 적용 수준 (예: "남구")
  priorClaims: number;               // 선순위 (백만원)
  pariPassuShare: number;            // 동순위 당사 지분 (%)
  distributionAmount: number;        // 배분액
  recoveryAmount: number;            // 당사 회수액
  lossAmount: number;                // 손실액
  opinion: string;                   // 심사의견 (자동 생성 + 편집 가능)
}
```

### 3.5 공급개요 — SupplyOverview

```typescript
interface SupplyOverview {
  project: {
    name: string;                    // 사업명
    purpose: string;                 // 사업목적물
    developer: string;               // 시행사
    constructor: string;             // 시공사
    address: string;                 // 소재지
    zoning: string;                  // 용도지역/지구
    landArea: { sqm: number; pyeong: number };
    buildingArea: { sqm: number; pyeong: number };
    grossArea: { sqm: number; pyeong: number };
    coverageRatio: number;           // 건폐율
    floorAreaRatio: number;          // 용적률
    parking: number;                 // 주차대수
    scale: string;                   // 규모 (예: "지하2층~지상15층 7개동")
    constructionPeriod: string;      // 공사기간
    completionDate: string;          // 준공일
    salesRate: number;               // 분양률 (%)
  };
  supplyTable: SupplyRow[];          // 공급 테이블 (타입별)
  salesStatus: SalesStatusRow[];     // 분양현황
}

interface SupplyRow {
  category: string;                  // 구분 (조합원분양/일반분양/근생 등)
  type: string;                      // 타입 (59A, 84B 등)
  units: number;                     // 세대수/호실수
  areaSqm: number;                   // 전용면적 (㎡)
  areaPyeong: number;                // 전용면적 (평)
  pricePerPyeong: number;            // 평당가 (백만원)
  pricePerUnit: number;              // 세대당/호실당 (백만원)
  totalPrice: number;                // 총액 (백만원)
  ratio: number;                     // 비중 (%)
}

interface SalesStatusRow {
  type: string;
  totalUnits: number;
  totalAmount: number;
  soldUnits: number;
  soldAmount: number;
  unsoldUnits: number;
  unsoldAmount: number;
  salesRateUnits: number;            // 분양률 (호실 기준)
  salesRateAmount: number;           // 분양률 (금액 기준)
}
```

### 3.6 상세담보현황 — CollateralDetailItem

```typescript
interface CollateralDetailItem {
  no: number;
  unit: string;                      // 호실/동호수/지번
  floor: string;                     // 층수
  areaSqm: number;                   // 전용면적 (㎡)
  areaPyeong: number;                // 전용면적 (평)
  appraisalValue: number;            // 감정가 (백만원)
  planPrice: number;                 // 계획분양가 (백만원)
  releaseCondition: number;          // 해지조건 금액 (백만원)
  appraisalPricePerPyeong: number;   // 감정 평단가
  planPricePerPyeong: number;        // 분양 평단가
  status: '분양' | '미분양' | '계약' | '잔금납부';
  remarks: string;
}
```

### 3.7 비준사례 — ComparativeCase

```typescript
interface ComparativeCase {
  type: '거래' | '평가';
  label: string;                     // 거래A, 평가1 등
  address: string;                   // 소재지
  buildingName: string;              // 건물명
  unit: string;                      // 호수
  areaSqm: number;                   // 면적 (㎡)
  areaPyeong: number;                // 면적 (평)
  usage: string;                     // 이용상황 (아파트/지산/근생 등)
  price: number;                     // 감정가 또는 거래가 (백만원)
  pricePerPyeong: number;            // 평단가 (백만원)
  baseDate: string;                  // 기준시점/거래일
  purpose: string;                   // 평가목적 (담보/경매 등) — 평가사례만
  source: string;                    // 출처
}
```

### 3.8 시장환경 — MarketAnalysis

```typescript
interface MarketAnalysis {
  location: {
    description: string;             // 입지환경 서술 (사용자 작성)
    transportation: string;          // 교통 환경
    education: string;               // 교육 환경
    amenities: string;               // 생활 편의시설
  };
  apartmentStats: {                  // 지역 아파트 현황
    region: string;
    data: RegionalAptRow[];
    source: string;                  // 출처
    retrievedAt: string;
  };
  unsoldStats: {                     // 미분양 현황
    data: UnsoldRow[];
    source: string;
    retrievedAt: string;
  };
  realTransactions: {                // 실거래가
    data: RealTransactionRow[];
    source: string;                  // "국토교통부 실거래가 공개시스템"
    retrievedAt: string;
  };
  officialLandPrice: {               // 공시지가
    data: LandPriceRow[];
    source: string;                  // "국토교통부 부동산공시가격"
    retrievedAt: string;
  };
  supplyPipeline: {                  // 입주물량/분양가 동향
    data: SupplyPipelineRow[];
    source: string;
    retrievedAt: string;
  };
  priceComparison: {                 // 주변 시세 분석 (사용자 작성 + API 보조)
    description: string;
    nearbyComplexes: NearbyComplex[];
  };
}

interface RealTransactionRow {
  address: string;
  buildingName: string;
  areaSqm: number;
  price: number;
  pricePerPyeong: number;
  transactionDate: string;
  floor: string;
}

interface LandPriceRow {
  address: string;
  pricePerSqm: number;
  year: number;
  changeRate: number;                // 전년대비 증감률 (%)
}

interface NearbyComplex {
  name: string;
  distance: string;                  // 도보 10분, 차량 5분 등
  areaSqm: number;
  pricePerPyeong: number;
  completionYear: number;
  salesRate: number;
  source: string;
}
```

---

## 4. API 라우트 설계

### 4.1 POST /api/appraisal/parse

감정평가서/사업성보고서 PDF 업로드 → 구조화된 데이터 추출

**Request**: `multipart/form-data`
- `files`: PDF 파일 1~4개
- `propertyType`: 물건 유형
- `address`: 소재지 (키워드 매칭 보조용)

**Response**:
```json
{
  "success": true,
  "extracted": {
    "collateral": { ... },       // CollateralAnalysis (부분)
    "comparatives": [ ... ],     // ComparativeCase[]
    "supply": { ... },           // SupplyOverview (부분)
    "collateralDetail": [ ... ]  // CollateralDetailItem[]
  },
  "confidence": {
    "collateral": 0.85,
    "comparatives": 0.72,
    "supply": 0.68
  },
  "warnings": [
    "비준사례 표 2개 중 1개 추출 실패 — 수동 입력 필요"
  ]
}
```

**구현**: `lib/appraisal-parser.ts`
- `pdfjs-dist`의 `getTextContent()` + 좌표 기반 테이블 추출 (Vercel 서버리스 호환)
- 기존 `upload/route.ts`의 X좌표 기반 3컬럼 파싱 확장
- 테이블 추출: Y좌표 기반 행 그룹핑 → X좌표 기반 열 분리 → 헤더 패턴 매칭
- 키워드 추출: 정규식으로 감정평가액, 소재지, 면적, 소유자 등 매칭
- 신뢰도: 추출된 필드 수 / 기대 필드 수

### 4.2 POST /api/appraisal/infocare

인포케어 낙찰통계 크롤링

**Request**:
```json
{
  "sido": "광주광역시",
  "gugun": "남구",
  "dong": "월산동",
  "propertyType": "아파트"
}
```

**Response**:
```json
{
  "success": true,
  "auctionStats": {
    "baseMonth": "2026.02",
    "stats": [
      {
        "period": "3개월",
        "regional": { "rate": 81.03, "count": 151 },
        "district": { "rate": 82.21, "count": 21 },
        "dong": { "rate": 83.44, "count": 2 }
      }
    ],
    "source": "인포케어",
    "retrievedAt": "2026-03-30T10:00:00Z"
  }
}
```

**구현**: `lib/infocare-crawler.ts`
- `@sparticuz/chromium` + `puppeteer-core` (Vercel 서버리스)
- 로그인 → 낙찰통계 메뉴 → 검색조건 입력 → 결과 테이블 파싱
- 인증: `process.env.INFOCARE_ID`, `process.env.INFOCARE_PW`
- Timeout: 30초, 실패 시 `{ success: false, fallback: "manual" }` 반환

### 4.3 POST /api/appraisal/market-data

외부 API 일괄 호출 (실거래가, 공시지가, 분양가 동향)

**Request**:
```json
{
  "address": { "sido": "광주광역시", "gugun": "남구", "dong": "월산동" },
  "propertyType": "아파트",
  "areaRange": { "min": 59, "max": 85 }
}
```

**Response**: 실거래가/공시지가/분양가 데이터 + 각각 `source`와 `retrievedAt` 포함

**구현**: `lib/market-api.ts`
- 국토부 실거래가 API (data.go.kr)
- 국토부 공시지가 API (data.go.kr)
- HUG 분양정보 (data.go.kr 또는 크롤링)
- 모든 응답에 출처 + 조회일시 자동 포함

### 4.4 POST /api/appraisal/excel

전체 데이터 → Excel 파일 생성

**Request**: `AppraisalCase` JSON 전체

**Response**: Excel 파일 (octet-stream)

**시트 구성**:

| 시트명 | 유형 | 내용 |
|--------|------|------|
| 담보분석 | 양식 | 샘플 신청서 p4 레이아웃 재현 |
| 비준사례 | 양식 | 샘플 신청서 p8 레이아웃 재현 |
| 공급개요 | 양식 | 샘플 신청서 p11 레이아웃 재현 |
| 상세담보현황 | 양식 | 샘플 신청서 p5/p13 레이아웃 재현 |
| 시장환경 | 양식 | 샘플 신청서 p13/p18 레이아웃 재현 |
| DATA_담보 | 데이터 | 원본 데이터 (수식 참조 원본) |
| DATA_비준 | 데이터 | 원본 데이터 |
| DATA_공급 | 데이터 | 원본 데이터 |
| DATA_시장 | 데이터 | 원본 데이터 |

- 양식 시트: 셀 병합, 테두리, 배경색 등 신청서 서식 재현
- 양식 시트의 값은 데이터 시트를 참조하는 Excel 수식
- 사용자가 데이터 시트 수정 시 양식 시트에 자동 반영

**구현**: `lib/appraisal-excel.ts` (ExcelJS 기반, 기존 `excel-generator.ts` 패턴 재사용)

---

## 5. PDF 파싱 전략

### 5.1 감정평가서에서 추출할 항목

| 추출 대상 | 추출 방식 | 기대 신뢰도 |
|-----------|----------|:----------:|
| 감정평가액, 면적, 단가 | 키워드 주변 숫자 매칭 | 높음 |
| 소재지, 소유자, 평가기관, 채무자 | "소재지", "소유자" 등 레이블 옆 텍스트 | 높음 |
| 기준시점, 일련번호 | 키워드 옆 날짜/코드 패턴 | 높음 |
| 평가방법 (비교/원가/수익 비중) | 체크마크(■/□) + 퍼센트 패턴 | 중간 |
| 비준사례 테이블 | pdfplumber extract_tables() | 중간 |
| 토지조서/호별 상세 테이블 | pdfplumber extract_tables() | 중간 |
| 용도지역, 건폐율, 용적률 | 키워드 매칭 | 중간 |

### 5.2 구현 모듈: appraisal-parser.ts

```
appraisal-parser.ts
├── parseAppraisalPdf(buffer) → AppraisalParseResult
│   ├── extractTextAndTables(buffer)     // pdfplumber 호출
│   ├── identifySections(pages)          // 섹션 식별 (담보물조사, 비준사례 등)
│   ├── extractCollateralInfo(section)   // 키워드 기반 정보 추출
│   ├── extractComparatives(tables)      // 비준사례 테이블 파싱
│   ├── extractSupplyTable(tables)       // 공급개요 테이블 파싱
│   └── extractDetailTable(tables)       // 상세담보 테이블 파싱
```

Node.js 전용 구현 (Vercel 서버리스 호환):
- `pdfjs-dist` getTextContent() → 좌표 기반 테이블 추출
- 기존 upload/route.ts의 parsePdf() 패턴 재사용 + 감정평가서 전용 섹션 식별 로직 추가

---

## 6. 인포케어 크롤링 설계

### 6.1 크롤링 흐름

```
1. Puppeteer 브라우저 실행 (@sparticuz/chromium)
2. https://infocare.co.kr 접속
3. 로그인 (ID: env.INFOCARE_ID, PW: env.INFOCARE_PW)
4. 낙찰통계 메뉴 진입
5. 검색조건 입력:
   - 소재지: 시/도 → 구/군 → 동 (드롭다운 순차 선택)
   - 용도: 아파트/공장/근생 등
6. 검색 실행
7. 결과 테이블 파싱:
   - 12개월/6개월/3개월 평균
   - 각 기간별 광역시/구/동 수준의 낙찰가율 + 건수
8. JSON 반환
9. 브라우저 종료
```

### 6.2 Vercel 서버리스 제약 대응

- 실행 시간: Vercel Pro 기준 최대 60초 → 크롤링 timeout 30초 설정
- 바이너리 크기: `@sparticuz/chromium` ~50MB (Vercel 250MB 제한 내)
- 메모리: 1024MB 설정 권장
- **Fallback**: 크롤링 실패 시 사용자에게 수동 입력 폼 제공 + 인포케어 직접 링크

---

## 7. 외부 API 연동

### 7.1 국토부 실거래가 API

- **엔드포인트**: `http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev`
- **파라미터**: 법정동코드 (5자리), 거래년월 (YYYYMM)
- **인증**: 공공데이터포털 API 키 (`.env.local`에 추가 필요)
- **출처 표기**: `"국토교통부 실거래가 공개시스템 (조회일: YYYY.MM.DD)"`

### 7.2 국토부 공시지가 API

- **엔드포인트**: data.go.kr 개별공시지가 API
- **파라미터**: PNU 코드 (19자리)
- **출처 표기**: `"국토교통부 부동산공시가격 (YYYY년)"`

### 7.3 HUG 분양정보

- **엔드포인트**: data.go.kr 미분양주택현황 API
- **파라미터**: 시군구코드, 기간
- **출처 표기**: `"주택도시보증공사 분양정보 (조회일: YYYY.MM.DD)"`

### 7.4 API 키 관리

`.env.local`에 추가 필요:
```
DATA_GO_KR_API_KEY=<공공데이터포털 API 키>
```

---

## 8. 웹 UI 설계

### 8.1 페이지 흐름 (Step-by-Step)

**Step 1: 업로드 & 기본정보**
- 건명 (필수), 차주명 (필수), 소재지 (주소 검색 — 시/구/동 자동 분리)
- 물건 유형 선택 (아파트/지산센터/오피스텔/토지/근생/기타)
- 감정평가서 PDF 1~2개 (드래그앤드롭)
- 사업성평가보고서 PDF 0~2개 (드래그앤드롭)
- IM 등 참고자료 (드래그앤드롭, 다건)
- [분석 시작] 버튼

**Step 2: 자동 추출 진행 (로딩 화면)**
- 3개 작업 병렬 실행: PDF 파싱 / 인포케어 크롤링 / 외부 API
- 각 작업별 진행 상태 표시 (스피너 + 성공/실패 아이콘)
- 완료 후 추출 결과 요약 (추출 성공 항목 수 / 수동 입력 필요 항목)

**Step 3: 편집 (탭 구조)**
- 4개 탭: 담보분석 | 공급개요 | 비준사례 | 시장환경
- 각 탭에 자동 추출된 값이 프리필 (노란색 배경으로 표시)
- 사용자가 값 수정/추가/삭제 가능
- 외부 API 데이터는 출처 배지 표시
- 인포케어 데이터는 "인포케어 (조회일: 2026.03.30)" 배지
- 회수예상가: 감정가 × 낙찰가율 자동 계산 (사용자가 적용 기간/수준 선택)

**Step 4: Excel 다운로드**
- [Excel 다운로드] 버튼
- 양식 시트 + 데이터 시트 포함
- 다운로드 후에도 웹에서 계속 편집 가능

### 8.2 기존 UI 변경사항

현재 `/appraisal/page.tsx`: 단일 파일 업로드 + mock 결과 테이블
→ 전면 개편: Step-by-Step 위저드 + 4탭 편집 화면

---

## 9. 파일 구조

### 신규 파일

```
app/src/
├── app/
│   ├── appraisal/
│   │   └── page.tsx                  ← 전면 개편
│   └── api/appraisal/
│       ├── parse/route.ts            ← PDF 파싱 API
│       ├── infocare/route.ts         ← 인포케어 크롤링 API
│       ├── market-data/route.ts      ← 외부 API 집계
│       └── excel/route.ts            ← Excel 생성 API
├── lib/
│   ├── appraisal-parser.ts           ← 감정평가서 PDF 전용 파서
│   ├── infocare-crawler.ts           ← 인포케어 크롤링 모듈
│   ├── market-api.ts                 ← 실거래가/공시지가/분양가 API
│   └── appraisal-excel.ts            ← 담보분석 Excel 생성기
├── components/appraisal/
│   ├── upload-step.tsx               ← Step 1: 업로드 + 기본정보
│   ├── extraction-progress.tsx       ← Step 2: 추출 진행 상태
│   ├── collateral-tab.tsx            ← Step 3: 담보분석 편집
│   ├── supply-tab.tsx                ← Step 3: 공급개요 편집
│   ├── comparative-tab.tsx           ← Step 3: 비준사례 편집
│   ├── market-tab.tsx                ← Step 3: 시장환경 편집
│   └── excel-download.tsx            ← Step 4: Excel 다운로드
├── types/
│   └── appraisal.ts                  ← 전체 타입 정의
```

(Python pdfplumber 불사용 — pdfjs-dist 좌표 기반으로 통일, Vercel 호환)
```

### 수정 파일

- `app/src/types/index.ts` — `AppraisalResult` 타입 확장
- `app/.env.local` — `DATA_GO_KR_API_KEY` 추가

---

## 10. 구현 Phase

### Phase 1 (병렬)

| Phase 1a: 담보분석 + 낙찰통계 + 회수예상가 | Phase 1b: 공급개요 + 상세담보현황 |
|:-:|:-:|
| `types/appraisal.ts` (공통 타입) | 공통 타입 공유 |
| `lib/appraisal-parser.ts` (담보물조사 파싱) | `lib/appraisal-parser.ts` (공급/상세 파싱) |
| `lib/infocare-crawler.ts` (크롤링) | — |
| `api/appraisal/parse/route.ts` | 동일 API 활용 |
| `api/appraisal/infocare/route.ts` | — |
| `components/appraisal/collateral-tab.tsx` | `components/appraisal/supply-tab.tsx` |
| 회수예상가 자동 산출 로직 | 호별 상세 테이블 |
| `lib/appraisal-excel.ts` (담보분석 시트) | `lib/appraisal-excel.ts` (공급 시트) |

### Phase 2 (병렬)

| Phase 2a: 비준사례 | Phase 2b: 시장환경 + 입지 + 주변시세 |
|:-:|:-:|
| `lib/appraisal-parser.ts` (비준 테이블 파싱) | `lib/market-api.ts` (외부 API) |
| `components/appraisal/comparative-tab.tsx` | `api/appraisal/market-data/route.ts` |
| `lib/appraisal-excel.ts` (비준 시트) | `components/appraisal/market-tab.tsx` |
| — | `lib/appraisal-excel.ts` (시장환경 시트) |
| — | 출처 자동 기재 로직 |

### 공통 (Phase 1 시작 시)

- `/appraisal/page.tsx` 전면 개편 (Step 위저드 + 탭 구조)
- `components/appraisal/upload-step.tsx` (업로드 UI)
- `components/appraisal/extraction-progress.tsx` (진행 상태)
- `components/appraisal/excel-download.tsx` (다운로드)

---

## 11. 기술적 고려사항

### Vercel 서버리스 제약
- **인포케어 크롤링**: `@sparticuz/chromium` + `puppeteer-core`로 시도. 60초 timeout. 실패 시 Cloud Functions 분리.
- **PDF 파싱**: Python pdfplumber는 Vercel에서 실행 불가 → Node.js `pdf-parse` + 좌표 기반 파싱으로 대체하거나, pdfplumber를 Edge Function 외부 서비스로 분리
- **대안**: Vercel에서 pdfplumber 사용 불가 시 `pdfjs-dist`의 `getTextContent()` + 좌표 기반 테이블 추출 (기존 upload/route.ts 방식 확장)

### PDF 파싱 Fallback 전략
```
1차: pdfjs-dist 좌표 기반 테이블 추출 (Vercel 호환, 기존 검증된 방식)
2차: pdf-parse 텍스트 기반 패턴 매칭 (fallback)
3차: 추출 실패 → 사용자 수동 입력 (빈 폼 제공 + PDF 뷰어에서 복사 안내)
```

### 공공데이터 API 키
- 국토부 실거래가/공시지가/분양정보 API 사용을 위해 data.go.kr 회원가입 + API 키 발급 필요
- 키 미발급 시 해당 섹션은 수동 입력으로 fallback

### 인포케어 크롤링 Fallback 전략
```
1차: Vercel 서버리스에서 Puppeteer 실행
2차: 실패 시 → 사용자에게 인포케어 링크 + 수동 입력 폼
3차: (향후) Cloud Functions로 분리
```
