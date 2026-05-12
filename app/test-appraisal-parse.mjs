/**
 * 감정평가서 PDF 파싱 테스트 스크립트 (pdf-parse 사용)
 * Usage: node test-appraisal-parse.mjs <pdf-path> [--full]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import pdfParseMod from "pdf-parse/lib/pdf-parse.js";

const pdfPath = process.argv[2];
const showFull = process.argv.includes("--full");
if (!pdfPath) {
  console.error("Usage: node test-appraisal-parse.mjs <pdf-path> [--full]");
  process.exit(1);
}

const buffer = readFileSync(resolve(pdfPath));
console.log(`\n=== PDF 파일: ${pdfPath} (${(buffer.length / 1024 / 1024).toFixed(1)}MB) ===\n`);

// ── Step 1: pdf-parse로 텍스트 추출 ──
console.log("▶ Step 1: pdf-parse 텍스트 추출...");
const data = await pdfParseMod(buffer);
const text = data.text || "";
const lines = text.split(/\n/).filter(l => l.trim().length > 0);
console.log(`  총 페이지: ${data.numpages}`);
console.log(`  추출된 줄: ${lines.length}`);
console.log(`  텍스트 길이: ${text.length}자`);

// ── Step 2: 처음 200줄 출력 ──
console.log("\n▶ Step 2: 처음 200줄 미리보기");
console.log("─".repeat(100));
const previewLimit = showFull ? lines.length : 200;
for (let i = 0; i < Math.min(previewLimit, lines.length); i++) {
  console.log(`[${String(i).padStart(5)}] ${lines[i]}`);
}
if (!showFull && lines.length > 200) {
  console.log(`  ... (${lines.length - 200}줄 생략, --full 옵션으로 전체 보기)`);
}
console.log("─".repeat(100));

// ── Step 3: 핵심 키워드 탐색 ──
console.log("\n▶ Step 3: 섹션 키워드 위치 탐색");
const keywords = [
  "감정평가서", "감정평가액", "감정평가", "평가개요", "담보물",
  "소유자", "위탁자", "평가기관", "채무자", "의뢰인", "기준시점", "가격시점",
  "비준사례", "거래사례", "평가사례", "사례비교",
  "공급개요", "사업개요", "사업현황", "최초공급",
  "담보상세", "담보세대", "상세담보", "당행담보", "담보현황",
  "비교방식", "원가방식", "수익방식",
  "소재지", "용도지역", "대지면적", "연면적", "건축면적",
  "시행사", "시공사", "준공", "사용승인",
  "호실", "면적", "평단가", "분양가", "감정가",
  "토지", "건물", "구분소유", "집합건물",
  "평가액", "시산가액", "결정가액",
];

for (const kw of keywords) {
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(kw)) {
      matches.push(i);
    }
  }
  if (matches.length > 0) {
    console.log(`  "${kw}" → 줄 ${matches.slice(0, 8).join(", ")}${matches.length > 8 ? ` (+${matches.length - 8}건)` : ""}`);
  }
}

// ── Step 4: 핵심 키워드 주변 맥락 ──
const importantKws = ["감정평가액", "감정평가서", "소유자", "의뢰인", "기준시점", "가격시점",
  "비준사례", "거래사례", "공급개요", "사업개요", "담보현황", "담보상세",
  "시산가액", "결정가액", "비교방식", "원가방식", "수익방식",
  "호실", "평단가", "대지면적", "연면적"];
console.log("\n▶ Step 4: 핵심 키워드 주변 맥락 (±5줄)");
const shownContexts = new Set();
for (const kw of importantKws) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(kw) && !shownContexts.has(i)) {
      shownContexts.add(i);
      console.log(`\n  ── "${kw}" at line ${i} ──`);
      for (let j = Math.max(0, i - 5); j <= Math.min(lines.length - 1, i + 5); j++) {
        const marker = j === i ? ">>>" : "   ";
        shownContexts.add(j);
        console.log(`  ${marker} [${String(j).padStart(5)}] ${lines[j].substring(0, 140)}`);
      }
      break; // 각 키워드 첫 번째 매칭만
    }
  }
}

// ── Step 5: 테이블 행 탐지 ──
console.log("\n▶ Step 5: 테이블 패턴 탐지 (숫자 3개 이상 포함 행)");
let tableCount = 0;
for (let i = 0; i < lines.length; i++) {
  const numMatches = lines[i].match(/[\d,]{4,}/g);
  if (numMatches && numMatches.length >= 3) {
    if (tableCount < 40) {
      console.log(`  [${String(i).padStart(5)}] ${lines[i].substring(0, 160)}`);
    }
    tableCount++;
  }
}
console.log(`  총 ${tableCount}개 테이블 행 감지`);

// ── Step 6: 마지막 100줄 (후반부 구조) ──
if (lines.length > 200) {
  console.log("\n▶ Step 6: 마지막 100줄 미리보기");
  console.log("─".repeat(100));
  for (let i = Math.max(0, lines.length - 100); i < lines.length; i++) {
    console.log(`[${String(i).padStart(5)}] ${lines[i]}`);
  }
  console.log("─".repeat(100));
}

console.log("\n=== 테스트 완료 ===");
