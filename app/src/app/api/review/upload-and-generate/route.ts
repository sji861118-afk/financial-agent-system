import { type NextRequest } from 'next/server';
import { generateDocx, unsoldCollateralProfile, equityPledgeProfile } from '@/lib/loan-engine/index';
import type { LoanApplication, FinancialStatements, StatementLineItem } from '@/lib/loan-engine/types';
import { findCorpCode } from '@/lib/dart-corp-codes';
import { buildFinancialData, fetchBorrowingNotes } from '@/lib/dart-api';
import type { FinancialRow as DartFinancialRow } from '@/lib/dart-api';
import type { BorrowingDetail } from '@/lib/loan-engine/types';
import { checkCompleteness, type CheckerInput } from '@/lib/loan-engine/completeness-checker';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const borrowerName = formData.get('borrowerName') as string || '';
    const memo = formData.get('memo') as string || '';
    const mode = formData.get('mode') as string || 'generate'; // 'check' | 'generate'

    if (files.length === 0) {
      return Response.json({ error: '파일을 1개 이상 업로드해주세요' }, { status: 400 });
    }

    // 파일별 텍스트 추출
    const extractedTexts: { name: string; text: string }[] = [];

    for (const file of files) {
      if (file.name.match(/\.(xlsx|xls)$/i)) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const ExcelJS = (await import('exceljs')).default;
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(buffer);
          const rows: string[][] = [];
          wb.eachSheet((sheet) => {
            sheet.eachRow((row) => {
              const vals = (row.values as any[]).slice(1).map(v =>
                v?.result !== undefined ? String(v.result) : String(v ?? '')
              );
              rows.push(vals);
            });
          });
          extractedTexts.push({ name: file.name, text: rows.map(r => r.join('\t')).join('\n') });
        } catch {
          extractedTexts.push({ name: file.name, text: '' });
        }
      } else if (file.name.match(/\.pdf$/i)) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const pdfParse = (await import('pdf-parse')).default;
          const result = await pdfParse(buffer);
          extractedTexts.push({ name: file.name, text: cleanText(result.text).slice(0, 80000) });
        } catch {
          extractedTexts.push({ name: file.name, text: '' });
        }
      }
    }

    const allText = extractedTexts.map(e => `[${e.name}]\n${e.text}`).join('\n\n===\n\n');

    // DART에서 재무 데이터 조회 (차주명 기반)
    const effectiveName = borrowerName
      || extract(allText, /차주[:\s]*([^\n,]+)/)
      || extract(allText, /위탁자[:\s겸수익]*([^\n(]+)/)
      || '';
    const dartResult = await fetchDartFinancials(effectiveName.trim());

    // mode=check: 완성도 리포트만 반환
    if (mode === 'check') {
      const checkerInput: CheckerInput = {
        extractedText: allText,
        fileNames: files.map(f => f.name),
        dart: {
          hasCompanyInfo: !!dartResult.companyInfo?.ceoNm,
          hasFinancials: dartResult.financials.years.length > 0,
          hasBorrowingNotes: dartResult.borrowings.length > 0,
          years: dartResult.financials.years,
        },
      };
      const report = checkCompleteness(checkerInput);
      return Response.json({ success: true, report });
    }

    // 룰기반 파싱으로 LoanApplication 구성 (재무데이터는 DART에서)
    const app = buildLoanApplication(allText, borrowerName, memo, dartResult);

    // 프로필 결정 (미분양담보 vs 지분담보)
    const isUnsold = allText.includes('미분양') || allText.includes('분양가') || allText.includes('분양률');
    const profile = isUnsold ? unsoldCollateralProfile : equityPledgeProfile;

    const buffer = await generateDocx(app, { profile });

    const today = new Date().toISOString().slice(0, 10);
    const filename = encodeURIComponent(`${app.borrower.name}_${today}_초안.docx`);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error('[upload-and-generate] Error:', error);
    return Response.json(
      { error: '초안 생성 실패', detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}

// ─── DART 재무 데이터 조회 ─────────────────────────────

interface DartResultForDocx {
  financials: FinancialStatements;
  borrowings: BorrowingDetail[];
  companyInfo?: {
    ceoNm: string;
    bizrNo: string;
    jurirNo: string;
    adres: string;
    estDt: string;
    indutyCode: string;
  };
}

async function fetchDartFinancials(corpName: string): Promise<DartResultForDocx> {
  const empty: DartResultForDocx = { financials: { years: [], balanceSheet: [], incomeStatement: [] }, borrowings: [] };
  if (!corpName) return empty;

  try {
    const corp = findCorpCode(corpName);
    if (!corp) {
      console.log(`[DART] 기업코드 미발견: ${corpName}`);
      return empty;
    }

    // 최근 3개년 조회
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 3 }, (_, i) => String(currentYear - 3 + i));
    const dartData = await buildFinancialData(corp.corpCode, years);

    if (!dartData.hasData) {
      console.log(`[DART] 재무데이터 없음: ${corpName} (${dartData.noDataReason || 'unknown'})`);
      return { financials: { years: [], balanceSheet: [], incomeStatement: [] }, borrowings: [], companyInfo: dartData.companyInfo };
    }

    // DART FinancialRow[] → loan-engine StatementLineItem[] 변환
    const bsSource = dartData.hasOfs ? dartData.bsItems : dartData.bsItemsCfs;
    const isSource = dartData.hasOfs ? dartData.isItems : dartData.isItemsCfs;
    const dartYears = dartData.years;

    /** DART 값은 "474,588" 형식 string → number 변환 필수 (obligor 분석 코멘트에서 typeof number 체크) */
    const toNum = (v: string | number | undefined): number | string => {
      if (v === undefined || v === '' || v === '-') return '';
      if (typeof v === 'number') return v;
      const cleaned = String(v).replace(/,/g, '');
      const n = parseFloat(cleaned);
      return isNaN(n) ? v : n;
    };

    const convertRows = (rows: DartFinancialRow[]): StatementLineItem[] =>
      rows.map(row => ({
        account: row.account,
        values: Object.fromEntries(dartYears.map(y => [y, toNum(row[y])])),
        bold: row.depth === 0,
        depth: row.depth,
      }));

    const financials: FinancialStatements = {
      years: dartYears,
      balanceSheet: convertRows(bsSource),
      incomeStatement: convertRows(isSource),
    };

    // 차입금 주석 조회
    const borrowings: BorrowingDetail[] = [];
    try {
      const bNotes = await fetchBorrowingNotes(corp.corpCode, years);
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
          // BS에서 차입금 합계 추출
          const lastYear = dartYears[dartYears.length - 1];
          const shortBorrow = findNumVal(bsSource, '단기차입금', lastYear);
          const longBorrow = findNumVal(bsSource, '장기차입금', lastYear);
          const currentLong = findNumVal(bsSource, '유동성장기차입금', lastYear);

          const summary = [];
          if (shortBorrow) summary.push({ category: '단기차입금', count: 0, balance: shortBorrow, weightedAvgRate: '-', maturityRange: '1년 이내' });
          if (currentLong) summary.push({ category: '유동성장기차입금', count: 0, balance: currentLong, weightedAvgRate: '-', maturityRange: '1년 이내' });
          if (longBorrow) summary.push({ category: '장기차입금', count: 0, balance: longBorrow, weightedAvgRate: '-', maturityRange: '1년 초과' });

          borrowings.push({
            entityName: corpName,
            summary,
            topLenders: topLenders.slice(0, 10),
          });
        }
      }
    } catch { /* 차입금 주석 없어도 계속 진행 */ }

    console.log(`[DART] 재무데이터 조회 성공: ${corpName} (${dartYears.join(', ')})`);
    return { financials, borrowings, companyInfo: dartData.companyInfo };
  } catch (err: any) {
    console.error(`[DART] 재무데이터 조회 실패: ${corpName}`, err?.message);
    return empty;
  }
}

