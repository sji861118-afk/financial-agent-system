/**
 * 서브에이전트: qa-verifier ⭐
 * ============================
 * 원본 데이터(RawDataSnapshot) vs 최종 산출물(MergedData + AnalysisResult) 검증
 *
 * 4가지 검증:
 *   1. 파싱 누락 검사 — 원본 항목 수 vs 파싱 결과 항목 수
 *   2. 계정명 일치 검사 — 정규화 전후 매핑 검증
 *   3. 수치 일치 검사 — 원본 금액 vs 병합 결과 1:1 대조
 *   4. 비율 검증 — 병합 데이터 기반 재계산 vs 분석 결과 비교
 */

import type { FinancialRow } from "../dart-api";
import type {
  RawDataSnapshot,
  MergedData,
  AnalysisResult,
  QAReport,
  QACheck,
  QAStatus,
  EscalationItem,
} from "./types";

// ============================================================
// 유틸리티
// ============================================================

function parseAmount(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  const s = val.trim();
  if (s === "-" || s === "") return 0;
  const negative = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[(),\s,]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return negative ? -num : num;
}

function normalizeKey(s: string): string {
  return (s || "").replace(/\s/g, "");
}

/** 두 문자열의 단순 유사도 (0~1) */
function similarity(a: string, b: string): number {
  const na = normalizeKey(a);
  const nb = normalizeKey(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  // Jaccard on 2-grams
  const gramsA = new Set<string>();
  const gramsB = new Set<string>();
  for (let i = 0; i < na.length - 1; i++) gramsA.add(na.slice(i, i + 2));
  for (let i = 0; i < nb.length - 1; i++) gramsB.add(nb.slice(i, i + 2));
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let intersection = 0;
  for (const g of gramsA) if (gramsB.has(g)) intersection++;
  return intersection / (gramsA.size + gramsB.size - intersection);
}

// ============================================================
// 검증 1: 파싱 누락
// ============================================================

function checkParsingCompleteness(
  snapshot: RawDataSnapshot,
  merged: MergedData
): QACheck {
  const rawBsCount = snapshot.dartBsRaw.length + (snapshot.uploadBsRaw?.length || 0);
  const rawIsCount = snapshot.dartIsRaw.length + (snapshot.uploadIsRaw?.length || 0);
  const rawTotal = rawBsCount + rawIsCount;
  const mergedTotal = merged.bsItems.length + merged.isItems.length;

  // 주요 계정 확인
  const requiredBs = ["자산총계", "부채총계", "자본총계"];
  const requiredIs = ["매출액", "영업이익", "당기순이익"];
  const missingItems: string[] = [];

  for (const req of requiredBs) {
    const found = merged.bsItems.some((r) => normalizeKey(r.account).includes(req));
    if (!found) missingItems.push(`BS: ${req}`);
  }
  for (const req of requiredIs) {
    const found = merged.isItems.some((r) => {
      const a = normalizeKey(r.account);
      return a.includes(req) || (req === "매출액" && (a.includes("영업수익") || a.includes("수익(매출액)"))) ||
        (req === "영업이익" && a.includes("영업손실")) ||
        (req === "당기순이익" && (a.includes("당기순손실") || a.includes("당기순손익")));
    });
    if (!found) missingItems.push(`IS: ${req}`);
  }

  const itemLoss = rawTotal - mergedTotal;
  const hasLoss = itemLoss > 0;

  return {
    type: "파싱누락",
    result: missingItems.length > 0 ? "FAIL" : hasLoss ? "WARN" : "PASS",
    details: `원본 ${rawTotal}항목 → 병합 ${mergedTotal}항목 (차이: ${itemLoss}). 주요계정 누락: ${missingItems.length}건`,
    missingItems,
  };
}

// ============================================================
// 검증 2: 계정명 일치
// ============================================================

function checkAccountNameConsistency(
  snapshot: RawDataSnapshot,
  merged: MergedData
): QACheck {
  const suspiciousMatches: Array<{ original: string; normalized: string; similarity: number }> = [];
  const mergedAccounts = [
    ...merged.bsItems.map((r) => normalizeKey(r.account)),
    ...merged.isItems.map((r) => normalizeKey(r.account)),
  ];

  // 원본 계정명 중 병합 결과에 정확히 매칭되지 않는 것 탐색
  const allRaw = [
    ...snapshot.dartBsRaw.map((r) => r.account),
    ...snapshot.dartIsRaw.map((r) => r.account),
    ...(snapshot.uploadBsRaw?.map((r) => r.account) || []),
    ...(snapshot.uploadIsRaw?.map((r) => r.account) || []),
  ];

  for (const rawAcct of allRaw) {
    const rawKey = normalizeKey(rawAcct);
    if (!rawKey) continue;
    const exactMatch = mergedAccounts.some((m) => m === rawKey);
    if (!exactMatch) {
      // 가장 유사한 항목 찾기
      let bestSim = 0;
      let bestMatch = "";
      for (const m of mergedAccounts) {
        const sim = similarity(rawKey, m);
        if (sim > bestSim) {
          bestSim = sim;
          bestMatch = m;
        }
      }
      if (bestSim >= 0.5 && bestSim < 1) {
        suspiciousMatches.push({
          original: rawAcct,
          normalized: bestMatch,
          similarity: Math.round(bestSim * 100) / 100,
        });
      }
    }
  }

  return {
    type: "계정명일치",
    result: suspiciousMatches.length > 3 ? "FAIL" : suspiciousMatches.length > 0 ? "WARN" : "PASS",
    details: `의심 매칭 ${suspiciousMatches.length}건`,
    suspiciousMatches,
  };
}

// ============================================================
// 검증 3: 수치 일치
// ============================================================

function checkValueConsistency(
  snapshot: RawDataSnapshot,
  merged: MergedData
): QACheck {
  const mismatches: Array<{
    account: string;
    year: string;
    original: number;
    actual: number;
    diff: number;
    diffPercent: number;
  }> = [];

  // 원본 → 병합 결과 대조 (BS)
  compareValues(snapshot.dartBsRaw, merged.bsItems, snapshot.years, mismatches);
  // 원본 → 병합 결과 대조 (IS)
  compareValues(snapshot.dartIsRaw, merged.isItems, snapshot.years, mismatches);

  // BS 등식 검증: 자산총계 = 부채총계 + 자본총계
  for (const y of snapshot.years) {
    const totalAssets = findItemValue(merged.bsItems, "자산총계", y);
    const totalLiab = findItemValue(merged.bsItems, "부채총계", y);
    const totalEquity = findItemValue(merged.bsItems, "자본총계", y);
    if (totalAssets !== 0 && totalLiab !== 0 && totalEquity !== 0) {
      const sum = totalLiab + totalEquity;
      const diff = Math.abs(totalAssets - sum);
      if (diff > 1) {
        mismatches.push({
          account: "BS등식(자산=부채+자본)",
          year: y,
          original: totalAssets,
          actual: sum,
          diff,
          diffPercent: totalAssets !== 0 ? (diff / Math.abs(totalAssets)) * 100 : 0,
        });
      }
    }
  }

  return {
    type: "수치일치",
    result: mismatches.length > 0 ? "FAIL" : "PASS",
    details: `불일치 ${mismatches.length}건`,
    mismatches,
  };
}

function compareValues(
  rawItems: Array<{ account: string; values: Record<string, string | number | undefined> }>,
  mergedItems: FinancialRow[],
  years: string[],
  mismatches: Array<{ account: string; year: string; original: number; actual: number; diff: number; diffPercent: number }>
) {
  for (const raw of rawItems) {
    const rawKey = normalizeKey(raw.account);
    const merged = mergedItems.find((m) => normalizeKey(m.account) === rawKey);
    if (!merged) continue;
    for (const y of years) {
      const rawVal = parseAmount(raw.values[y]);
      const mergedVal = parseAmount(merged[y]);
      if (rawVal === 0 && mergedVal === 0) continue;
      const diff = Math.abs(rawVal - mergedVal);
      // 허용 오차: ±1 (반올림 차이)
      if (diff > 1) {
        const diffPercent = rawVal !== 0 ? (diff / Math.abs(rawVal)) * 100 : 100;
        mismatches.push({
          account: raw.account,
          year: y,
          original: rawVal,
          actual: mergedVal,
          diff,
          diffPercent: Math.round(diffPercent * 100) / 100,
        });
      }
    }
  }
}

function findItemValue(items: FinancialRow[], keyword: string, year: string): number {
  const item = items.find((r) => normalizeKey(r.account).includes(keyword));
  if (!item) return 0;
  return parseAmount(item[year]);
}

// ============================================================
// 검증 4: 비율 검증
// ============================================================

function checkRatioConsistency(
  merged: MergedData,
  analysis: AnalysisResult | undefined
): QACheck {
  if (!analysis) {
    return {
      type: "비율검증",
      result: "WARN",
      details: "분석 결과 없음 — 비율 검증 스킵",
      mismatches: [],
    };
  }

  const mismatches: Array<{
    account: string;
    year: string;
    original: number;
    actual: number;
    diff: number;
    diffPercent: number;
  }> = [];

  // 병합 데이터로 직접 재계산
  for (const y of merged.years) {
    const ta = findItemValue(merged.bsItems, "자산총계", y);
    const tl = findItemValue(merged.bsItems, "부채총계", y);
    const te = findItemValue(merged.bsItems, "자본총계", y);
    const rev = findItemValue(merged.isItems, "매출액", y) || findItemValue(merged.isItems, "영업수익", y);
    const ni = findItemValue(merged.isItems, "당기순이익", y) || findItemValue(merged.isItems, "당기순손익", y);

    // 부채비율 재계산
    if (te !== 0 && analysis.keyRatios.debtRatio !== undefined) {
      const recalc = (tl / Math.abs(te)) * 100;
      const reported = analysis.keyRatios.debtRatio;
      if (Math.abs(recalc - reported) > 0.1) {
        mismatches.push({
          account: "부채비율",
          year: y,
          original: Math.round(recalc * 10) / 10,
          actual: reported,
          diff: Math.round(Math.abs(recalc - reported) * 10) / 10,
          diffPercent: 0,
        });
      }
    }

    // ROA 재계산
    if (ta !== 0 && analysis.keyRatios.roa !== undefined) {
      const recalc = (ni / ta) * 100;
      const reported = analysis.keyRatios.roa;
      if (Math.abs(recalc - reported) > 0.1) {
        mismatches.push({
          account: "ROA",
          year: y,
          original: Math.round(recalc * 10) / 10,
          actual: reported,
          diff: Math.round(Math.abs(recalc - reported) * 10) / 10,
          diffPercent: 0,
        });
      }
    }
  }

  return {
    type: "비율검증",
    result: mismatches.length > 0 ? "FAIL" : "PASS",
    details: `비율 불일치 ${mismatches.length}건`,
    mismatches,
  };
}

// ============================================================
// 메인: QA 검수 실행
// ============================================================

export function runQAVerification(
  snapshot: RawDataSnapshot,
  merged: MergedData,
  analysis?: AnalysisResult,
  retryCount = 0
): { qaReport: QAReport; escalations: EscalationItem[] } {
  const checks: QACheck[] = [
    checkParsingCompleteness(snapshot, merged),
    checkAccountNameConsistency(snapshot, merged),
    checkValueConsistency(snapshot, merged),
    checkRatioConsistency(merged, analysis),
  ];

  // 전체 상태 결정
  const hasFail = checks.some((c) => c.result === "FAIL");
  const hasWarn = checks.some((c) => c.result === "WARN");

  // 자동 수정 가능 항목 분류
  const autoFixable: QAReport["autoFixable"] = [];
  const needsHumanReview: QAReport["needsHumanReview"] = [];
  const escalations: EscalationItem[] = [];

  for (const check of checks) {
    if (check.result === "FAIL") {
      if (check.type === "수치일치" && check.mismatches) {
        // 수치 불일치 중 차이가 0.01% 미만이면 자동 수정 가능 (반올림 오차)
        for (const m of check.mismatches) {
          if (m.diffPercent < 0.01) {
            autoFixable.push({
              type: check.type,
              description: `${m.account} ${m.year}: ${m.original} → ${m.actual} (차이 ${m.diff})`,
              suggestedFix: "반올림 오차 — 원본 값 사용",
            });
          } else {
            needsHumanReview.push({
              type: check.type,
              description: `${m.account} ${m.year}: 원본 ${m.original} vs 결과 ${m.actual} (${m.diffPercent}%)`,
              options: ["원본 값 사용", "현재 값 유지", "수동 입력"],
            });
            escalations.push({
              id: `${check.type}-${m.account}-${m.year}`,
              type: check.type,
              severity: m.diffPercent > 5 ? "HIGH" : m.diffPercent > 1 ? "MEDIUM" : "LOW",
              description: `${m.account} (${m.year}): 원본 ${m.original} ≠ 결과 ${m.actual}`,
              originalValue: m.original,
              currentValue: m.actual,
              options: [
                { label: "원본 값 사용", action: "useOriginal", value: m.original },
                { label: "현재 값 유지", action: "approve", value: m.actual },
                { label: "수동 입력", action: "manual" },
              ],
            });
          }
        }
      }

      if (check.type === "파싱누락" && check.missingItems?.length) {
        for (const item of check.missingItems) {
          needsHumanReview.push({
            type: check.type,
            description: `주요 계정 누락: ${item}`,
            options: ["무시하고 진행", "데이터 확인 후 재시도"],
          });
          escalations.push({
            id: `parsing-${item}`,
            type: check.type,
            severity: "HIGH",
            description: `주요 계정 누락: ${item}`,
            options: [
              { label: "무시하고 진행", action: "approve" },
              { label: "데이터 확인 후 재시도", action: "manual" },
            ],
          });
        }
      }

      if (check.type === "계정명일치" && check.suspiciousMatches?.length) {
        for (const m of check.suspiciousMatches) {
          if (m.similarity >= 0.8) {
            autoFixable.push({
              type: check.type,
              description: `"${m.original}" → "${m.normalized}" (유사도 ${m.similarity})`,
              suggestedFix: "높은 유사도 — 자동 매칭",
            });
          } else {
            needsHumanReview.push({
              type: check.type,
              description: `"${m.original}" ≈ "${m.normalized}" (유사도 ${m.similarity})`,
              options: ["매칭 승인", "별도 항목으로 유지", "수동 매칭"],
            });
            escalations.push({
              id: `acct-${m.original}`,
              type: check.type,
              severity: "MEDIUM",
              description: `"${m.original}" ≈ "${m.normalized}" (${Math.round(m.similarity * 100)}%)`,
              options: [
                { label: "매칭 승인", action: "approve" },
                { label: "별도 항목", action: "useOriginal" },
                { label: "수동 매칭", action: "manual" },
              ],
            });
          }
        }
      }
    }
  }

  // 최종 상태
  let status: QAStatus = "PASS";
  if (hasFail) {
    if (needsHumanReview.length > 0 || retryCount >= 2) {
      status = "ESCALATE";
    } else if (autoFixable.length > 0) {
      status = "AUTO_FIX";
    } else {
      status = "ESCALATE";
    }
  }

  const qaReport: QAReport = {
    status,
    timestamp: new Date().toISOString(),
    checks,
    autoFixable,
    needsHumanReview,
    retryCount,
  };

  return { qaReport, escalations };
}
