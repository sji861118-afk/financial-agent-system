/**
 * 재무분석 엔진 (NICE BizLine 기준)
 * ====================================
 * DART 재무데이터를 기반으로 입체적 재무분석 리포트를 생성합니다.
 *
 * 분석 항목:
 *   1. 기업 개요 및 산업 벤치마크
 *   2. 주요 재무비율 분석
 *   3. 항목별 심층 진단 (안정성/수익성/성장성/활동성)
 *   4. NICE 10등급 신용등급 산출
 *   5. 재무 분석가 소견 및 향후 전망
 */

// ============================================================
// 인터페이스 정의
// ============================================================

export interface FinancialDataInput {
  company?: {
    corpName: string;
    ceoNm?: string;
    bizrNo?: string;
    adres?: string;
    estDt?: string;
    indutyCode?: string;
    corpCls?: string;
    stockCode?: string;
  };
  bsItemsOfs: Array<Record<string, string | number | undefined>>;
  isItemsOfs: Array<Record<string, string | number | undefined>>;
  bsItemsCfs: Array<Record<string, string | number | undefined>>;
  isItemsCfs: Array<Record<string, string | number | undefined>>;
  ratiosOfs: Record<string, Record<string, string>>;
  ratiosCfs: Record<string, Record<string, string>>;
  hasOfs: boolean;
  hasCfs: boolean;
  years: string[];
}

export interface RatioAnalysis {
  name: string;
  category: string;
  values: Record<string, number | null>;
  valuesStr: Record<string, string>;
  benchmark: number;
  benchmarkLabel: string;
  trend: string;
  trendIcon: string;
  vsBenchmark: string;
  diagnosis: string;
  riskLevel: string;
}

export interface ExpertAnalysis {
  executiveSummary: string;
  deepDiagnosis: string;
  riskAssessment: string;
  loanOpinion: string;
  creditOutlook: string;
  keyMetricsNarrative: string;
  aiModel: string;
}

export interface FinancialAnalysisReport {
  corpName: string;
  ceoNm: string;
  bizrNo: string;
  adres: string;
  estDt: string;
  industry: string;
  industryLabel: string;
  corpCls: string;
  years: string[];
  fsType: string;
  stabilityRatios: RatioAnalysis[];
  profitabilityRatios: RatioAnalysis[];
  growthRatios: RatioAnalysis[];
  activityRatios: RatioAnalysis[];
  overallGrade: string;
  overallSummary: string;
  riskFactors: string[];
  opportunityFactors: string[];
  analystOpinion: string;
  expertAnalysis?: ExpertAnalysis;
}

// ============================================================
// NICE 10등급 신용등급 체계
// ============================================================

const NICE_GRADE_DESC: Record<string, string> = {
  AAA: "상거래를 위한 신용능력이 최우량급이며, 환경변화에 충분한 대처가 가능한 기업",
  AA: "상거래를 위한 신용능력이 우량하며, 환경변화에 적절한 대처가 가능한 기업",
  A: "상거래를 위한 신용능력이 양호하며, 환경변화에 대한 대처능력이 제한적인 기업",
  BBB: "상거래를 위한 신용능력이 양호하나, 경제여건 및 환경악화에 따라 거래안정성 저하가능성이 있는 기업",
  BB: "상거래를 위한 신용능력이 보통이며, 경제여건 및 환경악화 시에는 거래안정성 저하가 우려되는 기업",
  B: "상거래를 위한 신용능력이 보통이며, 경제여건 및 환경악화 시에는 거래안정성 저하가능성이 높은 기업",
  CCC: "상거래를 위한 신용능력이 보통 이하이며, 거래안정성 저하가 예상되어 주의를 요하는 기업",
  CC: "상거래를 위한 신용능력이 매우 낮으며, 거래의 안정성이 낮은 기업",
  C: "상거래를 위한 신용능력이 최하위 수준이며, 거래위험 발생가능성이 매우 높은 기업",
  D: "현재 신용위험이 실제 발생하였거나, 신용위험에 준하는 상태에 처해 있는 기업",
};

/** 가중평균 점수 -> NICE 등급 매핑
 *  NICE 실제 등급은 재무비율 외에 시장지위, 사업안정성, 그룹 지원 등
 *  비재무적 요소를 반영하므로, 재무비율 기반 스코어는 보수적으로 산출됨.
 *  이를 감안하여 등급 구간을 조정함. */
function scoreToNiceGrade(score: number): string {
  if (score >= 9.0) return "AAA";
  if (score >= 8.0) return "AA";
  if (score >= 7.0) return "A";
  if (score >= 6.3) return "BBB";
  if (score >= 5.5) return "BB";
  if (score >= 4.5) return "B";
  if (score >= 3.5) return "CCC";
  if (score >= 2.5) return "CC";
  if (score >= 1.5) return "C";
  return "D";
}

// ============================================================
// 산업별 벤치마크 (한국은행 기업경영분석 기준 평균값)
// ============================================================

type BenchmarkSet = Record<string, number>;

const INDUSTRY_BENCHMARKS: Record<string, BenchmarkSet> = {
  default: {
    "부채비율": 120.0,
    "유동비율": 130.0,
    "자기자본비율": 45.0,
    "차입금의존도": 25.0,
    "당좌비율": 100.0,
    "이자보상배율": 5.0,
    "영업이익률": 6.0,
    "총자산이익률(ROA)": 3.5,
    "자기자본이익률(ROE)": 8.0,
    "매출총이익률": 25.0,
    "순이익률": 4.0,
    "매출증가율": 5.0,
    "매출액증가율": 5.0,
    "영업이익증가율": 5.0,
    "총자산증가율": 5.0,
    "총자산회전율": 0.8,
    "재고자산회전율": 8.0,
    "매출채권회전율": 6.0,
  },
  "제조업": {
    "부채비율": 95.0,
    "유동비율": 140.0,
    "자기자본비율": 51.0,
    "차입금의존도": 22.0,
    "당좌비율": 100.0,
    "이자보상배율": 6.0,
    "영업이익률": 7.0,
    "총자산이익률(ROA)": 4.0,
    "자기자본이익률(ROE)": 9.0,
    "매출총이익률": 22.0,
    "순이익률": 5.0,
    "매출증가율": 5.0,
    "매출액증가율": 5.0,
    "영업이익증가율": 5.0,
    "총자산증가율": 4.0,
    "총자산회전율": 0.9,
    "재고자산회전율": 10.0,
    "매출채권회전율": 7.0,
  },
  "건설업": {
    "부채비율": 160.0,
    "유동비율": 120.0,
    "자기자본비율": 38.0,
    "차입금의존도": 30.0,
    "당좌비율": 80.0,
    "이자보상배율": 3.0,
    "영업이익률": 5.0,
    "총자산이익률(ROA)": 2.5,
    "자기자본이익률(ROE)": 7.0,
    "매출총이익률": 15.0,
    "순이익률": 3.0,
    "매출증가율": 4.0,
    "매출액증가율": 4.0,
    "영업이익증가율": 4.0,
    "총자산증가율": 3.0,
    "총자산회전율": 0.6,
    "재고자산회전율": 3.0,
    "매출채권회전율": 5.0,
  },
  "부동산업": {
    "부채비율": 180.0,
    "유동비율": 100.0,
    "자기자본비율": 36.0,
    "차입금의존도": 40.0,
    "당좌비율": 70.0,
    "이자보상배율": 2.0,
    "영업이익률": 15.0,
    "총자산이익률(ROA)": 2.0,
    "자기자본이익률(ROE)": 5.0,
    "매출총이익률": 30.0,
    "순이익률": 8.0,
    "매출증가율": 3.0,
    "매출액증가율": 3.0,
    "영업이익증가율": 3.0,
    "총자산증가율": 5.0,
    "총자산회전율": 0.2,
    "재고자산회전율": 1.5,
    "매출채권회전율": 4.0,
  },
  "도소매업": {
    "부채비율": 110.0,
    "유동비율": 125.0,
    "자기자본비율": 48.0,
    "차입금의존도": 20.0,
    "당좌비율": 90.0,
    "이자보상배율": 5.0,
    "영업이익률": 4.0,
    "총자산이익률(ROA)": 3.0,
    "자기자본이익률(ROE)": 7.5,
    "매출총이익률": 20.0,
    "순이익률": 3.0,
    "매출증가율": 6.0,
    "매출액증가율": 6.0,
    "영업이익증가율": 5.0,
    "총자산증가율": 4.0,
    "총자산회전율": 1.5,
    "재고자산회전율": 12.0,
    "매출채권회전율": 10.0,
  },
  "서비스업": {
    "부채비율": 100.0,
    "유동비율": 135.0,
    "자기자본비율": 50.0,
    "차입금의존도": 18.0,
    "당좌비율": 110.0,
    "이자보상배율": 7.0,
    "영업이익률": 8.0,
    "총자산이익률(ROA)": 5.0,
    "자기자본이익률(ROE)": 10.0,
    "매출총이익률": 35.0,
    "순이익률": 6.0,
    "매출증가율": 7.0,
    "매출액증가율": 7.0,
    "영업이익증가율": 6.0,
    "총자산증가율": 5.0,
    "총자산회전율": 0.7,
    "재고자산회전율": 15.0,
    "매출채권회전율": 8.0,
  },
  "금융업": {
    "부채비율": 600.0,
    "유동비율": 105.0,
    "자기자본비율": 14.0,
    "차입금의존도": 75.0,
    "당좌비율": 80.0,
    "이자보상배율": 1.2,
    "영업이익률": 10.0,
    "총자산이익률(ROA)": 1.0,
    "자기자본이익률(ROE)": 7.0,
    "매출총이익률": 30.0,
    "순이익률": 8.0,
    "매출증가율": 5.0,
    "매출액증가율": 5.0,
    "영업이익증가율": 5.0,
    "총자산증가율": 5.0,
    "총자산회전율": 0.1,
    "재고자산회전율": 0.0,
    "매출채권회전율": 3.0,
  },
};

