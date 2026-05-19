import { type NextRequest } from "next/server";
import { buildFinancialData, fetchAuditOpinion, type AuditOpinionInfo } from "@/lib/dart-api";
import { extract24Cells } from "@/lib/insolvency/extract-financials";
import { judgeWarnings } from "@/lib/insolvency/rules";
import type { ResolvedCompany, InsolvencyRow } from "@/lib/insolvency/types";

export const maxDuration = 60;

/**
 * POST /api/insolvency/fetch
 *   body: { items: ResolvedCompany[]; years?: string[] }
 *   resp: { rows: InsolvencyRow[]; errors: { inputName: string; reason: string }[] }
 *
 * 핵심: Vercel 60s 예산. mapLimit(items, 5)로 동시 5건 처리.
 * 회사당 buildFinancialData(~5-10s) + fetchAuditOpinion(~3-5s) → 병렬 호출.
 *
 * years 미지정 시 현재연도-1 ~ 현재연도-3 (DART 사업보고서는 1분기 ~ 4월에 공시되므로
 * 작년 자료가 가장 최신일 가능성이 높음).
 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms),
    ),
  ]);
}

function defaultYears(): string[] {
  const now = new Date();
  // 1~4월 사이면 작년 보고서가 아직 미공시 가능 → 2년 전을 직전년도로
  const cutoffMonth = 4;
  const baseYear = now.getMonth() + 1 <= cutoffMonth ? now.getFullYear() - 2 : now.getFullYear() - 1;
  return [String(baseYear), String(baseYear - 1), String(baseYear - 2)];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: ResolvedCompany[] = Array.isArray(body.items) ? body.items : [];
    const years: string[] = Array.isArray(body.years) && body.years.length === 3
      ? body.years
      : defaultYears();

    if (items.length === 0) {
      return Response.json({ rows: [], errors: [] });
    }

    if (items.length > 30) {
      return Response.json(
        { error: "한 번에 30개 이하만 처리할 수 있습니다. 클라이언트에서 chunk 분할 권장." },
        { status: 400 },
      );
    }

    const errors: { inputName: string; reason: string }[] = [];

    const rows: (InsolvencyRow | null)[] = await mapLimit(items, 5, async (item) => {
      try {
        const finP = withTimeout(
          buildFinancialData(item.corpCode, years, item.stockCode),
          35_000,
          `buildFinancialData(${item.corpName})`,
        );
        const opP = withTimeout(
          fetchAuditOpinion(item.corpCode, years),
          10_000,
          `fetchAuditOpinion(${item.corpName})`,
        ).catch((): AuditOpinionInfo | null => null);

        const [fin, opinion] = await Promise.all([finP, opP]);

        if (!fin.hasData) {
          errors.push({
            inputName: item.inputName,
            reason: fin.noDataReason || "DART 재무 데이터 미수신",
          });
          return null;
        }

        const cells = extract24Cells(fin, years);
        const flags = judgeWarnings({ cells, years, opinion });

        const row: InsolvencyRow = {
          inputName: item.inputName,
          corpName: fin.companyInfo.corpName || item.corpName,
          corpCode: item.corpCode,
          estDt: fin.companyInfo.estDt || "",
          cells,
          years,
          flags,
          source: fin.hasCfs ? fin.extractionSourceCfs : fin.extractionSourceOfs,
        };
        return row;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ inputName: item.inputName, reason: msg });
        return null;
      }
    });

    return Response.json({
      rows: rows.filter((r): r is InsolvencyRow => r !== null),
      errors,
      years,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[insolvency/fetch] error:", msg);
    return Response.json({ error: `조회 오류: ${msg}` }, { status: 500 });
  }
}
