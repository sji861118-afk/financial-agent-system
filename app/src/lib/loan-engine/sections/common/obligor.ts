// app/src/lib/loan-engine/sections/common/obligor.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, FinancialStatements, RelatedEntityFinancials } from '../../types.js';
import {
  sectionTitle, subTitle, unitLabel, bodyText, headerCell, dataCell, emptyLine, row, fmt, pageBreak,
} from '../helpers.js';
import { registerSection } from '../registry.js';

function renderEntityInfo(prefix: string, entity: {
  name: string; representative?: string; businessNumber?: string;
  corporateNumber?: string; establishedDate?: string; industry?: string;
  address?: string; companyType?: string; employeeCount?: number;
  capital?: number; fiscalMonth?: number;
}): SectionContent {
  const rows = [
    row([headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 }),
         headerCell('항목', { width: 20 }), headerCell('내용', { width: 30 })]),
    row([dataCell('기업명'), dataCell(entity.name),
         dataCell('대표자'), dataCell(entity.representative || '-')]),
  ];
  if (entity.businessNumber) {
    rows.push(row([dataCell('사업자번호'), dataCell(entity.businessNumber),
                    dataCell('법인등록번호'), dataCell(entity.corporateNumber || '-')]));
  }
  if (entity.establishedDate) {
    rows.push(row([dataCell('설립일'), dataCell(entity.establishedDate),
                    dataCell('업종'), dataCell(entity.industry || '-')]));
  }
  if (entity.address) {
    rows.push(row([dataCell('소재지'), dataCell(entity.address, { colspan: 3 })]));
  }
  if (entity.companyType || entity.employeeCount) {
    rows.push(row([dataCell('기업형태'), dataCell(entity.companyType || '-'),
                    dataCell('임직원수'), dataCell(entity.employeeCount ? `${entity.employeeCount}명` : '-')]));
  }
  if (entity.capital) {
    rows.push(row([dataCell('자본금'), dataCell(`${fmt(entity.capital)}백만원`),
                    dataCell('결산월'), dataCell(entity.fiscalMonth ? `${entity.fiscalMonth}월` : '-')]));
  }

  return [
    subTitle(`${prefix}. 기본정보`),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    emptyLine(),
  ];
}

function renderStatements(prefix: string, fs: FinancialStatements): SectionContent {
  const content: SectionContent = [];

  // Balance Sheet
  if (fs.balanceSheet.length > 0) {
    content.push(subTitle(`${prefix}. 주요 재무현황`), subTitle('■ 재무상태표'), unitLabel('(단위:백만원)'));
    const bsRows = [
      row([headerCell('계정과목', { width: 22 }), ...fs.years.map(y => headerCell(y)), headerCell('전년비')]),
      ...fs.balanceSheet.map(item =>
        row([
          dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.account}` : item.account, { bold: item.bold }),
          ...fs.years.map(y => dataCell(
            item.values[y] !== null && item.values[y] !== undefined ? String(item.values[y]) : '-',
            { align: AlignmentType.RIGHT, bold: item.bold }
          )),
          dataCell(item.yoyChange || '-', { align: AlignmentType.CENTER }),
        ])
      ),
    ];
    if (fs.ratios?.length) {
      fs.ratios.filter(r => ['부채비율', '자기자본비율', '차입금의존도'].includes(r.account))
        .forEach(r => {
          bsRows.push(row([
            headerCell(r.account),
            ...fs.years.map(y => dataCell(String(r.values[y] ?? '-'), { align: AlignmentType.CENTER })),
            dataCell(r.yoyChange || '-', { align: AlignmentType.CENTER }),
          ]));
        });
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: bsRows }), emptyLine());
  }

  // Income Statement
  if (fs.incomeStatement.length > 0) {
    content.push(subTitle('■ 손익계산서'), unitLabel('(단위:백만원)'));
    const isRows = [
      row([headerCell('계정과목', { width: 22 }), ...fs.years.map(y => headerCell(y)), headerCell('전년비')]),
      ...fs.incomeStatement.map(item =>
        row([
          dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.account}` : item.account, { bold: item.bold }),
          ...fs.years.map(y => dataCell(
            item.values[y] !== null && item.values[y] !== undefined ? String(item.values[y]) : '-',
            { align: AlignmentType.RIGHT, bold: item.bold }
          )),
          dataCell(item.yoyChange || '-', { align: AlignmentType.CENTER }),
        ])
      ),
    ];
    if (fs.ratios?.length) {
      fs.ratios.filter(r => ['영업이익률', '순이익률'].includes(r.account))
        .forEach(r => {
          isRows.push(row([
            headerCell(r.account),
            ...fs.years.map(y => dataCell(String(r.values[y] ?? '-'), { align: AlignmentType.CENTER })),
            dataCell(r.yoyChange || '-', { align: AlignmentType.CENTER }),
          ]));
        });
    }
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: isRows }), emptyLine());
  }

  return content;
}

