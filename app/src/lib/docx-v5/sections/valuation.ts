/**
 * 가치산정 보고서 상세 — Valuation Summary, 할인율, Peer, FCFE(TM/YM), 민감도
 */
import { Paragraph, Table } from 'docx';
import { AlignmentType } from 'docx';
import { t, p, emptyP, subTitle, makeTable, headerRow, dataRow, pageBreak, SZ_SECTION } from '../builder';
import type { DealDataset, FcfeRow } from '../types';

export function buildValuation(data: DealDataset): (Paragraph | Table)[] {
  const v = data.valuation;
  if (!v) return [];

  const result: (Paragraph | Table)[] = [
    pageBreak(),
    p([t('가치산정 보고서 상세', { bold: true, size: SZ_SECTION })], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 160 },
    }),
  ];

  // 1. Valuation Summary
  result.push(subTitle('1. Valuation Summary'));
  result.push(p(v.summaryText));
  result.push(emptyP());

  // 2. 할인율 산출
  result.push(subTitle('2. 할인율 산출'));
  result.push(makeTable([
    headerRow(['항목', '값', '비고']),
    dataRow(['Ke (자기자본비용)', v.ke, 'CAPM 산출']),
    dataRow(['RF (무위험이자율)', v.keComponents.rf, '국고채 5년']),
    dataRow(['MRP (시장위험프리미엄)', v.keComponents.mrp, '한국시장']),
    dataRow(['β_L (레버리지 베타)', v.keComponents.betaL, 'Peer Group 평균']),
    dataRow(['β_U (언레버리지 베타)', v.keComponents.betaU, 'Peer Group 평균']),
    dataRow(['D/E (부채비율)', v.keComponents.deRatio, 'Peer 평균']),
    dataRow(['Tax (법인세율)', v.keComponents.taxRate, '']),
    dataRow(['SP (규모프리미엄)', v.keComponents.sizePremium, '소형주 프리미엄']),
    dataRow(['g (영구성장률)', v.perpetualGrowthRate, '명목 GDP 감안']),
  ]));
  result.push(emptyP());

  // 3. Peer Group
  if (v.peerGroup.length > 0) {
    result.push(subTitle('3. Peer Group'));
    result.push(makeTable([
      headerRow(['기업명', 'D/E (%)', 'β_L', 'β_U']),
      ...v.peerGroup.map(pg => dataRow([pg.company, pg.deRatio, pg.betaL, pg.betaU])),
    ]));
    result.push(emptyP());
  }

  // 4. FCFE 추정 (TM)
  if (v.tmFcfe.length > 0) {
    result.push(subTitle('4. FCFE 추정 (테크메이트코리아대부)'));
    result.push(buildFcfeTable(v.fcfeHeaders, v.tmFcfe));
    for (const note of v.tmFcfeNotes) {
      result.push(p([t(`※ ${note}`, { size: 16 })]));
    }
    result.push(emptyP());
  }

  // 5. FCFE 추정 (YM)
  if (v.ymFcfe.length > 0) {
    result.push(subTitle('5. FCFE 추정 (유미캐피탈대부)'));
    result.push(buildFcfeTable(v.fcfeHeaders, v.ymFcfe));
    for (const note of v.ymFcfeNotes) {
      result.push(p([t(`※ ${note}`, { size: 16 })]));
    }
    result.push(emptyP());
  }

  // 6. 민감도 분석
  result.push(subTitle('6. 민감도 분석'));

  // 6a. 영업가치 Sensitivity
  if (v.operatingSensitivity.rowHeaders.length > 0) {
    result.push(p([t('영업가치 Sensitivity (Ke vs g)', { bold: true })]));
    result.push(makeTable([
      headerRow(['Ke \\ g', ...v.operatingSensitivity.colHeaders]),
      ...v.operatingSensitivity.rowHeaders.map((rh, i) =>
        dataRow([rh, ...v.operatingSensitivity.values[i]])
      ),
    ]));
    result.push(emptyP());
  }

  // 6b. 지분가치 Sensitivity
  if (v.equitySensitivity.length > 0) {
    result.push(p([t('지분가치 Sensitivity (담보평가액)', { bold: true })]));
    result.push(makeTable([
      headerRow(['시나리오', 'Equity Value', '유미 지분', '테크 지분(83.55%)', '총 담보액', 'LTV']),
      ...v.equitySensitivity.map(row =>
        dataRow([row.scenario, row.equityValue, row.youmeShare, row.techShare, row.totalCollateral, row.ltv])
      ),
    ]));
  }

  return result;
}

function buildFcfeTable(headers: string[], rows: FcfeRow[]): Table {
  if (rows.length === 0) return makeTable([]);
  return makeTable([
    headerRow(['항목', ...headers]),
    ...rows.map(r => dataRow([r.label, ...r.values])),
  ]);
}
