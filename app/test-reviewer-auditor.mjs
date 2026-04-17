// app/test-reviewer-auditor.mjs
import { auditAsReviewer } from './src/lib/appraisal/auditors/reviewer-auditor.ts';

const baseData = {
  source: { appraisalReports: [], feasibilityReports: [], parsedAt: '2026-04-17' },
  formType: 'apartment-pf',
  detectionConfidence: 1,
  collateral: {
    appraisalValue: 95000,
    priorClaims: 10000,
    ltv: 60,
    rights: [{ holder: 'XX', principal: 10000, maxClaim: 12000 }],
  },
  collateralDetail: [],
  comparatives: [],
  missingFields: [],
};

const tests = [
  {
    name: 'LTV 81% (apartment-pf 임계 80) → WARNING',
    data: { ...baseData, collateral: { ...baseData.collateral, ltv: 81 } },
    expectWarning: 'LTV',
  },
  {
    name: 'LTV 71% (industrial-center 임계 70) → WARNING',
    data: { ...baseData, formType: 'industrial-center', collateral: { ...baseData.collateral, ltv: 71 } },
    expectWarning: 'LTV',
  },
  {
    name: '감정가 0 → ERROR',
    data: { ...baseData, collateral: { ...baseData.collateral, appraisalValue: 0 } },
    expectError: '감정가',
  },
  {
    name: '선순위 비중 60% → WARNING',
    data: { ...baseData, collateral: { ...baseData.collateral, priorClaims: 60000 } },
    expectWarning: '선순위',
  },
  {
    name: '분양률 40% → WARNING',
    data: {
      ...baseData,
      supply: {
        project: { salesRate: 40 },
        salesStatus: [{ totalUnits: 100, unsoldUnits: 60 }],
      },
    },
    expectWarning: '분양현황',
  },
  {
    name: '정상 데이터 → ERROR/WARNING 없음',
    data: baseData,
    expectNothing: true,
  },
];

let passed = 0, failed = 0;
for (const t of tests) {
  const findings = auditAsReviewer(t.data);
  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARNING');

  let ok = false;
  if (t.expectError) ok = errors.some(f => f.category === t.expectError);
  else if (t.expectWarning) ok = warnings.some(f => f.category === t.expectWarning);
  else if (t.expectNothing) ok = errors.length === 0 && warnings.length === 0;

  console.log(`${ok ? '✓' : '✗'} ${t.name} — ${errors.length}E/${warnings.length}W`);
  if (ok) passed++; else failed++;
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
