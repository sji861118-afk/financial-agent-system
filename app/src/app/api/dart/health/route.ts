// 임시 헬스체크용 — DART API 연결 + 대우건설 조회 테스트
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const DART_API_BASE = "https://opendart.fss.or.kr/api";
  const apiKey = process.env.DART_API_KEY;
  
  if (!apiKey) {
    return Response.json({ error: "DART_API_KEY missing" }, { status: 500 });
  }
  
  const corpCode = "00124540"; // 대우건설
  const results: Record<string, unknown> = { timestamp: new Date().toISOString() };
  
  try {
    // 1. Company Info
    const t1 = Date.now();
    const infoRes = await fetch(
      `${DART_API_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const infoData = await infoRes.json();
    results.companyInfo = {
      ok: infoData.status === "000",
      name: infoData.corp_name,
      ceo: infoData.ceo_nm,
      ms: Date.now() - t1,
    };
    
    // 2. Financial Items (2025, OFS)
    const t2 = Date.now();
    const params = new URLSearchParams({
      crtfc_key: apiKey, corp_code: corpCode,
      bsns_year: "2025", reprt_code: "11011", fs_div: "OFS",
    });
    const finRes = await fetch(
      `${DART_API_BASE}/fnlttSinglAcntAll.json?${params}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const finData = await finRes.json();
    results.financial2025 = {
      ok: finData.status === "000",
      items: finData.list?.length || 0,
      ms: Date.now() - t2,
    };
    
    // 3. Financial Items (2024, CFS)
    const t3 = Date.now();
    const params3 = new URLSearchParams({
      crtfc_key: apiKey, corp_code: corpCode,
      bsns_year: "2024", reprt_code: "11011", fs_div: "CFS",
    });
    const finRes3 = await fetch(
      `${DART_API_BASE}/fnlttSinglAcntAll.json?${params3}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const finData3 = await finRes3.json();
    results.financial2024cfs = {
      ok: finData3.status === "000",
      items: finData3.list?.length || 0,
      ms: Date.now() - t3,
    };
    
    results.allOk = true;
    results.message = "대우건설 DART 조회 성공";
    return Response.json(results);
  } catch (e: unknown) {
    results.error = e instanceof Error ? e.message : String(e);
    return Response.json(results, { status: 500 });
  }
}
