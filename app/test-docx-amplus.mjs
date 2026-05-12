/**
 * 에이엠플러스자산개발 여신승인신청서 DOCX 초안 생성 테스트 v2
 * Usage: cd app && node --env-file=.env.local --import tsx test-docx-amplus.mjs
 */
import path from 'path';
import fs from 'fs';

const { findCorpCode } = await import('./src/lib/dart-corp-codes.ts');
const dartApi = await import('./src/lib/dart-api.ts');
const { generateDocx, unsoldCollateralProfile } = await import('./src/lib/loan-engine/index.ts');

const dir = path.join('C:', 'Users', 'OK', 'Downloads', '에이엠플러스자산개발 (2)');

// ─── 1. PDF/Excel 텍스트 추출 ───
const pdfParse = (await import('pdf-parse')).default;
const ExcelJS = (await import('exceljs')).default;

const texts = [];
// 검토의견 PDF
const reviewPdf = path.join(dir, '■ 기업금융1본부 접수여신 검토의견(`26.03.30.)_에이엠플러스자산개발 (1).pdf');
try {
  const result = await pdfParse(fs.readFileSync(reviewPdf));
  const cleaned = result.text.replace(/\u0000/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  texts.push(`[검토의견]\n${cleaned}`);
  console.log(`✓ 검토의견 PDF (${cleaned.length}자)`);
} catch(e) { console.log(`✗ 검토의견: ${e.message}`); }

// Excel
const xlsxPath = path.join(dir, '(20260312) 신길AK푸르지오 담보대출 호실.xlsx');
try {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const rows = [];
  wb.eachSheet(s => s.eachRow(r => rows.push(r.values.slice(1).map(v => v?.result !== undefined ? String(v.result) : String(v ?? '')).join('\t'))));
  texts.push(`[호실목록]\n${rows.join('\n')}`);
  console.log(`✓ Excel (${rows.length}행)`);
} catch(e) { console.log(`✗ Excel: ${e.message}`); }

const allText = texts.join('\n\n===\n\n');

// ─── 2. DART 재무 데이터 조회 ───
const corpName = '에이엠플러스자산개발';
const corp = findCorpCode(corpName);
console.log(`\n─── DART: ${corpName} (${corp.corpCode}) ───`);

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 3 }, (_, i) => String(currentYear - 3 + i));
const dartData = await dartApi.buildFinancialData(corp.corpCode, years);

console.log(`✓ hasData:${dartData.hasData} OFS:${dartData.hasOfs} CFS:${dartData.hasCfs} years:${dartData.years}`);
console.log(`  BS:${dartData.bsItems.length}항목, IS:${dartData.isItems.length}항목`);

// ─── 3. DART 값 string→number 변환 ───
const toNum = (v) => {
  if (v === undefined || v === '' || v === '-') return '';
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? v : n;
};

const bsSource = dartData.hasOfs ? dartData.bsItems : dartData.bsItemsCfs;
const isSource = dartData.hasOfs ? dartData.isItems : dartData.isItemsCfs;
const dartYears = dartData.years;

const convertRows = (rows) => rows.map(row => ({
  account: row.account,
  values: Object.fromEntries(dartYears.map(y => [y, toNum(row[y])])),
  bold: row.depth === 0,
  depth: row.depth,
}));

const financials = {
  years: dartYears,
  balanceSheet: convertRows(bsSource),
  incomeStatement: convertRows(isSource),
};

// 변환 검증
const assetCheck = financials.balanceSheet.find(r => r.account.includes('자산총계'));
if (assetCheck) {
  const lastY = dartYears[dartYears.length - 1];
  console.log(`  자산총계[${lastY}]: ${assetCheck.values[lastY]} (type: ${typeof assetCheck.values[lastY]})`);
}

