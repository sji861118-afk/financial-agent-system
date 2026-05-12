/**
 * 롯데건설(주) DART 재무데이터 조회 테스트
 * Usage: cd app && npx tsx test-lotte-const.mjs
 */

// @ts-check
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// dotenv load
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const { buildFinancialData, getCompanyInfo, fetchBorrowingNotes, fetchShareholders } = await import('./src/lib/dart-api.ts');
const { searchCorpCodes } = await import('./src/lib/dart-corp-codes.ts');

async function main() {
  console.log("=".repeat(60));
  console.log("롯데건설(주) DART 재무데이터 조회");
  console.log("=".repeat(60));

  // ── 1. 기업 검색 ──
  console.log("\n[1] 기업 코드 검색: '롯데건설'");
  const matches = searchCorpCodes("롯데건설", 20);
  if (matches.length === 0) {
    console.error("검색 결과 없음!");
    return;
  }
  for (const m of matches) {
    console.log(`  - ${m.name} (corp_code: ${m.corpCode}, stock_code: ${m.stockCode || "(비상장)"})`);
  }

  // 롯데건설(주) 선택 — 괄호형 회사명 우선
  const target = matches.find(m =>
    m.name.includes("롯데건설") && (m.name.includes("(주)") || m.name.includes("㈜") || !m.name.includes("홀딩"))
  ) || matches[0];

  console.log(`\n  → 선택: ${target.name} (${target.corpCode})`);
  console.log(`     stockCode: "${target.stockCode}"`);

  // ── 2. 회사 기본정보 ──
  console.log("\n[2] 회사 기본정보");
  const info = await getCompanyInfo(target.corpCode);
  console.log(JSON.stringify(info, null, 2));

  // ── 3. 재무제표 (개별 + 연결) ──
  const years = ["2022", "2023", "2024"];
  console.log(`\n[3] 재무제표 조회 (${years.join(", ")}년)`);
  console.log(`  stock_code 전달값: "${target.stockCode}"`);

  const fin = await buildFinancialData(target.corpCode, years, target.stockCode);

  console.log("\n--- 결과 요약 ---");
  console.log("hasData:", fin.hasData);
  console.log("hasOfs (개별):", fin.hasOfs);
  console.log("hasCfs (연결):", fin.hasCfs);
  console.log("years:", fin.years);
  console.log("source:", fin.source);
  if (fin.noDataReason) console.log("noDataReason:", fin.noDataReason);
  if (fin.quarterlyWarnings) console.log("quarterlyWarnings:", fin.quarterlyWarnings);

  // ── 개별 BS ──
  if (fin.hasOfs && fin.bsItems.length > 0) {
    console.log(`\n[개별 재무상태표 (BS)] — ${fin.bsItems.length}개 항목`);
    console.log(formatTable(fin.bsItems, fin.years));

    console.log("\n[개별 재무비율]");
    for (const [year, ratios] of Object.entries(fin.ratios)) {
      console.log(`  ${year}년:`);
      for (const [k, v] of Object.entries(ratios)) {
        console.log(`    ${k}: ${v}`);
      }
    }
  } else {
    console.log("\n[개별 BS] 데이터 없음");
  }

  // ── 개별 IS ──
  if (fin.hasOfs && fin.isItems.length > 0) {
    console.log(`\n[개별 손익계산서 (IS)] — ${fin.isItems.length}개 항목`);
    console.log(formatTable(fin.isItems, fin.years));
  } else {
    console.log("\n[개별 IS] 데이터 없음");
  }

  // ── 연결 BS ──
  if (fin.hasCfs && fin.bsItemsCfs.length > 0) {
    console.log(`\n[연결 재무상태표 (CFS BS)] — ${fin.bsItemsCfs.length}개 항목`);
    console.log(formatTable(fin.bsItemsCfs, fin.years));

    console.log("\n[연결 재무비율]");
    for (const [year, ratios] of Object.entries(fin.ratiosCfs)) {
      console.log(`  ${year}년:`);
      for (const [k, v] of Object.entries(ratios)) {
        console.log(`    ${k}: ${v}`);
      }
    }
  } else {
    console.log("\n[연결 BS] 데이터 없음");
  }

  // ── 연결 IS ──
  if (fin.hasCfs && fin.isItemsCfs.length > 0) {
    console.log(`\n[연결 손익계산서 (CFS IS)] — ${fin.isItemsCfs.length}개 항목`);
    console.log(formatTable(fin.isItemsCfs, fin.years));
  } else {
    console.log("\n[연결 IS] 데이터 없음");
  }

  // ── 4. 차입금 주석 ──
  console.log("\n[4] 차입금 주석 조회 (fetchBorrowingNotes)");
  try {
    const borr = await fetchBorrowingNotes(target.corpCode, years);
    if (borr) {
      console.log("  차입금 주석:");
      console.log(JSON.stringify(borr, null, 2));
    } else {
      console.log("  차입금 주석 데이터 없음");
    }
  } catch (e) {
    console.error("  차입금 주석 오류:", e);
  }

  // ── 5. 주주 현황 ──
  console.log("\n[5] 주주 현황 (2024년)");
  try {
    const shareholders = await fetchShareholders(target.corpCode, "2024");
    if (shareholders.length > 0) {
      console.log(`  ${shareholders.length}명:`);
      for (const s of shareholders) {
        console.log(`  - ${s.name}: ${s.shareRatio}% (${s.relation})`);
      }
    } else {
      console.log("  주주 현황 데이터 없음");
    }
  } catch (e) {
    console.error("  주주 현황 오류:", e);
  }

  console.log("\n" + "=".repeat(60));
  console.log("조회 완료");
  console.log("=".repeat(60));
}

function formatTable(rows, years) {
  const lines = [];
  const header = ["계정과목".padEnd(40), ...years.map(y => y.padStart(16))].join(" | ");
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (const row of rows) {
    const d = row.depth ?? 2;
    const indent = d === 0 ? "" : d === 1 ? "  " : "    ";
    const acct = (indent + row.account).slice(0, 40).padEnd(40);
    const vals = years.map(y => (row[y] ?? "-").toString().padStart(16));
    lines.push([acct, ...vals].join(" | "));
  }
  return lines.join("\n");
}

main().catch(console.error);
