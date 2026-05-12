// Quick test for 무림캐피탈 audit report parsing
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
  if (!s || s.trim() === "-" || s.trim() === "") return 0;
  let str = s.trim();
  const neg = str.startsWith("(") && str.endsWith(")") || str.startsWith("△");
  str = str.replace(/[(),△\s]/g, "").replace(/,/g, "");
  const v = parseFloat(str);
  if (isNaN(v)) return 0;
  return neg ? -v : v;
}

async function parseOneAuditXml(rceptNo, targetYear) {
  const params = new URLSearchParams({ crtfc_key: key, rcept_no: rceptNo });
  const res = await fetch(`${DART_API_BASE}/document.xml?${params}`);
  const rawBuf = Buffer.from(await res.arrayBuffer());
  if (rawBuf[0] !== 0x50 || rawBuf[1] !== 0x4B) return null;

  const zip = await JSZip.loadAsync(rawBuf);
  const firstFile = Object.keys(zip.files)[0];
  const content = await zip.files[firstFile].async("string");

  const trMatches = content.match(/<TR[^>]*>[\s\S]*?<\/TR>/gi) || [];
  const bsItems = [];
  let section = null;
  let bsCompleted = false;
  let columnOrderReversed = false;

  for (const tr of trMatches) {
    const cells = tr.match(/<(?:TD|TH|TE)[^>]*>[\s\S]*?(?=<(?:TD|TH|TE)|<\/TR)/gi) || [];
    const row = [];
    for (const cell of cells) {
      const colspanMatch = cell.match(/colspan\s*=\s*["']?(\d+)/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1]) : 1;
      const clean = cell.replace(/<[^>]*>/g, "").trim().replace(/\s+/g, " ");
      row.push(clean);
      for (let ci = 1; ci < colspan; ci++) row.push("");
    }
    if (!row.length) continue;

    const text = row.join("").replace(/\s/g, "");
    const first = row[0]?.replace(/\s/g, "") || "";

    // Header detection
    if (/제\d+.*기|당기|전기/.test(text) && !/매출|영업|자산|부채/.test(text)) {
      const joined = row.join(" ");
      const curIdx = joined.search(/당기|제\s*\d+\s*\(당\)|제\s*\d+\s*기/);
      const prevIdx = joined.search(/전기|제\s*\d+\s*\(전\)/);
      if (curIdx >= 0 && prevIdx >= 0 && prevIdx < curIdx) {
        columnOrderReversed = true;
      }
    }

    if (/부채와자본총계|부채및자본총계/.test(text)) {
      if (section === "bs") {
        const nums = row.slice(1).filter(c => { const ct = c.trim(); if (/^\d{1,2}(,\s*\d{1,2})*$/.test(ct)) return false; return /\d{3,}/.test(ct) || ct === "-"; });
        if (nums.length) bsItems.push([row[0].trim(), nums]);
        bsCompleted = true;
        break;
      }
    }

    if (!bsCompleted) {
      if (first === "자산" || text.startsWith("자산") && !text.startsWith("자산총계")) { section = "bs"; continue; }
      if (first === "자산��계" && section !== "bs") section = "bs";
    }

    if (section !== "bs" || row.length < 2) continue;

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

  const prevYear = String(parseInt(targetYear) - 1);

  // Extract key rows
  console.log(`\n=== ${targetYear} report (columnReversed=${columnOrderReversed}) ===`);
  for (const [acct, nums] of bsItems) {
    if (acct.includes('자산총계') || acct.includes('부채총계') || acct.includes('자본총계')) {
      const v1 = nums[0], v2 = nums.length >= 2 ? nums[1] : '-';
      const curVal = columnOrderReversed ? v2 : v1;
      const prevVal = columnOrderReversed ? v1 : v2;
      console.log(`${acct}: raw=[${nums.join(' | ')}] → ${targetYear}=${toMillions(String(parseAuditNum(curVal)))} ${prevYear}=${toMillions(String(parseAuditNum(prevVal)))}`);
    }
  }
}

(async () => {
  // Get report list
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
    const m = nm.match(/\((\d{4})/);
    if (!m) continue;
    if (!ofsMap[m[1]]) ofsMap[m[1]] = it.rcept_no;
  }

  console.log('Found reports:', Object.keys(ofsMap).sort());

  for (const yr of Object.keys(ofsMap).sort().reverse()) {
    if (parseInt(yr) >= 2021 && parseInt(yr) <= 2025) {
      await parseOneAuditXml(ofsMap[yr], yr);
    }
  }
})();
