import type { AppraisalData, ReviewFinding, ApplicationFormType } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { err, warn, info } from './findings-helpers.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { computeStats, classifyScale, formatKRW } from './stats-helpers.ts';

const LTV_THRESHOLD: Record<ApplicationFormType, number> = {
  'apartment-pf': 80,
  'industrial-center': 70,
  'land-pf': 60,
};

/**
 * 심사역 관점 — 여신 의사결정에 필요한 위험 요인을 검증.
 * 핵심:
 *   1) 추출된 데이터로 실제 위험 분석 (규모/집중도/거래시장 활성도 등)
 *   2) 데이터 누락은 "검증불가" INFO로 별도 표기
 *   3) 정량적 권고 액션 제시 (낙찰가율 수동 입력 안내 등)
 */
export function auditAsReviewer(data: AppraisalData): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const c = data.collateral;
  const missing = new Set(data.missingFields);

  // ──────────────────────────────────────────────────────────────────
  // 1. 감정가 규모별 위험 분류
  // ──────────────────────────────────────────────────────────────────
  if (c.appraisalValue > 0) {
    const scale = classifyScale(c.appraisalValue);
    if (scale.category === '초대형') {
      findings.push(warn('reviewer', '규모분류', `감정가 ${formatKRW(c.appraisalValue)} — ${scale.category} (${scale.description})`, {
        sectionRef: { sheet: '담보분석', cell: 'B28' },
        suggestedAction: '단일 담보 집중도 → 공동담보·신탁분할 구조 검토',
      }));
    } else {
      findings.push(info('reviewer', '규모분류', `감정가 ${formatKRW(c.appraisalValue)} — ${scale.category} (${scale.description})`, {
        sectionRef: { sheet: '담보분석', cell: 'B28' },
      }));
    }

    // 호당 평균 — 대형 호실은 매수자 풀 제한
    if (data.collateralDetail.length > 0) {
      const avgPerUnit = c.appraisalValue / data.collateralDetail.length;
      if (avgPerUnit >= 30_000_000_000) {
        findings.push(info('reviewer', '호당규모', `호당 평균 감정가 ${formatKRW(avgPerUnit)} — 대형 호실, 매수자 풀 제한적 (분양 장기화 위험)`, {
          sectionRef: { sheet: '상세담보현황', cell: 'G4' },
        }));
      }
    }
  } else if (missing.has('collateral.appraisalValue')) {
    findings.push(err('reviewer', '감정가', '감정가 추출 실패 — 회수예상가 산출 불가, 평가서 직접 확인 필수', {
      sectionRef: { sheet: '담보분석', cell: 'B28' },
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. LTV 검증 (데이터 가용성 우선)
  // ──────────────────────────────────────────────────────────────────
  if (missing.has('collateral.ltv')) {
    findings.push(info('reviewer', 'LTV', 'LTV 미산출 (선순위·여신금액 미입력) — 사용자가 회수예상가 블록 입력 필요', {
      sectionRef: { sheet: '담보분석', cell: 'E15' },
      suggestedAction: '담보분석 시트의 _입력필요_ 셀(낙찰가율, 선순위)을 입력하면 자동 계산',
    }));
  } else {
    const threshold = LTV_THRESHOLD[data.formType];
    if (c.ltv > threshold) {
      const isSevere = c.ltv > threshold + 10;
      const helper = isSevere ? err : warn;
      findings.push(helper('reviewer', 'LTV', `LTV ${c.ltv}% (${data.formType} 임계 ${threshold}% ${isSevere ? '대폭 초과' : '초과'})`, {
        sectionRef: { sheet: '담보분석', cell: 'E15' },
        suggestedAction: isSevere ? '여신금액 축소 또는 추가 담보 확보 필수' : 'LTV 초과 사유 문서화 + 결재 단계 확인',
      }));
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. 선순위 분석
  // ──────────────────────────────────────────────────────────────────
  if (c.appraisalValue > 0 && !missing.has('collateral.priorClaims')) {
    if (c.priorClaims > 0) {
      const priorRatio = (c.priorClaims / c.appraisalValue) * 100;
      if (priorRatio > 50) {
        findings.push(err('reviewer', '선순위', `선순위 비중 ${priorRatio.toFixed(1)}% (감정가 ${formatKRW(c.appraisalValue)} 대비 선순위 ${formatKRW(c.priorClaims)})`, {
          sectionRef: { sheet: '담보분석', cell: 'B31' },
          suggestedAction: '회수가능액 = 감정가 - 선순위 - 동순위 → 안전마진 부족',
        }));
      } else if (priorRatio > 30) {
        findings.push(warn('reviewer', '선순위', `선순위 비중 ${priorRatio.toFixed(1)}% (감정가 대비)`, {
          sectionRef: { sheet: '담보분석', cell: 'B31' },
        }));
      }
    }
  } else if (missing.has('collateral.priorClaims')) {
    findings.push(info('reviewer', '선순위', '선순위 정보 추출 실패 — 등기부등본·신탁원부 직접 확인', {
      sectionRef: { sheet: '담보분석', cell: 'B31' },
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. 권리현황
  // ──────────────────────────────────────────────────────────────────
  if (c.rights && c.rights.length > 0) {
    const missingRights = c.rights.filter((r) => !r.holder || r.principal === 0 || r.maxClaim === 0);
    if (missingRights.length > 0) {
      findings.push(warn('reviewer', '권리현황', `권리현황 ${missingRights.length}건의 권리자/원금/채권최고액 누락`, {
        sectionRef: { sheet: '담보분석', cell: 'A20' },
        suggestedAction: '등기부등본 재확인 후 누락 항목 입력',
      }));
    }
  } else if (missing.has('collateral.rights')) {
    findings.push(info('reviewer', '권리현황', '권리현황 추출 실패 — 등기부등본 갑/을구 직접 확인 필요', {
      sectionRef: { sheet: '담보분석', cell: 'A20' },
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. 비교사례 — 거래시장 활성도 분석
  // ──────────────────────────────────────────────────────────────────
  if (data.comparatives.length > 0) {
    const tradeCases = data.comparatives.filter((cm) => cm.type === '거래');
    const evalCases = data.comparatives.filter((cm) => cm.type === '평가');
    const tradeRatio = tradeCases.length / data.comparatives.length;

    if (tradeRatio < 0.3 && evalCases.length >= 4) {
      findings.push(warn('reviewer', '거래시장', `비교사례 ${data.comparatives.length}건 중 거래사례 ${tradeCases.length}건 (${(tradeRatio * 100).toFixed(0)}%) — 거래시장 비활성, 환가성 위험`, {
        sectionRef: { sheet: '비준사례', cell: 'A4' },
        suggestedAction: '경매 시 적정 매각가 확보 어려움 — 회수 시나리오 보수적 적용',
      }));
    }

    // 평가사례 중 경매·공매 목적 비중
    const auctionPurpose = evalCases.filter((cs) => cs.purpose && /경매|공매/.test(cs.purpose)).length;
    if (evalCases.length > 0 && auctionPurpose / evalCases.length > 0.5) {
      findings.push(warn('reviewer', '비교사례목적', `평가사례 중 경매·공매 목적 비중 ${((auctionPurpose / evalCases.length) * 100).toFixed(0)}% — 감정가가 시장가 대비 보수적일 가능성`, {
        sectionRef: { sheet: '비준사례', cell: 'G4' },
      }));
    }

    // 평단가 변동성
    const ppStats = computeStats(data.comparatives.map((cm) => cm.pricePerPyeong ?? 0));
    if (ppStats && ppStats.count >= 4 && ppStats.cv > 0.4) {
      findings.push(warn('reviewer', '비교사례변동성', `비교사례 평단가 변동계수 ${(ppStats.cv * 100).toFixed(1)}% (40% 초과) — 시장 가격 편차 큼, 신뢰구간 넓음`, {
        sectionRef: { sheet: '비준사례', cell: 'E4' },
        suggestedAction: `시나리오 분석에 평단가 범위(${formatKRW(ppStats.min)}~${formatKRW(ppStats.max)}) 반영`,
      }));
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. 분양현황
  // ──────────────────────────────────────────────────────────────────
  if (data.supply) {
    const sr = data.supply.project.salesRate;
    if (typeof sr === 'number') {
      if (sr < 30) {
        findings.push(err('reviewer', '분양현황', `분양률 ${sr}% (30% 미만) — 사업 회수 위험 매우 큼`, {
          sectionRef: { sheet: '공급분양', cell: 'B8' },
          suggestedAction: '미분양 해소 계획 + 보증금/대출잔액 충당 능력 확인',
        }));
      } else if (sr < 50) {
        findings.push(warn('reviewer', '분양현황', `분양률 ${sr}% (50% 미만)`, {
          sectionRef: { sheet: '공급분양', cell: 'B8' },
          suggestedAction: '분양 활성화 시점 + 잔여 분양가 회수 시나리오 검토',
        }));
      }
    }

    const totalUnits = data.supply.salesStatus.reduce((s, r) => s + (r.totalUnits ?? 0), 0);
    const unsoldUnits = data.supply.salesStatus.reduce((s, r) => s + (r.unsoldUnits ?? 0), 0);
    if (totalUnits > 0) {
      const unsoldRatio = (unsoldUnits / totalUnits) * 100;
      if (unsoldRatio > 30) {
        findings.push(info('reviewer', '미분양', `미분양 ${unsoldUnits}/${totalUnits} 호실 (${unsoldRatio.toFixed(1)}%)`, {
          sectionRef: { sheet: '공급분양', cell: 'A12' },
        }));
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 7. 평가기준일 + 시장 변동성 결합
  // ──────────────────────────────────────────────────────────────────
  if (c.baseDate) {
    const base = new Date(c.baseDate.replace(/\./g, '-'));
    const now = new Date();
    const diffMonths = (now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (diffMonths > 6 && c.appraisalValue >= 30_000_000_000) {
      findings.push(warn('reviewer', '평가시점위험', `대형 담보(${formatKRW(c.appraisalValue)}) + 평가일 ${diffMonths.toFixed(1)}개월 경과 — 시장 가격 변동 영향 큼`, {
        sectionRef: { sheet: '담보분석', cell: 'C15' },
        suggestedAction: '여신 의사결정 시점 기준 재감정 또는 시세 조정 적용',
      }));
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 8. 회수예상가 — 사용자 입력 안내
  // ──────────────────────────────────────────────────────────────────
  if (c.appraisalValue > 0) {
    findings.push(info('reviewer', '회수예상가', '회수예상가 산정 — 담보분석 시트의 [낙찰가율] 셀에 통상 70~80% 입력', {
      sectionRef: { sheet: '담보분석', cell: 'B29' },
      suggestedAction: '인포케어 낙찰통계 또는 최근 1년 인근 경매 평균 낙찰가율 적용',
    }));
  }

  return findings;
}
