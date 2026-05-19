import { type NextRequest } from "next/server";
import { resolveNameCandidates } from "@/lib/insolvency/matcher";
import { getCompanyInfo } from "@/lib/dart-api";
import type { InsolvencyMatchResult } from "@/lib/insolvency/types";

/**
 * POST /api/insolvency/match
 *   body: { names: string[] }
 *   resp: { results: InsolvencyMatchResult[] }
 *
 * 회사명단을 받아 각 회사의 매칭 후보를 반환.
 * - 후보 0건: 사용자 수동 corp_code 입력 필요
 * - 후보 1건: 자동 채택
 * - 후보 2건+: UI dropdown 노출
 *
 * 상위 1건에 대해서만 getCompanyInfo() 병렬 호출하여 ceo/bizrNo 보강 (UI 표시용).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const names: string[] = Array.isArray(body.names) ? body.names : [];

    if (names.length === 0) {
      return Response.json({ results: [] });
    }

    if (names.length > 100) {
      return Response.json(
        { error: "한 번에 100개 이하만 처리할 수 있습니다." },
        { status: 400 },
      );
    }

    // 각 이름별 후보 조회 (동기, 빠름)
    const draftResults: InsolvencyMatchResult[] = names.map((name) => ({
      inputName: name.trim(),
      candidates: resolveNameCandidates(name, 10),
    }));

    // 후보의 top1만 골라 병렬 enrich (ceo/bizrNo)
    const enrichTasks: Promise<void>[] = [];
    for (const r of draftResults) {
      const top = r.candidates[0];
      if (!top) continue;
      enrichTasks.push(
        (async () => {
          try {
            const info = await getCompanyInfo(top.corpCode);
            top.ceo = info.ceoNm || "";
            top.bizrNo = info.bizrNo || "";
          } catch {
            /* non-blocking */
          }
        })(),
      );
    }
    await Promise.allSettled(enrichTasks);

    return Response.json({ results: draftResults });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[insolvency/match] error:", msg);
    return Response.json({ error: `매칭 오류: ${msg}` }, { status: 500 });
  }
}
