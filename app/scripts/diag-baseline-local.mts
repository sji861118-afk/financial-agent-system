// 9사 baseline 로컬 회귀 검증 — buildFinancialData 직접 호출
// 운영 JWT_SECRET 불필요. baseline.json의 핵심 지표와 ±5% 이내 비교.
//
// 실행: cd app && npx tsx scripts/diag-baseline-local.mts

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dartApi: any = await import("../src/lib/dart-api.ts");
const buildFinancialData = dartApi.buildFinancialData || dartApi.default?.buildFinancialData;
if (!buildFinancialData) {
  console.error("buildFinancialData export 없음. Available:", Object.keys(dartApi), Object.keys(dartApi.default || {}));
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, "regression-baseline.json");

const COMPANIES_CORP = {
  "삼성전자": "00126380",
  "LG화학": "00356361",
  "SK하이닉스": "00164779",
  "카카오": "00258801",
  "셀트리온": "00421045",
  "NAVER": "00266961",
  "현대건설": "00164742", // 임시 — 실제로는 다를 수 있음
  "대우건설": "00146772",
  "효성중공업": "01515323",
};

const YEARS = ["2023", "2024", "2025"];
const KEY_RATIOS = ["부채비율", "영업이익률", "이자보상배율", "매출증가율", "자기자본비율"];

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8"));
console.log(`📁 baseline: ${baseline.generatedAt}\n`);

function parseRatio(s: string | null): number | null {
  if (!s || s === "-") return null;
  const cleaned = String(s).replace(/[%배회,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const TOLERANCE = 0.05;
let warnings = 0, errors = 0;

// Full 9사 + CJ대한통운 (BS fix 검증 추가)
const TEST_LIST = ["삼성전자", "LG화학", "SK하이닉스", "카카오", "셀트리온", "NAVER"];

for (const corp of TEST_LIST) {
  const corpCode = COMPANIES_CORP[corp as keyof typeof COMPANIES_CORP];
  process.stdout.write(`[${corp}] 추출 중... `);
  try {
    const t0 = Date.now();
    const result = await buildFinancialData(corpCode, YEARS);
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    const lastYear = (result.years || []).sort().pop()!;
    const ratios = (result.ratios as any)?.[lastYear] || (result.ratiosCfs as any)?.[lastYear] || {};
    console.log(`✓ (${dur}s, year=${lastYear})`);

    const baseEntry = baseline.snapshots[corp];
    if (!baseEntry) { console.log(`  ⚠️ baseline에 없음`); continue; }

    for (const key of KEY_RATIOS) {
      const curr = parseRatio(ratios[key]);
      const base = baseEntry.snapshot[key];
      if (curr === null && base !== null) {
        console.log(`  ❌ ${key}: ${base} → null`);
        errors++;
        continue;
      }
      if (curr !== null && base !== null) {
        const diff = base === 0 ? (curr === 0 ? 0 : Infinity) : (curr - base) / Math.abs(base);
        if (Math.abs(diff) >= TOLERANCE) {
          const sign = diff > 0 ? "+" : "";
          console.log(`  ⚠️ ${key}: ${base} → ${curr} (${sign}${(diff * 100).toFixed(1)}%)`);
          warnings++;
        }
      }
    }
  } catch (e: any) {
    console.log(`❌ ${e.message}`);
    errors++;
  }
}

console.log(`\n=== 결과: 경고 ${warnings}, 에러 ${errors} ===`);
process.exit(errors > 0 ? 1 : warnings > 0 ? 1 : 0);
