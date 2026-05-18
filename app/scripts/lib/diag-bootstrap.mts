// 진단 스크립트 공용 부트스트랩
// - .env.local 자동 로드 (DART_API_KEY)
// - dart-api 모듈 CJS/ESM 양호환 unwrap
// - BS/IS/CF rows dump 헬퍼
//
// 사용:
//   import { buildFinancialData, dumpBs, dumpStatement } from "./lib/diag-bootstrap.mts";

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal(): void {
  // scripts/lib → scripts → app
  const appDir = path.resolve(__dirname, "..", "..");
  const envPath = path.join(appDir, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();

const dartApi: any = await import("../../src/lib/dart-api.ts");
const unwrap = (name: string) => dartApi[name] ?? dartApi.default?.[name];

export const buildFinancialData: (
  corpCode: string,
  years: string[],
  stockCode?: string,
) => Promise<any> = unwrap("buildFinancialData");

if (!buildFinancialData) {
  console.error("buildFinancialData export 없음. Available:", Object.keys(dartApi), Object.keys(dartApi.default || {}));
  process.exit(1);
}

export type DiagRow = {
  account: string;
  depth?: number;
  [year: string]: string | number | undefined;
};

export function dumpStatement(rows: DiagRow[], label: string, years: string[], filterRe?: RegExp): void {
  console.log(`\n=== ${label} (${rows.length}건) ===`);
  for (const r of rows) {
    if (filterRe && !filterRe.test(r.account) && (r.depth ?? 99) > 1) continue;
    const vals = years.map((y) => r[y] ?? r[`${y}.12`] ?? "-").join(" | ");
    const d = r.depth ?? 0;
    console.log(`  [d${d}] ${r.account}: ${vals}`);
  }
}

export function dumpBs(rows: DiagRow[], label: string, years: string[]): void {
  dumpStatement(rows, `${label} BS`, years, /차입|사채|대출|금융부채|리스부채|부채|자산총계|자본총계/);
}

export function dumpIs(rows: DiagRow[], label: string, years: string[]): void {
  dumpStatement(rows, `${label} IS`, years, /매출|영업이익|당기순이익|법인세|이자|금융/);
}

export function dumpCf(rows: DiagRow[], label: string, years: string[]): void {
  dumpStatement(rows, `${label} CF`, years, /영업활동|투자활동|재무활동|감가|상각|이자|현금/);
}

export function dumpRatios(result: any, label: string): void {
  const lastYear = (result.years || []).sort().pop();
  if (!lastYear) {
    console.log(`\n=== ${label} ratios — 데이터 없음 ===`);
    return;
  }
  const r = result.ratios?.[lastYear] || {};
  const rc = result.ratiosCfs?.[lastYear] || {};
  console.log(`\n=== ${label} ${lastYear}년 핵심 지표 ===`);
  const keys = ["총차입금", "순차입금", "부채비율", "유동비율", "자기자본비율", "영업이익률", "이자보상배율", "EBITDA"];
  for (const k of keys) {
    console.log(`  ${k.padEnd(10)} 개별=${r[k] ?? "-"}  연결=${rc[k] ?? "-"}`);
  }
}
