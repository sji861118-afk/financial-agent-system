import JSZip from "jszip";

const DART_API_BASE = "https://opendart.fss.or.kr/api";

function getApiKey(): string {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 환경변수가 설정되지 않았습니다.");
  return key;
}

export interface DartCompanyInfo {
  corpCode: string;
  corpName: string;
  ceoNm: string;
  jurirNo: string;
  bizrNo: string;
  adres: string;
  estDt: string;
  indutyCode: string;
  accMt: string;
  stockCode: string;
  corpCls: string;
}

export async function getCompanyInfo(corpCode: string): Promise<DartCompanyInfo> {
  const apiKey = getApiKey();
  const url = `${DART_API_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;
  const res = await fetch(url);
  const d = await res.json();

  if (d.status !== "000") {
    return {
      corpCode, corpName: "", ceoNm: "", jurirNo: "", bizrNo: "",
      adres: "", estDt: "", indutyCode: "", accMt: "", stockCode: "", corpCls: "",
    };
  }

  return {
    corpCode,
    corpName: d.corp_name || "",
    ceoNm: d.ceo_nm || "",
    jurirNo: d.jurir_no || "",
    bizrNo: d.bizr_no || "",
    adres: d.adres || "",
    estDt: d.est_dt || "",
    indutyCode: d.induty_code || "",
    accMt: d.acc_mt || "",
    stockCode: d.stock_code || "",
    corpCls: d.corp_cls || "",
  };
}

interface DartRawItem {
  sj_div: string;
  account_id: string;
  account_nm: string;
  thstrm_amount: string;
  thstrm_add_amount?: string;   // 분기보고서 누적금액
  frmtrm_amount: string;
  frmtrm_add_amount?: string;   // 전기 분기보고서 누적금액
  bfefrmtrm_amount: string;
  ord: string;
}

const REPRT_LABELS: Record<string, string> = {
  "11011": "사업보고서",
  "11014": "3분기보고서",
  "11012": "반기보고서",
  "11013": "1분기보고서",
};

const REPRT_MONTH: Record<string, string> = {
  "11011": "12",
  "11014": "09",
  "11012": "06",
  "11013": "03",
};

async function fetchFinancialItems(
  corpCode: string,
  year: string,
  fsDiv: string
): Promise<{ items: DartRawItem[]; reprtCode: string }> {
  const apiKey = getApiKey();
  for (const reprt of ["11011", "11014", "11012"]) {
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprt,
      fs_div: fsDiv,
    });
    const url = `${DART_API_BASE}/fnlttSinglAcntAll.json?${params}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const d = await res.json();
      if (d.status === "000" && d.list?.length) {
        if (reprt !== "11011") {
          console.log(`[DART] ${year}년: 사업보고서 없음 → ${REPRT_LABELS[reprt]}(${reprt}) 사용 (IS는 분기/반기 데이터)`);
        }
        return { items: d.list, reprtCode: reprt };
      }
    } catch (e) {
      console.warn(`[DART] fetchFinancialItems ${year}/${reprt}/${fsDiv} failed:`, e instanceof Error ? e.message : e);
      continue;
    }
  }
  return { items: [], reprtCode: "" };
}

function toMillions(val: string | undefined): string {
  if (!val || val.trim() === "" || val.trim() === "-") return "-";
  const cleaned = val.replace(/,/g, "").replace(/\s/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return val;
  const m = num / 1_000_000;
  if (Math.abs(m) >= 1) return m.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  if (m === 0) return "-";
  return m.toFixed(1);
}

// 엑셀에 포함하면 안 되는 주당 지표 (원/주 단위 → 백만원 변환 시 의미 없음)
const EXCLUDED_ACCOUNTS = [
  "기본주당이익", "희석주당이익", "기본주당순이익", "희석주당순이익",
  "기본주당손실", "희석주당손실", "기본주당순손실", "희석주당순손실",
  "주당이익", "주당순이익", "주당손실", "주당순손실",
  "기본주당계속영업이익", "희석주당계속영업이익",
  "기본주당중단영업이익", "희석주당중단영업이익",
];

function isExcludedAccount(accountNm: string): boolean {
  const nm = accountNm.replace(/\s/g, "");
  return EXCLUDED_ACCOUNTS.some((ex) => nm === ex || nm.includes("주당이익") || nm.includes("주당손실") || nm.includes("주당순이익") || nm.includes("주당순손실"));
}

/** 계정명에서 주석번호 추출: "(주석5,6)" → "5,6", "(주12,18)" → "12,18" */
function extractNoteRef(s: string): string | undefined {
  const m = s.match(/\(주석?([\d,\s]+)\)/);
  if (m) return m[1].replace(/\s/g, "");
  const m2 = s.match(/\(Note\s*([\d,\s]+)\)/i);
  if (m2) return m2[1].replace(/\s/g, "");
  return undefined;
}

function normalizeAcct(s: string): string {
  let n = s.replace(/\s/g, "");
  // 로마숫자/숫자 접두사 제거: Ⅰ.유동자산 → 유동자산
  n = n.replace(/^[IⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩivxlcdm\d]+[.·\s]+/, "");
  // (숫자) 접두사 제거: (1)당좌자산 → 당좌자산
  n = n.replace(/^\(\d+\)/, "");
  // 주석번호 모든 패턴 제거:
  //   (주석5), (주석5,6), (주12,18,19,25), (주 12), (Note5), (注5)
  n = n.replace(/\(주석?[\d,\s]*\)/g, "");
  n = n.replace(/\(Note\s*[\d,\s]*\)/gi, "");
  n = n.replace(/\(注[\d,\s]*\)/g, "");
  return n;
}

/**
 * 계정명 매칭용 정규화 — 연도간 표기 변경 흡수
 * "영업이익(손실)" → "영업이익", "당기순이익(손실)" → "당기순이익",
 * "연결당기순이익" → "당기순이익", "연결총포괄손익" → "총포괄손익"
 */
function normalizeForMatch(s: string): string {
  let n = s.trim();
  // (손실), (이익) 접미사 제거
  n = n.replace(/\(손실\)$/g, "");
  n = n.replace(/\(이익\)$/g, "");
  // "연결" 접두사 제거 (연결당기순이익 → 당기순이익)
  n = n.replace(/^연결/, "");
  return n;
}

function parseNum(s: string): number {
  if (!s || s.trim() === "-" || s.trim() === "") return 0;
  let str = s.trim();
  const negative = str.startsWith("(") && str.endsWith(")");
  str = str.replace(/[(),\s]/g, "");
  const v = parseFloat(str);
  if (isNaN(v)) return 0;
  return negative ? -v : v;
}

export interface FinancialRow {
  account: string;
  depth?: number; // 0=총계, 1=중분류, 2=세부항목
  noteRef?: string; // 감사보고서 주석번호 (예: "5", "12,18")
  [year: string]: string | number | undefined;
}

export interface FinancialResult {
  companyInfo: DartCompanyInfo;
  // 개별(OFS)
  bsItems: FinancialRow[];
  isItems: FinancialRow[];
  cfItems: FinancialRow[];   // 현금흐름표
  ratios: Record<string, Record<string, string>>;
  hasOfs: boolean;
  // 연결(CFS)
  bsItemsCfs: FinancialRow[];
  isItemsCfs: FinancialRow[];
  cfItemsCfs: FinancialRow[]; // 현금흐름표(연결)
  ratiosCfs: Record<string, Record<string, string>>;
  hasCfs: boolean;
  years: string[];
  source: string;
  hasData: boolean;
  noDataReason?: string;
  // 감사보고서 주석 섹션 (번호 → 텍스트)
  notesSections?: Record<string, string>;
  // 회계기준 변경 감지 (K-IFRS↔K-GAAP) — UI 토스트/경고용
  accountingStandardChanged?: boolean;
  // 데이터 출처: 'stage1'=fnlttSinglAcntAll, 'annual-report-body'=사업보고서 본문 XML,
  // 'audit-report'=감사보고서 ZIP. OFS/CFS 각각 독립 추적.
  extractionSourceOfs?: "stage1" | "annual-report-body" | "audit-report";
  extractionSourceCfs?: "stage1" | "annual-report-body" | "audit-report";
}

// ── 계정과목 계층 depth 추론 (전 산업 범용) ──

// depth 0: 최상위 총계 — 볼드, 들여쓰기 없음
const DEPTH0_KEYWORDS = new Set([
  // BS 총계
  "자산총계", "자산합계", "부채총계", "부채합계", "자본총계", "자본합계",
  "부채와자본총계", "부채및자본총계", "자본과부채총계", "부채와자본합계",
  // IS 핵심 지표
  "매출액", "영업수익", "영업이익", "영업이익(손실)", "영업손실", "영업손익",
  "당기순이익", "당기순이익(손실)", "당기순손실", "당기순손익",
  "반기순이익", "반기순손실", "분기순이익", "분기순손실",
  "법인세비용차감전순이익", "법인세비용차감전순손익",
  "법인세비용차감전순손실", "법인세비용차감전이익",
  "법인세비용차감전손실", "법인세비용차감전손익",
  "법인세차감전순이익", "법인세차감전순손실",
  "법인세차감전계속영업이익", "법인세차감전계속영업손실",
  "총포괄손익", "총포괄이익", "당기총포괄손익", "당기총포괄이익",
  "반기총포괄손익", "분기총포괄손익",
  // 건설업
  "공사수익", "도급수익", "건설수익", "분양수익",
  // 보험업
  "보험수익", "보험료수익", "수입보험료",
  // 금융업
  "순영업수익", "순영업수익합계", "영업수익합계",
  "이자수익합계", "순이자손익",
]);

// depth 1: 중분류 — 볼드, 2칸 들여쓰기
const DEPTH1_KEYWORDS = new Set([
  // ── BS 일반 (K-IFRS / K-GAAP 공통) ──
  "유동자산", "비유동자산", "유동부채", "비유동부채",
  "당좌자산", "고정자산", "고정부채",           // K-GAAP
  "투자자산", "재고자산", "기타비유동자산",
  "투자부동산",

  // ── BS 자본 구성 ──
  "자본금", "자본잉여금", "자본조정",
  "이익잉여금", "결손금",
  "기타포괄손익누계액", "기타자본항목", "기타자본구성요소",
  "매각예정자산", "매각예정부채",

  // ── BS 연결 전용 ──
  "지배기업지분", "지배기업소유주지분", "지배주주지분",
  "비지배지분", "소수주주지분",
  "연결자본잉여금", "연결이익잉여금", "연결기타포괄손익누계액",

  // ── BS 금융업 대분류 ──
  "현금및예치금", "유가증권", "대출채권",
  "차입부채", "기타부채", "기타자산",
  "파생상품자산", "파생상품부채",
  "당기손익인식금융자산", "기타포괄손익인식금융자산", "기타포괄손익금융자산",
  "상각후원가측정금융자산", "당기손익-공정가치측정금융자산",
  "기타포괄손익-공정가치측정금융자산",
  // ── BS 비유동자산 세부 (바이오텍/지주사 등) ──
  "관계기업및공동기업투자", "관계기업투자", "공동기업투자", "종속기업투자",
  "매출채권및기타채권", "장기매출채권및기타채권",
  "사용권자산",
  // ── BS 보험업 ──
  "보험계약자산", "보험계약부채", "재보험자산", "재보험부채",

  // ── IS 일반 (전 산업) ──
  "매출원가", "매출총이익", "매출총이익(손실)", "매출총손실",
  "판매비와관리비", "판매비와일반관리비", "판관비",
  "영업외수익", "영업외비용",
  "기타수익", "기타비용", "기타영업외수익", "기타영업외비용",
  "금융수익", "금융비용", "금융원가", "순금융수익", "순금융비용", "순금융원가",
  "법인세비용", "법인세수익", "법인세비용(수익)",
  "계속영업이익", "계속영업손실", "계속영업이익(손실)",
  "중단영업이익", "중단영업손실", "중단영업이익(손실)", "중단영업손익",
  "기타포괄손익", "기타포괄이익", "기타포괄손실",
  "수익(매출액)",

  // ── IS 금융업 ──
  "이자수익", "이자비용",
  "대출평가및처분손실", "대출채권평가및처분손실", "대출채권평가및처분이익",
  "유가증권평가및처분손실", "유가증권평가및처분이익",
  "수수료수익", "수수료비용",

  // ── IS 건설업 ──
  "공사원가", "도급원가", "건설원가", "분양원가",

  // ── IS 보험업 ──
  "보험서비스비용", "보험금비용", "보험서비스수익",
]);

function detectAccountDepth(accountNm: string, _sjFilter: string[]): number {
  // (유동)/(비유동) suffix는 매칭 시점에 제거 — "당기손익-공정가치측정금융자산(유동)" 같은
  // 케이스가 DEPTH1_KEYWORDS의 "당기손익-공정가치측정금융자산"과 매칭되도록.
  const nm = accountNm.replace(/\s/g, "").replace(/\(유동\)|\(비유동\)/g, "");

  // depth 0: 총계
  if (DEPTH0_KEYWORDS.has(nm)) return 0;

  // depth 1: 중분류
  if (DEPTH1_KEYWORDS.has(nm)) return 1;

  // 감사보고서 로마숫자 패턴: Ⅰ.유동자산, Ⅱ.비유동자산 등 → depth 1
  if (/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVivx]+[.·]/.test(nm)) return 1;
  // 감사보고서 괄호숫자 패턴: (1)당좌자산, (2)재고자산 등 → depth 1
  if (/^\([0-9]+\)/.test(nm)) return 1;

  // 감사보고서 숫자 패턴: 1.현금, 2.매출채권 등 → depth 2
  if (/^[0-9]+[.·]/.test(nm)) return 2;

  // 소계/합계 패턴
  if (nm.includes("소계") || nm.includes("합계")) return 1;

  // depth 2: 나머지 세부 항목
  return 2;
}

/**
 * 합계 감지 알고리즘: 금액 합산으로 부모-자식 관계 자동 추론
 * - 연속된 depth 2 항목들의 합이 바로 앞 항목의 값과 일치하면, 앞 항목을 depth 1로 승격
 * - 총계 항목(depth 0)과 연속 depth 2 항목 합이 일치하면 중간 depth 1이 누락된 것
 */
function refineDepthBySumDetection(
  rows: { nm: string; depth: number }[],
  yearData: Record<string, Record<string, string>>,
  displayYears: string[]
): void {
  if (rows.length < 3 || displayYears.length === 0) return;

  // 가장 데이터가 많은 연도 선택
  const targetYear = displayYears.reduce((best, y) => {
    const countA = Object.keys(yearData[best] || {}).length;
    const countB = Object.keys(yearData[y] || {}).length;
    return countB > countA ? y : best;
  }, displayYears[0]);
  const vals = yearData[targetYear] || {};

  const getVal = (nm: string): number | null => {
    const raw = vals[nm];
    if (!raw || raw.trim() === "-" || raw.trim() === "") return null;
    const v = parseFloat(raw.replace(/,/g, ""));
    return isNaN(v) ? null : v;
  };

  let skipUntil = -1; // 승격된 부모의 자식 영역을 건너뛰기 위한 인덱스
  for (let i = 0; i < rows.length - 1; i++) {
    const cur = rows[i];
    // depth 0 또는 1은 이미 확정, 건너뜀
    if (cur.depth !== 2) { skipUntil = -1; continue; }
    // 이전 승격된 부모의 자식 영역이면 건너뜀
    if (i <= skipUntil) continue;

    const parentVal = getVal(cur.nm);
    if (parentVal === null || parentVal === 0) continue;

    // 바로 뒤에 연속된 depth 2 항목들의 합 계산
    let sum = 0;
    let childCount = 0;
    let lastChildIdx = i;
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j];
      // depth 0 또는 1을 만나면 중단 (다른 섹션 진입)
      if (next.depth <= 1) break;
      const v = getVal(next.nm);
      if (v !== null) {
        sum += v;
        childCount++;
        lastChildIdx = j;
      }
    }

    // 2개 이상 자식이 있고 합이 부모와 일치(±1 허용, 백만원 단위 반올림 오차)
    if (childCount >= 2 && Math.abs(sum - parentVal) <= 1) {
      cur.depth = 1;
      skipUntil = lastChildIdx; // 자식 영역 건너뛰기
    }
  }
}