function buildObligorBorrower(data: LoanApplication): SectionContent {
  const b = data.borrower;
  const fs = data.financials.borrower;
  const content: SectionContent = [
    pageBreak(),
    sectionTitle('채무관련인 현황'),
    emptyLine(),
    subTitle('1. 차주사 현황'),
    bodyText(`(조사기준일: ${fs.years[fs.years.length - 1] || '-'})`),
    ...renderEntityInfo('1-1', { ...b, fiscalMonth: b.fiscalMonth }),
  ];

  // Shareholders
  if (b.shareholders?.length) {
    content.push(subTitle('■ 주주구성'));
    const shRows = [
      row([headerCell('주주명'), headerCell('주식종류'), headerCell('주식수'), headerCell('지분율'), headerCell('비고')]),
      ...b.shareholders.map(s => row([
        dataCell(s.name), dataCell(s.stockType),
        dataCell(fmt(s.shares), { align: AlignmentType.RIGHT }),
        dataCell(s.ownershipPct != null ? `${s.ownershipPct.toFixed(2)}%` : '-', { align: AlignmentType.CENTER }),
        dataCell(s.note || ''),
      ])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: shRows }), emptyLine());
  }

  // Financial statements
  content.push(...renderStatements('1-2', fs));

  // Operating status
  if (b.operatingStatus?.length) {
    content.push(subTitle('1-3. 영업현황'));
    const opRows = [
      row([headerCell('항목'), headerCell('수치'), headerCell('비고')]),
      ...b.operatingStatus.map(o => row([dataCell(o.label), dataCell(o.value), dataCell(o.note || '')])),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: opRows }), emptyLine());
  }

  return content;
}

function buildObligorRelated(data: LoanApplication): SectionContent | null {
  const subs = data.financials.subsidiaries || [];
  const related = data.financials.relatedCompanies || [];
  const all = [...subs, ...related];
  if (all.length === 0) return null;

  const content: SectionContent = [];
  let idx = 2; // starts at 2 (1 = borrower)

  for (const rel of all) {
    content.push(pageBreak());
    content.push(subTitle(`${idx}. ${rel.entity.relationship} 현황 - ${rel.entity.name}`));
    if (rel.entity.establishedDate) {
      content.push(bodyText(`(조사기준일: ${rel.statements?.years[rel.statements.years.length - 1] || '-'})`));
    }
    content.push(emptyLine());

    if (rel.detailLevel === 'full' && rel.statements) {
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      content.push(...renderStatements(`${idx}-2`, rel.statements));
      if (rel.operatingStatus?.length) {
        content.push(subTitle(`${idx}-3. 영업현황`));
        const opRows = [
          row([headerCell('항목'), headerCell('수치'), headerCell('비고')]),
          ...rel.operatingStatus.map(o => row([dataCell(o.label), dataCell(o.value), dataCell(o.note || '')])),
        ];
        content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: opRows }), emptyLine());
      }
    } else if (rel.detailLevel === 'summary' && rel.summaryRow) {
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      const s = rel.summaryRow;
      content.push(subTitle(`${idx}-2. 간략 재무현황`), unitLabel('(단위:백만원)'));
      content.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row([headerCell('자산총계'), headerCell('부채총계'), headerCell('자본총계'),
               headerCell('매출액'), headerCell('영업이익'), headerCell('당기순이익')]),
          row([
            dataCell(s.totalAssets != null ? fmt(s.totalAssets) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.totalLiabilities != null ? fmt(s.totalLiabilities) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.totalEquity != null ? fmt(s.totalEquity) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.revenue != null ? fmt(s.revenue) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.operatingIncome != null ? fmt(s.operatingIncome) : '-', { align: AlignmentType.RIGHT }),
            dataCell(s.netIncome != null ? fmt(s.netIncome) : '-', { align: AlignmentType.RIGHT }),
          ]),
        ],
      }), emptyLine());
    } else {
      // minimal — just entity info
      content.push(...renderEntityInfo(`${idx}-1`, rel.entity));
      if (rel.entity.note) {
        content.push(bodyText(rel.entity.note), emptyLine());
      }
    }

    idx++;
  }

  return content;
}

registerSection('obligor-borrower', buildObligorBorrower);
registerSection('obligor-related', buildObligorRelated);
export { buildObligorBorrower, buildObligorRelated, renderStatements, renderEntityInfo };
