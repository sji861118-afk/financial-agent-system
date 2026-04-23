// 임시 진단 — production에서 D&A 보강 path가 fail하는 원인 추적용
// GET /api/dart/diag-da?corpCode=01316245
// 효성중공업 buildFinancialData 호출 후 cfItems 진단 + 사업보고서 raw fetch 시도
import { type NextRequest } from "next/server";
import JSZip from "jszip";
import { buildFinancialData } from "@/lib/dart-api";

export const maxDuration = 60;

const DART_API_BASE = "https://opendart.fss.or.kr/api";

export async function GET(request: NextRequest) {
  const corpCode = request.nextUrl.searchParams.get("corpCode") || "01316245"; // 효성중공업 default
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return Response.json({ error: "DART_API_KEY missing" }, { status: 500 });

  const out: Record<string, unknown> = { corpCode, timestamp: new Date().toISOString() };

  // (1) buildFinancialData 호출 + cfItems 진단
  try {
    const t0 = Date.now();
    const d = await buildFinancialData(corpCode, ["2023", "2024", "2025"]);
    const elapsed = Date.now() - t0;
    out.buildFinancialData = {
      ms: elapsed,
      hasOfs: d.hasOfs,
      hasCfs: d.hasCfs,
      cfItemsLen: d.cfItems.length,
      cfItemsCfsLen: d.cfItemsCfs.length,
      ofsHasDepr: d.cfItems.some(r => /감가상각|유형자산감가/.test((r.account || "").replace(/\s/g, ""))),
      cfsHasDepr: d.cfItemsCfs.some(r => /감가상각|유형자산감가/.test((r.account || "").replace(/\s/g, ""))),
      ofsHasIntPay: d.cfItems.some(r => /이자지급|이자납부/.test((r.account || "").replace(/\s/g, ""))),
      ofsCfTail: d.cfItems.slice(-5).map(r => r.account),
    };
  } catch (e) {
    out.buildFinancialData = { error: e instanceof Error ? e.message : String(e) };
  }

  // (2) 사업보고서 list.json 직접 fetch
  try {
    const t1 = Date.now();
    const params = new URLSearchParams({
      crtfc_key: apiKey, corp_code: corpCode,
      bgn_de: "20220101", end_de: "20261231",
      pblntf_ty: "A", page_count: "30",
    });
    const r = await fetch(`${DART_API_BASE}/list.json?${params}`, { signal: AbortSignal.timeout(15_000) });
    const j = await r.json();
    const reports = (j.list || []).filter((it: any) => /사업보고서/.test(it.report_nm) && !/기재정정/.test(it.report_nm));
    out.listJson = {
      ms: Date.now() - t1,
      status: j.status,
      totalReports: (j.list || []).length,
       saupReports: reports.slice(0, 3).map((r: any) => ({ nm: r.report_nm, no: r.rcept_no })),
    };

    // (3) 가장 최신 사업보고서 document.xml 다운로드 + JSZip 처리
    if (reports.length > 0) {
      const top = reports[0];
      const t2 = Date.now();
      try {
        const xmlRes = await fetch(`${DART_API_BASE}/document.xml?crtfc_key=${apiKey}&rcept_no=${top.rcept_no}`,
          { signal: AbortSignal.timeout(30_000) });
        const buf = Buffer.from(await xmlRes.arrayBuffer());
        const ms = Date.now() - t2;
        out.docXml = {
          rceptNo: top.rcept_no,
          reportNm: top.report_nm,
          ms,
          httpStatus: xmlRes.status,
          contentLength: buf.length,
          isZip: buf[0] === 0x50 && buf[1] === 0x4B,
          first16Bytes: Array.from(buf.slice(0, 16)).map(b => b.toString(16).padStart(2, "0")).join(""),
        };

        // JSZip 처리
        if (buf[0] === 0x50 && buf[1] === 0x4B) {
          const t3 = Date.now();
          try {
            const zip = await JSZip.loadAsync(buf);
            const xmlFiles = Object.keys(zip.files).filter(n => n.endsWith(".xml"));
            const mainName = xmlFiles.find(n => !zip.files[n].dir && !/_\d+\.xml$/.test(n)) || xmlFiles[0];
            const content = await zip.files[mainName].async("string");
            // 주요 키워드 등장 여부
            const cleaned = content.replace(/\s/g, "");
            (out.docXml as any).jszip = {
              ms: Date.now() - t3,
              fileCount: xmlFiles.length,
              mainName,
              contentChars: content.length,
              hasCombinedDA: /감가상각비및무형자산상각비|감가상각비와무형자산상각비/.test(cleaned),
              hasIndivDepr: /감가상각비/.test(cleaned),
              hasIndivAmort: /무형자산상각비|사용권자산상각비/.test(cleaned),
            };
          } catch (e) {
            (out.docXml as any).jszipError = e instanceof Error ? e.message : String(e);
          }
        }
      } catch (e) {
        out.docXml = { error: e instanceof Error ? e.message : String(e) };
      }
    }
  } catch (e) {
    out.listJson = { error: e instanceof Error ? e.message : String(e) };
  }

  return Response.json(out);
}