function buildStatements(
  rawByYear: Record<string, DartRawItem[]>,
  displayYears: string[],
  sjFilter: string[],
  yearReprtMap?: Record<string, string>  // 연도별 보고서 유형
): FinancialRow[] {
  const yearData: Record<string, Record<string, string>> = {};
  const isIncomeStatement = sjFilter.some(s => s === "IS" || s === "CIS");

  for (const reportYear of Object.keys(rawByYear).sort().reverse()) {
    const raw = rawByYear[reportYear] || [];
    const items = raw.filter((it) => sjFilter.includes(it.sj_div));
    if (!items.length) continue;

    const ry = parseInt(reportYear);
    const reprtCode = yearReprtMap?.[reportYear] || "11011";
    const isQuarterly = reprtCode !== "11011";

    // 분기보고서 IS: thstrm_add_amount(누적) 우선, 없으면 thstrm_amount
    // BS는 항상 thstrm_amount (시점 잔액)
    const periodMap: Record<string, string> = isIncomeStatement && isQuarterly
      ? {
          thstrm_add_amount: String(ry),  // 당기 누적
          frmtrm_add_amount: String(ry - 1),  // 전기 누적
          bfefrmtrm_amount: String(ry - 2),
        }
      : {
          thstrm_amount: String(ry),
          frmtrm_amount: String(ry - 1),
          bfefrmtrm_amount: String(ry - 2),
        };

    for (const [field, dataYear] of Object.entries(periodMap)) {
      if (!displayYears.includes(dataYear)) continue;
      // 최신 보고서 우선: 기업은 정정공시를 통해 최신 보고서에 수정 수치를 반영하므로,
      // 가장 최근 보고서(reverse sort로 먼저 처리됨)의 데이터가 가장 정확.
      // 이미 최신 보고서에서 해당 연도 데이터가 채워졌으면 이전 보고서 데이터로 덮어쓰지 않음.
      if (yearData[dataYear]) continue;

      const vals: Record<string, string> = {};
      for (const it of items) {
        const nm = it.account_nm.trim();
        if (isExcludedAccount(nm)) continue;
        let amt = (it as unknown as Record<string, string>)[field] || "";
        // 분기 IS에서 누적금액 필드가 비어있으면 thstrm_amount fallback
        if (!amt && isIncomeStatement && isQuarterly && field.includes("add_amount")) {
          const fallbackField = field.replace("_add_amount", "_amount");
          amt = (it as unknown as Record<string, string>)[fallbackField] || "";
        }
        if (nm && amt) {
          vals[nm] = amt;
          // 정규화 키도 저장 (연도간 계정명 변경 흡수: "영업이익(손실)"→"영업이익")
          const matchKey = normalizeForMatch(nm);
          if (matchKey !== nm && !vals[matchKey]) vals[matchKey] = amt;
        }
      }
      if (Object.keys(vals).length) yearData[dataYear] = vals;
    }
  }

  // 계정 순서 + depth 추론 — DART ord 순서 그대로 보존 (최신 보고서 우선)
  const accountOrder: { nm: string; depth: number }[] = [];
  const seen = new Set<string>();
  for (const reportYear of Object.keys(rawByYear).sort().reverse()) {
    const raw = rawByYear[reportYear] || [];
    const items = raw
      .filter((it) => sjFilter.includes(it.sj_div))
      .sort((a, b) => parseInt(a.ord || "999") - parseInt(b.ord || "999"));
    for (const it of items) {
      const nm = it.account_nm.trim();
      if (isExcludedAccount(nm)) continue;
      if (nm && !seen.has(nm)) {
        seen.add(nm);
        accountOrder.push({ nm, depth: detectAccountDepth(nm, sjFilter) });
      }
    }
    if (accountOrder.length) break;
  }

  // BS/IS 자체 재정렬 로직은 제거됨.
  // DART 정식 재무제표(fnlttSinglAcntAll 또는 감사보고서 본문)의 ord 순서를 그대로 따름.
  const isBS = sjFilter.includes("BS");

  // K-IFRS/K-GAAP 동시 누적 차단 — Stage 1 (fnlttSinglAcntAll) path 보강.
  // mergeAuditResults는 Stage 3 감사보고서에만 적용. 회사가 회계기준 전환했을 때
  // (코넥스→코스닥, 프로젠) Stage 1로 들어온 23년 K-GAAP 보고서 라인이 24/25년
  // K-IFRS 라인과 같은 시트에 누적되는 케이스 방지. yearData 검사로 압도적
  // K-IFRS이면 K-GAAP-only 토큰이 든 라인 drop.
  if (isBS && accountOrder.length > 0) {
    const stdRows: FinancialRow[] = accountOrder.map(item => {
      const r: FinancialRow = { account: item.nm, depth: item.depth };
      for (const y of displayYears) {
        if (yearData[y] && yearData[y][item.nm]) r[y] = yearData[y][item.nm];
      }
      return r;
    });
    const std = detectAccountingStandard(stdRows, []);
    if (std === "K-IFRS") {
      const before = accountOrder.length;
      const filtered = accountOrder.filter(item => !KGAAP_ONLY_PATTERN.test(item.nm.replace(/\s/g, "")));
      if (filtered.length < before) {
        console.log(`[DART] Stage 1 K-IFRS 판정 — K-GAAP 전용 라인 ${before - filtered.length}개 drop`);
        accountOrder.length = 0;
        accountOrder.push(...filtered);
      }
    }
  }

  // 합계 감지: 금액 합산으로 부모-자식 관계 자동 보정
  refineDepthBySumDetection(accountOrder, yearData, displayYears);

  const rows: FinancialRow[] = [];
  for (const { nm: acct, depth } of accountOrder) {
    const row: FinancialRow = { account: acct, depth };
    const matchKey = normalizeForMatch(acct);
    for (const year of displayYears) {
      const vals = yearData[year] || {};
      // 원본 키 → 정규화 키 fallback (연도간 계정명 변경 흡수)
      const amt = vals[acct] || vals[matchKey];
      row[year] = amt ? toMillions(amt) : "-";
    }
    if (displayYears.some((y) => row[y] !== "-")) {
      rows.push(row);
    }
  }
  return rows;
}

function calcRatios(
  bsRows: FinancialRow[],
  isRows: FinancialRow[],
  years: string[],
  cfRows: FinancialRow[] = []
): Record<string, Record<string, string>> {
  // 정확 매칭 우선, 부분 매칭 fallback
  function get(rows: FinancialRow[], keywords: string[], year: string): number {
    for (const r of rows) {
      const norm = normalizeAcct(r.account);
      for (const kw of keywords) {
        if (norm === kw.replace(/\s/g, "")) {
          const v = parseNum(r[year] || "-");
          if (v !== 0) return v;
        }
      }
    }
    for (const r of rows) {
      const norm = normalizeAcct(r.account);
      for (const kw of keywords) {
        if (norm.includes(kw.replace(/\s/g, ""))) {
          const v = parseNum(r[year] || "-");
          if (v !== 0) return v;
        }
      }
    }
    return 0;
  }

  // 정확 매칭만 (하위 항목 제외용)
  function getExact(rows: FinancialRow[], keywords: string[], year: string): number {
    for (const r of rows) {
      const norm = normalizeAcct(r.account);
      for (const kw of keywords) {
        if (norm === kw.replace(/\s/g, "")) {
          return parseNum(r[year] || "-");
        }
      }
    }
    return 0;
  }

  const fmtPct = (v: number) => `${v.toFixed(1)}%`;
  const fmtAmt = (v: number) => v === 0 ? "-" : v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  // 연도별 매출액 캐싱 (증가율 계산용)
  const revByYear: Record<string, number> = {};

  const ratios: Record<string, Record<string, string>> = {};
  for (const year of [...years].sort()) {
    const r: Record<string, string> = {};

    // === BS 항목 ===
    let totalAssets = get(bsRows, ["자산총계", "자산합계", "부채와자본총계", "부채및자본총계", "자본과부채총계"], year);
    const totalLiab = get(bsRows, ["부채총계", "부채합계"], year);
    const totalEquity = get(bsRows, ["자본총계", "자본합계"], year);

    // 자산총계 보완: 부채총계 + 자본총계
    if (totalAssets === 0 && totalLiab > 0 && totalEquity > 0) {
      totalAssets = totalLiab + totalEquity;
    }

    // === 유동자산 추론 (3단계 fallback) ===
    let currentAssets = get(bsRows, ["유동자산", "유동자산합계", "Ⅰ.유동자산"], year);
    let caMethod = "직접추출";
    if (currentAssets === 0) {
      // 2단계: 역산 (자산총계 - 비유동자산)
      const nonCurrentAssets = get(bsRows, ["비유동자산", "비유동자산합계", "Ⅱ.비유동자산"], year);
      if (totalAssets > 0 && nonCurrentAssets > 0) {
        currentAssets = totalAssets - nonCurrentAssets;
        caMethod = "역산(자산-비유동)";
        console.log(`[calcRatios] ${year}년 유동자산 역산: ${totalAssets} - ${nonCurrentAssets} = ${currentAssets}`);
      }
    }
    if (currentAssets === 0) {
      // 3단계: 하위 항목 합산 (현금 + 매출채권 + 재고자산 + 단기금융상품 등)
      const subItems = [
        "현금및현금성자산", "현금과예금", "현금및예치금", "단기금융상품",
        "매출채권", "매출채권및기타유동채권", "매출채권및기타채권",
        "미수금", "미수수익", "선급금", "선급비용",
        "재고자산", "단기투자자산", "유동금융자산",
        "당기손익-공정가치측정금융자산", "기타유동자산",
        "단기대여금", "단기보증금",
      ];
      let sumCA = 0;
      let foundAny = false;
      for (const kw of subItems) {
        const v = getExact(bsRows, [kw], year);
        if (v !== 0) { sumCA += v; foundAny = true; }
      }
      if (foundAny && sumCA > 0) {
        currentAssets = sumCA;
        caMethod = "합산(하위항목)";
        console.log(`[calcRatios] ${year}년 유동자산 합산: ${currentAssets}`);
      }
    }

    // === 유동부채 추론 (3단계 fallback) ===
    let currentLiab = get(bsRows, ["유동부채", "유동부채합계", "Ⅰ.유동부채"], year);
    let clMethod = "직접추출";
    if (currentLiab === 0) {
      // 역산 (부채총계 - 비유동부채)
      const nonCurrentLiab = get(bsRows, ["비유동부채", "비유동부채합계", "Ⅱ.비유동부채"], year);
      if (totalLiab > 0 && nonCurrentLiab > 0) {
        currentLiab = totalLiab - nonCurrentLiab;
        clMethod = "역산(부채-비유동)";
        console.log(`[calcRatios] ${year}년 유동부채 역산: ${totalLiab} - ${nonCurrentLiab} = ${currentLiab}`);
      }
    }
    if (currentLiab === 0) {
      // 하위 항목 합산
      const subLiabItems = [
        "단기차입금", "매입채무", "매입채무및기타유동채무", "매입채무및기타채무",
        "미지급금", "미지급비용", "선수금", "예수금",
        "유동성장기부채", "유동리스부채", "당기법인세부채",
        "단기사채", "유동금융부채", "기타유동부채",
      ];
      let sumCL = 0;
      let foundAny = false;
      for (const kw of subLiabItems) {
        const v = getExact(bsRows, [kw], year);
        if (v !== 0) { sumCL += Math.abs(v); foundAny = true; }
      }
      if (foundAny && sumCL > 0) {
        currentLiab = sumCL;
        clMethod = "합산(하위항목)";
        console.log(`[calcRatios] ${year}년 유동부채 합산: ${currentLiab}`);
      }
    }

    if (currentAssets === 0 || currentLiab === 0) {
      console.log(`[calcRatios] ${year}년 유동비율 산출 불가: 유동자산=${currentAssets}(${caMethod}), 유동부채=${currentLiab}(${clMethod})`);
    }

    // === 차입금 계산 (확장 — 재무분석 전문가 기준) ===
    // 기업마다 계정과목명이 다르므로 부분 매칭(includes) 기반으로 광범위 수집
    let borrowings = 0;
    const chaipBuchae = getExact(bsRows, ["차입부채"], year);
    if (chaipBuchae !== 0) {
      // 차입부채가 이미 총합이면 그걸 사용
      borrowings = Math.abs(chaipBuchae);
    } else {
      // 정확 매칭 항목
      const exactBorrowingKw = [
        "단기차입금", "장기차입금",
        "유동성장기부채", "유동성장기차입금",
        "사채", "회사채", "전환사채", "신주인수권부사채", "교환사채",
        "단기사채", "유동성사채",
        "유동리스부채", "비유동리스부채", "리스부채",
        "단기리스부채", "장기리스부채",
        "유동금융부채", "비유동금융부채",
        "파생금융부채",
        "차입금", "장기부채",
        // PFV/SPC/건설업 특수 계정
        "대출금", "단기대출금", "장기대출금",
        "PF대출금", "프로젝트금융대출금", "프로젝트금융차입금",
        "건설자금대출금", "시행사대출금",
        "유동성대출금", "유동성장기대출금",
      ];
      const seen = new Set<string>();
      for (const kw of exactBorrowingKw) {
        const kwNorm = kw.replace(/\s/g, "");
        for (let i = 0; i < bsRows.length; i++) {
          const norm = normalizeAcct(bsRows[i].account);
          if (norm !== kwNorm) continue;
          const v = parseNum(bsRows[i][year] || "-");
          if (v === 0 || seen.has(kwNorm)) continue;
          let netVal = Math.abs(v);
          // 바로 다음 행이 할인차금이면 차감
          if (i + 1 < bsRows.length) {
            const nextNorm = normalizeAcct(bsRows[i + 1].account);
            if (nextNorm.includes("할인차금") || nextNorm.includes("사채할인발행차금")) {
              const discount = parseNum(bsRows[i + 1][year] || "-");
              if (discount < 0) netVal += discount; // discount is negative, so += subtracts
            }
          }
          borrowings += netVal;
          seen.add(kwNorm);
          break;
        }
      }
      // 부분 매칭 fallback: 계정명에 차입금/사채/리스부채/대출금 포함된 항목 추가 수집
      for (let i = 0; i < bsRows.length; i++) {
        const norm = normalizeAcct(bsRows[i].account);
        if (seen.has(norm)) continue;
        const isBorrowing =
          (norm.includes("차입금") || norm.includes("사채") || norm.includes("리스부채") || norm.includes("대출금")) &&
          !norm.includes("총계") && !norm.includes("합계") && !norm.includes("이자") &&
          !norm.includes("상환") && !norm.includes("할인") && !norm.includes("채권");
        if (isBorrowing) {
          const v = parseNum(bsRows[i][year] || "-");
          if (v === 0) continue;
          let netVal = Math.abs(v);
          // 다음 행 할인차금 차감
          if (i + 1 < bsRows.length) {
            const nextNorm = normalizeAcct(bsRows[i + 1].account);
            if (nextNorm.includes("할인차금") || nextNorm.includes("사채할인발행차금")) {
              const discount = parseNum(bsRows[i + 1][year] || "-");
              if (discount < 0) netVal += discount;
            }
          }
          borrowings += netVal;
          seen.add(norm);
        }
      }
    }

    const cash = get(bsRows, ["현금및현금성자산", "현금및예치금", "현금과예금", "현금및단기금융상품"], year);

    // === IS 항목 ===
    // 셀리드 등 일부 IS는 "매출" 한 단어만 사용 — 정확매칭 키워드에 추가.
    // get(부분매칭)에는 "매출" 추가 금지 — "매출원가/매출총이익/매출채권"이 먼저 매치되는 false-positive.
    let rev = getExact(isRows, ["매출", "매출액", "영업수익", "수익(매출액)", "공사수익", "분양수익"], year);
    if (rev === 0) rev = get(isRows, ["매출액", "영업수익", "공사수익", "분양수익"], year);
    // 보험업: 보험수익/보험료수익/수입보험료 → 매출 역할
    if (rev === 0) rev = get(isRows, ["보험수익", "보험료수익", "수입보험료", "보험서비스수익"], year);
    // 금융업: 순영업수익/이자수익합계 → 매출 역할
    if (rev === 0) rev = get(isRows, ["순영업수익", "순영업수익합계", "영업수익합계", "이자수익합계", "순이자손익"], year);
    // 프로젠 등 K-IFRS↔K-GAAP 전환 회사: 매출액 행이 일부 연도에서 비어있을 때
    // 매출총이익 + 매출원가 = 매출 추정 (회계항등식)
    if (rev === 0) {
      const grossProfit = getExact(isRows, ["매출총이익", "매출총이익(손실)"], year);
      const cogs = getExact(isRows, ["매출원가"], year);
      if (grossProfit !== 0 || cogs !== 0) {
        rev = grossProfit + Math.abs(cogs);
        if (rev !== 0) console.log(`[calcRatios] ${year}년 매출 추정: 매출총이익(${grossProfit}) + 매출원가(${Math.abs(cogs)}) = ${rev}`);
      }
    }
    revByYear[year] = rev;

    let op = getExact(isRows, ["영업이익", "영업이익(손실)", "영업손익", "영업손실"], year);
    if (op === 0) op = get(isRows, ["영업이익", "영업손실"], year);
    // 보험업: 보험서비스손익/보험영업이익 → 영업이익 역할
    if (op === 0) op = get(isRows, ["보험서비스손익", "보험영업이익", "보험영업손익", "보험손익"], year);

    let ni = getExact(isRows, ["당기순이익", "당기순이익(손실)", "당기순손익", "당기순손실"], year);
    if (ni === 0) ni = get(isRows, ["당기순이익", "당기순손실"], year);

    // 감가상각비 (EBITDA 산출용 — 현금흐름표(CF) 우선, IS/BS fallback)
    // CF의 영업활동 조정항목에 감가상각비/무형자산상각비가 정확히 표시됨
    let depreciation = 0;
    let amortization = 0;
    if (cfRows.length > 0) {
      // (참고) 라벨 행은 가시성 목적이므로 EBITDA 계산에서 제외
      const cfRowsForCalc = cfRows.filter(r => !/\(참고\)/.test(r.account || ""));
      // 우선순위 1: "감가상각비 및 무형자산상각비" 통합 라벨이 있으면 그것만 사용 (이중합산 회피)
      const combinedDA = Math.abs(get(cfRowsForCalc, ["감가상각비및무형자산상각비"], year));
      if (combinedDA > 0) {
        depreciation = combinedDA;
        // 통합값에 무형이 이미 포함되므로 amortization은 0
      } else {
        depreciation = Math.abs(get(cfRowsForCalc, ["감가상각비", "감가상각비용", "유형자산감가상각비"], year));
        amortization = Math.abs(get(cfRowsForCalc, ["무형자산상각비", "무형자산감가상각비", "사용권자산상각비", "사용권자산감가상각비"], year));
      }
    }
    // CF에서 못 찾으면 IS → BS fallback
    if (depreciation === 0) {
      depreciation = Math.abs(get(isRows, ["감가상각비", "감가상각비용"], year));
      if (depreciation === 0) depreciation = Math.abs(get(bsRows, ["감가상각비"], year));
    }
    if (amortization === 0) {
      amortization = Math.abs(get(isRows, ["무형자산상각비", "무형자산감가상각비", "사용권자산상각비"], year));
    }
    // 그래도 0이면 bsRows에서 부분 매칭 시도
    if (depreciation === 0 && amortization === 0) {
      for (const r2 of bsRows) {
        const nm = normalizeAcct(r2.account);
        if (nm.includes("감가상각") || nm.includes("상각비")) {
          const v = parseNum(r2[year] || "-");
          if (v > 0) { depreciation += v; break; }
        }
      }
    }

    // 이자비용 (EBITDA/이자비율용) — 우선순위:
    //  1) IS의 정확한 "이자비용" 행 (가장 정확, 발생주의)
    //  2) CF의 실제 이자지급액 (현금주의 — IS에 별도 이자비용 행이 없을 때 fallback)
    //  3) IS의 "금융비용/금융원가" — 통합 항목으로 외환손실/파생손실까지 포함되어 과대 위험.
    //     이자보상배율을 비합리적으로 낮추는 주범 (예: 효성중공업 25년 0.86배 → 11.86배)
    let interestExpense = Math.abs(getExact(isRows, ["이자비용", "이자비용(손실)"], year));
    if (interestExpense === 0 && cfRows.length > 0) {
      interestExpense = Math.abs(get(cfRows, ["이자지급", "이자의지급", "이자납부"], year));
    }
    if (interestExpense === 0) {
      interestExpense = Math.abs(get(isRows, ["이자비용"], year));
    }
    if (interestExpense === 0) {
      interestExpense = Math.abs(get(isRows, ["금융비용", "금융원가"], year));
    }

    // EBITDA = 영업이익 + 감가상각비 + 무형자산상각비
    const ebitda = op + depreciation + amortization;

    // === 안정성 지표 ===
    r["총차입금"] = fmtAmt(borrowings);
    r["순차입금"] = borrowings > 0 ? fmtAmt(borrowings - cash) : "-";
    if (totalEquity > 0) r["부채비율"] = fmtPct((totalLiab / totalEquity) * 100);
    if (currentLiab > 0) r["유동비율"] = fmtPct((currentAssets / currentLiab) * 100);
    if (totalAssets > 0 && totalEquity > 0) r["자기자본비율"] = fmtPct((totalEquity / totalAssets) * 100);
    if (totalAssets > 0) r["차입금의존도"] = fmtPct((borrowings / totalAssets) * 100);

    // === 수익성 지표 ===
    if (rev !== 0) r["영업이익률"] = fmtPct((op / Math.abs(rev)) * 100);
    if (totalAssets > 0 && ni) r["총자산이익률(ROA)"] = fmtPct((ni / totalAssets) * 100);
    if (totalEquity > 0 && ni) r["자기자본이익률(ROE)"] = fmtPct((ni / totalEquity) * 100);

    // === EBITDA 지표 ===
    if (ebitda !== 0) r["EBITDA"] = fmtAmt(ebitda);
    if (ebitda !== 0 && interestExpense > 0) {
      r["EBITDA/이자비용"] = `${(ebitda / interestExpense).toFixed(1)}배`;
    }
    // === 이자보상배율 ===
    if (op !== 0 && interestExpense > 0) {
      r["이자보상배율"] = `${(op / interestExpense).toFixed(1)}배`;
    }

    // === 성장성: 매출증가율 (전년 대비) ===
    const prevYear = String(parseInt(year) - 1);
    if (revByYear[prevYear] !== undefined && revByYear[prevYear] !== 0 && rev !== 0) {
      r["매출증가율"] = fmtPct(((rev - revByYear[prevYear]) / Math.abs(revByYear[prevYear])) * 100);
    }

    if (Object.keys(r).some((k) => r[k] !== "-")) ratios[year] = r;
  }
  return ratios;
}

