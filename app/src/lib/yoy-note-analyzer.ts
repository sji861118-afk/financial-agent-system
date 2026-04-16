// app/src/lib/yoy-note-analyzer.ts
// 전년대비 증감사유 자동 분석 — 감사보고서 주석 매칭

import type { FinancialRow } from "./dart-api";

export interface YoYThreshold {
  amountMillions?: number; // 기준금액 (백만원), 예: 1000
  percentChange?: number;  // 기준비율 (%), 예: 10
}

export interface YoYChangeItem {
  account: string;
  stmtType: "BS" | "IS";
  curValue: number;           // 당기 금액 (백만원)
  prevValue: number;          // 전기 금액 (백만원)
  changeAmount: number;       // 증감액 (백만원)
  changePercent: number | null; // 증감률 (%)
  noteNum: string;            // 매칭된 주석번호 (예: "12")
  noteTitle: string;          // 주석 제목 (예: "차입금")
  noteSource: string;         // 출처 (예: "2024 감사보고서 주석12")
  noteDetail: string;         // 주석 상세 내용 (별도 시트용)
  briefRef: string;           // 재무제표 셀용 간략 참조 (예: "→ 주석12 (차입금)")
}

/** 숫자 문자열 파싱: "1,234,567" → 1234567, "-" → null */
function parseVal(v: string | number | undefined): number | null {
  if (v === undefined || v === "-" || v === "") return null;
  if (typeof v === "number") return v;
  const cleaned = v.replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** 무의미한 표현 제거 */
function cleanNoteText(text: string): string {
  return text
    // "다음과 같습니다" 류 제거
    .replace(/[^.]*다음과\s*같습니다[.]?/g, "")
    .replace(/[^.]*아래와\s*같습니다[.]?/g, "")
    .replace(/[^.]*다음과\s*같이\s*구성되어\s*있습니다[.]?/g, "")
    .replace(/[^.]*내역은\s*다음과\s*같습니다[.]?/g, "")
    // "당기말 및 전기말 현재" 류 축약
    .replace(/당기말\s*및\s*전기말\s*현재\s*/g, "")
    .replace(/당기\s*및\s*전기\s*중\s*/g, "")
    // HTML 잔여물
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    // 연속 공백/줄바꿈 정리
    .replace(/\n{2,}/g, "\n")
    .replace(/\.\s*\./g, ".")
    .replace(/^\s*[.\n]+/, "")
    .trim();
}

/** 주석 텍스트에서 제목 추출: "12. 차입금" → "차입금" */
function extractNoteTitle(noteText: string): string {
  const firstLine = noteText.split("\n")[0]?.trim() || "";
  // "12. 차입금" → "차입금"
  const m = firstLine.match(/^\d{1,3}\.\s*(.+)/);
  return m ? m[1].trim() : firstLine.slice(0, 40);
}

/** 주석 텍스트에서 핵심 사유 추출 (별도 시트용) */
function extractDetailedReason(noteText: string, maxLen: number = 800): string {
  if (!noteText) return "";
  const cleaned = cleanNoteText(noteText);

  // 증감 관련 키워드가 포함된 문장 우선
  const keywords = /증가|감소|변동|취득|처분|발행|상환|신규|만기|매각|인수|합병|전환|설정|해제|상각|손상|평가|조정|인식|제거|차입|상환|연장/;
  const lines = cleaned.split(/[.\n]/).map(s => s.trim()).filter(s => s.length > 5);
  const keyLines = lines.filter(s => keywords.test(s) && s.length > 10);

  let result: string;
  if (keyLines.length > 0) {
    result = keyLines.slice(0, 5).join(". ");
  } else {
    // 키워드 매칭 안 되면 첫 몇 줄
    result = lines.slice(0, 3).join(". ");
  }

  if (result.length > maxLen) result = result.slice(0, maxLen) + "...";
  return result || "";
}

/**
 * 계정명으로 주석 섹션 매칭 → (주석번호, 텍스트) 반환
 */
function findMatchingNote(
  account: string,
  notesSections: Record<string, string>
): { noteNum: string; noteText: string } | null {
  const norm = account.replace(/[\s()]/g, "");

  // 1. 주석 제목에서 계정명 정확 매칭
  for (const [num, text] of Object.entries(notesSections)) {
    const title = extractNoteTitle(text).replace(/[\s()]/g, "");
    if (title === norm || norm === title) {
      return { noteNum: num, noteText: text };
    }
  }

  // 2. 주석 제목에 계정명 포함
  for (const [num, text] of Object.entries(notesSections)) {
    const title = extractNoteTitle(text).replace(/[\s()]/g, "");
    if (title.includes(norm) || norm.includes(title)) {
      return { noteNum: num, noteText: text };
    }
  }

  // 3. 주석 본문에서 계정명 포함 (broader)
  for (const [num, text] of Object.entries(notesSections)) {
    const bodyNorm = text.replace(/[\s]/g, "");
    if (bodyNorm.includes(norm)) {
      return { noteNum: num, noteText: text };
    }
  }

  return null;
}

/**
 * 메인: BS/IS 항목에서 임계값 초과 변동 감지 + 주석 매칭
 */
export function analyzeYoYChanges(
  bsItems: FinancialRow[],
  isItems: FinancialRow[],
  years: string[],
  notesSections: Record<string, string>,
  threshold: YoYThreshold,
  reportYear?: string, // 감사보고서 기준 연도 (예: "2024")
): YoYChangeItem[] {
  if (years.length < 2) return [];
  if (!threshold.amountMillions && !threshold.percentChange) return [];

  // 최근 2개 연도 (오름차순 정렬 → 마지막 2개)
  const sortedYears = [...years].sort();
  const prevYear = sortedYears[sortedYears.length - 2];
  const curYear = sortedYears[sortedYears.length - 1];
  const sourceYear = reportYear || curYear.replace(/\.\d+$/, "");

  const results: YoYChangeItem[] = [];

  function processItems(items: FinancialRow[], stmtType: "BS" | "IS") {
    for (const item of items) {
      if (item.depth === 0) continue;

      const cur = parseVal(item[curYear]);
      const prev = parseVal(item[prevYear]);
      if (cur === null || prev === null) continue;

      const changeAmount = cur - prev;
      const changePercent = prev !== 0 ? (changeAmount / Math.abs(prev)) * 100 : null;

      const exceedsAmount = threshold.amountMillions
        ? Math.abs(changeAmount) >= threshold.amountMillions
        : false;
      const exceedsPercent = threshold.percentChange && changePercent !== null
        ? Math.abs(changePercent) >= threshold.percentChange
        : false;

      if (!exceedsAmount && !exceedsPercent) continue;

      // 주석 매칭
      let noteNum = "";
      let noteText = "";
      let noteTitle = "";

      // noteRef가 있으면 해당 주석 직접 참조
      if (item.noteRef) {
        const nums = item.noteRef.split(",");
        const firstNum = nums[0].trim();
        if (notesSections[firstNum]) {
          noteNum = firstNum;
          noteText = notesSections[firstNum];
          noteTitle = extractNoteTitle(noteText);
        }
      }

      // noteRef 없으면 키워드 매칭
      if (!noteText) {
        const match = findMatchingNote(item.account, notesSections);
        if (match) {
          noteNum = match.noteNum;
          noteText = match.noteText;
          noteTitle = extractNoteTitle(noteText);
        }
      }

      const briefRef = noteNum
        ? `→ 주석${noteNum} (${noteTitle}) [${sourceYear} 감사보고서]`
        : "";

      const noteSource = noteNum
        ? `${sourceYear} 감사보고서 주석${noteNum}`
        : "";

      results.push({
        account: item.account,
        stmtType,
        curValue: cur,
        prevValue: prev,
        changeAmount,
        changePercent: changePercent !== null ? Math.round(changePercent * 10) / 10 : null,
        noteNum,
        noteTitle,
        noteSource,
        noteDetail: extractDetailedReason(noteText),
        briefRef,
      });
    }
  }

  processItems(bsItems, "BS");
  processItems(isItems, "IS");

  return results;
}
