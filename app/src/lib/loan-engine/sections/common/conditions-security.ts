// app/src/lib/loan-engine/sections/common/conditions-security.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types';
import { subTitle, headerCell, dataCell, bodyText, bulletText, emptyLine, row } from '../helpers';
import { registerSection } from '../registry';

function buildConditionsSecurity(data: LoanApplication): SectionContent {
  const content: SectionContent = [];
  const cond = data.loanConditions as any;

  // ─── 1. Collateral security items ───
  if (data.collateralSecurity.length > 0) {
    content.push(subTitle('2. 채권보전사항'));
    const secRows = [
      row([headerCell('No.', { width: 8 }), headerCell('채권보전 내용', { width: 92 })]),
      ...data.collateralSecurity.map(item =>
        row([dataCell(String(item.no), { align: AlignmentType.CENTER }), dataCell(item.description)])
      ),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: secRows }));
    content.push(emptyLine());
  }

  // ─── 2. Precedent conditions (인출선행조건) ───
  if (cond.precedentConditions?.length) {
    content.push(subTitle('3. 인출선행조건'));
    for (const c of cond.precedentConditions) {
      content.push(bulletText(c));
    }
    content.push(emptyLine());
  }

  // ─── 3. Subsequent conditions (인출후행조건) ───
  if (cond.subsequentConditions?.length) {
    content.push(subTitle('4. 인출후행조건'));
    for (const c of cond.subsequentConditions) {
      content.push(bulletText(c));
    }
    content.push(emptyLine());
  }

  // ─── 4. General conditions ───
  const hasConditions = cond.physical?.length || cond.personal?.length ||
    cond.interestReserve?.length || cond.general?.length;

  if (hasConditions) {
    content.push(subTitle('5. 여신조건'));
    if (cond.physical?.length) {
      content.push(bodyText('□ 물적담보'));
      cond.physical.forEach((c: string) => content.push(bodyText(`  - ${c}`)));
    }
    if (cond.personal?.length) {
      content.push(bodyText('□ 인적담보'));
      cond.personal.forEach((c: string) => content.push(bodyText(`  - ${c}`)));
    }
    if (cond.interestReserve?.length) {
      content.push(bodyText('□ 이자유보'));
      cond.interestReserve.forEach((c: string) => content.push(bodyText(`  - ${c}`)));
    }
    if (cond.general?.length) {
      cond.general.forEach((c: string) => content.push(bulletText(c)));
    }
    if (cond.approvalValidity) {
      content.push(bodyText(`□ 승인 유효기간: ${cond.approvalValidity}`));
    }
    content.push(emptyLine());
  }

  // ─── 5. Acceleration events (기한이익상실사유) ───
  if (cond.accelerationEvents?.length) {
    content.push(subTitle('6. 기한이익상실사유'));
    for (const c of cond.accelerationEvents) {
      content.push(bulletText(c));
    }
    content.push(emptyLine());
  }

  return content;
}

registerSection('conditions-security', buildConditionsSecurity);
export { buildConditionsSecurity };
