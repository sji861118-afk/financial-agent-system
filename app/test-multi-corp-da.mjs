// 다양한 산업·규모의 기업으로 D&A 추출 일반화 검증
import { config } from 'dotenv';
config({ path: '.env.local' });
const { buildFinancialData } = await import('./src/lib/dart-api.ts');

const TARGETS = [
  ['삼성전자', '00126380', '005930'],
  ['LG화학', '00356361', '051910'],
  ['SK하이닉스', '00164779', '000660'],
  ['카카오', '00258801', '035720'],
  ['셀트리온', '00413046', '068270'],
  ['NAVER', '00266961', '035420'],
  ['현대건설', '00164478', '000720'],
  ['대우건설', '00124540', '047040'],
  ['효성중공업', '01316245', '298040'],
];

const YEARS = ['2023', '2024', '2025'];

console.log('회사'.padEnd(12), '|', 'OFS통합'.padEnd(13), '|', 'OFS유형(참고)'.padEnd(13), '|', 'OFS무형(참고)'.padEnd(13), '|', 'CF원본감가'.padEnd(13), '|', 'EBITDA(개별25)'.padEnd(15));
console.log('-'.repeat(110));

for (const [name, corp, stock] of TARGETS) {
  try {
    const t0 = Date.now();
    const d = await buildFinancialData(corp, YEARS, stock);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // CF에서 보강된 행 + 원래 있던 행 분류
    const cfDA = d.cfItems.filter(r => /감가상각|무형자산상각|사용권/.test(r.account));
    const combined = cfDA.find(r => /\(주석\)|(및|와)무형자산상각비/.test(r.account));
    const refDep = cfDA.find(r => /유형자산감가상각비\(참고\)/.test(r.account));
    const refAm = cfDA.find(r => /무형자산상각비\(참고\)/.test(r.account));
    const orig = cfDA.find(r => !/\(주석\)|\(참고\)/.test(r.account) && /감가상각/.test(r.account));

    const f = (r) => r ? (r['2025'] ?? '-').toLocaleString?.() || String(r['2025'] ?? '-') : '-';
    const ebi = d.ratios['2025']?.['EBITDA'] ?? '-';

    console.log(
      name.padEnd(12), '|',
      String(f(combined)).padEnd(13), '|',
      String(f(refDep)).padEnd(13), '|',
      String(f(refAm)).padEnd(13), '|',
      String(f(orig)).padEnd(13), '|',
      String(ebi).padEnd(15),
      `(${elapsed}s)`
    );
  } catch (e) {
    console.log(name.padEnd(12), '| ERROR:', e.message);
  }
}
