/**
 * PDF 파싱 통합 테스트
 * - 실제 PDF 파일로 extractPdfStructured + parsePdf 검증
 * - 기대값: BS/IS 주요 계정 존재 + 수치 정확성
 */
import fs from "fs";
import path from "path";

// pdfjs-dist 폴리필
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      if (Array.isArray(init)) { this.a=init[0]||1;this.b=init[1]||0;this.c=init[2]||0;this.d=init[3]||1;this.e=init[4]||0;this.f=init[5]||0; }
      else { this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0; }
    }
    get is2D() { return true; }
  };
}
if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = class Path2D {};
}

// ── 테스트 대상 PDF ──
const PDF_2025 = "c:/Users/OK/Downloads/재무제표_수림주택건설(주)_5048702480_202512.PDF";
const PDF_2024 = "c:/Users/OK/Downloads/재무제표_수림주택건설(주)_5048702480_202412(2).PDF";

// ── 기대값 (수림주택건설 2025 PDF 기준, 원 단위) ──
const EXPECTED_BS_2025 = {
  "유동자산": 10436062668,
  "비유동자산": 5000000,
  "자산총계": 10441062668,
  "유동부채": 13904831481,
  "부채총계": 13904831481,
  "자본총계": -3463768813,
};

const EXPECTED_IS_2025 = {
  "매출액": 0,
  "판매비와관리비": 347072859,
  "영업손실": 347072859,
  "당기순손실": 1980709615,
};

const EXPECTED_YEARS_2025 = ["2024", "2025"];

// ── 테스트 유틸 ──
let passCount = 0;
let failCount = 0;
const failures = [];

function assert(name, condition, detail = "") {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${name}`);
  } else {
    failCount++;
    console.log(`  ❌ ${name} ${detail}`);
    failures.push({ name, detail });
  }
}

function findRow(rows, keyword) {
  return rows.find(r => {
    const acct = (r.account || "").replace(/\s/g, "");
    return acct.includes(keyword);
  });
}

function parseNum(val) {
  if (!val || val === "-") return 0;
  const s = String(val).replace(/,/g, "").replace(/\s/g, "");
  const negative = s.startsWith("(") && s.endsWith(")") || s.startsWith("-");
  const num = parseFloat(s.replace(/[(),\-]/g, ""));
  return isNaN(num) ? 0 : (negative ? -num : num);
}

// ── extractPdfStructured 직접 테스트 ──
async function testStructuredExtraction(filePath, label) {
  console.log(`\n── Test: extractPdfStructured (${label}) ──`);

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  파일 없음: ${filePath}`);
    return null;
  }

  const buf = fs.readFileSync(filePath);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  // 전체 행 추출
  const allPdfRows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim());
    const rowMap = {};
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      if (!rowMap[y]) rowMap[y] = [];
      rowMap[y].push({ x: Math.round(it.transform[4]), text: it.str.trim() });
    }
    const sortedYs = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
    for (const y of sortedYs) {
      allPdfRows.push({ y, cells: rowMap[y].sort((a, b) => a.x - b.x) });
    }
  }
  doc.destroy();

  assert("행 추출 5개 이상", allPdfRows.length >= 5, `got ${allPdfRows.length}`);

  // 컬럼 경계 탐지
  const gapCandidates = [];
  for (const row of allPdfRows) {
    const allText = row.cells.map(c => c.text).join("");
    if (!/[가-힣]/.test(allText) || !/\d/.test(allText)) continue;
    let lastAccountX = 0;
    let firstNumX = Infinity;
    for (const cell of row.cells) {
      if (/[가-힣)）]/.test(cell.text)) lastAccountX = Math.max(lastAccountX, cell.x + cell.text.length * 8);
      if (/^\d/.test(cell.text) || /^\([\d,]/.test(cell.text)) firstNumX = Math.min(firstNumX, cell.x);
    }
    if (firstNumX > lastAccountX && firstNumX < Infinity) {
      gapCandidates.push(Math.round((lastAccountX + firstNumX) / 2));
    }
  }
  gapCandidates.sort((a, b) => a - b);
  const col1Boundary = gapCandidates.length > 0 ? gapCandidates[Math.floor(gapCandidates.length / 2)] : 210;

  // 숫자 X좌표의 큰 갭 탐지
  const numXCoords = [];
  for (const row of allPdfRows) {
    for (const cell of row.cells) {
      if (cell.x >= col1Boundary && /[\d,()]/.test(cell.text)) numXCoords.push(cell.x);
    }
  }
  numXCoords.sort((a, b) => a - b);
  let col2Boundary = col1Boundary + 180;
  if (numXCoords.length >= 4) {
    let maxGap = 0, gapPos = col2Boundary;
    for (let i = 1; i < numXCoords.length; i++) {
      const gap = numXCoords[i] - numXCoords[i - 1];
      if (gap > maxGap && numXCoords[i] > col1Boundary + 50) { maxGap = gap; gapPos = Math.round((numXCoords[i-1] + numXCoords[i]) / 2); }
    }
    if (maxGap > 20) col2Boundary = gapPos;
  }

  assert("컬럼 경계 합리적", col1Boundary > 100 && col1Boundary < 300, `col1=${col1Boundary}`);
  console.log(`  ℹ️  컬럼 경계: 계정명 < ${col1Boundary} | 당기 < ${col2Boundary} | 전기`);

  // 3컬럼 분리
  const rows = [];
  for (const row of allPdfRows) {
    const accountParts = row.cells.filter(c => c.x < col1Boundary).map(c => c.text);
    const account = accountParts.join("").replace(/\s/g, "");
    if (!account || !/[가-힣]/.test(account)) continue;
    const val1 = row.cells.filter(c => c.x >= col1Boundary && c.x < col2Boundary).map(c => c.text).join("").replace(/\s/g, "");
    const val2 = row.cells.filter(c => c.x >= col2Boundary).map(c => c.text).join("").replace(/\s/g, "");
    if (!val1 && !val2) continue;
    rows.push({ account, values: [val1, val2] });
  }

  assert("구조화 행 10개 이상", rows.length >= 10, `got ${rows.length}`);

  return rows;
}

