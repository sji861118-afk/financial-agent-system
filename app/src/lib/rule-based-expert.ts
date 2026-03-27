/**
 * 룰 기반 전문가 소견 생성기
 * ==============================
 * Gemini/GPT API 없이, financial-analyzer의 분석 결과를 기반으로
 * 동일한 AIAnalysisResult 구조의 전문가 소견을 생성합니다.
 */

import type { FinancialAnalysisReport, RatioAnalysis } from "./financial-analyzer";

export interface RuleBasedExpertInput {
  corpName: string;
  industryLabel: string;
  years: string[];
  ratios: Record<string, Record<string, string>>;
  bsItems: Array<Record<string, string>>;
  isItems: Array<Record<string, string>>;
  ruleBasedReport: FinancialAnalysisReport;
}

export interface ExpertResult {
  executiveSummary: string;
  deepDiagnosis: string;
  riskAssessment: string;
  loanOpinion: string;
  creditOutlook: string;
  keyMetricsNarrative: string;
  aiModel: string;
}

// 등급별 신용 수준 설명
const GRADE_LEVEL: Record<string, { level: string; desc: string }> = {
  AAA: { level: "최우량", desc: "최상위 신용능력을 갖추고 있으며 환경변화에 충분한 대처가 가능" },
  AA: { level: "우량", desc: "우수한 신용능력을 갖추고 있으며 환경변화에 적절한 대처가 가능" },
  A: { level: "양호", desc: "양호한 신용능력을 보유하나 환경변화에 대한 대처능력이 일부 제한적" },
  BBB: { level: "양호(하)", desc: "양호한 신용능력을 보유하나 경기악화 시 거래안정성 저하 가능성 존재" },
  BB: { level: "보통", desc: "보통 수준의 신용능력으로 경기악화 시 거래안정성 저하 우려" },
  B: { level: "보통(하)", desc: "보통 수준의 신용능력이나 환경악화 시 거래안정성 저하 가능성이 높음" },
  CCC: { level: "주의", desc: "보통 이하의 신용능력으로 거래안정성 저하가 예상되어 주의 필요" },
  CC: { level: "위험", desc: "낮은 신용능력으로 거래의 안정성이 매우 낮은 상태" },
  C: { level: "최하위", desc: "최하위 신용능력으로 거래위험 발생 가능성이 매우 높음" },
  D: { level: "부도", desc: "신용위험이 실제 발생하였거나 이에 준하는 상태" },
};

function getLatestYear(years: string[]): string {
  return years.sort().reverse()[0] || "";
}

function getRatioValue(ratios: RatioAnalysis[], name: string, year: string): number | null {
  const ratio = ratios.find(r => r.name === name);
  return ratio?.values?.[year] ?? null;
}

function getRatioStr(ratios: RatioAnalysis[], name: string, year: string): string {
  const ratio = ratios.find(r => r.name === name);
  return ratio?.valuesStr?.[year] || "-";
}

function countByRiskLevel(ratios: RatioAnalysis[], level: string): number {
  return ratios.filter(r => r.riskLevel === level).length;
}

