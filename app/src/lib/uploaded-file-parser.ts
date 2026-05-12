// app/src/lib/uploaded-file-parser.ts
// 업로드 파일(Excel/PDF)에서 구조화된 데이터 추출
import type {
  BorrowingDetail, CashFlowEntity, CashFlowLineItem,
} from '@/lib/loan-engine/types';

// ─── Types ───

export interface ParsedFileData {
  borrowingDetails: BorrowingDetailParsed[];
  cashFlows: CashFlowEntity[];
  provisionRates: ProvisionRateEntity[];
  guarantorIncome: GuarantorIncomeData | null;
  valuationData: ValuationData | null;
  operatingStatus: OperatingStatusParsed[];
  syndicateInfo: SyndicateInfoParsed | null;
  dealTerms: DealTermsParsed;
}

export interface BorrowingDetailParsed {
  entityName: string;
  category: string;
  lender: string;
  balance: number;
  rate: string;
  maturity: string;
}

export interface ProvisionRateEntity {
  entityName: string;
  effectiveFrom: string;
  rates: { bracket: string; generalRate: string; realEstateRate?: string; accruedRate?: string }[];
}

export interface GuarantorIncomeData {
  name: string;
  incomeByYear: { year: string; laborIncome: number; interestIncome: number; dividendIncome: number; businessIncome: number; totalIncome: number; taxAmount: number }[];
}

export interface ValuationData {
  appraiser: string;
  method: string;
  baseDate: string;
  equityValue: number;
  ke: number;
  keComponents: { rf: number; mrp: number; betaL: number; betaU: number; deRatio: number; taxRate: number; sizePremium: number };
  perpetualGrowthRate: number;
  operatingValue: number;
  nonOperatingValue: number;
  youmeEquityValue: number;
  otherNonOperating: number;
  // FCFE
  tmFcfe: { year: string; revenue: number; opCost: number; opIncome: number; netIncome: number; fcfe: number; pvFcfe: number }[];
  ymFcfe: { year: string; revenue: number; opIncome: number; netIncome: number; fcfe: number; pvFcfe: number }[];
  // 민감도 (지분가치)
  tmSensitivity: { keLabel: string; values: Record<string, number> }[];
  ymSensitivity: { keLabel: string; values: Record<string, number> }[];
  // Peer
  peerGroup: { company: string; country: string; deRatio: string; taxRate: string; beta5yr: string; unleveredBeta: string }[];
}

export interface OperatingStatusParsed {
  entityName: string;
  items: { label: string; value: string; note?: string }[];
}

export interface SyndicateInfoParsed {
  totalAmount: number;
  tranches: { name: string; lender: string; amount: number; rate: number; fee?: number; allInCost?: number }[];
}

export interface DealTermsParsed {
  borrowerName?: string;
  amount?: number;
  rate?: number;
  duration?: number;
  purpose?: string;
  repaymentSource?: string;
  collateralType?: string;
  ltv?: string;
  pledgeDescription?: string;
}

// ─── Main Parser ───

export async function parseUploadedFiles(
  files: { name: string; text: string; buffer?: Buffer }[],
): Promise<ParsedFileData> {
  const result: ParsedFileData = {
    borrowingDetails: [],
    cashFlows: [],
    provisionRates: [],
    guarantorIncome: null,
    valuationData: null,
    operatingStatus: [],
    syndicateInfo: null,
    dealTerms: {},
  };

  // Excel 파일은 ExcelJS로 구조화 파싱 (텍스트 변환 대신 직접 읽기)
  for (const file of files) {
    const name = file.name.toLowerCase();
    const text = file.text;

    // 차입금잔액 Excel (tab-separated text)
    if (name.includes('차입금') || name.includes('자입')) {
      result.borrowingDetails.push(...parseBorrowingText(text, file.name));
    }

    // 영업현금흐름 Excel
    if (name.includes('현금흐름') || name.includes('영업현금')) {
      result.cashFlows.push(...parseCashFlowText(text, file.name));
    }

    // 대손충당금 설정현황 Excel
    if (name.includes('대손충당금') || name.includes('충당금')) {
      result.provisionRates.push(...parseProvisionText(text));
    }

    // 영업현황 Excel
    if (name.includes('영업현황') && !name.includes('현금흐름')) {
      const ops = parseOperatingText(text, file.name);
      if (ops) result.operatingStatus.push(ops);
    }

    // 가치산정 Excel (핵심: 시트별 데이터)
    if (name.includes('가치산정') && name.includes('.xlsx')) {
      const val = parseValuationText(text, file.name);
      if (val) result.valuationData = val;
    }

    // IM PDF
    if (name.includes('im') || name.includes('투자설명') || name.includes('지분담보대출')) {
      Object.assign(result.dealTerms, parseDealTermsFromIM(text));
    }

    // 소득금액증명원 PDF (이미지 PDF는 텍스트 없음 — skip)
    if ((name.includes('소득금액') || name.includes('소득') && name.includes('증명')) && text.length > 50) {
      const income = parseGuarantorIncomeText(text, file.name);
      if (income) {
        if (!result.guarantorIncome) result.guarantorIncome = income;
        else result.guarantorIncome.incomeByYear.push(...income.incomeByYear);
      }
    }
  }

  return result;
}

