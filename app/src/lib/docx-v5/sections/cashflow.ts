/**
 * 현금흐름 + 충당금 + 보증인
 */
import { Paragraph, Table } from 'docx';
import { t, p, emptyP, subTitle, makeTable, headerRow, dataRow, kvTable } from '../builder';
import type { DealDataset } from '../types';

export function buildCashflow(data: DealDataset): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];

  // 현금흐름
  if (data.cashflow) {
    result.push(emptyP());
    result.push(subTitle('영업현금흐름 분석 (FY25 분기별)'));

    // TM 현금흐름
    const tm = data.cashflow.tmCashflow;
    result.push(p([t(tm.entityName, { bold: true })]));
    result.push(makeTable([
      headerRow(tm.headers),
      ...tm.rows.map(r => dataRow([r.label, ...r.values])),
    ]));
    result.push(emptyP());

    // YM 현금흐름
    if (data.cashflow.ymCashflow) {
      const ym = data.cashflow.ymCashflow;
      result.push(p([t(ym.entityName, { bold: true })]));
      result.push(makeTable([
        headerRow(ym.headers),
        ...ym.rows.map(r => dataRow([r.label, ...r.values])),
      ]));
      result.push(emptyP());
    }
  }

  // 충당금
  if (data.provisions) {
    result.push(subTitle('대손충당금 설정현황'));

    const tmProv = data.provisions.tmProvision;
    result.push(p([t(tmProv.entityName, { bold: true })]));
    result.push(makeTable([
      headerRow(tmProv.headers),
      ...tmProv.rows.map(r => dataRow([r.label, ...r.values])),
    ]));
    result.push(emptyP());

    if (data.provisions.ymProvision) {
      const ymProv = data.provisions.ymProvision;
      result.push(p([t(ymProv.entityName, { bold: true })]));
      result.push(makeTable([
        headerRow(ymProv.headers),
        ...ymProv.rows.map(r => dataRow([r.label, ...r.values])),
      ]));
    }
  }

  // 보증인
  if (data.guarantor) {
    result.push(emptyP());
    result.push(subTitle('연대보증인 현황'));
    result.push(kvTable([
      ['성명', data.guarantor.name],
      ['생년월일', data.guarantor.birthDate || ''],
      ['직위', data.guarantor.position],
      ['차주와의 관계', data.guarantor.relationship],
      ['연대보증 범위', data.guarantor.guaranteeScope],
      ['비고', data.guarantor.note],
    ]));
  }

  return result;
}
