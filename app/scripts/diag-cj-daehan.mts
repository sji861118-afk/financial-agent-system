// CJ대한통운 — buildFinancialData를 로컬에서 직접 호출 (tsx)
// account_id key fix 검증: BS 동명이항목 disambiguation 결과 확인
//
// 실행: cd app && npx tsx scripts/diag-cj-daehan.mts

const dartApi = await import("../src/lib/dart-api.ts");
const buildFinancialData = dartApi.buildFinancialData || dartApi.default?.buildFinancialData;
if (!buildFinancialData) {
  console.error("buildFinancialData not found");
  process.exit(1);
}

const CORP_CODE = "00113410"; // CJ대한통운
const STOCK_CODE = "000120";   // 상장
const YEARS = ["2023", "2024", "2025"];

console.log(`\n=== CJ대한통운 buildFinancialData 로컬 실행 (account_id fix 검증) ===`);

const t0 = Date.now();
const result = await buildFinancialData(CORP_CODE, YEARS, STOCK_CODE);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n실행 완료 (${elapsed}s) hasData=${result.hasData}, hasOfs=${result.hasOfs}, hasCfs=${result.hasCfs}`);

const checkBs = (rows: any[], label: string) => {
  console.log(`\n=== ${label} BS rows (${rows.length}건) ===`);
  // 유동/비유동 부채 섹션 자세히 출력
  let currentSection = "?";
  for (const r of rows) {
    const acct = r.account;
    if (/^Ⅰ?\.?\s*유동부채|^유동부채$/.test(acct.trim())) currentSection = "유동부채";
    else if (/^Ⅱ?\.?\s*비유동부채|^비유동부채$/.test(acct.trim())) currentSection = "비유동부채";
    else if (/부채총계|자본총계|부채와자본총계/.test(acct)) currentSection = "[total/equity]";

    const vals = YEARS.map(y => r[y] || "-").join(" | ");
    const isInterest = /부채|차입금|사채|리스/.test(acct);
    if (isInterest || r.depth <= 1) {
      console.log(`  [d${r.depth}][${currentSection}] ${acct}: ${vals}`);
    }
  }

  // 동명이항목 확인
  const dupNames = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.account)) dupNames.add(r.account);
    seen.add(r.account);
  }
  console.log(`\n  → 중복 nm: ${dupNames.size}건 ${dupNames.size ? "(예: " + [...dupNames].slice(0,5).join(", ") + ")" : "✓ 없음 (disambiguation 작동)"}`);

  // 유동/비유동 suffix 적용 항목 확인
  const sufRows = rows.filter(r => /\(유동\)|\(비유동\)/.test(r.account));
  console.log(`  → suffix 적용 항목: ${sufRows.length}건`);
  for (const r of sufRows) {
    const vals = YEARS.map(y => r[y] || "-").join(" | ");
    console.log(`     ${r.account}: ${vals}`);
  }
};

checkBs(result.bsItems || [], "개별(OFS)");
checkBs(result.bsItemsCfs || [], "연결(CFS) ← 사용자 피드백 대상");

// 합계 정합성 검증
const verifyBsEquation = (rows: any[], label: string, year: string) => {
  const get = (kws: string[]) => {
    for (const r of rows) {
      const n = r.account.replace(/\s/g, "").replace(/\(유동\)|\(비유동\)/g, "");
      if (kws.some(k => n === k)) {
        const v = parseFloat(String(r[year] || "0").replace(/,/g, ""));
        return v;
      }
    }
    return 0;
  };
  const currentLiab = get(["유동부채"]);
  const nonCurrentLiab = get(["비유동부채"]);
  const totalLiab = get(["부채총계"]);
  const totalEq = get(["자본총계"]);
  const totalAsset = get(["자산총계"]);
  console.log(`\n=== ${label} ${year}년 BS 등식 검증 ===`);
  console.log(`  유동부채 + 비유동부채 = ${currentLiab + nonCurrentLiab} vs 부채총계 ${totalLiab}: diff ${Math.abs((currentLiab+nonCurrentLiab)-totalLiab)}`);
  console.log(`  부채총계 + 자본총계 = ${totalLiab + totalEq} vs 자산총계 ${totalAsset}: diff ${Math.abs((totalLiab+totalEq)-totalAsset)}`);
};

verifyBsEquation(result.bsItemsCfs || [], "연결(CFS)", "2024");
verifyBsEquation(result.bsItemsCfs || [], "연결(CFS)", "2025");
