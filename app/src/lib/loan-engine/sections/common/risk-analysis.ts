// app/src/lib/loan-engine/sections/common/risk-analysis.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, bodyText, tbdText, emptyLine, pageBreak } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildRiskAnalysis(data: LoanApplication): SectionContent {
  const content: SectionContent = [pageBreak(), sectionTitle('이자 상환능력 및 리스크 분석'), emptyLine()];

  if (data.aiContent.riskAnalysis) {
    content.push(bodyText(data.aiContent.riskAnalysis), emptyLine());
    return content;
  }

  // Fallback: manual [TBD] or static content from typeSpecific
  content.push(tbdText('[리스크 분석 — AI 생성 또는 수동 작성 필요]'), emptyLine());
  return content;
}

registerSection('risk-analysis', buildRiskAnalysis);
export { buildRiskAnalysis };
