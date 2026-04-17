// 실행: cd app && npx tsx test-property-detector.mjs
import { detectApplicationFormType } from './src/lib/appraisal/property-detector.ts';

const fixtures = [
  {
    name: '아파트PF (광명9R)',
    text: '재개발사업 광명9R구역 공동주택 354세대 아파트 PF대출',
    expectedType: 'apartment-pf',
  },
  {
    name: '지식산업센터 (에이엠플러스)',
    text: '지식산업센터 인덕원 호실 170개 제조시설',
    expectedType: 'industrial-center',
  },
  {
    name: '토지PF (휴먼스)',
    text: '나대지 필지 용도지역 일반주거 개별공시지가 브릿지대출',
    expectedType: 'land-pf',
  },
  {
    name: '혼합 (아파트가 주)',
    text: '아파트 분양 호실 운영',
    expectedType: 'apartment-pf',
  },
];

let passed = 0, failed = 0;
for (const fx of fixtures) {
  const result = detectApplicationFormType(fx.text);
  const ok = result.type === fx.expectedType;
  console.log(`${ok ? '✓' : '✗'} ${fx.name}: detected=${result.type} confidence=${result.confidence.toFixed(2)} scores=${JSON.stringify(result.scores)}`);
  if (ok) passed++; else failed++;
}
console.log(`\nResult: ${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
