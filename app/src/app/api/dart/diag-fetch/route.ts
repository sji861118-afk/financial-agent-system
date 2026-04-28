// 임시 진단 — fnlttSinglAcntAll OFS/CFS × 사업보고서/분기/반기 응답 추적용
// GET /api/dart/diag-fetch?corp=00266961&year=2025
// 프로젠(코넥스) 25년 IS/CF 누락, 제넥신(코스닥) CFS 24/25년 누락 원인 추적
// 원인 확정 후 제거 예정.
import { type NextRequest } from "next/server";
import { buildFinancialData } from "@/lib/dart-api";

export const maxDuration = 60;

const DART_API_BASE = "https://opendart.fss.or.kr/api";
const REPRT_LABELS: Record<string, string> = { "11011": "사업", "11014": "3분기", "11012": "반기", "11013": "1분기" };

async function probe(apiKey: string, corp: string, year: string, fsDiv: "OFS" | "CFS", reprt: string) {
  const params = new URLSearchParams({
    crtfc_key: apiKey, corp_code: corp, bsns_year: year, reprt_code: reprt, fs_div: fsDiv,
  });
  const t0 = Date.now();
  try {
    const r = await fetch(`${DART_API_BASE}/fnlttSinglAcntAll.json?${params}`, { signal: AbortSignal.timeout(15_000) });
    const j = await r.json();
    const items = j.list || [];
    const sjDivs = [...new Set(items.map((it: { sj_div: string }) => it.sj_div))] as string[];
    return {
      reprt: REPRT_LABELS[reprt] || reprt,
      ms: Date.now() - t0,
      status: j.status,
      message: j.message,
      itemsLen: items.length,
      sjDivs,
      sampleAccounts: items.slice(0, 3).map((it: { account_nm?: string; sj_div: string }) => `${it.sj_div}:${it.account_nm || ""}`),
    };
  } catch (e) {
    return { reprt: REPRT_LABELS[reprt] || reprt, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: NextRequest) {
  const corp = request.nextUrl.searchParams.get("corp") || "";
  const year = request.nextUrl.searchParams.get("year") || "2025";
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return Response.json({ error: "DART_API_KEY missing" }, { status: 500 });
  if (!corp) return Response.json({ error: "corp param required (corp_code 8자리)" }, { status: 400 });

  const out: Record<string, unknown> = { corp, year, timestamp: new Date().toISOString() };

  // (1) fnlttSinglAcntAll 직접 호출 — OFS/CFS × 사업/3분기/반기/1분기 8개 케이스
  out.fnlttSinglAcntAll = {
    OFS: {
      "11011": await probe(apiKey, corp, year, "OFS", "11011"),
      "11014": await probe(apiKey, corp, year, "OFS", "11014"),
      "11012": await probe(apiKey, corp, year, "OFS", "11012"),
      "11013": await probe(apiKey, corp, year, "OFS", "11013"),
    },
    CFS: {
      "11011": await probe(apiKey, corp, year, "CFS", "11011"),
      "11014": await probe(apiKey, corp, year, "CFS", "11014"),
      "11012": await probe(apiKey, corp, year, "CFS", "11012"),
      "11013": await probe(apiKey, corp, year, "CFS", "11013"),
    },
  };

  // (2) buildFinancialData 결과 비교 — 실제 파이프라인 결과
  try {
    const t0 = Date.now();
    const d = await buildFinancialData(corp, [year]);
    out.buildFinancialData = {
      ms: Date.now() - t0,
      hasOfs: d.hasOfs,
      hasCfs: d.hasCfs,
      bsItemsLen: d.bsItems.length,
      isItemsLen: d.isItems.length,
      cfItemsLen: d.cfItems.length,
      bsItemsCfsLen: d.bsItemsCfs.length,
      isItemsCfsLen: d.isItemsCfs.length,
      cfItemsCfsLen: d.cfItemsCfs.length,
      source: d.source,
      noDataReason: d.noDataReason,
      accountingStandardChanged: d.accountingStandardChanged,
    };
  } catch (e) {
    out.buildFinancialData = { error: e instanceof Error ? e.message : String(e) };
  }

  // (3) list.json 사업/감사보고서 공시 여부
  try {
    const params = new URLSearchParams({
      crtfc_key: apiKey, corp_code: corp,
      bgn_de: `${parseInt(year)}0101`, end_de: "20261231",
      pblntf_ty: "A", page_count: "30",
    });
    const r = await fetch(`${DART_API_BASE}/list.json?${params}`, { signal: AbortSignal.timeout(15_000) });
    const j = await r.json();
    const yearReports = (j.list || []).filter((it: { report_nm?: string }) => {
      const nm = it.report_nm || "";
      const m = nm.match(/\((\d{4})/);
      return m && m[1] === year;
    });
    out.annualReports = {
      status: j.status,
      yearMatchCount: yearReports.length,
      reports: yearReports.slice(0, 5).map((r: { report_nm?: string; rcept_no?: string }) => ({ nm: r.report_nm, no: r.rcept_no })),
    };
  } catch (e) {
    out.annualReports = { error: e instanceof Error ? e.message : String(e) };
  }

  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
