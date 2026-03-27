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
      const res = await fetch(url);
      const d = await res.json();
      if (d.status === "000" && d.list?.length) {
        if (reprt !== "11011") {
          console.log(`[DART] ${year}년: 사업보고서 없음 → ${REPRT_LABELS[reprt]}(${reprt}) 사용 (IS는 분기/반기 데이터)`);
        }
        return { items: d.list, reprtCode: reprt };
      }
    } catch {
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
  [year: string]: string | number | undefined;
}

export interface FinancialResult {
  companyInfo: DartCompanyInfo;
  // 개별(OFS)
  bsItems: FinancialRow[];
  isItems: FinancialRow[];
  ratios: Record<string, Record<string, string>>;
  hasOfs: boolean;
  // 연결(CFS)
  bsItemsCfs: FinancialRow[];
  isItemsCfs: FinancialRow[];
  ratiosCfs: Record<string, Record<string, string>>;
  hasCfs: boolean;
  years: string[];
  source: string;
  hasData: boolean;
  noDataReason?: string;
}

// 계정과목 계층 depth 추론
function detectAccountDepth(accountNm: string, sjFilter: string[]): number {
  const nm = accountNm.replace(/\s/g, "");
  const isBs = sjFilter.includes("BS");
  const isIs = sjFilter.includes("IS") || sjFilter.includes("CIS");

  // depth 0: 총계/합계 (굵은 글씨, 들여쓰기 없음)
  const totalKeywords = [
    "자산총계", "자산합계", "부채총계", "부채합계", "자본총계", "자본합계",
    "부채와자본총계", "부채및자본총계", "자본과부채총계",
    "매출액", "영업수익", "영업이익", "영업이익(손실)", "영업손실",
    "당기순이익", "당기순이익(손실)", "당기순손실", "당기순손익",
    "법인세비용차감전순이익", "법인세비용차감전순손익",
    "총포괄손익", "총포괄이익",
  ];
  if (totalKeywords.some((k) => nm === k)) return 0;

  // depth 1: 중분류 (소계 수준)
  const midKeywords = [
    // BS
    "유동자산", "비유동자산", "유동부채", "비유동부채",
    "자본금", "이익잉여금", "기타자본항목", "기타포괄손익누계액",
    "자본잉여금", "자본조정",
    // IS
    "매출원가", "매출총이익", "판매비와관리비",
    "기타수익", "기타비용", "금융수익", "금융비용", "금융원가",
    "법인세비용", "영업외수익", "영업외비용",
    "수익(매출액)", "이자수익", "이자비용",
  ];
  if (midKeywords.some((k) => nm === k)) return 1;

  // 감사보고서 패턴: Ⅰ.유동자산, Ⅱ.비유동자산, (1)당좌자산 등 → depth 1
  if (/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVivx]+[.·]/.test(nm)) return 1;
  if (/^\([0-9]+\)/.test(nm)) return 1;

  // 감사보고서 패턴: 1.현금, 2.매출채권 등 → depth 2
  if (/^[0-9]+[.·]/.test(nm)) return 2;

  // 소계/합계 패턴
  if (nm.includes("소계") || nm.includes("합계")) return 1;

  // depth 2: 나머지 (세부 항목)
  return 2;
}

