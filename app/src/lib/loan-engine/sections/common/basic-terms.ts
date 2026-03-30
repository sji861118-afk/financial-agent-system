// app/src/lib/loan-engine/sections/common/basic-terms.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, unitLabel, headerCell, dataCell, emptyLine, row, fmt } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildBasicTerms(data: LoanApplication): SectionContent {
  const t = data.loanTerms;
  const f = data.funding;
  const content: SectionContent = [
    subTitle('1. 기본조건'),
    unitLabel('(단위:백만원)'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([
          headerCell('구분'), headerCell('신청금액'), headerCell('대출기간'),
          headerCell('상환방법'), headerCell('대출금리'), headerCell('연대보증'),
        ]),
        row([
          dataCell(data.meta.applicationType, { align: AlignmentType.CENTER }),
          dataCell(fmt(t.amount), { align: AlignmentType.RIGHT }),
          dataCell(`${t.durationMonths}개월`, { align: AlignmentType.CENTER }),
          dataCell(t.repaymentMethod, { align: AlignmentType.CENTER }),
          dataCell(t.ratePercent ? `${t.ratePercent}%` : '[TBD]', { align: AlignmentType.CENTER }),
          dataCell(t.guarantor || '-', { align: AlignmentType.CENTER }),
        ]),
      ],
    }),
    emptyLine(),
    // Key-value info table
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([
          headerCell('담보종류', { width: 15 }), dataCell(t.collateralType, { width: 35 }),
          headerCell('건전성분류', { width: 15 }), dataCell(t.creditClassification, { width: 35 }),
        ]),
        row([
          headerCell('자금용도'), dataCell(t.purpose),
          headerCell('상환재원'), dataCell(t.repaymentSource),
        ]),
        row([
          headerCell('이자지급'), dataCell(t.interestPayment || '-'),
          headerCell('조기상환수수료'), dataCell(t.earlyRepaymentFee || '-'),
        ]),
      ],
    }),
    emptyLine(),
  ];

  // Cash In/Out table
  if (f.cashIn.length > 0) {
    content.push(
      subTitle('■ 자금용도(안)'),
      unitLabel('(단위:백만원)'),
    );
    const maxRows = Math.max(f.cashIn.length, f.cashOut.length);
    const tableRows = [
      row([headerCell('Cash In', { width: 25 }), headerCell('금액', { width: 25 }),
           headerCell('Cash Out', { width: 25 }), headerCell('금액', { width: 25 })]),
    ];
    for (let i = 0; i < maxRows; i++) {
      const ci = f.cashIn[i];
      const co = f.cashOut[i];
      tableRows.push(row([
        dataCell(ci?.item || ''), dataCell(ci ? fmt(ci.amount) : '', { align: AlignmentType.RIGHT }),
        dataCell(co?.item || ''), dataCell(co ? fmt(co.amount) : '', { align: AlignmentType.RIGHT }),
      ]));
    }
    const totalIn = f.cashIn.reduce((s, x) => s + x.amount, 0);
    const totalOut = f.cashOut.reduce((s, x) => s + x.amount, 0);
    tableRows.push(row([
      headerCell('합계'), dataCell(fmt(totalIn), { align: AlignmentType.RIGHT, bold: true }),
      headerCell('합계'), dataCell(fmt(totalOut), { align: AlignmentType.RIGHT, bold: true }),
    ]));
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
    content.push(emptyLine());
  }

  // Detailed funding structure (if present)
  if (f.detailedFunding) {
    const df = f.detailedFunding;
    content.push(subTitle(`■ ${df.label}`), unitLabel('(단위:백만원)'));
    const headers = df.items.map(i => i.category);
    const fundRows = [
      row([headerCell('구분'), ...headers.map(h => headerCell(h)), headerCell('합계')]),
      row([headerCell('금액'), ...df.items.map(i => dataCell(fmt(i.amount), { align: AlignmentType.RIGHT })),
           dataCell(fmt(df.total), { align: AlignmentType.RIGHT, bold: true })]),
    ];
    if (df.items.some(i => i.pct !== undefined)) {
      fundRows.push(row([headerCell('비율'),
        ...df.items.map(i => dataCell(i.pct !== undefined ? `${i.pct.toFixed(2)}%` : '-', { align: AlignmentType.CENTER })),
        dataCell('100.00%', { align: AlignmentType.CENTER }),
      ]));
    }
    if (df.items.some(i => i.note)) {
      fundRows.push(row([headerCell('비고'),
        ...df.items.map(i => dataCell(i.note || '')),
        dataCell(' '),
      ]));
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fundRows }));
    content.push(emptyLine());
  }

  return content;
}

registerSection('basic-terms', buildBasicTerms);
export { buildBasicTerms };
