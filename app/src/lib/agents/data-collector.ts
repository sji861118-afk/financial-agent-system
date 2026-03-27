/**
 * 서브에이전트: data-collector
 * ===========================
 * DART API / 업로드 파일에서 원본 데이터를 수집하고
 * QA 검증용 원본 스냅샷(RawDataSnapshot)을 함께 생성
 */

import { buildFinancialData, type FinancialResult, type FinancialRow } from "../dart-api";
import type { CollectRequest, CollectResult, RawDataSnapshot } from "./types";

/** FinancialRow → 스냅샷용 간소 형태 */
function rowsToSnapshot(
  rows: FinancialRow[],
  years: string[]
): Array<{ account: string; values: Record<string, string | number | undefined> }> {
  return rows.map((r) => {
    const values: Record<string, string | number | undefined> = {};
    for (const y of years) {
      if (r[y] !== undefined) values[y] = r[y] as string | number;
    }
    return { account: r.account, values };
  });
}

export async function collectData(req: CollectRequest): Promise<CollectResult> {
  const sources: RawDataSnapshot["sources"] = [];

  // 1. DART 데이터 수집
  let financialResult: FinancialResult;
  try {
    financialResult = await buildFinancialData(req.corpCode, req.years);
    if (financialResult.hasData) {
      sources.push({ type: "DART", label: `DART ${req.corpName} (${req.years.join(",")})` });
    }
  } catch (e) {
    // DART 실패 시 빈 결과로 시작
    financialResult = {
      companyInfo: {
        corpCode: req.corpCode, corpName: req.corpName,
        ceoNm: "", jurirNo: "", bizrNo: "", adres: "",
        estDt: "", indutyCode: "", accMt: "", stockCode: "", corpCls: "",
      },
      bsItems: [], isItems: [], ratios: {}, hasOfs: false,
      bsItemsCfs: [], isItemsCfs: [], ratiosCfs: {}, hasCfs: false,
      years: req.years, source: "", hasData: false,
      noDataReason: `DART 조회 실패: ${e}`,
    };
  }

  // 2. 원본 스냅샷 생성 (검수 기준점)
  const effectiveYears = financialResult.years?.length ? financialResult.years : req.years;

  const snapshot: RawDataSnapshot = {
    collectedAt: new Date().toISOString(),
    sources,
    dartBsRaw: rowsToSnapshot(financialResult.bsItems || [], effectiveYears),
    dartIsRaw: rowsToSnapshot(financialResult.isItems || [], effectiveYears),
    years: effectiveYears,
  };

  // 3. 업로드 데이터가 있으면 스냅샷에 추가
  if (req.uploadData) {
    sources.push({ type: "UPLOAD_EXCEL", label: `업로드 (${req.uploadData.source || "파일"})` });
    snapshot.uploadBsRaw = rowsToSnapshot(req.uploadData.bsItems, req.uploadData.years);
    snapshot.uploadIsRaw = rowsToSnapshot(req.uploadData.isItems, req.uploadData.years);
    // 연도 합집합
    snapshot.years = [...new Set([...effectiveYears, ...req.uploadData.years])].sort();
  }

  return { financialResult, snapshot };
}