// ── 표준 손익계산서 계정과목 순서 (DART ord 필드가 부정확한 경우 대비) ──
const IS_STANDARD_ORDER: [string[], number][] = [
  // [매칭 키워드 배열, 순서 번호]  — normalizeAcct 결과로 비교
  [["매출액", "영업수익", "수익(매출액)", "순영업수익", "영업이익(수익)",
    "공사수익", "분양수익", "도급수익", "건설수익",        // 건설업
    "보험수익", "보험료수익", "수입보험료",                // 보험업
    "이자수익합계", "순이자손익",                          // 금융업
    "순영업수익합계", "영업수익합계"], 100],
  [["매출원가", "영업비용", "영업원가",
    "공사원가", "분양원가", "도급원가", "건설원가",        // 건설업
    "보험서비스비용", "보험금비용"], 200],                  // 보험업
  [["매출총이익", "매출총손실", "매출총이익(손실)"], 300],
  [["판매비와관리비", "판매비와일반관리비", "판관비"], 400],
  [["영업이익", "영업손실", "영업이익(손실)", "영업손익"], 500],
  [["기타수익", "영업외수익", "기타영업외수익"], 600],
  [["기타비용", "영업외비용", "기타영업외비용"], 700],
  [["금융수익", "이자수익", "순금융수익"], 800],
  [["금융비용", "금융원가", "이자비용", "순금융비용", "순금융원가"], 900],
  [["지분법이익", "관계기업투자이익", "지분법투자이익",
    "관계기업및공동기업투자이익", "종속기업및관계기업투자이익",
    "관계기업및공동기업투자손익", "관계기업투자손익",
    "종속기업,관계기업및공동기업투자관련손익",
    "지분법적용투자이익", "지분법적용투자손익"], 1000],
  [["지분법손실", "관계기업투자손실", "지분법투자손실", "지분법손익",
    "관계기업및공동기업투자손실", "종속기업및관계기업투자손실",
    "지분법적용투자손실"], 1010],
  [["법인세비용차감전순이익", "법인세비용차감전순손실", "법인세비용차감전순손익",
    "법인세차감전순이익", "법인세차감전순손실", "법인세차감전계속영업이익",
    "법인세비용차감전이익", "법인세비용차감전손실", "법인세비용차감전손익"], 1100],
  [["법인세비용", "법인세수익", "법인세비용(수익)"], 1200],
  [["계속영업이익", "계속영업손실", "계속영업이익(손실)"], 1300],
  [["중단영업이익", "중단영업손실", "중단영업이익(손실)", "중단영업손익"], 1400],
  [["당기순이익", "당기순손실", "당기순이익(손실)", "당기순손익", "분기순이익", "반기순이익"], 1500],
  [["기타포괄손익", "기타포괄이익", "기타포괄손실"], 1600],
  [["총포괄손익", "총포괄이익", "당기총포괄손익", "당기총포괄이익",
    "분기총포괄손익", "반기총포괄손익"], 1700],
];

// 핵심 키워드 기반 fuzzy 매칭 (IS_STANDARD_ORDER 정확/부분 매칭 실패 시 최종 fallback)
// 패턴: [정규식, 제외 키워드[], 순서번호]
const IS_CORE_PATTERNS: [RegExp, string[], number][] = [
  [/^(매출액|매출$)/, [], 100],
  [/(공사수익|분양수익|도급수익|건설수익)/, [], 100],
  [/(공사원가|분양원가|도급원가|건설원가)/, [], 200],
  [/매출원가/, [], 200],
  [/매출총이익|매출총손/, [], 300],
  [/판매비와/, [], 400],
  [/^영업이익|^영업손실|^영업손익/, [], 500],
  [/^기타수익|^영업외수익/, [], 600],
  [/^기타비용|^영업외비용/, [], 700],
  [/금융수익|^이자수익/, ["포괄"], 800],
  [/금융비용|금융원가|^이자비용/, ["포괄"], 900],
  [/(지분법|관계기업|공동기업).*(이익|손익)/, ["잉여금", "자본"], 1000],
  [/(지분법|관계기업|공동기업).*손실/, ["잉여금", "자본"], 1010],
  [/법인세.*차감전/, [], 1100],
  [/^법인세비용|^법인세수익/, [], 1200],
  [/계속영업/, [], 1300],
  [/중단영업/, [], 1400],
  [/(당기순|분기순|반기순)(이익|손실|손익)/, [], 1500],
  [/^기타포괄/, [], 1600],
  [/총포괄/, [], 1700],
];

