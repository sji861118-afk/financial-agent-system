#!/usr/bin/env node
// 9사 회귀 검증 스크립트
//   - 부채비율 / 영업이익률 / EBITDA / 이자보상배율 / 매출증가율 핵심 지표가
//     이전 baseline 대비 ±5% 이상 변동 시 경고
//   - 최초 실행: --baseline 플래그로 현재 추출값을 baseline.json에 저장
//   - 이후 실행: baseline.json과 비교하여 회귀 감지
//
// 실행:
//   node app/scripts/regression-check.mjs              # 비교 모드
//   node app/scripts/regression-check.mjs --baseline   # baseline 갱신 모드
//   node app/scripts/regression-check.mjs --base http://localhost:3000  # 다른 endpoint
//
// 의존성: jose (이미 설치됨), node 18+ (fetch 내장)

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = new Set(process.argv.slice(2));
const baselineMode = args.has("--baseline");
const baseFlag = process.argv.find((a) => a.startsWith("--base="));
const BASE = baseFlag ? baseFlag.slice(7) : "https://ok-cf1.vercel.app";

// 9사 회귀 베이스라인 — KOSPI/KOSDAQ/KONEX 다양성 확보
//   - 삼성전자: 표준 K-IFRS, 대형 연결 우선
//   - LG화학: 화학업, 매출 대규모
//   - SK하이닉스: 메모리, 영업이익 변동성
//   - 카카오: IT 플랫폼, 무형자산 비중
//   - 셀트리온: 바이오, 제약 회계
//   - NAVER: IT, 지분법 비중
//   - 현대건설: 건설, 진행기준 매출
//   - 대우건설: 건설, 비교 케이스
//   - 효성중공업: 제조업, EBITDA D&A 보강 path 발동 회사
const COMPANIES = [
  "삼성전자",
  "LG화학",
  "SK하이닉스",
  "카카오",
  "셀트리온",
  "NAVER",
  "현대건설",
  "대우건설",
  "효성중공업",
];

const YEARS = ["2024", "2025", "2026"];
const TOLERANCE = 0.05; // 5% 변동 시 경고
const BASELINE_PATH = path.join(__dirname, "regression-baseline.json");

const JWT_SECRET = process.env.JWT_SECRET || "loan-app-jwt-secret-key-2024-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);

const token = await new SignJWT({ userId: "regression-check", username: "Regression", role: "admin" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(secret);

console.log(`✓ JWT 토큰 생성 (base=${BASE}, mode=${baselineMode ? "BASELINE" : "COMPARE"})\n`);

const KEY_RATIOS = ["부채비율", "영업이익률", "이자보상배율", "매출증가율", "자기자본비율"];

function parseRatio(s) {
  if (!s || s === "-") return null;
  const cleaned = String(s).replace(/[%배회,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pctDiff(curr, base) {
  if (base === null || curr === null) return null;
  if (Math.abs(base) < 1e-9) {
    return Math.abs(curr) < 1e-9 ? 0 : Infinity;
  }
  return (curr - base) / Math.abs(base);
}

async function fetchOne(corp) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/dart/financial`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `loan-app-token=${token}`,
      },
      body: JSON.stringify({ corpName: corp, years: YEARS, generateExcel: false }),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { corp, ok: false, error: `parse failed (status ${res.status}): ${text.slice(0, 100)}` };
    }
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    if (!json.success) return { corp, ok: false, error: json.error || "no error msg", dur };

    const r = json.result;
    const lastYear = (r.years || []).sort().pop();
    const ratios = (r.ratios || {})[lastYear] || (r.ratiosCfs || {})[lastYear] || {};

    const snapshot = {};
    for (const key of KEY_RATIOS) {
      snapshot[key] = parseRatio(ratios[key]);
    }
    return { corp, ok: true, dur, lastYear, snapshot, hasData: r.hasData };
  } catch (e) {
    return { corp, ok: false, error: e.message };
  }
}

const results = [];
for (const corp of COMPANIES) {
  process.stdout.write(`[${corp}] 추출 중... `);
  const r = await fetchOne(corp);
  results.push(r);
  if (r.ok) {
    console.log(`✓ (${r.dur}s, year=${r.lastYear})`);
  } else {
    console.log(`❌ ${r.error}`);
  }
}

console.log("");

if (baselineMode) {
  const baseline = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    snapshots: Object.fromEntries(
      results
        .filter((r) => r.ok)
        .map((r) => [r.corp, { lastYear: r.lastYear, snapshot: r.snapshot }])
    ),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), "utf-8");
  console.log(`💾 baseline 저장: ${BASELINE_PATH}`);
  console.log(`   회사 수: ${Object.keys(baseline.snapshots).length}`);
  process.exit(0);
}

// 비교 모드
if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`❌ baseline 파일 없음: ${BASELINE_PATH}`);
  console.error(`   먼저 --baseline 플래그로 한 번 실행하세요.`);
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8"));
console.log(`📁 baseline: ${baseline.generatedAt} (회사 ${Object.keys(baseline.snapshots).length}개)\n`);

let warningCount = 0;
let errorCount = 0;
const driftLines = [];

for (const r of results) {
  if (!r.ok) {
    errorCount++;
    driftLines.push(`❌ [${r.corp}] 추출 실패: ${r.error}`);
    continue;
  }
  const baseEntry = baseline.snapshots[r.corp];
  if (!baseEntry) {
    driftLines.push(`⚠️  [${r.corp}] baseline에 없음 (신규 회사) — --baseline로 갱신 필요`);
    continue;
  }
  for (const key of KEY_RATIOS) {
    const curr = r.snapshot[key];
    const base = baseEntry.snapshot[key];
    const diff = pctDiff(curr, base);
    if (diff === null) {
      if (curr === null && base !== null) {
        driftLines.push(`❌ [${r.corp}] ${key}: ${base} → null (회귀, 추출 실패)`);
        errorCount++;
      }
      continue;
    }
    if (diff === Infinity) {
      driftLines.push(`⚠️  [${r.corp}] ${key}: 0 → ${curr} (baseline이 0이었음, 신규 값 출현)`);
      warningCount++;
      continue;
    }
    if (Math.abs(diff) >= TOLERANCE) {
      const sign = diff > 0 ? "+" : "";
      driftLines.push(
        `⚠️  [${r.corp}] ${key}: ${base} → ${curr} (${sign}${(diff * 100).toFixed(1)}%)`
      );
      warningCount++;
    }
  }
}

if (driftLines.length === 0) {
  console.log("✅ 모든 회사 회귀 없음 (±5% 이내)");
  process.exit(0);
}

console.log("=== 회귀 검출 ===");
for (const line of driftLines) console.log(line);
console.log("");
console.log(`총 경고: ${warningCount}, 에러: ${errorCount}`);
process.exit(errorCount > 0 ? 1 : warningCount > 0 ? 1 : 0);