// ─── Excel (tab-separated) Parsers ───

function parseBorrowingText(text: string, fileName: string): BorrowingDetailParsed[] {
  const results: BorrowingDetailParsed[] = [];
  const entityName = extractEntityFromFileName(fileName);
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length < 3) continue;
    if (cols.some(c => /차입처|금융기관|^구분$|^No$|대출유형/i.test(c))) continue;
    if (/^합계|^소계|^총계/.test(cols[0])) continue;
    if (!cols[0]) continue;

    let balance = 0;
    let rate = '-';
    let maturity = '-';
    const lender = cols[0];

    for (const col of cols) {
      const cleaned = col.replace(/,/g, '');
      if (/^-?[\d.]+$/.test(cleaned) && balance === 0) {
        const val = parseFloat(cleaned);
        if (val > 50) balance = val;
      }
      if (/[\d.]+%/.test(col) && rate === '-') rate = col;
      if (/20\d{2}[.\-/]?\d{1,2}/.test(col) && maturity === '-') maturity = col;
    }

    const category = classifyLender(lender);
    if (balance > 0) {
      results.push({ entityName, category, lender, balance, rate, maturity });
    }
  }

  return results;
}

function parseCashFlowText(text: string, fileName: string): CashFlowEntity[] {
  const entities: CashFlowEntity[] = [];
  const sections = text.split(/(?=테크메이트|유미캐피탈)/i);

  for (const section of sections) {
    const lines = section.split('\n').filter(l => l.trim());
    if (lines.length < 3) continue;

    let entityName = extractEntityFromFileName(fileName);
    const firstLine = lines[0];
    if (/테크메이트/.test(firstLine)) entityName = '테크메이트코리아대부(주)';
    else if (/유미캐피탈/.test(firstLine)) entityName = '유미캐피탈대부(주)';

    const quarters: string[] = [];
    const items: CashFlowLineItem[] = [];

    for (const line of lines) {
      const cols = line.split('\t').map(c => c.trim());

      // 분기 헤더 감지
      if (cols.some(c => /1월|Q1|1분기|1~3|4~6|7~9|10~12/.test(c)) && quarters.length === 0) {
        for (const c of cols) {
          if (c && !/항목|구분|^$/.test(c)) quarters.push(c);
        }
        continue;
      }

      // 데이터행
      if (cols.length >= 2 && cols[0] && !/^$|항목|구분/.test(cols[0])) {
        const label = cols[0];
        const values = cols.slice(1).map(v => {
          const n = parseFloat(v.replace(/,/g, ''));
          return isNaN(n) ? (v || 0) : n;
        });
        if (values.some(v => typeof v === 'number' && v !== 0)) {
          items.push({
            label,
            values,
            bold: /합계|소계|기말|기초|순현금/.test(label),
            indent: /회수|조달|상환|집행|판관비|이자|기타/.test(label) ? 1 : 0,
          });
        }
      }
    }

    if (items.length > 0) {
      entities.push({ name: entityName, source: '차주사 제시자료', period: 'FY25', quarters, items });
    }
  }

  return entities;
}