// ============================================================
// 2단계: 주요계정 API (fnlttSinglAcnt) — 감사보고서만 제출 기업 일부 지원
// ============================================================

async function fetchKeyAccounts(
  corpCode: string,
  year: string
): Promise<DartRawItem[]> {
  const apiKey = getApiKey();
  for (const reprt of ["11011", "11014", "11012"]) {
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprt,
    });
    const url = `${DART_API_BASE}/fnlttSinglAcnt.json?${params}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      const d = await res.json();
      if (d.status === "000" && d.list?.length) {
        return d.list;
      }
    } catch (e) {
      console.warn(`[DART] fetchKeyAccounts ${year}/${reprt} failed:`, e instanceof Error ? e.message : e);
      continue;
    }
  }
  return [];
}

function tryKeyAccounts(
  allItems: Record<string, DartRawItem[]>,
  years: string[]
): { bsRows: FinancialRow[]; isRows: FinancialRow[]; displayYears: string[] } | null {
  if (!Object.values(allItems).some((items) => items.length > 0)) return null;

  const bsData: Record<string, Record<string, string>> = {};
  const isData: Record<string, Record<string, string>> = {};

  for (const reportYear of Object.keys(allItems).sort().reverse()) {
    const items = allItems[reportYear] || [];
    const ry = parseInt(reportYear);
    const periodMap: Record<string, string> = {
      thstrm_amount: String(ry),
      frmtrm_amount: String(ry - 1),
    };

    for (const [field, dataYear] of Object.entries(periodMap)) {
      for (const it of items) {
        const nm = it.account_nm?.trim();
        if (!nm || isExcludedAccount(nm)) continue;
        const sj = it.sj_div;
        const amt = (it as unknown as Record<string, string>)[field] || "";
        if (!amt) continue;

        if (sj === "BS") {
          if (!bsData[dataYear]) bsData[dataYear] = {};
          if (!bsData[dataYear][nm]) bsData[dataYear][nm] = amt;
        } else if (sj === "IS" || sj === "CIS") {
          if (!isData[dataYear]) isData[dataYear] = {};
          if (!isData[dataYear][nm]) isData[dataYear][nm] = amt;
        }
      }
    }
  }

  // 계정 순서: 가장 최신 items 기준
  let bestItems: DartRawItem[] = [];
  for (const yr of Object.keys(allItems).sort().reverse()) {
    if (allItems[yr]?.length) { bestItems = allItems[yr]; break; }
  }

  function buildRows(
    yearData: Record<string, Record<string, string>>,
    displayYears: string[],
    sjFilter: string[]
  ): FinancialRow[] {
    const order: string[] = [];
    const seen = new Set<string>();
    for (const it of bestItems) {
      if (!sjFilter.includes(it.sj_div)) continue;
      const nm = it.account_nm?.trim();
      if (!nm || isExcludedAccount(nm)) continue;
      if (!seen.has(nm)) { seen.add(nm); order.push(nm); }
    }

    // BS/IS 자체 재정렬 제거 — DART 원본 ord 순서 그대로 사용

    const rows: FinancialRow[] = [];
    for (const acct of order) {
      const row: FinancialRow = { account: acct };
      for (const y of displayYears) {
        const val = yearData[y]?.[acct];
        row[y] = val ? toMillions(val) : "-";
      }
      if (displayYears.some((y) => row[y] !== "-")) rows.push(row);
    }
    return rows;
  }

  const displayYears = [...new Set([...Object.keys(bsData), ...Object.keys(isData)])].sort();
  if (!displayYears.length) return null;

  const bsRows = buildRows(bsData, displayYears, ["BS"]);
  const hasIS = bestItems.some((it) => it.sj_div === "IS");
  const isRows = buildRows(isData, displayYears, hasIS ? ["IS"] : ["CIS"]);

  if (!bsRows.length && !isRows.length) return null;
  return { bsRows, isRows, displayYears };
}

// ============================================================
// 3단계: 감사보고서 원문(XML) 파싱 — 비상장 외감법인용
// ============================================================

async function checkFilingType(
  corpCode: string
): Promise<{ onlyAudit: boolean }> {
  const apiKey = getApiKey();

  // 정기공시(A)에서 사업보고서/분기보고서 확인
  let hasAnnual = false;
  let hasQuarterly = false;
  try {
    const paramsA = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: "20220101",
      end_de: "20261231",
      pblntf_ty: "A",
      page_count: "30",
    });
    const resA = await fetch(`${DART_API_BASE}/list.json?${paramsA}`);
    const dA = await resA.json();
    if (dA.list) {
      const reports: string[] = dA.list.map((it: { report_nm?: string }) => it.report_nm || "");
      hasAnnual = reports.some((r) => r.includes("사업보고서"));
      hasQuarterly = reports.some((r) => r.includes("분기보고서") || r.includes("반기보고서"));
    }
  } catch { /* ignore */ }

  // 외부감사관련(F)에서 감사보고서 확인
  let hasAudit = false;
  try {
    const paramsF = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: "20220101",
      end_de: "20261231",
      pblntf_ty: "F",
      page_count: "30",
    });
    const resF = await fetch(`${DART_API_BASE}/list.json?${paramsF}`);
    const dF = await resF.json();
    if (dF.list) {
      const reports: string[] = dF.list.map((it: { report_nm?: string }) => it.report_nm || "");
      hasAudit = reports.some((r) => r.includes("감사보고서"));
    }
  } catch { /* ignore */ }

  return { onlyAudit: hasAudit && !hasAnnual && !hasQuarterly };
}

function parseAuditNum(s: string): number {
  if (!s || s.trim() === "-" || s.trim() === "" || s.trim() === "0") return 0;
  const str = s.trim();
  const negative = str.includes("(");
  const cleaned = str.replace(/[(),\s]/g, "").replace(/,/g, "");
  const val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
  return negative ? -val : val;
}

// 회계기준 감지 — 토큰 등장 row 수의 비율로 판정.
// K-IFRS 1+/K-GAAP 0~2 → K-IFRS, K-GAAP 3+ 압도 → K-GAAP, 그 외 unknown.
// 단순 "K-IFRS 토큰 1+" 휴리스틱은 K-GAAP 보고서가 정정공시로 일부 K-IFRS 라벨을
// 차용한 케이스(프로젠 23년 K-GAAP에 "당기손익-공정가치측정금융자산" 등장)를 잡지 못해
// 회계기준 변경 감지 실패 → BS에 K-GAAP 라인 누적. 비율로 압도성을 본다.
type AccountingStandard = "K-IFRS" | "K-GAAP" | "unknown";
const KGAAP_ONLY_PATTERN = /전환권조정|사채상환할증금|감가상각누계액|대손충당금|미처리결손금|미처분이익잉여금|자본조정|주식발행초과금|매도가능증권|지분법적용투자주식|당좌자산|단기매매증권|장기미수금/;
const KIFRS_ONLY_PATTERN = /기타포괄손익-공정가치측정|당기손익-공정가치측정|사용권자산|확정급여부채|확정급여자산|관계기업및공동기업투자|기타포괄손익누계액|이익잉여금\(결손금\)|리스부채/;
function detectAccountingStandard(bsRows: FinancialRow[], isRows: FinancialRow[]): AccountingStandard {
  let kifrsHits = 0;
  let kgaapHits = 0;
  for (const row of [...bsRows, ...isRows]) {
    const acct = (row.account || "").replace(/\s/g, "");
    if (KIFRS_ONLY_PATTERN.test(acct)) kifrsHits++;
    if (KGAAP_ONLY_PATTERN.test(acct)) kgaapHits++;
  }
  // K-GAAP 토큰이 K-IFRS의 2배 이상 + 절대값 3+ → K-GAAP (정정공시 잡음 무시)
  if (kgaapHits >= 3 && kgaapHits >= 2 * kifrsHits) return "K-GAAP";
  // K-IFRS 토큰 1+ + K-GAAP 토큰 0~2 → K-IFRS
  if (kifrsHits >= 1 && kgaapHits < 3) return "K-IFRS";
  return "unknown";
}

// ─── 사업보고서 본문 XML 공유 캐시 ───────────────────────────────────────────
// 동일 rcept_no를 D&A 보강(extractDAFromAnnualReport) + Stage 1.5 BS/IS/CF
// fallback(extractAnnualReportStatements) 양쪽에서 호출하므로 ZIP 다운로드 중복
// 방지. buildFinancialData finally에서 clearAnnualXmlCache()로 비움.
const annualXmlCache = new Map<string, Promise<string | null>>();

function clearAnnualXmlCache(): void {
  annualXmlCache.clear();
}

/**
 * 사업보고서 ZIP을 받아 본문 XML 1개를 추출. content-sniff 우선(재무상태표 +
 * 손익계산서 키워드 모두 포함), fallback은 가장 큰 .xml. 동일 rceptNo 동시 호출 →
 * 1회만 fetch.
 */
async function fetchAnnualReportMainXml(rceptNo: string): Promise<string | null> {
  const cached = annualXmlCache.get(rceptNo);
  if (cached) return cached;
  const promise = (async (): Promise<string | null> => {
    const apiKey = getApiKey();
    try {
      const res = await fetch(
        `${DART_API_BASE}/document.xml?crtfc_key=${apiKey}&rcept_no=${rceptNo}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf[0] !== 0x50 || buf[1] !== 0x4B) return null;
      const zip = await JSZip.loadAsync(buf);
      const xmlNames = Object.keys(zip.files).filter(
        (n) => !zip.files[n].dir && n.toLowerCase().endsWith(".xml"),
      );
      if (xmlNames.length === 0) return null;

      // 크기 내림차순으로 정렬 — 본문이 통상 가장 큼
      const sized = xmlNames.map((n) => {
        const size =
          (zip.files[n] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
        return { name: n, size };
      }).sort((a, b) => b.size - a.size);

      // 1차 content-sniff: 상위 5개만 점검 (사업현황 등 큰 비-재무 XML 회피)
      const sampleCount = Math.min(5, sized.length);
      for (let i = 0; i < sampleCount; i++) {
        try {
          const sample = await zip.files[sized[i].name].async("string");
          if (/재무상태표/.test(sample) && /(손익계산서|포괄손익계산서)/.test(sample)) {
            return sample;
          }
        } catch {
          // 다음 후보로
        }
      }

      // 2차 fallback: 가장 큰 .xml
      return await zip.files[sized[0].name].async("string");
    } catch (e) {
      console.warn(`[DART] fetchAnnualReportMainXml(${rceptNo}) 실패:`, e instanceof Error ? e.message : e);
      return null;
    }
  })();
  annualXmlCache.set(rceptNo, promise);
  return promise;
}

// 감사보고서 XML 1건 파싱 (공통 로직)
/**
 * 순수 TR-테이블 BS/IS/CF 파서 — 감사보고서 본문 XML과 사업보고서 본문 XML 양쪽에서 재사용.
 * (Stage 1.5 사업보고서 본문 fallback도 동일 파서 사용)
 */
