// app/src/lib/loan-engine/sections/common/borrowings.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, BorrowingDetail } from '../../types.js';
import { subTitle, unitLabel, headerCell, dataCell, bodyText, emptyLine, row, fmt } from '../helpers.js';
import { registerSection } from '../registry.js';

function renderBorrowingDetail(detail: BorrowingDetail, prefix: string): SectionContent {
  const content: SectionContent = [
    subTitle(`${prefix}. 차입금 현황`),
    unitLabel(`(단위:백만원 / 출처: ${detail.entityName})`),
    subTitle('■ 차입금 유형별 요약'),
  ];

  const summaryRows = [
    row([headerCell('구분'), headerCell('건수'), headerCell('잔액'),
         headerCell('가중평균금리'), headerCell('만기범위')]),
    ...detail.summary.map(s => row([
      dataCell(s.category, { bold: s.category === '합계' }),
      dataCell(String(s.count), { align: AlignmentType.CENTER, bold: s.category === '합계' }),
      dataCell(fmt(s.balance), { align: AlignmentType.RIGHT, bold: s.category === '합계' }),
      dataCell(s.weightedAvgRate, { align: AlignmentType.CENTER }),
      dataCell(s.maturityRange, { align: AlignmentType.CENTER }),
    ])),
  ];
  content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: summaryRows }), emptyLine());

  if (detail.topLenders?.length) {
    content.push(subTitle('■ 주요 차입처 (잔액 상위)'));
    const lenderRows = [
      row([headerCell('차입처'), headerCell('구분'), headerCell('잔액'),
           headerCell('금리'), headerCell('만기'), headerCell('상환방식')]),
      ...detail.topLenders.map(l => row([
        dataCell(l.lender), dataCell(l.type),
        dataCell(fmt(l.balance), { align: AlignmentType.RIGHT }),
        dataCell(l.rate, { align: AlignmentType.CENTER }),
        dataCell(l.maturity, { align: AlignmentType.CENTER }),
        dataCell(l.repayment),
      ])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: lenderRows }), emptyLine());
  }

  if (detail.note) {
    content.push(bodyText(detail.note), emptyLine());
  }

  return content;
}

function buildBorrowings(data: LoanApplication): SectionContent | null {
  if (data.borrowings.length === 0) return null;

  const content: SectionContent = [];
  // Borrower's own borrowings (prefix: 1-4, etc.)
  for (let i = 0; i < data.borrowings.length; i++) {
    const detail = data.borrowings[i];
    const prefix = i === 0 ? '1-4' : `${i + 1}-4`;
    content.push(...renderBorrowingDetail(detail, prefix));
  }

  return content;
}

registerSection('borrowings', buildBorrowings);
export { buildBorrowings };