// ─── 4. DART 차입금 주석 조회 ───
const borrowings = [];
try {
  const bNotes = await dartApi.fetchBorrowingNotes(corp.corpCode, years);
  if (bNotes?.details?.length) {
    const topLenders = bNotes.details
      .filter(d => d.currentAmount && d.currentAmount !== '-' && !/합계|소계/.test(d.category))
      .map(d => ({
        lender: d.lender || d.category,
        type: '차입금',
        balance: Math.round(parseInt(String(d.currentAmount).replace(/,/g, '')) / 1000) || 0, // 천원→백만원
        rate: d.interestRate || '-',
        maturity: d.maturityDate || '-',
        repayment: '-',
      }))
      .filter(d => d.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    if (topLenders.length > 0) {
      const findNum = (acct) => {
        const item = bsSource.find(r => r.account.includes(acct) && !r.account.includes('대여'));
        if (!item) return null;
        const v = item[dartYears[dartYears.length-1]];
        if (!v || v === '-') return null;
        return typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
      };
      const summary = [];
      const short = findNum('단기차입금');
      const curLong = findNum('유동성장기차입금');
      const long = findNum('장기차입금');
      if (short) summary.push({ category: '단기차입금', count: 0, balance: short, weightedAvgRate: '-', maturityRange: '1년 이내' });
      if (curLong) summary.push({ category: '유동성장기차입금', count: 0, balance: curLong, weightedAvgRate: '-', maturityRange: '1년 이내' });
      if (long) summary.push({ category: '장기차입금', count: 0, balance: long, weightedAvgRate: '-', maturityRange: '1년 초과' });
      borrowings.push({ entityName: corpName, summary, topLenders: topLenders.slice(0, 10) });
      console.log(`✓ 차입금 주석: ${topLenders.length}건 (top10 포함)`);
    }
  }
} catch(e) { console.log(`차입금 주석 조회 실패: ${e.message}`); }

// ─── 5. 텍스트에서 대출조건 추출 ───
function extract(text, pat) { const m = text.match(pat); return m ? m[1].trim() : null; }

const amountMatch = allText.match(/(?:모집금액|대출금액|한도대출)[^0-9]*([\d,.]+)\s*억/);
const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) * 100 : 0;
const rateStr = extract(allText, /(?:금리|이자율|수익률)[^0-9]*([\d.]+)\s*%/);
const rate = rateStr ? parseFloat(rateStr) : undefined;
const durStr = extract(allText, /(\d+)\s*개월/);
const duration = durStr ? parseInt(durStr) : 12;
const ltvStr = extract(allText, /LTV\s*([\d.]+)%/);
const collateralDesc = extract(allText, /(?:주요\s*)?채권보전[:\s]*([^\n]+)/) || '미분양 호실 담보 (담보신탁 1순위 우선수익권)';

// 자금용도 테이블
const tableMatch = allText.match(/항목\s*금액[^\n]*\n([\s\S]*?)(?=합계|주요\s*채권보전)/);
const cashOut = [];
if (tableMatch) {
  for (const row of tableMatch[1].split('\n').filter(l => l.trim())) {
    const m = row.match(/(.+?)\s*([\d,.]+)\s*$/);
    if (m) {
      const val = parseFloat(m[2].replace(/,/g, ''));
      if (val > 0 && val < 10000) cashOut.push({ item: m[1].trim(), amount: val * 100 });
    }
  }
}

// 검토의견
const parts = [];
const overview = extract(allText, /대출개요\s*([\s\S]*?)(?=장점|$)/);
if (overview) parts.push(`[대출개요]\n${overview.slice(0, 500)}`);
const pros = extract(allText, /장점\s*([\s\S]*?)(?=단점|$)/);
if (pros) parts.push(`[장점]\n${pros.slice(0, 500)}`);
const cons = extract(allText, /단점\s*([\s\S]*?)(?=영업점|$)/);
if (cons) parts.push(`[단점]\n${cons.slice(0, 500)}`);
const opinion = parts.join('\n\n');

const totalUnits = extract(allText, /총\s*(?:세대|가구)\s*([\d,]+)/);
const soldUnits = extract(allText, /분양\s*(?:세대|가구)\s*([\d,]+)/);
const unsoldUnits = extract(allText, /미분양\s*(?:세대|가구)\s*([\d,]+)/);
const saleRate = extract(allText, /분양률\s*([\d.]+)%/) || extract(allText, /\(([\d.]+)%\)/);

// ─── 5-2. Excel에서 호실 데이터 파싱 → UnsoldCollateralData ───
const units = [];
{
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(xlsxPath);
  let unitNo = 0;
  wb2.eachSheet(s => {
    s.eachRow((r, rn) => {
      if (rn < 5) return;
      const v = r.values.slice(1).map(x => x?.result !== undefined ? x.result : x);
      const checkReq = v[8]; // I열: 검토요청
      if (checkReq !== 'O') return;
      unitNo++;
      const salesPrice = typeof v[9] === 'number' ? Math.round(v[9] / 1000000) : 0; // 원→백만원
      const midBalance = typeof v[12] === 'number' ? Math.round(v[12] / 1000000) : 0;
      units.push({
        no: unitNo,
        building: String(v[1] || ''),
        unit: String(v[2] || ''),
        type: String(v[4] || ''),
        salesPrice,
        midPaymentBalance: midBalance || undefined,
        note: v[13] ? String(v[13]).slice(0, 30) : undefined,
      });
    });
  });
}
console.log(`✓ 검토요청 호실: ${units.length}건`);

