// 남청라 — buildFinancialData를 로컬에서 직접 호출 (tsx)
// 운영 코드와 동일한 경로로 BS/차입금 추출 테스트
//
// 실행: cd app && npx tsx scripts/diag-namchungra-local.mts

const dartApi = await import("../src/lib/dart-api.ts");
const buildFinancialData = dartApi.buildFinancialData || dartApi.default?.buildFinancialData;
if (!buildFinancialData) {
  console.error("buildFinancialData not found. Available:", Object.keys(dartApi), Object.keys(dartApi.default || {}));
  process.exit(1);
}

const CORP_CODE = "01783003";
const STOCK_CODE = ""; // 비상장 REIT
const YEARS = ["2023", "2024", "2025"];

console.log(`\n=== 남청라 buildFinancialData 로컬 실행 ===`);
console.log(`corp_code=${CORP_CODE}, years=${YEARS}, stockCode='${STOCK_CODE}'`);

const t0 = Date.now();
const result = await buildFinancialData(CORP_CODE, YEARS, STOCK_CODE);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n실행 완료 (${elapsed}s)`);
console.log(`hasData=${result.hasData}, hasOfs=${result.hasOfs}, hasCfs=${result.hasCfs}`);
console.log(`source=${result.source}`);
console.log(`years=${result.years}`);
console.log(`extractionSourceOfs=${(result as any).extractionSourceOfs}`);
console.log(`extractionSourceCfs=${(result as any).extractionSourceCfs}`);
console.log(`noDataReason=${(result as any).noDataReason}`);

const dumpBs = (rows: any[], label: string) => {
  console.log(`\n=== ${label} BS rows (${rows.length}건) ===`);
  for (const r of rows) {
    const acct = r.account;
    if (/차입|사채|대출|금융부채|리스부채|부채|자산총계|자본총계/.test(acct)) {
      const vals = YEARS.map(y => r[y] || r[`${y}.12`] || "-").join(" | ");
      console.log(`  [d${r.depth}] ${acct}: ${vals}`);
    }
  }
};

dumpBs(result.bsItems || [], "개별(OFS)");
dumpBs(result.bsItemsCfs || [], "연결(CFS)");

console.log(`\n=== ratios ===`);
const lastYear = (result.years || []).sort().pop();
console.log(`lastYear=${lastYear}`);
console.log(`개별 ${lastYear}: 총차입금=${result.ratios?.[lastYear!]?.["총차입금"] || "-"}, 부채비율=${result.ratios?.[lastYear!]?.["부채비율"] || "-"}`);
console.log(`연결 ${lastYear}: 총차입금=${result.ratiosCfs?.[lastYear!]?.["총차입금"] || "-"}, 부채비율=${result.ratiosCfs?.[lastYear!]?.["부채비율"] || "-"}`);
