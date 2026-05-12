/**
 * 검토의견 (6개 □ 단락)
 */
import { Paragraph, Table } from 'docx';
import { sectionTitle, p } from '../builder';
import type { DealDataset } from '../types';

export function buildOpinion(data: DealDataset): (Paragraph | Table)[] {
  const dept = data.deal.departmentName || '기업금융1본부';
  const result: (Paragraph | Table)[] = [
    sectionTitle('3', `신청점 종합의견 (${dept})`),
  ];

  for (const text of data.opinion.paragraphs) {
    result.push(p(`□ ${text}`, { spacing: { after: 80 } }));
  }

  return result;
}
