// app/src/lib/loan-engine/index.ts
export { generateDocx } from './generator.js';
export type {
  LoanApplication, LoanType, LoanTypeProfile,
  SectionId, SectionBuilder, SectionContent,
  TypeSpecificData, EquityPledgeData,
  ApplicationMeta, BorrowerInfo, LoanTerms, FundingPlan,
  CollateralSecurityItem, LoanConditions, SyndicateInfo,
  InterestRateBreakdown, FinancialStatements, RelatedEntityFinancials,
  BorrowingDetail, UnresolvedItem,
} from './types.js';

// Profile exports
export { equityPledgeProfile } from './profiles/equity-pledge.js';
