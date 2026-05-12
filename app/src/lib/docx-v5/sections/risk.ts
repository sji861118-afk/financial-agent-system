/**
 * 이자상환능력 + 리스크 + 체크리스트
 */
import { Paragraph, Table } from 'docx';
import { AlignmentType } from 'docx';
import { t, p, emptyP, subTitle, makeTable, headerRow, dataRow, pageBreak, SZ_SECTION } from '../builder';
import type { DealDataset } from '../types';

export function buildRisk(data: DealDataset): (Paragraph | Table)[] {
  const d = data.deal;
  const r = data.risks;
  const result: (Paragraph | Table)[] = [
    pageBreak(),
    p([t('이자 상환능력 및 리스크 분석', { bold: true, size: SZ_SECTION })], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 160 },
    }),
  ];

  // 1. 금리산출
  result.push(subTitle('1. 금리산출'));
  if (d.tranches.length > 0) {
    result.push(makeTable([
      headerRow(['Tranche', '대주', '금액(백만원)', '금리', '수수료(백만원)', 'AIC', '연간이자(백만원)']),
      ...d.tranches.map(tr => dataRow([
        tr.name, tr.lender, fmt(tr.amount), tr.rate,
        tr.fee > 0 ? fmt(tr.fee) : '-', tr.aic, fmt(tr.annualInterest),
      ])),
      dataRow([
        '합계', '', fmt(d.totalAmount), '',
        fmt(d.tranches.reduce((s, tr) => s + tr.fee, 0)), '',
        fmt(d.tranches.reduce((s, tr) => s + tr.annualInterest, 0)),
      ], { bold: true, shading: 'F2F2F2' }),
    ]));
    result.push(emptyP());
  }

  // 2. 이자납입 분석
  result.push(subTitle('2. 이자납입 분석'));
  for (const text of r.interestAnalysisText) {
    result.push(p(text));
  }
  result.push(emptyP());

  // 3. 원금상환 분석
  result.push(subTitle('3. 원금상환 분석'));
  for (const text of r.principalAnalysisText) {
    result.push(p(text));
  }
  result.push(emptyP());

  // 4. 리스크 분석
  result.push(subTitle('4. 리스크 분석'));
  if (r.riskItems.length > 0) {
    result.push(makeTable([
      headerRow(['리스크 항목', '내용', '대응방안']),
      ...r.riskItems.map(ri => dataRow(
        [ri.risk, ri.description, ri.mitigation],
        { alignments: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.LEFT] }
      )),
    ]));
  }

  // 체크리스트
  if (data.checklist.length > 0) {
    result.push(pageBreak());
    result.push(p([t('체크리스트', { bold: true, size: SZ_SECTION })], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 160 },
    }));
    result.push(makeTable([
      headerRow(['No.', '점검항목', '확인결과']),
      ...data.checklist.map(c => dataRow(
        [String(c.no), c.item, c.result],
        { alignments: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER] }
      )),
    ]));
  }

  return result;
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}
