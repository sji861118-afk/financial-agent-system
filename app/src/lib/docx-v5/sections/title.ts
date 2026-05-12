/**
 * 헤더 + 결재란 + 차주명 + 신청개요 + 핵심 재무지표
 */
import { Paragraph, Table } from 'docx';
import { AlignmentType } from 'docx';
import { t, p, emptyP, makeTable, headerRow, dataRow, bullet, SZ_TITLE } from '../builder';
import type { DealDataset } from '../types';

export function buildTitle(data: DealDataset): (Paragraph | Table)[] {
  const d = data.deal;
  return [
    emptyP(),
    p([t('여  신  승  인  신  청  서', { bold: true, size: SZ_TITLE })], {
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    // 결재란
    makeTable([
      headerRow(['담당', '책임자', '본부장', '담당 임원']),
      dataRow(['', '', '', '']),
      dataRow(['', '', '', '']),
    ]),
    emptyP(),

    // 차주명
    p([t(`■ 차주명 : ${d.borrowerName}`, { bold: true, size: 20 })], { spacing: { after: 120 } }),

    // 신청개요
    p([t('■ 신청개요', { bold: true, size: 20 })], { spacing: { after: 80 } }),
    p(d.overviewText, { spacing: { after: 120 } }),

    // 핵심 재무지표
    p([t('▶ 가치산정 기준일 차주 핵심 재무지표', { bold: true, size: 20 })], { spacing: { after: 60 } }),
    ...d.keyMetrics.map(m => bullet(m)),
    ...(d.keyMetricsNote
      ? [p([t(d.keyMetricsNote, { size: 16, italics: true })], { spacing: { after: 120 } })]
      : []),
  ];
}
