// app/src/lib/loan-engine/sections/plugins/equity-pledge.ts
import { Table, WidthType, AlignmentType } from 'docx';
import type { LoanApplication, SectionContent, EquityPledgeData } from '../../types';
import {
  sectionTitle, subTitle, unitLabel, bodyText, tbdText, headerCell, dataCell,
  emptyLine, row, fmt, pageBreak,
} from '../helpers';
import { registerSection } from '../registry';
import { renderStatements } from '../common/obligor';

// ─── Korean label map for valuation fields ───
const VALUATION_LABELS: Record<string, string> = {
  appraiser: '평가기관',
  method: '평가방법',
  targetCompany: '대상회사',
  baseDate: '기준일',
  status: '상태',
  equityValue100pct: '100% 지분가치 (백만원)',
  equityValue83pct: '83.55% 지분가치 (백만원)',
  note: '비고',
  wacc: 'WACC',
  perpetualGrowthRate: '영구성장률',
  operatingValue: '영업가치 (백만원)',
  nonOperatingAssets: '비영업자산 (백만원)',
  equityValue: 'Equity Value (백만원)',
  perShareValue: '주당가치',
  shares: '발행주식수',
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') return v.toLocaleString('ko-KR');
  return String(v);
}

function buildEquityPledge(data: LoanApplication): SectionContent | null {
  if (data.typeSpecific.type !== 'equity-pledge') return null;
  const ep = data.typeSpecific.data as any; // Use any for flexible field access
  const content: SectionContent = [
    sectionTitle('담보분석 (지분담보)'),
    emptyLine(),
  ];

  // ═══════════════════════════════════════════
  // 1. Pledged equity details
  // ═══════════════════════════════════════════
  content.push(subTitle('1. 담보지분 내역'), unitLabel('(단위:백만원)'));
  const eqRows = [
    row([headerCell('대상회사'), headerCell('보유자'), headerCell('주식종류'),
         headerCell('주식수'), headerCell('지분율'), headerCell('평가금액'), headerCell('비고')]),
    ...ep.pledgedEquities.map((eq: any) => row([
      dataCell(eq.targetCompany), dataCell(eq.holder), dataCell(eq.stockType),
      dataCell(`${fmt(eq.shares)}주`, { align: AlignmentType.RIGHT }),
      dataCell(`${eq.ownershipPct.toFixed(2)}%`, { align: AlignmentType.CENTER }),
      dataCell(typeof eq.valuationAmount === 'number' ? fmt(eq.valuationAmount) : String(eq.valuationAmount || eq.valuationNote || '[TBD]')),
      dataCell(eq.note || eq.valuationNote || ''),
    ])),
  ];
  content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: eqRows }), emptyLine());

  // ═══════════════════════════════════════════
  // 2. Valuation status
  // ═══════════════════════════════════════════
  content.push(subTitle('2. 지분평가 현황'));
  if (ep.valuationStatus?.length) {
    for (const v of ep.valuationStatus) {
      const vAny = v as any;
      const methodLabel = vAny.method || vAny.appraiser || '평가';
      const targetLabel = vAny.targetCompany ? ` - ${vAny.targetCompany}` : '';
      content.push(subTitle(`(${methodLabel}${targetLabel})`));

      // If items[] format exists, use it directly
      if (vAny.items?.length) {
        const valRows = [
          row([headerCell('항목', { width: 40 }), headerCell('내용', { width: 60 })]),
          ...vAny.items.map((i: any) => row([
            dataCell(String(i.label)), dataCell(fmtVal(i.value)),
          ])),
        ];
        content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: valRows }), emptyLine());
      } else {
        // Flat-field format: render with Korean labels
        const skipKeys = new Set(['method', 'items']);
        const entries = Object.entries(vAny)
          .filter(([k]) => !skipKeys.has(k) && vAny[k] !== null && vAny[k] !== undefined);
        if (entries.length > 0) {
          const valRows = [
            row([headerCell('항목', { width: 40 }), headerCell('내용', { width: 60 })]),
            ...entries.map(([k, val]) => row([
              dataCell(VALUATION_LABELS[k] || k),
              dataCell(fmtVal(val), {
                bold: k.includes('equityValue') || k.includes('Value'),
                align: typeof val === 'number' ? AlignmentType.RIGHT : AlignmentType.LEFT,
              }),
            ])),
          ];
          content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: valRows }), emptyLine());
        }
      }
    }
  } else {
    content.push(tbdText('[TBD: 지분평가서 수령 후 반영 예정]'), emptyLine());
  }

  // ═══════════════════════════════════════════
  // 3. Collateral value / LTV
  // ═══════════════════════════════════════════
  content.push(subTitle('3. 담보가치 산출 (LTV)'));
  if (ep.collateralValue) {
    const cv = ep.collateralValue;
    const ltvRows = [
      row([headerCell('구분', { width: 40 }), headerCell('평가 금액 (원)', { width: 35 }), headerCell('평가방법', { width: 25 })]),
      row([dataCell(`${data.borrower.name} 지분 100%`), dataCell(fmt(cv.valuationAmount / (cv.ltv / 100 * cv.valuationAmount / data.loanTerms.amount)) || '-', { align: AlignmentType.RIGHT }), dataCell('삼일회계법인 지분평가기준')]),
      row([dataCell(`${data.borrower.name} 담보제공자산`), dataCell(fmt(cv.valuationAmount), { align: AlignmentType.RIGHT }), dataCell(cv.valuationBasis)]),
      row([dataCell('본 건 차입금'), dataCell(fmt(data.loanTerms.amount), { align: AlignmentType.RIGHT }), dataCell('')]),
      row([headerCell('LTV'), dataCell(`${cv.ltv.toFixed(2)}%`, { align: AlignmentType.CENTER, bold: true }), dataCell('')]),
    ];
    content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: ltvRows }));
    if (cv.note) content.push(bodyText(cv.note));
  } else {
    content.push(tbdText('[TBD: 평가액 확정 후 산출]'));
  }
  content.push(emptyLine());

  // ═══════════════════════════════════════════
  // 4. Valuation detail (삼일회계법인 FCFE or legacy format)
  // ═══════════════════════════════════════════
  const samil = ep.samil_valuation;
  const usv = ep.unlistedStockValuation || ep.unlistedValuation;

  if (samil) {
    // ── 삼일회계법인 FCFE-based valuation ──
    content.push(pageBreak(), sectionTitle(`가치산정 상세 (${samil.appraiser})`), emptyLine());
    content.push(
      bodyText(`평가방법: ${samil.method}`),
      bodyText(`할인율: ${samil.discountRate} / 영구성장률: ${samil.perpetualGrowthRate}`),
      bodyText(`추정기간: ${samil.projectionPeriod || "'26년~'30년 (5년)"}`),
      emptyLine(),
    );

    // Valuation Summary table
    if (samil.valuationSummary?.items?.length) {
      content.push(subTitle('Valuation Summary'), unitLabel('(단위:백만원)'));
      const vsRows = [
        row([headerCell('항목', { width: 55 }), headerCell('Value (백만원)', { width: 45 })]),
        ...samil.valuationSummary.items.map((i: any) => row([
          dataCell(i.label, { bold: i.label.includes('Equity') || i.label.includes('영업가치') }),
          dataCell(fmt(i.value), { align: AlignmentType.RIGHT, bold: i.label.includes('Equity') || i.label.includes('영업가치') }),
        ])),
      ];
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: vsRows }));
      if (samil.valuationSummary.note) content.push(bodyText(samil.valuationSummary.note));
      content.push(emptyLine());
    }

    // FCFE projection tables (techmate + youme)
    for (const dcfKey of ['techmateDCF', 'youmeDCF']) {
      const dcf = (samil as any)[dcfKey];
      if (!dcf?.items?.length) continue;
      content.push(pageBreak(), subTitle(dcf.label || dcfKey), unitLabel('(단위:백만원)'));
      const yrs = dcf.years || [];
      const fcfRows = [
        row([headerCell('항목', { width: 18 }), ...yrs.map((y: string) => headerCell(y))]),
        ...dcf.items.map((item: any) => row([
          dataCell(item.label, { bold: item.bold }),
          ...item.values.map((v: any) => dataCell(v != null ? fmt(v) : '-', { align: AlignmentType.RIGHT, bold: item.bold })),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fcfRows }));
      if (dcf.note) content.push(bodyText(dcf.note));
      content.push(emptyLine());
    }

    // Discount rate breakdown
    if (samil.discountRateBreakdown?.items?.length) {
      content.push(subTitle('할인율(자기자본비용) 산출'));
      const drRows = [
        row([headerCell('항목', { width: 30 }), headerCell('수치', { width: 20 }), headerCell('산출근거', { width: 50 })]),
        ...samil.discountRateBreakdown.items.map((i: any) => row([
          dataCell(i.label, { bold: i.label.includes('Ke') }),
          dataCell(i.value, { align: AlignmentType.CENTER, bold: i.label.includes('Ke') }),
          dataCell(i.formula || i.source || ''),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: drRows }));
      if (samil.discountRateBreakdown.note) content.push(bodyText(samil.discountRateBreakdown.note));
      content.push(emptyLine());
    }

    // Sensitivity analysis
    if (samil.sensitivityAnalysis?.cases?.length) {
      const sa = samil.sensitivityAnalysis;
      content.push(subTitle(sa.label || '민감도 분석'), unitLabel('(단위:백만원)'));
      const firstCase = sa.cases[0];
      const growthCols = Object.keys(firstCase).filter((k: string) => k.startsWith('growth_'));
      const growthLabels = growthCols.map((k: string) => k.replace('growth_', '').replace('_', '.') + '%');
      const saRows = [
        row([headerCell('Ke \\ 영구성장률', { width: 25 }), ...growthLabels.map((l: string) => headerCell(l))]),
        ...sa.cases.map((c: any) => row([
          dataCell(c.ke || c.wacc, { bold: String(c.ke || c.wacc).includes('Base') }),
          ...growthCols.map((k: string) => dataCell(fmt(c[k]), {
            align: AlignmentType.RIGHT,
            bold: String(c.ke || c.wacc).includes('Base'),
          })),
        ])),
      ];
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: saRows }));
      if (sa.note) content.push(bodyText(sa.note));
      content.push(emptyLine());
    }

    // Peer group
    if (samil.peerGroup?.length) {
      content.push(subTitle('Peer Group'));
      const pgRows = [
        row([headerCell('기업명'), headerCell('D/E Ratio'), headerCell('5yr Beta'), headerCell('Unlevered Beta')]),
        ...samil.peerGroup.map((p: any) => row([
          dataCell(p.company, { bold: p.company === 'Average' }),
          dataCell(p.deRatio, { align: AlignmentType.CENTER }),
          dataCell(p.beta5yr != null ? String(p.beta5yr) : '-', { align: AlignmentType.CENTER }),
          dataCell(String(p.unleveredBeta), { align: AlignmentType.CENTER, bold: p.company === 'Average' }),
        ])),
      ];
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: pgRows }), emptyLine());
    }
  } else if (usv) {
    // ── Legacy format (기존 비상장주식평가) ──
    content.push(pageBreak(), sectionTitle('비상장주식평가'));

    // If items[] format, use directly
    if (usv.items?.length) {
      const uRows = [
        row([headerCell('항목'), headerCell('금액/수치')]),
        ...usv.items.map((i: any) => row([
          dataCell(String(i.label), { bold: String(i.label).includes('Value') || String(i.label).includes('주당') }),
          dataCell(fmtVal(i.value), { align: AlignmentType.RIGHT }),
        ])),
      ];
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: uRows }), emptyLine());
    } else {
      // Structured DCF format
      content.push(
        bodyText(`평가대상: ${usv.targetCompany || '-'}`),
        bodyText(`평가기관: ${usv.appraiser || '-'} (기준일: ${usv.baseDate || '-'}, 상태: ${usv.status || '-'})`),
        emptyLine(),
      );

      if (usv.dcfResult) {
        content.push(subTitle('DCF 평가 결과'), unitLabel('(단위:백만원)'));
        const dcf = usv.dcfResult;
        const dcfRows = [
          row([headerCell('항목', { width: 50 }), headerCell('금액/수치', { width: 50 })]),
          row([dataCell('평가방법'), dataCell(dcf.method || 'DCF')]),
          row([dataCell('추정기간'), dataCell(dcf.projectionPeriod || '-')]),
          row([dataCell('WACC'), dataCell(dcf.wacc || '-')]),
          row([dataCell('영구성장률'), dataCell(dcf.perpetualGrowthRate || '-')]),
          row([dataCell('영업가치'), dataCell(fmt(dcf.operatingValue), { align: AlignmentType.RIGHT })]),
          row([dataCell('비영업자산'), dataCell(fmt(dcf.nonOperatingAssets), { align: AlignmentType.RIGHT })]),
          row([dataCell('비영업부채'), dataCell(fmt(dcf.nonOperatingLiabilities ?? 0), { align: AlignmentType.RIGHT })]),
          row([headerCell('Equity Value'), dataCell(fmt(dcf.equityValue), { align: AlignmentType.RIGHT, bold: true })]),
          row([dataCell('발행주식수'), dataCell(fmt(dcf.shares) + '주', { align: AlignmentType.RIGHT })]),
          row([headerCell('주당가치'), dataCell(dcf.perShareValue || '-', { bold: true })]),
        ];
        content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: dcfRows }), emptyLine());
      }

      // WACC Breakdown
      if (usv.waccBreakdown) {
        content.push(subTitle('WACC 산출 내역'));
        const wb = usv.waccBreakdown;
        const wbRows = [
          row([headerCell('항목', { width: 35 }), headerCell('수치', { width: 25 }), headerCell('산출근거', { width: 40 })]),
          row([dataCell('무위험수익률 (Rf)'), dataCell(wb.riskFreeRate), dataCell(wb.riskFreeRateSource || '')]),
          row([dataCell('Unlevered Beta'), dataCell(String(wb.unleveredBeta)), dataCell(wb.unleveredBetaSource || '')]),
          row([dataCell('Equity Beta'), dataCell(String(wb.equityBeta)), dataCell(wb.equityBetaFormula || '')]),
          row([dataCell('시장위험프리미엄 (EMRP)'), dataCell(wb.emrp), dataCell(wb.emrpSource || '')]),
          row([dataCell('소규모기업 할증'), dataCell(wb.smallFirmPremium), dataCell(wb.smallFirmPremiumSource || '')]),
          row([dataCell('자기자본비용'), dataCell(wb.costOfEquity), dataCell(wb.costOfEquityFormula || '')]),
          row([headerCell('WACC'), dataCell(wb.wacc, { bold: true }), dataCell('')]),
        ];
        content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: wbRows }), emptyLine());
      }

      // Projected FCF
      if (usv.projectedFCF?.length) {
        content.push(subTitle('추정 잉여현금흐름 (FCFF)'), unitLabel('(단위:백만원)'));
        const fcfCols = usv.projectedFCF.map((p: any) => p.year);
        const metrics = ['revenue', 'ebit', 'ebitMargin', 'noplat', 'fcff'];
        const metricLabels: Record<string, string> = {
          revenue: '영업수익', ebit: 'EBIT', ebitMargin: 'EBIT Margin',
          noplat: 'NOPLAT', fcff: 'FCFF',
        };
        const fcfRows = [
          row([headerCell('항목', { width: 20 }), ...fcfCols.map((c: string) => headerCell(c))]),
          ...metrics.map(m => row([
            dataCell(metricLabels[m] || m, { bold: m === 'fcff' }),
            ...usv.projectedFCF.map((p: any) => dataCell(
              typeof p[m] === 'number' ? fmt(p[m]) : String(p[m] || '-'),
              { align: AlignmentType.RIGHT, bold: m === 'fcff' }
            )),
          ])),
        ];
        content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fcfRows }), emptyLine());
      }

      // Sensitivity Analysis
      if (usv.sensitivityAnalysis?.cases?.length) {
        const sa = usv.sensitivityAnalysis;
        content.push(subTitle(`민감도 분석 (${sa.axes?.x || 'Growth'} × ${sa.axes?.y || 'WACC'})`), unitLabel('(단위:백만원)'));
        // Extract growth rate columns from first case
        const firstCase = sa.cases[0];
        const growthCols = Object.keys(firstCase).filter((k: string) => k.startsWith('growth_'));
        const growthLabels = growthCols.map((k: string) => k.replace('growth_', '').replace('_', '.') + '%');
        const saRows = [
          row([headerCell('WACC \\ 영구성장률', { width: 30 }), ...growthLabels.map((l: string) => headerCell(l))]),
          ...sa.cases.map((c: any) => row([
            dataCell(c.wacc, { bold: String(c.wacc).includes('Base') }),
            ...growthCols.map((k: string) => dataCell(fmt(c[k]), {
              align: AlignmentType.RIGHT,
              bold: String(c.wacc).includes('Base'),
            })),
          ])),
        ];
        content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: saRows }), emptyLine());
      }

      // Peer Group
      if (usv.peerGroup?.length) {
        content.push(subTitle('Peer Group 비교'));
        const pgRows = [
          row([headerCell('기업명'), headerCell('D/E Ratio'), headerCell('2yr Beta'), headerCell('Unlevered Beta')]),
          ...usv.peerGroup.map((p: any) => row([
            dataCell(p.company, { bold: p.company === '평균' }),
            dataCell(p.deRatio, { align: AlignmentType.CENTER }),
            dataCell(String(p.beta2yr), { align: AlignmentType.CENTER }),
            dataCell(String(p.unleveredBeta), { align: AlignmentType.CENTER, bold: p.company === '평균' }),
          ])),
        ];
        content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: pgRows }), emptyLine());
      }

      if (usv.note) content.push(bodyText(usv.note), emptyLine());
    }
  }

  // ═══════════════════════════════════════════
  // 5. Guarantor income (보증인 소득분석)
  // ═══════════════════════════════════════════
  if (ep.guarantorIncome) {
    const gi = ep.guarantorIncome as any;
    content.push(pageBreak(), sectionTitle(`보증인 소득분석 (${gi.name})`), emptyLine());

    // If items[] format, use directly
    if (gi.items?.length) {
      const gRows = [
        row([headerCell('항목'), headerCell('내용')]),
        ...gi.items.map((i: any) => row([dataCell(i.label), dataCell(i.value)])),
      ];
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: gRows }), emptyLine());
    } else {
      // Structured format with incomeByYear
      const infoRows = [
        row([headerCell('항목', { width: 30 }), headerCell('내용', { width: 70 })]),
        row([dataCell('성명'), dataCell(gi.name)]),
      ];
      if (gi.title) infoRows.push(row([dataCell('직위'), dataCell(gi.title)]));
      if (gi.shareholding) infoRows.push(row([dataCell('보유지분'), dataCell(gi.shareholding)]));
      if (gi.incomeSource) infoRows.push(row([dataCell('소득원'), dataCell(gi.incomeSource)]));
      content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: infoRows }), emptyLine());

      if (gi.incomeByYear?.length) {
        content.push(subTitle('■ 연도별 소득현황'), unitLabel('(단위:천원 / 출처: 국세청 소득금액증명원)'));
        const years = gi.incomeByYear.map((y: any) => String(y.year));
        const incomeFields = [
          { key: 'laborIncome', label: '근로소득' },
          { key: 'interestIncome', label: '이자소득' },
          { key: 'dividendIncome', label: '배당소득' },
          { key: 'businessIncome', label: '사업소득' },
          { key: 'totalIncome', label: '소득금액 합계' },
          { key: 'taxAmount', label: '결정세액' },
        ];
        const incRows = [
          row([headerCell('항목', { width: 30 }), ...years.map((y: string) => headerCell(y))]),
          ...incomeFields.map(f => row([
            dataCell(f.label, { bold: f.key === 'totalIncome' }),
            ...gi.incomeByYear.map((y: any) => dataCell(
              y[f.key] != null ? fmt(y[f.key]) : '-',
              { align: AlignmentType.RIGHT, bold: f.key === 'totalIncome' }
            )),
          ])),
        ];
        content.push(new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: incRows }), emptyLine());
      }

      if (gi.note) content.push(bodyText(gi.note), emptyLine());
    }
  }

  // ═══════════════════════════════════════════
  // 6. Consolidated financials (연결재무제표)
  // ═══════════════════════════════════════════
  const consolidatedFS = ep.consolidatedFinancials || (data.financials as any).consolidatedStatements;
  if (consolidatedFS) {
    content.push(pageBreak(), sectionTitle('연결재무제표'), emptyLine());
    content.push(...renderStatements('', consolidatedFS));
  }

  // ═══════════════════════════════════════════
  // 7. Cash flow (영업현금흐름)
  // ═══════════════════════════════════════════
  if (ep.cashFlow) {
    const cfAny = ep.cashFlow as any;
    // Support both entities[] format and named-key format (techmate/youme)
    const cfNameMap: Record<string, string> = {
      techmate: '테크메이트코리아대부(주)',
      youme: '유미캐피탈대부(주)',
    };
    const entities = ep.cashFlow.entities ?? Object.entries(cfAny)
      .filter(([k, v]) => k !== 'consolidated' && k !== 'consolidatedMetrics' && v && typeof v === 'object' && (v as any).items)
      .map(([k, v]) => {
        const ent = v as any;
        return { name: cfNameMap[k] || k, source: '내부 자료', period: '', quarters: ent.quarters ?? [], items: ent.items ?? [] };
      });
    if (entities.length > 0) {
      content.push(pageBreak(), sectionTitle('영업현금흐름 분석'), emptyLine());
      for (const entity of entities) {
        const quarters = entity.quarters ?? [];
        content.push(subTitle(entity.name), unitLabel('(단위:백만원)'));
        const cfRows = [
          row([headerCell('항목', { width: 25 }), ...quarters.map((q: string) => headerCell(q))]),
          ...entity.items.map((item: any) => row([
            dataCell(item.indent ? `${'  '.repeat(item.indent)}${item.label}` : item.label, { bold: item.bold }),
            ...item.values.map((v: any) => dataCell(v != null ? fmt(v) : '-', { align: AlignmentType.RIGHT, bold: item.bold })),
          ])),
        ];
        content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: cfRows }), emptyLine());
      }
    }

    // consolidated block
    const consolBlock = cfAny.consolidated;
    if (consolBlock?.items?.length) {
      if (entities.length === 0) content.push(pageBreak(), sectionTitle('영업현금흐름 분석'), emptyLine());
      content.push(subTitle('합산 연간 핵심 지표'), unitLabel('(단위:백만원)'));
      const hasTechYoume = consolBlock.items.some((i: any) => i.techmate != null || i.youme != null);
      if (hasTechYoume) {
        const mRows = [
          row([headerCell('항목', { width: 30 }), headerCell('테크메이트', { width: 20 }),
               headerCell('유미캐피탈', { width: 20 }), headerCell('합계', { width: 20 })]),
          ...consolBlock.items.map((i: any) => row([
            dataCell(i.label, { bold: true }),
            dataCell(fmt(i.techmate), { align: AlignmentType.RIGHT }),
            dataCell(fmt(i.youme), { align: AlignmentType.RIGHT }),
            dataCell(fmt(i.total), { align: AlignmentType.RIGHT, bold: true }),
          ])),
        ];
        content.push(new Table({ width: { size: 90, type: WidthType.PERCENTAGE }, rows: mRows }), emptyLine());
      }
      if (consolBlock.note) content.push(bodyText(consolBlock.note), emptyLine());
    }

    // consolidatedMetrics (alternative format)
    if (!consolBlock && cfAny.consolidatedMetrics?.length) {
      content.push(subTitle('합산 연간 핵심 지표'));
      const mRows = [
        row([headerCell('지표'), headerCell('수치'), headerCell('비고')]),
        ...cfAny.consolidatedMetrics.map((m: any) => row([
          dataCell(m.label), dataCell(m.value), dataCell(m.note || ''),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: mRows }), emptyLine());
    }
  }

  // ═══════════════════════════════════════════
  // 8. Provisioning rates (대손충당금 설정률)
  // ═══════════════════════════════════════════
  if (ep.provisioningRates) {
    const prAny = ep.provisioningRates as any;
    content.push(pageBreak(), sectionTitle('대손충당금 설정률'), emptyLine());

    if (prAny.items && prAny.years) {
      // Standard format
      const pr = ep.provisioningRates;
      const prRows = [
        row([headerCell('구분'), ...pr.years.map((y: string) => headerCell(y))]),
        ...pr.items.map((item: any) => row([
          dataCell(item.category),
          ...pr.years.map((y: string) => dataCell(String(item.values[y] ?? '-'), { align: AlignmentType.RIGHT })),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: prRows }), emptyLine());
    } else {
      // Named-entity format (techmate/youme with rates[])
      const entityNameMap: Record<string, string> = {
        techmate: '테크메이트코리아대부(주)',
        youme: '유미캐피탈대부(주)',
      };
      const entityKeys = Object.keys(prAny).filter(k => prAny[k]?.rates);
      for (const key of entityKeys) {
        const ent = prAny[key];
        const displayName = entityNameMap[key] || key;
        content.push(subTitle(`■ ${displayName} (시행: ${ent.effectiveFrom || '-'})`));
        if (ent.note) content.push(bodyText(ent.note));
        const rates: any[] = ent.rates;
        if (rates?.length) {
          const cols = Object.keys(rates[0]).filter(c => c !== 'delinquencyBracket');
          const colLabels: Record<string, string> = {
            generalRate: '일반대출',
            realEstateRate: '부동산담보',
            accruedInterestRate: '미수이자',
          };
          const rateRows = [
            row([headerCell('연체구간', { width: 25 }), ...cols.map(c => headerCell(colLabels[c] || c))]),
            ...rates.map(r => row([
              dataCell(r.delinquencyBracket),
              ...cols.map(c => dataCell(String(r[c] ?? '-'), { align: AlignmentType.CENTER })),
            ])),
          ];
          content.push(new Table({ width: { size: 90, type: WidthType.PERCENTAGE }, rows: rateRows }), emptyLine());
        }
      }
    }
  }

  // ═══════════════════════════════════════════
  // 9. SovereignJL detail (소버린제이엘홀딩스)
  // ═══════════════════════════════════════════
  if (ep.sovereignJLDetail) {
    const sjl = ep.sovereignJLDetail;
    content.push(pageBreak(), sectionTitle('관계사 현황 - (주)소버린제이엘홀딩스'), emptyLine());

    // Entity info
    const ent = sjl.entity;
    const entRows = [
      row([headerCell('항목', { width: 25 }), headerCell('내용', { width: 25 }),
           headerCell('항목', { width: 25 }), headerCell('내용', { width: 25 })]),
      row([dataCell('기업명'), dataCell(ent.name), dataCell('대표자'), dataCell(ent.representative || '-')]),
      row([dataCell('설립일'), dataCell(ent.establishedDate || '-'), dataCell('사업자번호'), dataCell(ent.businessNumber || '-')]),
      row([dataCell('자본금'), dataCell(fmt(ent.capital) + '백만원'), dataCell('업종'), dataCell(ent.industry || '-')]),
      row([dataCell('역할'), dataCell(ent.role || '-', { colspan: 3 })]),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: entRows }), emptyLine());

    // Core subsidiary (문화상품권)
    if (sjl.coreSubsidiary) {
      const cs = sjl.coreSubsidiary;
      content.push(subTitle(`핵심 자회사: ${cs.name}`));
      const csRows = [
        row([headerCell('항목', { width: 35 }), headerCell('내용', { width: 65 })]),
        row([dataCell('사업 개요'), dataCell(cs.businessDescription || '-')]),
        row([dataCell('오프라인 인프라'), dataCell(cs.distributionInfraOffline || '-')]),
        row([dataCell('온라인 인프라'), dataCell(cs.distributionInfraOnline || '-')]),
        row([dataCell("'24년 판매실적"), dataCell(cs.salesVolume2024 || '-')]),
        row([dataCell('상품권 예수금'), dataCell(cs.giftCardDeposits || '-')]),
        row([dataCell("'24년 이자수익"), dataCell(cs.interestIncome2024 || '-')]),
        row([dataCell('기업가치 (DCF)'), dataCell(cs.dcfValue || '-', { bold: true })]),
      ];
      content.push(new Table({ width: { size: 90, type: WidthType.PERCENTAGE }, rows: csRows }), emptyLine());
    }

    // Financial projection
    if (sjl.financialProjection) {
      const fp = sjl.financialProjection;
      content.push(subTitle('재무 추정'), unitLabel('(단위:백만원)'));
      const years = fp.years || [];
      const fpRows = [
        row([headerCell('항목', { width: 30 }), ...years.map((y: string) => headerCell(y))]),
        ...fp.items.map((item: any) => row([
          dataCell(item.label, { bold: item.bold }),
          ...item.values.map((v: any) => dataCell(fmt(v), { align: AlignmentType.RIGHT, bold: item.bold })),
        ])),
      ];
      content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fpRows }), emptyLine());
      if (fp.note) content.push(bodyText(fp.note), emptyLine());
    }
  }

  // ═══════════════════════════════════════════
  // 10. TechmateHoldings detail (테크메이트홀딩스)
  // ═══════════════════════════════════════════
  if (ep.techmateHoldingsDetail) {
    const th = ep.techmateHoldingsDetail;
    content.push(pageBreak(), sectionTitle('관계사 현황 - 테크메이트홀딩스(주)'), emptyLine());

    const ent = th.entity;
    const entRows = [
      row([headerCell('항목', { width: 25 }), headerCell('내용', { width: 25 }),
           headerCell('항목', { width: 25 }), headerCell('내용', { width: 25 })]),
      row([dataCell('기업명'), dataCell(ent.name), dataCell('대표자'), dataCell(ent.representative || '-')]),
      row([dataCell('관계'), dataCell(ent.relationship || '-'), dataCell('역할'), dataCell(ent.role || '-')]),
      row([dataCell('주요자산'), dataCell(ent.keyAssets || '-', { colspan: 3 })]),
    ];
    content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: entRows }), emptyLine());

    if (th.borrowings) {
      content.push(subTitle('■ 차입금 현황'), unitLabel('(단위:백만원)'));
      if (th.borrowings.summary?.length) {
        const bRows = [
          row([headerCell('구분'), headerCell('건수'), headerCell('잔액'),
               headerCell('금리범위'), headerCell('만기범위'), headerCell('상환방식')]),
          ...th.borrowings.summary.map((s: any) => row([
            dataCell(s.category, { bold: s.category === '합계' }),
            dataCell(String(s.count || '-'), { align: AlignmentType.CENTER }),
            dataCell(fmt(s.balance), { align: AlignmentType.RIGHT, bold: s.category === '합계' }),
            dataCell(s.rateRange || s.weightedAvgRate || '-', { align: AlignmentType.CENTER }),
            dataCell(s.maturityRange || '-', { align: AlignmentType.CENTER }),
            dataCell(s.repayment || s.note || '-'),
          ])),
        ];
        content.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: bRows }), emptyLine());
      }
      if (th.borrowings.note) content.push(bodyText(th.borrowings.note), emptyLine());
    }
  }

  return content;
}

registerSection('plugin:equity-pledge', buildEquityPledge);
export { buildEquityPledge };