// 민감도 시나리오 자동 생성
const totalSalesValue = units.reduce((s, u) => s + (u.salesPrice || 0), 0);
const sensitivityRates = [0, 10, 20, 30, 40, 50, 57.1];
const sensitivity = sensitivityRates.map(rate => {
  const salesRevenue = Math.round(totalSalesValue * rate / 100 * 0.65); // 상환비율 65%
  const loanBalance = amount - salesRevenue;
  const unsoldValue = Math.round(totalSalesValue * (100 - rate) / 100);
  const unsoldLtv = unsoldValue > 0 ? (loanBalance / unsoldValue) * 100 : 0;
  return {
    salesRate: rate,
    salesRevenue: salesRevenue > 0 ? salesRevenue : undefined,
    loanBalance: loanBalance > 0 ? loanBalance : 0,
    unsoldValue: unsoldValue > 0 ? unsoldValue : undefined,
    unsoldLtv: unsoldLtv > 0 ? unsoldLtv : undefined,
    note: rate === 0 ? '' : unsoldLtv < 50 ? '타행대환가능' : '',
  };
});

console.log(`\n─── 추출 ───`);
console.log(`금액:${amount/100}억 기간:${duration}개월 LTV:${ltvStr}%`);
console.log(`자금용도: ${cashOut.map(c=>`${c.item}${c.amount/100}억`).join(', ')}`);

// ─── 6. LoanApplication 구성 ───
const ci = dartData.companyInfo;
const app = {
  meta: { applicationDate: new Date().toISOString().slice(0,10), applicationType: '신규', branch: '', officer: '' },
  borrower: {
    name: corpName,
    representative: ci.ceoNm || '',
    businessNumber: ci.bizrNo || '',
    corporateNumber: ci.jurirNo || '',
    establishedDate: ci.estDt || '',
    industry: '',
    address: ci.adres || '',
  },
  loanTerms: {
    loanType: 'unsold-collateral', amount, durationMonths: duration,
    repaymentMethod: '만기일시상환', rateType: rate ? '고정' : '',
    ratePercent: rate, collateralType: collateralDesc,
    purpose: '중도금대출 대위변제, 미지급 공사비, SPC법인세 등',
    repaymentSource: '분양대금 회수, 담보처분', creditClassification: '정상',
  },
  funding: {
    cashIn: [{ item: '본건대출', amount }],
    cashOut: cashOut.length > 0 ? cashOut : [{ item: '운영자금', amount }],
  },
  collateralSecurity: [
    { no: 1, description: collateralDesc },
    ...(ltvStr ? [{ no: 2, description: `LTV ${ltvStr}% (검토요청 호실 분양가 기준)` }] : []),
    ...(totalUnits ? [{ no: 3, description: `분양현황: 총 ${totalUnits}세대, 분양 ${soldUnits||'-'}세대(${saleRate||'-'}%), 미분양 ${unsoldUnits||'-'}세대` }] : []),
  ],
  loanConditions: {
    general: ['현물 및 현금 배당 금지'],
    precedentConditions: ['제반 금융계약의 적법한 체결', '법무법인의 적법의견서 제출', '담보신탁 1순위 우선수익권 설정 완료', '기타 대주가 합리적으로 요청하는 사항'],
    subsequentConditions: ['인출일 이후 자금사용목적에 따라 사용 후 사용증빙 제출', '분양현황 월별 보고'],
    accelerationEvents: ['차주가 지급기일에 금액을 지급하지 아니한 경우', '차주의 확인 및 보장 사항이 사실과 다른 경우', '차주에 대한 파산, 회생, 청산 절차가 개시된 경우', '담보물건 가치의 현저한 하락 (LTV 70% 초과 시)'],
  },
  interestRate: { baseRate: rate, appliedRate: rate },
  financials: { borrower: financials },
  borrowings,
  typeSpecific: {
    type: 'unsold-collateral',
    data: {
      collateral: {
        location: '서울 영등포구 신길동 (신길AK푸르지오)',
        trustee: '우리자산신탁',
        trustType: '관리형토지신탁',
      },
      units,
      project: {
        name: '신길AK푸르지오',
        location: '서울 영등포구 신길동',
        totalUnits: totalUnits ? parseInt(totalUnits) : 383,
        soldUnits: soldUnits ? parseInt(soldUnits) : 315,
        unsoldUnits: unsoldUnits ? parseInt(unsoldUnits) : 68,
        salesRate: saleRate ? parseFloat(saleRate) : 82.2,
      },
      salesAmount: {
        totalSalesValue,
      },
      sensitivity,
    },
  },
  aiContent: { opinion, riskAnalysis: '' },
  unresolvedItems: [
    ...(!rate ? [{ no: 1, section: '기본조건', item: '대출금리', status: '협의 중' }] : []),
  ],
};

// ─── 7. DOCX 생성 ───
console.log(`\n─── DOCX 생성 ───`);
const docxBuf = await generateDocx(app, { profile: unsoldCollateralProfile });
const outPath = path.join(dir, `에이엠플러스자산개발_${new Date().toISOString().slice(0,10)}_여신승인신청서_초안v2.docx`);
fs.writeFileSync(outPath, docxBuf);
console.log(`✓ 크기: ${(docxBuf.length/1024).toFixed(1)}KB`);
console.log(`✓ 경로: ${outPath}`);
