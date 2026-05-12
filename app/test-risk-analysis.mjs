// test-risk-analysis.mjs — 리스크 분석 자동 생성 + DART 기본정보 + 관련사 테스트
import { writeFileSync } from 'fs';

// ESM dynamic import for TypeScript compiled modules
const { generateDocx, equityPledgeProfile, unsoldCollateralProfile } = await import('./src/lib/loan-engine/index.ts');

// ─── 샘플 1: 지분담보 (에이엠플러스자산개발 유사) ───
const sampleEquityPledge = {
  meta: {
    applicationDate: '2026-04-06',
    applicationType: '신규',
    branch: '기업금융1본부',
    officer: '김담당',
  },
  borrower: {
    name: '(주)테스트금융',
    representative: '홍길동',
    businessNumber: '123-45-67890',
    corporateNumber: '110111-1234567',
    establishedDate: '2015-03-15',
    industry: '금융업',
    address: '서울특별시 강남구 테헤란로 123, 5층',
    companyType: '비상장',
    employeeCount: 45,
    capital: 5000,
    fiscalMonth: 12,
    shareholders: [
      { name: '홍길동', stockType: '보통주', shares: 400000, ownershipPct: 80.0, note: '대표이사' },
      { name: '(주)홀딩스', stockType: '보통주', shares: 100000, ownershipPct: 20.0, note: '관계사' },
    ],
  },
  loanTerms: {
    loanType: 'equity-pledge',
    amount: 15000, // 150억
    durationMonths: 24,
    repaymentMethod: '만기일시상환',
    rateType: '고정',
    ratePercent: 8.5,
    collateralType: '지분담보(근질권)',
    purpose: '운영자금 및 채권매입',
    repaymentSource: '대출채권 원리금 회수',
    creditClassification: '정상',
    guarantor: '홍길동 대표이사',
  },
  funding: {
    cashIn: [
      { item: '본건대출', amount: 15000 },
    ],
    cashOut: [
      { item: '채권매입', amount: 12000 },
      { item: '운영자금', amount: 3000 },
    ],
  },
  collateralSecurity: [
    { no: 1, description: '(주)테스트금융 홍길동 대표이사 연대보증' },
    { no: 2, description: '(주)자회사캐피탈 지분 100% 근질권 설정' },
    { no: 3, description: '이자유보 3개월치 근질권 설정' },
  ],
  loanConditions: {
    physical: ['(주)자회사캐피탈 지분 100% 근질권'],
    personal: ['홍길동 대표이사 연대보증'],
    interestReserve: ['이자 3개월치 유보'],
    general: ['현물 및 현금 배당 금지'],
    precedentConditions: [
      '제반 금융계약의 적법한 체결',
      '법무법인의 적법의견서 제출',
    ],
    subsequentConditions: [
      '인출일 이후 자금사용증빙 제출',
    ],
    accelerationEvents: [
      '차주가 대출약정에 따라 지급하여야 할 금액을 지급기일에 지급하지 아니한 경우',
      '대출약정상 차주의 확인 및 보장 사항이 사실과 다른 경우',
      '차주에 대한 파산, 회생 절차가 개시된 경우',
    ],
  },
  interestRate: {
    baseRate: 5.0,
    addOnRates: [
      { item: '신용원가', rate: 1.5 },
      { item: '목표이익', rate: 2.0 },
    ],
    totalCalculated: 8.5,
    appliedRate: 8.5,
  },
  financials: {
    borrower: {
      years: ["'22.12", "'23.12", "'24.12"],
      balanceSheet: [
        { account: '유동자산', values: { "'22.12": 45000, "'23.12": 52000, "'24.12": 48000 }, indent: 1 },
        { account: '현금및현금성자산', values: { "'22.12": 3500, "'23.12": 4200, "'24.12": 2800 }, indent: 2 },
        { account: '대출채권', values: { "'22.12": 38000, "'23.12": 44000, "'24.12": 42000 }, indent: 2 },
        { account: '비유동자산', values: { "'22.12": 15000, "'23.12": 18000, "'24.12": 20000 }, indent: 1 },
        { account: '자산총계', values: { "'22.12": 60000, "'23.12": 70000, "'24.12": 68000 }, bold: true },
        { account: '유동부채', values: { "'22.12": 25000, "'23.12": 30000, "'24.12": 32000 }, indent: 1 },
        { account: '단기차입금', values: { "'22.12": 18000, "'23.12": 22000, "'24.12": 24000 }, indent: 2 },
        { account: '비유동부채', values: { "'22.12": 20000, "'23.12": 22000, "'24.12": 20000 }, indent: 1 },
        { account: '장기차입금', values: { "'22.12": 15000, "'23.12": 16000, "'24.12": 14000 }, indent: 2 },
        { account: '사채', values: { "'22.12": 3000, "'23.12": 4000, "'24.12": 5000 }, indent: 2 },
        { account: '부채총계', values: { "'22.12": 45000, "'23.12": 52000, "'24.12": 52000 }, bold: true },
        { account: '자본총계', values: { "'22.12": 15000, "'23.12": 18000, "'24.12": 16000 }, bold: true },
      ],
      incomeStatement: [
        { account: '영업수익', values: { "'22": 12000, "'23": 14500, "'24": 13200 }, bold: true },
        { account: '이자수익', values: { "'22": 10000, "'23": 12000, "'24": 11500 }, indent: 1 },
        { account: '영업비용', values: { "'22": 9500, "'23": 11000, "'24": 11800 }, bold: true },
        { account: '이자비용', values: { "'22": 4000, "'23": 5200, "'24": 5800 }, indent: 1 },
        { account: '대손상각비', values: { "'22": 2000, "'23": 2500, "'24": 3200 }, indent: 1 },
        { account: '판매비와관리비', values: { "'22": 1500, "'23": 1800, "'24": 2000 }, indent: 1 },
        { account: '영업이익', values: { "'22": 2500, "'23": 3500, "'24": 1400 }, bold: true },
        { account: '당기순이익', values: { "'22": 2000, "'23": 2800, "'24": 1100 }, bold: true },
      ],
      ratios: [
        { account: '부채비율', values: { "'22.12": '300.0%', "'23.12": '288.9%', "'24.12": '325.0%' } },
        { account: '자기자본비율', values: { "'22.12": '25.0%', "'23.12": '25.7%', "'24.12": '23.5%' } },
        { account: '차입금의존도', values: { "'22.12": '60.0%', "'23.12": '60.0%', "'24.12": '63.2%' } },
        { account: '영업이익률', values: { "'22": '20.8%', "'23": '24.1%', "'24": '10.6%' } },
        { account: 'EBITDA', values: { "'22": 3500, "'23": 4800, "'24": 2800 } },
        { account: '이자보상배율', values: { "'22": '0.63배', "'23": '0.67배', "'24": '0.24배' } },
      ],
    },
    relatedCompanies: [
      {
        entity: {
          name: '(주)자회사캐피탈',
          relationship: '100% 자회사 (담보 대상)',
          representative: '김부장',
          businessNumber: '234-56-78901',
          establishedDate: '2018-06-12',
          industry: '대부업',
          address: '서울특별시 마포구 월드컵로 200',
        },
        detailLevel: 'full',
        statements: {
          years: ["'22.12", "'23.12", "'24.12"],
          balanceSheet: [
            { account: '자산총계', values: { "'22.12": 95000, "'23.12": 110000, "'24.12": 105000 }, bold: true },
            { account: '단기차입금', values: { "'22.12": 30000, "'23.12": 35000, "'24.12": 38000 }, indent: 1 },
            { account: '장기차입금', values: { "'22.12": 25000, "'23.12": 28000, "'24.12": 26000 }, indent: 1 },
            { account: '부채총계', values: { "'22.12": 70000, "'23.12": 80000, "'24.12": 78000 }, bold: true },
            { account: '자본총계', values: { "'22.12": 25000, "'23.12": 30000, "'24.12": 27000 }, bold: true },
          ],
          incomeStatement: [
            { account: '영업수익', values: { "'22": 18000, "'23": 22000, "'24": 20000 }, bold: true },
            { account: '영업이익', values: { "'22": 4000, "'23": 5500, "'24": 3800 }, bold: true },
            { account: '당기순이익', values: { "'22": 3200, "'23": 4500, "'24": 2900 }, bold: true },
          ],
        },
      },
      {
        entity: {
          name: '(주)홀딩스',
          relationship: '관계사 (주주, 지분 20%)',
          note: '사모사채 50억원 운용 중',
        },
        detailLevel: 'minimal',
      },
    ],
  },
  borrowings: [
    {
      entityName: '(주)테스트금융',
      summary: [
        { category: '단기차입금', count: 5, balance: 24000, weightedAvgRate: '7.2%', maturityRange: '1년 이내' },
        { category: '장기차입금', count: 3, balance: 14000, weightedAvgRate: '8.5%', maturityRange: '1~3년' },
        { category: '사채', count: 2, balance: 5000, weightedAvgRate: '9.0%', maturityRange: '2~3년' },
      ],
      topLenders: [
        { lender: 'A저축은행', type: '단기차입금', balance: 8000, rate: '7.0%', maturity: '2026-09-30', repayment: '만기일시' },
        { lender: 'B캐피탈', type: '단기차입금', balance: 6000, rate: '7.5%', maturity: '2026-06-30', repayment: '만기일시' },
        { lender: 'C증권', type: '장기차입금', balance: 5000, rate: '8.0%', maturity: '2027-12-31', repayment: '만기일시' },
        { lender: 'D자산운용', type: '사채', balance: 3000, rate: '9.0%', maturity: '2028-06-30', repayment: '만기일시' },
        { lender: 'E저축은행', type: '단기차입금', balance: 4000, rate: '7.2%', maturity: '2026-12-31', repayment: '만기일시' },
      ],
    },
  ],
  typeSpecific: {
    type: 'equity-pledge',
    data: {
      pledgedEquities: [
        {
          targetCompany: '(주)자회사캐피탈',
          holder: '(주)테스트금융',
          stockType: '보통주',
          shares: 200000,
          ownershipPct: 100.0,
          appraiser: '삼일회계법인',
          valuationAmount: 30000,
          valuationDate: '2026-03-31',
        },
      ],
      collateralValue: {
        valuationBasis: 'DCF (FCFE)',
        valuationAmount: 30000,
        ltv: 50.0,
        note: '삼일회계법인 평가',
      },
    },
  },
  syndicate: undefined,
  aiContent: {
    opinion: '차주 (주)테스트금융은 대부업 영위 회사로, 자회사 (주)자회사캐피탈 지분 100%를 담보로 제공.\n장점: 대출채권 포트폴리오 안정적, 자회사 수익성 양호\n단점: 최근 영업이익률 하락 추세, 이자비용 증가',
    riskAnalysis: '대손상각비 증가로 인한 수익성 악화 우려. 금리 상승 환경에서 차입비용 증가 지속 예상.',
  },
  unresolvedItems: [],
};

