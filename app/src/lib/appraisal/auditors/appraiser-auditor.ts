import type { AppraisalData, ReviewFinding } from '@/types/appraisal';
// @ts-expect-error -- Node 24 --experimental-strip-types requires explicit .ts extension for relative imports (tsconfig moduleResolution: bundler)
import { err, warn, info } from './findings-helpers.ts';

export function auditAsAppraiser(data: AppraisalData): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const c = data.collateral;

  // 1. 평가방법 비중 합계 100±0.1%
  const methodSum = c.method.comparison + c.method.cost + c.method.income;
  if (Math.abs(methodSum - 100) > 0.1) {
    findings.push(err('appraiser', '평가방법', `평가방법 비중 합계 ${methodSum}% (100±0.1% 위반)`, {
      sectionRef: { sheet: '담보분석', cell: 'D15' },
      suggestedAction: '비교/원가/수익 비중 재확인',
    }));
  }

  // 2. 평가방법이 물건유형 표준과 일치
  if (data.formType === 'land-pf' && c.method.comparison < 70) {
    findings.push(warn('appraiser', '평가방법', `토지 평가에서 비교방식 비중 ${c.method.comparison}% (통상 100%)`, {
      sectionRef: { sheet: '담보분석', cell: 'D15' },
    }));
  }
  if (data.formType === 'industrial-center' && c.method.income === 0) {
    findings.push(warn('appraiser', '평가방법', '지산센터에서 수익방식 비중 0% (수익형은 통상 수익방식 반영)', {
      sectionRef: { sheet: '담보분석', cell: 'D15' },
    }));
  }

  // 3. 비교사례 단가 평균 vs 본건 단가 괴리율 ±30%
  const tradeCases = data.comparatives.filter(cm => cm.type === '거래');
  if (tradeCases.length > 0 && c.appraisalValue > 0 && c.totalAreaPyeong > 0) {
    const ownPricePerPyeong = c.appraisalValue / c.totalAreaPyeong;
    const avgComparativePrice = tradeCases.reduce((s, cm) => s + cm.pricePerPyeong, 0) / tradeCases.length;
    if (avgComparativePrice > 0) {
      const deviation = Math.abs(ownPricePerPyeong - avgComparativePrice) / avgComparativePrice;
      if (deviation > 0.3) {
        findings.push(warn('appraiser', '비교사례', `본건 평단가(${ownPricePerPyeong.toFixed(0)}만원) vs 거래사례 평균(${avgComparativePrice.toFixed(0)}만원) 괴리율 ${(deviation * 100).toFixed(1)}%`, {
          sectionRef: { sheet: '비준사례', cell: 'A4' },
        }));
      }
    }
  }

  // 4. 비교사례 4건 미만
  if (data.comparatives.length < 4) {
    findings.push(info('appraiser', '비교사례', `비교사례 ${data.comparatives.length}건 — 통상 4건 이상 권장`));
  }

  // 5. 호별 합계 ≈ 총 감정가 (오차 ±1%)
  if (data.collateralDetail.length > 0 && c.appraisalValue > 0) {
    const sumDetail = data.collateralDetail.reduce((s, d) => s + d.appraisalValue, 0);
    const ratio = Math.abs(sumDetail - c.appraisalValue) / c.appraisalValue;
    if (ratio > 0.01) {
      findings.push(err('appraiser', '호별합계', `호별 감정가 합계 ${sumDetail.toFixed(0)} ≠ 총 감정가 ${c.appraisalValue} (오차 ${(ratio * 100).toFixed(1)}%)`, {
        sectionRef: { sheet: '상세담보현황', cell: 'A4' },
        suggestedAction: '호별 감정가 또는 총 감정가 재확인',
      }));
    }
  }

  // 6. 면적 일관성 (오차 ±0.5%)
  if (data.collateralDetail.length > 0 && c.totalArea > 0) {
    const sumArea = data.collateralDetail.reduce((s, d) => s + d.areaSqm, 0);
    const ratio = Math.abs(sumArea - c.totalArea) / c.totalArea;
    if (ratio > 0.005) {
      findings.push(warn('appraiser', '면적', `호별 면적 합계 ${sumArea.toFixed(2)}㎡ ≠ 총 면적 ${c.totalArea}㎡`, {
        sectionRef: { sheet: '상세담보현황', cell: 'E4' },
      }));
    }
  }

  // 7. 누락 (기준시점/일련번호/평가기관)
  if (!c.baseDate) findings.push(info('appraiser', '누락', '기준시점 미추출'));
  if (!c.serialNo) findings.push(info('appraiser', '누락', '일련번호 미추출'));
  if (!c.appraiser) findings.push(info('appraiser', '누락', '평가기관명 미추출'));

  // 8. 평가가능기간 — 기준시점이 6개월 이상 경과
  if (c.baseDate) {
    const base = new Date(c.baseDate);
    const now = new Date();
    const diffMonths = (now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (diffMonths > 6) {
      findings.push(warn('appraiser', '기준시점', `기준시점 ${c.baseDate} (${diffMonths.toFixed(1)}개월 경과) — 통상 6개월 이내 평가 권장`, {
        sectionRef: { sheet: '담보분석', cell: 'C15' },
      }));
    }
  }

  return findings;
}
