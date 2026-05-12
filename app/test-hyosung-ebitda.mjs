// 효성중공업 cfData → CF 행 번호 매핑 검증
import { config } from 'dotenv';
config({ path: '.env.local' });

const { buildFinancialData } = await import('./src/lib/dart-api.ts');

const d = await buildFinancialData('01316245', ['2023', '2024', '2025'], '298040');

console.log('\n=== cfItems(개별) 인덱스 → CF 시트 행 번호 매핑 ===');
console.log('  (CF 시트 row offset: title=1, header=2, items=3+i)\n');
let depRow = 0, amortRow = 0, intRow = 0;
for (let i = 0; i < d.cfItems.length; i++) {
  const acc = d.cfItems[i].account;
  const v = String(acc).replace(/\s/g, '');
  const rn = i + 3;
  const flags = [];
  if (!depRow && (v.includes('감가상각비') || v.includes('유형자산감가상각비'))) { depRow = rn; flags.push('★감가'); }
  if (!amortRow && (v.includes('무형자산상각비') || v.includes('사용권자산상각비'))) { amortRow = rn; flags.push('★무형'); }
  if (!intRow && (v === '이자지급' || v === '이자납부' || v === '이자의지급' || v.endsWith('이자지급') || v.endsWith('이자납부'))) {
    intRow = rn; flags.push('★이자');
  }
  if (flags.length || /감가|무형|이자|영업활동/.test(v)) {
    console.log(`  [${String(i).padStart(2)}] row=${rn}  ${flags.join(' ').padEnd(15)} ${acc}`);
  }
}

console.log('\n--- OFS 매핑 결과 ---');
console.log(`  cfDeprRow         = ${depRow}`);
console.log(`  cfAmortRow        = ${amortRow}`);
console.log(`  cfInterestPayRow  = ${intRow}`);

// 예상 EBITDA 셀 수식 (B열 = 23년)
const cfSheet = "'4.현금흐름표(개별)'!";
const opIncomeRow = 7; // 영업이익 IS 행 (사용자 Excel 기준)
const ebitdaFormula = `=B${opIncomeRow}` +
  (depRow ? `+ABS(${cfSheet}B${depRow})` : '') +
  (amortRow ? `+ABS(${cfSheet}B${amortRow})` : '');
console.log(`\n  EBITDA(개별 23년) formula 예상: ${ebitdaFormula}`);

const interestRef = intRow ? `${cfSheet}B${intRow}` : 'B11';
console.log(`  이자보상배율(개별 23년) formula: =IF(${interestRef}=0,"-",B${opIncomeRow}/ABS(${interestRef}))`);
