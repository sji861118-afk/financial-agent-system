// app/src/lib/loan-engine/sections/common/financial-opinion.ts
import type { LoanApplication, SectionContent } from '../../types';
import { subTitle, bodyText, emptyLine } from '../helpers';
import { registerSection } from '../registry';

function buildFinancialOpinion(data: LoanApplication): SectionContent | null {
  if (!data.aiContent.financialAnalysis) return null;
  return [
    subTitle('재무분석 소견'),
    bodyText(data.aiContent.financialAnalysis),
    emptyLine(),
  ];
}

registerSection('financial-opinion', buildFinancialOpinion);
export { buildFinancialOpinion };
