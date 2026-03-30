import type { RealTransactionRow, LandPriceRow } from '@/types/appraisal';

interface MarketDataResult {
  realTransactions: { data: RealTransactionRow[]; source: string; retrievedAt: string };
  officialLandPrice: { data: LandPriceRow[]; source: string; retrievedAt: string };
  warnings: string[];
}

export async function fetchMarketData(params: {
  sido: string;
  gugun: string;
  dong: string;
  propertyType: string;
}): Promise<MarketDataResult> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  const warnings: string[] = [];
  const now = new Date().toISOString();

  const realTransactions: RealTransactionRow[] = [];
  const landPrices: LandPriceRow[] = [];

  if (!apiKey) {
    warnings.push('DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다. 실거래가/공시지가 데이터를 수동으로 입력해주세요.');
    return {
      realTransactions: { data: [], source: '미설정', retrievedAt: '' },
      officialLandPrice: { data: [], source: '미설정', retrievedAt: '' },
      warnings,
    };
  }

  // Real transaction API call (placeholder - will be implemented when API key is available)
  try {
    // National Land API for apartment transactions
    // Endpoint: http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev
    // For now, return empty with proper source info
    warnings.push('실거래가 API 연동 준비 중 — 수동 입력 가능');
  } catch (err) {
    warnings.push(`실거래가 API 호출 실패: ${String(err)}`);
  }

  // Land price API call (placeholder)
  try {
    warnings.push('공시지가 API 연동 준비 중 — 수동 입력 가능');
  } catch (err) {
    warnings.push(`공시지가 API 호출 실패: ${String(err)}`);
  }

  return {
    realTransactions: {
      data: realTransactions,
      source: '국토교통부 실거래가 공개시스템',
      retrievedAt: apiKey ? now : '',
    },
    officialLandPrice: {
      data: landPrices,
      source: '국토교통부 부동산공시가격',
      retrievedAt: apiKey ? now : '',
    },
    warnings,
  };
}
