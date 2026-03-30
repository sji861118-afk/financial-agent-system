// app/src/lib/loan-engine/sections/plugins/equity-pledge.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, EquityPledgeData } from '../../types.js';
import {
  sectionTitle, subTitle, unitLabel, bodyText, tbdText, headerCell, dataCell,
  emptyLine, row, fmt, pageBreak,
} from '../helpers.js';
import { registerSection } from '../registry.js';
import { renderStatements } from '../common/obligor.js';

function buildEquityPledge(data: LoanApplication): SectionContent | null {
  if (data.typeSpecific.type !== 'equity-pledge') return null;
  const ep = data.typeSpecific.data;
  const content: SectionContent = [
    sectionTitle('담보분석 (지분담보)'),
    emptyLine(),
  ];

  // 1. Pledged equity details
  content.push(subTitle('1. 담보지분 내역'), unitLabel('(단위:백만원)'));
  const eqRows = [
    row([headerCell('대상회사'), headerCell('보유자'), headerCell('주식종류'),
         headerCell('주식수'), headerCell('지분율'), headerCell('평가금액'), headerCell('비고')]),
    ...ep.pledgedEquities.map(eq => row([
      dataCell(eq.targetCompany), dataCell(eq.holder), dataCell(eq.stockType),
      dataCell(`${fmt(eq.shares)}주`, { align: AlignmentType.RIGHT }),
      dataCell(`${eq.ownershipPct.toFixed(2)}%`, { align: AlignmentType.CENTER }),
      dataCell(typeof eq.valuationAmount === 'number' ? fmt(eq.valuationAmount) : String(eq.valuationAmount || '[TBD]')),
      dataCell(eq.note || ''),
    ])),
  ];
  content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: eqRows }), emptyLine());

  // 2. Valuation status
  content.push(subTitle('2. 지분평가 현황'));
  if (ep.valuationStatus?.length) {
    for (const v of ep.valuationStatus) {
      content.push(bodyText(`(${v.method})`));
      // Support both items[] format and flat-field format
      const vAny = v as any;
      const items: { label: string; value: string | number }[] = v.items ?? Object.entries(vAny)
        .filter(([k]) => !['method', 'items'].includes(k))
        .map(([k, val]) => ({ label: k, value: String(val ?? '-') }));
      if (items.length === 0) {
        content.push(tbdText('[TBD: 평가 중]'), emptyLine());
        continue;
      }
      const valRows = [
        row([headerCell('항목'), headerCell('금액(백만원)')]),
        ...items.map(i => row([
          dataCell(String(i.label), { bold: String(i.label).includes('Equity Value') || String(i.label).includes('equityValue') }),
          dataCell(String(i.value), { align: AlignmentType.RIGHT, bold: String(i.label).includes('Equity Value') || String(i.label).includes('equityValue') }),
        ])),
      ];
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: valRows }), emptyLine());
    }
  } else {
    content.push(tbdText('[TBD: 지분평가서 수령 후 반영 예정]'), emptyLine());
  }

  // 3. Collateral value / LTV
  content.push(subTitle('3. 담보가치 산출'));
  if (ep.collateralValue) {
    const cv = ep.collateralValue;
    content.push(
      bodyText(`${cv.valuationBasis} 기준 LTV = ${fmt(data.loanTerms.amount)} / ${fmt(cv.valuationAmount)} = ${cv.ltv.toFixed(1)}%`),
    );
    if (cv.note) content.push(bodyText(cv.note));
  } else {
    content.push(tbdText('[TBD: 평가액 확정 후 산출]'));
  }
  content.push(emptyLine());

  // 4. Unlisted stock valuation (optional)
  if (ep.unlistedValuation) {
    content.push(pageBreak(), subTitle('비상장주식평가 (세법기준)'));
    const uRows = [
      row([headerCell('항목'), headerCell('금액/수치')]),
      ...ep.unlistedValuation.items.map(i => row([
        dataCell(String(i.label), { bold: String(i.label).includes('Value') || String(i.label).includes('주당') }),
        dataCell(String(i.value), { align: AlignmentType.RIGHT }),
      ])),
    ];
    content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: uRows }), emptyLine());
  }

  // 5. Guarantor income (optional)
  if (ep.guarantorIncome) {
    const gi = ep.guarantorIncome as any;
    content.push(subTitle(`보증인 소득분석 (${gi.name})`));
    // Support both items[] format and flat-field format
    const giItems: { label: string; value: string }[] = gi.items ?? Object.entries(gi)
      .filter(([k]) => !['name', 'items'].includes(k))
      .map(([k, v]) => ({ label: k, value: String(v ?? '-') }));
    if (giItems.length > 0) {
      const gRows = [
        row([headerCell('항목'), headerCell('내용')]),
        ...giItems.map(i => row([dataCell(i.label), dataCell(i.value)])),
      ];
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: gRows }), emptyLine());
    } else {
      content.push(emptyLine());
    }
  }

  // 6. Consolidated financials (optional)
  if (ep.consolidatedFinancials) {
    content.push(pageBreak(), subTitle('연결재무제표'));
    content.push(...renderStatements('', ep.consolidatedFinancials));
  }

  // 7. Cash flow (optional)
  if (ep.cashFlow) {
    const cfAny = ep.cashFlow as any;
    // Support both entities[] format and named-key format (e.g., { techmate: {...}, youme: {...} })
    const entities = ep.cashFlow.entities ?? Object.entries(cfAny)
      .filter(([k, v]) => k !== 'consolidated' && k !== 'consolidatedMetrics' && v && typeof v === 'object' && (v as any).items)
      .map(([k, v]) => {
        const ent = v as any;
        return { name: k, source: 'cash-flow', period: '', quarters: ent.quarters ?? [], items: ent.items ?? [] };
      });
    if (entities.length > 0) {
      content.push(pageBreak(), sectionTitle('영업현금흐름 분석'), emptyLine());
      for (const entity of entities) {
        const quarters = entity.quarters ?? [];
        content.push(subTitle(entity.name), unitLabel(`(단위:백만원 / 출처: ${entity.source || 'cash-flow'})`));
        const cfRows = [
          row([headerCell('항목', { width: 25 }), ...quarters.map((q: string) => headerCell(q))]),
          ...entity.items.map((item: any) => row([
            dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.label}` : item.label, { bold: item.bold }),
            ...item.values.map((v: any) => dataCell(v != null ? String(v) : '-', { align: AlignmentType.RIGHT, bold: item.bold })),
          ])),
        ];
        content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: cfRows }), emptyLine());
      }
    }
    // consolidatedMetrics or consolidated block
    const consolidatedMetrics = ep.cashFlow.consolidatedMetrics ?? (cfAny.consolidated?.items
      ? cfAny.consolidated.items.map((i: any) => ({
          label: i.label,
          value: i.total != null ? String(i.total) : '-',
          note: cfAny.consolidated?.note,
        }))
      : null);
    if (consolidatedMetrics?.length) {
      if (entities.length === 0) content.push(pageBreak(), sectionTitle('영업현금흐름 분석'), emptyLine());
      content.push(subTitle('합산 연간 핵심 지표'));
      const mRows = [
        row([headerCell('지표'), headerCell('수치'), headerCell('비고')]),
        ...consolidatedMetrics.map((m: any) => row([
          dataCell(m.label), dataCell(m.value), dataCell(m.note || ''),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: mRows }), emptyLine());
    }
  }

  // 8. Provisioning rates (optional)
  if (ep.provisioningRates) {
    const prAny = ep.provisioningRates as any;
    // Support both standard format (items/years) and named-entity format (techmate/youme with rates[])
    if (prAny.items && prAny.years) {
      content.push(subTitle('대손충당금 설정률'));
      const pr = ep.provisioningRates;
      const prRows = [
        row([headerCell('구분'), ...pr.years.map(y => headerCell(y))]),
        ...pr.items.map(item => row([
          dataCell(item.category),
          ...pr.years.map(y => dataCell(String(item.values[y] ?? '-'), { align: AlignmentType.RIGHT })),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: prRows }), emptyLine());
    } else {
      // Named-entity format: render each entity's rates table separately
      const entityKeys = Object.keys(prAny).filter(k => prAny[k]?.rates);
      for (const key of entityKeys) {
        const ent = prAny[key];
        content.push(subTitle(`대손충당금 설정률 (${key})`));
        if (ent.note) content.push(bodyText(ent.note));
        const rates: any[] = ent.rates;
        if (rates?.length) {
          const cols = Object.keys(rates[0]).filter(c => c !== 'delinquencyBracket');
          const rateRows = [
            row([headerCell('연체구간'), ...cols.map(c => headerCell(c))]),
            ...rates.map(r => row([
              dataCell(r.delinquencyBracket),
              ...cols.map(c => dataCell(String(r[c] ?? '-'), { align: AlignmentType.CENTER })),
            ])),
          ];
          content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rateRows }), emptyLine());
        }
      }
    }
  }

  return content;
}

registerSection('plugin:equity-pledge', buildEquityPledge);
export { buildEquityPledge };
