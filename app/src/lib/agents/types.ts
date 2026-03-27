/**
 * 에이전트 시스템 공유 타입
 * ========================
 * 오케스트레이터 → 서브에이전트 → 검수(QA) 구조의 데이터 전달 타입
 */

import type { FinancialRow, FinancialResult, DartCompanyInfo } from "../dart-api";
import type { FinancialAnalysisReport } from "../financial-analyzer";

// ============================================================
// 상태 머신
// ============================================================

export type AgentState =
  | "IDLE"
  | "COLLECTING"
  | "PARSING"
  | "MERGING"
  | "ANALYZING"
  | "BUILDING"
  | "VERIFYING"
  | "COMPLETE"
  | "ESCALATE"
  | "ERROR";

// ============================================================
// Step 1: 데이터 수집 (data-collector)
// ============================================================

/** 수집 요청 파라미터 */
export interface CollectRequest {
  corpCode: string;
  corpName: string;
  years: string[];
  fsDiv?: "OFS" | "CFS";
  /** 업로드 파일 데이터 (이미 파싱된 상태) */
  uploadData?: {
    years: string[];
    bsItems: FinancialRow[];
    isItems: FinancialRow[];
    source: string;
  };
}

/** 원본 데이터 스냅샷 — QA 검증의 기준점 */
export interface RawDataSnapshot {
  /** 수집 시각 */
  collectedAt: string;
  /** 데이터 출처 */
  sources: Array<{
    type: "DART" | "AUDIT_XML" | "UPLOAD_EXCEL" | "UPLOAD_PDF" | "FISIS";
    label: string;
  }>;
  /** DART API 원본 응답 (BS) */
  dartBsRaw: Array<{
    account: string;
    values: Record<string, string | number | undefined>;
  }>;
  /** DART API 원본 응답 (IS) */
  dartIsRaw: Array<{
    account: string;
    values: Record<string, string | number | undefined>;
  }>;
  /** 업로드 파일 원본 (있을 경우) */
  uploadBsRaw?: Array<{
    account: string;
    values: Record<string, string | number | undefined>;
  }>;
  uploadIsRaw?: Array<{
    account: string;
    values: Record<string, string | number | undefined>;
  }>;
  /** 연도 목록 */
  years: string[];
}

/** 수집 결과 */
export interface CollectResult {
  financialResult: FinancialResult;
  snapshot: RawDataSnapshot;
}

// ============================================================
// Step 2: 파싱·정규화 (parser)
// ============================================================

export interface ParsedItem {
  /** 정규화된 계정명 */
  account: string;
  /** 원본 계정명 (정규화 전) */
  originalAccount: string;
  depth?: number;
  values: Record<string, number>;
}

export interface ParsedData {
  bsItems: ParsedItem[];
  isItems: ParsedItem[];
  years: string[];
  /** 주요 계정 존재 여부 */
  keyAccountsPresent: {
    totalAssets: boolean;
    totalLiabilities: boolean;
    totalEquity: boolean;
    revenue: boolean;
    operatingProfit: boolean;
    netIncome: boolean;
  };
}

// ============================================================
// Step 3: 병합 (merger)
// ============================================================

export interface MergedData {
  bsItems: FinancialRow[];
  isItems: FinancialRow[];
  years: string[];
  /** 병합 통계 */
  mergeStats: {
    dartItemCount: number;
    uploadItemCount: number;
    mergedItemCount: number;
    unmatchedItems: Array<{
      account: string;
      source: string;
      reason: string;
    }>;
  };
}

// ============================================================
// Step 4: 분석 결과 래퍼
// ============================================================

export interface AnalysisResult {
  report: FinancialAnalysisReport;
  /** 주요 비율 값 (QA 검증용 — 직접 재계산 비교에 사용) */
  keyRatios: {
    debtRatio?: number;
    currentRatio?: number;
    roa?: number;
    roe?: number;
    operatingMargin?: number;
    netMargin?: number;
  };
}

// ============================================================
// Step 6: 검수 (qa-verifier)
// ============================================================

export type QACheckType = "파싱누락" | "계정명일치" | "수치일치" | "비율검증";
export type QACheckResult = "PASS" | "WARN" | "FAIL";
export type QAStatus = "PASS" | "AUTO_FIX" | "ESCALATE";

export interface QACheck {
  type: QACheckType;
  result: QACheckResult;
  details: string;
  /** 파싱 누락: 누락된 항목 */
  missingItems?: string[];
  /** 계정명 일치: 의심 매칭 */
  suspiciousMatches?: Array<{
    original: string;
    normalized: string;
    similarity: number;
  }>;
  /** 수치 일치: 불일치 항목 */
  mismatches?: Array<{
    account: string;
    year: string;
    original: number;
    actual: number;
    diff: number;
    diffPercent: number;
  }>;
}

export interface QAReport {
  status: QAStatus;
  timestamp: string;
  checks: QACheck[];
  /** 자동 수정 가능 항목 */
  autoFixable: Array<{
    type: string;
    description: string;
    suggestedFix: string;
  }>;
  /** 사람 검토 필요 항목 */
  needsHumanReview: Array<{
    type: string;
    description: string;
    options: string[];
  }>;
  /** 재처리 횟수 */
  retryCount: number;
}

// ============================================================
// 에스컬레이션
// ============================================================

export interface EscalationItem {
  id: string;
  type: QACheckType;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  /** 원본 값 */
  originalValue?: string | number;
  /** 현재 값 */
  currentValue?: string | number;
  /** 사용자 선택지 */
  options: Array<{
    label: string;
    action: "approve" | "useOriginal" | "manual";
    value?: string | number;
  }>;
  /** 사용자 응답 (에스컬레이션 해결 후) */
  resolution?: {
    chosenOption: string;
    resolvedAt: string;
  };
}

// ============================================================
// 오케스트레이터 컨텍스트
// ============================================================

export interface OrchestratorContext {
  state: AgentState;
  request: CollectRequest;
  /** 각 단계 결과 (인메모리 전달) */
  collectResult?: CollectResult;
  parsedData?: ParsedData;
  mergedData?: MergedData;
  analysisResult?: AnalysisResult;
  excelBuffer?: Buffer;
  qaReport?: QAReport;
  /** 에스컬레이션 항목 */
  escalations: EscalationItem[];
  /** 재처리 카운터 */
  retryCount: number;
  maxRetries: number;
  /** 타임스탬프 */
  startedAt: string;
  completedAt?: string;
  /** 로그 */
  logs: Array<{
    timestamp: string;
    agent: string;
    message: string;
    level: "info" | "warn" | "error";
  }>;
}

// ============================================================
// 오케스트레이터 최종 결과
// ============================================================

export interface OrchestratorResult {
  success: boolean;
  state: AgentState;
  /** 최종 Excel 버퍼 (PASS인 경우) */
  excelBuffer?: Buffer;
  /** QA 리포트 (항상 포함) */
  qaReport?: QAReport;
  /** 에스컬레이션 항목 (ESCALATE인 경우) */
  escalations?: EscalationItem[];
  /** 기존 FinancialResult 호환 (API route에서 사용) */
  financialResult?: FinancialResult;
  analysisReport?: FinancialAnalysisReport;
  /** 에러 메시지 */
  error?: string;
  /** 처리 로그 */
  logs: Array<{
    timestamp: string;
    agent: string;
    message: string;
    level: "info" | "warn" | "error";
  }>;
}
