// app/src/lib/loan-engine/generator.ts
import { Document, Packer, convertInchesToTwip } from 'docx';
import type { LoanApplication, LoanTypeProfile, SectionContent } from './types.js';
import { getSection } from './sections/registry.js';
import { pageBreak } from './sections/helpers.js';

// Import all section builders to trigger registration
import './sections/common/header.js';
import './sections/common/overview.js';
import './sections/common/basic-terms.js';
import './sections/common/syndicate.js';
import './sections/common/funding.js';
import './sections/common/conditions-security.js';
import './sections/common/interest-rate.js';
import './sections/common/structure.js';
import './sections/common/opinion.js';
import './sections/common/obligor.js';
import './sections/common/borrowings.js';
import './sections/common/financial-opinion.js';
import './sections/common/risk-analysis.js';
import './sections/common/checklist.js';
import './sections/common/tbd-summary.js';
import './sections/plugins/equity-pledge.js';

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
