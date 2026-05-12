/**
 * v5 DOCX 생성기 — 메인 진입점
 * generateV5Docx(data: DealDataset) → Buffer
 */
import {
  Document, Packer, Header, Footer, PageNumber, TextRun,
} from 'docx';
import { AlignmentType } from 'docx';
import { FONT, SZ, t, p } from './builder';
import { buildTitle } from './sections/title';
import { buildBasicTerms } from './sections/basic-terms';
import { buildSecurity } from './sections/security';
import { buildOpinion } from './sections/opinion';
import { buildCollateral } from './sections/collateral';
import { buildValuation } from './sections/valuation';
import { buildAnalysis } from './sections/analysis';
import { buildObligor } from './sections/obligor';
import { buildCashflow } from './sections/cashflow';
import { buildRisk } from './sections/risk';
import type { DealDataset } from './types';

export async function generateV5Docx(data: DealDataset): Promise<Buffer> {
  const borrowerName = data.deal.borrowerName;
  const deptName = data.deal.departmentName || '기업금융1본부';

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SZ },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 850, bottom: 850, left: 850, right: 850 },
        },
      },
      headers: {
        default: new Header({
          children: [
            p([t(`여신승인신청서 — ${borrowerName}`, { size: 14, color: '888888' })], {
              alignment: AlignmentType.RIGHT,
              spacing: { after: 0 },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            p([
              t(`${deptName}  |  `, { size: 14, color: '888888' }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: '888888' }),
              t(' / ', { size: 14, color: '888888' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: '888888' }),
            ], {
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
            }),
          ],
        }),
      },
      children: [
        ...buildTitle(data),
        ...buildBasicTerms(data),
        ...buildSecurity(data),
        ...buildOpinion(data),
        ...buildCollateral(data),
        ...buildValuation(data),
        ...buildAnalysis(data),
        ...buildObligor(data),
        ...buildCashflow(data),
        ...buildRisk(data),
      ],
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export type { DealDataset } from './types';
