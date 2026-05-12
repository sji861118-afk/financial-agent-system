/**
 * 토지·구분건물 비준사례 추출기 통합 테스트 — 제넥신 마곡 컨소시엄 PDF 기준
 *
 * 검증포인트:
 *   1. 토지 거래사례 ≥ 3건 (P56-57: A/B/C)
 *   2. 토지 평가사례 ≥ 4건 (P55-56: 1/2/3/4)
 *   3. 구분건물 거래사례 ≥ 5건 (P67: A/B/C/D/E)
 *   4. 구분건물 평가사례 ≥ 6건 (P68: 1/2/3/4/5/6)
 *   5. 각 사례: areaSqm/price/pricePerPyeong 숫자 변환 정상, baseDate ISO 포맷
 *   6. Excel 출력에 4개 시트 추가 + 헤더 + 데이터 행 정확
 */
import fs from 'fs';
import { parseAppraisalPdf } from './src/lib/appraisal-parser.ts';
import { adaptParserResult } from './src/lib/appraisal/parser-adapter.ts';
import { generateAppraisalExcel } from './src/lib/appraisal/orchestrator.ts';
import ExcelJS from 'exceljs';

const PDF = String.raw`c:\Users\OK\Downloads\[NHIS] 제넥신 마곡 컨소시엄 오피스 담보대출 패키지_v3.0\3.감정평가서\본담보\감정평가서 (DRAFT_260420).pdf`;

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS: ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`); }
};

console.log('\n=== Step 1: parseAppraisalPdf ===');
const buf = fs.readFileSync(PDF);
const parsed = await parseAppraisalPdf(buf, 'industrial-center');

check('parsedAppraisal exists', !!parsed);
check('토지 거래사례 ≥ 3건', parsed.landTradeCases.length >= 3, `실제 ${parsed.landTradeCases.length}건`);
check('토지 평가사례 ≥ 4건', parsed.landAppraisalCases.length >= 4, `실제 ${parsed.landAppraisalCases.length}건`);
check('구분건물 거래사례 ≥ 5건', parsed.unitTradeCases.length >= 5, `실제 ${parsed.unitTradeCases.length}건`);
check('구분건물 평가사례 ≥ 6건', parsed.unitAppraisalCases.length >= 6, `실제 ${parsed.unitAppraisalCases.length}건`);

// 토지 거래사례 A: 마곡동 791-4 / 845.4㎡ / 가격 11,500,000,000 / 단가 13,600,000
const landTradeA = parsed.landTradeCases.find(c => c.label === 'A');
check('토지 거래 A: 지번 포함 791-4', !!landTradeA && landTradeA.plotNumber.includes('791-4'),
      landTradeA?.plotNumber ?? 'missing');
check('토지 거래 A: 면적 845.4㎡', !!landTradeA && Math.abs(landTradeA.areaSqm - 845.4) < 0.01,
      landTradeA ? String(landTradeA.areaSqm) : 'missing');
check('토지 거래 A: 가격 11,500,000,000', !!landTradeA && landTradeA.price === 11_500_000_000,
      landTradeA ? String(landTradeA.price) : 'missing');
check('토지 거래 A: 단가 13,600,000', !!landTradeA && landTradeA.pricePerPyeong === 13_600_000,
      landTradeA ? String(landTradeA.pricePerPyeong) : 'missing');
check('토지 거래 A: 카테고리=토지', landTradeA?.caseCategory === '토지');
check('토지 거래 A: 지목=대', landTradeA?.landCategory === '대');
check('토지 거래 A: 도로조건=중로한면', landTradeA?.roadCondition === '중로한면');

// 토지 평가사례 1: 마곡동 762-2, 8,818.8㎡, 단가 13,940,000
const landAppraisal1 = parsed.landAppraisalCases.find(c => c.label === '1');
check('토지 평가 1: 면적 8,818.8', !!landAppraisal1 && Math.abs(landAppraisal1.areaSqm - 8818.8) < 0.1);
check('토지 평가 1: 단가 13,940,000', !!landAppraisal1 && landAppraisal1.pricePerPyeong === 13_940_000);
check('토지 평가 1: 평가목적=담보', landAppraisal1?.purpose === '담보');
check('토지 평가 1: 카테고리=토지', landAppraisal1?.caseCategory === '토지');

// 구분건물 거래사례 A: 디앤씨 캠퍼스, -/2/201, 858.39㎡, 가격 6,230,000,000
const unitTradeA = parsed.unitTradeCases.find(c => c.label === 'A');
check('구분 거래 A: 명칭=디앤씨 캠퍼스', unitTradeA?.buildingName === '디앤씨 캠퍼스');
check('구분 거래 A: 동/층/호=-/2/201', unitTradeA?.dongFloorUnit === '-/2/201');
check('구분 거래 A: 전유면적 858.39', !!unitTradeA && Math.abs(unitTradeA.areaSqm - 858.39) < 0.01);
check('구분 거래 A: 가격 6,230,000,000', unitTradeA?.price === 6_230_000_000);
check('구분 거래 A: 단가 7,260,000', unitTradeA?.pricePerPyeong === 7_260_000);
check('구분 거래 A: 거래시점 2025-11-03', unitTradeA?.baseDate === '2025-11-03');
check('구분 거래 A: 카테고리=구분건물', unitTradeA?.caseCategory === '구분건물');

// 구분건물 평가사례 1: 이노센터, 6층/603, 780,000,000원, 담보목적
const unitAppraisal1 = parsed.unitAppraisalCases.find(c => c.label === '1');
check('구분 평가 1: 명칭=이노센터', unitAppraisal1?.buildingName === '이노센터');
check('구분 평가 1: 동/층/호=6층/603', unitAppraisal1?.dongFloorUnit === '6층/603');
check('구분 평가 1: 평가액 780,000,000', unitAppraisal1?.price === 780_000_000);
check('구분 평가 1: 목적=담보', unitAppraisal1?.purpose === '담보');
check('구분 평가 1: 사용승인일=2022.07.28', unitAppraisal1?.approvalDate === '2022.07.28');

console.log('\n=== Step 2: adaptParserResult ===');
const data = adaptParserResult(parsed, 'industrial-center', 0.9,
  [{ fileName: '감정평가서 (DRAFT_260420).pdf', pages: 0, parseStatus: 'ok' }], []);
check('AppraisalData.landTradeCases 전달', data.landTradeCases?.length === parsed.landTradeCases.length);
check('AppraisalData.unitAppraisalCases 전달', data.unitAppraisalCases?.length === parsed.unitAppraisalCases.length);

console.log('\n=== Step 3: generateAppraisalExcel ===');
const { buffer, findings, fileName } = await generateAppraisalExcel({ data });
check('Excel buffer 생성', buffer.length > 0, `${(buffer.length/1024).toFixed(1)} KB`);
check('Excel fileName', fileName.endsWith('.xlsx'), fileName);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer);
const sheetNames = wb.worksheets.map(ws => ws.name);
console.log('  Excel 시트 목록:', sheetNames.join(', '));
check('시트 존재: 토지비준-거래사례', sheetNames.includes('토지비준-거래사례'));
check('시트 존재: 토지비준-평가사례', sheetNames.includes('토지비준-평가사례'));
check('시트 존재: 구분건물비준-거래사례', sheetNames.includes('구분건물비준-거래사례'));
check('시트 존재: 구분건물비준-평가사례', sheetNames.includes('구분건물비준-평가사례'));

// 시트별 데이터 행 검증
const wsLandTrade = wb.getWorksheet('토지비준-거래사례');
if (wsLandTrade) {
  // row 5 = first data row
  const labelA = wsLandTrade.getCell(5, 1).value;
  const areaA = wsLandTrade.getCell(5, 3).value;
  const priceA = wsLandTrade.getCell(5, 10).value;
  check('토지비준-거래사례 1행: label=A', labelA === 'A', String(labelA));
  check('토지비준-거래사례 1행: 면적=845.4', areaA === 845.4, String(areaA));
  check('토지비준-거래사례 1행: 가격=11,500,000,000', priceA === 11_500_000_000, String(priceA));
}

const wsUnitTrade = wb.getWorksheet('구분건물비준-거래사례');
if (wsUnitTrade) {
  const buildingA = wsUnitTrade.getCell(5, 3).value;
  const dongA = wsUnitTrade.getCell(5, 4).value;
  const priceA = wsUnitTrade.getCell(5, 7).value;
  check('구분건물비준-거래사례 1행: 명칭=디앤씨 캠퍼스', buildingA === '디앤씨 캠퍼스', String(buildingA));
  check('구분건물비준-거래사례 1행: 동/층/호=-/2/201', dongA === '-/2/201', String(dongA));
  check('구분건물비준-거래사례 1행: 가격=6,230,000,000', priceA === 6_230_000_000, String(priceA));
}

console.log('\n=== Step 4: Save dump for inspection ===');
const dumpPath = './test-output-appraisal-comparatives.xlsx';
fs.writeFileSync(dumpPath, buffer);
console.log(`  Wrote: ${dumpPath}`);

console.log(`\n=== 결과: ${pass} pass, ${fail} fail ===`);
if (fail > 0) process.exit(1);