/** BS/IS에서 계정명으로 숫자값 조회 (string→number 변환 후) */
function findNumVal(rows: DartFinancialRow[], account: string, year: string): number | null {
  for (const row of rows) {
    if (row.account.includes(account)) {
      const v = row[year];
      if (v === undefined || v === '' || v === '-') continue;
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

// ─── 룰기반 텍스트 파싱 → LoanApplication ─────────────

function buildLoanApplication(text: string, borrowerName: string, memo: string, dartResult: DartResultForDocx): LoanApplication {
  const name = borrowerName
    || extract(text, /차주[:\s]*([^\n,]+)/)
    || extract(text, /위탁자[:\s겸수익]*([^\n(]+)/)
    || '[TBD]';

  // 금액 (억원 단위 → 백만원)
  const amountMatch = text.match(/(?:모집금액|대출금액|한도대출)[^0-9]*([\d,.]+)\s*억/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) * 100 : 0;

  // 금리
  const rateStr = extract(text, /(?:금리|이자율|수익률)[^0-9]*([\d.]+)\s*%/);
  const rate = rateStr ? parseFloat(rateStr) : undefined;

  // 기간
  const durStr = extract(text, /(\d+)\s*개월/);
  const duration = durStr ? parseInt(durStr) : 12;

  // 자금용도 파싱
  const fundingItems = parseFundingItems(text);

  // DART 법인정보 우선, 없으면 PDF에서 추출
  const ci = dartResult.companyInfo;
  const rep = ci?.ceoNm || extract(text, /대표이사\s*([^\s(,]+)/) || extract(text, /대표[이사자]*[:\s]*([^\n,(]+)/);
  const bizNo = ci?.bizrNo || extract(text, /사업자[등록]*번호[:\s]*([\d-]+)/);
  const corpNo = ci?.jurirNo || extract(text, /법인등록번호[:\s]*([\d-]+)/);
  const address = ci?.adres || extract(text, /주\s*소[:\s]*([^\n]+서울[^\n]+)/) || extract(text, /서울[^\n,]+구[^\n,]+동[^\n,]*/);
  const estDate = ci?.estDt || '[TBD]';

  // LTV
  const ltvStr = extract(text, /LTV\s*([\d.]+)%/);

  // 담보
  const collateralDesc = extract(text, /(?:주요\s*)?채권보전[:\s]*([^\n]+)/) || '미분양 호실 담보 (담보신탁 1순위 우선수익권)';

  // 분양현황
  const totalUnits = extract(text, /총\s*(?:세대|가구)[:\s]*([\d,]+)/);
  const soldUnits = extract(text, /분양\s*(?:세대|가구)[:\s]*([\d,]+)/);
  const unsoldUnits = extract(text, /미분양\s*(?:세대|가구)[:\s]*([\d,]+)/);

  // 검토의견 장점/단점
  const opinion = buildOpinion(text, memo);

  // 재무 데이터: DART 우선
  const financials = dartResult.financials;
  const hasDartFinancials = financials.years.length > 0;

  return {
    meta: {
      applicationDate: new Date().toISOString().slice(0, 10),
      applicationType: '신규',
      branch: extract(text, /(기업금융\d+본부)/) || '',
      officer: '',
    },
    borrower: {
      name: name.trim(),
      representative: rep?.trim() || '',
      businessNumber: bizNo || '',
      corporateNumber: corpNo || undefined,
      establishedDate: estDate !== '[TBD]' ? estDate : '',
      industry: extract(text, /업종[:\s]*([^\n,]+)/) || '',
      address: address?.trim() || '',
    },
    loanTerms: {
      loanType: 'unsold-collateral',
      amount,
      durationMonths: duration,
      repaymentMethod: '만기일시상환',
      rateType: rate ? '고정' : 'TBD',
      ratePercent: rate,
      collateralType: collateralDesc,
      purpose: extract(text, /자금용도[:\s]*([^\n]+)/) || memo || '중도금대출 대위변제, 미지급 공사비, SPC법인세 등',
      repaymentSource: '분양대금 회수, 담보처분',
      creditClassification: '정상',
    },
    funding: {
      cashIn: fundingItems.cashIn.length > 0 ? fundingItems.cashIn : [{ item: '본건대출', amount }],
      cashOut: fundingItems.cashOut.length > 0 ? fundingItems.cashOut : [{ item: '운영자금', amount }],
    },
    collateralSecurity: [
      { no: 1, description: collateralDesc },
      ...(ltvStr ? [{ no: 2, description: `LTV ${ltvStr}% (검토요청 호실 분양가 기준)` }] : []),
      ...(totalUnits ? [{ no: 3, description: `분양현황: 총 ${totalUnits}세대, 분양 ${soldUnits || '-'}세대(${extract(text, /분양률\s*([\d.]+)%/) || '-'}%), 미분양 ${unsoldUnits || '-'}세대` }] : []),
    ],
    loanConditions: {
      general: ['현물 및 현금 배당 금지'],
      precedentConditions: [
        '제반 금융계약의 적법한 체결',
        '법무법인의 적법의견서 제출',
        '담보신탁 1순위 우선수익권 설정 완료',
        '기타 대주가 합리적으로 요청하는 사항',
      ],
      subsequentConditions: [
        '인출일 이후 자금사용목적에 따라 사용 후 사용증빙 제출',
        '분양현황 월별 보고',
      ],
      accelerationEvents: [
        '차주가 지급기일에 금액을 지급하지 아니한 경우',
        '차주의 확인 및 보장 사항이 사실과 다른 경우',
        '차주에 대한 파산, 회생, 청산 절차가 개시된 경우',
        '담보물건 가치의 현저한 하락 (LTV 70% 초과 시)',
      ],
    },
    interestRate: {
      baseRate: rate,
      appliedRate: rate,
    },
    financials: {
      borrower: financials,
    },
    borrowings: dartResult.borrowings,
    typeSpecific: {
      type: 'unsold-collateral',
      data: {},
    },
    aiContent: {
      opinion,
      riskAnalysis: memo ? `참고사항: ${memo}` : '',
    },
    unresolvedItems: [
      ...buildUnresolved({ rate, amount }),
      ...(!hasDartFinancials ? [{ no: 99, section: '재무제표', item: '재무데이터', status: '[TBD: DART 조회 실패 또는 데이터 없음]' }] : []),
    ],
  };
}

// ─── Helpers ─────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extract(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m ? m[1].trim() : null;
}

function parseFundingItems(text: string) {
  const cashIn: { item: string; amount: number }[] = [];
  const cashOut: { item: string; amount: number }[] = [];

  // 자금용도 테이블 구간 분리 (항목/금액 헤더 ~ 합계/주요 채권보전)
  const tableMatch = text.match(/항목\s*금액[^\n]*\n([\s\S]*?)(?=합계|주요\s*채권보전)/);
  const tableText = tableMatch ? tableMatch[1] : '';

  if (tableText) {
    // 테이블 내에서 항목별 금액 추출 (항목명 뒤에 바로 숫자)
    const rows = tableText.split('\n').filter(l => l.trim());
    for (const row of rows) {
      const m = row.match(/(.+?)\s*([\d,.]+)\s*$/);
      if (m) {
        const label = m[1].trim();
        const val = parseFloat(m[2].replace(/,/g, ''));
        if (val > 0 && val < 10000) {
          cashOut.push({ item: label, amount: val * 100 }); // 억→백만원
        }
      }
    }
  }

  // 모집금액을 cashIn으로
  const totalMatch = text.match(/(?:모집금액|한도대출)[^\d]*([\d,.]+)\s*억/);
  if (totalMatch) {
    cashIn.push({ item: '본건대출', amount: parseFloat(totalMatch[1].replace(/,/g, '')) * 100 });
  }

  return { cashIn, cashOut };
}

function buildOpinion(text: string, memo: string): string {
  const parts: string[] = [];

  // 대출개요
  const overview = extract(text, /대출개요\s*([\s\S]*?)(?=장점|$)/);
  if (overview) parts.push(`[대출개요]\n${overview.slice(0, 500)}`);

  // 장점
  const pros = extract(text, /장점\s*([\s\S]*?)(?=단점|$)/);
  if (pros) parts.push(`[장점]\n${pros.slice(0, 500)}`);

  // 단점
  const cons = extract(text, /단점\s*([\s\S]*?)(?=영업점|$)/);
  if (cons) parts.push(`[단점]\n${cons.slice(0, 500)}`);

  if (memo) parts.push(`[참고]\n${memo}`);

  return parts.join('\n\n') || memo || '';
}

function buildUnresolved(data: { rate?: number; amount: number }) {
  const items: { no: number; section: string; item: string; status: string }[] = [];
  let no = 1;
  if (!data.rate) items.push({ no: no++, section: '기본조건', item: '대출금리', status: '협의 중' });
  if (!data.amount) items.push({ no: no++, section: '기본조건', item: '대출금액', status: '미확정' });
  return items;
}
