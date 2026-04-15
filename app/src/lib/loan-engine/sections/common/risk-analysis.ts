// app/src/lib/loan-engine/sections/common/risk-analysis.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, RiskAnalysisItem, FinancialStatements } from '../../types';
import { sectionTitle, subTitle, bodyText, tbdText, emptyLine, headerCell, dataCell, row, fmt, pageBreak } from '../helpers';
import { registerSection } from '../registry';
import {
  resolveValue, findVal, findAny, parseRatioPct,
  collectSeries, trendDirection, sumBorrowings,
} from '../financial-utils';

// ─── Risk Category Detectors ───

/** Escalate likelihood: only go higher, never downgrade */
function escalate(
  current: '● 높음' | '● 보통' | '● 낮음',
  level: '● 높음' | '● 보통' | '● 낮음',
): '● 높음' | '● 보통' | '● 낮음' {
  const order = { '● 높음': 3, '● 보통': 2, '● 낮음': 1 } as const;
  return order[level] > order[current] ? level : current;
}

function detectCreditRisk(fs: FinancialStatements): RiskAnalysisItem | null {
  const years = fs.years;
  if (years.length === 0) return null;
  const cur = years[years.length - 1];

  const analysisLines: string[] = [];
  let likelihood: '● 높음' | '● 보통' | '● 낮음' = '● 낮음';

  // 부채비율
  const debtRatio = fs.ratios?.find(r => r.account.includes('부채비율'));
  if (debtRatio) {
    const val = resolveValue(debtRatio, cur);
    const pct = parseRatioPct(val);
    if (pct !== null) {
      analysisLines.push(`부채비율 ${typeof val === 'string' ? val : pct.toFixed(1) + '%'}`);
      if (pct > 400) likelihood = escalate(likelihood, '● 높음');
      else if (pct > 200) likelihood = escalate(likelihood, '● 보통');
    }
  } else {
    // 직접 계산
    const totalDebt = findVal(fs.balanceSheet, '부채총계', cur);
    const totalEquity = findVal(fs.balanceSheet, '자본총계', cur);
    if (totalDebt !== null && totalEquity !== null && totalEquity > 0) {
      const ratio = totalDebt / totalEquity * 100;
      analysisLines.push(`부채비율 ${ratio.toFixed(1)}%`);
      if (ratio > 400) likelihood = escalate(likelihood, '● 높음');
      else if (ratio > 200) likelihood = escalate(likelihood, '● 보통');
    }
  }

  // 자기자본비율
  const eqRatio = fs.ratios?.find(r => r.account.includes('자기자본비율'));
  if (eqRatio) {
    const val = resolveValue(eqRatio, cur);
    const pct = parseRatioPct(val);
    if (pct !== null) {
      analysisLines.push(`자기자본비율 ${typeof val === 'string' ? val : pct.toFixed(1) + '%'}`);
      if (pct < 10) {
        analysisLines.push('자본적정성 취약(10% 미만)');
        likelihood = escalate(likelihood, '● 높음');
      } else if (pct < 20) {
        analysisLines.push('자본적정성 유의(20% 미만)');
        likelihood = escalate(likelihood, '● 보통');
      }
    }
  }

  if (analysisLines.length === 0) return null;
  return { category: '신용리스크', analysis: analysisLines.join('. '), likelihood };
}

function detectLiquidityRisk(fs: FinancialStatements): RiskAnalysisItem | null {
  const years = fs.years;
  if (years.length === 0) return null;
  const cur = years[years.length - 1];
  const bs = fs.balanceSheet;

  const analysisLines: string[] = [];
  let likelihood: '● 높음' | '● 보통' | '● 낮음' = '● 낮음';

  const totalAsset = findVal(bs, '자산총계', cur);
  const cash = findAny(bs, ['현금및예치금', '현금및현금성자산', '현금'], cur);

  if (cash !== null && totalAsset !== null && totalAsset > 0) {
    const cashPct = cash / totalAsset * 100;
    analysisLines.push(`현금성자산 ${fmt(cash)}백만원(자산대비 ${cashPct.toFixed(1)}%)`);
    if (cashPct < 3) {
      analysisLines.push('유동성 여력 제한적');
      likelihood = '● 높음';
    } else if (cashPct < 5) {
      analysisLines.push('유동성 유의');
      likelihood = '● 보통';
    }
  }

  // 유동비율
  const currentAsset = findAny(bs, ['유동자산'], cur);
  const currentLiab = findAny(bs, ['유동부채'], cur);
  if (currentAsset !== null && currentLiab !== null && currentLiab > 0) {
    const currentRatio = currentAsset / currentLiab * 100;
    analysisLines.push(`유동비율 ${currentRatio.toFixed(1)}%`);
    if (currentRatio < 100) {
      likelihood = escalate(likelihood, '● 보통');
      analysisLines.push('유동부채 초과 → 단기 상환 부담');
    }
  }

  if (analysisLines.length === 0) return null;
  return { category: '유동성리스크', analysis: analysisLines.join('. '), likelihood };
}