function parseProvisionText(text: string): ProvisionRateEntity[] {
  const entities: ProvisionRateEntity[] = [];
  const lines = text.split('\n').filter(l => l.trim());

  // 시트 구조: "1. 테크메이트..." 와 "2. 유미캐피탈..." 이 같은 행에 있을 수 있음
  // cols[0]~cols[2]: 테크메이트, cols[3]~: 유미캐피탈
  let tmRates: ProvisionRateEntity['rates'] = [];
  let ymRates: ProvisionRateEntity['rates'] = [];
  let tmFrom = '';
  let ymFrom = '';

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());

    // 엔티티 헤더
    if (/테크메이트/.test(cols[0])) tmFrom = 'テクメイト';
    if (/유미캐피탈/.test(cols[0]) || /유미캐피탈/.test(cols[3] || '')) ymFrom = '유미';

    // 기간 감지
    if (/20\d{2}\.\d{1,2}/.test(cols[0]) || /20\d{2}\.\s*\d{1,2}/.test(cols[0])) tmFrom = cols[0];
    if (cols[3] && /20\d{2}/.test(cols[3])) ymFrom = cols[3] || cols[4] || '';

    // 설정률 데이터행 (정상, 1~10, 11~30, ...)
    if (/정상|^\d+~\d+$|이상|무연체|신복위|개회/.test(cols[0])) {
      const bracket = cols[0];
      const genRate = cols[1] || '-';
      tmRates.push({ bracket, generalRate: formatPct(genRate) });

      // 유미캐피탈 (오른쪽 컬럼)
      if (cols[3] && /정상|^\d+~\d+$|이상|무연체/.test(cols[3])) {
        ymRates.push({ bracket: cols[3], generalRate: formatPct(cols[4] || '-') });
      }
    }

    // 부동산/미수이자 설정률 (별도 섹션)
    if (/부동산/.test(cols[0]) || /미수이자/.test(cols[0])) {
      // 이후 행은 별도 카테고리
    }
  }

  if (tmRates.length > 0) {
    entities.push({ entityName: '테크메이트코리아대부(주)', effectiveFrom: tmFrom, rates: tmRates });
  }
  if (ymRates.length > 0) {
    entities.push({ entityName: '유미캐피탈대부(주)', effectiveFrom: ymFrom, rates: ymRates });
  }

  return entities;
}

function parseOperatingText(text: string, fileName: string): OperatingStatusParsed | null {
  const entityName = extractEntityFromFileName(fileName);
  const lines = text.split('\n').filter(l => l.trim());
  const items: { label: string; value: string; note?: string }[] = [];

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length >= 2 && cols[0] && cols[1]) {
      if (/항목|구분/.test(cols[0]) && /수치|금액|값/.test(cols[1])) continue;
      items.push({ label: cols[0], value: cols[1], note: cols[2] || undefined });
    }
  }

  return items.length > 0 ? { entityName, items } : null;
}

