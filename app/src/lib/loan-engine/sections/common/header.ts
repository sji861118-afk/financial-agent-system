// app/src/lib/loan-engine/sections/common/header.ts
import { Paragraph, Table, TextRun, AlignmentType, WidthType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { FONT, FONT_SIZE_TITLE, headerCell, dataCell, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildHeader(data: LoanApplication): SectionContent {
  return [
    new Paragraph({
      children: [new TextRun({ text: '여 신 승 인 신 청 서', bold: true, font: FONT, size: FONT_SIZE_TITLE })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    // 결재란
    new Table({
      width: { size: 50, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.RIGHT,
      rows: [
        row([headerCell('담당'), headerCell('책임자'), headerCell('본부장'), headerCell('담당'), headerCell('임원')]),
        row([dataCell(' '), dataCell(' '), dataCell(' '), dataCell(' '), dataCell(' ')]),
      ],
    }),
    emptyLine(),
  ];
}

registerSection('header', buildHeader);
export { buildHeader };
