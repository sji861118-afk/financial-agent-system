/**
 * 기본조건 + 자금용도 + 매입예정채권
 */
import { Paragraph, Table } from 'docx';
import { sectionTitle, subTitle, makeTable, headerRow, dataRow, kvTable, emptyP } from '../builder';
import type { DealDataset } from '../types';

export function buildBasicTerms(data: DealDataset): (Paragraph | Table)[] {
  const d = data.deal;
  const result: (Paragraph | Table)[] = [
    sectionTitle('1', '기본조건'),
  ];

  // 트랜치 테이블
  if (d.tranches.length > 0) {
    result.push(makeTable([
      headerRow(['구분', '대주', '금액(백만원)', '금리', '기간', '수수료(백만원)', 'All-in Cost']),
      ...d.tranches.map(tr => dataRow([
        tr.name, tr.lender, fmt(tr.amount), tr.rate, tr.duration,
        tr.fee > 0 ? fmt(tr.fee) : '-', tr.aic,
      ])),
      dataRow([
        '합계', '', fmt(d.totalAmount), '—', '—',
        fmt(d.tranches.reduce((s, tr) => s + tr.fee, 0)), '—',
      ], { bold: true, shading: 'F2F2F2' }),
    ]));
    result.push(emptyP());
  }

  // KV 조건
  result.push(kvTable([
    ['담보종류', d.collateralType],
    ['건전성분류', d.creditClassification],
    ['자금용도', d.purpose],
    ['상환재원', d.repaymentSource],
    ['상환방법', d.repaymentMethod],
    ['이자지급', d.interestPayment],
    ['연대보증', d.guarantorName],
  ]));
  result.push(emptyP());

  // 자금용도
  if (d.fundUsage.cashIn.length > 0 || d.fundUsage.cashOut.length > 0) {
    result.push(subTitle('자금용도(안)'));
    result.push(makeTable([
      headerRow(['구분', '항목', '금액(백만원)']),
      ...d.fundUsage.cashIn.map(i => dataRow(['Cash In', i.item, fmt(i.amount)])),
      ...d.fundUsage.cashOut.map(i => dataRow(['Cash Out', i.item, fmt(i.amount)])),
    ]));
    result.push(emptyP());
  }

  // 매입예정채권
  if (d.fundingStructure) {
    result.push(subTitle('매입예정채권 자금조달구조'));
    result.push(makeTable([
      headerRow(['구분', '금액(백만원)', '비율']),
      ...d.fundingStructure.items.map(i => dataRow([i.category, fmt(i.amount), i.ratio])),
    ]));
  }

  return result;
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}
