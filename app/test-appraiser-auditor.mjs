// app/test-appraiser-auditor.mjs
import { auditAsAppraiser } from './src/lib/appraisal/auditors/appraiser-auditor.ts';

const baseData = {
  source: { appraisalReports: [], feasibilityReports: [], parsedAt: '2026-04-17' },
  formType: 'apartment-pf',
  detectionConfidence: 1,
  collateral: {
    method: { comparison: 80, cost: 20, income: 0 },
    appraisalValue: 95000,
    totalArea: 28500,
    totalAreaPyeong: 8624,
    baseDate: '2026-03-15',
    serialNo: 'A2026-001',
    appraiser: 'XX감정평가법인',
  },
  collateralDetail: [],
  comparatives: [],
  missingFields: [],
};

const tests = [
  {
    name: '평가방법 합계 110% → ERROR',
    data: { ...baseData, collateral: { ...baseData.collateral, method: { comparison: 90, cost: 20, income: 0 } } },
    expectError: '평가방법',
  },
  {
    name: '비교사례 4건 미만 → INFO',
    data: { ...baseData, comparatives: [{ type: '거래', pricePerPyeong: 1000 }] },
    expectInfo: '비교사례',
  },
  {
    name: '기준시점 12개월 경과 → WARNING',
    data: { ...baseData, collateral: { ...baseData.collateral, baseDate: '2025-04-01' } },
    expectWarning: '기준시점',
  },
  {
    name: '호별 합계 불일치 → ERROR',
    data: {
      ...baseData,
      collateralDetail: [{ appraisalValue: 50000, areaSqm: 100 }, { appraisalValue: 50000, areaSqm: 100 }],
    },
    expectError: '호별합계',
  },
  {
    name: '정상 데이터 → ERROR/WARNING 없음',
    data: { ...baseData, comparatives: Array.from({ length: 4 }, () => ({ type: '거래', pricePerPyeong: 11 })) },
    expectNothing: true,
  },
];

let passed = 0, failed = 0;
for (const t of tests) {
  const findings = auditAsAppraiser(t.data);
  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARNING');
  const infos = findings.filter(f => f.severity === 'INFO');

  let ok = false;
  if (t.expectError) ok = errors.some(f => f.category === t.expectError);
  else if (t.expectWarning) ok = warnings.some(f => f.category === t.expectWarning);
  else if (t.expectInfo) ok = infos.some(f => f.category === t.expectInfo);
  else if (t.expectNothing) ok = errors.length === 0 && warnings.length === 0;

  console.log(`${ok ? '✓' : '✗'} ${t.name} — findings: ${errors.length}E/${warnings.length}W/${infos.length}I`);
  if (ok) passed++; else failed++;
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
