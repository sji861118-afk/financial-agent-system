// 부실징후점검 진단 스크립트 — 운영 JWT_SECRET 불필요
// 실행: cd app && npx tsx scripts/diag-insolvency.mts [회사명]
//
// buildFinancialData → extract24Cells → judgeWarnings 전체 파이프라인을
// 한 번에 실행하여 어디서 실패하는지 진단한다.

import { buildFinancialData } from "./lib/diag-bootstrap.mts";

// path alias가 tsx에서 작동하므로 직접 @/ import 가능
const dartCorpCodes: any = await import("../src/lib/dart-corp-codes.ts");
const findCorpCode = dartCorpCodes.findCorpCode ?? dartCorpCodes.default?.findCorpCode;

const extractMod: any = await import("../src/lib/insolvency/extract-financials.ts");
const extract24Cells = extractMod.extract24Cells ?? extractMod.default?.extract24Cells;

const rulesMod: any = await import("../src/lib/insolvency/rules.ts");
const judgeWarnings = rulesMod.judgeWarnings ?? rulesMod.default?.judgeWarnings;

const dartMod: any = await import("../src/lib/dart-api.ts");
const fetchAuditOpinion = dartMod.fetchAuditOpinion ?? dartMod.default?.fetchAuditOpinion;

const NAME = process.argv[2] || "삼성전자";
// --corp=00386937 형태로 corp_code 직접 지정 가능 (동명이인 회사 구분용)
const CORP_OVERRIDE = process.argv.find((a) => a.startsWith("--corp="))?.split("=")[1];

console.log(`\n${"=".repeat(60)}`);
console.log(`부실징후점검 진단: ${NAME}${CORP_OVERRIDE ? ` (corp_code=${CORP_OVERRIDE} 강제)` : ""}`);
console.log("=".repeat(60));

// 1) 매칭
let match: { corpCode: string; stockCode: string } | null;
if (CORP_OVERRIDE) {
  // corp_code 직접 지정 — stockCode는 dart-corp-codes에서 lookup
  const cm: any = await import("../src/lib/dart-corp-codes.ts");
  const findStock = cm.findStockCodeByCorpCode ?? cm.default?.findStockCodeByCorpCode;
  match = { corpCode: CORP_OVERRIDE, stockCode: findStock(CORP_OVERRIDE) || "" };
} else {
  match = findCorpCode(NAME);
  if (!match) {
    console.error(`❌ findCorpCode 매칭 실패: ${NAME}`);
    process.exit(1);
  }
}
console.log(`✓ 매칭: corpCode=${match.corpCode} stockCode=${match.stockCode || "(비상장)"}`);

// 2) defaultYears 시뮬레이션 (fetch route와 동일)
const now = new Date();
const cutoffMonth = 4;
const baseYear = now.getMonth() + 1 <= cutoffMonth ? now.getFullYear() - 2 : now.getFullYear() - 1;
const years = [String(baseYear), String(baseYear - 1), String(baseYear - 2)];
console.log(`✓ years (route default): ${years.join(", ")}`);

// 3) buildFinancialData
console.log(`\n--- buildFinancialData 호출 (${years.join(",")}) ---`);
const t0 = Date.now();
const fin = await buildFinancialData(match.corpCode, years, match.stockCode);
console.log(`✓ ${Date.now() - t0}ms`);
console.log(`  hasData: ${fin.hasData}`);
console.log(`  hasOfs: ${fin.hasOfs} (bsItems: ${fin.bsItems?.length || 0}, isItems: ${fin.isItems?.length || 0})`);
console.log(`  hasCfs: ${fin.hasCfs} (bsItemsCfs: ${fin.bsItemsCfs?.length || 0}, isItemsCfs: ${fin.isItemsCfs?.length || 0})`);
console.log(`  source OFS=${fin.extractionSourceOfs || "-"} / CFS=${fin.extractionSourceCfs || "-"}`);
if (fin.noDataReason) console.log(`  ⚠ noDataReason: ${fin.noDataReason}`);
console.log(`  years: ${fin.years?.join(",") || "-"}`);

