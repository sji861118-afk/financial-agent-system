import { type NextRequest } from 'next/server';
import { generateDocx, unsoldCollateralProfile, equityPledgeProfile } from '@/lib/loan-engine/index';
import type { LoanApplication, FinancialStatements, StatementLineItem } from '@/lib/loan-engine/types';
import { assembleDealDataset, type DartResultForDocx as V5DartResult } from '@/lib/docx-v5/data-assembler';
import { generateV5Docx } from '@/lib/docx-v5/generator';
import { findCorpCode } from '@/lib/dart-corp-codes';
import { buildFinancialData, fetchBorrowingNotes, fetchShareholders } from '@/lib/dart-api';
import type { FinancialRow as DartFinancialRow } from '@/lib/dart-api';
import type { BorrowingDetail } from '@/lib/loan-engine/types';
import { checkCompleteness, type CheckerInput } from '@/lib/loan-engine/completeness-checker';
import { parseUploadedFiles, mapBorrowingDetails, type ParsedFileData } from '@/lib/uploaded-file-parser';
import type { EquityPledgeData, SyndicateInfo, TrancheInfo } from '@/lib/loan-engine/types';

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

    // 업로드 파일 구조화 파싱 (Excel 차입금, 현금흐름, 충당금, 가치산정 등)
    const parsedFiles = await parseUploadedFiles(extractedTexts);

    const useV5 = formData.get('version') === 'v5' || true; // v5를 기본으로 사용

    let buffer: Buffer | Uint8Array;
    let docName = borrowerName || effectiveName;

    if (useV5) {
      // v5 파이프라인: ParsedFileData + DART → DealDataset → DOCX
      const v5DartResult: V5DartResult = {
        financials: {
          years: dartResult.financials.years,
          balanceSheet: dartResult.financials.balanceSheet.map(r => ({
            account: r.account,
            values: r.values as Record<string, number | string>,
            bold: r.bold,
            depth: (r as any).depth,
          })),
          incomeStatement: dartResult.financials.incomeStatement.map(r => ({
            account: r.account,
            values: r.values as Record<string, number | string>,
            bold: r.bold,
            depth: (r as any).depth,
          })),
        },
        borrowings: dartResult.borrowings,
        shareholders: dartResult.shareholders,
        companyInfo: dartResult.companyInfo,
      };
      const dataset = assembleDealDataset(parsedFiles, v5DartResult, effectiveName.trim(), memo, allText);
      buffer = await generateV5Docx(dataset);
      docName = dataset.deal.borrowerName;
    } else {
      // 기존 loan-engine 파이프라인
      const app = buildLoanApplication(allText, borrowerName, memo, dartResult);
      enrichFromParsedFiles(app, parsedFiles, dartResult);
      const profile = app.loanTerms.loanType === 'equity-pledge' ? equityPledgeProfile : unsoldCollateralProfile;
      buffer = await generateDocx(app, { profile });
      docName = app.borrower.name;
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = encodeURIComponent(`${docName}_${today}_초안.docx`);

    return new Response(new Uint8Array(buffer), {
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
  shareholders: { name: string; stockType: string; shareCount: string; shareRatio: string; relation: string }[];
  companyInfo?: {
    ceoNm: string;
    bizrNo: string;
    jurirNo: string;
    adres: string;
    estDt: string;
    indutyCode: string;
    corpCls: string;
    accMt: string;
  };
}

async function fetchDartFinancials(corpName: string): Promise<DartResultForDocx> {
  const empty: DartResultForDocx = { financials: { years: [], balanceSheet: [], incomeStatement: [] }, borrowings: [], shareholders: [] };
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
      return { financials: { years: [], balanceSheet: [], incomeStatement: [] }, borrowings: [], shareholders: [], companyInfo: dartData.companyInfo };
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
        indent: row.depth ?? 2,
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

    // 주주현황 조회
    let shareholders: DartResultForDocx['shareholders'] = [];
    try {
      shareholders = await fetchShareholders(corp.corpCode, String(currentYear - 1));
    } catch { /* 주주 정보 없어도 계속 */ }

    console.log(`[DART] 재무데이터 조회 성공: ${corpName} (${dartYears.join(', ')}, 주주 ${shareholders.length}명)`);
    return { financials, borrowings, shareholders, companyInfo: dartData.companyInfo };
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

  // 금액 (여러 패턴 시도)
  let amount = 0;
  const amtPatterns = [
    /(?:모집금액|대출금액|한도대출|총\s*대출)[^0-9]*([\d,.]+)\s*억/,
    /(?:대주단|대출)\s*총?\s*([\d,]+)\s*백만원/,
    /\[([\d,]+)\]\s*억원/,  // [300]억원
    /([\d,]+)\s*백만원\s*\(\s*([\d,]+)\s*억/,
  ];
  for (const p of amtPatterns) {
    const m = text.match(p);
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      amount = m[0].includes('백만') ? v : v * 100;
      if (amount > 0) break;
    }
  }

  // 금리 — [TBD] 체크 후 명확한 맥락에서만 추출
  let rate: number | undefined;
  // "대출금리 X.XX%" 형태만 매칭 (뒤에 바로 %가 오는 것만)
  const rateContext = text.match(/(?:대출금리|적용금리|연이율|표면금리)[:\s]+(?!\[TBD\])([\d.]+)\s*%/);
  if (rateContext) {
    const r = parseFloat(rateContext[1]);
    if (r > 1 && r < 15) rate = r; // 1~15% 범위만 대출금리로 인정
  }

  // 기간 ("대출기간" 또는 "만기일시상환 N개월" 맥락에서만, "이자유보 3개월" 등 제외)
  const durMatch = text.match(/(?:대출기간|만기일시상환)[^0-9]*([\d]{2,})\s*개월/);
  const duration = durMatch ? parseInt(durMatch[1]) : 24;

  // 자금용도 파싱
  const fundingItems = parseFundingItems(text);

  // DART 법인정보 우선, 없으면 PDF에서 추출 (포맷팅 적용)
  const ci = dartResult.companyInfo;
  const rep = ci?.ceoNm || extract(text, /대표이사\s*([^\s(,]+)/) || extract(text, /대표[이사자]*[:\s]*([^\n,(]+)/);
  const rawBizNo = ci?.bizrNo || extract(text, /사업자[등록]*번호[:\s]*([\d-]+)/);
  const bizNo = rawBizNo ? fmtBizrNo(rawBizNo) : '';
  const rawCorpNo = ci?.jurirNo || extract(text, /법인등록번호[:\s]*([\d-]+)/);
  const corpNo = rawCorpNo ? fmtJurirNo(rawCorpNo) : undefined;
  const address = ci?.adres || extract(text, /주\s*소[:\s]*([^\n]+서울[^\n]+)/) || extract(text, /서울[^\n,]+구[^\n,]+동[^\n,]*/);
  const rawEstDate = ci?.estDt || '[TBD]';
  const estDate = rawEstDate.length === 8 && /^\d{8}$/.test(rawEstDate)
    ? `${rawEstDate.slice(0,4)}-${rawEstDate.slice(4,6)}-${rawEstDate.slice(6)}` : rawEstDate;

  // LTV
  const ltvStr = extract(text, /LTV\s*([\d.]+)%/);

  // 담보 (IM 텍스트에서 지분담보 여부 판단)
  const isEquityDeal = text.includes('지분담보') || text.includes('근질권') || text.includes('지분평가');
  const collateralDesc = isEquityDeal ? '지분담보(근질권)' : (extract(text, /(?:주요\s*)?채권보전[:\s]*([^\n]{5,50})/) || '미분양 호실 담보 (담보신탁 1순위 우선수익권)');

  // 분양현황
  const totalUnits = extract(text, /총\s*(?:세대|가구)[:\s]*([\d,]+)/);
  const soldUnits = extract(text, /분양\s*(?:세대|가구)[:\s]*([\d,]+)/);
  const unsoldUnits = extract(text, /미분양\s*(?:세대|가구)[:\s]*([\d,]+)/);

  // 검토의견 — 메모에서만 구성 (IM PDF 텍스트 혼입 방지)
  const opinion = memo ? memo : '';

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
      companyType: ci?.corpCls === 'Y' ? '유가증권 상장' : ci?.corpCls === 'K' ? '코스닥 상장' : ci?.corpCls === 'N' ? '비상장' : undefined,
      fiscalMonth: ci?.accMt ? parseInt(ci.accMt) : undefined,
    },
    loanTerms: {
      loanType: isEquityDeal ? 'equity-pledge' : 'unsold-collateral',
      amount,
      durationMonths: duration,
      repaymentMethod: '만기일시상환',
      rateType: rate ? '고정' : 'TBD',
      ratePercent: rate,
      collateralType: collateralDesc,
      purpose: isEquityDeal ? '신규대출 영업자금 (운영자금)' : (extract(text, /자금용도[:\s]*([^\n(]{5,50})/) || '운영자금'),
      repaymentSource: isEquityDeal ? '대출채권 원리금 회수, 차입금 리파이낸싱' : '분양대금 회수, 담보처분',
      creditClassification: '정상',
    },
    funding: {
      cashIn: fundingItems.cashIn.length > 0 ? fundingItems.cashIn : [{ item: '본건대출', amount }],
      cashOut: fundingItems.cashOut.length > 0 ? fundingItems.cashOut : [{ item: '운영자금', amount }],
    },
    collateralSecurity: isEquityDeal ? [
      { no: 1, description: `${name.trim()} 대표이사 연대보증` },
      { no: 2, description: '담보 지분 근질권 설정' },
      { no: 3, description: '근질권 설정 주식의 처분승낙서 및 양도증서 발행' },
      { no: 4, description: '대출이자 3개월치 이자유보계좌 근질권 설정' },
      { no: 5, description: '기타 대주가 합리적으로 요청하는 사항' },
    ] : [
      { no: 1, description: collateralDesc },
      ...(ltvStr ? [{ no: 2, description: `LTV ${ltvStr}%` }] : []),
      ...(totalUnits ? [{ no: 3, description: `분양현황: 총 ${totalUnits}세대, 분양 ${soldUnits || '-'}세대, 미분양 ${unsoldUnits || '-'}세대` }] : []),
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
    typeSpecific: isEquityDeal
      ? { type: 'equity-pledge' as const, data: { pledgedEquities: [] } }
      : { type: 'unsold-collateral' as const, data: {} },
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

// ─── Enrich LoanApplication from Parsed Files ───────

function enrichFromParsedFiles(app: LoanApplication, parsed: ParsedFileData, dartResult: DartResultForDocx) {
  // 1. 차입금: 업로드 Excel이 DART보다 상세하면 교체
  if (parsed.borrowingDetails.length > 0) {
    const mappedBorrowings = mapBorrowingDetails(parsed.borrowingDetails);
    if (mappedBorrowings.length > 0) {
      // DART 차입금보다 업로드 데이터가 상세하면 교체
      const dartCount = app.borrowings.reduce((s, b) => s + (b.topLenders?.length || 0), 0);
      const parsedCount = mappedBorrowings.reduce((s, b) => s + (b.topLenders?.length || 0), 0);
      if (parsedCount > dartCount) {
        app.borrowings = mappedBorrowings;
      }
    }
  }

  // 2. 신디케이트 구조 (Tr.A/B/C)
  if (parsed.syndicateInfo) {
    const si = parsed.syndicateInfo;
    app.syndicate = {
      totalAmount: si.totalAmount,
      tranches: si.tranches.map(t => ({
        name: t.name,
        amount: t.amount,
        rate: t.rate,
        participants: [{ name: t.lender, amount: t.amount, role: '대주' }],
        conditions: t.fee ? [`수수료 ${t.fee}백만원`] : undefined,
      })),
    };
    // 총 대출금액 업데이트
    if (si.totalAmount > 0) app.loanTerms.amount = si.totalAmount;
  }

  // 3. 딜 조건 보완
  if (parsed.dealTerms.amount && !app.loanTerms.amount) {
    app.loanTerms.amount = parsed.dealTerms.amount;
  }
  if (parsed.dealTerms.purpose) {
    app.loanTerms.purpose = parsed.dealTerms.purpose;
  }
  if (parsed.dealTerms.repaymentSource) {
    app.loanTerms.repaymentSource = parsed.dealTerms.repaymentSource;
  }

  // 4. Equity Pledge 데이터 (가치산정, 현금흐름, 충당금, 보증인)
  const isEquityPledge = !app.loanTerms.collateralType?.includes('미분양');
  if (isEquityPledge) {
    const epData: EquityPledgeData = {
      pledgedEquities: [],
      ...(app.typeSpecific.type === 'equity-pledge' ? app.typeSpecific.data : {}),
    };

    // 가치산정 데이터
    if (parsed.valuationData) {
      const v = parsed.valuationData;

      epData.collateralValue = {
        valuationBasis: `${v.method} (${v.appraiser})`,
        valuationAmount: v.equityValue,
        ltv: app.loanTerms.amount > 0 ? Math.round(app.loanTerms.amount / v.equityValue * 1000) / 10 : 0,
        note: `기준일: ${v.baseDate}`,
      };

      // samil_valuation 구조 (equity-pledge 플러그인이 렌더링)
      const kc = v.keComponents;
      (epData as any).samil_valuation = {
        appraiser: v.appraiser,
        method: v.method,
        discountRate: `${v.ke}%`,
        perpetualGrowthRate: `${v.perpetualGrowthRate}%`,
        projectionPeriod: "'26년~'30년 (5년)",
        valuationSummary: {
          items: [
            { label: 'PV of FCFE', value: v.tmFcfe.reduce((s, f) => s + f.pvFcfe, 0).toLocaleString() + '백만원' },
            { label: 'Terminal Value', value: '—' },
            { label: '영업가치', value: v.operatingValue.toLocaleString() + '백만원' },
            { label: '(+) 유미캐피탈대부 지분가치', value: v.youmeEquityValue.toLocaleString() + '백만원' },
            { label: '(+) 기타 투자자산', value: v.otherNonOperating.toLocaleString() + '백만원' },
            { label: '비영업가치 합계', value: v.nonOperatingValue.toLocaleString() + '백만원' },
            { label: 'Equity Value (100%)', value: v.equityValue.toLocaleString() + '백만원' },
          ],
          note: `약 ${Math.round(v.equityValue / 100).toLocaleString()}억원`,
        },
        discountRateBreakdown: {
          items: [
            { label: 'Ke (자기자본비용)', value: `${v.ke}%` },
            { label: 'RF (무위험이자율)', value: `${kc.rf}%` },
            { label: 'MRP (시장위험프리미엄)', value: `${kc.mrp.toFixed(2)}%` },
            { label: 'Beta_L (Levered Beta)', value: kc.betaL.toFixed(3) },
            { label: 'Beta_U (Unlevered Beta)', value: kc.betaU.toFixed(3) },
            { label: '동종기업 평균 D/E', value: `${kc.deRatio.toFixed(2)}%` },
            { label: '한계법인세율', value: `${kc.taxRate}%` },
            { label: 'Size Premium', value: `${kc.sizePremium}%` },
            { label: '영구성장률 (g)', value: `${v.perpetualGrowthRate}%` },
          ],
          note: `Ke = RF + MRP × Beta_L + SP = ${kc.rf}% + ${kc.mrp.toFixed(2)}% × ${kc.betaL.toFixed(3)} + ${kc.sizePremium}% = ${v.ke}%`,
        },
        techmateDCF: v.tmFcfe.length > 0 ? {
          label: 'FCFE 추정 (테크메이트코리아대부)',
          years: v.tmFcfe.map(f => f.year),
          items: [
            { label: '영업수익', bold: false, values: v.tmFcfe.map(f => f.revenue) },
            { label: '영업비용', bold: false, values: v.tmFcfe.map(f => f.opCost) },
            { label: '영업이익', bold: true, values: v.tmFcfe.map(f => f.opIncome) },
            { label: '당기순이익', bold: true, values: v.tmFcfe.map(f => f.netIncome) },
            { label: 'FCFE', bold: true, values: v.tmFcfe.map(f => f.fcfe) },
            { label: 'PV of FCFE', bold: false, values: v.tmFcfe.map(f => f.pvFcfe) },
          ],
        } : undefined,
        youmeDCF: v.ymFcfe.length > 0 ? {
          label: 'FCFE 추정 (유미캐피탈대부)',
          years: v.ymFcfe.map(f => f.year),
          items: [
            { label: '영업수익', bold: false, values: v.ymFcfe.map(f => f.revenue) },
            { label: '영업이익', bold: true, values: v.ymFcfe.map(f => f.opIncome) },
            { label: '당기순이익', bold: true, values: v.ymFcfe.map(f => f.netIncome) },
            { label: 'FCFE', bold: true, values: v.ymFcfe.map(f => f.fcfe) },
            { label: 'PV of FCFE', bold: false, values: v.ymFcfe.map(f => f.pvFcfe) },
          ],
        } : undefined,
        sensitivityAnalysis: v.tmSensitivity.length > 0 ? {
          label: '테크메이트 지분가치 Sensitivity (단위: 백만원)',
          cases: v.tmSensitivity.map(s => ({ ke: s.keLabel, ...s.values })),
          note: `Ke 및 영구성장률 변동에 따른 지분가치 범위`,
        } : undefined,
        peerGroup: v.peerGroup.map(p => ({
          company: p.company,
          country: p.country,
          deRatio: p.deRatio,
          taxRate: p.taxRate,
          beta5yr: p.beta5yr,
          unleveredBeta: p.unleveredBeta,
        })),
      };
    }

    // 현금흐름
    if (parsed.cashFlows.length > 0) {
      epData.cashFlow = {
        entities: parsed.cashFlows,
      };
    }

    // 충당금 설정률
    if (parsed.provisionRates.length > 0) {
      (epData as any).provisioningRates = {
        techmate: parsed.provisionRates.find(p => /테크메이트/.test(p.entityName)) ? {
          effectiveFrom: parsed.provisionRates.find(p => /테크메이트/.test(p.entityName))!.effectiveFrom || '',
          rates: parsed.provisionRates.find(p => /테크메이트/.test(p.entityName))!.rates.map(r => ({
            delinquencyBracket: r.bracket,
            generalRate: r.generalRate,
            realEstateRate: r.realEstateRate || '-',
            accruedInterestRate: r.accruedRate || '-',
          })),
        } : undefined,
        youme: parsed.provisionRates.find(p => /유미/.test(p.entityName)) ? {
          effectiveFrom: parsed.provisionRates.find(p => /유미/.test(p.entityName))!.effectiveFrom || '',
          rates: parsed.provisionRates.find(p => /유미/.test(p.entityName))!.rates.map(r => ({
            delinquencyBracket: r.bracket,
            generalRate: r.generalRate,
            accruedInterestRate: r.accruedRate || '-',
          })),
        } : undefined,
      };
    }

    // 보증인 소득 (이미지 PDF는 파싱 불가 → 메모에서 추출 시도)
    if (parsed.guarantorIncome) {
      const gi = parsed.guarantorIncome;
      epData.guarantorIncome = {
        name: gi.name,
        items: [],
      };
      (epData as any).guarantorIncome.incomeByYear = gi.incomeByYear;
    }

    app.typeSpecific = { type: 'equity-pledge', data: epData };
  }

  // 5. 주주구성 (DART)
  if (dartResult.shareholders.length > 0 && !app.borrower.shareholders?.length) {
    app.borrower.shareholders = dartResult.shareholders.map(s => ({
      name: s.name,
      stockType: s.stockType,
      shares: parseInt(String(s.shareCount).replace(/,/g, '')) || 0,
      ownershipPct: parseFloat(s.shareRatio) || 0,
      note: s.relation !== '-' ? s.relation : '',
    }));
  }

  // 6. 영업현황 보강
  if (parsed.operatingStatus.length > 0) {
    const borrowerOps = parsed.operatingStatus.find(o => o.entityName.includes(app.borrower.name) || o.entityName.includes('테크메이트'));
    if (borrowerOps) {
      app.borrower.operatingStatus = borrowerOps.items;
    }
  }
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

/** "1234567890" → "123-45-67890" */
function fmtBizrNo(s: string): string {
  const d = s.replace(/[^0-9]/g, '');
  if (d.length !== 10) return s;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** "1234561234567" → "123456-1234567" */
function fmtJurirNo(s: string): string {
  const d = s.replace(/[^0-9]/g, '');
  if (d.length !== 13) return s;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}
