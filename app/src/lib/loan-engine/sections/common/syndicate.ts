// app/src/lib/loan-engine/sections/common/syndicate.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, unitLabel, headerCell, dataCell, emptyLine, row, fmt } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildSyndicate(data: LoanApplication): SectionContent | null {
  if (!data.syndicate) return null;
  const s = data.syndicate;

  const content: SectionContent = [
    subTitle('■ 대주단 구성'),
    unitLabel('(단위:백만원)'),
  ];

  for (const tranche of s.tranches) {
    const trRows = [
      row([headerCell('참여기관'), headerCell('금액'), headerCell('비율'), headerCell('역할')]),
      ...tranche.participants.map(p => row([
        dataCell(p.name),
        dataCell(fmt(p.amount), { align: AlignmentType.RIGHT }),
        dataCell((p.amount / s.totalAmount * 100).toFixed(1) + '%', { align: AlignmentType.CENTER }),
        dataCell(p.role || '-', { align: AlignmentType.CENTER }),
      ])),
    ];
    content.push(
      subTitle(`${tranche.name} (금리: ${tranche.rate ? tranche.rate + '%' : 'TBD'})`),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: trRows }),
      emptyLine(),
    );
  }

  return content;
}

registerSection('syndicate', buildSyndicate);
export { buildSyndicate };