function detectConcentrationRisk(
  fs: FinancialStatements,
  loanAmount: number,
): RiskAnalysisItem | null {
  const years = fs.years;
  if (years.length === 0 || loanAmount <= 0) return null;
  const cur = years[years.length - 1];

  const borrowInfo = sumBorrowings(fs.balanceSheet, cur);
  const totalBorrow = borrowInfo.total;

  if (totalBorrow <= 0) return null;

  const concentration = loanAmount / (totalBorrow + loanAmount) * 100;
  const analysisLines: string[] = [];
  analysisLines.push(`총차입금 ${fmt(totalBorrow)}백만원, 본건 ${fmt(loanAmount)}백만원`);
  analysisLines.push(`본건 비중 ${concentration.toFixed(1)}% (기존차입금+본건 기준)`);

  let likelihood: '● 높음' | '● 보통' | '● 낮음' = '● 낮음';
  if (concentration > 50) {
    likelihood = '● 높음';
    analysisLines.push('단일 차입금 집중도 과도');
  } else if (concentration > 30) {
    likelihood = '● 보통';
    analysisLines.push('차입금 집중도 유의');
  }

  return { category: '차입금집중리스크', analysis: analysisLines.join('. '), likelihood };
}

function detectProfitabilityRisk(fs: FinancialStatements): RiskAnalysisItem | null {
  const years = fs.years;
  if (years.length < 2) return null;
  const cur = years[years.length - 1];
  const is = fs.incomeStatement;

  const analysisLines: string[] = [];
  let likelihood: '● 높음' | '● 보통' | '● 낮음' = '● 낮음';

  const netIncome = findAny(is, ['당기순이익', '당기순이익(손실)'], cur);
  const opIncome = findAny(is, ['영업이익', '영업이익(손실)'], cur);
  const isLoss = netIncome !== null && netIncome < 0;

  // 영업이익 추세
  const opSeries = years.map(y => findAny(is, ['영업이익', '영업이익(손실)'], y));
  const opTrend = trendDirection(opSeries);

  if (opIncome !== null) {
    analysisLines.push(`영업이익 ${fmt(opIncome)}백만원`);
  }
  if (netIncome !== null) {
    analysisLines.push(`당기순이익 ${fmt(netIncome)}백만원`);
  }

  if (opTrend === '감소' && isLoss) {
    likelihood = '● 높음';
    analysisLines.push('영업이익 감소 추세 + 당기순손실');
  } else if (opTrend === '감소') {
    likelihood = '● 보통';
    analysisLines.push('영업이익 감소 추세');
  } else if (isLoss) {
    likelihood = '● 보통';
    analysisLines.push('당기순손실 발생');
  } else if (opTrend) {
    analysisLines.push(`영업이익 ${opTrend} 추세`);
  }

  // 영업이익률
  const revenue = findAny(is, ['영업수익', '매출액'], cur);
  if (opIncome !== null && revenue !== null && revenue > 0) {
    const margin = opIncome / revenue * 100;
    analysisLines.push(`영업이익률 ${margin.toFixed(1)}%`);
    if (margin < 0) {
      if (likelihood !== '● 높음') likelihood = '● 보통';
    }
  }

  if (analysisLines.length === 0) return null;
  return { category: '수익성리스크', analysis: analysisLines.join('. '), likelihood };
}

function detectInterestCoverageRisk(fs: FinancialStatements): RiskAnalysisItem | null {
  const years = fs.years;
  if (years.length === 0) return null;
  const cur = years[years.length - 1];
  const is = fs.incomeStatement;

  const opIncome = findAny(is, ['영업이익', '영업이익(손실)'], cur);
  const interest = findAny(is, ['이자비용', '금융비용(이자비용)', '금융비용'], cur);

  if (opIncome === null || interest === null || interest <= 0) return null;

  const icr = opIncome / interest;
  const analysisLines: string[] = [];
  analysisLines.push(`이자보상배율 ${icr.toFixed(2)}배 (영업이익 ${fmt(opIncome)} / 이자비용 ${fmt(interest)})`);

  let likelihood: '● 높음' | '● 보통' | '● 낮음' = '● 낮음';
  if (icr < 1) {
    likelihood = '● 높음';
    analysisLines.push('영업이익으로 이자비용 감당 불가');
  } else if (icr < 1.5) {
    likelihood = '● 보통';
    analysisLines.push('이자지급 여력 제한적');
  } else if (icr >= 3) {
    analysisLines.push('이자지급 여력 양호');
  }

  return { category: '이자보상리스크', analysis: analysisLines.join('. '), likelihood };
}