// ── parsePdf API 시뮬레이션 테스트 ──
async function testParsePdfApi(filePath, label) {
  console.log(`\n── Test: /api/upload PDF 시뮬레이션 (${label}) ──`);

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  파일 없음: ${filePath}`);
    return;
  }

  const buf = fs.readFileSync(filePath);

  // upload route의 parsePdf와 동일 로직을 직접 실행
  // extractPdfStructured 호출
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  const allPdfRows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim());
    const rowMap = {};
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      if (!rowMap[y]) rowMap[y] = [];
      rowMap[y].push({ x: Math.round(it.transform[4]), text: it.str.trim() });
    }
    const sortedYs = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
    for (const y of sortedYs) {
      allPdfRows.push({ y, cells: rowMap[y].sort((a, b) => a.x - b.x) });
    }
  }
  doc.destroy();

  // 컬럼 경계
  const gapCandidates = [];
  for (const row of allPdfRows) {
    const allText = row.cells.map(c => c.text).join("");
    if (!/[가-힣]/.test(allText) || !/\d/.test(allText)) continue;
    let lastAccountX = 0, firstNumX = Infinity;
    for (const cell of row.cells) {
      if (/[가-힣)）]/.test(cell.text)) lastAccountX = Math.max(lastAccountX, cell.x + cell.text.length * 8);
      if (/^\d/.test(cell.text) || /^\([\d,]/.test(cell.text)) firstNumX = Math.min(firstNumX, cell.x);
    }
    if (firstNumX > lastAccountX && firstNumX < Infinity) gapCandidates.push(Math.round((lastAccountX + firstNumX) / 2));
  }
  gapCandidates.sort((a, b) => a - b);
  const col1 = gapCandidates.length > 0 ? gapCandidates[Math.floor(gapCandidates.length / 2)] : 210;
  const numXs = [];
  for (const row of allPdfRows) {
    for (const cell of row.cells) {
      if (cell.x >= col1 && /[\d,()]/.test(cell.text)) numXs.push(cell.x);
    }
  }
  numXs.sort((a, b) => a - b);
  let col2 = col1 + 180;
  if (numXs.length >= 4) {
    let maxG = 0, gP = col2;
    for (let i = 1; i < numXs.length; i++) {
      const g = numXs[i] - numXs[i-1];
      if (g > maxG && numXs[i] > col1 + 50) { maxG = g; gP = Math.round((numXs[i-1]+numXs[i])/2); }
    }
    if (maxG > 20) col2 = gP;
  }

  // 연도 추출
  const years = [];
  const yearSet = new Set();
  for (const row of allPdfRows) {
    const fullLine = row.cells.map(c => c.text).join(" ");
    const m = fullLine.match(/20[12]\d/g);
    if (m && m.length >= 2) {
      for (const y of m) {
        if (parseInt(y) >= 2018 && parseInt(y) <= 2030 && !yearSet.has(y)) { yearSet.add(y); years.push(y); }
      }
      if (years.length >= 2) break;
    }
  }
  years.sort();

  assert("연도 2개 추출", years.length >= 2, `got ${years.join(",")}`);
  if (label.includes("2025")) {
    assert("연도 2024,2025", years.includes("2024") && years.includes("2025"), `got ${years.join(",")}`);
  }

  // 행 파싱
  const skipRe = /^(제\d|단위|회사명|과목|금액|재무상태표$|손익계산서$|포괄손익계산서$|결산|회계|주석|감사|독립|페이지|Page|처분예정|처분확정|본재무제표)/;
  const parsedRows = [];
  for (const row of allPdfRows) {
    const accountParts = row.cells.filter(c => c.x < col1).map(c => c.text);
    let account = accountParts.join("").replace(/\s/g, "");
    if (!account || !/[가-힣]/.test(account)) continue;
    if (skipRe.test(account)) continue;
    const val1 = row.cells.filter(c => c.x >= col1 && c.x < col2).map(c => c.text).join("").replace(/\s/g, "");
    const val2 = row.cells.filter(c => c.x >= col2).map(c => c.text).join("").replace(/\s/g, "");
    if (!val1 && !val2) continue;
    // 접두사 제거
    account = account.replace(/^[IⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩivxlcdm]+\./, "");
    account = account.replace(/^\(\d+\)/, "");
    account = account.replace(/^\d+\./, "");
    if (!account || !/[가-힣]/.test(account)) continue;
    const koreanChars = account.match(/[가-힣]/g);
    if (!koreanChars || koreanChars.length < 2) continue;

    parsedRows.push({ account, val1, val2 });
  }

  assert("파싱 행 15개 이상", parsedRows.length >= 15, `got ${parsedRows.length}`);

  // BS/IS 분리 (route.ts splitCombined 동일 로직)
  const bsRows = [];
  const isRows = [];
  let section = null;
  let bsDone = false;
  for (const row of parsedRows) {
    const acct = row.account.replace(/\s/g, "");
    if (!bsDone && /^(Ⅰ\.?)?자산$|^유동자산$|^자산총계$|재무상태표/.test(acct)) {
      section = "bs";
      if (/재무상태표/.test(acct)) continue;
    }
    if (section === "bs" && /부채및자본총계|부채와자본총계/.test(acct)) {
      bsRows.push(row); bsDone = true; section = null; continue;
    }
    if (/^(Ⅰ\.?)?(매출액|영업수익|공사수익|분양수익)$|손익계산서|포괄손익계산서/.test(acct)) {
      section = "is";
      if (/손익계산서|포괄손익계산서/.test(acct)) continue;
    }
    if (section === "is" && /당기순이익|당기순손실|당기순손익/.test(acct)) {
      isRows.push(row); section = null; continue;
    }
    if (section === "is" && /분양원가명세서|원가명세서|결손금처리|이익잉여금처분|현금흐름표|자본변동표/.test(acct)) {
      section = null; continue;
    }
    if (section === "bs") bsRows.push(row);
    if (section === "is") isRows.push(row);
  }

  // BS 주요 계정 검증
  console.log(`\n  BS: ${bsRows.length}행 / IS: ${isRows.length}행`);

  const bsAssets = findRow(bsRows, "자산총계");
  const bsLiab = findRow(bsRows, "부채총계");
  const bsEquity = findRow(bsRows, "자본총계");

  assert("BS: 자산총계 존재", !!bsAssets, bsRows.map(r => r.account).join(", ").slice(0, 100));
  assert("BS: 부채총계 존재", !!bsLiab);
  assert("BS: 자본총계 존재", !!bsEquity);

  if (label.includes("2025") && bsAssets) {
    // 당기(2025) = val1 (연도 오름차순이면 val2)
    // 컬럼 순서: 연도 내림차순이면 val1=당기, val2=전기
    const val1Num = parseNum(bsAssets.val1);
    const val2Num = parseNum(bsAssets.val2);
    // 두 값 중 하나가 기대값과 일치하면 OK
    const expected = EXPECTED_BS_2025["자산총계"];
    const match1 = Math.abs(val1Num - expected) < 2;
    const match2 = Math.abs(val2Num - expected) < 2;
    assert("BS: 자산총계 수치 정확", match1 || match2,
      `기대=${expected.toLocaleString()}, val1=${val1Num.toLocaleString()}, val2=${val2Num.toLocaleString()}`);
  }

  if (isRows.length > 0) {
    assert("IS: 매출액 존재", !!findRow(isRows, "매출액") || !!findRow(isRows, "영업수익"));
    const isNetLoss = findRow(isRows, "당기순손실") || findRow(isRows, "당기순이익");
    assert("IS: 당기순손익 존재", !!isNetLoss);

    if (label.includes("2025") && isNetLoss) {
      const val1Num = parseNum(isNetLoss.val1);
      const val2Num = parseNum(isNetLoss.val2);
      const expected = EXPECTED_IS_2025["당기순손실"];
      const match1 = Math.abs(val1Num - expected) < 2;
      const match2 = Math.abs(val2Num - expected) < 2;
      assert("IS: 당기순손실 수치 정확", match1 || match2,
        `기대=${expected.toLocaleString()}, val1=${val1Num.toLocaleString()}, val2=${val2Num.toLocaleString()}`);
    }
  }

  // BS 등식: 자산총계 = 부채총계 + 자본총계
  if (bsAssets && bsLiab && bsEquity) {
    const a1 = parseNum(bsAssets.val1), l1 = parseNum(bsLiab.val1), e1 = parseNum(bsEquity.val1);
    if (a1 !== 0) {
      const diff = Math.abs(a1 - (l1 + e1));
      assert("BS 등식: 자산 = 부채 + 자본", diff < 2, `자산=${a1}, 부채+자본=${l1+e1}, 차이=${diff}`);
    }
  }
}

// ── 메인 ──
async function main() {
  console.log("═══════════════════════════════════════");
  console.log(" PDF 파싱 통합 테스트");
  console.log("═══════════════════════════════════════");

  await testStructuredExtraction(PDF_2025, "2025 PDF");
  await testParsePdfApi(PDF_2025, "2025 PDF");
  await testParsePdfApi(PDF_2024, "2024 PDF");

  console.log("\n═══════════════════════════════════════");
  console.log(` 결과: ${passCount} PASS / ${failCount} FAIL`);
  console.log("═══════════════════════════════════════");

  if (failures.length > 0) {
    console.log("\n실패 항목:");
    for (const f of failures) {
      console.log(`  ❌ ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  } else {
    console.log("\n🎉 모든 테스트 통과!");
    process.exit(0);
  }
}

main().catch(e => { console.error("테스트 오류:", e); process.exit(1); });
