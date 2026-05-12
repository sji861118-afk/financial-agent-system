/**
 * 담보분석 — 담보지분 내역, 지분평가, 담보가치/LTV
 */
import { Paragraph, Table } from 'docx';
import { AlignmentType } from 'docx';
import { t, p, emptyP, subTitle, makeTable, headerRow, dataRow, kvTable, pageBreak, SZ_SECTION } from '../builder';
import type { DealDataset } from '../types';

export function buildCollateral(data: DealDataset): (Paragraph | Table)[] {
  const v = data.valuation;
  if (!v) return [];

  const result: (Paragraph | Table)[] = [
    pageBreak(),
    p([t('담보분석 (지분담보)', { bold: true, size: SZ_SECTION })], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 160 },
    }),
  ];

  // 1. 담보지분 내역
  result.push(subTitle('1. 담보지분 내역'));
  result.push(makeTable([
    headerRow(['대상회사', '질권설정자', '주식종류', '주식수', '지분율', '평가액(백만원)', '평가방법']),
    ...v.collateralItems.map(c => dataRow([
      c.company, c.pledger, c.stockType, c.shares, c.ratio, c.value, c.valuationMethod,
    ])),
    dataRow(['합계', '', '', '', '', String(v.totalCollateralValue.toLocaleString('ko-KR')), ''], { bold: true, shading: 'F2F2F2' }),
  ]));
  result.push(p([t(`※ LTV = ${data.deal.totalAmount.toLocaleString('ko-KR')} / ${v.totalCollateralValue.toLocaleString('ko-KR')} × 100 = ${v.ltv}`, { size: 16 })]));
  if (v.ltvNote) {
    result.push(p([t(`※ ${v.ltvNote}`, { size: 16 })]));
  }
  result.push(emptyP());

  // 2. 지분평가 현황
  result.push(subTitle('2. 지분평가 현황 (Valuation Summary)'));
  result.push(kvTable([
    ['평가방법', v.method],
    ['평가기관', v.appraiser],
    ['기준일', v.baseDate],
    ['Ke (자기자본비용)', v.ke],
    ['RF (무위험이자율)', v.keComponents.rf],
    ['MRP (시장위험프리미엄)', v.keComponents.mrp],
    ['β_L (레버리지 베타)', v.keComponents.betaL],
    ['SP (규모프리미엄)', v.keComponents.sizePremium],
    ['g (영구성장률)', v.perpetualGrowthRate],
    ['PV of FCFE', v.pvOfFcfe],
    ['Terminal Value', v.terminalValue],
    ['영업가치', v.operatingValue],
    ['유미캐피탈 지분가치', v.youmeEquityValue],
    ['기타 투자자산', v.otherInvestment],
    ['비영업가치', v.nonOperatingValue],
    ['Equity Value', v.equityValue],
  ]));
  result.push(emptyP());

  // 3. 담보가치 산출
  result.push(subTitle('3. 담보가치 산출'));
  result.push(makeTable([
    headerRow(['담보항목', '지분율', '평가액(백만원)']),
    ...v.collateralItems.map(c => dataRow([`${c.company} 지분`, c.ratio, c.value])),
    dataRow(['총 담보평가액', '', String(v.totalCollateralValue.toLocaleString('ko-KR'))], { bold: true, shading: 'F2F2F2' }),
    dataRow(['본건 대출금', '', String(data.deal.totalAmount.toLocaleString('ko-KR'))]),
    dataRow(['LTV', '', v.ltv], { bold: true }),
  ]));

  return result;
}