// ============================================================
// 진단 문구 템플릿
// ============================================================

const DIAGNOSIS_TEMPLATES: Record<string, Record<string, string>> = {
  "부채비율": {
    "양호": "부채비율이 업종 평균 대비 낮은 수준으로, 재무 안정성이 양호합니다.",
    "보통": "부채비율이 업종 평균 수준으로, 적정한 레버리지를 유지하고 있습니다.",
    "주의": "부채비율이 업종 평균을 상회하고 있어, 부채 관리에 주의가 필요합니다.",
  },
  "유동비율": {
    "양호": "유동비율이 양호하여 단기 채무 상환 능력이 충분합니다.",
    "보통": "유동비율이 적정 수준을 유지하고 있으나, 유동성 모니터링이 필요합니다.",
    "주의": "유동비율이 낮아 단기 유동성 리스크에 노출되어 있습니다.",
  },
  "자기자본비율": {
    "양호": "자기자본비율이 높아 자본 건전성이 양호합니다. 외부 충격에 대한 완충력이 충분합니다.",
    "보통": "자기자본비율이 업종 평균 수준으로, 자본 구조가 적정합니다.",
    "주의": "자기자본비율이 낮아 재무 건전성에 유의가 필요합니다. 자본 확충 방안을 검토해야 합니다.",
  },
  "차입금의존도": {
    "양호": "차입금의존도가 낮아 외부 차입에 대한 의존도가 적습니다.",
    "보통": "차입금의존도가 업종 평균 수준입니다.",
    "주의": "차입금의존도가 높아 금리 변동 시 이자 부담이 확대될 수 있습니다.",
  },
  "당좌비율": {
    "양호": "당좌비율이 양호하여 즉시 현금화 가능한 자산으로 단기 채무 상환이 가능합니다.",
    "보통": "당좌비율이 적정 수준으로, 단기 유동성은 보통입니다.",
    "주의": "당좌비율이 낮아 재고자산 제외 시 단기 유동성이 부족할 수 있습니다.",
  },
  "이자보상배율": {
    "양호": "이자보상배율이 충분하여 영업이익으로 이자비용을 여유 있게 감당할 수 있습니다.",
    "보통": "이자보상배율이 적정 수준으로, 이자 부담은 관리 가능합니다.",
    "주의": "이자보상배율이 낮아 이자비용 감당 능력이 취약합니다. 금리 상승 시 상환 리스크가 우려됩니다.",
  },
  "매출증가율": {
    "양호": "매출(영업수익)이 업종 평균을 상회하는 성장률을 보이고 있어 사업 확장이 양호합니다.",
    "보통": "매출(영업수익) 증가율이 업종 평균 수준입니다.",
    "주의": "매출(영업수익)이 감소 또는 정체 상태로, 수익원 다변화가 필요합니다.",
  },
  "영업이익률": {
    "양호": "영업이익률이 업종 평균을 상회하여 본업의 수익성이 우수합니다.",
    "보통": "영업이익률이 업종 평균 수준으로, 안정적인 수익 구조입니다.",
    "주의": "영업이익률이 낮아 원가 구조 개선이나 수익성 강화가 필요합니다.",
  },
  "총자산이익률(ROA)": {
    "양호": "ROA가 양호하여 보유 자산이 효율적으로 활용되고 있습니다.",
    "보통": "ROA가 업종 평균 수준으로 자산 활용 효율이 적정합니다.",
    "주의": "ROA가 낮아 자산 대비 수익 창출 능력이 부족합니다.",
  },
  "자기자본이익률(ROE)": {
    "양호": "ROE가 높아 주주 자본에 대한 수익성이 우수합니다.",
    "보통": "ROE가 업종 평균 수준입니다.",
    "주의": "ROE가 낮아 자기자본 수익성 개선이 필요합니다.",
  },
  "매출총이익률": {
    "양호": "매출총이익률이 높아 원가 경쟁력이 우수합니다.",
    "보통": "매출총이익률이 업종 평균 수준으로, 원가 구조가 적정합니다.",
    "주의": "매출총이익률이 낮아 원가 부담이 큰 상태입니다. 원가 절감 방안이 필요합니다.",
  },
  "순이익률": {
    "양호": "순이익률이 높아 최종 수익성이 우수합니다.",
    "보통": "순이익률이 업종 평균 수준입니다.",
    "주의": "순이익률이 낮아 영업외 비용 관리를 포함한 전반적 수익성 개선이 필요합니다.",
  },
  "총자산회전율": {
    "양호": "총자산회전율이 높아 자산 활용 효율이 우수합니다.",
    "보통": "총자산회전율이 업종 평균 수준입니다.",
    "주의": "총자산회전율이 낮아 보유 자산 대비 매출 창출 효율이 부족합니다.",
  },
  "재고자산회전율": {
    "양호": "재고자산회전율이 높아 재고 관리가 효율적입니다.",
    "보통": "재고자산회전율이 업종 평균 수준입니다.",
    "주의": "재고자산회전율이 낮아 재고 과다 보유 또는 재고 진부화 위험이 있습니다.",
  },
  "매출채권회전율": {
    "양호": "매출채권회전율이 높아 대금 회수가 원활합니다.",
    "보통": "매출채권회전율이 업종 평균 수준입니다.",
    "주의": "매출채권회전율이 낮아 대금 회수 지연 또는 부실채권 리스크가 우려됩니다.",
  },
};

// ============================================================
// 산업 분류
// ============================================================

function detectIndustry(
  indutyCode: string = "",
  corpName: string = ""
): [string, string] {
  const code = indutyCode.trim();

  // 업종코드 기반 (KSIC 대분류)
  if (code) {
    const c2 = code.length >= 2 ? code.slice(0, 2) : code;
    const n = parseInt(c2, 10);
    if (!isNaN(n)) {
      if (n >= 10 && n <= 34) return ["제조업", "제조업"];
      if (n >= 41 && n <= 42) return ["건설업", "건설업"];
      if (n >= 45 && n <= 47) return ["도소매업", "도소매업"];
      if (n === 68) return ["부동산업", "부동산업"];
      if (n >= 64 && n <= 66) return ["금융업", "금융업"];
      if ((n >= 55 && n <= 63) || (n >= 69 && n <= 99))
        return ["서비스업", "서비스업"];
    }
  }

  // 회사명 기반 추정
  const name = corpName.toLowerCase();
  if (["건설", "건축", "토건", "엔지니어링"].some((k) => name.includes(k)))
    return ["건설업", "건설업"];
  if (
    ["부동산", "개발", "시행", "신탁", "리츠", "자산관리"].some((k) =>
      name.includes(k)
    )
  )
    return ["부동산업", "부동산/신탁업"];
  if (
    ["은행", "저축", "캐피탈", "금융", "투자", "증권", "보험", "카드"].some(
      (k) => name.includes(k)
    )
  )
    return ["금융업", "금융업"];
  if (
    [
      "전자",
      "반도체",
      "기계",
      "화학",
      "제약",
      "바이오",
      "식품",
      "철강",
    ].some((k) => name.includes(k))
  )
    return ["제조업", "제조업"];
  if (["유통", "마트", "쇼핑", "무역", "상사"].some((k) => name.includes(k)))
    return ["도소매업", "도소매업"];

  return ["default", "일반 기업"];
}

// ============================================================
// 수치 파싱 유틸
// ============================================================