if (!fin.hasData) {
  console.error(`\n❌ buildFinancialData 실패. errors[]에 들어가서 화면에 빈 row 표시됨.`);
  process.exit(1);
}

// 4) extract24Cells
console.log(`\n--- extract24Cells ---`);
const cells = extract24Cells(fin, years);
for (const y of years) {
  const c = cells.byYear[y];
  if (!c) {
    console.log(`  ${y}: ⚠ 결측 (byYear[${y}] === undefined)`);
    continue;
  }
  const m = (v: number) => Math.round(v).toLocaleString("ko-KR");
  console.log(
    `  ${y}: 자산=${m(c.totalAssets)} 부채=${m(c.totalLiab)} 자본=${m(c.totalEquity)} 차입=${m(c.borrowings)} ` +
      `매출=${m(c.revenue)} 영업=${m(c.operatingIncome)} 이자=${m(c.interestExpense)} 순익=${m(c.netIncome)}`,
  );
  // 매칭 추적 — 어떤 DART account_name에서 추출됐는지
  const mm = cells.matches?.[y];
  if (mm) {
    const mt = (k: string) => {
      const v = (mm as any)[k];
      if (!v?.account) return `${k}=[MISS]`;
      const ksuffix = v.kind === "exact" ? "" : `(${v.kind})`;
      return `${k}=${v.account}${ksuffix}`;
    };
    console.log(
      `       ↳ ${mt("totalAssets")} | ${mt("totalLiab")} | ${mt("totalEquity")} | ${mt("borrowings")}`,
    );
    console.log(
      `       ↳ ${mt("revenue")} | ${mt("operatingIncome")} | ${mt("interestExpense")} | ${mt("netIncome")}`,
    );
  }
}

// 4.5) IS rows raw dump (도메인 매칭 확인용)
const FULL_DUMP = process.argv.includes("--full");
if (FULL_DUMP) {
  console.log(`\n--- IS rows (개별) ---`);
  for (const r of fin.isItems || []) {
    console.log(`  [d${r.depth ?? 0}] ${r.account}: ${years.map((y: string) => r[y]).join(" / ")}`);
  }
  if (fin.isItemsCfs?.length) {
    console.log(`\n--- IS rows (연결) ---`);
    for (const r of fin.isItemsCfs) {
      console.log(`  [d${r.depth ?? 0}] ${r.account}: ${years.map((y: string) => r[y]).join(" / ")}`);
    }
  }
  console.log(`\n--- BS rows 일부 (자본/부채/차입) ---`);
  const bsRows = fin.bsItems || [];
  for (const r of bsRows) {
    const nm = r.account || "";
    if (/자본|부채|차입|사채|리스/.test(nm)) {
      console.log(`  [d${r.depth ?? 0}] ${nm}: ${years.map((y: string) => r[y]).join(" / ")}`);
    }
  }
}

// 5) fetchAuditOpinion
console.log(`\n--- fetchAuditOpinion ---`);
const t1 = Date.now();
const opinion = await fetchAuditOpinion(match.corpCode, years).catch((e: unknown) => {
  console.log(`  ⚠ catch: ${e instanceof Error ? e.message : String(e)}`);
  return null;
});
console.log(`  ${Date.now() - t1}ms`);
console.log(`  opinion: ${JSON.stringify(opinion)}`);

// 6) judgeWarnings
console.log(`\n--- judgeWarnings ---`);
const flags = judgeWarnings({ cells, years, opinion });
const F = (k: string) => `${(flags as any)[k]}`.padEnd(2);
console.log(`  3년연속결손      ${F("threeYearsLoss")} — ${flags.evidence.threeYearsLoss || "-"}`);
console.log(`  완전자본잠식     ${F("fullCapitalImpair")} — ${flags.evidence.fullCapitalImpair || "-"}`);
console.log(`  차입금>매출액   ${F("borrowGtRevenue")} — ${flags.evidence.borrowGtRevenue || "-"}`);
console.log(`  감사의견거절     ${F("auditOpinionReject")} — ${flags.evidence.auditOpinionReject || "-"}`);

console.log(`\n${"=".repeat(60)}`);
console.log("✓ 진단 완료. UI에서 같은 데이터가 표시되어야 정상.");
console.log("=".repeat(60));
