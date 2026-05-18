// 남청라 — buildFinancialData를 로컬에서 직접 호출
// 실행: cd app && npx tsx scripts/diag-namchungra-local.mts

import { buildFinancialData, dumpBs, dumpRatios } from "./lib/diag-bootstrap.mts";

const CORP_CODE = "01783003";
const STOCK_CODE = "";
const YEARS = ["2023", "2024", "2025"];

console.log(`\n=== 남청라 buildFinancialData 로컬 실행 ===`);
console.log(`corp_code=${CORP_CODE}, years=${YEARS}, stockCode='${STOCK_CODE}'`);

const t0 = Date.now();
const result = await buildFinancialData(CORP_CODE, YEARS, STOCK_CODE);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n실행 완료 (${elapsed}s)`);
console.log(`hasData=${result.hasData}, hasOfs=${result.hasOfs}, hasCfs=${result.hasCfs}`);
console.log(`source=${result.source}, years=${result.years}`);
console.log(`extractionSourceOfs=${result.extractionSourceOfs}`);
console.log(`extractionSourceCfs=${result.extractionSourceCfs}`);
console.log(`noDataReason=${result.noDataReason}`);

dumpBs(result.bsItems || [], "개별(OFS)", YEARS);
dumpBs(result.bsItemsCfs || [], "연결(CFS)", YEARS);
dumpRatios(result, "남청라");
