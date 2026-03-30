// app/src/lib/loan-engine/sections/common/checklist.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, headerCell, dataCell, emptyLine, row } from '../helpers.js';
import { registerSection } from '../registry.js';

const DEFAULT_ITEMS = [
  '차주 신용도 및 재무건전성 확인',
  '담보물 평가의 적정성',
  '자금용도의 합리성 및 상환재원의 확실성',
  '대출금리의 적정성',
  '채권보전 조건의 충분성',
  '관련 법규 및 내규 준수 여부',
  '이해상충 여부 확인',
  '차주 및 보증인 동의서 징구 여부',
];

function buildChecklist(data: LoanApplication): SectionContent {
  return [
    sectionTitle('신청내용 영업점 자체점검 Check List'),
    emptyLine(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row([headerCell('No.', { width: 6 }), headerCell('자체 점검사항', { width: 64 }), headerCell('점검결과', { width: 30 })]),
        ...DEFAULT_ITEMS.map((item, i) => row([
          dataCell(String(i + 1), { align: AlignmentType.CENTER }),
          dataCell(item),
          dataCell('적합', { align: AlignmentType.CENTER }),
        ])),
      ],
    }),
    emptyLine(),
  ];
}

registerSection('checklist', buildChecklist);
export { buildChecklist };
