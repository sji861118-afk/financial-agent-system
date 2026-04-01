import type { LoanTypeProfile } from '../types';

export const unsoldCollateralProfile: LoanTypeProfile = {
  type: 'unsold-collateral',
  sectionOrder: [
    'header',
    'overview',
    'basic-terms',
    'funding',
    'conditions-security',
    'opinion',
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
