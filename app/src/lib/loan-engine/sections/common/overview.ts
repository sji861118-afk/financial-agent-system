// app/src/lib/loan-engine/sections/common/overview.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, bodyText, emptyLine, fmt } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildOverview(data: LoanApplication): SectionContent {
  const b = data.borrower;
  const t = data.loanTerms;
  const overviewText = `본건은 ${b.name}(이하 "차주")가 ${t.purpose} 목적으로 ` +
    `${fmt(t.amount)}백만원(${Math.round(t.amount / 100)}억원)을 ` +
    `대출 신청하는 건임.`;

  return [
    sectionTitle(`차주명 : ${b.name}`),
    emptyLine(),
    sectionTitle('신청개요'),
    bodyText(overviewText),
    emptyLine(),
  ];
}

registerSection('overview', buildOverview);
export { buildOverview };
