/**
 * 부실징후점검 — 핵심 타입 정의.
 * PDF 양식 (전수조사 부실징후점검 OO지점) 1행 = 1차주, 35컬럼 구조 매핑.
 */

export interface NameMatch {
  inputName: string;       // 사용자 입력 원본
  corpCode: string;
  corpName: string;        // DART 등록 정식 명칭
  stockCode: string;       // 빈 문자열이면 비상장
  ceo?: string;
  bizrNo?: string;
}

export interface ResolvedCompany {
  inputName: string;
  corpCode: string;
  corpName: string;
  stockCode: string;
}

export interface YearCells {
  totalAssets: number;       // 자산총계
  totalLiab: number;         // 부채총계
  totalEquity: number;       // 자본총계
  borrowings: number;        // 총차입금 (BS 차입금 SUM)
  revenue: number;           // 매출액 (영업수익/공사수익/보험수익 포함)
  operatingIncome: number;   // 영업손익
  interestExpense: number;   // 이자비용 (IS 우선, CF 이자지급 fallback)
  netIncome: number;         // 당기순손익
}

/**
 * 셀별 매칭 추적 — "어떤 DART account_name에서 추출됐는가" 추적용.
 * 사용자 피드백 ("어떤 항목으로 추출되는지 모르겠음") 대응.
 *   - exact   : 정확 매칭 (계정명 완전 일치)
 *   - partial : 부분 매칭 (계정명에 키워드 포함)
 *   - sum     : 복수 행 SUM (총차입금처럼 단기+장기+사채 합산)
 *   - fallback: 후순위 fallback (예: 이자비용 → CF 이자지급, 매출액 → 신탁 순이자이익)
 *   - missing : 매칭 실패 (값 0)
 */
export type MatchKind = "exact" | "partial" | "sum" | "fallback" | "missing";

export interface CellMatch {
  account: string;  // 매칭된 account_name (SUM이면 "단기차입금+사채+리스부채" 식)
  kind: MatchKind;
  detail?: string;  // 추가 컨텍스트 (예: "CF 이자지급", "신탁 순이자이익+순수수료이익")
}

export interface YearCellMatches {
  totalAssets: CellMatch;
  totalLiab: CellMatch;
  totalEquity: CellMatch;
  borrowings: CellMatch;
  revenue: CellMatch;
  operatingIncome: CellMatch;
  interestExpense: CellMatch;
  netIncome: CellMatch;
}

export interface Cells24 {
  // years 순서 = [직전년도, 직전전년도, 직전전전년도] (최근 → 과거)
  byYear: Record<string, YearCells>;
  /** 각 셀의 매칭 정보 — UI tooltip + Excel comment에 사용 */
  matches: Record<string, YearCellMatches>;
}

export type YN = "Y" | "N" | "-";

export interface WarningFlags {
  // 4개 자동 판정
  threeYearsLoss: YN;        // 최근3년연속 결손여부
  fullCapitalImpair: YN;     // 최근결산일현재 완전자본잠식여부 (자본총계 < 0)
  borrowGtRevenue: YN;       // 1·2금융권차입금 연간매출액초과여부 (근사: 총차입금 > 매출액)
  auditOpinionReject: YN;    // 감사의견 거절여부

  // 4개 수동 입력 (UI dropdown)
  internalConflict: "Y" | "N";   // 경영상 내분
  operationStopped: "Y" | "N";   // 3개월 이상 조업중단
  bankruptcy: "Y" | "N";          // 부도
  consortiumLoan: "Y" | "N";      // 컨소시엄대출

  // 자동 판정 근거 문자열 (UI tooltip + Excel '자동판정근거' 컬럼)
  evidence: {
    threeYearsLoss?: string;
    fullCapitalImpair?: string;
    borrowGtRevenue?: string;
    auditOpinionReject?: string;
  };
}

export interface InsolvencyRow {
  inputName: string;
  corpName: string;
  corpCode: string;
  estDt: string;             // 법인설립일 (YYYY-MM-DD 또는 YYYYMMDD)
  cells: Cells24;
  years: string[];           // [직전, 직전전, 직전전전]
  flags: WarningFlags;
  // 사용자가 dropdown으로 override한 값 (자동판정 + 수동 모두)
  flagOverrides?: Partial<Record<keyof Omit<WarningFlags, "evidence">, YN>>;
  // DART/감사보고서 fallback 추적 — UI에서 신뢰도 표시용
  source?: "stage1" | "annual-report-body" | "audit-report";
  error?: string;            // 매칭 실패/조회 실패 사유
}

export interface InsolvencyMatchResult {
  inputName: string;
  candidates: NameMatch[];   // 0건이면 매칭 실패, N건이면 dropdown
}