function parseValuationText(text: string, _fileName: string): ValuationData | null {
  const lines = text.split('\n');

  // p13_할인율 시트 데이터 추출
  let ke = 0, rf = 0, mrp = 0, betaL = 0, betaU = 0, deRatio = 0, taxRate = 0, sp = 0, g = 0;
  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());
    if (cols[0] === 'Ke') ke = parseFloat(cols[1]) || 0;
    if (cols[0] === 'RF') rf = parseFloat(cols[1]) || 0;
    if (cols[0] === 'MRP') mrp = parseFloat(cols[1]) || 0;
    if (cols[0] === 'Beta_L') betaL = parseFloat(cols[1]) || 0;
    if (cols[0] === 'Beta_U') betaU = parseFloat(cols[1]) || 0;
    if (cols[0] === 'B/S') deRatio = parseFloat(cols[1]) || 0;
    if (cols[0]?.includes('법인세율')) taxRate = parseFloat(cols[1]) || 0;
    if (cols[0] === 'SP') sp = parseFloat(cols[1]) || 0;
    if (cols[0]?.includes('영구성장률')) g = parseFloat(cols[1]) || 0;
  }

  if (ke === 0) return null;

  // p39_Valuation 시트
  let pvFcfe = 0, terminalValue = 0, opValue = 0, youmeValue = 0, otherInvest = 0, nonOpValue = 0, equityValue = 0;
  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());
    if (cols[0] === 'PV of FCFE' && !pvFcfe) pvFcfe = parseFloat(cols[1]) || 0;
    if (cols[0] === 'Terminal Value' && !terminalValue) terminalValue = parseFloat(cols[1]) || 0;
    if (cols[0] === '영업가치' && !opValue) opValue = parseFloat(cols[1]) || 0;
    if (cols[0]?.includes('유미캐피탈') && cols[0]?.includes('지분가치')) youmeValue = parseFloat(cols[1]) || 0;
    if (cols[0] === '기타 투자자산') otherInvest = parseFloat(cols[1]) || 0;
    if (cols[0] === '비영업가치') nonOpValue = parseFloat(cols[1]) || 0;
    if (cols[0] === '지분가치' && !equityValue) equityValue = parseFloat(cols[1]) || 0;
  }

  // FCFE 추정 (p36, p55 시트)
  const tmFcfe = parseFcfeSection(lines, '영업수익', ['FY26', 'FY27', 'FY28', 'FY29', 'FY30']);
  const ymFcfe = parseFcfeSection(lines, '영업수익', ['FY26', 'FY27', 'FY28', 'FY29', 'FY30'], true);

  // 민감도 (지분가치 테이블)
  const tmSens = parseSensitivityTable(lines, equityValue);
  const ymSens = parseSensitivityTable(lines, youmeValue);

  // Peer Group
  const peerGroup = parsePeerGroup(lines);

  return {
    appraiser: '삼일회계법인(PwC)',
    method: 'FCFE DCF',
    baseDate: '2025.12.31',
    equityValue: Math.round(equityValue),
    ke: Math.round(ke * 10000) / 100, // 0.1478 → 14.78
    keComponents: {
      rf: Math.round(rf * 10000) / 100,
      mrp: Math.round(mrp * 100) / 100 * 100, // 0.08 → 8.00
      betaL: Math.round(betaL * 1000) / 1000,
      betaU: Math.round(betaU * 1000) / 1000,
      deRatio: Math.round(deRatio * 100) / 100 * 100, // 1.87 → 187
      taxRate: Math.round(taxRate * 100),
      sizePremium: Math.round(sp * 10000) / 100,
    },
    perpetualGrowthRate: Math.round(g * 100 * 100) / 100,
    operatingValue: Math.round(opValue),
    nonOperatingValue: Math.round(nonOpValue),
    youmeEquityValue: Math.round(youmeValue),
    otherNonOperating: Math.round(otherInvest),
    tmFcfe,
    ymFcfe,
    tmSensitivity: tmSens,
    ymSensitivity: ymSens,
    peerGroup,
  };
}

function parseFcfeSection(lines: string[], _startMarker: string, projYears: string[], isSecond = false): ValuationData['tmFcfe'] {
  const result: ValuationData['tmFcfe'] = [];
  let foundCount = 0;
  let inSection = false;
  const data: Record<string, Record<string, number>> = {};

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());

    // FCFE 시트 감지 (p.36 또는 p.55)
    if (cols[0]?.match(/^p\.\d+$/) || cols[0]?.includes('FCFE') || cols[0]?.includes('Equity Value')) {
      foundCount++;
    }

    // 두 번째 FCFE 섹션 (유미캐피탈)
    if (isSecond && foundCount < 3) continue;
    if (!isSecond && foundCount >= 3) break;

    // 연도 헤더
    if (cols.some(c => c === 'FY26')) {
      inSection = true;
      continue;
    }

    if (inSection && cols[0]) {
      const key = cols[0];
      if (['영업수익', '영업비용', '영업이익', '당기순이익', 'FCFE', 'PV of FCFE'].includes(key)) {
        const yearCols = cols.slice(1);
        for (let i = 0; i < projYears.length && i < yearCols.length; i++) {
          const val = parseFloat(String(yearCols[i]).replace(/,/g, ''));
          if (!isNaN(val)) {
            if (!data[projYears[i]]) data[projYears[i]] = {};
            data[projYears[i]][key] = val;
          }
        }
      }
      if (key === 'PV of FCFE') inSection = false;
    }
  }

  for (const year of projYears) {
    const d = data[year];
    if (!d) continue;
    result.push({
      year,
      revenue: Math.round(d['영업수익'] || 0),
      opCost: Math.round(d['영업비용'] || 0),
      opIncome: Math.round(d['영업이익'] || 0),
      netIncome: Math.round(d['당기순이익'] || 0),
      fcfe: Math.round(d['FCFE'] || 0),
      pvFcfe: Math.round(d['PV of FCFE'] || 0),
    });
  }

  return result;
}