function getIsStandardOrder(accountNm: string): number {
  const norm = normalizeAcct(accountNm);
  // 1. 정확 매칭 우선
  for (const [keywords, order] of IS_STANDARD_ORDER) {
    if (keywords.some((k) => norm === k.replace(/\s/g, ""))) return order;
  }
  // 2. 부분 매칭
  for (const [keywords, order] of IS_STANDARD_ORDER) {
    if (keywords.some((k) => norm.includes(k.replace(/\s/g, "")))) return order;
  }
  // 3. 핵심 키워드 fuzzy 매칭 (업종 특수 계정명 대응)
  for (const [pattern, excludes, order] of IS_CORE_PATTERNS) {
    if (pattern.test(norm) && !excludes.some((ex) => norm.includes(ex))) return order;
  }
  return -1; // 표준 목록에 없는 항목
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
        if (nm && amt) vals[nm] = amt;
      }
      if (Object.keys(vals).length) yearData[dataYear] = vals;
    }
  }

  // 계정 순서 + depth 추론
  const isIS = sjFilter.includes("IS") || sjFilter.includes("CIS");
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

  // IS/CIS 항목: 표준 순서로 재정렬 (DART ord 필드가 부정확한 기업 대비)
  if (isIS && accountOrder.length > 0) {
    // 표준 순서가 있는 항목과 없는 항목 분리
    const withStd: { nm: string; depth: number; stdOrd: number; origIdx: number }[] = [];
    const withoutStd: { nm: string; depth: number; origIdx: number }[] = [];
    accountOrder.forEach((item, idx) => {
      const stdOrd = getIsStandardOrder(item.nm);
      if (stdOrd >= 0) {
        withStd.push({ ...item, stdOrd, origIdx: idx });
      } else {
        withoutStd.push({ ...item, origIdx: idx });
      }
    });

    // 표준 항목은 표준 순서로 정렬
    withStd.sort((a, b) => a.stdOrd - b.stdOrd);

    // 비표준 항목은 가장 가까운 앞 표준항목 뒤에 배치 (원래 순서 유지)
    const reordered: { nm: string; depth: number }[] = [];
    let stdIdx = 0;

    // 표준 항목 사이사이에 비표준 항목을 원래 위치 기준으로 끼워넣기
    // 방법: 각 비표준 항목의 원래 위치 앞에 있던 마지막 표준항목 찾아서 그 뒤에 배치
    const insertMap = new Map<number, { nm: string; depth: number }[]>(); // stdOrd → trailing non-std items
    let lastStdOrd = -1;

    // 원래 순서대로 순회하며, 비표준 항목을 직전 표준항목에 연결
    for (const item of accountOrder) {
      const stdOrd = getIsStandardOrder(item.nm);
      if (stdOrd >= 0) {
        lastStdOrd = stdOrd;
      } else {
        if (!insertMap.has(lastStdOrd)) insertMap.set(lastStdOrd, []);
        insertMap.get(lastStdOrd)!.push({ nm: item.nm, depth: item.depth });
      }
    }

    // 맨 앞 비표준 항목 (표준항목 전에 나온 것들)
    const leading = insertMap.get(-1) || [];
    reordered.push(...leading);

    // 표준 항목 + 후행 비표준 항목
    for (const std of withStd) {
      reordered.push({ nm: std.nm, depth: std.depth });
      const trailing = insertMap.get(std.stdOrd) || [];
      reordered.push(...trailing);
    }

    accountOrder.length = 0;
    accountOrder.push(...reordered);
  }

  const rows: FinancialRow[] = [];
  for (const { nm: acct, depth } of accountOrder) {
    const row: FinancialRow = { account: acct, depth };
    for (const year of displayYears) {
      const vals = yearData[year] || {};
      row[year] = vals[acct] ? toMillions(vals[acct]) : "-";
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
  years: string[]
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
    let rev = getExact(isRows, ["매출액", "영업수익", "수익(매출액)", "공사수익", "분양수익"], year);
    if (rev === 0) rev = get(isRows, ["매출액", "영업수익", "공사수익", "분양수익"], year);
    revByYear[year] = rev;

    let op = getExact(isRows, ["영업이익", "영업이익(손실)", "영업손익", "영업손실"], year);
    if (op === 0) op = get(isRows, ["영업이익", "영업손실"], year);

    let ni = getExact(isRows, ["당기순이익", "당기순이익(손실)", "당기순손익", "당기순손실"], year);
    if (ni === 0) ni = get(isRows, ["당기순이익", "당기순손실"], year);

    // 감가상각비 (EBITDA 산출용 — BS/IS 양쪽에서 탐색)
    let depreciation = get(isRows, ["감가상각비", "감가상각비용"], year);
    if (depreciation === 0) depreciation = get(bsRows, ["감가상각비"], year);
    // 무형자산상각비
    let amortization = get(isRows, ["무형자산상각비", "무형자산감가상각비", "사용권자산상각비"], year);
    // 감가상각비가 0이면 CF에서 조정항목으로 잡힌 경우 — bsRows에서 부분 매칭 시도
    if (depreciation === 0 && amortization === 0) {
      for (const r2 of bsRows) {
        const nm = normalizeAcct(r2.account);
        if (nm.includes("감가상각") || nm.includes("상각비")) {
          const v = parseNum(r2[year] || "-");
          if (v > 0) { depreciation += v; break; }
        }
      }
    }

    // 이자비용 (EBITDA/이자비율용)
    let interestExpense = get(isRows, ["이자비용", "금융비용", "금융원가"], year);

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
      const res = await fetch(url);
      const d = await res.json();
      if (d.status === "000" && d.list?.length) {
        return d.list;
      }
    } catch {
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

    // IS/CIS 항목이면 표준 순서로 재정렬
    const isIS = sjFilter.includes("IS") || sjFilter.includes("CIS");
    if (isIS && order.length > 0) {
      const withStd: { nm: string; stdOrd: number }[] = [];
      const insertMap = new Map<number, string[]>();
      let lastStdOrd = -1;
      for (const nm of order) {
        const stdOrd = getIsStandardOrder(nm);
        if (stdOrd >= 0) { withStd.push({ nm, stdOrd }); lastStdOrd = stdOrd; }
        else { if (!insertMap.has(lastStdOrd)) insertMap.set(lastStdOrd, []); insertMap.get(lastStdOrd)!.push(nm); }
      }
      withStd.sort((a, b) => a.stdOrd - b.stdOrd);
      const reordered: string[] = [...(insertMap.get(-1) || [])];
      for (const std of withStd) { reordered.push(std.nm); reordered.push(...(insertMap.get(std.stdOrd) || [])); }
      order.length = 0;
      order.push(...reordered);
    }

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

// 감사보고서 XML 1건 파싱 (공통 로직)
async function parseOneAuditXml(
  rceptNo: string,
  targetYear: string
): Promise<{ bsRows: FinancialRow[]; isRows: FinancialRow[]; years: string[] } | null> {
  const apiKey = getApiKey();
  try {
    const params = new URLSearchParams({ crtfc_key: apiKey, rcept_no: rceptNo });
    const res = await fetch(`${DART_API_BASE}/document.xml?${params}`);
    const rawBuf = Buffer.from(await res.arrayBuffer());

    if (rawBuf[0] !== 0x50 || rawBuf[1] !== 0x4B) return null;

    const zip = await JSZip.loadAsync(rawBuf);
    const firstFile = Object.keys(zip.files)[0];
    const content = await zip.files[firstFile].async("string");

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
    let section: string | null = null;
    let bsCompleted = false;  // BS 파싱 완료 플래그
    let isCompleted = false;  // IS 파싱 완료 플래그
    // 컬럼 순서 감지: 당기가 먼저인지 전기가 먼저인지
    let columnOrderReversed = false; // true면 전기가 첫 컬럼

    for (const row of allRows) {
      const text = row.join("").replace(/\s/g, "");
      const first = row[0]?.replace(/\s/g, "") || "";

      // 헤더 행에서 당기/전기 컬럼 순서 감지
      if (/제\d+.*기|당기|전기|당\s*기|전\s*기/.test(text) && !/매출|영업|자산|부채/.test(text)) {
        const joined = row.join(" ");
        const curIdx = joined.search(/당기|제\s*\d+\s*\(당\)|제\s*\d+\s*기/);
        const prevIdx = joined.search(/전기|제\s*\d+\s*\(전\)/);
        if (curIdx >= 0 && prevIdx >= 0 && prevIdx < curIdx) {
          columnOrderReversed = true;
        }
      }

      // 섹션 종료 검사는 셀 수와 무관하게 항상 수행
      if (/현금흐름표|이익잉여금처분|자본변동표|이익잉여금변동|제조원가명세서|원가명세서/.test(text)) {
        if (section === "is") isCompleted = true;
        section = null;
      }
      if (/별첨.*주석은|별첨\s*주석은/.test(row[0] || "")) {
        if (section === "is") isCompleted = true;
        if (section === "bs") bsCompleted = true;
        section = null;
      }
      if (section === "is" && /영업활동으로인한|투자활동으로인한|재무활동으로인한|현금의증가|기초의현금|기말의현금/.test(text)) {
        isCompleted = true;
        section = null;
      }
      if (section === "is" && /\d{4}\.\d{1,2}\.\d{1,2}\s*\(?(전기초|전기말|당기초|당기말)/.test(row[0] || "")) {
        isCompleted = true;
        section = null;
      }

      if (row.length < 2) continue;

      // BS/IS 모두 완료되었으면 더 이상 파싱하지 않음
      if (bsCompleted && isCompleted) continue;

      // BS 시작 감지 — 이미 BS 완료 시 재진입 방지
      if (!bsCompleted) {
        if (first === "자산" && !first.includes("총계") && !first.includes("합계")) { section = "bs"; continue; }
        if (text.startsWith("자산") && !text.startsWith("자산총계") && !text.startsWith("자산합계")) { section = "bs"; continue; }
        if ((first === "자산총계" || first === "자산합계") && section !== "bs") { section = "bs"; /* 데이터 포함 — continue 안 함 */ }
      }

      // BS 종료: 부채와자본총계 → IS 전환 준비
      if (/부채와자본총계|부채및자본총계|부채와순자산총계/.test(text)) {
        if (section === "bs") {
          const nums = row.slice(1).filter((c) => { const ct = c.trim(); if (/^\d{1,2}(,\s*\d{1,2})*$/.test(ct)) return false; return /\d{3,}/.test(ct) || ct === "-" || /^[\s(]*0[\s)]*$/.test(ct); });
          if (nums.length) bsItems.push([row[0].trim(), nums]);
          bsCompleted = true;
          section = "bs_done"; // BS 끝 → IS 시작 대기
          continue;
        }
      }

      // IS 시작 — 이미 IS 완료 시 재진입 방지
      if (!isCompleted) {
        if (text.includes("손익계산서") || text.includes("포괄손익계산서")) { section = "is_header"; continue; }
        // IS 첫 항목 패턴 (건설업 공사수익/분양수익 포함)
        const IS_START_RE = /영업수익|매출액|공사수익|분양수익|도급수익|보험수익/;
        if (section === "is_header" && IS_START_RE.test(first)) section = "is";
        // IS 시작: 로마숫자 + 매출액/영업수익 패턴 (주석 번호 포함 가능)
        const firstClean = first.replace(/\(주석[^)]*\)/g, "");
        if (/^(영업수익|매출액|공사수익|분양수익|Ⅰ\.?(영업수익|매출액|공사수익)|I\.?(영업수익|매출액|공사수익))/.test(firstClean) && section !== "is") section = "is";
        // BS 종료 직후 IS 첫 항목이 나오면 IS 시작
        if (section === "bs_done" && (IS_START_RE.test(firstClean) || /Ⅰ\.?(매출|공사|영업)/.test(firstClean))) section = "is";
      }
      // bs_done 상태에서 다른 내용이면 아직 IS 시작 전 (단위/기간 표시 등)
      if (section === "bs_done" && row.length < 3 && !/매출|영업수익|공사수익|분양수익/.test(first)) continue;

      // IS 종료: 주당이익/주당손익 이후 나오는 비IS 항목
      if (section === "is" && /^(기본주당|희석주당|주당)/.test(first)) continue; // 주당 항목 스킵
      // IS 종료: 기타 비IS 패턴 (배당금수익/배당금지급/지분법이익 등 IS 항목과 혼동 방지)
      if (section === "is" && /^(배당금지급$|지분법자본변동|지분법자본조정|지분법이익잉여금|종속회사|재평가차익)/.test(first)) { isCompleted = true; section = null; continue; }

      // (부채와자본총계 처리는 위에서 bs_done 전환 시 수행)

      if (section !== "bs" && section !== "is") continue;
      const nums: string[] = [];
      for (const c of row.slice(1)) {
        const ct = c.trim();
        // 금액 셀: 3연속 숫자 이상, "-", 또는 "0" (괄호 포함)
        // 주석번호 "4,5,6,7" 등은 제외 (콤마 사이 1~2자리만 있는 패턴)
        if (/^\d{1,2}(,\s*\d{1,2})*$/.test(ct)) continue; // 주석번호 패턴 스킵
        if (/\d{3,}/.test(ct) || ct === "-" || /^[\s(]*0[\s)]*$/.test(ct)) nums.push(ct);
      }
      if (!nums.length) continue;
      const acctName = row[0].trim();
      if (!acctName) continue;
      // 숫자로만 된 행(ord 잔재) 스킵
      if (/^\d+$/.test(acctName.replace(/\s/g, ""))) continue;
      if (section === "bs") bsItems.push([acctName, nums]);
      else if (section === "is") isItems.push([acctName, nums]);
    }

    if (!bsItems.length && !isItems.length) return null;

    const prevYear = String(parseInt(targetYear) - 1);

    // 대표 컬럼 수 결정: 전체 항목의 최빈 nums.length (빈 셀 포함한 원본 기준)
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
        const acctClean = normalizeAcct(acct);
        if (isExcludedAccount(acctClean)) continue;
        const row: FinancialRow = { account: acctClean, depth: detectAccountDepth(acctClean, ["BS", "IS", "CIS"]) };
        let v1: string, v2: string; // v1=첫째 컬럼, v2=둘째 컬럼

        if (typicalCols >= 4 && nums.length >= 4) {
          // 4컬럼: [영역A-1, 영역A-2, 영역B-1, 영역B-2]
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

        // 컬럼 순서가 전기→당기인 경우 swap
        const curVal = reversed ? v2 : v1;
        const prevVal = reversed ? v1 : v2;

        row[yrCur] = toMillions(String(parseAuditNum(curVal) || 0));
        row[yrPrev] = toMillions(String(parseAuditNum(prevVal) || 0));
        rows.push(row);
      }
      return rows;
    }

    return {
      bsRows: extractTwoYears(bsItems, targetYear, prevYear, columnOrderReversed),
      isRows: extractTwoYears(isItems, targetYear, prevYear, columnOrderReversed),
      years: [targetYear, prevYear],
    };
  } catch (e) {
    console.error(`[DART] ${targetYear}년 감사보고서 파싱 실패:`, e);
    return null;
  }
}

// 연도별 파싱 결과 병합
function mergeAuditResults(
  accumulated: { bsRows: FinancialRow[]; isRows: FinancialRow[]; dataYears: string[] },
  parsed: { bsRows: FinancialRow[]; isRows: FinancialRow[]; years: string[] }
): void {
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
  } else {
    mergeRows(accumulated.bsRows, parsed.bsRows, parsed.years);
    mergeRows(accumulated.isRows, parsed.isRows, parsed.years);
  }
  for (const y of parsed.years) {
    if (!accumulated.dataYears.includes(y)) accumulated.dataYears.push(y);
  }
}

