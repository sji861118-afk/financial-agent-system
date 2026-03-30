// app/src/lib/loan-engine/sections/common/interest-rate.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, headerCell, dataCell, bodyText, tbdText, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildInterestRate(data: LoanApplication): SectionContent {
  const r = data.interestRate;
  if (!r.baseRate && !r.appliedRate) {
    return [subTitle('금리산출 및 적용'), tbdText('[TBD: 금리 확정 후 반영]'), emptyLine()];
  }

  const addOnItems = r.addOnRates || [];
  const addOnTotal = addOnItems.reduce((s, x) => s + x.rate, 0);
  const calcTotal = (r.baseRate || 0) + addOnTotal;

  const content: SectionContent = [
    subTitle('금리산출 및 적용'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([headerCell(' '), headerCell('기준금리'), headerCell('가산금리'), headerCell('산출금리'),
             headerCell('금리조정'), headerCell('적용금리')]),
        row([
          headerCell('금리'),
          dataCell(r.baseRate ? `${r.baseRate.toFixed(2)}%` : '-', { align: AlignmentType.CENTER }),
          dataCell(`${addOnTotal.toFixed(2)}%`, { align: AlignmentType.CENTER }),
          dataCell(`${calcTotal.toFixed(2)}%`, { align: AlignmentType.CENTER }),
          dataCell(r.adjustment ? `${r.adjustment > 0 ? '+' : ''}${r.adjustment.toFixed(2)}%` : '-', { align: AlignmentType.CENTER }),
          dataCell(r.appliedRate ? `${r.appliedRate.toFixed(2)}%` : '[TBD]', { align: AlignmentType.CENTER }),
        ]),
      ],
    }),
    emptyLine(),
  ];

  if (addOnItems.length > 0) {
    content.push(
      new Table({
        width: { size: 80, type: WidthType.PERCENTAGE },
        rows: [
          row([headerCell('가산금리 항목'), headerCell('요율')]),
          ...addOnItems.map(a => row([dataCell(a.item), dataCell(`${a.rate.toFixed(2)}%`, { align: AlignmentType.CENTER })])),
        ],
      }),
      emptyLine(),
    );
  }

  if (r.adjustmentReason) {
    content.push(bodyText(`금리조정사유: ${r.adjustmentReason}`), emptyLine());
  }

  return content;
}

registerSection('interest-rate', buildInterestRate);
export { buildInterestRate };
