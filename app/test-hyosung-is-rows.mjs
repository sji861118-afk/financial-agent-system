// IS rows에 감가/무형 키 있는지 확인 (보강 fail 시 fallback 가능성)
import { config } from 'dotenv';
config({ path: '.env.local' });
const { buildFinancialData } = await import('./src/lib/dart-api.ts');

const d = await buildFinancialData('01316245', ['2023','2024','2025'], '298040');
console.log('=== IS rows (개별) — 감가/상각/판관 키워드 검색 ===');
for (const r of d.isItems) {
  if (/감가|상각|판매|관리|비용/.test(r.account)) {
    console.log(`  ${r.account.padEnd(35)}`, ['2023','2024','2025'].map(y => `${y}=${r[y] ?? '-'}`).join(' | '));
  }
}
console.log('\n=== BS rows (개별) — 감가/상각 키워드 검색 ===');
for (const r of d.bsItems) {
  if (/감가|상각/.test(r.account)) {
    console.log(`  ${r.account.padEnd(35)}`, ['2023','2024','2025'].map(y => `${y}=${r[y] ?? '-'}`).join(' | '));
  }
}
