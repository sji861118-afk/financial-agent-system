// app/src/lib/loan-engine/sections/common/conditions-security.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { subTitle, headerCell, dataCell, bodyText, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildConditionsSecurity(data: LoanApplication): SectionContent {
  const content: SectionContent = [];

  // Loan conditions (if any)
  const cond = data.loanConditions;
  const hasConditions = cond.physical?.length || cond.personal?.length ||
    cond.interestReserve?.length || cond.general?.length;

  if (hasConditions) {
    content.push(subTitle('2. 여신조건 상세'));
    if (cond.physical?.length) {
      content.push(bodyText('□ 물적담보'));
      cond.physical.forEach(c => content.push(bodyText(`  ${c}`)));
    }
    if (cond.personal?.length) {
      content.push(bodyText('□ 인적담보'));
      cond.personal.forEach(c => content.push(bodyText(`  ${c}`)));
    }
    if (cond.interestReserve?.length) {
      content.push(bodyText('□ 이자유보'));
      cond.interestReserve.forEach(c => content.push(bodyText(`  ${c}`)));
    }
    if (cond.general?.length) {
      cond.general.forEach(c => content.push(bodyText(`□ ${c}`)));
    }
    if (cond.approvalValidity) {
      content.push(bodyText(`□ 승인 유효기간: ${cond.approvalValidity}`));
    }
    content.push(emptyLine());
  }

  // Collateral security items
  if (data.collateralSecurity.length > 0) {
    const secTitle = hasConditions ? '채권보전사항' : '2. 채권보전사항';
    content.push(subTitle(secTitle));
    const secRows = [
      row([headerCell('No.', { width: 8 }), headerCell('채권보전 내용', { width: 92 })]),
      ...data.collateralSecurity.map(item =>
        row([dataCell(String(item.no), { align: AlignmentType.CENTER }), dataCell(item.description)])
      ),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: secRows }));
    content.push(emptyLine());
  }

  return content;
}

registerSection('conditions-security', buildConditionsSecurity);
export { buildConditionsSecurity };