function parseStatementsFromTRContent(
  content: string,
  targetYear: string
): { bsRows: FinancialRow[]; isRows: FinancialRow[]; cfRows: FinancialRow[]; years: string[]; notesSections?: Record<string, string>; accountingStandard: AccountingStandard } | null {
  const trMatches = content.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];
  const allRows: string[][] = [];
  for (const tr of trMatches) {
    // TD, TH, TE 모든 셀 태그 지원
    const cellMatches = tr.match(/<(?:TD|TH|TE)[^>]*>[\s\S]*?(?=<(?:TD|TH|TE)|<\/TR)/gi) || [];
    const rowCells: string[] = [];
    for (const cell of cellMatches) {
      // colspan 감지: 병합 셀의 컬럼 정렬 유지
      const colspanMatch = cell.match(/colspan\s*=\s*["']?(\d+)/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1]) : 1;
      const clean = cell.replace(/<[^>]*>/g, "").trim().replace(/\s+/g, " ");
      rowCells.push(clean);
      for (let ci = 1; ci < colspan; ci++) rowCells.push("");
    }
    if (rowCells.length) allRows.push(rowCells);
  }

  const bsItems: [string, string[]][] = [];
  const isItems: [string, string[]][] = [];
  const cfItems: [string, string[]][] = [];
  let section: string | null = null;
  let bsCompleted = false;
  let isCompleted = false;
  let cfCompleted = false;
  let columnOrderReversed = false;

  for (const row of allRows) {
    const text = row.join("").replace(/\s/g, "");
    const first = row[0]?.replace(/\s/g, "") || "";

    if (!bsCompleted && /제\d+.*기|당기|전기|당\s*기|전\s*기/.test(text) && !/매출|영업|자산|부채|당기손익|기타포괄/.test(text)) {
      const joined = row.join(" ");
      const curIdx = joined.search(/당기|제\s*\d+\s*\(당\)|제\s*\d+\s*기/);
      const prevIdx = joined.search(/전기|제\s*\d+\s*\(전\)/);
      if (curIdx >= 0 && prevIdx >= 0 && prevIdx < curIdx) {
        columnOrderReversed = true;
      }
    }

    if (/현금흐름표/.test(text) && !cfCompleted) {
      if (section === "is") isCompleted = true;
      section = "cf_header";
      continue;
    }
    if (/이익잉여금처분|자본변동표|이익잉여금변동|제조원가명세서|원가명세서/.test(text)) {
      if (section === "is") isCompleted = true;
      if (section === "cf") cfCompleted = true;
      section = null;
    }
    if (/별첨.*주석은|별첨\s*주석은/.test(row[0] || "")) {
      if (section === "is") isCompleted = true;
      if (section === "bs") bsCompleted = true;
      if (section === "cf") cfCompleted = true;
      section = null;
    }
    if (section === "cf_header" && /영업활동/.test(text)) {
      section = "cf";
    }
    if (section === "is" && /영업활동으로인한|영업활동현금흐름/.test(text)) {
      isCompleted = true;
      section = "cf";
    }
    if (section === "is" && /\d{4}\.\d{1,2}\.\d{1,2}\s*\(?(전기초|전기말|당기초|당기말)/.test(row[0] || "")) {
      isCompleted = true;
      section = null;
    }

    if (row.length < 2) continue;
    if (bsCompleted && isCompleted && cfCompleted) continue;

    if (section === "cf" && /기말의?현금|현금및현금성자산의?감소|현금및현금성자산의?기말/.test(text)) {
      const cfNums: string[] = [];
      for (const c of row.slice(1)) {
        const ct = c.trim();
        if (/^\d{1,2}(,\s*\d{1,2})*$/.test(ct)) continue;
        if (/\d{3,}/.test(ct) || ct === "-" || /^[\s(]*0[\s)]*$/.test(ct)) cfNums.push(ct);
      }
      if (cfNums.length) cfItems.push([row[0].trim(), cfNums]);
      cfCompleted = true;
      section = null;
      continue;
    }

    if (!bsCompleted) {
      if (first === "자산" && !first.includes("총계") && !first.includes("합계")) { section = "bs"; continue; }
      if (text.startsWith("자산") && !text.startsWith("자산총계") && !text.startsWith("자산합계")) { section = "bs"; continue; }
      if ((first === "자산총계" || first === "자산합계") && section !== "bs") { section = "bs"; /* 데이터 포함 — continue 안 함 */ }
    }

    if (/부채와자본총계|부채및자본총계|부채와순자산총계/.test(text)) {
      if (section === "bs") {
        const nums = row.slice(1).filter((c) => { const ct = c.trim(); if (/^\d{1,2}(,\s*\d{1,2})*$/.test(ct)) return false; return /\d{3,}/.test(ct) || ct === "-" || /^[\s(]*0[\s)]*$/.test(ct); });
        if (nums.length) bsItems.push([row[0].trim(), nums]);
        bsCompleted = true;
        section = "bs_done";
        continue;
      }
    }

    if (!isCompleted) {
      if (text.includes("손익계산서") || text.includes("포괄손익계산서")) { section = "is_header"; continue; }
      const IS_START_RE = /영업수익|매출액|공사수익|분양수익|도급수익|보험수익|보험료수익|수입보험료|순영업수익|이자수익합계/;
      if (section === "is_header" && IS_START_RE.test(first)) section = "is";
      const firstClean = first.replace(/\(주석[^)]*\)/g, "");
      if (/^(영업수익|매출액|공사수익|분양수익|보험수익|보험료수익|수입보험료|순영업수익|Ⅰ\.?(영업수익|매출액|공사수익|보험수익)|I\.?(영업수익|매출액|공사수익|보험수익))/.test(firstClean) && section !== "is") section = "is";
      if (section === "bs_done" && (IS_START_RE.test(firstClean) || /Ⅰ\.?(매출|공사|영업|보험|순영업)/.test(firstClean))) section = "is";
    }
    if (section === "bs_done" && row.length < 3 && !/매출|영업수익|공사수익|분양수익|보험수익|보험료수익|순영업수익/.test(first)) continue;

    if (section === "is" && /^(기본주당|희석주당|주당)/.test(first)) continue;
    if (section === "is" && /^(배당금지급$|지분법자본변동|지분법자본조정|지분법이익잉여금|종속회사|재평가차익)/.test(first)) { isCompleted = true; section = null; continue; }

    if (section !== "bs" && section !== "is" && section !== "cf") continue;
    const nums: string[] = [];
    for (const c of row.slice(1)) {
      const ct = c.trim();
      if (/^\d{1,2}(,\s*\d{1,2})*$/.test(ct)) continue;
      if (/\d{3,}/.test(ct) || ct === "-" || /^[\s(]*0[\s)]*$/.test(ct)) nums.push(ct);
    }
    if (!nums.length) continue;
    const acctName = row[0].trim();
    if (!acctName) continue;
    if (/^\d+$/.test(acctName.replace(/\s/g, ""))) continue;
    if (section === "bs") bsItems.push([acctName, nums]);
    else if (section === "is") isItems.push([acctName, nums]);
    else if (section === "cf") cfItems.push([acctName, nums]);
  }

  if (!bsItems.length && !isItems.length) return null;

  const prevYear = String(parseInt(targetYear) - 1);

  function detectTypicalCols(items: [string, string[]][]): number {
    const freq: Record<number, number> = {};
    for (const [, nums] of items) {
      if (nums.length >= 2) freq[nums.length] = (freq[nums.length] || 0) + 1;
    }
    const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    return best ? parseInt(best[0]) : 2;
  }

  function extractTwoYears(items: [string, string[]][], yrCur: string, yrPrev: string, reversed: boolean): FinancialRow[] {
    const typicalCols = detectTypicalCols(items);
    const rows: FinancialRow[] = [];
    for (const [acct, nums] of items) {
      const noteRef = extractNoteRef(acct);
      const acctClean = normalizeAcct(acct);
      if (isExcludedAccount(acctClean)) continue;
      const row: FinancialRow = { account: acctClean, depth: detectAccountDepth(acctClean, ["BS", "IS", "CIS"]), noteRef };
      let v1: string, v2: string;

      if (typicalCols >= 4 && nums.length >= 4) {
        const pick = (a: string, b: string) => {
          if (a && a !== "" && a !== "-" && /\d/.test(a)) return a;
          if (b && b !== "" && b !== "-" && /\d/.test(b)) return b;
          return a || b || "-";
        };
        v1 = pick(nums[0], nums[1]);
        v2 = pick(nums[2], nums[3]);
      } else if (nums.length >= 2) {
        v1 = nums[0]; v2 = nums[1];
      } else if (nums.length === 1) {
        v1 = nums[0]; v2 = "-";
      } else continue;

      const curVal = reversed ? v2 : v1;
      const prevVal = reversed ? v1 : v2;

      row[yrCur] = toMillions(String(parseAuditNum(curVal) || 0));
      row[yrPrev] = toMillions(String(parseAuditNum(prevVal) || 0));
      rows.push(row);
    }
    return rows;
  }

  const notesSections = extractNoteSections(content);
  const bsRows = extractTwoYears(bsItems, targetYear, prevYear, columnOrderReversed);
  const isRows = extractTwoYears(isItems, targetYear, prevYear, columnOrderReversed);
  const cfRows = extractTwoYears(cfItems, targetYear, prevYear, columnOrderReversed);
  const accountingStandard = detectAccountingStandard(bsRows, isRows);

  return {
    bsRows,
    isRows,
    cfRows,
    years: [targetYear, prevYear],
    notesSections: Object.keys(notesSections).length > 0 ? notesSections : undefined,
    accountingStandard,
  };
}

async function parseOneAuditXml(
  rceptNo: string,
  targetYear: string
): Promise<{ bsRows: FinancialRow[]; isRows: FinancialRow[]; cfRows: FinancialRow[]; years: string[]; notesSections?: Record<string, string>; accountingStandard: AccountingStandard } | null> {
  const apiKey = getApiKey();
  try {
    const params = new URLSearchParams({ crtfc_key: apiKey, rcept_no: rceptNo });
    const res = await fetch(`${DART_API_BASE}/document.xml?${params}`);
    const rawBuf = Buffer.from(await res.arrayBuffer());

    if (rawBuf[0] !== 0x50 || rawBuf[1] !== 0x4B) return null;

    const zip = await JSZip.loadAsync(rawBuf);
    // ZIP 안에 여러 XML 파일이 있는 경우 (사업보고서 본문 + 별첨 첨부 등) 본문이
    // 두 번째 이후에 위치할 수 있음. 제넥신 24년 사업보고서 = 첫 파일(566KB, 별첨)
    // + 두 번째 파일(1.5MB, 본문에 연결+개별 BS/IS 모두 포함). 첫 파일만 읽으면
    // 연결재무제표/IS 누락. 가장 큰 .xml 파일을 본문으로 선택.
    const xmlNames = Object.keys(zip.files).filter(n => n.toLowerCase().endsWith(".xml"));
    const sortedByCfFs = xmlNames.sort((a, b) => {
      const sa = (zip.files[a] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
      const sb = (zip.files[b] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
      return sb - sa;
    });
    const mainFile = sortedByCfFs[0] || Object.keys(zip.files)[0];
    const content = await zip.files[mainFile].async("string");

    return parseStatementsFromTRContent(content, targetYear);
  } catch (e) {
    console.error(`[DART] ${targetYear}년 감사보고서 파싱 실패:`, e);
    return null;
  }
}

/**
 * 감사보고서 HTML 내 주석 섹션을 번호별로 추출
 * "5. 유형자산" → { "5": "유형자산\n내역 텍스트..." }
 */
function extractNoteSections(htmlContent: string): Record<string, string> {
  const notes: Record<string, string> = {};

  // HTML 태그 제거 + 텍스트만 추출
  const text = htmlContent
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|td|th|table|tbody|thead)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\r\n/g, "\n");

  // "별첨 주석" 또는 "재무제표에 대한 주석" 이후만 파싱
  const noteStart = text.search(/별첨\s*-?\s*주석|재무제표에\s*대한\s*주석|주석\s*사항/);
  if (noteStart < 0) return notes;
  const noteText = text.slice(noteStart);

  // 번호별 섹션 분리: "1.", "2.", ... "45." 등
  // 패턴: 줄 시작 또는 공백 후 "번호." + 제목 (한글 2자 이상)
  const sectionRegex = /(?:^|\n)\s*(\d{1,3})\.\s*([가-힣a-zA-Z].{1,60})/g;
  const sections: { num: string; title: string; startIdx: number }[] = [];
  let match;
  while ((match = sectionRegex.exec(noteText)) !== null) {
    sections.push({
      num: match[1],
      title: match[2].trim(),
      startIdx: match.index,
    });
  }

  // 각 섹션의 텍스트를 다음 섹션 시작까지 추출
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const endIdx = i + 1 < sections.length ? sections[i + 1].startIdx : noteText.length;
    let body = noteText.slice(sec.startIdx, endIdx).trim();

    // 공백 정규화
    body = body.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

    // 최대 2000자로 truncate
    if (body.length > 2000) body = body.slice(0, 2000) + "...";

    notes[sec.num] = body;
  }

  return notes;
}

// 연도별 파싱 결과 병합. 회계기준 충돌 시 parsed drop (false 반환).
// fetchAuditReportData가 reverse-chronological 처리하므로 첫(=최신) 보고서 기준이 채택됨.
function mergeAuditResults(
  accumulated: { bsRows: FinancialRow[]; isRows: FinancialRow[]; cfRows: FinancialRow[]; dataYears: string[]; accountingStandard?: AccountingStandard },
  parsed: { bsRows: FinancialRow[]; isRows: FinancialRow[]; cfRows: FinancialRow[]; years: string[]; accountingStandard?: AccountingStandard }
): boolean {
  function mergeRows(accRows: FinancialRow[], newRows: FinancialRow[], years: string[]) {
    // 같은 계정명이 여러 번 나올 수 있으므로 occurrence 카운트로 매칭
    const usedIndices = new Set<number>();
    for (let ni = 0; ni < newRows.length; ni++) {
      const newRow = newRows[ni];
      // newRows 내에서 이 계정명의 몇 번째 occurrence인지 계산
      let targetOcc = 0;
      for (let j = 0; j < ni; j++) {
        if (newRows[j].account === newRow.account) targetOcc++;
      }
      // accumulated에서 같은 occurrence 찾기
      let matchIdx = -1;
      let occ = 0;
      for (let i = 0; i < accRows.length; i++) {
        if (usedIndices.has(i)) continue;
        if (accRows[i].account === newRow.account) {
          if (occ === targetOcc) { matchIdx = i; break; }
          occ++;
        }
      }
      if (matchIdx >= 0) {
        usedIndices.add(matchIdx);
        for (const y of years) {
          if (!accRows[matchIdx][y] && newRow[y]) accRows[matchIdx][y] = newRow[y];
        }
      } else {
        accRows.push(newRow);
      }
    }
  }

  if (!accumulated.bsRows.length && !accumulated.isRows.length) {
    accumulated.bsRows = parsed.bsRows;
    accumulated.isRows = parsed.isRows;
    accumulated.cfRows = parsed.cfRows;
    accumulated.accountingStandard = parsed.accountingStandard;
  } else {
    // 회계기준 충돌 검사 — 둘 다 unknown이 아니고 다르면 parsed drop.
    // (이전 보고서의 K-GAAP 데이터는 최신 K-IFRS 보고서의 prev_yr 영역에서 K-IFRS 표준으로 채워짐)
    const accStd = accumulated.accountingStandard;
    const parStd = parsed.accountingStandard;
    if (accStd && accStd !== "unknown" && parStd && parStd !== "unknown" && accStd !== parStd) {
      console.warn(`[DART] 회계기준 변경 감지 — accumulated=${accStd}, parsed=${parStd} (${parsed.years.join(",")}). 이전 보고서 drop.`);
      return false;
    }
    mergeRows(accumulated.bsRows, parsed.bsRows, parsed.years);
    mergeRows(accumulated.isRows, parsed.isRows, parsed.years);
    mergeRows(accumulated.cfRows, parsed.cfRows, parsed.years);
  }
  for (const y of parsed.years) {
    if (!accumulated.dataYears.includes(y)) accumulated.dataYears.push(y);
  }
  return true;
}

interface AuditReportResult {
  ofs: { bsRows: FinancialRow[]; isRows: FinancialRow[]; cfRows: FinancialRow[]; dataYears: string[]; accountingStandard?: AccountingStandard } | null;
  cfs: { bsRows: FinancialRow[]; isRows: FinancialRow[]; cfRows: FinancialRow[]; dataYears: string[]; accountingStandard?: AccountingStandard } | null;
  notesSections?: Record<string, string>;
  accountingStandardChanged?: boolean; // 회계기준 변경 감지 — UI 토스트/경고용
}

async function fetchAuditReportData(
  corpCode: string,
  years: string[]
): Promise<AuditReportResult> {
  const apiKey = getApiKey();

  // 1. 외부감사관련(pblntf_ty=F) 공시에서 감사보고서 + 연결감사보고서 rcept_no 수집
  const ofsMap: Record<string, string> = {}; // 개별: 감사보고서
  const cfsMap: Record<string, string> = {}; // 연결: 연결감사보고서

  const minYear = parseInt(years.reduce((a, b) => a < b ? a : b));
  try {
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: `${minYear - 1}0101`,
      end_de: "20261231",
      pblntf_ty: "F",
      page_count: "50",
    });
    const res = await fetch(`${DART_API_BASE}/list.json?${params}`);
    const d = await res.json();
    for (const it of d.list || []) {
      const nm: string = it.report_nm || "";
      if (nm.includes("제출")) continue;
      const m = nm.match(/\((\d{4})/);
      if (!m) continue;
      const yr = m[1];

      if (nm.includes("연결감사보고서")) {
        if (!cfsMap[yr]) cfsMap[yr] = it.rcept_no;
      } else if (nm.includes("감사보고서")) {
        if (!ofsMap[yr]) ofsMap[yr] = it.rcept_no;
      }
    }
  } catch { /* ignore */ }

  // 1-b. 감사보고서로 커버 안 되는 연도는 사업보고서(A-type) XML로 보완
  const coveredYears = new Set([...Object.keys(ofsMap), ...Object.keys(cfsMap)]);
  const missingYears = years.filter(y => !coveredYears.has(y));
  const annualMap: Record<string, string> = {}; // 사업보고서 rcept_no
  if (missingYears.length > 0) {
    try {
      const params = new URLSearchParams({
        crtfc_key: apiKey,
        corp_code: corpCode,
        bgn_de: `${minYear - 1}0101`,
        end_de: "20261231",
        pblntf_ty: "A",
        page_count: "50",
      });
      const res = await fetch(`${DART_API_BASE}/list.json?${params}`);
      const d = await res.json();
      for (const it of d.list || []) {
        const nm: string = it.report_nm || "";
        if (nm.includes("기재정정")) continue;
        if (!nm.includes("사업보고서")) continue;
        const m = nm.match(/\((\d{4})/);
        if (!m) continue;
        const yr = m[1];
        if (missingYears.includes(yr) && !annualMap[yr]) {
          annualMap[yr] = it.rcept_no;
        }
      }
      if (Object.keys(annualMap).length > 0) {
        console.log(`[DART] 감사보고서 미커버 연도 → 사업보고서 XML 보완: ${Object.keys(annualMap).join(",")}`);
      }
    } catch { /* ignore */ }
    // 사업보고서를 ofsMap에 추가 (감사보고서가 없는 연도만)
    for (const [yr, rno] of Object.entries(annualMap)) {
      if (!ofsMap[yr]) ofsMap[yr] = rno;
    }
  }

  const ofsYears = Object.keys(ofsMap);
  const cfsYears = Object.keys(cfsMap);
  console.log(`[DART] 보고서 발견 — 개별: ${ofsYears.join(",")||"없음"} / 연결: ${cfsYears.join(",")||"없음"}`);

  // 2. 개별 + 연결 감사보고서 병렬 파싱 (Vercel US→DART KR 레이턴시 최소화)
  let ofsResult: AuditReportResult["ofs"] = null;
  let cfsResult: AuditReportResult["cfs"] = null;

  // 개별 + 연결을 동시에 파싱 (각 연도도 병렬)
  const [ofsEntries, cfsEntries] = await Promise.all([
    ofsYears.length > 0
      ? Promise.all(ofsYears.sort().reverse().map(async (yr) => {
          const parsed = await parseOneAuditXml(ofsMap[yr], yr);
          if (parsed) console.log(`[DART] ${yr}년 개별 감사보고서: BS ${parsed.bsRows.length}행, IS ${parsed.isRows.length}행`);
          return parsed;
        }))
      : Promise.resolve([] as (Awaited<ReturnType<typeof parseOneAuditXml>>)[]),
    cfsYears.length > 0
      ? Promise.all(cfsYears.sort().reverse().map(async (yr) => {
          const parsed = await parseOneAuditXml(cfsMap[yr], yr);
          if (parsed) console.log(`[DART] ${yr}년 연결 감사보고서: BS ${parsed.bsRows.length}행, IS ${parsed.isRows.length}행`);
          return parsed;
        }))
      : Promise.resolve([] as (Awaited<ReturnType<typeof parseOneAuditXml>>)[]),
  ]);

  // 주석 섹션 병합 (최신 연도 우선)
  const mergedNotes: Record<string, string> = {};
  let accountingStandardChanged = false;

  if (ofsEntries.length) {
    const acc = { bsRows: [] as FinancialRow[], isRows: [] as FinancialRow[], cfRows: [] as FinancialRow[], dataYears: [] as string[], accountingStandard: undefined as AccountingStandard | undefined };
    for (const parsed of ofsEntries) {
      if (parsed) {
        const merged = mergeAuditResults(acc, parsed);
        if (!merged) accountingStandardChanged = true;
        // 주석 병합 (최신 연도가 먼저 처리되므로 기존 키 보존)
        if (parsed.notesSections) {
          for (const [k, v] of Object.entries(parsed.notesSections)) {
            if (!mergedNotes[k]) mergedNotes[k] = v;
          }
        }
      }
    }
    if (acc.bsRows.length || acc.isRows.length) {
      acc.dataYears = [...new Set(acc.dataYears)].sort();
      ofsResult = acc;
    }
  }
  if (cfsEntries.length) {
    const acc = { bsRows: [] as FinancialRow[], isRows: [] as FinancialRow[], cfRows: [] as FinancialRow[], dataYears: [] as string[], accountingStandard: undefined as AccountingStandard | undefined };
    for (const parsed of cfsEntries) {
      if (parsed) {
        const merged = mergeAuditResults(acc, parsed);
        if (!merged) accountingStandardChanged = true;
        if (parsed.notesSections) {
          for (const [k, v] of Object.entries(parsed.notesSections)) {
            if (!mergedNotes[k]) mergedNotes[k] = v;
          }
        }
      }
    }
    if (acc.bsRows.length || acc.isRows.length) {
      acc.dataYears = [...new Set(acc.dataYears)].sort();
      cfsResult = acc;
    }
  }

  return {
    ofs: ofsResult,
    cfs: cfsResult,
    notesSections: Object.keys(mergedNotes).length > 0 ? mergedNotes : undefined,
    accountingStandardChanged: accountingStandardChanged || undefined,
  };
}

