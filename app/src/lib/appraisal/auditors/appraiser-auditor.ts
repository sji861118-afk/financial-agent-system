import type { AppraisalData, ReviewFinding } from '@/types/appraisal';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { err, warn, info } from './findings-helpers.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { computeStats, detectOutliers, formatKRW } from './stats-helpers.ts';

/**
 * 감정평가사 관점 — 평가서 자체의 적정성을 검증.
 * 핵심 원칙:
 *   1) 데이터 누락(추출 실패)을 위반으로 잘못 분류하지 않음 — missingFields 활용
 *   2) 추출된 데이터(호별·비교사례)를 최대한 활용해 통계적 분석 제공
 *   3) 단순 "X 위반" 대신 구체적 수치와 권고 액션 제시
 */
export function auditAsAppraiser(data: AppraisalData): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const c = data.collateral;
  const missing = new Set(data.missingFields);

  // ──────────────────────────────────────────────────────────────────
  // 1. 평가방법 — 데이터 가용성을 먼저 확인
  // ──────────────────────────────────────────────────────────────────
  if (missing.has('collateral.method')) {
    findings.push(info('appraiser', '평가방법', '평가방법 비중(비교/원가/수익) 추출 실패 — 평가서 본문 직접 확인 필요', {
      sectionRef: { sheet: '담보분석', cell: 'D15' },
      suggestedAction: '감정평가서 "평가방법 결정의견" 섹션에서 비중 직접 입력',
    }));
  } else {
    const methodSum = c.method.comparison + c.method.cost + c.method.income;
    if (Math.abs(methodSum - 100) > 0.1) {
      findings.push(err('appraiser', '평가방법', `평가방법 비중 합계 ${methodSum.toFixed(1)}% (100±0.1% 위반)`, {
        sectionRef: { sheet: '담보분석', cell: 'D15' },
        suggestedAction: '비교/원가/수익 비중 합계가 100%가 되도록 재확인',
      }));
    } else {
      // 물건유형 표준 적합성
      if (data.formType === 'land-pf' && c.method.comparison < 70) {
        findings.push(warn('appraiser', '평가방법적합성', `토지 평가에 비교방식 비중 ${c.method.comparison}% (통상 100% 또는 70% 이상)`, {
          sectionRef: { sheet: '담보분석', cell: 'D15' },
          suggestedAction: '토지의 경우 거래사례비교법이 주방식 — 원가/수익 비중 사유 확인',
        }));
      }
      if (data.formType === 'industrial-center' && c.method.income === 0 && c.method.comparison === 100) {
        findings.push(info('appraiser', '평가방법적합성', '지산센터에서 비교방식 100% — 임대수익 발생 시설은 통상 수익방식 일부 반영', {
          sectionRef: { sheet: '담보분석', cell: 'D15' },
        }));
      }
      if (data.formType === 'apartment-pf' && c.method.income > 30) {
        findings.push(warn('appraiser', '평가방법적합성', `아파트 평가에 수익방식 ${c.method.income}% — 통상 30% 이내`, {
          sectionRef: { sheet: '담보분석', cell: 'D15' },
        }));
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. 호별 합계 검증 + 호별 감정가 분포 분석
  // ──────────────────────────────────────────────────────────────────
  if (data.collateralDetail.length > 0) {
    const sumDetail = data.collateralDetail.reduce((s, d) => s + (d.appraisalValue ?? 0), 0);

    // 합계 vs 총감정가 — appraisalValue가 derived(adapter에서 detail로부터 계산)일 수 있어
    // missing.has('collateral.appraisalValue')가 false인 경우만 검증.
    if (c.appraisalValue > 0 && !missing.has('collateral.appraisalValue')) {
      const ratio = Math.abs(sumDetail - c.appraisalValue) / c.appraisalValue;
      if (ratio > 0.01) {
        findings.push(err('appraiser', '호별합계', `호별 감정가 합계 ${formatKRW(sumDetail)} ≠ 총 감정가 ${formatKRW(c.appraisalValue)} (오차 ${(ratio * 100).toFixed(2)}%)`, {
          sectionRef: { sheet: '상세담보현황', cell: 'A4' },
          suggestedAction: '호별 감정가 또는 총 감정가 어느 쪽이 정확한지 평가서 본문 확인',
        }));
      }
    }

    // 호별 감정가 분포 분석
    const valueStats = computeStats(data.collateralDetail.map((d) => d.appraisalValue ?? 0));
    if (valueStats && valueStats.count >= 5) {
      const summary = `호당 평균 ${formatKRW(valueStats.mean)} (최소 ${formatKRW(valueStats.min)} ~ 최대 ${formatKRW(valueStats.max)}, 변동계수 ${(valueStats.cv * 100).toFixed(1)}%)`;
      findings.push(info('appraiser', '호별분포', summary, {
        sectionRef: { sheet: '상세담보현황', cell: 'G4' },
        detail: `호별 ${valueStats.count}개 데이터 분석 — 중앙값 ${formatKRW(valueStats.median)}, 표준편차 ${formatKRW(valueStats.stddev)}`,
      }));
      // 변동계수 30% 초과 시 호별 가격 편차 심함
      if (valueStats.cv > 0.3) {
        findings.push(warn('appraiser', '호별편차', `호별 감정가 변동계수 ${(valueStats.cv * 100).toFixed(1)}% (30% 초과) — 호실 간 가격 편차 큼`, {
          sectionRef: { sheet: '상세담보현황', cell: 'G4' },
          suggestedAction: '면적·층·향 차이가 합리적으로 반영됐는지 확인',
        }));
      }
    }

    // 평단가 이상치 (IQR 기반)
    const outliers = detectOutliers(data.collateralDetail, (d) => d.appraisalPricePerPyeong ?? 0);
    if (outliers.length > 0 && outliers.length <= 5) {
      const samples = outliers.slice(0, 3).map((o) => `${o.unit ?? '?'} (평단가 ${formatKRW(o.appraisalPricePerPyeong ?? 0)})`).join(', ');
      findings.push(warn('appraiser', '평단가이상치', `평단가 이상치 ${outliers.length}개 (IQR 기준): ${samples}`, {
        sectionRef: { sheet: '상세담보현황', cell: 'H4' },
        suggestedAction: '특수성(향, 층고, 코너 등) 사유 확인 또는 입력 오류 점검',
      }));
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. 면적 일관성
  // ──────────────────────────────────────────────────────────────────
  if (data.collateralDetail.length > 0 && c.totalArea > 0 && !missing.has('collateral.totalArea')) {
    const sumArea = data.collateralDetail.reduce((s, d) => s + (d.areaSqm ?? 0), 0);
    const ratio = Math.abs(sumArea - c.totalArea) / c.totalArea;
    if (ratio > 0.005) {
      findings.push(warn('appraiser', '면적', `호별 면적 합계 ${sumArea.toFixed(2)}㎡ ≠ 총 면적 ${c.totalArea.toFixed(2)}㎡ (오차 ${(ratio * 100).toFixed(2)}%)`, {
        sectionRef: { sheet: '상세담보현황', cell: 'E4' },
      }));
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. 비교사례 분석 — 평단가 통계 + 본건 비교
  // ──────────────────────────────────────────────────────────────────
  if (data.comparatives.length > 0) {
    const tradeCases = data.comparatives.filter((cm) => cm.type === '거래');
    const evalCases = data.comparatives.filter((cm) => cm.type === '평가');

    // 거래사례 부재
    if (tradeCases.length === 0 && evalCases.length > 0) {
      findings.push(warn('appraiser', '비교사례구성', `비교사례 ${data.comparatives.length}건 모두 평가사례 (거래사례 0건) — 시장 거래가 반영도 낮음`, {
        sectionRef: { sheet: '비준사례', cell: 'A4' },
        suggestedAction: '인근 거래사례 추가 또는 거래시장 비활성 사유 명시',
      }));
    }

    // 평단가 통계 (거래+평가 통합)
    const ppStats = computeStats(data.comparatives.map((cm) => cm.pricePerPyeong ?? 0));
    if (ppStats && ppStats.count >= 2) {
      findings.push(info('appraiser', '비교사례분포', `비교사례 ${ppStats.count}건 평단가: 평균 ${formatKRW(ppStats.mean)} (${formatKRW(ppStats.min)}~${formatKRW(ppStats.max)})`, {
        sectionRef: { sheet: '비준사례', cell: 'E4' },
      }));

      // 본건 평단가 도출 (원/평 단위로 통일)
      let ownPricePerPyeong = 0;
      if (data.collateralDetail.length > 0) {
        const detailPpStats = computeStats(data.collateralDetail.map((d) => d.appraisalPricePerPyeong ?? 0));
        if (detailPpStats) ownPricePerPyeong = detailPpStats.mean;
      } else if (c.totalAreaPyeong > 0) {
        ownPricePerPyeong = c.appraisalValue / c.totalAreaPyeong; // 원/평
      }

      if (ownPricePerPyeong > 0) {
        const deviation = (ownPricePerPyeong - ppStats.mean) / ppStats.mean;
        const sign = deviation > 0 ? '+' : '';
        const isOutlier = Math.abs(deviation) > 0.3;
        const msg = `본건 평단가 ${formatKRW(ownPricePerPyeong)} vs 비교사례 평균 ${formatKRW(ppStats.mean)} (${sign}${(deviation * 100).toFixed(1)}%)`;
        if (isOutlier) {
          findings.push(warn('appraiser', '본건괴리율', msg + ' — 30% 초과 괴리, 사유 확인 필요', {
            sectionRef: { sheet: '비준사례', cell: 'E4' },
            suggestedAction: '본건과 사례의 위치/면적/시점 차이 보정 항목 검토',
          }));
        } else {
          findings.push(info('appraiser', '본건괴리율', msg, { sectionRef: { sheet: '비준사례', cell: 'E4' } }));
        }
      }
    }

    // 비교사례 4건 미만은 누락에 가까울 때만 표시
    if (data.comparatives.length < 4 && data.comparatives.length > 0) {
      findings.push(info('appraiser', '비교사례부족', `비교사례 ${data.comparatives.length}건 — 통상 4건 이상 권장`, {
        sectionRef: { sheet: '비준사례', cell: 'A4' },
      }));
    }
  } else if (missing.has('comparatives')) {
    findings.push(info('appraiser', '비교사례', '비교사례 추출 실패 — 평가서 비준표 직접 확인', {
      sectionRef: { sheet: '비준사례', cell: 'A4' },
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. 메타 정보 누락 (추출 실패) — INFO로만 분류
  // ──────────────────────────────────────────────────────────────────
  if (missing.has('collateral.appraiser')) findings.push(info('appraiser', '메타누락', '평가기관명 추출 실패'));
  if (!c.serialNo) findings.push(info('appraiser', '메타누락', '일련번호 추출 실패'));
  if (missing.has('collateral.baseDate')) findings.push(info('appraiser', '메타누락', '기준시점 추출 실패'));

  // ──────────────────────────────────────────────────────────────────
  // 6. 평가가능기간
  // ──────────────────────────────────────────────────────────────────
  if (c.baseDate && !missing.has('collateral.baseDate')) {
    const base = new Date(c.baseDate.replace(/\./g, '-'));
    const now = new Date();
    const diffMonths = (now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (diffMonths > 6 && diffMonths <= 12) {
      findings.push(warn('appraiser', '기준시점', `기준시점 ${c.baseDate} (${diffMonths.toFixed(1)}개월 경과) — 통상 6개월 이내 평가 권장`, {
        sectionRef: { sheet: '담보분석', cell: 'C15' },
        suggestedAction: '여신 의사결정 시점이 평가일로부터 6개월 초과 시 재감정 검토',
      }));
    } else if (diffMonths > 12) {
      findings.push(err('appraiser', '기준시점', `기준시점 ${c.baseDate} (${diffMonths.toFixed(1)}개월 경과) — 1년 초과, 재감정 필요`, {
        sectionRef: { sheet: '담보분석', cell: 'C15' },
        suggestedAction: '재감정평가 의뢰 — 시장 변동성 반영 위해 필수',
      }));
    }
  }

  return findings;
}
