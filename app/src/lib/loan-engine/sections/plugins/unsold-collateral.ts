// app/src/lib/loan-engine/sections/plugins/unsold-collateral.ts
// 미분양담보대출 전용 섹션: 담보분석, 사업성분석, 민감도분석
import { Table, WidthType, AlignmentType } from 'docx';
import type {
  LoanApplication, SectionContent, UnsoldCollateralData, UnsoldUnit, SensitivityScenario,
} from '../../types';
import {
  sectionTitle, subTitle, unitLabel, bodyText, headerCell, dataCell, emptyLine, row, fmt, pageBreak,
} from '../helpers';
import { registerSection } from '../registry';

function buildUnsoldCollateral(data: LoanApplication): SectionContent | null {
  if (data.typeSpecific.type !== 'unsold-collateral') return null;
  const uc = data.typeSpecific.data as UnsoldCollateralData;
  if (!uc) return null;

  const content: SectionContent = [];

  // ─── 1. 담보분석 ───
  content.push(sectionTitle('■ 담보분석'));

  // 1-1. 담보 조사
  if (uc.collateral) {
    const c = uc.collateral;
    content.push(subTitle('1. 담보 조사'), unitLabel('(단위: 백만원)'));
    const infoRows = [
      row([headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 }),
           headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 })]),
      row([dataCell('소재지'), dataCell(c.location),
           dataCell('소유자'), dataCell(uc.project?.developer || '-')]),
      row([dataCell('감정기관'), dataCell(c.appraiser || '-'),
           dataCell('감정일'), dataCell(c.appraisalDate || '-')]),
      row([dataCell('감정가'), dataCell(c.appraisalValue ? `${fmt(c.appraisalValue)}백만원` : '-'),
           dataCell('LTV'), dataCell(data.loanTerms.ratePercent
             ? `${((data.loanTerms.amount / (c.appraisalValue || 1)) * 100).toFixed(1)}%`
             : '-')]),
    ];
    if (c.trustee) {
      infoRows.push(row([dataCell('수탁자'), dataCell(c.trustee),
                          dataCell('신탁유형'), dataCell(c.trustType || '-')]));
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: infoRows }));
    content.push(emptyLine());
  }

  // 1-2. 호실별 상세
  if (uc.units && uc.units.length > 0) {
    content.push(subTitle('4-1. 당행 담보대상 상세'), unitLabel('(단위: 백만원)'));
    const unitRows = [
      row([
        headerCell('No.', { width: 5 }),
        headerCell('동', { width: 8 }),
        headerCell('호', { width: 8 }),
        headerCell('타입', { width: 8 }),
        headerCell('전용(㎡)', { width: 10 }),
        headerCell('분양가', { width: 12 }),
        headerCell('감정가', { width: 12 }),
        headerCell('담보가격', { width: 12 }),
        headerCell('LTV', { width: 8 }),
        headerCell('비고', { width: 17 }),
      ]),
    ];

    let totalSalesPrice = 0;
    let totalAppraisalValue = 0;
    let totalCollateralValue = 0;

    for (const u of uc.units) {
      totalSalesPrice += u.salesPrice || 0;
      totalAppraisalValue += u.appraisalValue || 0;
      totalCollateralValue += u.collateralValue || 0;

      unitRows.push(row([
        dataCell(String(u.no), { align: AlignmentType.CENTER }),
        dataCell(u.building, { align: AlignmentType.CENTER }),
        dataCell(u.unit, { align: AlignmentType.CENTER }),
        dataCell(u.type || '-', { align: AlignmentType.CENTER }),
        dataCell(u.exclusiveArea ? u.exclusiveArea.toFixed(1) : '-', { align: AlignmentType.RIGHT }),
        dataCell(u.salesPrice ? fmt(u.salesPrice) : '-', { align: AlignmentType.RIGHT }),
        dataCell(u.appraisalValue ? fmt(u.appraisalValue) : '-', { align: AlignmentType.RIGHT }),
        dataCell(u.collateralValue ? fmt(u.collateralValue) : '-', { align: AlignmentType.RIGHT }),
        dataCell(u.ltv ? `${u.ltv.toFixed(1)}%` : '-', { align: AlignmentType.CENTER }),
        dataCell(u.note || '', { align: AlignmentType.LEFT }),
      ]));
    }

    // 합계행
    unitRows.push(row([
      headerCell('합계', { width: 5 }),
      dataCell('', { align: AlignmentType.CENTER }),
      dataCell(`${uc.units.length}호실`, { align: AlignmentType.CENTER, bold: true }),
      dataCell(''),
      dataCell(''),
      dataCell(fmt(totalSalesPrice), { align: AlignmentType.RIGHT, bold: true }),
      dataCell(fmt(totalAppraisalValue), { align: AlignmentType.RIGHT, bold: true }),
      dataCell(fmt(totalCollateralValue), { align: AlignmentType.RIGHT, bold: true }),
      dataCell(totalAppraisalValue > 0
        ? `${((data.loanTerms.amount / totalAppraisalValue) * 100).toFixed(1)}%`
        : '-', { align: AlignmentType.CENTER, bold: true }),
      dataCell(''),
    ]));

    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: unitRows }));
    content.push(emptyLine());
  }

  // ─── 2. 사업성분석 ───
  if (uc.project) {
    const p = uc.project;
    content.push(pageBreak(), sectionTitle('■ 사업성분석'));
    content.push(subTitle('1. 사업개요'), unitLabel('(단위: 백만원)'));

    const projRows = [
      row([headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 }),
           headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 })]),
      row([dataCell('사업명'), dataCell(p.name),
           dataCell('소재지'), dataCell(p.location)]),
      row([dataCell('시행사'), dataCell(p.developer || '-'),
           dataCell('시공사'), dataCell(p.generalContractor || '-')]),
    ];
    if (p.landArea || p.grossFloorArea) {
      projRows.push(row([
        dataCell('대지면적'), dataCell(p.landArea ? `${p.landArea.toLocaleString()}㎡` : '-'),
        dataCell('연면적'), dataCell(p.grossFloorArea ? `${p.grossFloorArea.toLocaleString()}㎡` : '-'),
      ]));
    }
    if (p.floors || p.completionDate) {
      projRows.push(row([
        dataCell('건축규모'), dataCell(p.floors || '-'),
        dataCell('준공일'), dataCell(p.completionDate || '-'),
      ]));
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: projRows }));
    content.push(emptyLine());

    // 분양현황
    if (p.totalUnits) {
      content.push(subTitle('4-2. 분양현황'), unitLabel('(호실 기준)'));
      const salesRows = [
        row([headerCell('구분', { width: 30 }), headerCell('전체', { width: 20 }),
             headerCell('분양호실', { width: 20 }), headerCell('미분양호실', { width: 15 }),
             headerCell('분양률', { width: 15 })]),
        row([
          dataCell('호실수'),
          dataCell(String(p.totalUnits), { align: AlignmentType.RIGHT }),
          dataCell(String(p.soldUnits ?? '-'), { align: AlignmentType.RIGHT }),
          dataCell(String(p.unsoldUnits ?? '-'), { align: AlignmentType.RIGHT }),
          dataCell(p.salesRate ? `${p.salesRate.toFixed(1)}%` : '-', { align: AlignmentType.CENTER }),
        ]),
      ];

      // 금액 기준
      if (uc.salesAmount) {
        const sa = uc.salesAmount;
        salesRows.push(row([
          dataCell('분양금액(백만원)'),
          dataCell(sa.totalSalesValue ? fmt(sa.totalSalesValue) : '-', { align: AlignmentType.RIGHT }),
          dataCell(sa.paidAmount ? fmt(sa.paidAmount) : '-', { align: AlignmentType.RIGHT }),
          dataCell(sa.unpaidAmount ? fmt(sa.unpaidAmount) : '-', { align: AlignmentType.RIGHT }),
          dataCell(sa.salesRateByAmount ? `${sa.salesRateByAmount.toFixed(1)}%` : '-', { align: AlignmentType.CENTER }),
        ]));
      }

      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: salesRows }));
      content.push(emptyLine());
    }
  }

  // ─── 3. 민감도분석 ───
  if (uc.sensitivity && uc.sensitivity.length > 0) {
    content.push(pageBreak(), sectionTitle('■ 민감도분석 (EXIT 시나리오)'));
    content.push(subTitle('7-1. 분양률별 LTV 시나리오'), unitLabel('(단위: 백만원)'));

    const senRows = [
      row([
        headerCell('분양률', { width: 12 }),
        headerCell('분양수입금', { width: 18 }),
        headerCell('대출잔액', { width: 18 }),
        headerCell('잔여분양가', { width: 18 }),
        headerCell('미분양LTV', { width: 15 }),
        headerCell('비고', { width: 19 }),
      ]),
    ];

    for (const s of uc.sensitivity) {
      senRows.push(row([
        dataCell(`${s.salesRate.toFixed(1)}%`, { align: AlignmentType.CENTER }),
        dataCell(s.salesRevenue ? fmt(s.salesRevenue) : '-', { align: AlignmentType.RIGHT }),
        dataCell(s.loanBalance ? fmt(s.loanBalance) : '-', { align: AlignmentType.RIGHT }),
        dataCell(s.unsoldValue ? fmt(s.unsoldValue) : '-', { align: AlignmentType.RIGHT }),
        dataCell(s.unsoldLtv ? `${s.unsoldLtv.toFixed(1)}%` : '-', { align: AlignmentType.CENTER }),
        dataCell(s.note || ''),
      ]));
    }

    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: senRows }));
    content.push(emptyLine());

    // 분석 코멘트
    const currentRate = uc.project?.salesRate;
    if (currentRate) {
      content.push(bodyText(
        `현재 분양률 ${currentRate.toFixed(1)}% 기준, 본건 대출금 ${fmt(data.loanTerms.amount)}백만원 대비 ` +
        `담보가치의 적정성을 분양률 변동에 따라 검토함.`
      ));
      content.push(emptyLine());
    }
  }

  return content.length > 1 ? content : null;
}

registerSection('plugin:unsold-collateral', buildUnsoldCollateral);
export { buildUnsoldCollateral };
