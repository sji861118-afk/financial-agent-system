// app/src/lib/loan-engine/generator.ts
import { Document, Packer, convertInchesToTwip } from 'docx';
import type { LoanApplication, LoanTypeProfile, SectionContent } from './types';
import { getSection } from './sections/registry';
import { pageBreak } from './sections/helpers';

// Import all section builders to trigger registration
import './sections/common/header';
import './sections/common/overview';
import './sections/common/basic-terms';
import './sections/common/syndicate';
import './sections/common/funding';
import './sections/common/conditions-security';
import './sections/common/interest-rate';
import './sections/common/structure';
import './sections/common/opinion';
import './sections/common/obligor';
import './sections/common/borrowings';
import './sections/common/financial-opinion';
import './sections/common/risk-analysis';
import './sections/common/checklist';
import './sections/common/tbd-summary';
import './sections/plugins/equity-pledge';
import './sections/plugins/unsold-collateral';

export interface GenerateOptions {
  profile: LoanTypeProfile;
}

export async function generateDocx(
  data: LoanApplication,
  options: GenerateOptions,
): Promise<Buffer> {
  const { profile } = options;
  const allChildren: SectionContent = [];

  for (const sectionId of profile.sectionOrder) {
    if (sectionId === 'PAGE_BREAK') {
      allChildren.push(pageBreak());
      continue;
    }

    const builder = getSection(sectionId);
    if (!builder) {
      console.warn(`[loan-engine] No builder registered for section: ${sectionId}`);
      continue;
    }

    const result = builder(data);
    if (result !== null) {
      allChildren.push(...result);
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: '맑은 고딕', size: 18 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.59),
            bottom: convertInchesToTwip(0.59),
            left: convertInchesToTwip(0.59),
            right: convertInchesToTwip(0.59),
          },
        },
      },
      children: allChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
