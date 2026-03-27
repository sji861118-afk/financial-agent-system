// JSON을 import로 번들에 직접 포함 (Vercel 서버리스 호환)
import corpCodesV2 from "../../public/_dart_corp_codes_v2.json";

interface CorpEntry {
  n: string; // corp_name
  c: string; // corp_code
  s: string; // stock_code
}

let corpCodesCache: CorpEntry[] | null = null;

function loadCorpCodes(): CorpEntry[] {
  if (corpCodesCache) return corpCodesCache;
  corpCodesCache = corpCodesV2 as CorpEntry[];
  return corpCodesCache;
}

// 한글↔영문 약어 매핑
const KR_EN_MAP: Record<string, string> = {
  "에이치비": "HB", "에스케이": "SK", "엘지": "LG", "케이비": "KB",
  "비엔케이": "BNK", "제이비": "JB", "디비": "DB", "엔에이치": "NH",
  "씨제이": "CJ", "지에스": "GS", "케이티": "KT", "아이비케이": "IBK",
  "에이케이": "AK", "디에스": "DS", "이에스": "ES", "오케이": "OK",
  "에이치디": "HD", "에이치엠씨": "HMC", "엠에스": "MS", "에스비아이": "SBI",
};

// 한글 기업명 ↔ DART 등록 영문명 매핑 (주요 기업)
const CORP_NAME_ALIAS: Record<string, string[]> = {
  "네이버": ["NAVER"], "카카오": ["Kakao"],
  "삼성에스디에스": ["삼성SDS"], "엘지이노텍": ["LG이노텍"],
  "포스코": ["POSCO"], "에스케이텔레콤": ["SK텔레콤"],
  "현대제철": ["현대제철"], "기아": ["KIA", "기아자동차"],
};

function cleanName(s: string): string {
  return s.replace(/㈜/g, "").replace(/\(주\)/g, "").replace(/주식회사/g, "").trim();
}

function expandQuery(q: string): string[] {
  const variants = [q];
  // KR_EN_MAP 변환
  let converted = q;
  for (const [kr, en] of Object.entries(KR_EN_MAP)) {
    converted = converted.replace(kr, en.toLowerCase());
  }
  if (converted !== q) variants.push(converted);
  // CORP_NAME_ALIAS 변환
  for (const [alias, names] of Object.entries(CORP_NAME_ALIAS)) {
    if (q === alias.toLowerCase()) {
      for (const n of names) variants.push(n.toLowerCase());
    }
    for (const n of names) {
      if (q === n.toLowerCase()) variants.push(alias.toLowerCase());
    }
  }
  return [...new Set(variants)];
}

export function searchCorpCodes(
  query: string,
  limit = 50
): { name: string; corpCode: string; stockCode: string }[] {
  if (!query || query.length < 1) return [];

  const codes = loadCorpCodes();
  const qClean = cleanName(query).toLowerCase();
  const queryVariants = expandQuery(qClean);

  const results: { name: string; corpCode: string; stockCode: string; score: number }[] = [];

  for (const entry of codes) {
    const nameClean = cleanName(entry.n).toLowerCase();
    let score = 0;

    for (const q of queryVariants) {
      if (nameClean === q) { score = Math.max(score, 100); break; }
      else if (nameClean.startsWith(q)) score = Math.max(score, 80);
      else if (nameClean.includes(q)) score = Math.max(score, 60);
      else if (q.includes(nameClean) && nameClean.length >= 3) score = Math.max(score, 40);
    }

    if (score > 0) {
      // 상장사 보너스
      if (entry.s) score += 5;
      results.push({
        name: entry.n,
        corpCode: entry.c,
        stockCode: entry.s,
        score,
      });
    }
  }

  // 점수순 정렬, 동점이면 이름 짧은 순 (정확한 매칭이 상위)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.length - b.name.length;
  });

  return results.slice(0, limit).map(({ name, corpCode, stockCode }) => ({
    name,
    corpCode,
    stockCode,
  }));
}

export function findCorpCode(
  corpName: string
): { corpCode: string; stockCode: string } | null {
  const codes = loadCorpCodes();
  const qClean = cleanName(corpName).toLowerCase();

  // 1순위: 정확 매칭 + 정규화 매칭 + 별칭 매칭 — 상장사 우선
  const queryVariants = expandQuery(qClean);
  const exactMatches = codes.filter(
    (e) => {
      const nc = cleanName(e.n).toLowerCase();
      return queryVariants.some((q) => nc === q);
    }
  );
  if (exactMatches.length > 0) {
    const listed = exactMatches.find((e) => e.s);
    if (listed) return { corpCode: listed.c, stockCode: listed.s };
    return { corpCode: exactMatches[0].c, stockCode: exactMatches[0].s };
  }

  // 4순위: 부분 매칭 (가장 짧은 이름 = 가장 정확한 매칭)
  let bestMatch: { corpCode: string; stockCode: string; len: number } | null = null;
  for (const entry of codes) {
    const nc = cleanName(entry.n).toLowerCase();
    if (qClean.includes(nc) || nc.includes(qClean)) {
      if (!bestMatch || entry.n.length < bestMatch.len) {
        bestMatch = { corpCode: entry.c, stockCode: entry.s, len: entry.n.length };
      }
    }
  }

  return bestMatch ? { corpCode: bestMatch.corpCode, stockCode: bestMatch.stockCode } : null;
}
