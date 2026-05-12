// REIT 케이스 검증 — 디디아이남청라로지스틱스위탁관리부동산투자회사
import { config } from 'dotenv';
config({ path: '.env.local' });
const { buildFinancialData } = await import('./src/lib/dart-api.ts');

const d = await buildFinancialData('01783003', ['2023', '2024', '2025']);
console.log('hasOfs:', d.hasOfs, 'hasCfs:', d.hasCfs, 'cfItems.len:', d.cfItems.length);

console.log('\n=== BS 차입금 관련 행 ===');
for (const r of d.bsItems) {
  if (/차입금|사채|리스부채|금융부채/.test(r.account) && !/대여/.test(r.account)) {
    console.log(`  ${r.account.padEnd(25)}`, ['2023','2024','2025'].map(y => `${y}=${r[y] ?? '-'}`).join(' | '));
  }
}

console.log('\n=== IS 감가/이자 관련 행 ===');
for (const r of d.isItems) {
  if (/감가상각|무형자산|이자비용|영업이익|영업수익|매출/.test(r.account)) {
    console.log(`  ${r.account.padEnd(25)}`, ['2023','2024','2025'].map(y => `${y}=${r[y] ?? '-'}`).join(' | '));
  }
}

console.log('\n=== 비율 (calcRatios 결과) ===');
for (const yr of d.years) {
  const r = d.ratios[yr] || {};
  console.log(`  ${yr}:`, ['총차입금','순차입금','부채비율','EBITDA','이자보상배율','EBITDA/이자비용'].map(k => `${k}=${r[k]||'-'}`).join(' | '));
}
