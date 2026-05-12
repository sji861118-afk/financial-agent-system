// Full audit report parsing test for 무림캐피탈 - mirrors actual parseOneAuditXml + mergeAuditResults
import fs from 'fs';
import JSZip from 'jszip';

const key = fs.readFileSync('.env.local','utf8').match(/DART_API_KEY=(.+)/)[1].trim();
const DART_API_BASE = "https://opendart.fss.or.kr/api";

function toMillions(val) {
  if (!val || val.trim() === "" || val.trim() === "-") return "-";
  const cleaned = val.replace(/,/g, "").replace(/\s/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return val;
  const m = num / 1_000_000;
  if (Math.abs(m) >= 1) return m.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  if (m === 0) return "-";
  return m.toFixed(1);
}

function parseAuditNum(s) {
  if (!s || s.trim() === "-" || s.trim() === "" || s.trim() === "0") return 0;
  let str = s.trim();
  const neg = (str.startsWith("(") && str.endsWith(")")) || str.includes("△");
  str = str.replace(/[(),△\s]/g, "").replace(/,/g, "");
  const v = parseFloat(str);
  if (isNaN(v)) return 0;
  return neg ? -v : v;
}

function normalizeAcct(s) {
  let n = s.replace(/\s/g, "");
  n = n.replace(/^[IⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩivxlcdm\d]+[.·\s]+/, "");
  n = n.replace(/^\(\d+\)/, "");
  n = n.replace(/\(주석?[\d,\s]*\)/g, "");
  return n;
}

function isExcludedAccount(nm) {
  return /주당이익|주당손실|주당순이익|주당순손실/.test(nm.replace(/\s/g, ""));
}

// Exact copy of parseOneAuditXml logic
async function parseOneAuditXml(rceptNo, targetYear) {
  const params = new URLSearchParams({ crtfc_key: key, rcept_no: rceptNo });
  const res = await fetch(`${DART_API_BASE}/document.xml?${params}`);
  const rawBuf = Buffer.from(await res.arrayBuffer());
  if (rawBuf[0] !== 0x50 || rawBuf[1] !== 0x4B) return null;

  const zip = await JSZip.loadAsync(rawBuf);
  const firstFile = Object.keys(zip.files)[0];
  const content = await zip.files[firstFile].async("string");

  const trMatches = content.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];
  const allRows = [];
  for (const tr of trMatches) {
    const cellMatches = tr.match(/<(?:TD|TH|TE)[^>]*>[\s\S]*?(?=<(?:TD|TH|TE)|<\/TR)/gi) || [];
    const rowCells = [];
    for (const cell of cellMatches) {
      const colspanMatch = cell.match(/colspan\s*=\s*["']?(\d+)/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1]) : 1;
      const clean = cell.replace(/<[^>]*>/g, "").trim().replace(/\s+/g, " ");
      rowCells.push(clean);
      for (let ci = 1; ci < colspan; ci++) rowCells.push("");
    }
    if (rowCells.length) allRows.push(rowCells);
  }

  const bsItems = [];
  let section = null;
  let bsCompleted = false;
  let isCompleted = false;
  let columnOrderReversed = false;

  for (const row of allRows) {
    const text = row.join("").replace(/\s/g, "");
    const first = row[0]?.replace(/\s/g, "") || "";

    if (!bsCompleted && /제\d+.*기|당기|전기|당\s*기|전\s*기/.test(text) && !/매출|영업|자산|부채|당기손익|기타포괄/.test(text)) {
      const joined = row.join(" ");
      const curIdx = joined.search(/당기|제\s*\d+\s*\(당\)|제\s*\d+\s*기/);
      const prevIdx = joined.search(/전기|제\s*\d+\s*\(전\)/);
      if (curIdx >= 0 && prevIdx >= 0 && prevIdx < curIdx) {
        columnOrderReversed = true;
      }
    }

    if (/현금흐름표|이익잉여금처분|자본변동표/.test(text)) {
      if (section === "is") isCompleted = true;
      section = null;
    }
    if (/별첨.*주석은|별첨\s*주석은/.test(row[0] || "")) {
      if (section === "bs") bsCompleted = true;
      section = null;
    }

    if (row.length < 2) continue;
    if (bsCompleted && isCompleted) continue;

    if (!bsCompleted) {
      if (first === "자산" && !first.includes("총계")) { section = "bs"; continue; }
      if (text.startsWith("자산") && !text.startsWith("자산총계")) { section = "bs"; continue; }
      if ((first === "자산총계" || first === "자산합계") && section !== "bs") { section = "bs"; }
    }

    if (/부채와자본총계|부채및자본총계|부채와순자산총계/.test(text)) {
      if (section === "bs") {
        const nums = row.slice(1).filter(c => { const ct = c.trim(); if (/^\d{1,2}(,\s*\d{1,2})*$/.test(ct)) return false; return /\d{3,}/.test(ct) || ct === "-" || /^[\s(]*0[\s)]*$/.test(ct); });
        if (nums.length) bsItems.push([row[0].trim(), nums]);
        bsCompleted = true;
        section = "bs_done";
        continue;
      }
    }

    if (section !== "bs") continue;
    const nums = [];
    for (const c of row.slice(1)) {
      const ct = c.trim();
      if (/^\d{1,2}(,\s*\d{1,2})*$/.test(ct)) continue;
      if (/\d{3,}/.test(ct) || ct === "-" || /^[\s(]*0[\s)]*$/.test(ct)) nums.push(ct);
    }
    if (!nums.length) continue;
    const acctName = row[0].trim();
    if (!acctName || /^\d+$/.test(acctName.replace(/\s/g, ""))) continue;
    bsItems.push([acctName, nums]);
  }

  if (!bsItems.length) return null;

  const prevYear = String(parseInt(targetYear) - 1);

  function detectTypicalCols(items) {
    const freq = {};
    for (const [, nums] of items) {
      if (nums.length >= 2) freq[nums.length] = (freq[nums.length] || 0) + 1;
    }
    const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    return best ? parseInt(best[0]) : 2;
  }

  function extractTwoYears(items, yrCur, yrPrev, reversed) {
    const typicalCols = detectTypicalCols(items);
    const rows = [];
    for (const [acct, nums] of items) {
      const acctClean = normalizeAcct(acct);
      if (isExcludedAccount(acctClean)) continue;
      const row = { account: acctClean };
      let v1, v2;

      if (typicalCols >= 4 && nums.length >= 4) {
        const pick = (a, b) => {
          if (a && a !== "" && a !== "-" && /\d/.test(a)) return a;
          if (b && b !== "" && b !== "-" && /\d/.test(b)) return b;
          return a || b || "-";
        };
        v1 = pick(nums[0], nums[1]);
        v2 = pick(nums[2], nums[3]);
      } else if (nums.length >= 2) {
        v1 = nums[0]; v2 = nums[1];
      } else if (nums.length === 1) {
        v1 = nums[0]; v2 = "-";
      } else continue;

      const curVal = reversed ? v2 : v1;
      const prevVal = reversed ? v1 : v2;

      row[yrCur] = toMillions(String(parseAuditNum(curVal) || 0));
      row[yrPrev] = toMillions(String(parseAuditNum(prevVal) || 0));
      rows.push(row);
    }
    return rows;
  }

  console.log(`  [${targetYear}] typicalCols=${detectTypicalCols(bsItems)} reversed=${columnOrderReversed} items=${bsItems.length}`);

  return {
    bsRows: extractTwoYears(bsItems, targetYear, prevYear, columnOrderReversed),
    years: [targetYear, prevYear],
  };
}

// Exact copy of mergeAuditResults
function mergeAuditResults(accumulated, parsed) {
  function mergeRows(accRows, newRows, years) {
    const usedIndices = new Set();
    for (let ni = 0; ni < newRows.length; ni++) {
      const newRow = newRows[ni];
      let targetOcc = 0;
      for (let j = 0; j < ni; j++) {
        if (newRows[j].account === newRow.account) targetOcc++;
      }
      let matchIdx = -1;
      let occ = 0;
      for (let i = 0; i < accRows.length; i++) {
        if (usedIndices.has(i)) continue;
        if (accRows[i].account === newRow.account) {
          if (occ === targetOcc) { matchIdx = i; break; }
          occ++;
        }
      }
      if (matchIdx >= 0) {
        usedIndices.add(matchIdx);
        for (const y of years) {
          if (!accRows[matchIdx][y] && newRow[y]) accRows[matchIdx][y] = newRow[y];
        }
      } else {
        accRows.push(newRow);
      }
    }
  }

  if (!accumulated.bsRows.length) {
    accumulated.bsRows = parsed.bsRows;
  } else {
    mergeRows(accumulated.bsRows, parsed.bsRows, parsed.years);
  }
  for (const y of parsed.years) {
    if (!accumulated.dataYears.includes(y)) accumulated.dataYears.push(y);
  }
}

// Main
(async () => {
  const params = new URLSearchParams({
    crtfc_key: key, corp_code: '00790547',
    bgn_de: '20200101', end_de: '20261231',
    pblntf_ty: 'F', page_count: '50'
  });
  const r = await fetch(`${DART_API_BASE}/list.json?${params}`);
  const d = await r.json();

  const ofsMap = {};
  for (const it of d.list || []) {
    const nm = it.report_nm || "";
    if (nm.includes("제출") || nm.includes("연결")) continue;
    if (!nm.includes("감사보고서")) continue;
    const m = nm.match(/\((\d{4})/);
    if (!m) continue;
    if (!ofsMap[m[1]]) ofsMap[m[1]] = it.rcept_no;
  }

  const ofsYears = Object.keys(ofsMap);
  console.log('Reports found:', ofsYears.sort());

  const acc = { bsRows: [], dataYears: [] };

  for (const yr of ofsYears.sort().reverse()) {
    console.log(`\nParsing ${yr} report...`);
    const parsed = await parseOneAuditXml(ofsMap[yr], yr);
    if (parsed) {
      mergeAuditResults(acc, parsed);
      // Show 자산총계 after merge
      const total = parsed.bsRows.find(r => r.account?.includes('자산총계'));
      if (total) console.log(`  Parsed 자산총계: ${JSON.stringify(total)}`);
    } else {
      console.log(`  FAILED to parse`);
    }
  }

  acc.dataYears = [...new Set(acc.dataYears)].sort();
  console.log('\n=== FINAL RESULT ===');
  console.log('dataYears:', acc.dataYears);

  const assetTotal = acc.bsRows.find(r => r.account?.includes('자산총계'));
  if (assetTotal) {
    console.log('자산총계:', JSON.stringify(assetTotal));
  }
  const debtTotal = acc.bsRows.find(r => r.account?.includes('부채총계'));
  if (debtTotal) {
    console.log('부채총계:', JSON.stringify(debtTotal));
  }
})();
