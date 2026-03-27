/**
 * Gemini AI 재무분석 전문가 모듈
 * ================================
 * Google Gemini 2.5 Pro를 활용한 전문가급 재무분석 소견 생성
 * GPT-4o와 병행 실행하여 비교 분석 제공
 */

import type { FinancialAnalysisReport } from "./financial-analyzer";
import type { AIAnalysisResult } from "./ai-financial-analyst";

interface GeminiAnalysisInput {
  corpName: string;
  industryLabel: string;
  years: string[];
  ratios: Record<string, Record<string, string>>;
  bsItems: Array<Record<string, string>>;
  isItems: Array<Record<string, string>>;
  ruleBasedReport: FinancialAnalysisReport;
}

const SYSTEM_PROMPT = `당신은 20년 경력의 기업 여신심사 재무분석 전문가입니다.

## 역할
- 기업 재무제표를 분석하여 여신(대출) 심사에 필요한 전문가 소견을 작성합니다.
- 한국 금융기관의 여신심사 기준과 한국은행 기업경영분석 벤치마크에 정통합니다.
- 재무비율의 단순 나열이 아닌, 비율 간 연관관계와 구조적 원인을 분석합니다.

## 분석 관점
1. **안정성**: 부채비율, 유동비율, 자기자본비율, 차입금의존도 → 채무상환능력, 재무건전성
2. **수익성**: 영업이익률, ROA, ROE → 본업 경쟁력, 자산 효율성
3. **성장성**: 매출증가율, 총자산증가율 → 사업 성장 모멘텀
4. **차입구조**: 총차입금, 순차입금, 차입금의존도 → 금리 민감도, 상환 부담

## 작성 원칙
- 숫자를 인용할 때는 반드시 연도와 함께 명시 (예: "2024년 부채비율 192.3%")
- 추세 변화의 원인을 추론하고 구조적 의미를 설명
- 긍정적/부정적 요인을 균형있게 기술
- 여신 심사관이 의사결정에 활용할 수 있는 구체적 의견 제시
- 한국어로 작성, 금융 전문 용어 사용`;

function buildUserPrompt(input: GeminiAnalysisInput): string {
  const { corpName, industryLabel, years, ratios, ruleBasedReport } = input;

  const sortedYears = [...years].sort();
  const allRatioNames = new Set<string>();
  for (const yr of sortedYears) {
    if (ratios[yr]) {
      for (const k of Object.keys(ratios[yr])) allRatioNames.add(k);
    }
  }

  let ratioTable = `| 지표 | ${sortedYears.map((y) => y + "년").join(" | ")} |\n`;
  ratioTable += `|------|${sortedYears.map(() => "------").join("|")}|\n`;
  for (const name of allRatioNames) {
    ratioTable += `| ${name} | ${sortedYears.map((y) => ratios[y]?.[name] || "-").join(" | ")} |\n`;
  }

  const ruleGrade = ruleBasedReport.overallGrade;
  const ruleRisks = ruleBasedReport.riskFactors.join(", ") || "없음";
  const ruleOpportunities = ruleBasedReport.opportunityFactors.join(", ") || "없음";

  const bsSummary = input.bsItems.slice(0, 15).map((item) => {
    const vals = sortedYears.map((y) => `${y}: ${item[y] || "-"}`).join(", ");
    return `  ${item.account}: ${vals}`;
  }).join("\n");

  const isSummary = input.isItems.slice(0, 15).map((item) => {
    const vals = sortedYears.map((y) => `${y}: ${item[y] || "-"}`).join(", ");
    return `  ${item.account}: ${vals}`;
  }).join("\n");

  return `## 분석 대상
- 기업명: ${corpName}
- 업종: ${industryLabel}
- 분석 기간: ${sortedYears.join("~")}년

## 주요 재무비율
${ratioTable}

## 재무상태표 주요 항목 (단위: 백만원)
${bsSummary}

## 손익계산서 주요 항목 (단위: 백만원)
${isSummary}

## 룰 기반 사전 분석 결과
- 종합 등급: ${ruleGrade}
- 위험 요인: ${ruleRisks}
- 긍정 요인: ${ruleOpportunities}

---

위 재무데이터를 바탕으로 아래 항목을 작성해주세요. 각 항목은 반드시 해당 제목으로 시작해야 합니다.

### [경영진 요약]
2-3문장으로 기업의 재무 상태를 요약하세요. 핵심 강점과 약점을 포함하세요.

### [심층 진단]
재무비율 간 연관관계를 분석하세요. 예: 부채비율 상승의 원인이 차입금 증가인지 자본 감소인지, 영업이익률 변동이 매출 변동 때문인지 비용 구조 변화인지 등. 3-5문장.

### [리스크 평가]
여신(대출) 관점에서 주요 리스크 요인을 평가하세요. 금리 민감도, 유동성 리스크, 업종 리스크, 차입 상환 능력 등. 3-5문장.

### [여신 심사 의견]
여신심사관 입장에서 이 기업에 대한 대출 승인/조건부 승인/유의 의견을 제시하세요. 구체적인 조건이나 유의사항을 포함하세요. 2-4문장.

### [신용 전망]
향후 1-2년 신용 전망을 제시하세요 (긍정적/안정적/부정적 + 근거). 2-3문장.

### [핵심 지표 내러티브]
가장 주목해야 할 2-3개 지표를 선정하고, 왜 중요한지 여신 관점에서 설명하세요. 3-5문장.`;
}