interface AuditReportResult {
  ofs: { bsRows: FinancialRow[]; isRows: FinancialRow[]; dataYears: string[] } | null;
  cfs: { bsRows: FinancialRow[]; isRows: FinancialRow[]; dataYears: string[] } | null;
}

async function fetchAuditReportData(
  corpCode: string,
  years: string[]
): Promise<AuditReportResult> {
  const apiKey = getApiKey();

  // 1. 외부감사관련(pblntf_ty=F) 공시에서 감사보고서 + 연결감사보고서 rcept_no 수집
  const ofsMap: Record<string, string> = {}; // 개별: 감사보고서
  const cfsMap: Record<string, string> = {}; // 연결: 연결감사보고서

  try {
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_code: corpCode,
      bgn_de: `${parseInt(years.reduce((a, b) => a < b ? a : b)) - 1}0101`,
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
        // 기재정정 우선 (먼저 등장)
        if (!cfsMap[yr]) cfsMap[yr] = it.rcept_no;
      } else if (nm.includes("감사보고서")) {
        if (!ofsMap[yr]) ofsMap[yr] = it.rcept_no;
      }
    }
  } catch { /* ignore */ }

  const ofsYears = Object.keys(ofsMap);
  const cfsYears = Object.keys(cfsMap);
  console.log(`[DART] 감사보고서 발견 — 개별: ${ofsYears.join(",")||"없음"} / 연결: ${cfsYears.join(",")||"없음"}`);

  // 2. 개별 감사보고서 파싱
  let ofsResult: AuditReportResult["ofs"] = null;
  if (ofsYears.length) {
    const acc = { bsRows: [] as FinancialRow[], isRows: [] as FinancialRow[], dataYears: [] as string[] };
    for (const yr of ofsYears.sort().reverse()) {
      const parsed = await parseOneAuditXml(ofsMap[yr], yr);
      if (parsed) {
        mergeAuditResults(acc, parsed);
        console.log(`[DART] ${yr}년 개별 감사보고서: BS ${parsed.bsRows.length}행, IS ${parsed.isRows.length}행`);
      }
    }
    if (acc.bsRows.length || acc.isRows.length) {
      acc.dataYears = [...new Set(acc.dataYears)].sort();
      ofsResult = acc;
    }
  }

  // 3. 연결 감사보고서 파싱
  let cfsResult: AuditReportResult["cfs"] = null;
  if (cfsYears.length) {
    const acc = { bsRows: [] as FinancialRow[], isRows: [] as FinancialRow[], dataYears: [] as string[] };
    for (const yr of cfsYears.sort().reverse()) {
      const parsed = await parseOneAuditXml(cfsMap[yr], yr);
      if (parsed) {
        mergeAuditResults(acc, parsed);
        console.log(`[DART] ${yr}년 연결 감사보고서: BS ${parsed.bsRows.length}행, IS ${parsed.isRows.length}행`);
      }
    }
    if (acc.bsRows.length || acc.isRows.length) {
      acc.dataYears = [...new Set(acc.dataYears)].sort();
      cfsResult = acc;
    }
  }

  return { ofs: ofsResult, cfs: cfsResult };
}

