/**
 * 재무분석 코멘트 — 6개 ▶ 섹션 (수익성, 건전성, 자본구조, 조달구조, 성장성, 종합리스크)
 */
import { Paragraph, Table } from 'docx';
import { AlignmentType } from 'docx';
import { t, p, emptyP, pageBreak, SZ_SECTION } from '../builder';
import type { DealDataset, AnalysisSection } from '../types';

export function buildAnalysis(data: DealDataset): (Paragraph | Table)[] {
  const f = data.financials;
  const sections: AnalysisSection[] = [
    f.profitability,
    f.assetQuality,
    f.capitalStructure,
    f.fundingStructure,
    f.growth,
    f.comprehensiveRisk,
  ];

  const result: (Paragraph | Table)[] = [
    pageBreak(),
    p([t('재무분석 코멘트', { bold: true, size: SZ_SECTION })], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 160 },
    }),
  ];

  for (const section of sections) {
    result.push(p([t(section.title, { bold: true, size: 20 })], { spacing: { after: 80 } }));
    for (const text of section.paragraphs) {
      result.push(p(text));
    }
    result.push(emptyP());
  }

  return result;
}
