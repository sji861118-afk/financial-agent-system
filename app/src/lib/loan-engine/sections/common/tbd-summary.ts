// app/src/lib/loan-engine/sections/common/tbd-summary.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, headerCell, dataCell, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildTBDSummary(data: LoanApplication): SectionContent | null {
  if (data.unresolvedItems.length === 0) return null;
  return [
    emptyLine(),
    sectionTitle('확인필요 / TBD 항목 목록'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([headerCell('No.'), headerCell('섹션'), headerCell('항목'), headerCell('상태')]),
        ...data.unresolvedItems.map(item => row([
          dataCell(String(item.no), { align: AlignmentType.CENTER }),
          dataCell(item.section),
          dataCell(item.item),
          dataCell(item.status),
        ])),
      ],
    }),
  ];
}

registerSection('tbd-summary', buildTBDSummary);
export { buildTBDSummary };
