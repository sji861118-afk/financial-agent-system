/**
 * 서브에이전트: merger
 * ====================
 * DART + 업로드 등 다중 출처 데이터를 계정명 기반으로 병합
 */

import type { FinancialRow } from "../dart-api";
import type { MergedData, CollectRequest } from "./types";

/** 계정명 정규화 (매칭용) */
function normalizeKey(account: string): string {
  return (account || "").replace(/\s/g, "");
}

/**
 * DART 데이터 + 업로드 데이터 병합
 * - DART 우선 (preferUpload=true이면 업로드 우선)
 * - 겹치는 연도: 우선순위 소스의 값 사용
 * - 새 계정: 그대로 추가
 */
function mergeRows(
  dartRows: FinancialRow[],
  uploadRows: FinancialRow[],
  uploadYears: string[],
  preferUpload: boolean
): { merged: FinancialRow[]; unmatchedItems: Array<{ account: string; source: string; reason: string }> } {
  const accountMap = new Map<string, FinancialRow>();
  const insertionOrder: string[] = [];
  const unmatchedItems: Array<{ account: string; source: string; reason: string }> = [];

  // DART 데이터 먼저
  for (const row of dartRows) {
    const key = normalizeKey(row.account);
    accountMap.set(key, { ...row });
    insertionOrder.push(key);
  }

  // 업로드 데이터 병합
  for (const uRow of uploadRows) {
    const key = normalizeKey(uRow.account);
    const existing = accountMap.get(key);
    if (existing) {
      for (const y of uploadYears) {
        const dartHasYear = existing[y] && existing[y] !== "-" && existing[y] !== "";
        const uploadHasYear = uRow[y] && uRow[y] !== "-" && uRow[y] !== "";
        if (uploadHasYear && (!dartHasYear || preferUpload)) {
          existing[y] = uRow[y];
        }
      }
      accountMap.set(key, existing);
    } else {
      accountMap.set(key, { ...uRow });
      insertionOrder.push(key);
    }
  }

  // 순서 보존하여 반환
  const merged = insertionOrder.map((key) => accountMap.get(key)!).filter(Boolean);
  return { merged, unmatchedItems };
}

export function mergeFinancialData(
  dartBs: FinancialRow[],
  dartIs: FinancialRow[],
  dartYears: string[],
  uploadData: CollectRequest["uploadData"],
  preferUpload = false
): MergedData {
  const uploadBs = uploadData?.bsItems || [];
  const uploadIs = uploadData?.isItems || [];
  const uploadYears = uploadData?.years || [];
  const allYears = [...new Set([...dartYears, ...uploadYears])].sort();

  const bsMerge = mergeRows(dartBs, uploadBs, uploadYears, preferUpload);
  const isMerge = mergeRows(dartIs, uploadIs, uploadYears, preferUpload);

  return {
    bsItems: bsMerge.merged,
    isItems: isMerge.merged,
    years: allYears,
    mergeStats: {
      dartItemCount: dartBs.length + dartIs.length,
      uploadItemCount: uploadBs.length + uploadIs.length,
      mergedItemCount: bsMerge.merged.length + isMerge.merged.length,
      unmatchedItems: [...bsMerge.unmatchedItems, ...isMerge.unmatchedItems],
    },
  };
}