function parseSensitivityTable(lines: string[], targetValue: number): ValuationData['tmSensitivity'] {
  const result: ValuationData['tmSensitivity'] = [];
  let inSens = false;
  let keHeaders: number[] = [];
  let found = false;

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());

    // 지분가치 민감도 테이블 감지
    if (cols.some(c => /자기자본비용/.test(c)) && !found) {
      inSens = true;
      // 다음행 또는 같은 행에 Ke 값
      const keVals = cols.filter(c => /^0\.1\d+$|^\d{1,2}\.\d+%$/.test(c));
      if (keVals.length >= 3) {
        keHeaders = keVals.map(v => {
          const n = parseFloat(v.replace('%', ''));
          return n < 1 ? Math.round(n * 10000) / 100 : n;
        });
      }
      continue;
    }

    if (inSens && keHeaders.length === 0) {
      // Ke 헤더행
      const keVals = cols.filter(c => /^0\.1\d+$|^\d{1,2}\.\d+%$/.test(c));
      if (keVals.length >= 3) {
        keHeaders = keVals.map(v => {
          const n = parseFloat(v.replace('%', ''));
          return n < 1 ? Math.round(n * 10000) / 100 : n;
        });
      }
      continue;
    }

    if (inSens && keHeaders.length > 0) {
      // 데이터행: 영구성장률 + 값들
      const gMatch = cols.find(c => /^0\.0[012]$/.test(c));
      if (gMatch) {
        const gPct = Math.round(parseFloat(gMatch) * 100);
        const numVals = cols.filter(c => {
          const n = parseFloat(String(c).replace(/,/g, ''));
          return !isNaN(n) && n > 10000;
        });

        if (numVals.length >= 3) {
          const values: Record<string, number> = {};
          for (let i = 0; i < Math.min(keHeaders.length, numVals.length); i++) {
            values[`${keHeaders[i].toFixed(2)}%`] = Math.round(parseFloat(String(numVals[i]).replace(/,/g, '')));
          }
          result.push({ keLabel: `${gPct}%`, values });
        }
      }

      // 민감도 테이블 종료
      if (result.length >= 3 || (line.trim() === '' && result.length > 0)) {
        found = true;
        inSens = false;
      }
    }
  }

  return result;
}

function parsePeerGroup(lines: string[]): ValuationData['peerGroup'] {
  const result: ValuationData['peerGroup'] = [];

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim());
    // Peer 기업명 매칭 (한국 회사)
    if (cols.length >= 5 && cols[1] && /캐피탈|리드코프|메이슨/.test(cols[1]) && cols[2] === 'South Korea') {
      result.push({
        company: cols[1],
        country: cols[2],
        deRatio: formatPct(cols[4] || '-'),
        taxRate: formatPct(cols[5] || '-'),
        beta5yr: cols[6] || '-',
        unleveredBeta: cols[7] || '-',
      });
    }
  }

  return result;
}

function parseGuarantorIncomeText(text: string, fileName: string): GuarantorIncomeData | null {
  // 대부분 이미지 PDF라 텍스트 없음 — skip
  if (text.length < 50) return null;

  const nameMatch = text.match(/성\s*명[:\s]*([^\s\n]+)/);
  const name = nameMatch ? nameMatch[1] : '대표이사';

  const yearMatch = fileName.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : '';

  // 간단 파싱 시도
  const extract = (pattern: RegExp): number => {
    const m = text.match(pattern);
    return m ? parseFloat(m[1].replace(/,/g, '')) / 1000 : 0;
  };

  const income = {
    year,
    laborIncome: extract(/근로소득[:\s]*([\d,]+)/),
    interestIncome: extract(/이자소득[:\s]*([\d,]+)/),
    dividendIncome: extract(/배당소득[:\s]*([\d,]+)/),
    businessIncome: extract(/사업소득[:\s]*([\d,]+)/),
    totalIncome: extract(/소득금액\s*합계[:\s]*([\d,]+)/),
    taxAmount: extract(/결정세액[:\s]*([\d,]+)/),
  };

  if (income.totalIncome === 0 && income.laborIncome === 0) return null;
  return { name, incomeByYear: [income] };
}