// ============================================================
// 감가상각비/무형자산상각비 보강 (사업보고서 XML 주석 파싱)
// 상장사 fnlttSinglAcntAll CF에 영업활동 조정항목 누락 시 호출
// 1순위: "감가상각비 및 무형자산상각비" 통합 라벨, 2순위: 개별 합산
// ============================================================

type DAResultPerFs = {
  depreciation: Record<string, number>;
  amortization: Record<string, number>;
  // 1순위 통합값 — "감가상각비 및 무형자산상각비" 단일 합계.
  // 통합값은 분리값 합보다 보통 큼(사용권자산상각비 등 추가 포함). EBITDA 산정 시 우선 사용.
  combined?: Record<string, number>;
  // 2순위 분리값(참고용) — 통합값과 별개로 동시에 추출되면 가시성 위해 따로 push
  refDepreciation?: Record<string, number>;
  refAmortization?: Record<string, number>;
};

type DAResult = {
  ofs: DAResultPerFs | null;
  cfs: DAResultPerFs | null;
};

function parseDANum(s: string): number | null {
  if (!s || s === "-") return null;
  const cleaned = s.trim().replace(/\s/g, "");
  const neg = /^\(.*\)$/.test(cleaned);
  const digits = cleaned.replace(/[(),]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(digits)) return null;
  const n = parseFloat(digits);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

function parseDAFromAnnualXml(content: string, years: string[]): DAResult {
  // 사업보고서 XML은 보통 [연결 재무제표 본문] → [연결 주석] → [개별 재무제표 본문] → [개별 주석] 순.
  // 주석 본문의 "감가상각비 및 무형자산상각비" 통합 라벨 행은 **값이 1개**인 단일 합계로 공시됨
  // (값이 여러 개면 대부분 세그먼트/부문별 분해 표). 단일값 행을 순서대로 수집하여 앞/뒤로 나눠
  // 연결/개별 섹션을 구분한다. 이 접근은 연결 섹션 라벨이 없는 XML에도 강건함.
  const trs = content.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];
  type Row = { idx: number; labelNoSp: string; nums: number[] };
  const rows: Row[] = [];
  for (let i = 0; i < trs.length; i++) {
    const cells = trs[i].match(/<(?:TD|TH|TE)[^>]*>[\s\S]*?(?=<(?:TD|TH|TE)|<\/TR)/gi) || [];
    const cleaned = cells.map((c) => c.replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " "));
    if (!cleaned.length) continue;
    const labelNoSp = cleaned[0].replace(/\s/g, "");
    const nums: number[] = [];
    for (const c of cleaned.slice(1)) {
      const n = parseDANum(c);
      if (n !== null) nums.push(n);
    }
    if (nums.length) rows.push({ idx: i, labelNoSp, nums });
  }

  // 단일값(1개) + 라벨 매칭 행만 필터 — 합계값으로 해석되는 행 우선
  function collectSingles(matcher: RegExp): Row[] {
    return rows.filter((r) => r.nums.length === 1 && matcher.test(r.labelNoSp));
  }

  const sortedYears = [...years].sort((a, b) => parseInt(b) - parseInt(a)); // 최신 먼저
  // 단일 행 N개를 연결(앞)/개별(뒤)로 나누고, 각각 당기/전기/전전기 순으로 years 매핑
  function splitAndMap(
    singles: Row[],
    target: keyof DAResultPerFs,
  ): { ofs: Record<string, number>; cfs: Record<string, number> } {
    const out = { ofs: {} as Record<string, number>, cfs: {} as Record<string, number> };
    if (!singles.length) return out;

    // 발견 순서대로 나옴 → idx 오름차순 정렬
    const sorted = [...singles].sort((a, b) => a.idx - b.idx);
    // 짝수 개: 앞 절반=연결, 뒤 절반=개별. 홀수: 개별만 있는 것으로 간주
    // 단, 너무 많은 중복(5개 이상)이면 연속된 2~3개를 한 섹션으로 간주
    let cfsRows: Row[] = [];
    let ofsRows: Row[] = [];
    if (sorted.length === 1) {
      ofsRows = sorted; // 단일: 개별만 있는 것으로 간주
    } else if (sorted.length === 2) {
      // 2개: 둘 다 당기/전기(한 섹션)일 수도, 연결/개별 각 1개(당기)일 수도.
      // XML 내 거리가 가까우면 같은 섹션(당기+전기), 멀면 서로 다른 섹션.
      const gap = sorted[1].idx - sorted[0].idx;
      if (gap < 100) {
        ofsRows = sorted; // 같은 섹션 당기/전기 — 개별로 간주(보수적)
      } else {
        cfsRows = [sorted[0]];
        ofsRows = [sorted[1]];
      }
    } else {
      // 3개 이상: 전체를 시간순으로 보며 큰 gap 기준 2등분
      const gaps = sorted.slice(1).map((r, i) => ({ i: i + 1, gap: r.idx - sorted[i].idx }));
      gaps.sort((a, b) => b.gap - a.gap);
      const splitAt = gaps[0].i; // 가장 큰 gap 위치에서 분할
      cfsRows = sorted.slice(0, splitAt);
      ofsRows = sorted.slice(splitAt);
    }

    function fill(section: Row[], bucket: Record<string, number>) {
      // section의 idx 순 = 당기 → 전기 → 전전기 순으로 가정
      for (let i = 0; i < Math.min(section.length, sortedYears.length); i++) {
        const v = Math.abs(section[i].nums[0]);
        if (v > 0) bucket[sortedYears[i]] = v;
      }
    }
    fill(cfsRows, out.cfs);
    fill(ofsRows, out.ofs);
    return out;
  }

  // 1순위 통합 라벨 + 2순위 분리 라벨 모두 수집 (둘 다 있으면 함께 반환 — 통합값이 EBITDA 진실, 분리값은 가시성)
  const combined = collectSingles(/^감가상각비(및|와)무형자산상각비$/);
  const depSingles = collectSingles(/^(감가상각비|유형자산감가상각비)$/);
  const amortSingles = collectSingles(/^(무형자산상각비|무형자산감가상각비|사용권자산상각비)$/);

  const combinedMap = combined.length > 0 ? splitAndMap(combined, "depreciation") : { ofs: {}, cfs: {} };
  const depMap = splitAndMap(depSingles, "depreciation");
  const amortMap = splitAndMap(amortSingles, "amortization");

  // ─── Note 31 "비용의 성격별 분류" 컨텍스트 매칭 ───────────────────────────
  // K-IFRS 주석에서 영업비용을 성격별로 분해할 때 D&A를 명시적으로 공시. top-level에
  // 통합 라벨이 없는 회사도 이 주석에서 추출 가능. "비용의 성격별 분류" 라벨이 등장한
  // 직후 N개 TR 윈도우만 매칭 → 다른 표(예: 매출원가 명세) false positive 방지.
  const NOTE31_LABEL_RE = /(비용의?성격별?분류|성격별?비용)/;
  const NOTE31_WINDOW = 200;
  const note31Windows: Array<{ start: number; end: number }> = [];
  for (const r of rows) {
    if (NOTE31_LABEL_RE.test(r.labelNoSp)) {
      note31Windows.push({ start: r.idx, end: r.idx + NOTE31_WINDOW });
    }
  }
  function inNote31(idx: number): boolean {
    return note31Windows.some((w) => idx >= w.start && idx <= w.end);
  }
  function collectInNote31(matcher: RegExp): Row[] {
    if (note31Windows.length === 0) return [];
    return rows.filter((r) => r.nums.length === 1 && matcher.test(r.labelNoSp) && inNote31(r.idx));
  }

  const note31Combined = collectInNote31(/^감가상각비(및|와)무형자산상각비$/);
  const note31Dep = collectInNote31(/^(감가상각비|유형자산감가상각비)$/);
  const note31Am = collectInNote31(/^(무형자산상각비|무형자산감가상각비|사용권자산상각비)$/);
  const note31CombinedMap = note31Combined.length > 0 ? splitAndMap(note31Combined, "depreciation") : { ofs: {}, cfs: {} };
  const note31DepMap = note31Dep.length > 0 ? splitAndMap(note31Dep, "depreciation") : { ofs: {}, cfs: {} };
  const note31AmMap = note31Am.length > 0 ? splitAndMap(note31Am, "amortization") : { ofs: {}, cfs: {} };

  function build(side: "ofs" | "cfs"): DAResultPerFs | null {
    const cb = combinedMap[side];
    const cb31 = note31CombinedMap[side];
    const dp = depMap[side];
    const am = amortMap[side];
    const dp31 = note31DepMap[side];
    const am31 = note31AmMap[side];

    const hasCb = Object.keys(cb).length > 0;
    const hasCb31 = Object.keys(cb31).length > 0;
    const hasDp = Object.keys(dp).length > 0;
    const hasAm = Object.keys(am).length > 0;
    const hasDp31 = Object.keys(dp31).length > 0;
    const hasAm31 = Object.keys(am31).length > 0;
    if (!hasCb && !hasCb31 && !hasDp && !hasAm && !hasDp31 && !hasAm31) return null;

    // 참고용 분리값: top-level 우선, 없으면 Note 31
    const refDp = hasDp ? dp : (hasDp31 ? dp31 : undefined);
    const refAm = hasAm ? am : (hasAm31 ? am31 : undefined);

    // 우선순위 1: top-level combined
    if (hasCb) {
      return { depreciation: cb, amortization: {}, combined: cb, refDepreciation: refDp, refAmortization: refAm };
    }
    // 우선순위 2: Note 31 combined
    if (hasCb31) {
      return { depreciation: cb31, amortization: {}, combined: cb31, refDepreciation: refDp, refAmortization: refAm };
    }
    // 우선순위 3: top-level 분리
    if (hasDp || hasAm) {
      return { depreciation: dp, amortization: am };
    }
    // 우선순위 4: Note 31 분리
    return { depreciation: dp31, amortization: am31 };
  }

  return { ofs: build("ofs"), cfs: build("cfs") };
}

async function fetchAndParseOneAnnualReport(
  rceptNo: string,
  reportNm: string,
  requestedYears: string[],
): Promise<DAResult> {
  const empty: DAResult = { ofs: null, cfs: null };
  try {
    console.log(`[DART] D&A 보강 — 사업보고서: ${reportNm} (${rceptNo})`);
    // 보고서 당기 연도 파싱: "사업보고서 (2024.12)" → 2024
    const curMatch = reportNm.match(/\((\d{4})[./]\d{1,2}\)/);
    const curYear = curMatch ? parseInt(curMatch[1]) : Math.max(...requestedYears.map(Number));
    // 해당 보고서는 당기+전기만 커버 → 요청 연도 범위와 교집합에 당기/전기만 씀
    const coverage = [String(curYear), String(curYear - 1)].filter((y) => requestedYears.includes(y));
    if (coverage.length === 0) return empty;

    // 공유 캐시 사용 — Stage 1.5(extractAnnualReportStatements)가 같은 rceptNo를
    // 호출하면 1회만 다운로드. content-sniff로 본문 XML 선택.
    const content = await fetchAnnualReportMainXml(rceptNo);
    if (!content) return empty;
    // coverage 연도(내림차순)를 years로 넘겨 vals[0]=당기, vals[1]=전기로 정확히 매핑
    return parseDAFromAnnualXml(content, coverage);
  } catch (e) {
    console.warn(`[DART] 사업보고서 ${rceptNo} 파싱 실패:`, e instanceof Error ? e.message : e);
    return empty;
  }
}

async function extractDAFromAnnualReport(corpCode: string, years: string[]): Promise<DAResult> {
  const apiKey = getApiKey();
  const empty: DAResult = { ofs: null, cfs: null };
  try {
    const minYear = Math.min(...years.map(Number));
    const listParams = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: `${minYear - 1}0101`,
      end_de: "20261231",
      pblntf_ty: "A",
      page_count: "30",
    });
    const listRes = await fetch(`${DART_API_BASE}/list.json?${listParams}`, { signal: AbortSignal.timeout(15_000) });
    const listJson = await listRes.json();
    const reports: { rcept_no: string; report_nm: string }[] = (listJson.list || []).filter(
      (it: any) => /사업보고서/.test(it.report_nm) && !/기재정정/.test(it.report_nm),
    );
    if (!reports.length) return empty;

    // 최신 사업보고서는 당기+전기 2년 D&A 제공. 3년 이상 요청 시 이전 해 사업보고서도 병렬 fetch
    // (years=['2023','2024','2025'] → 최신=2025보고서(당기2025+전기2024), 전전기는 2024보고서(당기2024+전기2023))
    const yearsToCover = [...new Set(years)];
    const sortedYearsDesc = [...yearsToCover].sort((a, b) => parseInt(b) - parseInt(a));
    // 필요한 보고서 개수 = ceil(years / 2) — 각 보고서가 2년 커버
    const needed = Math.min(Math.ceil(yearsToCover.length / 2), reports.length);
    const selected = reports.slice(0, needed);
    console.log(`[DART] D&A 보강 — 사업보고서 ${selected.length}건 병렬 파싱`);

    const parsed = await Promise.all(
      selected.map((r) => fetchAndParseOneAnnualReport(r.rcept_no, r.report_nm, years)),
    );

    // 여러 보고서의 결과 병합: 앞 보고서(최신) 값이 우선, 뒤 보고서는 비어있는 연도만 채움
    const merged: DAResult = { ofs: null, cfs: null };
    for (const r of parsed) {
      for (const k of ["ofs", "cfs"] as const) {
        if (!r[k]) continue;
        if (!merged[k]) merged[k] = { depreciation: {}, amortization: {} };
        for (const field of ["depreciation", "amortization"] as const) {
          for (const [yr, v] of Object.entries(r[k]![field])) {
            if (merged[k]![field][yr] === undefined) merged[k]![field][yr] = v;
          }
        }
        // combined / refDepreciation / refAmortization 도 같은 방식으로 병합 (가시성 행 push용)
        for (const optField of ["combined", "refDepreciation", "refAmortization"] as const) {
          const src = r[k]![optField];
          if (!src) continue;
          if (!merged[k]![optField]) merged[k]![optField] = {};
          for (const [yr, v] of Object.entries(src)) {
            if (merged[k]![optField]![yr] === undefined) merged[k]![optField]![yr] = v as number;
          }
        }
      }
    }
    if (merged.ofs) console.log(`[DART] D&A 개별 병합: 통합 ${JSON.stringify(merged.ofs.combined||{})}, 유형 ${JSON.stringify(merged.ofs.refDepreciation||{})}, 무형 ${JSON.stringify(merged.ofs.refAmortization||{})}`);
    if (merged.cfs) console.log(`[DART] D&A 연결 병합: 통합 ${JSON.stringify(merged.cfs.combined||{})}, 유형 ${JSON.stringify(merged.cfs.refDepreciation||{})}, 무형 ${JSON.stringify(merged.cfs.refAmortization||{})}`);
    return merged;
  } catch (e) {
    console.warn(`[DART] extractDAFromAnnualReport 실패:`, e instanceof Error ? e.message : e);
    return empty;
  }
}

// ─── Stage 1.5: 사업보고서 본문 BS/IS/CF 추출 ───────────────────────────────
// fnlttSinglAcntAll(Stage 1)이 sparse한 비상장 외감법인 등을 위해 사업보고서 본문
// XML에서 직접 BS/IS/CF 표를 파싱. 사업보고서에는 연결+별도 두 세트가 같은 XML에
// 들어있어 OFS/CFS 분리 전처리 필요.

/**
 * 사업보고서 본문 XML을 (연결 / 별도) 두 섹션으로 분리.
 * - 비상장 외감법인 (프로젠 등): 연결 섹션 없음 → 전체가 OFS
 * - 일반 상장사: 연결 섹션 먼저, 별도 섹션 뒤
 */
function splitAnnualReportXml(content: string): { ofsContent: string | null; cfsContent: string | null } {
  const cfsStart = content.search(/연결\s*재무\s*상태표/);

  if (cfsStart < 0) {
    return { ofsContent: content, cfsContent: null };
  }

  // 연결 이후 본문에서 "재무상태표" 매치 모두 수집 → 직전 8자에 "연결"이 없는 첫 매치 채택
  const afterCfs = content.slice(cfsStart + 1);
  let ofsRelative = -1;
  for (const m of afterCfs.matchAll(/재무\s*상태표|별도\s*재무상태표|개별\s*재무상태표/g)) {
    const idx = m.index ?? -1;
    if (idx < 0) continue;
    const before = afterCfs.slice(Math.max(0, idx - 8), idx);
    if (!/연결\s*$/.test(before)) {
      ofsRelative = idx;
      break;
    }
  }

  if (ofsRelative < 0) {
    return { ofsContent: null, cfsContent: content.slice(cfsStart) };
  }
  return {
    cfsContent: content.slice(cfsStart, cfsStart + 1 + ofsRelative),
    ofsContent: content.slice(cfsStart + 1 + ofsRelative),
  };
}

/**
 * 사업보고서 1건의 본문 XML을 받아 {ofs, cfs} 각각 파싱.
 */
async function parseStatementsFromAnnualReportXml(
  rceptNo: string,
  reportNm: string,
  requestedYears: string[],
): Promise<{
  ofs: ReturnType<typeof parseStatementsFromTRContent> | null;
  cfs: ReturnType<typeof parseStatementsFromTRContent> | null;
  curYear: string | null;
} | null> {
  const curMatch = reportNm.match(/\((\d{4})[./]\d{1,2}\)/);
  const curYear = curMatch ? curMatch[1] : null;
  if (!curYear) {
    console.warn(`[DART] 사업보고서 ${rceptNo} (${reportNm}) — 당기 연도 파싱 실패`);
    return null;
  }
  const coverage = [curYear, String(parseInt(curYear) - 1)].filter((y) => requestedYears.includes(y));
  if (coverage.length === 0) return null;

  const content = await fetchAnnualReportMainXml(rceptNo);
  if (!content) return null;

  const { ofsContent, cfsContent } = splitAnnualReportXml(content);
  const ofs = ofsContent ? parseStatementsFromTRContent(ofsContent, curYear) : null;
  const cfs = cfsContent ? parseStatementsFromTRContent(cfsContent, curYear) : null;
  return { ofs, cfs, curYear };
}

