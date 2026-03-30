// app/src/lib/loan-engine/profiles/equity-pledge.ts
import type { LoanTypeProfile } from '../types.js';

export const equityPledgeProfile: LoanTypeProfile = {
  type: 'equity-pledge',
  sectionOrder: [
    'header',
    'overview',
    'basic-terms',
    'syndicate',           // skipped if no data
    'funding',
    'conditions-security',
    'opinion',
    'PAGE_BREAK',
    'plugin:equity-pledge',
    'PAGE_BREAK',
    'obligor-borrower',
    'borrowings',
    'obligor-related',
    'financial-opinion',
    'risk-analysis',
    'checklist',
    'tbd-summary',
  ],
  conditionsAndSecurity: 'merged',
};
