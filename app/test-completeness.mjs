/**
 * 완성도 체커 테스트 — 에이엠플러스자산개발 실데이터
 */
import path from 'path';
import fs from 'fs';

const { findCorpCode } = await import('./src/lib/dart-corp-codes.ts');
const dartApi = await import('./src/lib/dart-api.ts');
const { checkCompleteness } = await import('./src/lib/loan-engine/completeness-checker.ts');

const dir = path.join('C:', 'Users', 'OK', 'Downloads', '에이엠플러스자산개발 (2)');

// 1. PDF 텍스트 추출
const pdfParse = (await import('pdf-parse')).default;
const reviewPdf = path.join(dir, '■ 기업금융1본부 접수여신 검토의견(`26.03.30.)_에이엠플러스자산개발 (1).pdf');
const pdfResult = await pdfParse(fs.readFileSync(reviewPdf));
const pdfText = pdfResult.text.replace(/\u0000/g, ' ');

// 2. Excel 텍스트 추출
const ExcelJS = (await import('exceljs')).default;
const xlsxPath = path.join(dir, '(20260312) 신길AK푸르지오 담보대출 호실.xlsx');
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);
const excelRows = [];
wb.eachSheet(s => s.eachRow(r => excelRows.push(r.values.slice(1).map(v => String(v ?? '')).join('\t'))));
const excelText = excelRows.join('\n');

const allText = `[검토의견.pdf]\n${pdfText}\n\n[호실.xlsx]\n${excelText}`;

// 3. DART 조회
const corp = findCorpCode('에이엠플러스자산개발');
const dartData = await dartApi.buildFinancialData(corp.corpCode, ['2023','2024','2025']);
const bNotes = await dartApi.fetchBorrowingNotes(corp.corpCode, ['2024','2025']);

// 4. 완성도 체크
const report = checkCompleteness({
  extractedText: allText,
  fileNames: ['검토의견.pdf', '호실.xlsx', '관리형토지신탁.pdf', '분양계약서.pdf'],
  dart: {
    hasCompanyInfo: !!dartData.companyInfo?.ceoNm,
    hasFinancials: dartData.hasData,
    hasBorrowingNotes: !!bNotes?.details?.length,
    years: dartData.years,
  },
  appraisal: undefined, // 감정평가서 미업로드
});

// 5. 결과 출력
console.log('═══════════════════════════════════════════');
console.log(`전체 완성도: ${report.overall}%  |  필수항목: ${report.requiredCompleteness}%`);
console.log('═══════════════════════════════════════════\n');

for (const s of report.sections) {
  const bar = '█'.repeat(Math.floor(s.completeness / 5)) + '░'.repeat(20 - Math.floor(s.completeness / 5));
  const req = s.required ? '★' : ' ';
  console.log(`${req} ${s.title.padEnd(30)} ${bar} ${s.completeness}%`);

  for (const f of s.fields) {
    const icon = f.status === 'filled' ? '✓' : f.status === 'partial' ? '△' : '✗';
    const src = f.source ? ` [${f.source}]` : '';
    const val = f.value ? ` — ${f.value}` : '';
    if (f.status !== 'filled') {
      console.log(`    ${icon} ${f.label}${src}${val}`);
    }
  }
}

console.log('\n─── 부족 데이터 제안 ───');
for (const s of report.missingDataSuggestions) {
  console.log(`\n[${s.priority.toUpperCase()}] ${s.dataType}`);
  console.log(`  ${s.description}`);
  console.log(`  영향 섹션: ${s.affectedSections.slice(0, 5).join(', ')}${s.affectedSections.length > 5 ? ` 외 ${s.affectedSections.length - 5}건` : ''}`);
}
