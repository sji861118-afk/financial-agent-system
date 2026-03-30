// app/src/lib/loan-engine/sections/common/structure.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { sectionTitle, tbdText, emptyLine } from '../helpers.js';
import { registerSection } from '../registry.js';

function buildStructure(data: LoanApplication): SectionContent | null {
  // Phase 2+: render from typeSpecific data or image
  return [sectionTitle('금융구조도'), tbdText('[TBD: 금융구조도 향후 업데이트]'), emptyLine()];
}

registerSection('structure', buildStructure);
export { buildStructure };
