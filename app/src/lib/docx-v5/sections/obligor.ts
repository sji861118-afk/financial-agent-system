/**
 * 채무관련인 — 차주 기본정보, 주주구성, BS/IS 테이블, 영업현황, 차입금, 연결재무, 유미캐피탈
 */
import { Paragraph, Table } from 'docx';
import { AlignmentType } from 'docx';
import { t, p, emptyP, subTitle, makeTable, headerRow, dataRow, kvTable, pageBreak, SZ_SECTION } from '../builder';
import type { DealDataset, FinancialRow } from '../types';

export function buildObligor(data: DealDataset): (Paragraph | Table)[] {
  const b = data.borrower;
  const result: (Paragraph | Table)[] = [
    pageBreak(),
    p([t('채무관련인 현황', { bold: true, size: SZ_SECTION })], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 160 },
    }),
  ];

  // 1. 차주사 현황
  result.push(subTitle('1. 차주사 현황'));

  // 1-1. 기본정보
  result.push(p([t('1-1. 기본정보', { bold: true })]));
  result.push(kvTable([
    ['기업명', b.name],
    ['대표자', b.representative],
    ['사업자번호', b.businessNumber],
    ['법인등록번호', b.corporateNumber],
    ['설립일', b.establishedDate],
    ['업종', b.industry],
    ['소재지', b.address],
    ['기업형태', b.companyType],
    ['임직원수', b.employees],
    ['자본금', b.capital],
    ['결산월', b.fiscalMonth],
  ]));
  result.push(emptyP());

  // 주주구성
  if (b.shareholders.length > 0) {
    result.push(p([t('주주구성', { bold: true })]));
    result.push(makeTable([
      headerRow(['주주명', '주식종류', '주식수', '지분율']),
      ...b.shareholders.map(sh => dataRow([sh.name, sh.stockType, sh.shares, sh.ratio])),
    ]));
    result.push(emptyP());
  }

  // 1-2. BS
  if (b.bsData.length > 0) {
    const years = Object.keys(b.bsData[0].values);
    result.push(p([t('1-2. 재무상태표 [개별]', { bold: true })], { spacing: { after: 60 } }));
    result.push(buildFinancialTable(years, b.bsData));
    result.push(emptyP());
  }

  // 1-2. IS
  if (b.isData.length > 0) {
    const years = Object.keys(b.isData[0].values);
    result.push(p([t('1-2. 손익계산서 [개별]', { bold: true })], { spacing: { after: 60 } }));
    result.push(buildFinancialTable(years, b.isData));
    result.push(emptyP());
  }

  // 1-3. 영업현황
  if (b.operatingStatus.length > 0) {
    result.push(p([t('1-3. 영업현황', { bold: true })], { spacing: { after: 60 } }));
    result.push(kvTable(
      b.operatingStatus.map(os => [os.label, os.value] as [string, string])
    ));
    result.push(emptyP());
  }

  // 1-4. 차입금 현황
  if (data.borrowings.bySource.length > 0) {
    result.push(p([t('1-4. 차입금 현황', { bold: true })], { spacing: { after: 60 } }));
    result.push(makeTable([
      headerRow(['조달원', '건수', '잔액(백만원)', '평균금리']),
      ...data.borrowings.bySource.map(bs => dataRow([bs.source, bs.count, bs.balance, bs.avgRate])),
      dataRow(['합계', `${data.borrowings.totalCount}건`, data.borrowings.totalAmount.toLocaleString('ko-KR'), ''], { bold: true, shading: 'F2F2F2' }),
    ]));
    result.push(emptyP());
  }

  // 1-5. 연결 재무
  if (b.consolidatedBs && b.consolidatedBs.length > 0) {
    result.push(p([t('1-5. 연결 재무현황', { bold: true })], { spacing: { after: 60 } }));
    const years = Object.keys(b.consolidatedBs[0].values);
    result.push(p([t('연결 재무상태표', { bold: true })]));
    result.push(buildFinancialTable(years, b.consolidatedBs));
    result.push(emptyP());
    if (b.consolidatedIs && b.consolidatedIs.length > 0) {
      result.push(p([t('연결 손익계산서', { bold: true })]));
      result.push(buildFinancialTable(years, b.consolidatedIs));
    }
  }

  // 유미캐피탈 (자회사)
  if (data.subsidiary) {
    result.push(...buildSubsidiary(data.subsidiary));
  }

  return result;
}

function buildSubsidiary(sub: NonNullable<DealDataset['subsidiary']>): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [
    pageBreak(),
    subTitle(`2. ${sub.name} 현황`),
  ];

  result.push(p([t('2-1. 기본정보', { bold: true })]));
  result.push(kvTable([
    ['기업명', sub.name],
    ['대표자', sub.representative],
    ['설립일', sub.establishedDate],
    ['업종', sub.industry],
    ['지분관계', sub.relationship],
    ['기업형태', sub.companyType],
    ['소재지', sub.address],
  ]));
  result.push(emptyP());

  // BS
  if (sub.bsData.length > 0) {
    result.push(p([t('2-2. 재무현황', { bold: true })]));
    const years = Object.keys(sub.bsData[0].values);
    result.push(buildFinancialTable(years, sub.bsData));
    result.push(emptyP());
  }

  // IS
  if (sub.isData.length > 0) {
    result.push(buildFinancialTable(Object.keys(sub.isData[0].values), sub.isData));
    result.push(emptyP());
  }

  // 분석 코멘트
  if (sub.analysisComment) {
    result.push(p([t('재무분석 코멘트', { bold: true })]));
    result.push(p(sub.analysisComment));
  }

  return result;
}

function buildFinancialTable(years: string[], rows: FinancialRow[]): Table {
  return makeTable([
    headerRow(['계정과목', ...years]),
    ...rows.map(r => dataRow(
      [r.label, ...years.map(y => r.values[y] || '')],
      { bold: r.bold, shading: r.shading }
    )),
  ]);
}