/**
 * 회사의 사업보고서 N건을 fetch → 연도별 BS/IS/CF 추출 → mergeAuditResults로 누적.
 * 결과 shape는 AuditReportResult 그대로 (Stage 1.5 ↔ Stage 3 폴백 chain에서 호환).
 */
async function extractAnnualReportStatements(
  corpCode: string,
  years: string[],
): Promise<AuditReportResult> {
  const apiKey = getApiKey();
  const empty: AuditReportResult = { ofs: null, cfs: null };
  try {
    const minYear = Math.min(...years.map(Number));
    const listParams = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: `${minYear - 1}0101`,
      end_de: "20261231",
      pblntf_ty: "A",
      page_count: "30",
    });
    const listRes = await fetch(`${DART_API_BASE}/list.json?${listParams}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const listJson = await listRes.json();
    const reports: { rcept_no: string; report_nm: string }[] = (listJson.list || []).filter(
      (it: { report_nm?: string }) => /사업보고서/.test(it.report_nm || "") && !/기재정정/.test(it.report_nm || ""),
    );
    if (!reports.length) {
      console.log(`[DART] Stage 1.5 — 사업보고서 0건. 폴백 불가.`);
      return empty;
    }

    const needed = Math.min(Math.ceil(years.length / 2), reports.length);
    const selected = reports.slice(0, needed);
    console.log(`[DART] Stage 1.5 — 사업보고서 ${selected.length}건 병렬 파싱`);

    const parsed = await Promise.all(
      selected.map((r) => parseStatementsFromAnnualReportXml(r.rcept_no, r.report_nm, years)),
    );

    const ofsAcc = { bsRows: [] as FinancialRow[], isRows: [] as FinancialRow[], cfRows: [] as FinancialRow[], dataYears: [] as string[], accountingStandard: undefined as AccountingStandard | undefined };
    const cfsAcc = { bsRows: [] as FinancialRow[], isRows: [] as FinancialRow[], cfRows: [] as FinancialRow[], dataYears: [] as string[], accountingStandard: undefined as AccountingStandard | undefined };
    let accountingStandardChanged = false;
    const mergedNotes: Record<string, string> = {};

    for (const p of parsed) {
      if (!p) continue;
      if (p.ofs) {
        const merged = mergeAuditResults(ofsAcc, p.ofs);
        if (!merged) accountingStandardChanged = true;
        if (p.ofs.notesSections) {
          for (const [k, v] of Object.entries(p.ofs.notesSections)) {
            if (!mergedNotes[k]) mergedNotes[k] = v;
          }
        }
      }
      if (p.cfs) {
        const merged = mergeAuditResults(cfsAcc, p.cfs);
        if (!merged) accountingStandardChanged = true;
      }
    }

    const ofsHasData = ofsAcc.bsRows.length > 0 || ofsAcc.isRows.length > 0;
    const cfsHasData = cfsAcc.bsRows.length > 0 || cfsAcc.isRows.length > 0;
    if (ofsHasData) ofsAcc.dataYears = [...new Set(ofsAcc.dataYears)].sort();
    if (cfsHasData) cfsAcc.dataYears = [...new Set(cfsAcc.dataYears)].sort();

    console.log(`[DART] Stage 1.5 결과 — OFS: BS ${ofsAcc.bsRows.length}/IS ${ofsAcc.isRows.length}/CF ${ofsAcc.cfRows.length} 행, CFS: BS ${cfsAcc.bsRows.length}/IS ${cfsAcc.isRows.length}/CF ${cfsAcc.cfRows.length} 행`);

    return {
      ofs: ofsHasData ? ofsAcc : null,
      cfs: cfsHasData ? cfsAcc : null,
      notesSections: Object.keys(mergedNotes).length > 0 ? mergedNotes : undefined,
      accountingStandardChanged: accountingStandardChanged || undefined,
    };
  } catch (e) {
    console.warn(`[DART] extractAnnualReportStatements 실패:`, e instanceof Error ? e.message : e);
    return empty;
  }
}

function hasCfDepreciationRows(cfRows: FinancialRow[]): boolean {
  return cfRows.some((r) => {
    const n = (r.account || "").replace(/\s/g, "");
    return /감가상각|유형자산감가|사용권자산상각|무형자산상각|무형자산감가/.test(n);
  });
}

function mergeDAIntoCfRows(
  cfRows: FinancialRow[],
  da: DAResultPerFs | null,
  displayYears: string[],
  origYears: string[],
): FinancialRow[] {
  if (!da) return cfRows;
  const mapY: Record<string, string> = {};
  for (let i = 0; i < origYears.length; i++) mapY[origYears[i]] = displayYears[i];
  function toRow(account: string, bucket: Record<string, number>): FinancialRow | null {
    if (Object.keys(bucket).length === 0) return null;
    const row: FinancialRow = { account };
    for (const [y, v] of Object.entries(bucket)) {
      row[mapY[y] || y] = String(Math.round(v));
    }
    return row;
  }
  const merged = [...cfRows];
  // 우선순위 1: 통합값이 있으면 "감가상각비 및 무형자산상각비(주석)"으로 push (EBITDA 산정용)
  if (da.combined && Object.keys(da.combined).length > 0) {
    const cbRow = toRow("감가상각비 및 무형자산상각비(주석)", da.combined);
    if (cbRow) merged.push(cbRow);
    // 분리 참고값도 같이 push (가시성, EBITDA 중복합산 회피 위해 라벨에 "참고" 명시)
    const refDep = toRow("유형자산감가상각비(참고)", da.refDepreciation || {});
    const refAm = toRow("무형자산상각비(참고)", da.refAmortization || {});
    if (refDep) merged.push(refDep);
    if (refAm) merged.push(refAm);
  } else {
    // 통합값 없을 때: 분리값 그대로 push (구버전 동작)
    const depRow = toRow("감가상각비", da.depreciation);
    const amortRow = toRow("무형자산상각비", da.amortization);
    if (depRow) merged.push(depRow);
    if (amortRow) merged.push(amortRow);
  }
  return merged;
}

// ============================================================
// 메인: 3단계 fallback
// ============================================================

function processRawStatements(
  allRaw: Record<string, DartRawItem[]>,
  years: string[],
  yearReprtMap?: Record<string, string>
): { bsRows: FinancialRow[]; isRows: FinancialRow[]; cfRows: FinancialRow[]; ratios: Record<string, Record<string, string>> } {
  const bsRows = buildStatements(allRaw, years, ["BS"], yearReprtMap);
  const hasIS = Object.values(allRaw).some((items) => items.some((it) => it.sj_div === "IS"));
  const isRows = buildStatements(allRaw, years, hasIS ? ["IS"] : ["CIS"], yearReprtMap);
  // 현금흐름표(CF) 데이터 추출 — EBITDA 산출용 감가상각비/무형자산상각비 소스
  const hasCF = Object.values(allRaw).some((items) => items.some((it) => it.sj_div === "CF"));
  const cfRows = hasCF ? buildStatements(allRaw, years, ["CF"], yearReprtMap) : [];
  const ratios = calcRatios(bsRows, isRows, years, cfRows);
  return { bsRows, isRows, cfRows, ratios };
}

/**
 * Stage 1 결과의 데이터 품질 점검. 핵심 4계정(매출/자산총계/부채총계/자본총계)이
 * 요청 연도 전부에 존재하는지 + 분기보고서/연도 커버리지 조건을 확인.
 *
 * Safety guard: 4계정 모두 N-1 연도 이상 매칭되면 (정상 상장사 false positive 방지)
 * 무조건 ok=true. K-GAAP→K-IFRS 전환된 회사가 1년 비는 케이스도 healthy로 인정.
 *
 * Unhealthy 사유 예: 프로젠 — 23년 K-GAAP 라인 drop으로 매출/자산총계 23년 칸 비움.
 */
function isStage1Healthy(
  bs: FinancialRow[],
  is: FinancialRow[],
  _cf: FinancialRow[],
  displayYears: string[],
  stats: { allQuarterly: boolean; yearsWithData: number; totalYears: number }
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const N = displayYears.length;
  const normalize = (s: string) => (s || "").replace(/\s/g, "");

  function findRow(rows: FinancialRow[], regex: RegExp): FinancialRow | null {
    return rows.find((r) => regex.test(normalize(r.account))) || null;
  }
  function valueStatus(row: FinancialRow | null): { missingYears: string[] } {
    if (!row) return { missingYears: [...displayYears] };
    const missing: string[] = [];
    for (const y of displayYears) {
      const v = row[y];
      if (v === undefined || v === null || v === "" || v === "-" || v === "0") missing.push(y);
    }
    return { missingYears: missing };
  }

  const revRow = findRow(is, /^(매출액|영업수익|매출|보험수익|보험료수익|순영업수익|공사수익|분양수익|도급수익)$/);
  const assetRow = findRow(bs, /^자산총계$/);
  const liabRow = findRow(bs, /^부채총계$/);
  const equityRow = findRow(bs, /^자본총계$/);

  const revStat = valueStatus(revRow);
  const assetStat = valueStatus(assetRow);
  const liabStat = valueStatus(liabRow);
  const equityStat = valueStatus(equityRow);

  // 4계정 모두 ≥ N-1 연도 매칭되면 healthy로 확정 (정상 상장사 false positive 방지)
  if (N >= 2) {
    const fullCount = [revStat, assetStat, liabStat, equityStat].filter((s) => s.missingYears.length <= 1).length;
    if (fullCount === 4) return { ok: true, reasons: [] };
  }

  if (revStat.missingYears.length > 0) {
    reasons.push(`매출/영업수익 ${revRow ? "연도 누락" : "행 없음"} (missing=${revStat.missingYears.join(",") || "row"})`);
  }
  if (assetStat.missingYears.length > 0) {
    reasons.push(`자산총계 ${assetRow ? "연도 누락" : "행 없음"} (missing=${assetStat.missingYears.join(",") || "row"})`);
  }
  if (liabStat.missingYears.length > 0) {
    reasons.push(`부채총계 ${liabRow ? "연도 누락" : "행 없음"} (missing=${liabStat.missingYears.join(",") || "row"})`);
  }
  if (equityStat.missingYears.length > 0) {
    reasons.push(`자본총계 ${equityRow ? "연도 누락" : "행 없음"} (missing=${equityStat.missingYears.join(",") || "row"})`);
  }
  if (stats.allQuarterly && N > 0) {
    reasons.push("모든 연도가 분기보고서 (사업보고서 미공시)");
  }
  if (stats.totalYears > 0 && stats.yearsWithData < stats.totalYears * 0.5) {
    reasons.push(`데이터 있는 연도 ${stats.yearsWithData}/${stats.totalYears} (<50%)`);
  }

  return { ok: reasons.length === 0, reasons };
}

export async function buildFinancialData(
  corpCode: string,
  years: string[],
  stockCode?: string
): Promise<FinancialResult> {
  try {
    return await _buildFinancialDataImpl(corpCode, years, stockCode);
  } finally {
    clearAnnualXmlCache();
  }
}

async function _buildFinancialDataImpl(
  corpCode: string,
  years: string[],
  stockCode?: string
): Promise<FinancialResult> {
  const companyInfo = await getCompanyInfo(corpCode);

  const result: FinancialResult = {
    companyInfo,
    bsItems: [],
    isItems: [],
    cfItems: [],
    ratios: {},
    hasOfs: false,
    bsItemsCfs: [],
    isItemsCfs: [],
    cfItemsCfs: [],
    ratiosCfs: {},
    hasCfs: false,
    years,
    source: "DART Open API",
    hasData: false,
  };

  // 비상장 법인 감지 (stockCode 빈값)
  // 단, 비상장이라도 외감법인(corp_cls=E)은 fnlttSinglAcntAll 데이터가 있을 수 있음 (교보생명보험 등)
  // → Stage 1을 항상 시도하고, 데이터 없으면 Stage 3으로 fallback
  const isNonListed = stockCode !== undefined && stockCode.trim() === "";
  if (isNonListed) {
    console.log(`[DART] 비상장 법인 감지 (${companyInfo.corpName || corpCode}) → Stage 1 시도 후 실패 시 Stage 3 fallback`);
  }

  // ── 1단계: 전체재무제표 API (fnlttSinglAcntAll) — OFS + CFS 완전 병렬 조회 ──
  // 기존: OFS→CFS 순차 (Vercel US→DART KR 레이턴시로 CFS 타임아웃 빈발)
  // 개선: OFS 3년 + CFS 3년 = 6개 호출을 한 번에 병렬 실행
  let gotFull = false;

  function renameYearKeys(rows: any[], oldYears: string[], newYears: string[]) {
    for (const row of rows) {
      for (let i = 0; i < oldYears.length; i++) {
        if (oldYears[i] !== newYears[i] && row[oldYears[i]] !== undefined) {
          row[newYears[i]] = row[oldYears[i]];
          delete row[oldYears[i]];
        }
      }
    }
  }

  // OFS + CFS 모든 연도를 한 번에 병렬 호출
  const allFetches: Promise<{ fsDiv: string; year: string; raw: DartRawItem[]; reprtCode: string }>[] = [];
  for (const fsDiv of ["OFS", "CFS"] as const) {
    for (const year of years) {
      allFetches.push(
        fetchFinancialItems(corpCode, year, fsDiv)
          .then(({ items, reprtCode }) => ({ fsDiv, year, raw: items, reprtCode }))
          .catch((e) => {
            console.error(`[DART] ${year}년 ${fsDiv} 조회 실패:`, e instanceof Error ? e.message : e);
            return { fsDiv, year, raw: [] as DartRawItem[], reprtCode: "" };
          })
      );
    }
  }
  const allResults = await Promise.all(allFetches);

  // OFS/CFS 별로 결과 분류 및 처리
  // Stage 1.5 폴백 판단을 위해 각 fsDiv 의 health 결과와 displayYears 보존
  type Stage1Health = { ok: boolean; reasons: string[] };
  const stage1Health: { ofs?: Stage1Health; cfs?: Stage1Health } = {};

  for (const [fsLabel, fsDiv] of [["개별", "OFS"], ["연결", "CFS"]] as const) {
    const rawByYear: Record<string, DartRawItem[]> = {};
    let hasData = false;
    const quarterlyWarnings: string[] = [];
    const yearReprtMap: Record<string, string> = {};

    for (const r of allResults.filter(r => r.fsDiv === fsDiv)) {
      rawByYear[r.year] = r.raw;
      if (r.raw.length) {
        hasData = true;
        yearReprtMap[r.year] = r.reprtCode;
        console.log(`[DART] ${r.year}년 ${fsLabel} → ${r.raw.length}개 항목 (${REPRT_LABELS[r.reprtCode] || r.reprtCode})`);
        if (r.reprtCode && r.reprtCode !== "11011") {
          const month = REPRT_MONTH[r.reprtCode] || "12";
          quarterlyWarnings.push(`${r.year}년: ${REPRT_LABELS[r.reprtCode]} 기준 (${r.year}.${month}월, 사업보고서 미공시 — IS는 누적이 아닌 분기 데이터일 수 있음)`);
        }
      }
    }
    // 데이터 없는 연도도 빈 배열로 채움
    for (const y of years) {
      if (!rawByYear[y]) rawByYear[y] = [];
    }

    if (!hasData) {
      console.log(`[DART] ${fsLabel} 재무제표 데이터 없음 → 스킵`);
      continue;
    }
    gotFull = true;

    const { bsRows, isRows, cfRows, ratios } = processRawStatements(rawByYear, years, yearReprtMap);

    // 분기보고서 연도의 컬럼 헤더를 "2025" → "2025.09" 등으로 변경
    const displayYears = years.map(y => {
      const rc = yearReprtMap[y];
      if (rc && rc !== "11011") {
        return `${y}.${REPRT_MONTH[rc] || "12"}`;
      }
      return y;
    });

    renameYearKeys(bsRows, years, displayYears);
    renameYearKeys(isRows, years, displayYears);
    renameYearKeys(cfRows, years, displayYears);

    // ratios 연도 키도 변경
    const newRatios: Record<string, Record<string, string>> = {};
    for (let i = 0; i < years.length; i++) {
      if (ratios[years[i]]) {
        newRatios[displayYears[i]] = ratios[years[i]];
      }
    }

    // Stage 1 결과 품질 점검 (Stage 1.5 폴백 판단용)
    const yearsWithData = years.filter((y) => (rawByYear[y] || []).length > 0).length;
    const reprtCodes = Object.values(yearReprtMap);
    const allQuarterly = reprtCodes.length === years.length && reprtCodes.every((c) => c && c !== "11011");
    const health = isStage1Healthy(bsRows, isRows, cfRows, displayYears, {
      allQuarterly,
      yearsWithData,
      totalYears: years.length,
    });
    if (!health.ok) {
      console.log(`[DART] ${fsLabel} Stage 1 health=NG — reasons: ${health.reasons.join(" / ")}`);
    }

    if (fsDiv === "OFS") {
      result.bsItems = bsRows;
      result.isItems = isRows;
      result.cfItems = cfRows;
      result.ratios = newRatios;
      result.hasOfs = true;
      result.extractionSourceOfs = "stage1";
      stage1Health.ofs = health;
    } else {
      result.bsItemsCfs = bsRows;
      result.isItemsCfs = isRows;
      result.cfItemsCfs = cfRows;
      result.ratiosCfs = newRatios;
      result.hasCfs = true;
      result.extractionSourceCfs = "stage1";
      stage1Health.cfs = health;
    }

    // displayYears 저장 (기존 years 대체)
    result.years = displayYears;

    if (quarterlyWarnings.length > 0) {
      (result as any).quarterlyWarnings = quarterlyWarnings;
    }
  }

  if (gotFull) {
    // ── Stage 1.5: Stage 1 sparse 감지 시 사업보고서 본문 BS/IS/CF 폴백 ──
    // 비상장 외감법인(프로젠 등) 또는 K-GAAP→K-IFRS 전환된 회사는 fnlttSinglAcntAll
    // 응답이 sparse하거나 K-GAAP 라인 drop으로 한 해가 거의 빈다. 이때 동일 연도
    // 사업보고서 본문 XML에서 BS/IS/CF를 직접 추출해 REPLACE.
    const ofsUnhealthy = result.hasOfs && stage1Health.ofs !== undefined && !stage1Health.ofs.ok;
    const cfsUnhealthy = result.hasCfs && stage1Health.cfs !== undefined && !stage1Health.cfs.ok;
    if (ofsUnhealthy || cfsUnhealthy) {
      console.log(`[DART] Stage 1.5 진입 — 사업보고서 본문 폴백 시도 (ofsUnhealthy=${ofsUnhealthy}, cfsUnhealthy=${cfsUnhealthy})`);
      const annual = await extractAnnualReportStatements(corpCode, years);

      // 사업보고서 본문 데이터는 plain year 키 ("2024") 사용 → result.years 도 plain으로 재설정
      // (Stage 1 분기 displayYears "2024.09"와 충돌하므로 통일)
      const wantsAnnualYearsLabel = ofsUnhealthy && annual.ofs || cfsUnhealthy && annual.cfs;
      if (wantsAnnualYearsLabel) {
        result.years = [...years];
      }

      if (ofsUnhealthy && annual.ofs) {
        result.bsItems = annual.ofs.bsRows;
        result.isItems = annual.ofs.isRows;
        result.cfItems = annual.ofs.cfRows;
        result.ratios = calcRatios(result.bsItems, result.isItems, result.years, result.cfItems);
        result.hasOfs = true;
        result.extractionSourceOfs = "annual-report-body";
        console.log(`[DART] Stage 1.5 OFS REPLACE — BS ${result.bsItems.length}/IS ${result.isItems.length}/CF ${result.cfItems.length} 행`);
      }
      if (cfsUnhealthy && annual.cfs) {
        result.bsItemsCfs = annual.cfs.bsRows;
        result.isItemsCfs = annual.cfs.isRows;
        result.cfItemsCfs = annual.cfs.cfRows;
        result.ratiosCfs = calcRatios(result.bsItemsCfs, result.isItemsCfs, result.years, result.cfItemsCfs);
        result.hasCfs = true;
        result.extractionSourceCfs = "annual-report-body";
        console.log(`[DART] Stage 1.5 CFS REPLACE — BS ${result.bsItemsCfs.length}/IS ${result.isItemsCfs.length}/CF ${result.cfItemsCfs.length} 행`);
      }
      if (annual.accountingStandardChanged) {
        result.accountingStandardChanged = true;
      }
      if (annual.notesSections && !result.notesSections) {
        result.notesSections = annual.notesSections;
      }
    }

    // ── CF 조정항목(감가상각비/무형자산상각비) 보강 ──
    // Stage 1/2의 fnlttSinglAcntAll API는 영업활동 최상위 항목만 반환.
    // 조정항목 누락 시 EBITDA가 영업이익만 반영 → 사업보고서 XML 주석에서 보강
    const needOfsDa = result.hasOfs && !hasCfDepreciationRows(result.cfItems);
    const needCfsDa = result.hasCfs && !hasCfDepreciationRows(result.cfItemsCfs);
    if (needOfsDa || needCfsDa) {
      const t0 = Date.now();
      console.log(`[DART] CF 조정항목 누락 감지 (개별=${needOfsDa}, 연결=${needCfsDa}) → 사업보고서 XML 보강 시도`);
      const da = await extractDAFromAnnualReport(corpCode, years);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const ofsApplied = needOfsDa && da.ofs;
      const cfsApplied = needCfsDa && da.cfs;
      if (ofsApplied) {
        result.cfItems = mergeDAIntoCfRows(result.cfItems, da.ofs, result.years, years);
        result.ratios = calcRatios(result.bsItems, result.isItems, result.years, result.cfItems);
      }
      if (cfsApplied) {
        result.cfItemsCfs = mergeDAIntoCfRows(result.cfItemsCfs, da.cfs, result.years, years);
        result.ratiosCfs = calcRatios(result.bsItemsCfs, result.isItemsCfs, result.years, result.cfItemsCfs);
      }
      console.log(`[DART] D&A 보강 완료 ${elapsed}s — OFS적용=${!!ofsApplied}, CFS적용=${!!cfsApplied}`);
      if (needOfsDa && !ofsApplied) {
        console.warn(`[DART] ⚠ OFS D&A 보강 실패 — EBITDA가 영업이익만 반영됨. 사업보고서 XML 주석 매칭 실패 또는 timeout 가능성`);
      }
      if (needCfsDa && !cfsApplied) {
        console.warn(`[DART] ⚠ CFS D&A 보강 실패 — EBITDA가 영업이익만 반영됨. 사업보고서 XML 주석 매칭 실패 또는 timeout 가능성`);
      }
    }

    result.hasData = true;
    result.source = "DART Open API (금융감독원 전자공시시스템)";
    return result;
  }

  // ── 2단계: 주요계정 API (fnlttSinglAcnt) ──
  {
    console.log("[DART] 전체재무제표 없음 → 주요계정(fnlttSinglAcnt) API 시도");
    const keyAccountsRaw: Record<string, DartRawItem[]> = {};
    const keySettled = await Promise.allSettled(
      years.map(async (year) => ({ year, items: await fetchKeyAccounts(corpCode, year) }))
    );
    for (const s of keySettled) {
      if (s.status === "fulfilled") {
        keyAccountsRaw[s.value.year] = s.value.items;
      } else {
        console.error("[DART] fetchKeyAccounts failed:", s.reason);
      }
    }
    // 실패한 연도는 빈 배열
    for (const year of years) {
      if (!keyAccountsRaw[year]) keyAccountsRaw[year] = [];
    }

    const keyResult = tryKeyAccounts(keyAccountsRaw, years);
    if (keyResult) {
      const ratios = calcRatios(keyResult.bsRows, keyResult.isRows, keyResult.displayYears);
      result.bsItems = keyResult.bsRows;
      result.isItems = keyResult.isRows;
      result.ratios = ratios;
      result.hasOfs = true;
      result.years = keyResult.displayYears;
      result.hasData = true;
      result.source = "DART Open API (주요계정 - fnlttSinglAcnt)";
      return result;
    }
  }

  // ── 3단계: 감사보고서 원문(XML) 파싱 — 비상장 직행 또는 1/2단계 실패 시 ──
  const filingInfo = await checkFilingType(corpCode);
  if (filingInfo.onlyAudit || !result.hasData) {
    console.log(`[DART] 주요계정도 없음 → 감사보고서 원문(XML) 파싱 시도 (onlyAudit=${filingInfo.onlyAudit})`);
    const auditResult = await fetchAuditReportData(corpCode, years);

    // 사용자 요청 연도 범위로 감사보고서 dataYears 필터링
    // 감사보고서는 당기/전기를 모두 추출하므로 요청 범위를 넘어가기 쉬움
    const minReq = Math.min(...years.map(Number));
    const maxReq = Math.max(...years.map(Number));
    function filterYearsToRange(dataYears: string[]): string[] {
      return dataYears.filter(y => {
        const n = parseInt(y);
        return n >= minReq && n <= maxReq;
      });
    }
    function filterRowsToRange(rows: FinancialRow[], filteredYears: string[], allYears: string[]): FinancialRow[] {
      const removeYears = allYears.filter(y => !filteredYears.includes(y));
      if (removeYears.length === 0) return rows;
      return rows.map(r => {
        const filtered = { ...r };
        for (const y of removeYears) delete filtered[y];
        return filtered;
      });
    }

    // 개별(OFS)
    if (auditResult.ofs) {
      const filteredYears = filterYearsToRange(auditResult.ofs.dataYears);
      const bsRows = filterRowsToRange(auditResult.ofs.bsRows, filteredYears, auditResult.ofs.dataYears);
      const isRows = filterRowsToRange(auditResult.ofs.isRows, filteredYears, auditResult.ofs.dataYears);
      const cfRows = filterRowsToRange(auditResult.ofs.cfRows, filteredYears, auditResult.ofs.dataYears);
      const ratios = calcRatios(bsRows, isRows, filteredYears, cfRows);
      result.bsItems = bsRows;
      result.isItems = isRows;
      result.cfItems = cfRows;
      result.ratios = ratios;
      result.hasOfs = true;
      result.years = filteredYears;
      result.hasData = true;
      result.extractionSourceOfs = "audit-report";
    }

    // 연결(CFS)
    if (auditResult.cfs) {
      const filteredYears = filterYearsToRange(auditResult.cfs.dataYears);
      const bsRows = filterRowsToRange(auditResult.cfs.bsRows, filteredYears, auditResult.cfs.dataYears);
      const isRows = filterRowsToRange(auditResult.cfs.isRows, filteredYears, auditResult.cfs.dataYears);
      const cfRows = filterRowsToRange(auditResult.cfs.cfRows, filteredYears, auditResult.cfs.dataYears);
      const ratios = calcRatios(bsRows, isRows, filteredYears, cfRows);
      result.bsItemsCfs = bsRows;
      result.isItemsCfs = isRows;
      result.cfItemsCfs = cfRows;
      result.ratiosCfs = ratios;
      result.hasCfs = true;
      if (!result.hasOfs) result.years = filteredYears;
      result.hasData = true;
      result.extractionSourceCfs = "audit-report";
    }

    // 주석 섹션 전달
    if (auditResult.notesSections) {
      result.notesSections = auditResult.notesSections;
    }

    // 회계기준 변경 감지 플래그 전달 (K-IFRS↔K-GAAP)
    if (auditResult.accountingStandardChanged) {
      result.accountingStandardChanged = true;
    }

    if (result.hasData) {
      result.source = "DART 감사보고서 원문 자동 파싱";
      return result;
    }
  }

  // 모든 단계 실패
  result.noDataReason = filingInfo.onlyAudit
    ? "비상장 외감법인 (감사보고서만 제출) - 감사보고서 원문 파싱도 실패. 파일 업로드 탭에서 재무제표를 직접 업로드하세요."
    : "DART에서 재무데이터를 조회할 수 없습니다.";
  return result;
}

/**
 * Stage 1(상장사 API) 데이터에 대해 감사보고서에서 주석 섹션만 별도 추출
 * 임계값이 설정된 경우에만 호출 (opt-in, ZIP 다운로드 5~8초 소요)
 */
export async function fetchAuditNotes(
  corpCode: string,
  years: string[]
): Promise<Record<string, string> | null> {
  const apiKey = getApiKey();
  try {
    const minYear = parseInt(years.reduce((a, b) => a < b ? a : b));
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: `${minYear - 1}0101`,
      end_de: "20261231",
      pblntf_ty: "F",
      page_count: "20",
    });
    const res = await fetch(`${DART_API_BASE}/list.json?${params}`);
    const d = await res.json();

    // 최신 감사보고서 rcept_no 찾기
    let rceptNo: string | null = null;
    for (const it of d.list || []) {
      const nm: string = it.report_nm || "";
      if (nm.includes("감사보고서") && !nm.includes("제출") && !nm.includes("연결")) {
        rceptNo = it.rcept_no;
        break;
      }
    }
    // F-type 감사보고서 없으면 A-type 사업보고서에서 시도
    if (!rceptNo) {
      const aParams = new URLSearchParams({
        crtfc_key: apiKey,
        corp_code: corpCode,
        bgn_de: `${minYear - 1}0101`,
        end_de: "20261231",
        pblntf_ty: "A",
        page_count: "10",
      });
      const aRes = await fetch(`${DART_API_BASE}/list.json?${aParams}`);
      const aData = await aRes.json();
      for (const it of aData.list || []) {
        const nm: string = it.report_nm || "";
        if (nm.includes("사업보고서") && !nm.includes("기재정정")) {
          rceptNo = it.rcept_no;
          console.log(`[DART] 감사보고서(F) 없음 → 사업보고서(A)에서 주석 추출 시도: ${nm}`);
          break;
        }
      }
    }
    if (!rceptNo) return null;

    // ZIP 다운로드 + 주석 추출
    const docParams = new URLSearchParams({ crtfc_key: apiKey, rcept_no: rceptNo });
    const docRes = await fetch(`${DART_API_BASE}/document.xml?${docParams}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const rawBuf = Buffer.from(await docRes.arrayBuffer());
    if (rawBuf[0] !== 0x50 || rawBuf[1] !== 0x4B) return null;

    const zip = await JSZip.loadAsync(rawBuf);
    const fileNames = Object.keys(zip.files);

    // ZIP 내 모든 파일에서 주석 추출 시도 (사업보고서는 여러 XML 포함)
    let bestNotes: Record<string, string> = {};
    for (const fileName of fileNames) {
      const content = await zip.files[fileName].async("string");
      const notes = extractNoteSections(content);
      if (Object.keys(notes).length > Object.keys(bestNotes).length) {
        bestNotes = notes;
      }
    }

    if (Object.keys(bestNotes).length > 0) {
      console.log(`[DART] 감사보고서 주석 ${Object.keys(bestNotes).length}개 섹션 추출 완료`);
      return bestNotes;
    }
    return null;
  } catch (e) {
    console.warn("[DART] fetchAuditNotes 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ============================================================
// 주석 차입금/대출채권 내역 추출 (감사보고서 원문에서 파싱)
// ============================================================

export interface BorrowingDetail {
  category: string;       // 구분 (단기차입금, 신탁계정대 등)
  lender: string;         // 차입처 (금융기관명)
  interestRate: string;   // 이자율
  maturityDate: string;   // 만기일
  currentAmount: string;  // 당기말 잔액
  previousAmount: string; // 전기말 잔액
  currency: string;       // 통화
}

export interface BorrowingNotes {
  title: string;          // 주석 제목
  details: BorrowingDetail[];
  totalCurrent: string;   // 당기말 합계
  totalPrevious: string;  // 전기말 합계
  fiscalYear: string;     // 기준 사업연도
  rawTableData?: string[][];  // 원본 테이블
}

export async function fetchBorrowingNotes(
  corpCode: string,
  years: string[]
): Promise<BorrowingNotes | null> {
  const apiKey = getApiKey();

  try {
    const latestYear = Math.max(...years.map(Number));
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: `${latestYear - 1}0101`,
      end_de: `${latestYear + 1}1231`,
      pblntf_ty: "F",
      page_count: "50",
    });
    const res = await fetch(`${DART_API_BASE}/list.json?${params}`, { signal: AbortSignal.timeout(10000) });
    const d = await res.json();

    if (d.status !== "000" || !d.list) return null;

    let rceptNo: string | null = null;
    let fiscalYear = String(latestYear);

    for (const it of d.list) {
      const nm = it.report_nm || "";
      if (nm.includes("제출")) continue;
      if (nm.includes("감사보고서") && !nm.includes("연결")) {
        rceptNo = it.rcept_no;
        const m = nm.match(/\((\d{4})/);
        if (m) fiscalYear = m[1];
        break;
      }
    }
    if (!rceptNo) {
      for (const it of d.list) {
        const nm = it.report_nm || "";
        if (nm.includes("감사보고서")) {
          rceptNo = it.rcept_no;
          const m = nm.match(/\((\d{4})/);
          if (m) fiscalYear = m[1];
          break;
        }
      }
    }
    if (!rceptNo) return null;

    const docParams = new URLSearchParams({ crtfc_key: apiKey, rcept_no: rceptNo });
    const docRes = await fetch(`${DART_API_BASE}/document.xml?${docParams}`, { signal: AbortSignal.timeout(20000) });
    const rawBuf = Buffer.from(await docRes.arrayBuffer());

    if (rawBuf[0] !== 0x50 || rawBuf[1] !== 0x4B) return null;

    const zip = await JSZip.loadAsync(rawBuf);
    // ZIP 안 가장 큰 .xml 파일을 본문으로 선택 (parseOneAuditXml과 동일 로직).
    // 사업보고서는 보통 첨부(.xml 0.5MB) + 본문(.xml 1.5MB) 구조 — 본문이 정확.
    const xmlNames = Object.keys(zip.files).filter(n => n.toLowerCase().endsWith(".xml"));
    const sortedNames = xmlNames.sort((a, b) => {
      const sa = (zip.files[a] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
      const sb = (zip.files[b] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
      return sb - sa;
    });
    const mainFile = sortedNames[0] || Object.keys(zip.files)[0];
    const content = await zip.files[mainFile].async("string");

    // ── TR 기반 전체 행 파싱 (TD, TH, TE 모두 지원) ──
    const trMatches = content.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];
    const allRows: string[][] = [];
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<(?:TD|TH|TE)[^>]*>[\s\S]*?(?=<(?:TD|TH|TE)|<\/TR)/gi) || [];
      const rowCells: string[] = [];
      for (const cell of cellMatches) {
        const colspanMatch = cell.match(/colspan\s*=\s*["']?(\d+)/i);
        const colspan = colspanMatch ? parseInt(colspanMatch[1]) : 1;
        const clean = cell.replace(/<[^>]*>/g, "").trim().replace(/\s+/g, " ");
        rowCells.push(clean);
        for (let ci = 1; ci < colspan; ci++) rowCells.push("");
      }
      if (rowCells.length) allRows.push(rowCells);
    }

    // ── 전략 1: 텍스트 위치 기반 테이블 추출 (정확도 높음) ──
    // 감사보고서 본문에서 "의 내역"으로 끝나는 주석 테이블 직접 탐색
    const textSearchPatterns = [
      "차입금의 내역",
      "단기차입금의 내역",
      "장기차입금의 내역",
      "장단기차입금의 내역",
      "대출채권의 내역",
      "차입금 내역",
      "사채의 내역",
      "신탁계정대의 내역",
      "대여금의 내역",
      "예수부채의 내역",
      "차입부채의 내역",
      "증권차입의 내역",
    ];

    for (const pattern of textSearchPatterns) {
      const idx = content.indexOf(pattern);
      if (idx < 0) continue;

      console.log(`[DART] ${corpCode} "${pattern}" 발견 (pos ${idx})`);

      // 해당 위치 이후 3000자 범위에서 테이블 파싱
      const chunk = content.substring(idx, idx + 4000);
      const chunkTrs = chunk.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];
      const tableRows: string[][] = [];

      for (const tr of chunkTrs) {
        const cells: string[] = [];
        const cellMatches = tr.match(/<(?:TD|TH|TE)[^>]*>[\s\S]*?(?=<(?:TD|TH|TE)|<\/TR)/gi) || [];
        for (const cell of cellMatches) {
          cells.push(cell.replace(/<[^>]*>/g, "").trim().replace(/\s+/g, " "));
        }
        if (cells.length >= 2) tableRows.push(cells);
      }

      if (tableRows.length < 2) continue;

      // 헤더행 찾기 (구분/당기말/전기말 패턴)
      let headerIdx = -1;
      for (let r = 0; r < Math.min(tableRows.length, 3); r++) {
        const rowText = tableRows[r].join(" ");
        if (/구분|종류|내역|차입처/.test(rowText) && /당기|전기|기말|기초|금액/.test(rowText)) {
          headerIdx = r;
          break;
        }
      }
      // 단위행만 있는 경우 그 다음이 헤더
      if (headerIdx < 0) {
        for (let r = 0; r < Math.min(tableRows.length, 3); r++) {
          if (/단위/.test(tableRows[r].join(""))) {
            if (r + 1 < tableRows.length) { headerIdx = r + 1; break; }
          }
        }
      }

      if (headerIdx < 0) continue;

      const headerRow = tableRows[headerIdx].map((c) => c.trim());
      const dataRows: string[][] = [];

      for (let r = headerIdx + 1; r < tableRows.length; r++) {
        const row = tableRows[r];
        if (/단위/.test(row.join(""))) break; // 다음 테이블의 단위행이면 중단
        const hasNum = row.some((c) => /[\d,]{3,}/.test(c) || /^\([\d,]+\)$/.test(c.trim()));
        const hasText = row.some((c) => /[가-힣a-zA-Z]/.test(c));
        if (hasNum || /합계|소계/.test(row.join(""))) {
          dataRows.push(row.map((c) => c.trim()));
        }
      }

      if (!dataRows.length) continue;

      // 컬럼 매핑
      const result = buildBorrowingResult(pattern, headerRow, dataRows, fiscalYear);
      if (result) return result;
    }

    // ── 전략 2: TR 기반 순차 탐색 (차입금 제목 → 테이블) ──
    const titlePatterns = [
      /^차입금$/, /^단기차입금$/, /^장기차입금$/, /^장단기차입금$/,
      /^사채$/, /^대출채권$/, /^대여금$/, /^신탁계정대$/,
      /^예수부채$/, /^차입부채$/, /^증권차입$/,
      /차입금의\s*내역/, /대출채권의\s*내역/, /사채의\s*내역/,
      /신탁계정대의\s*내역/, /예수부채의\s*내역/, /차입부채의\s*내역/,
    ];

    let noteSection = false;
    let noteTitle = "";
    let borrowingRows: string[][] = [];
    let headerRow: string[] = [];
    let foundTable = false;

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const text = row.join("").replace(/\s/g, "");
      const firstCell = (row[0] || "").replace(/\s/g, "");

      if (!noteSection && titlePatterns.some((p) => p.test(text) || p.test(firstCell))) {
        const hasNumbers = row.some((c) => /[\d,]{4,}/.test(c));
        if (!hasNumbers && text.length < 60) {
          noteSection = true;
          noteTitle = row[0]?.trim() || text;
          borrowingRows = [];
          headerRow = [];
          foundTable = false;
          continue;
        }
      }

      if (noteSection) {
        // 다른 섹션 시작 시 종료 (헤더 감지보다 먼저 검사)
        if (foundTable && borrowingRows.length > 0 && firstCell.length > 0) {
          const rowText = row.join("");
          const noNumbers = !/[\d,]{3,}/.test(rowText);
          const notRelevant = !/합계|소계|차감|계$|차입|대출|사채|리스|이자|금리|만기|잔액|금액|신탁|대여|충당|예수부채|차입부채|증권차입/.test(firstCell);
          if (noNumbers && notRelevant) break;
        }

        const headerKw = ["차입처", "금융기관", "이자율", "금리", "만기", "당기말", "전기말", "금액", "잔액", "구분", "종류", "기말", "기초"];
        const isHeader = headerKw.some((kw) => row.some((c) => c.includes(kw)));
        if (isHeader) {
          // 이미 테이블을 찾은 상태에서 새 헤더가 나오면 → 다른 테이블이므로 종료 (재진입 방지)
          if (headerRow.length > 0 && borrowingRows.length > 0) break;
          if (!headerRow.length) {
            headerRow = row.map((c) => c.trim());
            foundTable = true;
            continue;
          }
        }

        if (foundTable && row.length >= 2) {
          const hasNum = row.some((c) => /[\d,]{3,}/.test(c) || c.trim() === "-" || /^\([\d,]+\)$/.test(c.trim()));
          if (hasNum) borrowingRows.push(row.map((c) => c.trim()));
        }
      }
    }

    if (borrowingRows.length > 0) {
      const result = buildBorrowingResult(noteTitle, headerRow, borrowingRows, fiscalYear);
      if (result) return result;
    }

    console.log(`[DART] ${corpCode} 차입금/대출채권 주석 테이블을 찾지 못함`);
    return null;
  } catch (e) {
    console.error("[DART] 차입금 주석 파싱 오류:", e);
    return null;
  }
}

function buildBorrowingResult(
  title: string,
  headerRow: string[],
  dataRows: string[][],
  fiscalYear: string
): BorrowingNotes | null {
  if (!dataRows.length) return null;

  // 컬럼 매핑
  const colMap = { category: -1, lender: -1, interestRate: -1, maturityDate: -1, currentAmount: -1, previousAmount: -1 };

  for (let c = 0; c < headerRow.length; c++) {
    const h = headerRow[c].replace(/\s/g, "");
    if (/구분|종류|내역/.test(h) && colMap.category < 0) colMap.category = c;
    if (/차입처|금융기관|대출처/.test(h) && colMap.lender < 0) colMap.lender = c;
    if (/이자율|금리|연이율/.test(h) && colMap.interestRate < 0) colMap.interestRate = c;
    if (/만기|상환/.test(h) && colMap.maturityDate < 0) colMap.maturityDate = c;
    if (/당기말|당기$|기말$/.test(h) && colMap.currentAmount < 0) colMap.currentAmount = c;
    if (/전기말|전기$|기초$/.test(h) && colMap.previousAmount < 0) colMap.previousAmount = c;
  }

  // 당기/전기 컬럼 순서 감지 (전기가 먼저 나오는 경우 대응)
  let borrowingColumnReversed = false;
  if (colMap.currentAmount >= 0 && colMap.previousAmount >= 0) {
    if (colMap.previousAmount < colMap.currentAmount) {
      borrowingColumnReversed = true;
    }
  } else {
    // 헤더 텍스트에서 당기/전기 순서 감지
    const joined = headerRow.join(" ");
    const curIdx = joined.search(/당기|기말/);
    const prevIdx = joined.search(/전기|기초/);
    if (curIdx >= 0 && prevIdx >= 0 && prevIdx < curIdx) {
      borrowingColumnReversed = true;
    }
  }

  // 금액 컬럼 미탐지 시 fallback: 헤더에서 숫자/금액 패턴 또는 마지막 컬럼 추정
  if (colMap.currentAmount < 0 && colMap.previousAmount < 0) {
    const numCols: number[] = [];
    for (let c = 0; c < headerRow.length; c++) {
      if (/금액|잔액|\d{4}|당기|전기|기말|기초/.test(headerRow[c])) numCols.push(c);
    }
    if (numCols.length >= 2) {
      // 순서 감지 결과 반영
      if (borrowingColumnReversed) {
        colMap.previousAmount = numCols[numCols.length - 2];
        colMap.currentAmount = numCols[numCols.length - 1];
      } else {
        colMap.currentAmount = numCols[numCols.length - 2];
        colMap.previousAmount = numCols[numCols.length - 1];
      }
    } else if (headerRow.length >= 3) {
      if (borrowingColumnReversed) {
        colMap.previousAmount = headerRow.length - 2;
        colMap.currentAmount = headerRow.length - 1;
      } else {
        colMap.currentAmount = headerRow.length - 2;
        colMap.previousAmount = headerRow.length - 1;
      }
    }
  }

  const details: BorrowingDetail[] = [];
  let totalCurrent = "";
  let totalPrevious = "";

  for (const row of dataRows) {
    const cat = colMap.category >= 0 ? (row[colMap.category] || "-") : (row[0] || "-");
    const isTotal = /합계|소계|계$/.test(cat.replace(/\s/g, ""));

    const detail: BorrowingDetail = {
      category: cat,
      lender: colMap.lender >= 0 ? (row[colMap.lender] || "-") : "-",
      interestRate: colMap.interestRate >= 0 ? (row[colMap.interestRate] || "-") : "-",
      maturityDate: colMap.maturityDate >= 0 ? (row[colMap.maturityDate] || "-") : "-",
      currentAmount: colMap.currentAmount >= 0 ? (row[colMap.currentAmount] || "-") : "-",
      previousAmount: colMap.previousAmount >= 0 ? (row[colMap.previousAmount] || "-") : "-",
      currency: "KRW",
    };

    if (isTotal) {
      totalCurrent = detail.currentAmount;
      totalPrevious = detail.previousAmount;
    }
    details.push(detail);
  }

  if (!details.length) return null;

  console.log(`[DART] 차입금/대출채권 주석 파싱 성공: ${title}, ${details.length}행`);

  return {
    title: title || "차입금/대출채권 내역",
    details,
    totalCurrent,
    totalPrevious,
    fiscalYear,
    rawTableData: [headerRow, ...dataRows],
  };
}

// ============================================================
// 감사의견 조회
// ============================================================

export interface AuditOpinionInfo {
  auditorName: string;    // 감사인명 (e.g., "삼일회계법인")
  opinionType: string;    // 감사의견 (e.g., "적정")
  reportDate: string;     // 감사보고서일 (e.g., "2025.03.11")
  fiscalYear: string;     // 사업연도
}

export async function fetchAuditOpinion(corpCode: string, years: string[]): Promise<AuditOpinionInfo | null> {
  const apiKey = getApiKey();
  try {
    // Search for audit reports (감사보고서) in recent filings
    const latestYear = Math.max(...years.map(Number));
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: `${latestYear}0101`,
      end_de: `${latestYear + 1}1231`,
      pblntf_ty: 'A',  // 정기공시
      page_count: '100',
    });
    const res = await fetch(`${DART_API_BASE}/list.json?${params}`);
    const d = await res.json();

    if (d.status !== '000' || !d.list) return null;

    // Find 감사보고서 or 사업보고서 filing
    const filings = d.list as Array<{
      rcept_no: string;
      report_nm: string;
      rcept_dt: string;
      flr_nm: string;
    }>;

    // 감사보고서를 우선 찾고, 없으면 사업보고서에서 감사인 추출
    let auditFiling = filings.find(f => f.report_nm.includes('감사보고서') && !f.report_nm.includes('['));
    if (!auditFiling) {
      auditFiling = filings.find(f => f.report_nm.includes('사업보고서') && !f.report_nm.includes('['));
    }

    if (!auditFiling) return null;

    const dt = auditFiling.rcept_dt;
    const reportDate = dt.length === 8
      ? `${dt.slice(0,4)}.${dt.slice(4,6)}.${dt.slice(6,8)}`
      : dt;

    // flr_nm contains the auditor name for 감사보고서
    const isAuditReport = auditFiling.report_nm.includes('감사보고서');
    const auditorName = isAuditReport ? auditFiling.flr_nm : '';

    return {
      auditorName: auditorName || '-',
      opinionType: '적정',  // Default - DART 정기공시된 보고서는 대부분 적정
      reportDate,
      fiscalYear: String(latestYear),
    };
  } catch (e) {
    console.error('[DART] 감사의견 조회 오류:', e);
    return null;
  }
}