function parseGeminiResponse(text: string): Partial<AIAnalysisResult> {
  const sections: Record<string, string> = {};
  const patterns = [
    { key: "executiveSummary", regex: /###?\s*\[경영진 요약\]\s*\n([\s\S]*?)(?=###?\s*\[|$)/ },
    { key: "deepDiagnosis", regex: /###?\s*\[심층 진단\]\s*\n([\s\S]*?)(?=###?\s*\[|$)/ },
    { key: "riskAssessment", regex: /###?\s*\[리스크 평가\]\s*\n([\s\S]*?)(?=###?\s*\[|$)/ },
    { key: "loanOpinion", regex: /###?\s*\[여신 심사 의견\]\s*\n([\s\S]*?)(?=###?\s*\[|$)/ },
    { key: "creditOutlook", regex: /###?\s*\[신용 전망\]\s*\n([\s\S]*?)(?=###?\s*\[|$)/ },
    { key: "keyMetricsNarrative", regex: /###?\s*\[핵심 지표 내러티브\]\s*\n([\s\S]*?)(?=###?\s*\[|$)/ },
  ];

  for (const { key, regex } of patterns) {
    const match = text.match(regex);
    if (match) {
      sections[key] = match[1].trim();
    }
  }

  return sections as Partial<AIAnalysisResult>;
}

export async function generateGeminiAnalysis(
  input: GeminiAnalysisInput
): Promise<AIAnalysisResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[Gemini] GEMINI_API_KEY 미설정 → Gemini 분석 건너뜀");
    return null;
  }

  try {
    const userPrompt = buildUserPrompt(input);

    // Gemini 2.5 Pro 시도, 실패 시 Gemini 2.0 Flash fallback
    const models = [
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    ];

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Gemini] ${model.label} API 오류 (${response.status}):`, errText.substring(0, 200));

        if (response.status === 429 || response.status === 404 || response.status === 400) {
          console.log(`[Gemini] ${model.label} 실패 → 다음 모델 시도`);
          continue;
        }
        return null;
      }

      const data = await response.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!aiText) {
        console.error("[Gemini] 빈 응답");
        continue;
      }

      const parsed = parseGeminiResponse(aiText);

      console.log(`[Gemini] ${input.corpName} 분석 완료 (${model.label})`);

      return {
        executiveSummary: parsed.executiveSummary || "",
        deepDiagnosis: parsed.deepDiagnosis || "",
        riskAssessment: parsed.riskAssessment || "",
        loanOpinion: parsed.loanOpinion || "",
        creditOutlook: parsed.creditOutlook || "",
        keyMetricsNarrative: parsed.keyMetricsNarrative || "",
        aiModel: model.label,
      };
    }

    console.error("[Gemini] 모든 모델 실패");
    return null;
  } catch (e) {
    console.error("[Gemini] 오류:", e);
    return null;
  }
}
