import type { AppraisalData, ReviewFinding, ApplicationFormType } from '@/types/appraisal';
// @ts-expect-error -- Node 24 --experimental-strip-types requires explicit .ts extension for relative imports (tsconfig moduleResolution: bundler)
import { err, warn, info } from './findings-helpers.ts';

const LTV_THRESHOLD: Record<ApplicationFormType, number> = {
  'apartment-pf': 80,
  'industrial-center': 70,
  'land-pf': 60,
};

export function auditAsReviewer(data: AppraisalData): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const c = data.collateral;

  // 1. LTV 임계 초과
  const threshold = LTV_THRESHOLD[data.formType];
  if (c.ltv > threshold) {
    findings.push(warn('reviewer', 'LTV', `LTV ${c.ltv}% (${data.formType} 임계 ${threshold}% 초과)`, {
      sectionRef: { sheet: '담보분석', cell: 'E15' },
    }));
  }

  // 2. 회수예상가 음수/0 — 단, 낙찰가율은 사용자 입력이므로 estimate가 없으면 스킵
  // (감정가 0이면 명백한 데이터 오류)
  if (c.appraisalValue <= 0) {
    findings.push(err('reviewer', '감정가', '감정가가 0 또는 음수 — 데이터 오류', {
      sectionRef: { sheet: '담보분석', cell: 'B28' },
    }));
  }

  // 3. 선순위 비중 > 50%
  if (c.appraisalValue > 0 && c.priorClaims > 0) {
    const priorRatio = (c.priorClaims / c.appraisalValue) * 100;
    if (priorRatio > 50) {
      findings.push(warn('reviewer', '선순위', `선순위 비중 ${priorRatio.toFixed(1)}% (감정가 대비)`, {
        sectionRef: { sheet: '담보분석', cell: 'B31' },
      }));
    }
  }

  // 4. 권리현황 누락
  if (c.rights && c.rights.length > 0) {
    const missingRights = c.rights.filter(r => !r.holder || r.principal === 0 || r.maxClaim === 0);
    if (missingRights.length > 0) {
      findings.push(warn('reviewer', '권리현황', `권리현황 ${missingRights.length}건의 권리자/원금/채권최고액 누락`, {
        sectionRef: { sheet: '담보분석', cell: 'A20' },
      }));
    }
  }

  // 5. 분양현황
  if (data.supply) {
    const sr = data.supply.project.salesRate;
    if (typeof sr === 'number' && sr < 50) {
      findings.push(warn('reviewer', '분양현황', `분양률 ${sr}% (50% 미만)`, {
        sectionRef: { sheet: '공급/분양', cell: 'B8' },
      }));
    }

    const totalUnits = data.supply.salesStatus.reduce((s, r) => s + (r.totalUnits ?? 0), 0);
    const unsoldUnits = data.supply.salesStatus.reduce((s, r) => s + (r.unsoldUnits ?? 0), 0);
    if (totalUnits > 0) {
      const unsoldRatio = (unsoldUnits / totalUnits) * 100;
      if (unsoldRatio > 30) {
        findings.push(info('reviewer', '미분양', `미분양 비중 ${unsoldRatio.toFixed(1)}% (${unsoldUnits}/${totalUnits} 호실)`));
      }
    }
  }

  // 6. 비교사례 평가목적이 '경매' 비중 > 50%
  const evalCases = data.comparatives.filter(cm => cm.type === '평가');
  if (evalCases.length > 0) {
    const auctionRatio = evalCases.filter(c => c.purpose?.includes('경매')).length / evalCases.length;
    if (auctionRatio > 0.5) {
      findings.push(info('reviewer', '비교사례', `평가사례 중 경매 목적 비중 ${(auctionRatio * 100).toFixed(0)}% (시장가 반영도 낮을 수 있음)`));
    }
  }

  return findings;
}