function detectCollateralRisk(data: LoanApplication): RiskAnalysisItem | null {
  let ltv: number | null = null;
  let detail = '';

  if (data.typeSpecific.type === 'equity-pledge' && data.typeSpecific.data.collateralValue?.ltv) {
    ltv = data.typeSpecific.data.collateralValue.ltv;
    detail = `담보가치 ${fmt(data.typeSpecific.data.collateralValue.valuationAmount)}백만원`;
  } else if (data.typeSpecific.type === 'unsold-collateral') {
    const ucd = data.typeSpecific.data;
    if (ucd.units?.length) {
      const validLtvs = ucd.units.filter(u => u.ltv != null).map(u => u.ltv!);
      if (validLtvs.length > 0) {
        ltv = validLtvs.reduce((s, v) => s + v, 0) / validLtvs.length;
        detail = `평균 LTV (${validLtvs.length}개 호실 기준)`;
      }
    }
    if (ltv === null && ucd.collateral?.appraisalValue && data.loanTerms.amount > 0) {
      ltv = data.loanTerms.amount / ucd.collateral.appraisalValue * 100;
      detail = `감정가 ${fmt(ucd.collateral.appraisalValue)}백만원 기준`;
    }
  }

  if (ltv === null) return null;

  const analysisLines: string[] = [];
  if (detail) analysisLines.push(detail);
  analysisLines.push(`LTV ${ltv.toFixed(1)}%`);

  let likelihood: '● 높음' | '● 보통' | '● 낮음' = '● 낮음';
  if (ltv > 80) {
    likelihood = '● 높음';
    analysisLines.push('LTV 80% 초과 → 담보 부족 위험');
  } else if (ltv > 60) {
    likelihood = '● 보통';
    analysisLines.push('LTV 60~80% → 담보가치 변동에 유의');
  } else {
    analysisLines.push('담보 여력 양호');
  }

  return { category: '담보가치리스크', analysis: analysisLines.join('. '), likelihood };
}

// ─── Main Generator ───

function generateRiskItems(data: LoanApplication): RiskAnalysisItem[] {
  const fs = data.financials.borrower;
  const items: RiskAnalysisItem[] = [];

  const credit = detectCreditRisk(fs);
  if (credit) items.push(credit);

  const liquidity = detectLiquidityRisk(fs);
  if (liquidity) items.push(liquidity);

  const concentration = detectConcentrationRisk(fs, data.loanTerms.amount);
  if (concentration) items.push(concentration);

  const profitability = detectProfitabilityRisk(fs);
  if (profitability) items.push(profitability);

  const interestCoverage = detectInterestCoverageRisk(fs);
  if (interestCoverage) items.push(interestCoverage);

  const collateral = detectCollateralRisk(data);
  if (collateral) items.push(collateral);

  return items;
}

// ─── Section Builder ───

function buildRiskAnalysis(data: LoanApplication): SectionContent {
  const content: SectionContent = [pageBreak(), sectionTitle('이자 상환능력 및 리스크 분석'), emptyLine()];

  const riskItems = generateRiskItems(data);

  // Append manual/opinion-based risk text as additional item
  if (data.aiContent.riskAnalysis) {
    riskItems.push({
      category: '기타 리스크 요인',
      analysis: data.aiContent.riskAnalysis,
      likelihood: '● 보통',
    });
  }

  if (riskItems.length === 0) {
    content.push(tbdText('[리스크 분석 — 재무데이터 부족으로 자동 생성 불가]'), emptyLine());
    return content;
  }

  // Render as table
  content.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([
          headerCell('리스크 유형', { width: 20 }),
          headerCell('분석 내용', { width: 55 }),
          headerCell('발생가능성', { width: 25 }),
        ]),
        ...riskItems.map(item =>
          row([
            dataCell(item.category, { align: AlignmentType.CENTER }),
            dataCell(item.analysis),
            dataCell(item.likelihood, { align: AlignmentType.CENTER }),
          ])
        ),
      ],
    }),
    emptyLine(),
  );

  // Summary line
  const highCount = riskItems.filter(i => i.likelihood === '● 높음').length;
  const medCount = riskItems.filter(i => i.likelihood === '● 보통').length;
  if (highCount > 0) {
    content.push(bodyText(`※ 높음 ${highCount}건, 보통 ${medCount}건 — 고위험 항목에 대한 보완 조건 검토 필요`));
  } else if (medCount > 0) {
    content.push(bodyText(`※ 보통 ${medCount}건 — 유의 항목에 대한 모니터링 필요`));
  } else {
    content.push(bodyText('※ 전반적 리스크 수준 양호'));
  }
  content.push(emptyLine());

  return content;
}

registerSection('risk-analysis', buildRiskAnalysis);
export { buildRiskAnalysis, generateRiskItems };
