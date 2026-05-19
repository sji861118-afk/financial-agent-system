import { type NextRequest } from "next/server";
import { buildInsolvencyWorkbook } from "@/lib/insolvency/insolvency-excel";
import type { InsolvencyRow } from "@/lib/insolvency/types";

export const maxDuration = 30;

/**
 * POST /api/insolvency/excel
 *   body: { rows: InsolvencyRow[]; branch?: string }
 *   resp: binary xlsx (Content-Disposition: attachment)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rows: InsolvencyRow[] = Array.isArray(body.rows) ? body.rows : [];
    const branch: string = typeof body.branch === "string" ? body.branch : "OO지점";

    if (rows.length === 0) {
      return Response.json({ error: "출력할 데이터가 없습니다." }, { status: 400 });
    }

    const buffer = await buildInsolvencyWorkbook(rows, branch);

    const now = new Date();
    const ts =
      String(now.getFullYear()).slice(2) +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");
    const filename = `부실징후점검_${branch}_${ts}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[insolvency/excel] error:", msg);
    return Response.json({ error: `Excel 생성 오류: ${msg}` }, { status: 500 });
  }
}