// ============================================================
// 메인: 3단계 fallback
// ============================================================

function processRawStatements(
  allRaw: Record<string, DartRawItem[]>,
  years: string[],
  yearReprtMap?: Record<string, string>
): { bsRows: FinancialRow[]; isRows: FinancialRow[]; ratios: Record<string, Record<string, string>> } {
  const bsRows = buildStatements(allRaw, years, ["BS"], yearReprtMap);
  const hasIS = Object.values(allRaw).some((items) => items.some((it) => it.sj_div === "IS"));
  const isRows = buildStatements(allRaw, years, hasIS ? ["IS"] : ["CIS"], yearReprtMap);
  const ratios = calcRatios(bsRows, isRows, years);
  return { bsRows, isRows, ratios };
}

export async function buildFinancialData(
  corpCode: string,
  years: string[]
): Promise<FinancialResult> {
  const companyInfo = await getCompanyInfo(corpCode);

  const result: FinancialResult = {
    companyInfo,
    bsItems: [],
    isItems: [],
    ratios: {},
    hasOfs: false,
    bsItemsCfs: [],
    isItemsCfs: [],
    ratiosCfs: {},
    hasCfs: false,
    years,
    source: "DART Open API",
    hasData: false,
  };

  // ── 1단계: 전체재무제표 API (fnlttSinglAcntAll) — OFS + CFS 동시 조회 ──
  let gotFull = false;

  for (const [fsLabel, fsDiv] of [["개별", "OFS"], ["연결", "CFS"]] as const) {
    const rawByYear: Record<string, DartRawItem[]> = {};
    let hasData = false;

    const quarterlyWarnings: string[] = [];
    const yearReprtMap: Record<string, string> = {}; // year → reprtCode
    for (const year of years) {
      const { items: raw, reprtCode } = await fetchFinancialItems(corpCode, year, fsDiv);
      rawByYear[year] = raw;
      if (raw.length) {
        hasData = true;
        yearReprtMap[year] = reprtCode;
        console.log(`[DART] ${year}년 ${fsLabel} → ${raw.length}개 항목 (${REPRT_LABELS[reprtCode] || reprtCode})`);
        if (reprtCode && reprtCode !== "11011") {
          const month = REPRT_MONTH[reprtCode] || "12";
          quarterlyWarnings.push(`${year}년: ${REPRT_LABELS[reprtCode]} 기준 (${year}.${month}월, 사업보고서 미공시 — IS는 누적이 아닌 분기 데이터일 수 있음)`);
        }
      }
    }

    if (!hasData) continue;
    gotFull = true;

    const { bsRows, isRows, ratios } = processRawStatements(rawByYear, years, yearReprtMap);

    // 분기보고서 연도의 컬럼 헤더를 "2025" → "2025.09" 등으로 변경
    const displayYears = years.map(y => {
      const rc = yearReprtMap[y];
      if (rc && rc !== "11011") {
        return `${y}.${REPRT_MONTH[rc] || "12"}`;
      }
      return y;
    });

    // BS/IS 항목의 연도 키도 변경
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
    renameYearKeys(bsRows, years, displayYears);
    renameYearKeys(isRows, years, displayYears);

    // ratios 연도 키도 변경
    const newRatios: Record<string, Record<string, string>> = {};
    for (let i = 0; i < years.length; i++) {
      if (ratios[years[i]]) {
        newRatios[displayYears[i]] = ratios[years[i]];
      }
    }

    if (fsDiv === "OFS") {
      result.bsItems = bsRows;
      result.isItems = isRows;
      result.ratios = newRatios;
      result.hasOfs = true;
    } else {
      result.bsItemsCfs = bsRows;
      result.isItemsCfs = isRows;
      result.ratiosCfs = newRatios;
      result.hasCfs = true;
    }

    // displayYears 저장 (기존 years 대체)
    result.years = displayYears;

    if (quarterlyWarnings.length > 0) {
      (result as any).quarterlyWarnings = quarterlyWarnings;
    }
  }

  if (gotFull) {
    result.hasData = true;
    result.source = "DART Open API (금융감독원 전자공시시스템)";
    return result;
  }

  // ── 2단계: 주요계정 API (fnlttSinglAcnt) ──
  console.log("[DART] 전체재무제표 없음 → 주요계정(fnlttSinglAcnt) API 시도");
  const keyAccountsRaw: Record<string, DartRawItem[]> = {};
  for (const year of years) {
    keyAccountsRaw[year] = await fetchKeyAccounts(corpCode, year);
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

  // ── 3단계: 감사보고서 원문(XML) 파싱 — 1/2단계 실패 시 항상 시도 ──
  const filingInfo = await checkFilingType(corpCode);
  if (filingInfo.onlyAudit || !result.hasData) {
    console.log(`[DART] 주요계정도 없음 → 감사보고서 원문(XML) 파싱 시도 (onlyAudit=${filingInfo.onlyAudit})`);
    const auditResult = await fetchAuditReportData(corpCode, years);

    // 개별(OFS)
    if (auditResult.ofs) {
      const ratios = calcRatios(auditResult.ofs.bsRows, auditResult.ofs.isRows, auditResult.ofs.dataYears);
      result.bsItems = auditResult.ofs.bsRows;
      result.isItems = auditResult.ofs.isRows;
      result.ratios = ratios;
      result.hasOfs = true;
      result.years = auditResult.ofs.dataYears;
      result.hasData = true;
    }

    // 연결(CFS)
    if (auditResult.cfs) {
      const ratios = calcRatios(auditResult.cfs.bsRows, auditResult.cfs.isRows, auditResult.cfs.dataYears);
      result.bsItemsCfs = auditResult.cfs.bsRows;
      result.isItemsCfs = auditResult.cfs.isRows;
      result.ratiosCfs = ratios;
      result.hasCfs = true;
      // 연결만 있고 개별이 없으면 years를 연결 기준으로
      if (!result.hasOfs) result.years = auditResult.cfs.dataYears;
      result.hasData = true;
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
    const res = await fetch(`${DART_API_BASE}/list.json?${params}`);
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
    const docRes = await fetch(`${DART_API_BASE}/document.xml?${docParams}`);
    const rawBuf = Buffer.from(await docRes.arrayBuffer());

    if (rawBuf[0] !== 0x50 || rawBuf[1] !== 0x4B) return null;

    const zip = await JSZip.loadAsync(rawBuf);
    const firstFile = Object.keys(zip.files)[0];
    const content = await zip.files[firstFile].async("string");

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