// ─── 샘플 2: 미분양담보 ───
const sampleUnsoldCollateral = {
  meta: {
    applicationDate: '2026-04-06',
    applicationType: '신규',
    branch: '기업금융1본부',
    officer: '박담당',
  },
  borrower: {
    name: '(주)샘플건설',
    representative: '이건설',
    businessNumber: '987-65-43210',
    corporateNumber: '110111-9876543',
    establishedDate: '2010-01-20',
    industry: '건설업',
    address: '서울특별시 서초구 서초대로 456',
    companyType: '비상장',
    capital: 10000,
    fiscalMonth: 12,
  },
  loanTerms: {
    loanType: 'unsold-collateral',
    amount: 8000,
    durationMonths: 18,
    repaymentMethod: '만기일시상환',
    rateType: '고정',
    ratePercent: 9.0,
    collateralType: '미분양 호실 담보 (담보신탁 1순위 우선수익권)',
    purpose: '운영자금',
    repaymentSource: '미분양 호실 매각대금',
    creditClassification: '정상',
  },
  funding: {
    cashIn: [{ item: '본건대출', amount: 8000 }],
    cashOut: [{ item: '운영자금', amount: 8000 }],
  },
  collateralSecurity: [
    { no: 1, description: '미분양 호실 담보신탁 1순위 우선수익권 설정' },
    { no: 2, description: '이건설 대표이사 연대보증' },
  ],
  loanConditions: {
    general: ['분양률 80% 이상 시 대출금 30% 조기상환'],
    precedentConditions: ['담보신탁 계약 체결', '감정평가서 제출'],
    subsequentConditions: ['분기별 분양현황 보고'],
    accelerationEvents: ['분양률 40% 미달 시'],
  },
  interestRate: { appliedRate: 9.0 },
  financials: {
    borrower: {
      years: ["'22.12", "'23.12", "'24.12"],
      balanceSheet: [
        { account: '유동자산', values: { "'22.12": 30000, "'23.12": 35000, "'24.12": 28000 }, indent: 1 },
        { account: '현금및현금성자산', values: { "'22.12": 800, "'23.12": 1200, "'24.12": 500 }, indent: 2 },
        { account: '비유동자산', values: { "'22.12": 20000, "'23.12": 25000, "'24.12": 30000 }, indent: 1 },
        { account: '자산총계', values: { "'22.12": 50000, "'23.12": 60000, "'24.12": 58000 }, bold: true },
        { account: '유동부채', values: { "'22.12": 22000, "'23.12": 28000, "'24.12": 35000 }, indent: 1 },
        { account: '단기차입금', values: { "'22.12": 15000, "'23.12": 20000, "'24.12": 25000 }, indent: 2 },
        { account: '비유동부채', values: { "'22.12": 18000, "'23.12": 20000, "'24.12": 18000 }, indent: 1 },
        { account: '장기차입금', values: { "'22.12": 12000, "'23.12": 15000, "'24.12": 14000 }, indent: 2 },
        { account: '부채총계', values: { "'22.12": 40000, "'23.12": 48000, "'24.12": 53000 }, bold: true },
        { account: '자본총계', values: { "'22.12": 10000, "'23.12": 12000, "'24.12": 5000 }, bold: true },
      ],
      incomeStatement: [
        { account: '매출액', values: { "'22": 25000, "'23": 30000, "'24": 18000 }, bold: true },
        { account: '매출원가', values: { "'22": 20000, "'23": 24000, "'24": 16000 }, indent: 1 },
        { account: '영업이익', values: { "'22": 3000, "'23": 3500, "'24": -500 }, bold: true },
        { account: '이자비용', values: { "'22": 2000, "'23": 2800, "'24": 3500 }, indent: 1 },
        { account: '당기순이익', values: { "'22": 1500, "'23": 1800, "'24": -2500 }, bold: true },
      ],
      ratios: [
        { account: '부채비율', values: { "'22.12": '400.0%', "'23.12": '400.0%', "'24.12": '1060.0%' } },
        { account: '자기자본비율', values: { "'22.12": '20.0%', "'23.12": '20.0%', "'24.12": '8.6%' } },
      ],
    },
  },
  borrowings: [],
  typeSpecific: {
    type: 'unsold-collateral',
    data: {
      collateral: {
        location: '경기도 화성시 OO동 123-4',
        appraiser: '한국감정원',
        appraisalDate: '2026-03-15',
        appraisalValue: 12000,
        trustee: '한국토지신탁',
        trustType: '관리형토지신탁',
      },
      units: [
        { no: 1, building: '101동', unit: '201호', type: '59A', exclusiveArea: 59.9, supplyArea: 84.5, salesPrice: 400, appraisalValue: 380, collateralValue: 304, ltv: 75.0 },
        { no: 2, building: '101동', unit: '301호', type: '59A', exclusiveArea: 59.9, supplyArea: 84.5, salesPrice: 410, appraisalValue: 390, collateralValue: 312, ltv: 76.9 },
        { no: 3, building: '102동', unit: '501호', type: '84B', exclusiveArea: 84.9, supplyArea: 114.5, salesPrice: 550, appraisalValue: 520, collateralValue: 416, ltv: 76.5 },
        { no: 4, building: '102동', unit: '1201호', type: '84B', exclusiveArea: 84.9, supplyArea: 114.5, salesPrice: 600, appraisalValue: 580, collateralValue: 464, ltv: 82.0 },
        { no: 5, building: '103동', unit: '801호', type: '49C', exclusiveArea: 49.5, supplyArea: 70.2, salesPrice: 320, appraisalValue: 300, collateralValue: 240, ltv: 80.0 },
      ],
      project: {
        name: '화성 OO지구 아파트',
        location: '경기도 화성시 OO동 123-4',
        totalUnits: 500,
        soldUnits: 420,
        unsoldUnits: 80,
        salesRate: 84.0,
        completionDate: '2025-12-20',
        developer: '(주)샘플건설',
        generalContractor: '(주)대형건설',
      },
    },
  },
  syndicate: undefined,
  aiContent: {
    opinion: '준공 후 미분양 호실 담보대출. 분양률 84%로 양호하나 미분양 80세대 잔존.',
  },
  unresolvedItems: [],
};

// ─── 생성 ───
console.log('=== 샘플 1: 지분담보 (equity-pledge) ===');
try {
  const buf1 = await generateDocx(sampleEquityPledge, { profile: equityPledgeProfile });
  const path1 = 'test-output-equity-pledge.docx';
  writeFileSync(path1, buf1);
  console.log(`✓ ${path1} 생성 완료 (${(buf1.length / 1024).toFixed(1)}KB)`);
} catch (e) {
  console.error('✗ 지분담보 생성 실패:', e.message);
  console.error(e.stack);
}

console.log('\n=== 샘플 2: 미분양담보 (unsold-collateral) ===');
try {
  const buf2 = await generateDocx(sampleUnsoldCollateral, { profile: unsoldCollateralProfile });
  const path2 = 'test-output-unsold-collateral.docx';
  writeFileSync(path2, buf2);
  console.log(`✓ ${path2} 생성 완료 (${(buf2.length / 1024).toFixed(1)}KB)`);
} catch (e) {
  console.error('✗ 미분양담보 생성 실패:', e.message);
  console.error(e.stack);
}

console.log('\n생성된 DOCX 파일을 열어서 리스크 분석 테이블, 차주 기본정보, 관련사 현황을 확인해주세요.');