function parseDealTermsFromIM(text: string): Partial<DealTermsParsed> {
  const result: Partial<DealTermsParsed> = {};

  // LTV
  const ltvMatch = text.match(/LTV\s*([\d.]+)%/);
  if (ltvMatch) result.ltv = ltvMatch[1] + '%';

  // 지분평가금액
  const pledgeMatch = text.match(/지분평가금액\s*([\d,]+)원/);
  if (pledgeMatch) result.pledgeDescription = pledgeMatch[0];

  // 담보종류
  if (text.includes('지분담보') || text.includes('근질권')) {
    result.collateralType = '지분담보(근질권)';
  }

  // 상환방법
  if (text.includes('만기일시상환')) {
    result.purpose = text.match(/자금용도[:\s]*([^\n]+)/)?.[1]?.trim();
  }

  // 상환재원
  const repayMatch = text.match(/상환재원[:\s]*([^\n]+)/);
  if (repayMatch) result.repaymentSource = repayMatch[1].trim();

  return result;
}

// ─── Helpers ───

function extractEntityFromFileName(name: string): string {
  if (/유미캐피탈|유미/i.test(name)) return '유미캐피탈대부(주)';
  if (/테크메이트홀딩스|테크홀딩스/i.test(name)) return '테크메이트홀딩스(주)';
  if (/테크메이트|테크/i.test(name)) return '테크메이트코리아대부(주)';
  return name.split(/[_\-.]/).find(p => /[가-힣]{2,}/.test(p)) || '차주';
}

function classifyLender(lender: string): string {
  if (/저축은행|상호저축/.test(lender)) return '저축은행';
  if (/캐피탈|카드|리스|여전/.test(lender)) return '여전사';
  if (/은행|뱅크|KB|신한|우리|하나|기업|국민/.test(lender)) return '은행';
  if (/PUMA|LION|외화|USD|해외/i.test(lender)) return '외화사채';
  if (/사채|사모/.test(lender)) return '사모사채';
  if (/수협|신협|농협|상호금융|협동/.test(lender)) return '상호금융';
  if (/보험/.test(lender)) return '보험사';
  if (/대부/.test(lender)) return '대부업체';
  return '기타';
}

function formatPct(val: string): string {
  if (!val || val === '-') return '-';
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n < 1 ? `${(n * 100).toFixed(2)}%` : `${n.toFixed(2)}%`;
}

// ─── Data Mapping ───

export function mapBorrowingDetails(parsed: BorrowingDetailParsed[]): BorrowingDetail[] {
  const byEntity = new Map<string, BorrowingDetailParsed[]>();
  for (const b of parsed) {
    const arr = byEntity.get(b.entityName) || [];
    arr.push(b);
    byEntity.set(b.entityName, arr);
  }

  const results: BorrowingDetail[] = [];
  for (const [entityName, items] of byEntity) {
    const byCat = new Map<string, BorrowingDetailParsed[]>();
    for (const item of items) {
      const arr = byCat.get(item.category) || [];
      arr.push(item);
      byCat.set(item.category, arr);
    }

    const summary = [...byCat.entries()].map(([cat, catItems]) => {
      // 가중평균금리 계산
      let totalBal = 0, weightedRate = 0;
      for (const item of catItems) {
        const r = parseFloat(item.rate.replace('%', ''));
        if (!isNaN(r)) { weightedRate += r * item.balance; totalBal += item.balance; }
      }
      const avgRate = totalBal > 0 ? (weightedRate / totalBal).toFixed(2) + '%' : '-';
      const maturities = catItems.map(i => i.maturity).filter(m => m !== '-');

      return {
        category: cat,
        count: catItems.length,
        balance: Math.round(catItems.reduce((s, i) => s + i.balance, 0)),
        weightedAvgRate: avgRate,
        maturityRange: maturities.length > 0 ? `${maturities[0]}~${maturities[maturities.length - 1]}` : '-',
      };
    });

    const topLenders = items
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 15)
      .map(i => ({
        lender: i.lender,
        type: i.category,
        balance: Math.round(i.balance),
        rate: i.rate,
        maturity: i.maturity,
        repayment: '-',
      }));

    results.push({ entityName, summary, topLenders });
  }

  return results;
}
