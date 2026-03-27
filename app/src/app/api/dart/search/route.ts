import { type NextRequest } from "next/server";
import { searchCorpCodes } from "@/lib/dart-corp-codes";
import { getCompanyInfo } from "@/lib/dart-api";

export async function POST(request: NextRequest) {
  try {
    const { companyName } = await request.json();

    if (!companyName || companyName.length < 1) {
      return Response.json({ results: [] });
    }

    // 기업명 검색 (동명 기업 포함, 최대 50건)
    const matches = searchCorpCodes(companyName, 50);

    // 상위 15건에 대해 DART API로 대표자/사업자번호 조회 (병렬)
    const detailLimit = 15;
    const detailed = await Promise.all(
      matches.slice(0, detailLimit).map(async (m) => {
        try {
          const info = await getCompanyInfo(m.corpCode);
          return {
            corpCode: m.corpCode,
            corpName: m.name,
            stockCode: m.stockCode,
            ceo: info.ceoNm || "",
            bizrNo: info.bizrNo || "",
          };
        } catch {
          return {
            corpCode: m.corpCode,
            corpName: m.name,
            stockCode: m.stockCode,
            ceo: "",
            bizrNo: "",
          };
        }
      })
    );

    // 나머지는 상세정보 없이 반환
    const rest = matches.slice(detailLimit).map((m) => ({
      corpCode: m.corpCode,
      corpName: m.name,
      stockCode: m.stockCode,
      ceo: "",
      bizrNo: "",
    }));

    return Response.json({ results: [...detailed, ...rest] });
  } catch (error) {
    console.error("DART search error:", error);
    return Response.json(
      { error: "검색 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