// ============================================================
// 주주현황 조회
// ============================================================

export interface ShareholderInfo {
  name: string;           // 주주명
  stockType: string;      // 주식종류 (보통주/우선주)
  shareCount: string;     // 소유주식수
  shareRatio: string;     // 지분율(%)
  relation: string;       // 회사와의 관계
  remark: string;         // 비고
}

// ─── Related Companies (계열회사/타법인출자 현황) ──────────────

export interface RelatedCompanyEntry {
  corpName: string;
  relationship: string;
  ownershipPct?: number;
  corpCode?: string;
  industry?: string;
}

/**
 * 사업보고서에서 관계회사/타법인출자 현황을 추출.
 * DART list.json (정기공시, pblntf_ty=A) → document.xml → HTML 테이블 파싱
 */
export async function fetchRelatedCompanies(
  corpCode: string,
  year: string,
): Promise<RelatedCompanyEntry[]> {
  const apiKey = getApiKey();

  try {
    // 1) 사업보고서 접수번호 조회
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: `${year}0101`,
      end_de: `${year}1231`,
      pblntf_ty: 'A',
      page_count: '20',
    });
    const res = await fetch(`${DART_API_BASE}/list.json?${params}`);
    const d = await res.json();

    if (d.status !== '000' || !d.list) return [];

    let rceptNo: string | null = null;
    for (const it of d.list) {
      const nm = it.report_nm || '';
      if (nm.includes('사업보고서') && !nm.includes('제출')) {
        rceptNo = it.rcept_no;
        break;
      }
    }
    if (!rceptNo) return [];

    // 2) document.xml (ZIP) 다운로드 및 파싱
    const docParams = new URLSearchParams({ crtfc_key: apiKey, rcept_no: rceptNo });
    const docRes = await fetch(`${DART_API_BASE}/document.xml?${docParams}`);
    const rawBuf = Buffer.from(await docRes.arrayBuffer());

    if (rawBuf[0] !== 0x50 || rawBuf[1] !== 0x4B) return []; // not ZIP

    const zip = await JSZip.loadAsync(rawBuf);

    // 모든 파일에서 관련 섹션 탐색
    const entries: RelatedCompanyEntry[] = [];
    const fileKeys = Object.keys(zip.files);

    for (const fk of fileKeys) {
      const content = await zip.files[fk].async('string');

      // "타법인출자 현황" 또는 "계열회사" 섹션 탐색
      const sectionPatterns = [
        '타법인출자 현황',
        '타법인 출자 현황',
        '계열회사 현황',
        '관계기업 현황',
        '종속기업 현황',
        '관계회사 현황',
      ];

      let sectionIdx = -1;
      for (const pat of sectionPatterns) {
        const idx = content.indexOf(pat);
        if (idx >= 0) {
          sectionIdx = idx;
          break;
        }
      }
      if (sectionIdx < 0) continue;

      // 해당 위치 이후 범위에서 TR 파싱 (대기업 계열사 테이블이 길 수 있으므로 50KB)
      const chunk = content.substring(sectionIdx, sectionIdx + 50000);
      const trMatches = chunk.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];
      const tableRows: string[][] = [];

      for (const tr of trMatches) {
        const cells: string[] = [];
        const cellMatches = tr.match(/<(?:TD|TH|TE)[^>]*>[\s\S]*?(?=<(?:TD|TH|TE)|<\/TR)/gi) || [];
        for (const cell of cellMatches) {
          cells.push(cell.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' '));
        }
        if (cells.length >= 2) tableRows.push(cells);
      }

      if (tableRows.length < 2) continue;

      // 헤더행 찾기 (법인명/회사명 + 지분율/출자비율 패턴)
      let headerIdx = -1;
      let nameCol = -1;
      let pctCol = -1;
      let relCol = -1;

      for (let r = 0; r < Math.min(tableRows.length, 5); r++) {
        const rowCells = tableRows[r];
        for (let c = 0; c < rowCells.length; c++) {
          const txt = rowCells[c];
          if (/법인명|회사명|기업명|출자법인/.test(txt) && nameCol < 0) { nameCol = c; headerIdx = r; }
          if (/지분율|출자비율|보유비율|지분/.test(txt) && pctCol < 0) pctCol = c;
          if (/관계|비고|목적/.test(txt) && relCol < 0) relCol = c;
        }
        if (headerIdx >= 0) break;
      }

      if (headerIdx < 0 || nameCol < 0) continue;

      // 데이터행 파싱
      for (let r = headerIdx + 1; r < tableRows.length && entries.length < 20; r++) {
        const rowCells = tableRows[r];
        const name = (rowCells[nameCol] || '').trim();

        // 빈 행, 합계행, 단위행 스킵
        if (!name || /합계|소계|단위|^-$/.test(name)) continue;
        // 숫자만 있는 행 스킵
        if (/^\d+$/.test(name)) continue;

        let pct: number | undefined;
        if (pctCol >= 0 && rowCells[pctCol]) {
          const m = rowCells[pctCol].replace(/,/g, '').match(/([\d.]+)/);
          if (m) pct = parseFloat(m[1]);
        }

        const rel = relCol >= 0 ? (rowCells[relCol] || '').trim() : '';
        const relationship = rel || (pct && pct >= 50 ? '종속회사' : pct && pct >= 20 ? '관계회사' : '출자회사');

        // 이미 추가된 회사 중복 방지
        if (entries.some(e => e.corpName === name)) continue;

        entries.push({
          corpName: name,
          relationship,
          ownershipPct: pct,
        });
      }

      if (entries.length > 0) break; // 첫 번째 매칭 섹션만 사용
    }

    // 3) corpCode 매핑
    const { findCorpCode } = await import('@/lib/dart-corp-codes');
    for (const entry of entries) {
      const corp = findCorpCode(entry.corpName);
      if (corp) {
        entry.corpCode = corp.corpCode;
      }
    }

    console.log(`[DART] 관련회사 ${entries.length}건 발견 (${corpCode})`);
    return entries;
  } catch (e) {
    console.error('[DART] 관련회사 조회 오류:', e);
    return [];
  }
}

export async function fetchShareholders(corpCode: string, year: string): Promise<ShareholderInfo[]> {
  const apiKey = getApiKey();
  try {
    for (const reprt of ['11011', '11014', '11012']) {
      const params = new URLSearchParams({
        crtfc_key: apiKey,
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reprt,
      });
      const res = await fetch(`${DART_API_BASE}/hyslrSttus.json?${params}`);
      const d = await res.json();

      if (d.status === '000' && d.list?.length) {
        return d.list.map((item: any) => ({
          name: item.nm || '-',
          stockType: item.stock_knd || '-',
          shareCount: item.trmend_posesn_stock_co || item.bsis_posesn_stock_co || '-',
          shareRatio: item.trmend_posesn_stock_qota_rt || item.bsis_posesn_stock_qota_rt || '-',
          relation: item.relate || '-',
          remark: item.rm || '-',
        }));
      }
    }
    return [];
  } catch (e) {
    console.error('[DART] 주주현황 조회 오류:', e);
    return [];
  }
}
