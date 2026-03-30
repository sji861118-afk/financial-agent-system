// app/src/lib/loan-engine/sections/common/funding.ts
import type { LoanApplication, SectionContent } from '../../types.js';
import { registerSection } from '../registry.js';

// funding is handled inline by basic-terms.ts (cashIn/cashOut + detailedFunding)
// This separate builder is for the extended "소요자금 조달·지출계획" in PF/construction
function buildFundingPlan(data: LoanApplication): SectionContent | null {
  // Phase 4: Implement when PF/construction plugins are added
  return null;
}

registerSection('funding', buildFundingPlan);
registerSection('funding-plan', buildFundingPlan);
export { buildFundingPlan };
