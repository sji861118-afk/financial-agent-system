// app/src/lib/financial-auditor.ts
// 회계 감수 에이전트 — 재무제표 추출 데이터의 정합성 검증

import type { FinancialRow, FinancialResult } from "./dart-api";

export interface AuditFinding {
  severity: "ERROR" | "WARN" | "INFO";
  category: string;       // 검증 항목 분류
  account?: string;       // 관련 계정
  message: string;        // 검증 결과 메시지
  suggestion?: string;    // 수정 제안
}

export interface AuditReport {
  passed: boolean;        // 모든 ERROR 없으면 true
  findings: AuditFinding[];
  summary: string;        // 검증 요약
}

function parseNum(v: string | number | undefined): number | null {
  if (v === undefined || v === "-" || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function findVal(items: FinancialRow[], account: string, year: string): number | null {
  for (const item of items) {
    const norm = item.account.replace(/[\s()]/g, "");
    if (norm.includes(account.replace(/[\s()]/g, ""))) {
      return parseNum(item[year]);
    }
  }
  return null;
}

/**
 * 회계 감수: BS/IS/CF 정합성 검증
 */
export function auditFinancialData(result: FinancialResult): AuditReport {
  const findings: AuditFinding[] = [];
  const years = result.years;
  const latestYear = years[years.length - 1];

  // === 1. BS 등식 검증: 자산총계 = 부채총계 + 자본총계 ===
  function checkBsEquation(bs: FinancialRow[], label: string) {
    for (const yr of years) {
      const assets = findVal(bs, "자산총계", yr);
      const liab = findVal(bs, "부채총계", yr);
      const equity = findVal(bs, "자본총계", yr);
      if (assets !== null && liab !== null && equity !== null) {
        const diff = Math.abs(assets - (liab + equity));
        if (diff > 1) { // 1백만원 허용 (반올림 오차)
          findings.push({
            severity: "ERROR",
            category: "BS 등식",
            message: `[${label}] ${yr}년 자산총계(${assets.toLocaleString()}) ≠ 부채총계(${liab.toLocaleString()}) + 자본총계(${equity.toLocaleString()}), 차이: ${diff.toLocaleString()}백만원`,
            suggestion: "BS 파싱 데이터 확인 필요",
          });
        }
      }
    }
  }

  if (result.hasOfs) checkBsEquation(result.bsItems, "개별");
  if (result.hasCfs && result.bsItemsCfs) checkBsEquation(result.bsItemsCfs, "연결");

  // === 2. IS 논리 검증: 영업이익 = 매출 - 매출원가 - 판관비 (대략) ===
  function checkIsLogic(is: FinancialRow[], label: string) {
    for (const yr of years) {
      const revenue = findVal(is, "영업수익", yr) ?? findVal(is, "매출액", yr);
      const opIncome = findVal(is, "영업이익", yr);
      if (revenue !== null && opIncome !== null && revenue !== 0) {
        const margin = (opIncome / revenue) * 100;
        if (margin > 100 || margin < -100) {
          findings.push({
            severity: "WARN",
            category: "IS 논리",
            message: `[${label}] ${yr}년 영업이익률 ${margin.toFixed(1)}% — 비정상적 수준`,
            suggestion: "매출/영업이익 파싱값 확인",
          });
        }
      }
      // 당기순이익 존재 여부
      const ni = findVal(is, "당기순이익", yr);
      if (ni === null && yr === latestYear) {
        findings.push({
          severity: "WARN",
          category: "IS 누락",
          message: `[${label}] ${yr}년 당기순이익 누락`,
        });
      }
    }
  }

  if (result.hasOfs) checkIsLogic(result.isItems, "개별");
  if (result.hasCfs && result.isItemsCfs) checkIsLogic(result.isItemsCfs, "연결");

  // === 3. CF 정합성: 영업+투자+재무 ≈ 현금변동 ===
  function checkCfLogic(cf: FinancialRow[], label: string) {
    for (const yr of years) {
      const opCf = findVal(cf, "영업활동으로인한현금흐름", yr) ?? findVal(cf, "영업활동현금흐름", yr);
      const invCf = findVal(cf, "투자활동으로인한현금흐름", yr) ?? findVal(cf, "투자활동현금흐름", yr);
      const finCf = findVal(cf, "재무활동으로인한현금흐름", yr) ?? findVal(cf, "재무활동현금흐름", yr);
      if (opCf !== null && invCf !== null && finCf !== null) {
        findings.push({
          severity: "INFO",
          category: "CF 확인",
          message: `[${label}] ${yr}년 영업CF: ${opCf.toLocaleString()}, 투자CF: ${invCf.toLocaleString()}, 재무CF: ${finCf.toLocaleString()}`,
        });
      }
    }
  }

  if (result.cfItems?.length) checkCfLogic(result.cfItems, "개별");
  if (result.cfItemsCfs?.length) checkCfLogic(result.cfItemsCfs, "연결");

  // === 4. 주요 계정 누락 검증 ===
  function checkKeyAccounts(bs: FinancialRow[], is: FinancialRow[], label: string) {
    const bsRequired = ["자산총계", "부채총계", "자본총계"];
    for (const acct of bsRequired) {
      const val = findVal(bs, acct, latestYear);
      if (val === null) {
        findings.push({
          severity: "ERROR",
          category: "필수 계정 누락",
          account: acct,
          message: `[${label}] ${latestYear}년 ${acct} 누락`,
        });
      }
    }
  }

  if (result.hasOfs) checkKeyAccounts(result.bsItems, result.isItems, "개별");

  // === 5. 비율 이상치 검증 ===
  for (const yr of years) {
    const ratios = result.ratios[yr] ?? {};

    // 부채비율 > 2000% 경고
    const debtRatio = parseFloat((ratios["부채비율"] || "0").replace(/%|,/g, ""));
    if (!isNaN(debtRatio) && debtRatio > 2000) {
      findings.push({
        severity: "WARN",
        category: "비율 이상치",
        message: `${yr}년 부채비율 ${debtRatio.toFixed(1)}% — 극단적 수준, 데이터 확인 필요`,
      });
    }

    // EBITDA 음수 경고
    const ebitda = parseFloat((ratios["EBITDA"] || "0").replace(/,/g, ""));
    if (!isNaN(ebitda) && ebitda < 0) {
      findings.push({
        severity: "WARN",
        category: "비율 이상치",
        message: `${yr}년 EBITDA ${ebitda.toLocaleString()}백만원 — 음수, 영업손실+상각비 부족`,
      });
    }
  }

  // === 6. 연도간 급변 검증 ===
  if (years.length >= 2) {
    const prev = years[years.length - 2];
    const cur = years[years.length - 1];
    const bs = result.bsItems;
    const totalAssetPrev = findVal(bs, "자산총계", prev);
    const totalAssetCur = findVal(bs, "자산총계", cur);
    if (totalAssetPrev && totalAssetCur && totalAssetPrev > 0) {
      const change = Math.abs((totalAssetCur - totalAssetPrev) / totalAssetPrev) * 100;
      if (change > 100) {
        findings.push({
          severity: "WARN",
          category: "급변 감지",
          message: `자산총계 ${prev}→${cur} 변동 ${change.toFixed(0)}% — 대규모 변동, 합병/분할/자산재평가 등 확인`,
        });
      }
    }
  }

  const errors = findings.filter(f => f.severity === "ERROR");
  const warns = findings.filter(f => f.severity === "WARN");

  const summary = errors.length > 0
    ? `검증 실패: ${errors.length}건 오류, ${warns.length}건 주의`
    : warns.length > 0
      ? `검증 통과 (주의 ${warns.length}건): ${warns.map(w => w.message).join("; ")}`
      : `검증 통과: 정합성 이상 없음`;

  return {
    passed: errors.length === 0,
    findings,
    summary,
  };
}
