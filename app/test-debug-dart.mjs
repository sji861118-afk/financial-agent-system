const { findCorpCode } = await import('./src/lib/dart-corp-codes.ts');
const dartApi = await import('./src/lib/dart-api.ts');
const { buildFinancialData, fetchBorrowingNotes } = dartApi;

const corp = findCorpCode('에이엠플러스자산개발');
console.log('corp:', corp);

const d = await buildFinancialData(corp.corpCode, ['2023','2024','2025']);

// BS data types
const bs = d.bsItems;
const assetItem = bs.find(r => r.account.includes('자산총계'));
if (assetItem) {
  console.log('\n자산총계:', assetItem.account, 'depth:', assetItem.depth);
  for (const y of d.years) console.log('  y:', y, 'val:', assetItem[y], 'type:', typeof assetItem[y]);
}

const debtItem = bs.find(r => r.account.includes('부채총계'));
if (debtItem) {
  console.log('부채총계:', debtItem.account);
  for (const y of d.years) console.log('  y:', y, 'val:', debtItem[y], 'type:', typeof debtItem[y]);
}

// IS data types
const is = d.isItems;
const revItem = is.find(r => r.account.includes('매출액'));
if (revItem) {
  console.log('\n매출액:', revItem.account);
  for (const y of d.years) console.log('  y:', y, 'val:', revItem[y], 'type:', typeof revItem[y]);
}

const opItem = is.find(r => r.account === '영업이익' || r.account.includes('영업이익'));
console.log('영업이익 found:', opItem?.account);
if (opItem) {
  for (const y of d.years) console.log('  y:', y, 'val:', opItem[y], 'type:', typeof opItem[y]);
}

// Borrowings from DART
const borrowItems = bs.filter(r => r.account.includes('차입금') && !r.account.includes('대여') && !r.account.includes('대손'));
console.log('\n차입금 계정들:');
for (const b of borrowItems) console.log(' ', b.account, '2025:', b['2025'], typeof b['2025']);

const bondItem = bs.find(r => r.account === '사채');
console.log('사채:', bondItem?.account, '2025:', bondItem?.['2025']);

// fetchBorrowingNotes
console.log('\n--- 차입금 주석 ---');
const bNotes = await fetchBorrowingNotes(corp.corpCode, ['2024','2025']);
if (bNotes) {
  console.log('title:', bNotes.title);
  console.log('totalCurrent:', bNotes.totalCurrent);
  console.log('details count:', bNotes.details?.length);
  if (bNotes.details?.length > 0) {
    for (const det of bNotes.details.slice(0, 5)) {
      console.log(' ', det);
    }
  }
} else {
  console.log('borrowingNotes: null');
}
