// 효성중공업 통합 + 분리 D&A 보강 검증
import { config } from 'dotenv';
config({ path: '.env.local' });
const { buildFinancialData } = await import('./src/lib/dart-api.ts');

const d = await buildFinancialData('01316245', ['2023','2024','2025'], '298040');

function dump(label, cfRows) {
  console.log(`\n=== ${label} CF — D&A 보강 행들 ===`);
  for (let i = 0; i < cfRows.length; i++) {
    const r = cfRows[i];
    if (/감가상각비|무형자산상각비|사용권|이자지급|이자납부/.test(r.account)) {
      const flag = /\(참고\)/.test(r.account) ? '[참고]' : (/(및|와)무형자산상각비/.test(r.account) ? '[★EBITDA]' : '');
      console.log(`  row${i+3}  ${flag.padEnd(10)} ${r.account.padEnd(40)}`,
        ['2023','2024','2025'].map(y => `${y}=${r[y] ?? '-'}`).join(' | '));
    }
  }
}
dump('OFS(개별)', d.cfItems);
dump('CFS(연결)', d.cfItemsCfs);

// 비율 EBITDA 검증
console.log('\n=== ratios (calcRatios 결과) ===');
for (const yr of d.years) {
  const r = d.ratios[yr] || {};
  const r2 = d.ratiosCfs[yr] || {};
  console.log(`  ${yr}  OFS: EBITDA=${r['EBITDA']||'-'} 이자보상=${r['이자보상배율']||'-'} | CFS: EBITDA=${r2['EBITDA']||'-'} 이자보상=${r2['이자보상배율']||'-'}`);
}