export function generateRuleBasedExpert(input: RuleBasedExpertInput): ExpertResult {
  const { corpName, industryLabel, ruleBasedReport: rpt } = input;
  const latestYear = getLatestYear(rpt.years);
  const prevYear = rpt.years.sort().reverse()[1] || "";

  const grade = rpt.overallGrade;
  const gradeInfo = GRADE_LEVEL[grade] || GRADE_LEVEL["B"];

  // 모든 비율 통합
  const allRatios = [
    ...rpt.stabilityRatios,
    ...rpt.profitabilityRatios,
    ...rpt.growthRatios,
    ...rpt.activityRatios,
  ];

  const cautionCount = countByRiskLevel(allRatios, "주의");
  const normalCount = countByRiskLevel(allRatios, "보통");
  const goodCount = countByRiskLevel(allRatios, "양호");

  // 주요 비율 수치
  const debtRatio = getRatioStr(rpt.stabilityRatios, "부채비율", latestYear);
  const currentRatio = getRatioStr(rpt.stabilityRatios, "유동비율", latestYear);
  const equityRatio = getRatioStr(rpt.stabilityRatios, "자기자본비율", latestYear);
  const roa = getRatioStr(rpt.profitabilityRatios, "총자산순이익률(ROA)", latestYear);
  const roe = getRatioStr(rpt.profitabilityRatios, "자기자본순이익률(ROE)", latestYear);
  const operMargin = getRatioStr(rpt.profitabilityRatios, "영업이익률", latestYear);
  const netMargin = getRatioStr(rpt.profitabilityRatios, "순이익률", latestYear);
  const salesGrowth = getRatioStr(rpt.growthRatios, "매출액증가율", latestYear);

  // 안정성 추세
  const debtTrend = rpt.stabilityRatios.find(r => r.name === "부채비율")?.trend || "보합";
  const currentTrend = rpt.stabilityRatios.find(r => r.name === "유동비율")?.trend || "보합";

  // 수익성 추세
  const roaTrend = rpt.profitabilityRatios.find(r => r.name === "총자산순이익률(ROA)")?.trend || "보합";

  // ── 1. 경영진 요약 ──
  const executiveSummary = `${corpName}(${industryLabel})은 ${latestYear}년 기준 재무건전성 종합등급 ${grade}(${gradeInfo.level})로 평가됩니다. `
    + `${gradeInfo.desc}한 것으로 분석되며, `
    + `주요 재무지표 ${allRatios.length}개 항목 중 양호 ${goodCount}건, 보통 ${normalCount}건, 주의 ${cautionCount}건으로 나타났습니다.`;

  // ── 2. 심층 진단 ──
  const stabilityDiag = rpt.stabilityRatios.map(r => `${r.name} ${r.valuesStr[latestYear] || "-"}(${r.vsBenchmark}, ${r.trend})`).join(", ");
  const profitDiag = rpt.profitabilityRatios.map(r => `${r.name} ${r.valuesStr[latestYear] || "-"}(${r.vsBenchmark})`).join(", ");
  const growthDiag = rpt.growthRatios.map(r => `${r.name} ${r.valuesStr[latestYear] || "-"}(${r.trend})`).join(", ");

  const deepDiagnosis = `[안정성] ${stabilityDiag}. `
    + `부채비율은 ${debtRatio}로 ${debtTrend} 추세이며, 유동비율은 ${currentRatio}로 ${currentTrend} 추세를 보이고 있습니다. `
    + `[수익성] ${profitDiag}. `
    + `영업이익률 ${operMargin}, 순이익률 ${netMargin}으로 `
    + (parseFloat(operMargin) > 5 ? "안정적인 수익구조를 유지하고 있습니다. " : "수익성 개선이 필요한 상황입니다. ")
    + `[성장성] ${growthDiag}. `
    + `매출액증가율 ${salesGrowth}로 `
    + (parseFloat(salesGrowth) > 0 ? "성장세를 보이고 있습니다." : "역성장 국면에 있어 주의가 필요합니다.");

  // ── 3. 리스크 평가 ──
  const riskItems = rpt.riskFactors.length > 0
    ? rpt.riskFactors.map((f, i) => `${i + 1}) ${f}`).join(" ")
    : "현재 특별한 위험요인이 감지되지 않았습니다.";
  const oppItems = rpt.opportunityFactors.length > 0
    ? rpt.opportunityFactors.map((f, i) => `${i + 1}) ${f}`).join(" ")
    : "";

  const riskAssessment = `[위험요인] ${riskItems} `
    + (oppItems ? `[긍정요인] ${oppItems} ` : "")
    + `종합적으로, ${cautionCount}개 지표가 주의 수준으로 `
    + (cautionCount >= 3 ? "다수의 재무지표에서 리스크 신호가 감지되어 면밀한 모니터링이 필요합니다." :
       cautionCount >= 1 ? "일부 지표에서 리스크가 존재하나 전반적으로 관리 가능한 수준입니다." :
       "전반적으로 양호한 재무 건전성을 유지하고 있습니다.");

  // ── 4. 여신 심사 의견 ──
  const gradeNum = ["AAA","AA","A","BBB","BB","B","CCC","CC","C","D"].indexOf(grade);
  let loanOpinion: string;
  if (gradeNum <= 2) { // AAA ~ A
    loanOpinion = `${corpName}은 ${grade} 등급으로 재무건전성이 ${gradeInfo.level} 수준입니다. `
      + `부채비율 ${debtRatio}, 자기자본비율 ${equityRatio}로 재무구조가 안정적이며, `
      + `ROA ${roa}, ROE ${roe}로 수익 창출 능력이 우수합니다. `
      + `여신 취급 시 재무적 위험은 낮은 것으로 판단됩니다.`;
  } else if (gradeNum <= 4) { // BBB ~ BB
    loanOpinion = `${corpName}은 ${grade} 등급으로 재무건전성이 ${gradeInfo.level} 수준입니다. `
      + `부채비율 ${debtRatio}, 유동비율 ${currentRatio}로 `
      + (cautionCount > 0 ? `일부 재무지표에서 주의가 필요하나, ` : `안정적인 재무구조를 보이고 있으며, `)
      + `영업이익률 ${operMargin} 수준의 사업 수익성을 보유하고 있습니다. `
      + `여신 취급 시 담보 및 상환 계획에 대한 면밀한 검토가 권고됩니다.`;
  } else { // B 이하
    loanOpinion = `${corpName}은 ${grade} 등급으로 재무건전성이 ${gradeInfo.level} 수준입니다. `
      + `부채비율 ${debtRatio}, 유동비율 ${currentRatio}로 재무구조의 안정성이 우려되며, `
      + `수익성 지표(ROA ${roa}, 영업이익률 ${operMargin})도 `
      + (parseFloat(roa) < 0 ? "적자 상태를 보이고 있습니다. " : "개선이 필요한 수준입니다. ")
      + `여신 취급 시 충분한 담보 확보와 철저한 사후 관리가 필수적입니다.`;
  }

  // ── 5. 신용 전망 ──
  const improvingCount = allRatios.filter(r => r.trend === "상승" || r.trend === "개선").length;
  const worseningCount = allRatios.filter(r => r.trend === "하락" || r.trend === "악화").length;

  let outlook: string;
  if (improvingCount > worseningCount + 2) {
    outlook = `주요 재무지표가 전반적으로 개선 추세(${improvingCount}건 개선, ${worseningCount}건 악화)를 보이고 있어 향후 재무건전성 개선이 기대됩니다.`;
  } else if (worseningCount > improvingCount + 2) {
    outlook = `주요 재무지표가 전반적으로 악화 추세(${worseningCount}건 악화, ${improvingCount}건 개선)를 보이고 있어 향후 재무건전성 저하가 우려됩니다.`;
  } else {
    outlook = `주요 재무지표가 개선(${improvingCount}건)과 악화(${worseningCount}건)가 혼재하고 있어 안정적인 수준을 유지하고 있으나 지속적인 모니터링이 필요합니다.`;
  }

  const creditOutlook = `${latestYear}년 실적 기준, ${corpName}의 신용등급 전망은 ${grade}(${gradeInfo.level})입니다. `
    + outlook + ` `
    + (rpt.riskFactors.length > 0
      ? `특히 ${rpt.riskFactors[0]}에 대한 관리가 향후 등급 변동의 핵심 요인이 될 것으로 판단됩니다.`
      : `현재의 재무구조를 유지한다면 안정적인 신용 수준이 지속될 것으로 전망됩니다.`);

  // ── 6. 핵심 지표 내러티브 ──
  const keyMetricsNarrative = `${corpName}의 ${latestYear}년 핵심 재무지표를 살펴보면, `
    + `부채비율 ${debtRatio}(벤치마크 대비 ${rpt.stabilityRatios.find(r => r.name === "부채비율")?.vsBenchmark || "-"}), `
    + `유동비율 ${currentRatio}(${rpt.stabilityRatios.find(r => r.name === "유동비율")?.vsBenchmark || "-"}), `
    + `자기자본비율 ${equityRatio}로 재무 안정성을 보여주고 있습니다. `
    + `수익성 측면에서는 영업이익률 ${operMargin}, ROA ${roa}, ROE ${roe}를 기록하였으며, `
    + `성장성 측면에서는 매출액증가율 ${salesGrowth}을 나타내고 있습니다. `
    + `총 ${allRatios.length}개 분석 지표 중 ${goodCount}개가 양호, ${normalCount}개가 보통, ${cautionCount}개가 주의 수준으로 평가되었습니다.`;

  return {
    executiveSummary,
    deepDiagnosis,
    riskAssessment,
    loanOpinion,
    creditOutlook,
    keyMetricsNarrative,
    aiModel: "자체분석 v1.0",
  };
}
