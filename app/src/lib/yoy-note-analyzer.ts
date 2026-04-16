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
  changeAmount: number;       // 증감액 (백만원)
  changePercent: number | null; // 증감률 (%)
  noteRef?: string;           // 주석번호
  noteText: string;           // 주석 텍스트 (매칭된 사유)
}

/** 숫자 문자열 파싱: "1,234,567" → 1234567, "-" → null */
function parseVal(v: string | number | undefined): number | null {
  if (v === undefined || v === "-" || v === "") return null;
  if (typeof v === "number") return v;
  const cleaned = v.replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * noteRef로 직접 매칭: "5,6" → notes["5"] + notes["6"]
 */
function matchByNoteRef(
  noteRef: string,
  notesSections: Record<string, string>
): string {
  const nums = noteRef.split(",");
  const texts: string[] = [];
  for (const num of nums) {
    const text = notesSections[num.trim()];
    if (text) texts.push(text);
  }
  return texts.join("\n---\n");
}

/**
 * 계정명 키워드로 주석 섹션 검색 (noteRef 없을 때 fallback)
 */
function matchByKeyword(
  account: string,
  notesSections: Record<string, string>
): string {
  const norm = account.replace(/[\s()]/g, "");
  // 주석 섹션 제목에서 계정명 포함하는 것 찾기
  for (const [num, text] of Object.entries(notesSections)) {
    // 주석 제목은 보통 첫 줄: "12. 차입금"
    const firstLine = text.split("\n")[0] || "";
    const titleNorm = firstLine.replace(/[\s()]/g, "");
    if (titleNorm.includes(norm) || norm.includes(titleNorm.replace(/^\d+\./, ""))) {
      return text;
    }
  }
  // broader search: 주석 본문에서 계정명 포함
  for (const [, text] of Object.entries(notesSections)) {
    if (text.includes(norm) || text.includes(account)) {
      return text;
    }
  }
  return "";
}

/**
 * 주석 텍스트에서 증감 관련 핵심 문장 추출
 */
function extractReasonSummary(noteText: string, maxLen: number = 300): string {
  if (!noteText) return "";

  // 증감 관련 키워드가 포함된 문장 추출
  const keywords = /증가|감소|변동|취득|처분|발행|상환|신규|만기|매각|인수|합병|전환|설정|해제|상각|손상|평가|조정|인식|제거/;
  const sentences = noteText
    .split(/[.\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && keywords.test(s));

  if (sentences.length === 0) {
    // 키워드 없으면 제목만 반환
    const title = noteText.split("\n")[0]?.trim() || "";
    return title.length > maxLen ? title.slice(0, maxLen) + "..." : title;
  }

  let result = sentences.slice(0, 3).join(". ");
  if (result.length > maxLen) result = result.slice(0, maxLen) + "...";
  return result;
}

/**
 * 메인: BS/IS 항목에서 임계값 초과 변동 감지 + 주석 매칭
 */
export function analyzeYoYChanges(
  bsItems: FinancialRow[],
  isItems: FinancialRow[],
  years: string[],
  notesSections: Record<string, string>,
  threshold: YoYThreshold
): YoYChangeItem[] {
  if (years.length < 2) return [];
  if (!threshold.amountMillions && !threshold.percentChange) return [];

  // 최근 2개 연도 (오름차순 정렬 → 마지막 2개)
  const sortedYears = [...years].sort();
  const prevYear = sortedYears[sortedYears.length - 2];
  const curYear = sortedYears[sortedYears.length - 1];

  const results: YoYChangeItem[] = [];

  function processItems(items: FinancialRow[], stmtType: "BS" | "IS") {
    for (const item of items) {
      // 총계/합계 항목은 스킵 (depth 0)
      if (item.depth === 0) continue;

      const cur = parseVal(item[curYear]);
      const prev = parseVal(item[prevYear]);
      if (cur === null || prev === null) continue;

      const changeAmount = cur - prev;
      const changePercent = prev !== 0 ? (changeAmount / Math.abs(prev)) * 100 : null;

      // 임계값 체크
      const exceedsAmount = threshold.amountMillions
        ? Math.abs(changeAmount) >= threshold.amountMillions
        : false;
      const exceedsPercent = threshold.percentChange && changePercent !== null
        ? Math.abs(changePercent) >= threshold.percentChange
        : false;

      if (!exceedsAmount && !exceedsPercent) continue;

      // 주석 매칭
      let noteText = "";
      if (item.noteRef) {
        noteText = matchByNoteRef(item.noteRef, notesSections);
      }
      if (!noteText) {
        noteText = matchByKeyword(item.account, notesSections);
      }

      // 사유 요약
      const summary = extractReasonSummary(noteText);

      results.push({
        account: item.account,
        stmtType,
        changeAmount,
        changePercent: changePercent !== null ? Math.round(changePercent * 10) / 10 : null,
        noteRef: item.noteRef,
        noteText: summary,
      });
    }
  }

  processItems(bsItems, "BS");
  processItems(isItems, "IS");

  return results;
}