function parseRatio(valStr: string | undefined | null): number | null {
  if (!valStr || valStr === "-") return null;
  const s = String(valStr)
    .replace(/%/g, "")
    .replace(/,/g, "")
    .replace(/ /g, "")
    .trim();
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function parseAmount(valStr: string | undefined | null): number | null {
  if (!valStr || valStr === "-") return null;
  const s = String(valStr)
    .replace(/,/g, "")
    .replace(/ /g, "")
    .replace(/백만원/g, "")
    .trim();
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return "-";
  return `${val.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtTimes(val: number | null): string {
  if (val === null || val === undefined) return "-";
  return `${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}회`;
}

// ============================================================
// BS/IS 항목 검색 유틸
// ============================================================

function findItem(
  items: Array<Record<string, string>>,
  keywords: string[]
): Record<string, string> | null {
  for (const item of items) {
    const acct = (item["account"] || "").replace(/ /g, "");
    for (const kw of keywords) {
      if (acct.includes(kw)) return item;
    }
  }
  return null;
}

// ============================================================
// 성장률 계산
// ============================================================

function calcGrowthRatios(
  finData: FinancialDataInput,
  years: string[],
  fsType: "ofs" | "cfs"
): Record<string, Record<string, number | null>> {
  const bsItems =
    fsType === "ofs" ? finData.bsItemsOfs : finData.bsItemsCfs;
  const isItems =
    fsType === "ofs" ? finData.isItemsOfs : finData.isItemsCfs;

  const growth: Record<string, Record<string, number | null>> = {};

  const revenueItem = findItem(isItems, ["매출액", "영업수익", "수익(매출액)"]);
  const opIncomeItem = findItem(isItems, ["영업이익", "영업손익", "영업손실"]);
  const totalAssetsItem = findItem(bsItems, ["자산총계"]);
  const equityItem = findItem(bsItems, ["자본총계"]);

  const sortedYears = [...years].sort();

  for (let i = 1; i < sortedYears.length; i++) {
    const yCur = sortedYears[i];
    const yPrev = sortedYears[i - 1];
    const yearGrowth: Record<string, number | null> = {};

    const pairs: [string, Record<string, string> | null][] = [
      ["매출액증가율", revenueItem],
      ["영업이익증가율", opIncomeItem],
      ["총자산증가율", totalAssetsItem],
      ["자기자본증가율", equityItem],
    ];

    for (const [label, item] of pairs) {
      if (item) {
        const cur = parseAmount(item[yCur]);
        const prev = parseAmount(item[yPrev]);
        if (cur !== null && prev !== null && prev !== 0) {
          yearGrowth[label] = ((cur - prev) / Math.abs(prev)) * 100;
        } else {
          yearGrowth[label] = null;
        }
      } else {
        yearGrowth[label] = null;
      }
    }

    growth[yCur] = yearGrowth;
  }

  return growth;
}

// ============================================================
// 활동성 지표 계산 (BS/IS 원시 데이터 기반)
// ============================================================

function calcActivityRatios(
  finData: FinancialDataInput,
  years: string[],
  fsType: "ofs" | "cfs"
): Record<string, Record<string, number | null>> {
  const bsItems = fsType === "ofs" ? finData.bsItemsOfs : finData.bsItemsCfs;
  const isItems = fsType === "ofs" ? finData.isItemsOfs : finData.isItemsCfs;

  const revenueItem = findItem(isItems, ["매출액", "영업수익", "수익(매출액)"]);
  const cogsItem = findItem(isItems, ["매출원가"]);
  const totalAssetsItem = findItem(bsItems, ["자산총계"]);
  const inventoryItem = findItem(bsItems, ["재고자산"]);
  const receivablesItem = findItem(bsItems, ["매출채권", "매출채권및기타유동채권", "매출채권및기타채권"]);

  const result: Record<string, Record<string, number | null>> = {};

  for (const y of [...years].sort()) {
    const yearData: Record<string, number | null> = {};

    const revenue = revenueItem ? parseAmount(revenueItem[y]) : null;
    const cogs = cogsItem ? parseAmount(cogsItem[y]) : null;
    const totalAssets = totalAssetsItem ? parseAmount(totalAssetsItem[y]) : null;
    const inventory = inventoryItem ? parseAmount(inventoryItem[y]) : null;
    const receivables = receivablesItem ? parseAmount(receivablesItem[y]) : null;

    // 총자산회전율 = 매출액 / 총자산
    if (revenue !== null && totalAssets !== null && totalAssets !== 0) {
      yearData["총자산회전율"] = revenue / totalAssets;
    } else {
      yearData["총자산회전율"] = null;
    }

    // 재고자산회전율 = 매출원가 / 재고자산
    if (cogs !== null && inventory !== null && inventory !== 0) {
      yearData["재고자산회전율"] = cogs / inventory;
    } else {
      yearData["재고자산회전율"] = null;
    }

    // 매출채권회전율 = 매출액 / 매출채권
    if (revenue !== null && receivables !== null && receivables !== 0) {
      yearData["매출채권회전율"] = revenue / receivables;
    } else {
      yearData["매출채권회전율"] = null;
    }

    result[y] = yearData;
  }

  return result;
}

// ============================================================
// 추가 재무비율 계산 (BS/IS 원시 데이터 기반)
// ============================================================

function calcAdditionalRatios(
  finData: FinancialDataInput,
  years: string[],
  fsType: "ofs" | "cfs"
): Record<string, Record<string, number | null>> {
  const bsItems = fsType === "ofs" ? finData.bsItemsOfs : finData.bsItemsCfs;
  const isItems = fsType === "ofs" ? finData.isItemsOfs : finData.isItemsCfs;

  const revenueItem = findItem(isItems, ["매출액", "영업수익", "수익(매출액)"]);
  const grossProfitItem = findItem(isItems, ["매출총이익"]);
  const opIncomeItem = findItem(isItems, ["영업이익", "영업손익", "영업손실"]);
  const netIncomeItem = findItem(isItems, ["당기순이익", "당기순손익", "당기순손실", "분기순이익"]);
  const interestExpItem = findItem(isItems, ["이자비용", "금융비용", "금융원가"]);
  const inventoryItem = findItem(bsItems, ["재고자산"]);

  // === 유동자산 추론 (3단계 fallback) ===
  const totalAssetsItem2 = findItem(bsItems, ["자산총계"]);
  const nonCurrentAssetsItem = findItem(bsItems, ["비유동자산"]);
  const currentAssetsItem = findItem(bsItems, ["유동자산"]);
  // 유동자산 하위 항목 (합산용)
  const caSubItems = [
    "현금및현금성자산", "현금과예금", "현금및예치금", "단기금융상품",
    "매출채권", "매출채권및기타유동채권", "매출채권및기타채권",
    "미수금", "미수수익", "선급금", "선급비용",
    "재고자산", "단기투자자산", "유동금융자산",
    "당기손익-공정가치측정금융자산", "기타유동자산",
    "단기대여금", "단기보증금",
  ].map((kw) => findItem(bsItems, [kw])).filter(Boolean) as Record<string, string>[];

  // === 유동부채 추론 (3단계 fallback) ===
  const totalLiabItem = findItem(bsItems, ["부채총계"]);
  const nonCurrentLiabItem = findItem(bsItems, ["비유동부채"]);
  const currentLiabItem = findItem(bsItems, ["유동부채"]);
  // 유동부채 하위 항목 (합산용)
  const clSubItems = [
    "단기차입금", "매입채무", "매입채무및기타유동채무", "매입채무및기타채무",
    "미지급금", "미지급비용", "선수금", "예수금",
    "유동성장기부채", "유동리스부채", "당기법인세부채",
    "단기사채", "유동금융부채", "기타유동부채",
  ].map((kw) => findItem(bsItems, [kw])).filter(Boolean) as Record<string, string>[];

  const result: Record<string, Record<string, number | null>> = {};

  for (const y of [...years].sort()) {
    const yearData: Record<string, number | null> = {};

    const revenue = revenueItem ? parseAmount(revenueItem[y]) : null;
    const grossProfit = grossProfitItem ? parseAmount(grossProfitItem[y]) : null;
    const opIncome = opIncomeItem ? parseAmount(opIncomeItem[y]) : null;
    const netIncome = netIncomeItem ? parseAmount(netIncomeItem[y]) : null;
    const interestExp = interestExpItem ? parseAmount(interestExpItem[y]) : null;
    const inventory = inventoryItem ? parseAmount(inventoryItem[y]) : null;

    // 유동자산 추론: 직접추출 → 역산(자산-비유동) → 하위항목 합산
    let currentAssets = currentAssetsItem ? parseAmount(currentAssetsItem[y]) : null;
    if (currentAssets === null || currentAssets === 0) {
      const ta = totalAssetsItem2 ? parseAmount(totalAssetsItem2[y]) : null;
      const nca = nonCurrentAssetsItem ? parseAmount(nonCurrentAssetsItem[y]) : null;
      if (ta !== null && ta > 0 && nca !== null && nca > 0) {
        currentAssets = ta - nca;
      }
    }
    if (currentAssets === null || currentAssets === 0) {
      let sum = 0;
      let found = false;
      for (const item of caSubItems) {
        const v = parseAmount(item[y]);
        if (v !== null && v !== 0) { sum += v; found = true; }
      }
      if (found && sum > 0) currentAssets = sum;
    }

    // 유동부채 추론: 직접추출 → 역산(부채-비유동) → 하위항목 합산
    let currentLiab = currentLiabItem ? parseAmount(currentLiabItem[y]) : null;
    if (currentLiab === null || currentLiab === 0) {
      const tl = totalLiabItem ? parseAmount(totalLiabItem[y]) : null;
      const ncl = nonCurrentLiabItem ? parseAmount(nonCurrentLiabItem[y]) : null;
      if (tl !== null && tl > 0 && ncl !== null && ncl > 0) {
        currentLiab = tl - ncl;
      }
    }
    if (currentLiab === null || currentLiab === 0) {
      let sum = 0;
      let found = false;
      for (const item of clSubItems) {
        const v = parseAmount(item[y]);
        if (v !== null && v !== 0) { sum += Math.abs(v); found = true; }
      }
      if (found && sum > 0) currentLiab = sum;
    }

    // 당좌비율 = (유동자산 - 재고자산) / 유동부채 * 100
    if (currentAssets !== null && currentAssets > 0 && currentLiab !== null && currentLiab !== 0) {
      const inv = inventory ?? 0;
      yearData["당좌비율"] = ((currentAssets - inv) / currentLiab) * 100;
    } else {
      yearData["당좌비율"] = null;
    }

    // 이자보상배율 = 영업이익 / 이자비용
    if (opIncome !== null && interestExp !== null && interestExp !== 0) {
      yearData["이자보상배율"] = opIncome / Math.abs(interestExp);
    } else {
      yearData["이자보상배율"] = null;
    }

    // 매출총이익률 = 매출총이익 / 매출액 * 100
    if (grossProfit !== null && revenue !== null && revenue !== 0) {
      yearData["매출총이익률"] = (grossProfit / revenue) * 100;
    } else {
      yearData["매출총이익률"] = null;
    }

    // 순이익률 = 당기순이익 / 매출액 * 100
    if (netIncome !== null && revenue !== null && revenue !== 0) {
      yearData["순이익률"] = (netIncome / revenue) * 100;
    } else {
      yearData["순이익률"] = null;
    }

    result[y] = yearData;
  }

  return result;
}

// ============================================================
// 추이 & 벤치마크 판정
// ============================================================

function judgeTrend(
  valuesByYear: Record<string, number | null>,
  higherIsBetter: boolean
): [string, string] {
  const sortedVals: number[] = [];
  const sortedKeys = Object.keys(valuesByYear).sort();
  for (const y of sortedKeys) {
    const v = valuesByYear[y];
    if (v !== null && v !== undefined) {
      sortedVals.push(v);
    }
  }

  if (sortedVals.length < 2) return ["판단불가", "―"];

  const diff = sortedVals[sortedVals.length - 1] - sortedVals[sortedVals.length - 2];
  const threshold =
    sortedVals[sortedVals.length - 2] !== 0
      ? Math.abs(sortedVals[sortedVals.length - 2]) * 0.03
      : 1.0;

  if (Math.abs(diff) < threshold) return ["유지", "―"];
  if ((diff > 0) === higherIsBetter) return ["개선", "▲"];
  return ["악화", "▼"];
}

function judgeVsBenchmark(
  value: number | null,
  benchmark: number,
  higherIsBetter: boolean
): string {
  if (value === null || value === undefined) return "판단불가";

  if (higherIsBetter) {
    if (value >= benchmark * 1.1) return "양호";
    if (value >= benchmark * 0.8) return "보통";
    return "주의";
  } else {
    // lower is better (부채비율, 차입금의존도)
    if (value <= benchmark * 0.9) return "양호";
    if (value <= benchmark * 1.2) return "보통";
    return "주의";
  }
}

// ============================================================
// 개별 비율 점수 산출 (1~10점, NICE 스코어링)
// ============================================================

function scoreRatio(
  value: number | null,
  benchmark: number,
  higherIsBetter: boolean
): number {
  if (value === null || value === undefined) return -1; // -1 = 판단불가 (카테고리 점수에서 제외)
  if (benchmark === 0) return 6.0; // 벤치마크 0이면 중립

  // 적자 기업 특수 처리: value가 음수이고 higherIsBetter면 낮은 점수
  if (value < 0 && higherIsBetter) {
    if (value < -benchmark) return 1.0;
    return 2.0;
  }

  const ratio = higherIsBetter
    ? value / benchmark
    : (value > 0 ? benchmark / value : 0.1);

  // ratio > 1 means better than benchmark — 더 세밀한 구간
  if (ratio >= 2.5) return 10.0;
  if (ratio >= 2.0) return 9.5;
  if (ratio >= 1.5) return 9.0;
  if (ratio >= 1.3) return 8.5;
  if (ratio >= 1.15) return 8.0;
  if (ratio >= 1.05) return 7.5;
  if (ratio >= 0.95) return 7.0;
  if (ratio >= 0.85) return 6.5;
  if (ratio >= 0.75) return 6.0;
  if (ratio >= 0.6) return 5.0;
  if (ratio >= 0.45) return 4.0;
  if (ratio >= 0.3) return 3.0;
  if (ratio >= 0.15) return 2.0;
  if (ratio > 0) return 1.0;
  return 0.5;
}

// ============================================================
// 진단 문구 생성
// ============================================================

function getDiagnosis(
  ratioName: string,
  vsBenchmark: string,
  trend: string,
  trendIcon: string,
  _latestVal: number | null
): string {
  const templates = DIAGNOSIS_TEMPLATES[ratioName] || {};
  let base = templates[vsBenchmark] || "";
  if (!base) {
    base = `${ratioName}이(가) 업종 평균 대비 ${vsBenchmark} 수준입니다.`;
  }

  let trendText = "";
  if (trend === "개선") {
    trendText = ` 전기 대비 ${trendIcon} 개선 추세를 보이고 있어 긍정적입니다.`;
  } else if (trend === "악화") {
    trendText = ` 전기 대비 ${trendIcon} 하락 추세로, 향후 추이를 주시해야 합니다.`;
  } else {
    trendText = " 전기 대비 큰 변동 없이 안정적으로 유지되고 있습니다.";
  }

  return base + trendText;
}

function getRiskLevel(vsBenchmark: string, trend: string): string {
  if (vsBenchmark === "주의" && trend === "악화") return "높음";
  if (vsBenchmark === "주의" || trend === "악화") return "보통";
  return "낮음";
}

// ============================================================
// 개별 비율 분석 생성
// ============================================================

function buildRatioAnalysis(
  rname: string,
  category: string,
  ratios: Record<string, Record<string, string>>,
  years: string[],
  benchmark: number,
  higherIsBetter: boolean
): RatioAnalysis {
  const ra: RatioAnalysis = {
    name: rname,
    category,
    values: {},
    valuesStr: {},
    benchmark,
    benchmarkLabel: `업종 평균 ${fmtPct(benchmark)}`,
    trend: "",
    trendIcon: "",
    vsBenchmark: "",
    diagnosis: "",
    riskLevel: "",
  };

  for (const y of [...years].sort()) {
    const yrRatios = ratios[y] || {};
    const valStr = yrRatios[rname] || "-";
    ra.valuesStr[y] = valStr;
    const parsed = parseRatio(valStr);
    if (parsed !== null) {
      ra.values[y] = parsed;
    }
  }

  [ra.trend, ra.trendIcon] = judgeTrend(ra.values, higherIsBetter);

  let latestVal: number | null = null;
  for (const y of Object.keys(ra.values).sort().reverse()) {
    if (ra.values[y] !== null && ra.values[y] !== undefined) {
      latestVal = ra.values[y];
      break;
    }
  }

  ra.vsBenchmark = judgeVsBenchmark(latestVal, benchmark, higherIsBetter);
  ra.diagnosis = getDiagnosis(rname, ra.vsBenchmark, ra.trend, ra.trendIcon, latestVal);
  ra.riskLevel = getRiskLevel(ra.vsBenchmark, ra.trend);

  return ra;
}

/** 계산된 수치 데이터로 RatioAnalysis를 만드는 헬퍼 (활동성/추가비율용) */
function buildComputedRatioAnalysis(
  rname: string,
  category: string,
  computedData: Record<string, Record<string, number | null>>,
  years: string[],
  benchmark: number,
  higherIsBetter: boolean,
  unit: "pct" | "times" = "pct"
): RatioAnalysis {
  const fmt = unit === "times" ? fmtTimes : fmtPct;
  const ra: RatioAnalysis = {
    name: rname,
    category,
    values: {},
    valuesStr: {},
    benchmark,
    benchmarkLabel: unit === "times" ? `업종 평균 ${benchmark.toFixed(1)}회` : `업종 평균 ${fmtPct(benchmark)}`,
    trend: "",
    trendIcon: "",
    vsBenchmark: "",
    diagnosis: "",
    riskLevel: "",
  };

  for (const y of [...years].sort()) {
    const val = computedData[y]?.[rname] ?? null;
    if (val !== null) {
      ra.values[y] = val;
      ra.valuesStr[y] = fmt(val);
    } else {
      ra.valuesStr[y] = "-";
    }
  }

  [ra.trend, ra.trendIcon] = judgeTrend(ra.values, higherIsBetter);

  let latestVal: number | null = null;
  for (const y of Object.keys(ra.values).sort().reverse()) {
    if (ra.values[y] !== null && ra.values[y] !== undefined) {
      latestVal = ra.values[y];
      break;
    }
  }

  ra.vsBenchmark = judgeVsBenchmark(latestVal, benchmark, higherIsBetter);
  ra.diagnosis = getDiagnosis(rname, ra.vsBenchmark, ra.trend, ra.trendIcon, latestVal);
  ra.riskLevel = getRiskLevel(ra.vsBenchmark, ra.trend);

  return ra;
}

// ============================================================
// 카테고리별 가중평균 점수 계산
// ============================================================

function calcCategoryScore(
  ratios: RatioAnalysis[],
  bench: BenchmarkSet,
  higherIsBetterMap: Record<string, boolean>
): number {
  let totalScore = 0;
  let count = 0;

  for (const ra of ratios) {
    let latestVal: number | null = null;
    for (const y of Object.keys(ra.values).sort().reverse()) {
      if (ra.values[y] !== null && ra.values[y] !== undefined) {
        latestVal = ra.values[y];
        break;
      }
    }
    const benchmark = bench[ra.name] ?? ra.benchmark;
    const higherIsBetter = higherIsBetterMap[ra.name] ?? true;
    const score = scoreRatio(latestVal, benchmark, higherIsBetter);
    if (score < 0) continue; // 판단불가 지표는 제외 (점수 왜곡 방지)
    totalScore += score;
    count++;
  }

  // 카테고리에 유효 지표가 없으면 중립(7.0) — 해당 카테고리를 불이익 없이 처리
  return count > 0 ? totalScore / count : 7.0;
}

// ============================================================
// 종합 요약 문구
// ============================================================

function buildOverallSummary(
  report: FinancialAnalysisReport,
  gradeDesc: string
): string {
  const name = report.corpName || "해당 기업";
  const industry = report.industryLabel || "일반";

  // 안정성
  let stabStatus = "안정적";
  for (const r of report.stabilityRatios) {
    if (r.vsBenchmark === "주의") {
      stabStatus = "취약";
      break;
    } else if (r.vsBenchmark === "보통") {
      stabStatus = "적정";
    }
  }

  // 수익성
  let profStatus = "우수";
  for (const r of report.profitabilityRatios) {
    if (r.vsBenchmark === "주의") {
      profStatus = "저조";
      break;
    } else if (r.vsBenchmark === "보통") {
      profStatus = "적정";
    }
  }

  // 성장성
  let growStatus = "양호";
  for (const r of report.growthRatios) {
    if (r.vsBenchmark === "주의") {
      growStatus = "부진";
      break;
    } else if (r.vsBenchmark === "보통") {
      growStatus = "적정";
    }
  }

  // 활동성
  let actStatus = "양호";
  for (const r of report.activityRatios) {
    if (r.vsBenchmark === "주의") {
      actStatus = "부진";
      break;
    } else if (r.vsBenchmark === "보통") {
      actStatus = "적정";
    }
  }

  return (
    `${name}은(는) ${industry} 소속으로, ` +
    `재무 안정성은 ${stabStatus}, 수익성은 ${profStatus}, 성장성은 ${growStatus}, 활동성은 ${actStatus}한 수준이며, ` +
    `종합 재무등급은 [${report.overallGrade}등급(${gradeDesc})]으로 평가됩니다.`
  );
}

// ============================================================
// 분석가 소견
// ============================================================

function buildAnalystOpinion(report: FinancialAnalysisReport): string {
  const parts: string[] = [];
  const allRatios = [
    ...report.stabilityRatios,
    ...report.profitabilityRatios,
    ...report.growthRatios,
    ...report.activityRatios,
  ];

  const strengths = allRatios.filter((r) => r.vsBenchmark === "양호").map((r) => r.name);
  const weaknesses = allRatios.filter((r) => r.vsBenchmark === "주의").map((r) => r.name);
  const improving = allRatios.filter((r) => r.trend === "개선").map((r) => r.name);
  const worsening = allRatios.filter((r) => r.trend === "악화").map((r) => r.name);

  if (strengths.length > 0) parts.push(`강점 지표: ${strengths.join(", ")}이(가) 업종 평균을 상회하고 있습니다.`);
  if (weaknesses.length > 0) parts.push(`유의 지표: ${weaknesses.join(", ")}은(는) 업종 평균을 하회하여 주의가 필요합니다.`);
  if (improving.length > 0) parts.push(`개선 추세: ${improving.join(", ")}.`);
  if (worsening.length > 0) parts.push(`악화 추세: ${worsening.join(", ")} — 원인 파악 및 모니터링 필요.`);
  if (report.riskFactors.length > 0) parts.push(`주요 리스크: ${report.riskFactors.join("; ")}.`);
  if (report.opportunityFactors.length > 0) parts.push(`긍정 요인: ${report.opportunityFactors.join("; ")}.`);
  if (parts.length === 0) parts.push("재무데이터가 충분하지 않아 종합 소견 작성이 제한적입니다.");

  return parts.join(" ");
}

// ============================================================
// 전문가급 심층 분석 (룰 기반 고도화)
// ============================================================

function getLatestVal(ra: RatioAnalysis): number | null {
  for (const y of Object.keys(ra.values).sort().reverse()) {
    if (ra.values[y] !== null && ra.values[y] !== undefined) return ra.values[y];
  }
  return null;
}

function getPrevVal(ra: RatioAnalysis): number | null {
  const sorted = Object.keys(ra.values).sort().reverse();
  if (sorted.length >= 2 && ra.values[sorted[1]] !== null) return ra.values[sorted[1]];
  return null;
}

function findRatio(ratios: RatioAnalysis[], name: string): RatioAnalysis | undefined {
  return ratios.find((r) => r.name === name);
}

function getRatioVal(ratios: Record<string, Record<string, string>>, year: string, name: string): string {
  return ratios[year]?.[name] || "-";
}

function buildExpertAnalysis(
  report: FinancialAnalysisReport,
  ratios: Record<string, Record<string, string>>,
  _finData: FinancialDataInput
): ExpertAnalysis {
  const name = report.corpName || "해당 기업";
  const _industry = report.industryLabel || "일반";
  const years = [...report.years].sort();
  const latestYear = years[years.length - 1];
  const prevYear = years.length >= 2 ? years[years.length - 2] : null;
  const allStab = report.stabilityRatios;
  const allProf = report.profitabilityRatios;
  const allGrow = report.growthRatios;
  const allAct = report.activityRatios;
  const allRatios = [...allStab, ...allProf, ...allGrow, ...allAct];

  // Helper: 비율값 가져오기
  const rv = (yr: string, nm: string) => getRatioVal(ratios, yr, nm);
  const fr = (rname: string) => findRatio(allRatios, rname);

  // ====== 1. 경영진 요약 ======
  const execParts: string[] = [];

  // 부채비율 기반
  const debtRatio = fr("부채비율");
  const debtVal = debtRatio ? getLatestVal(debtRatio) : null;
  const equityRatio = fr("자기자본비율");
  const equityVal = equityRatio ? getLatestVal(equityRatio) : null;

  if (debtVal !== null) {
    if (debtVal > 200) {
      execParts.push(`${name}은(는) ${latestYear}년 부채비율 ${debtVal.toFixed(1)}%로 재무 레버리지가 높은 상태이며, 자본적정성 관리가 시급합니다.`);
    } else if (debtVal > 150) {
      execParts.push(`${name}은(는) ${latestYear}년 부채비율 ${debtVal.toFixed(1)}%로 업종 대비 다소 높은 수준의 레버리지를 운용하고 있습니다.`);
    } else {
      execParts.push(`${name}은(는) ${latestYear}년 부채비율 ${debtVal.toFixed(1)}%로 안정적인 재무구조를 유지하고 있습니다.`);
    }
  }

  const opMargin = fr("영업이익률");
  const opVal = opMargin ? getLatestVal(opMargin) : null;
  if (opVal !== null) {
    if (opVal < 0) {
      execParts.push(`본업 수익성이 적자 전환(영업이익률 ${opVal.toFixed(1)}%)되어 수익 구조 개선이 필요합니다.`);
    } else if (opVal > 15) {
      execParts.push(`영업이익률 ${opVal.toFixed(1)}%로 본업 경쟁력이 우수합니다.`);
    } else {
      execParts.push(`영업이익률 ${opVal.toFixed(1)}%로 본업 수익성은 ${opVal > 5 ? "양호" : "개선이 필요한"} 수준입니다.`);
    }
  }

  // 활동성 관련 경영진 요약 추가
  const tatRatio = fr("총자산회전율");
  const tatVal = tatRatio ? getLatestVal(tatRatio) : null;
  if (tatVal !== null) {
    if (tatVal > 1.5) {
      execParts.push(`총자산회전율 ${tatVal.toFixed(2)}회로 자산 활용 효율이 높습니다.`);
    } else if (tatVal < 0.5) {
      execParts.push(`총자산회전율 ${tatVal.toFixed(2)}회로 자산 활용 효율이 낮아 자산 구조 최적화가 필요합니다.`);
    }
  }

  const executiveSummary = execParts.join(" ") || `${name}의 재무 현황을 분석하였습니다.`;

  // ====== 2. 심층 진단 ======
  const diagParts: string[] = [];

  // 부채비율 변동 원인 분석
  if (debtRatio && prevYear) {
    const prevDebt = getPrevVal(debtRatio);
    if (prevDebt !== null && debtVal !== null) {
      const diff = debtVal - prevDebt;
      if (Math.abs(diff) > 10) {
        const borrowPrev = rv(prevYear, "총차입금");
        const borrowCur = rv(latestYear, "총차입금");
        const eqPrev = equityRatio ? getPrevVal(equityRatio) : null;
        const eqCur = equityVal;

        if (diff > 0) {
          const reasons: string[] = [];
          if (borrowPrev !== "-" && borrowCur !== "-") {
            const bp = parseFloat(borrowPrev.replace(/,/g, ""));
            const bc = parseFloat(borrowCur.replace(/,/g, ""));
            if (!isNaN(bp) && !isNaN(bc) && bc > bp) reasons.push("차입금 증가");
          }
          if (eqPrev !== null && eqCur !== null && eqCur < eqPrev) reasons.push("자기자본 감소");
          diagParts.push(`부채비율이 전기 대비 ${Math.abs(diff).toFixed(1)}%p 상승하였는데, 이는 ${reasons.length ? reasons.join(" 및 ") + "에" : "부채 증가에"} 기인합니다.`);
        } else {
          diagParts.push(`부채비율이 전기 대비 ${Math.abs(diff).toFixed(1)}%p 하락하여 재무구조가 개선되고 있습니다.`);
        }
      }
    }
  }

  // 수익성과 차입 관계
  const borrowDep = fr("차입금의존도");
  const borrowVal = borrowDep ? getLatestVal(borrowDep) : null;
  const roaRatio = fr("총자산이익률(ROA)");
  const roaVal = roaRatio ? getLatestVal(roaRatio) : null;

  if (borrowVal !== null && roaVal !== null) {
    if (borrowVal > 30 && roaVal < 3) {
      diagParts.push(`차입금의존도 ${borrowVal.toFixed(1)}% 대비 ROA ${roaVal.toFixed(1)}%로, 차입 비용 대비 자산 수익성이 낮아 이자보상배율에 대한 추가 검토가 필요합니다.`);
    } else if (borrowVal > 50) {
      diagParts.push(`차입금의존도가 ${borrowVal.toFixed(1)}%로 높아 금리 인상 시 이자 부담이 크게 확대될 구조입니다.`);
    }
  }

  // 이자보상배율 진단
  const icrRatio = fr("이자보상배율");
  const icrVal = icrRatio ? getLatestVal(icrRatio) : null;
  if (icrVal !== null) {
    if (icrVal < 1.0) {
      diagParts.push(`이자보상배율이 ${icrVal.toFixed(2)}배로 1배 미만이므로, 영업이익으로 이자비용을 감당하지 못하는 상태입니다. 채무불이행 위험에 대한 면밀한 검토가 필요합니다.`);
    } else if (icrVal < 3.0) {
      diagParts.push(`이자보상배율이 ${icrVal.toFixed(2)}배로 낮은 수준이며, 금리 인상 시 이자 부담이 급격히 증가할 수 있습니다.`);
    }
  }

  // 영업이익률과 매출 관계
  const revGrowth = fr("매출증가율");
  const revGrowthVal = revGrowth ? getLatestVal(revGrowth) : null;
  if (opVal !== null && revGrowthVal !== null) {
    if (revGrowthVal < -10 && opVal < 0) {
      diagParts.push(`매출 ${Math.abs(revGrowthVal).toFixed(1)}% 감소와 함께 영업적자가 발생하여, 고정비 부담이 수익성 악화를 가속화하고 있는 것으로 판단됩니다.`);
    } else if (revGrowthVal > 10 && opVal > 0) {
      diagParts.push(`매출 ${revGrowthVal.toFixed(1)}% 성장과 영업이익률 ${opVal.toFixed(1)}%를 동시에 달성하여, 외형 성장과 수익성이 동반되고 있습니다.`);
    } else if (revGrowthVal > 0 && opVal < 0) {
      diagParts.push(`매출은 증가하였으나 영업적자가 지속되고 있어, 매출 확대에도 불구하고 비용 통제가 미흡한 것으로 분석됩니다.`);
    }
  }

  // 활동성 지표 심층 진단
  const arRatio = fr("매출채권회전율");
  const arVal = arRatio ? getLatestVal(arRatio) : null;
  const invRatio = fr("재고자산회전율");
  const invVal = invRatio ? getLatestVal(invRatio) : null;

  if (arVal !== null && arVal < 4.0) {
    diagParts.push(`매출채권회전율이 ${arVal.toFixed(2)}회로 낮아, 대금 회수 기간이 길어지고 있습니다. 매출채권 부실화 가능성에 대한 점검이 필요합니다.`);
  }
  if (invVal !== null && invVal < 3.0) {
    diagParts.push(`재고자산회전율이 ${invVal.toFixed(2)}회로 낮아, 재고 체류 기간이 길어지고 있어 재고자산 진부화 리스크를 주시해야 합니다.`);
  }

  const gradeGroup = report.overallGrade;
  const isHighGrade = ["AAA", "AA", "A", "BBB"].includes(gradeGroup);
  if (diagParts.length === 0) {
    diagParts.push(`${latestYear}년 재무제표 기준 전반적인 재무구조는 ${isHighGrade ? "안정적" : "주의가 필요한"} 수준입니다.`);
  }
  const deepDiagnosis = diagParts.join(" ");

  // ====== 3. 리스크 평가 (여신 관점) ======
  const riskParts: string[] = [];

  // 유동성 리스크
  const currentRatio = fr("유동비율");
  const crVal = currentRatio ? getLatestVal(currentRatio) : null;
  if (crVal !== null && crVal < 100) {
    riskParts.push(`유동비율 ${crVal.toFixed(1)}%로 100% 미만이므로, 단기 채무 상환 시 유동성 부족이 발생할 수 있습니다. 유동자산의 질적 구성(현금성 비중, 매출채권 회수 가능성)에 대한 추가 확인이 필요합니다.`);
  }

  // 당좌비율 리스크
  const quickRatio = fr("당좌비율");
  const qrVal = quickRatio ? getLatestVal(quickRatio) : null;
  if (qrVal !== null && qrVal < 50) {
    riskParts.push(`당좌비율 ${qrVal.toFixed(1)}%로 매우 낮아, 재고자산 제외 시 단기 유동성이 심각하게 부족합니다.`);
  }

  // 차입 리스크
  if (borrowVal !== null && borrowVal > 40) {
    riskParts.push(`차입금의존도 ${borrowVal.toFixed(1)}%로, 기준금리 1%p 인상 시 이자비용이 순차입금(${rv(latestYear, "순차입금")}백만원) 대비 추가 부담이 예상됩니다.`);
  }

  // 이자보상배율 리스크
  if (icrVal !== null && icrVal < 1.0) {
    riskParts.push(`이자보상배율 ${icrVal.toFixed(2)}배로 이자비용 감당이 불가능한 상태이며, 지속 시 채무불이행 위험이 현실화될 수 있습니다.`);
  }

  // ROE vs 부채비율 — 과도한 레버리지 리스크
  const roeRatio = fr("자기자본이익률(ROE)");
  const roeVal = roeRatio ? getLatestVal(roeRatio) : null;
  if (debtVal !== null && roeVal !== null && debtVal > 200 && roeVal < 5) {
    riskParts.push(`부채비율 ${debtVal.toFixed(1)}% 대비 ROE ${roeVal.toFixed(1)}%로, 레버리지 효과가 미미하여 과잉 차입 상태일 가능성이 있습니다.`);
  }

  // 영업적자 리스크
  if (opVal !== null && opVal < 0) {
    const opPrevVal = opMargin ? getPrevVal(opMargin) : null;
    if (opPrevVal !== null && opPrevVal < 0) {
      riskParts.push(`2개년 연속 영업적자로 본업 경쟁력 약화가 우려됩니다. 영업현금흐름 확인이 필요합니다.`);
    } else {
      riskParts.push(`${latestYear}년 영업적자 전환에 대한 일시적 요인 여부를 확인해야 합니다.`);
    }
  }

  if (riskParts.length === 0) {
    riskParts.push(`현재 재무비율 기준 특별히 높은 리스크 요인은 발견되지 않으나, 업종 환경 변화에 대한 지속적 모니터링이 필요합니다.`);
  }
  const riskAssessment = riskParts.join(" ");

  // ====== 4. 여신 심사 의견 (NICE 10등급 기준) ======
  const loanParts: string[] = [];
  const grade = report.overallGrade;
  const gradeDesc = NICE_GRADE_DESC[grade] || "";

  if (["AAA", "AA"].includes(grade)) {
    loanParts.push(`종합 NICE 신용등급 ${grade}(${gradeDesc.substring(0, 20)}...)로, 재무 안정성 및 수익성이 최우량 수준이며 여신 승인에 매우 긍정적입니다.`);
    loanParts.push(`다만, 담보 가치 대비 여신 한도의 적정성과 향후 차입 증가 계획을 확인할 필요가 있습니다.`);
  } else if (["A", "BBB"].includes(grade)) {
    loanParts.push(`종합 NICE 신용등급 ${grade}로, 신용능력이 양호하여 여신 승인이 가능한 수준입니다.`);
    if (borrowVal !== null && borrowVal > 30) {
      loanParts.push(`차입금의존도(${borrowVal.toFixed(1)}%)가 다소 높으므로, 상환 스케줄 및 담보 추가 확보 조건을 검토하시기 바랍니다.`);
    }
  } else if (["BB", "B"].includes(grade)) {
    loanParts.push(`종합 NICE 신용등급 ${grade}로, 신용능력이 보통 수준이며 여신 실행 시 추가 조건 부과가 권고됩니다.`);
    const conditions: string[] = [];
    if (debtVal !== null && debtVal > 150) conditions.push("부채비율 관리 조건(목표치 설정)");
    if (opVal !== null && opVal < 0) conditions.push("영업 정상화 계획 제출");
    if (borrowVal !== null && borrowVal > 40) conditions.push("추가 담보 확보");
    if (icrVal !== null && icrVal < 3) conditions.push("이자보상배율 개선 계획");
    if (conditions.length > 0) {
      loanParts.push(`권고 조건: ${conditions.join(", ")}.`);
    }
  } else if (["CCC", "CC"].includes(grade)) {
    loanParts.push(`종합 NICE 신용등급 ${grade}로, 거래안정성 저하가 우려되어 여신 실행에 상당한 주의가 필요합니다.`);
    loanParts.push(`충분한 담보 확보, 대표이사 연대보증, 분할 상환 조건 등 리스크 완화 장치를 반드시 확보하고, 여신 심사위원회의 별도 심의를 권고합니다.`);
  } else {
    // C, D
    loanParts.push(`종합 NICE 신용등급 ${grade}로, 신용위험이 매우 높아 여신 실행이 극히 제한적입니다.`);
    loanParts.push(`신규 여신은 원칙적으로 불가하며, 기존 여신에 대해서도 회수 방안 검토가 필요합니다. 불가피한 경우 충분한 담보(부동산 등 실물담보), 대표이사 연대보증, 단기 분할 상환 등 최대한의 리스크 완화 장치가 필수적입니다.`);
  }
  const loanOpinion = loanParts.join(" ");

  // ====== 5. 신용 전망 ======
  const outlookParts: string[] = [];
  const worseningCount = allRatios.filter((r) => r.trend === "악화").length;
  const improvingCount = allRatios.filter((r) => r.trend === "개선").length;

  if (worseningCount >= 3 && improvingCount <= 1) {
    outlookParts.push(`신용 전망: 부정적(Negative).`);
    outlookParts.push(`다수 지표의 악화 추세가 지속되고 있어, 향후 1~2년간 재무 건전성이 추가 하락할 가능성이 있습니다.`);
  } else if (improvingCount >= 3 && worseningCount <= 1) {
    outlookParts.push(`신용 전망: 긍정적(Positive).`);
    outlookParts.push(`주요 지표의 개선 추세가 뚜렷하여 향후 재무 등급 상향 가능성이 있습니다.`);
  } else {
    outlookParts.push(`신용 전망: 안정적(Stable).`);
    outlookParts.push(`현 수준의 재무구조가 단기간 내 급격히 변동할 가능성은 낮으나, 업종 환경 변화에 따른 모니터링이 필요합니다.`);
  }

  if (opVal !== null && opVal < -10) {
    outlookParts.push(`다만, 영업적자 폭이 큰 만큼 영업 정상화 여부가 향후 신용도 결정의 핵심 변수입니다.`);
  }
  const creditOutlook = outlookParts.join(" ");

  // ====== 6. 핵심 지표 내러티브 ======
  const narrParts: string[] = [];

  // 가장 주목할 지표 2-3개 선정
  interface MetricNote { name: string; priority: number; text: string }
  const metricNotes: MetricNote[] = [];

  if (debtVal !== null && (debtVal > 200 || debtVal < 50)) {
    metricNotes.push({
      name: "부채비율",
      priority: debtVal > 200 ? 10 : 3,
      text: debtVal > 200
        ? `부채비율(${debtVal.toFixed(1)}%)은 업종 평균을 크게 상회하고 있어, 자본 확충 없이는 추가 차입이 어려울 수 있습니다. 유상증자, 이익잉여금 적립 등 자본 확충 방안을 모니터링해야 합니다.`
        : `부채비율(${debtVal.toFixed(1)}%)이 매우 낮아 추가 차입 여력이 충분합니다.`,
    });
  }

  if (borrowVal !== null && borrowVal > 40) {
    metricNotes.push({
      name: "차입금의존도",
      priority: 8,
      text: `차입금의존도(${borrowVal.toFixed(1)}%)가 높아 금리 변동에 민감한 구조입니다. 총차입금(${rv(latestYear, "총차입금")}백만원), 순차입금(${rv(latestYear, "순차입금")}백만원) 규모를 감안하면, 금리 1%p 인상 시 연간 이자 부담 증가분을 영업이익으로 감당할 수 있는지가 핵심입니다.`,
    });
  }

  if (icrVal !== null && icrVal < 1.0) {
    metricNotes.push({
      name: "이자보상배율",
      priority: 10,
      text: `이자보상배율(${icrVal.toFixed(2)}배)이 1배 미만으로, 영업이익만으로는 이자비용을 감당할 수 없는 상태입니다. 추가 차입 시 상환 불능 리스크가 현실화될 수 있습니다.`,
    });
  }

  if (opVal !== null && opVal < 0) {
    metricNotes.push({
      name: "영업이익률",
      priority: 9,
      text: `영업이익률(${opVal.toFixed(1)}%)이 적자 상태로, 본업 수익 창출 능력이 약화되어 있습니다. 대출 상환 재원의 근본인 영업현금흐름이 부족할 수 있어, 비영업 수익원(자산 매각, 투자 수익 등)의 지속 가능성을 확인해야 합니다.`,
    });
  } else if (opVal !== null && opVal > 20) {
    metricNotes.push({
      name: "영업이익률",
      priority: 5,
      text: `영업이익률(${opVal.toFixed(1)}%)이 업종 대비 높은 수준으로, 본업 경쟁력이 확인됩니다. 안정적인 영업현금흐름이 대출 상환의 든든한 재원이 됩니다.`,
    });
  }

  if (revGrowthVal !== null && Math.abs(revGrowthVal) > 15) {
    metricNotes.push({
      name: "매출증가율",
      priority: 6,
      text: revGrowthVal > 0
        ? `매출이 전기 대비 ${revGrowthVal.toFixed(1)}% 성장하여 사업 확장이 활발합니다. 다만 급격한 외형 성장이 자산 건전성에 미치는 영향을 함께 모니터링해야 합니다.`
        : `매출이 전기 대비 ${Math.abs(revGrowthVal).toFixed(1)}% 감소하여 사업 축소 우려가 있습니다. 매출 감소의 구조적 원인(시장 축소 vs 일시적 요인)을 파악해야 합니다.`,
    });
  }

  // 활동성 관련 내러티브
  if (arVal !== null && arVal < 3.0) {
    metricNotes.push({
      name: "매출채권회전율",
      priority: 7,
      text: `매출채권회전율(${arVal.toFixed(2)}회)이 낮아, 평균 회수 기간이 ${(365 / arVal).toFixed(0)}일 수준입니다. 매출채권의 장기 미회수분에 대한 대손 가능성을 점검해야 합니다.`,
    });
  }

  metricNotes.sort((a, b) => b.priority - a.priority);
  const topMetrics = metricNotes.slice(0, 3);
  if (topMetrics.length > 0) {
    for (const m of topMetrics) narrParts.push(m.text);
  } else {
    narrParts.push(`${latestYear}년 기준 주요 재무비율은 전반적으로 업종 평균 범위 내에서 움직이고 있으며, 특별히 주목할 만한 이상 징후는 발견되지 않았습니다.`);
  }
  const keyMetricsNarrative = narrParts.join(" ");

  return {
    executiveSummary,
    deepDiagnosis,
    riskAssessment,
    loanOpinion,
    creditOutlook,
    keyMetricsNarrative,
    aiModel: "NICE BizLine 기반 전문가 분석 엔진 v3.0",
  };
}

// ============================================================
// 메인 분석 함수
// ============================================================

export function analyzeFinancial(
  finData: FinancialDataInput
): FinancialAnalysisReport | null {
  if (!finData) return null;

  const report: FinancialAnalysisReport = {
    corpName: "",
    ceoNm: "",
    bizrNo: "",
    adres: "",
    estDt: "",
    industry: "",
    industryLabel: "",
    corpCls: "",
    years: [],
    fsType: "",
    stabilityRatios: [],
    profitabilityRatios: [],
    growthRatios: [],
    activityRatios: [],
    overallGrade: "",
    overallSummary: "",
    riskFactors: [],
    opportunityFactors: [],
    analystOpinion: "",
  };

  // --- 기업 개요 ---
  if (finData.company) {
    const ci = finData.company;
    report.corpName = ci.corpName || "";
    report.ceoNm = ci.ceoNm || "";
    report.bizrNo = ci.bizrNo || "";
    report.adres = ci.adres || "";
    report.estDt = ci.estDt || "";
    report.corpCls = ci.corpCls || "";

    const [industryKey, industryLabel] = detectIndustry(
      ci.indutyCode || "",
      ci.corpName || ""
    );
    report.industry = industryKey;
    report.industryLabel = industryLabel;
  } else {
    report.industry = "default";
    report.industryLabel = "일반 기업";
  }

  const bench =
    INDUSTRY_BENCHMARKS[report.industry] || INDUSTRY_BENCHMARKS["default"];
  report.years = finData.years || [];

  // OFS 우선, 없으면 CFS
  let ratios: Record<string, Record<string, string>>;
  if (finData.hasOfs) {
    ratios = finData.ratiosOfs;
    report.fsType = "개별";
  } else if (finData.hasCfs) {
    ratios = finData.ratiosCfs;
    report.fsType = "연결";
  } else {
    return report; // 데이터 없음
  }

  const fsType: "ofs" | "cfs" = finData.hasOfs ? "ofs" : "cfs";

  // 추가 비율 계산 (당좌비율, 이자보상배율, 매출총이익률, 순이익률)
  const additionalData = calcAdditionalRatios(finData, report.years, fsType);

  // 활동성 비율 계산
  const activityData = calcActivityRatios(finData, report.years, fsType);

  // --- 안정성 지표 ---
  const stabilityNames: [string, boolean][] = [
    ["부채비율", false],
    ["유동비율", true],
    ["자기자본비율", true],
    ["차입금의존도", false],
  ];
  for (const [rname, higherIsBetter] of stabilityNames) {
    const ra = buildRatioAnalysis(
      rname,
      "안정성",
      ratios,
      report.years,
      bench[rname] ?? 0,
      higherIsBetter
    );
    report.stabilityRatios.push(ra);
  }

  // 당좌비율 (계산된 값)
  const quickRatioRa = buildComputedRatioAnalysis(
    "당좌비율", "안정성", additionalData, report.years,
    bench["당좌비율"] ?? 100.0, true, "pct"
  );
  report.stabilityRatios.push(quickRatioRa);

  // 이자보상배율 (계산된 값, times 단위)
  const icrRa = buildComputedRatioAnalysis(
    "이자보상배율", "안정성", additionalData, report.years,
    bench["이자보상배율"] ?? 5.0, true, "times"
  );
  report.stabilityRatios.push(icrRa);

  // --- 수익성 지표 ---
  const profitNames: [string, boolean][] = [
    ["영업이익률", true],
    ["총자산이익률(ROA)", true],
    ["자기자본이익률(ROE)", true],
  ];
  for (const [rname, higherIsBetter] of profitNames) {
    const ra = buildRatioAnalysis(
      rname,
      "수익성",
      ratios,
      report.years,
      bench[rname] ?? 0,
      higherIsBetter
    );
    report.profitabilityRatios.push(ra);
  }

  // 매출총이익률 (계산된 값)
  const grossMarginRa = buildComputedRatioAnalysis(
    "매출총이익률", "수익성", additionalData, report.years,
    bench["매출총이익률"] ?? 25.0, true, "pct"
  );
  report.profitabilityRatios.push(grossMarginRa);

  // 순이익률 (계산된 값)
  const netMarginRa = buildComputedRatioAnalysis(
    "순이익률", "수익성", additionalData, report.years,
    bench["순이익률"] ?? 4.0, true, "pct"
  );
  report.profitabilityRatios.push(netMarginRa);

  // --- 성장성 지표 ---
  // 매출증가율은 calcRatios에서 이미 계산되므로 직접 읽음
  const revenueGrowthRa = buildRatioAnalysis(
    "매출증가율",
    "성장성",
    ratios,
    report.years,
    bench["매출증가율"] ?? 5.0,
    true
  );
  report.growthRatios.push(revenueGrowthRa);

  const growthData = calcGrowthRatios(finData, report.years, fsType);

  const growthNames: [string, boolean][] = [
    ["영업이익증가율", true],
    ["총자산증가율", true],
  ];

  for (const [rname, higherIsBetter] of growthNames) {
    const ra: RatioAnalysis = {
      name: rname,
      category: "성장성",
      values: {},
      valuesStr: {},
      benchmark: bench[rname] ?? 0,
      benchmarkLabel: `업종 평균 ${fmtPct(bench[rname] ?? 0)}`,
      trend: "",
      trendIcon: "",
      vsBenchmark: "",
      diagnosis: "",
      riskLevel: "",
    };

    for (const y of [...report.years].sort()) {
      if (y in growthData && growthData[y][rname] !== null && growthData[y][rname] !== undefined) {
        const val = growthData[y][rname]!;
        ra.values[y] = val;
        ra.valuesStr[y] = fmtPct(val);
      } else {
        ra.valuesStr[y] = "-";
      }
    }

    [ra.trend, ra.trendIcon] = judgeTrend(ra.values, higherIsBetter);

    let latestVal: number | null = null;
    for (const y of Object.keys(ra.values).sort().reverse()) {
      if (ra.values[y] !== null && ra.values[y] !== undefined) {
        latestVal = ra.values[y];
        break;
      }
    }

    ra.vsBenchmark = judgeVsBenchmark(latestVal, ra.benchmark, higherIsBetter);
    ra.diagnosis = getDiagnosis(
      rname,
      ra.vsBenchmark,
      ra.trend,
      ra.trendIcon,
      latestVal
    );
    ra.riskLevel = getRiskLevel(ra.vsBenchmark, ra.trend);
    report.growthRatios.push(ra);
  }

  // --- 활동성 지표 ---
  const activityNames: [string, boolean][] = [
    ["총자산회전율", true],
    ["재고자산회전율", true],
    ["매출채권회전율", true],
  ];
  for (const [rname, higherIsBetter] of activityNames) {
    const ra = buildComputedRatioAnalysis(
      rname, "활동성", activityData, report.years,
      bench[rname] ?? 1.0, higherIsBetter, "times"
    );
    report.activityRatios.push(ra);
  }

  // --- 종합 판정 (NICE 가중평균 스코어링) ---
  const higherIsBetterMap: Record<string, boolean> = {
    "부채비율": false,
    "유동비율": true,
    "자기자본비율": true,
    "차입금의존도": false,
    "당좌비율": true,
    "이자보상배율": true,
    "영업이익률": true,
    "총자산이익률(ROA)": true,
    "자기자본이익률(ROE)": true,
    "매출총이익률": true,
    "순이익률": true,
    "매출증가율": true,
    "매출액증가율": true,
    "영업이익증가율": true,
    "총자산증가율": true,
    "총자산회전율": true,
    "재고자산회전율": true,
    "매출채권회전율": true,
  };

  const stabScore = calcCategoryScore(report.stabilityRatios, bench, higherIsBetterMap);
  const profScore = calcCategoryScore(report.profitabilityRatios, bench, higherIsBetterMap);
  const growScore = calcCategoryScore(report.growthRatios, bench, higherIsBetterMap);
  const actScore = calcCategoryScore(report.activityRatios, bench, higherIsBetterMap);

  // 가중평균: 안정성 30%, 수익성 30%, 성장성 20%, 활동성 20%
  const weightedScore = stabScore * 0.3 + profScore * 0.3 + growScore * 0.2 + actScore * 0.2;

  const allRatios = [
    ...report.stabilityRatios,
    ...report.profitabilityRatios,
    ...report.growthRatios,
    ...report.activityRatios,
  ];
  const total = allRatios.filter((r) => r.vsBenchmark !== "판단불가").length;

  if (total === 0) {
    report.overallGrade = "-";
  } else {
    report.overallGrade = scoreToNiceGrade(weightedScore);
  }

  const gradeDescMap: Record<string, string> = {
    AAA: "최우량",
    AA: "우량",
    A: "양호",
    BBB: "양호(주의)",
    BB: "보통",
    B: "보통(주의)",
    CCC: "보통이하",
    CC: "취약",
    C: "최하위",
    D: "위험",
  };
  report.overallSummary = buildOverallSummary(
    report,
    gradeDescMap[report.overallGrade] || ""
  );

  // 리스크 & 기회 요인
  for (const r of allRatios) {
    if (r.riskLevel === "높음") {
      report.riskFactors.push(`${r.name} ${r.vsBenchmark} (${r.trend} 추세)`);
    } else if (r.riskLevel === "보통" && r.vsBenchmark === "주의") {
      report.riskFactors.push(`${r.name} 업종 평균 하회`);
    }
    if (r.vsBenchmark === "양호" && r.trend === "개선") {
      report.opportunityFactors.push(`${r.name} 양호 & 개선 추세`);
    }
  }

  report.analystOpinion = buildAnalystOpinion(report);

  // 전문가급 심층 분석
  report.expertAnalysis = buildExpertAnalysis(report, ratios, finData);

  return report;
}
