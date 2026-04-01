// ─── 여신검토 워크플로우 타입 정의 ─────────────────────────────

// 딜 상태
export type DealStatus =
  | "접수"
  | "검토중"
  | "검토완료"
  | "신청서작성"
  | "승인"
  | "반려"
  | "보류";

// 부서
export type Department = "영업점" | "영추부" | "심사부";

// 의견 진행여부
export type ProgressStatus = "진행" | "보류" | "반려";

// 상품 대분류
export type ProductMajorType =
  | "PF"
  | "브릿지"
  | "기업신용"
  | "사모사채"
  | "담보대출";

// viewpoint 카테고리
export type ViewpointCategory =
  | "입지/시장"
  | "재무/신용"
  | "구조/규모"
  | "담보/보전"
  | "인허가/법률"
  | "사업성/수익성"
  | "시공/공사"
  | "기타";

// ─── 재무 스냅샷 ─────────────────────────────────────────────

export interface FinancialSnapshot {
  회사명: string;
  역할: string; // "차주" | "시공사" | "시행사" | "연대보증인" 등
  기준: string; // "연결" | "개별"
  데이터: FinancialRow[];
}

export interface FinancialRow {
  결산년월: string; // "'25.3Q", "'24 년" 등
  자산총계: number;
  부채총계: number;
  자본총계: number;
  매출액: number;
  영업이익: number;
  당기순이익: number;
}

// ─── 재무지표 ────────────────────────────────────────────────

export interface FinancialIndicator {
  name: string; // "부채비율", "영업이익률" 등
  value: string;
  status: "positive" | "negative" | "neutral";
}

// ─── 첨부파일 ────────────────────────────────────────────────

export interface DealAttachment {
  name: string;
  storagePath: string;
  type: "소개처자료" | "재무제표" | "사업수지" | "감정평가서" | "기타";
  uploadedAt: string;
}

// ─── 접수 여신 건 ────────────────────────────────────────────

export interface ReviewDeal {
  id: string;
  // 기본정보
  접수일: string; // "2026-03-17"
  구분: string; // 대출 구분명
  당행접수자: string;
  소개처: string;
  차주: string;
  주소: string;
  // 주요조건
  금리수수료기간: string; // "6.0%(참여수수료 1.0%) / 24개월"
  모집금액: string; // "총 285억원"
  모집금액_억원: number; // 285 (검색용 숫자)
  자금용도: string;
  주요채권보전: string;
  // 분류
  productType: ProductMajorType;
  productSubtype: string;
  tags: string[];
  // 재무
  재무현황: FinancialSnapshot[];
  재무지표: FinancialIndicator[];
  // 검토내용
  대출개요: string;
  // 상태
  status: DealStatus;
  // 메타
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // 첨부
  attachments: DealAttachment[];
}

// ─── 검토의견 ────────────────────────────────────────────────

export interface ReviewOpinion {
  id: string;
  dealId: string;
  // 작성자
  authorId: string;
  authorName: string;
  department: Department;
  // 의견
  장점: string[];
  단점: string[];
  진행여부: ProgressStatus;
  보완사항: string;
  컨택자: string; // 영업점만
  // 메타
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ─── 뷰포인트 (유사 사례 검색용) ─────────────────────────────

export interface ViewpointItem {
  text: string;
  category: ViewpointCategory;
  source: "analyst" | "dart" | "auto";
}

export interface ReviewViewpoint {
  id: string;
  dealId: string;
  opinionId: string;
  analystId: string;
  productType: ProductMajorType;
  productSubtype: string;
  tags: string[];
  pros: ViewpointItem[];
  cons: ViewpointItem[];
  dealName: string;
  dealAmount: string;
  summary: string;
  createdAt: string;
}

// ─── 승인 이력 ───────────────────────────────────────────────

export type ApprovalStatus = "승인" | "조건부승인" | "반려";

export interface ReviewApproval {
  id: string;
  dealId: string;
  finalStatus: ApprovalStatus;
  approvedBy: string;
  approvedAt: string;
  conditions: string;
  finalDocUrl: string;
  loanApplicationId?: string;
}

// ─── API 요청/응답 헬퍼 ──────────────────────────────────────

export interface DealListFilter {
  status?: DealStatus;
  productType?: ProductMajorType;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface SimilarSearchResult {
  deal: ReviewDeal;
  viewpoint: ReviewViewpoint;
  score: number;
}
