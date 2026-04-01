/**
 * 감정평가서 파서 v2 통합 테스트
 * 에이엠플러스인덕원 감정평가서 PDF 기반 20개 검증포인트
 * Usage: node test-appraisal-v2.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const PDF_PATH = resolve("../_reference/2.감정평가서 샘플/에이엠플러스인덕원_감정평가서 C32508-2-1401 DRAFT(170개호)_1 (1).pdf");

// pdf-parse로 텍스트 추출
const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
const buffer = readFileSync(PDF_PATH);
const data = await pdfParse(buffer);
const lines = data.text.replace(/\u0000/g, " ").split(/\n/).filter(l => l.trim().length > 0);

console.log(`\n${"=".repeat(60)}`);
console.log(`감정평가서 파서 v2 통합 테스트`);
console.log(`PDF: ${lines.length}줄, ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
console.log(`${"=".repeat(60)}\n`);

// ── 유틸 함수 (파서에서 복제) ──
function parseNum(raw) {
  if (!raw || raw === "-" || raw === "—" || raw === "·") return null;
  let s = raw.replace(/[\s,]/g, "");
  s = s.replace(/^[\\₩￦]/, "");
  const negative = (s.startsWith("(") && s.endsWith(")")) || s.startsWith("-");
  s = s.replace(/[()\\₩￦\-]/g, "").replace(/[^\d.]/g, "");
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

function extractDate(text) {
  const m = text.match(/(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*일?/);
  if (m) return `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
  return null;
}

function findLineIndex(lines, pattern, startFrom = 0) {
  for (let i = startFrom; i < lines.length; i++) {
    if (pattern.test(lines[i].replace(/\s/g, ""))) return i;
  }
  return -1;
}

function isPageHeader(line) {
  const c = line.replace(/\s/g, "");
  return /^감정평가액의산출근거및결정의견$/.test(c) ||
    /^\d{1,3}감정평가액의산출근거및결정의견$/.test(c) ||
    /^구분건물감정평가명세표$/.test(c);
}

function extractInlineKV(line, keys) {
  const result = {};
  const positions = [];
  for (const key of keys) {
    const idx = line.indexOf(key);
    if (idx >= 0) positions.push({ key, idx });
  }
  positions.sort((a, b) => a.idx - b.idx);
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx + positions[i].key.length;
    const end = i + 1 < positions.length ? positions[i + 1].idx : line.length;
    const val = line.slice(start, end).trim();
    if (val) result[positions[i].key] = val;
  }
  return result;
}

// ── 테스트 실행 ──
const results = [];
function check(name, actual, expected, compareFn) {
  let pass;
  if (compareFn) {
    pass = compareFn(actual, expected);
  } else {
    pass = actual === expected;
  }
  results.push({ name, pass, actual, expected });
  return pass;
}

// ── 1. 기본정보 ──
console.log("▶ 1. 기본정보 추출");

// 일련번호
let serialNo = null;
for (let i = 0; i < 20; i++) {
  const m = lines[i]?.match(/([A-Z]?\d{3,6}-\d{1,2}-\d{3,5})/);
  if (m) { serialNo = m[1]; break; }
}
check("일련번호", serialNo, "C32508-2-1401");

// 평가기관
let appraiser = null;
for (let i = 0; i < 20; i++) {
  if (/감정평가법인/.test(lines[i])) { appraiser = lines[i].trim(); break; }
}
check("평가기관", appraiser, "(주)태평양감정평가법인");

// 감정평가액
let appraisalValue = null;
for (let i = 0; i < 120; i++) {
  const cleaned = lines[i].replace(/\s/g, "");
  const m = cleaned.match(/[\\₩￦]([\d,]+)/);
  if (m) {
    const v = parseNum(m[1]);
    if (v && v > 1_000_000) { appraisalValue = v; break; }
  }
}
check("감정평가액", appraisalValue, 78022000000);

// 기준시점 (line 80+ 에서 스캔, 20XX년도만)
let baseDate = null;
for (let i = 80; i < 120; i++) {
  const d = extractDate(lines[i]);
  if (d && d.startsWith("20")) { baseDate = d; break; }
}
check("기준시점", baseDate, "2025.08.18");

// 소유자 (담보가치분석총괄표 근처)
let owner = null;
const ownerIdx = findLineIndex(lines, /소\s*유\s*자/);
if (ownerIdx >= 0) {
  for (let j = ownerIdx + 1; j < ownerIdx + 3; j++) {
    const next = lines[j]?.trim();
    if (next && !/채무자|감정평가|물건종류/.test(next) && next.length > 2) {
      owner = next; break;
    }
  }
}
check("소유자", owner, null, (a) => a && a.includes("에이엠플러스"));

// 위탁자
let trustee = null;
for (let i = 25; i < 60; i++) {
  if (/신탁/.test(lines[i]) && /주/.test(lines[i])) {
    trustee = lines[i].trim(); break;
  }
}
check("위탁자", trustee, null, (a) => a && a.includes("우리자산신탁"));

// ── 2. 호실별 감정가 (비준가액 테이블) ──
console.log("\n▶ 2. 호실별 감정가 추출");

// 비준가액 테이블 찾기
let unitTableStart = -1;
for (let i = 0; i < lines.length; i++) {
  const c = lines[i].replace(/\s/g, "");
  if (c.includes("비준가액") && c.includes("절사")) {
    unitTableStart = i;
    break;
  }
}
check("비준가액 테이블 발견", unitTableStart > 0, true);

// 실제 호실 추출
const units = [];
if (unitTableStart > 0) {
  let i = unitTableStart;
  while (i < lines.length) {
    if (isPageHeader(lines[i]) || /^\[비준가액|^\[적용단가|^일련$|^번호$/.test(lines[i].trim()) ||
        /^층·호/.test(lines[i].replace(/\s/g, ""))) {
      i++; continue;
    }
    // 수익방식 도달 시 종료
    if (/수익방식의\s*적용|수익환원법/.test(lines[i].replace(/\s/g, ""))) break;
    if (/감정평가액\s*결정/.test(lines[i].replace(/\s/g, "")) && !/산출근거/.test(lines[i])) break;

    const numMatch = lines[i].trim().match(/^(\d{1,3})$/);
    if (numMatch) {
      const no = parseInt(numMatch[1]);
      if (no >= 1 && no <= 999) {
        let floor = "", unit = "";
        let j = i + 1;
        // 층 찾기
        while (j < Math.min(i + 5, lines.length)) {
          const fm = lines[j].trim().match(/제\s*(\d{1,2})\s*층/);
          if (fm) { floor = `${fm[1]}층`; j++; break; }
          j++;
        }
        // 호 + 숫자 찾기
        while (j < Math.min(i + 8, lines.length)) {
          const line = lines[j].trim();
          const um = line.match(/제\s*(.+?)\s*호/);
          if (um) {
            unit = um[1].replace(/\s+/g, "").replace(/^제/, "") + "호";
            const afterUnit = line.replace(/.*호/, "").trim();
            const nums = afterUnit.match(/[\d,.]+/g);
            let parsedFromLine = false;
            if (nums && nums.length >= 2) {
              const parsed = nums.map(n => parseNum(n)).filter(n => n !== null && n > 0);
              let areaSqm = 0, apprVal = 0;
              for (const n of parsed) {
                if (n < 500 && areaSqm === 0) areaSqm = n;
                else if (n > 100_000_000 && apprVal === 0) apprVal = n;
              }
              if (apprVal > 0) {
                units.push({ no, floor, unit: `${floor} ${unit}`, areaSqm, appraisalValue: apprVal });
                parsedFromLine = true;
              }
            }
            // 숫자가 다음 줄에 있는 경우
            if (!parsedFromLine && j + 1 < lines.length) {
              const nextNums = lines[j + 1].trim().match(/[\d,.]+/g);
              if (nextNums && nextNums.length >= 2) {
                const parsed = nextNums.map(n => parseNum(n)).filter(n => n !== null && n > 0);
                let areaSqm = 0, apprVal = 0;
                for (const n of parsed) {
                  if (n < 500 && areaSqm === 0) areaSqm = n;
                  else if (n > 100_000_000 && apprVal === 0) apprVal = n;
                }
                if (apprVal > 0) {
                  units.push({ no, floor, unit: `${floor} ${unit}`, areaSqm, appraisalValue: apprVal });
                }
                j++;
              }
            }
            i = j + 1;
            break;
          }
          j++;
        }
        if (j >= Math.min(i + 8, lines.length)) i = j;
        continue;
      }
    }
    i++;
  }
}

const unitTotal = units.reduce((s, u) => s + u.appraisalValue, 0);
check("호실 수", units.length, 170);
check("호실 합계", unitTotal, 78022000000, (a, e) => Math.abs(a - e) < 1_000_000_000); // 10% 허용
if (units.length > 0) {
  check("1번 호실 면적", units[0]?.areaSqm, 55.02, (a, e) => Math.abs(a - e) < 1);
}
if (units.length >= 170) {
  check("170번 비준가액", units[169]?.appraisalValue, 478000000);
}

// ── 3. 비준사례 ──
console.log("\n▶ 3. 비준사례 건물 추출");

const buildingStarts = [];
let curCategory = "";
for (let i = 0; i < lines.length; i++) {
  const cleaned = lines[i].replace(/\s/g, "");
  const catMatch = cleaned.match(/^\d+\.\s*(근린생활시설|공장|지식산업센터).*사례/);
  if (catMatch) curCategory = catMatch[1];
  const bm = lines[i].match(/사례\s*([A-Z])\s*[:：]\s*(.+)/);
  if (bm && curCategory) buildingStarts.push({ idx: i, label: bm[2].trim(), category: curCategory });
}
check("비준사례 건물 수", buildingStarts.length, null, (a) => a >= 4);

// 건물 A 상세 확인
if (buildingStarts.length > 0) {
  const bStart = buildingStarts[0].idx;
  let landArea = 0;
  for (let i = bStart; i < Math.min(bStart + 15, lines.length); i++) {
    const m = lines[i].replace(/\s/g, "").match(/대지면적\(㎡\)([\d,.]+)/);
    if (m) { landArea = parseNum(m[1]); break; }
  }
  check("건물A 대지면적", landArea, 14674.4, (a, e) => Math.abs(a - e) < 1);
}

// ── 4. 경매통계 ──
console.log("\n▶ 4. 경매통계 인용");

const auctionIdx = findLineIndex(lines, /경매통계/);
const auctionRows = [];
if (auctionIdx >= 0) {
  for (let i = auctionIdx + 3; i < Math.min(auctionIdx + 15, lines.length); i++) {
    if (/출처|인포케어/.test(lines[i])) break;
    const usageMatch = lines[i].match(/^(근린상가|아파트형공장)/);
    if (usageMatch) {
      // 숫자가 공백 없이 연결됨: "4,083,000,0002,435,194,00059.6241041.7"
      // 큰 숫자(총감정가, 총낙찰가)는 자릿수로 분리: 10자리+ 패턴
      const numStr = lines[i].replace(usageMatch[1], "");
      // 콤마 포함 숫자 패턴으로 2개 큰 수 먼저 추출
      const bigNums = numStr.match(/\d{1,3}(,\d{3}){2,}/g) || [];
      // 나머지에서 소수점 포함 숫자
      let rest = numStr;
      for (const bn of bigNums) rest = rest.replace(bn, "|");
      const smallNums = rest.split("|").join("").match(/[\d.]+/g) || [];
      const allParsed = [...bigNums.map(n => parseNum(n)), ...smallNums.map(n => parseNum(n))].filter(n => n !== null);
      if (allParsed.length >= 3) {
        auctionRows.push({ usage: usageMatch[1], bidRate: allParsed[2] });
      }
    }
  }
}
check("경매통계 행 수", auctionRows.length, 2);
if (auctionRows.length >= 1) {
  check("근린상가 낙찰가율", auctionRows[0]?.bidRate, 59.62, (a, e) => Math.abs(a - e) < 1);
}

// ── 5. 시산가액 결정 ──
console.log("\n▶ 5. 시산가액 검토 + 결정");

const checkIdx = findLineIndex(lines, /시산가액\s*검토/);
let compTotal = 0, incomeTotal = 0;
if (checkIdx >= 0) {
  for (let i = checkIdx; i < Math.min(checkIdx + 300, lines.length); i++) {
    const cleaned = lines[i].replace(/\s/g, "");
    if (/소계/.test(cleaned)) {
      // "소계78,022,000,00080,640,000,000" — 콤마 포함 큰 수 추출
      const bigNums = cleaned.match(/\d{1,3}(,\d{3}){2,}/g);
      if (bigNums && bigNums.length >= 2) {
        compTotal = parseNum(bigNums[0]) || 0;
        incomeTotal = parseNum(bigNums[1]) || 0;
        break;
      }
    }
  }
}
check("비교방식 합계", compTotal, 78022000000);
check("수익방식 합계", incomeTotal, 80640000000);

const decisionIdx = findLineIndex(lines, /감정평가액\s*결정/, checkIdx > 0 ? checkIdx : 4000);
let finalValue = 0;
if (decisionIdx >= 0) {
  for (let i = decisionIdx; i < Math.min(decisionIdx + 20, lines.length); i++) {
    const cleaned = lines[i].replace(/\s/g, "");
    if (/합계/.test(cleaned)) {
      const nums = cleaned.match(/[\d,]{10,}/g);
      if (nums) { finalValue = parseNum(nums[0]) || 0; break; }
    }
  }
}
check("최종결정 감정평가액", finalValue, 78022000000);

// ── 6. 대상물건 개요 ──
console.log("\n▶ 6. 대상물건 개요");

const overviewIdx = findLineIndex(lines, /대상물건\s*개요/);
let buildingName = "", completionDate = "";
if (overviewIdx >= 0) {
  for (let i = overviewIdx; i < Math.min(overviewIdx + 10, lines.length); i++) {
    const c = lines[i].replace(/\s/g, "");
    if (c.includes("건물명") || c.includes("물명")) {
      const kv = extractInlineKV(c, ["소재지", "건물명"]);
      if (kv["건물명"]) buildingName = kv["건물명"];
    }
    if (c.includes("사용승인일")) {
      const m = c.match(/사용승인일([\d.]+)/);
      if (m) completionDate = m[1];
    }
  }
}
check("건물명", buildingName, null, (a) => a && a.includes("AK") && a.includes("밸리"));
check("사용승인일", completionDate, "2025.01.10");

// ── 결과 요약 ──
console.log(`\n${"=".repeat(60)}`);
const passed = results.filter(r => r.pass).length;
const total = results.length;
for (const r of results) {
  const mark = r.pass ? "✓" : "✗";
  const actual = typeof r.actual === "number" ? r.actual.toLocaleString() : r.actual;
  const expected = typeof r.expected === "number" ? r.expected.toLocaleString() :
    (r.expected === null ? "(custom)" : r.expected);
  console.log(`  ${mark} ${r.name}: ${actual} ${r.pass ? "" : `(expected: ${expected})`}`);
}
console.log(`\n결과: ${passed}/${total} 통과 (${Math.round(passed/total*100)}%)`);
console.log(`${"=".repeat(60)}`);

if (passed < total) process.exit(1);
