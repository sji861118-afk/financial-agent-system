/**
 * 채권보전 + 여신조건
 */
import { Paragraph, Table } from 'docx';
import { AlignmentType } from 'docx';
import { sectionTitle, makeTable, headerRow, dataRow, emptyP } from '../builder';
import type { DealDataset } from '../types';

export function buildSecurity(data: DealDataset): (Paragraph | Table)[] {
  const conds = data.deal.conditions;
  const result: (Paragraph | Table)[] = [
    sectionTitle('2', '채권보전사항'),
  ];

  // 보전항목 테이블
  if (conds.securityItems.length > 0) {
    result.push(makeTable([
      headerRow(['No.', '보전항목']),
      ...conds.securityItems.map((item, i) =>
        dataRow([String(i + 1), item], {
          alignments: [AlignmentType.CENTER, AlignmentType.LEFT],
        })
      ),
    ]));
  }

  return result;
}
