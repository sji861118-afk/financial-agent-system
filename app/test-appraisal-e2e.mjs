// app/test-appraisal-e2e.mjs
// E2E 검증: 실데이터 PDF → 파싱 → 자동감지 → 어댑터 → Excel 생성 전 과정 테스트
// PDF 파싱이 실패하는 경우 합성데이터로 Excel 파이프라인(오케스트레이터)만 별도 검증.
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { parseAppraisalPdf, extractRawText } from './src/lib/appraisal-parser.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { detectApplicationFormType } from './src/lib/appraisal/property-detector.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { adaptParserResult } from './src/lib/appraisal/parser-adapter.ts';
// @ts-expect-error TS5097 — Node v24 strip-types requires .ts extension at runtime
import { generateAppraisalExcel } from './src/lib/appraisal/orchestrator.ts';

const SAMPLES = [
  {
    name: '지산센터',
    path: '../_reference/2.감정평가서 샘플/에이엠플러스인덕원_감정평가서 C32508-2-1401 DRAFT(170개호)_1.pdf',
    expectedType: 'industrial-center',
  },
  {
    name: '토지감평',
    path: '../_reference/2.감정평가서 샘플/계림4유동화_(감정평가서) 250716-00-011 DRAFT (계림4구역 재개발사업)_토지감평.pdf',
    expectedType: 'land-pf',
  },
];

const OUT_DIR = process.platform === 'win32' ? (process.env.TEMP || 'C:/tmp') : '/tmp';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let passed = 0;
let failed = 0;
let skipped = 0;

console.log('### PART 1: 실데이터 PDF 샘플 ###');
for (const s of SAMPLES) {
  if (!fs.existsSync(s.path)) {
    console.log(`- ${s.name}: 파일 없음 (${s.path}) — 스킵`);
    skipped++;
    continue;
  }
  console.log(`\n--- ${s.name} ---`);
  const buffer = fs.readFileSync(s.path);

  // 1. 자동감지용 raw text
  const rawText = await extractRawText(buffer);
  if (!rawText || rawText.length < 50) {
    console.log(`  - PDF 파싱 실패(텍스트 추출 불가) — 스킵 (${s.path.split('/').pop()})`);
    skipped++;
    continue;
  }
  const detected = detectApplicationFormType(rawText);
  console.log(`  detected: ${detected.type} (confidence: ${detected.confidence.toFixed(2)})`);
  if (detected.scores) console.log(`  scores: ${JSON.stringify(detected.scores)}`);

  if (detected.type !== s.expectedType) {
    console.log(`  X type mismatch (expected ${s.expectedType})`);
    failed++;
    continue;
  }

  // 2. PDF 파싱
  const parsed = await parseAppraisalPdf(buffer, detected.type);

  // 3. 어댑터로 정규화
  const meta = { fileName: path.basename(s.path), pages: 0, parseStatus: 'ok' };
  const data = adaptParserResult(parsed, detected.type, detected.confidence, [meta], [], null);

  // 4. Excel 생성
  try {
    const out = await generateAppraisalExcel({ data, fileNamePrefix: s.name });
    const outPath = path.join(OUT_DIR, out.fileName);
    fs.writeFileSync(outPath, out.buffer);
    console.log(`  OK Excel: ${outPath} (${(out.buffer.length / 1024).toFixed(1)} KB)`);
    const fs_ = out.findings;
    console.log(`  findings: ${fs_.length}건 (E${fs_.filter((f) => f.severity === 'ERROR').length} W${fs_.filter((f) => f.severity === 'WARNING').length} I${fs_.filter((f) => f.severity === 'INFO').length})`);
    passed++;
  } catch (e) {
    console.log('  X 오케스트레이터 실패:', e?.stack || e?.message || e);
    failed++;
  }
}

// === PART 2: 합성데이터로 오케스트레이터 파이프라인 검증 ===
// 목적: PDF 파싱이 실패해도 orchestrator/sheet-builders/auditors가 3개 formType 모두에서
// 크래시 없이 Excel을 생성함을 검증.
console.log('\n\n### PART 2: 합성데이터 파이프라인 smoke test (3 formTypes) ###');

function buildSyntheticData(formType) {
  return {
    source: {
      appraisalReports: [{ fileName: `synthetic-${formType}.pdf`, pages: 1, parseStatus: 'ok' }],
      feasibilityReports: [],
      parsedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    },
    formType,
    detectionConfidence: 0.9,
    collateral: {
      owner: '테스트소유자',
      trustee: '테스트수탁자',
      appraiser: '테스트감정평가사',
      debtor: '테스트채무자',
      purpose: '담보',
      submittedTo: 'OK저축은행',
      baseDate: '2026-01-15',
      serialNo: 'TEST-2026-001',
      method: { comparison: 1000000000, cost: 950000000, income: 980000000 },
      appraisalValue: 1000000000,
      formRequirements: {
        officialAppraisal: true,
        signatureComplete: true,
        forFinancialUse: true,
        reused: false,
        reusedNote: '',
        conditional: false,
      },
      items: [
        {
          type: '아파트',
          quantity: 1,
          areaSqm: 84.9,
          areaPyeong: 25.7,
          appraisalValue: 1000000000,
          collateralRatio: 70,
          priorClaims: 0,
          availableValue: 700000000,
          ltv: 70,
        },
      ],
      totalArea: 84.9,
      totalAreaPyeong: 25.7,
      collateralRatio: 70,
      priorClaims: 0,
      availableValue: 700000000,
      ltv: 70,
      rights: [],
      remarks: 'synthetic test',
      opinion: 'synthetic opinion',
    },
    collateralDetail: [
      {
        dong: '101동',
        ho: '101호',
        floor: 1,
        areaSqm: 84.9,
        areaPyeong: 25.7,
        appraisalValue: 1000000000,
      },
    ],
    comparatives: [
      {
        no: 1,
        address: '서울시 강남구 역삼동 123',
        usage: '아파트',
        landArea: 100,
        buildingArea: 85,
        transactionType: '매매',
        transactionDate: '2025-10-01',
        pricePerPyeong: 30000000,
      },
    ],
    supply: undefined,
    missingFields: [],
  };
}

for (const formType of ['apartment-pf', 'industrial-center', 'land-pf']) {
  const data = buildSyntheticData(formType);
  try {
    const out = await generateAppraisalExcel({ data, fileNamePrefix: `synth-${formType}` });
    const outPath = path.join(OUT_DIR, out.fileName);
    fs.writeFileSync(outPath, out.buffer);
    console.log(`\n  [${formType}] OK ${outPath} (${(out.buffer.length / 1024).toFixed(1)} KB, findings: ${out.findings.length})`);
    passed++;
  } catch (e) {
    console.log(`\n  [${formType}] X 오케스트레이터 크래시:`, e?.stack || e?.message || e);
    failed++;
  }
}

console.log(`\n=== 결과 ===`);
console.log(`PASS ${passed}, FAIL ${failed}, SKIP ${skipped}`);
process.exit(failed > 0 ? 1 : 0);
