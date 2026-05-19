import { searchCorpCodes } from "@/lib/dart-corp-codes";
import type { NameMatch } from "./types";

/**
 * 회사명 → 매칭 후보 N건.
 * - 1건이면 자동 채택, N건이면 UI dropdown 노출, 0건이면 수동 corp_code 입력 필요.
 * - searchCorpCodes의 score-based 정렬 결과를 그대로 사용 (정확매칭=100, prefix=80, contains=60).
 * - DART company.json 호출은 fetch 단계에서 buildFinancialData가 동시에 가져오므로 여기서는 skip.
 */
export function resolveNameCandidates(name: string, limit = 10): NameMatch[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const hits = searchCorpCodes(trimmed, limit);
  return hits.map((h) => ({
    inputName: trimmed,
    corpCode: h.corpCode,
    corpName: h.name,
    stockCode: h.stockCode,
  }));
}
