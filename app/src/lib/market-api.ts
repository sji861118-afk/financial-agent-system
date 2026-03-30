import type { RealTransactionRow, LandPriceRow } from '@/types/appraisal';

interface MarketDataResult {
  realTransactions: { data: RealTransactionRow[]; source: string; retrievedAt: string };
  officialLandPrice: { data: LandPriceRow[]; source: string; retrievedAt: string };
  warnings: string[];
}

// 법정동코드 매핑 (시/구 → 5자리 코드)
// 주요 지역만 포함, 필요시 확장
const REGION_CODES: Record<string, Record<string, string>> = {
  '서울특별시': { '강남구': '11680', '서초구': '11650', '송파구': '11710', '강동구': '11740', '마포구': '11440', '용산구': '11170', '성동구': '11200', '광진구': '11215', '동대문구': '11230', '중랑구': '11260', '성북구': '11290', '강북구': '11305', '도봉구': '11320', '노원구': '11350', '은평구': '11380', '서대문구': '11410', '양천구': '11470', '강서구': '11500', '구로구': '11530', '금천구': '11545', '영등포구': '11560', '동작구': '11590', '관악구': '11620', '종로구': '11110', '중구': '11140' },
  '부산광역시': { '해운대구': '26350', '수영구': '26410', '남구': '26290', '동래구': '26260', '부산진구': '26230', '연제구': '26380', '사상구': '26530', '북구': '26320', '금정구': '26310', '사하구': '26380', '강서구': '26440', '기장군': '26710' },
  '대구광역시': { '수성구': '27260', '달서구': '27290', '중구': '27110', '동구': '27140', '서구': '27170', '남구': '27200', '북구': '27230', '달성군': '27710' },
  '인천광역시': { '연수구': '28185', '남동구': '28200', '부평구': '28237', '계양구': '28245', '서구': '28260', '미추홀구': '28177', '중구': '28110', '동구': '28140', '강화군': '28710', '옹진군': '28720' },
  '광주광역시': { '동구': '29110', '서구': '29140', '남구': '29155', '북구': '29170', '광산구': '29200' },
  '대전광역시': { '유성구': '30200', '서구': '30170', '중구': '30110', '동구': '30140', '대덕구': '30230' },
  '울산광역시': { '남구': '31140', '중구': '31110', '동구': '31170', '북구': '31200', '울주군': '31710' },
  '세종특별자치시': { '세종시': '36110' },
  '경기도': { '수원시': '41110', '성남시': '41130', '안양시': '41170', '부천시': '41190', '광명시': '41210', '평택시': '41220', '안산시': '41270', '고양시': '41280', '과천시': '41290', '의왕시': '41430', '군포시': '41410', '하남시': '41450', '용인시': '41460', '파주시': '41480', '이천시': '41500', '안성시': '41550', '김포시': '41570', '화성시': '41590', '광주시': '41610', '양주시': '41630', '포천시': '41650', '여주시': '41670', '동두천시': '41250', '구리시': '41310', '남양주시': '41360', '오산시': '41370', '시흥시': '41390', '의정부시': '41150' },
  '충청북도': { '청주시': '43110', '충주시': '43130', '제천시': '43150' },
  '충청남도': { '천안시': '44130', '공주시': '44150', '아산시': '44200', '서산시': '44210', '논산시': '44230', '당진시': '44270' },
  '전라북도': { '전주시': '45110', '익산시': '45130', '군산시': '45130' },
  '전라남도': { '여수시': '46130', '순천시': '46150', '목포시': '46110', '광양시': '46230' },
  '경상북도': { '포항시': '47110', '경주시': '47130', '구미시': '47190', '김천시': '47150', '안동시': '47170' },
  '경상남도': { '창원시': '48120', '김해시': '48250', '진주시': '48170', '양산시': '48330', '거제시': '48310' },
  '제주특별자치도': { '제주시': '50110', '서귀포시': '50130' },
};

function getRegionCode(sido: string, gugun: string): string | null {
  // 시/도 이름 정규화 (약칭 → 전체)
  const sidoNorm = sido.replace(/\s/g, '');
  for (const [key, districts] of Object.entries(REGION_CODES)) {
    if (key.includes(sidoNorm) || sidoNorm.includes(key.replace(/특별시|광역시|특별자치시|특별자치도|도/g, ''))) {
      const gugunNorm = gugun.replace(/\s/g, '');
      for (const [dKey, code] of Object.entries(districts)) {
        if (dKey.includes(gugunNorm) || gugunNorm.includes(dKey)) {
          return code;
        }
      }
    }
  }
  return null;
}

interface AptTradeItem {
  거래금액: string;
  건축년도: string;
  년: string;
  월: string;
  일: string;
  법정동: string;
  아파트: string;
  전용면적: string;
  층: string;
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

  let realTransactions: RealTransactionRow[] = [];
  const landPrices: LandPriceRow[] = [];

  if (!apiKey) {
    warnings.push('DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다. 실거래가/공시지가 데이터를 수동으로 입력해주세요.');
    return {
      realTransactions: { data: [], source: '미설정', retrievedAt: '' },
      officialLandPrice: { data: [], source: '미설정', retrievedAt: '' },
      warnings,
    };
  }

  // ── 아파트 실거래가 API ──
  try {
    const regionCode = getRegionCode(params.sido, params.gugun);
    if (!regionCode) {
      warnings.push(`법정동코드를 찾을 수 없습니다: ${params.sido} ${params.gugun}. 실거래가 수동 입력 필요.`);
    } else {
      // 최근 3개월 데이터 조회
      const today = new Date();
      const months: string[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const allItems: AptTradeItem[] = [];
      for (const dealYmd of months) {
        try {
          const url = `http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev?serviceKey=${encodeURIComponent(apiKey)}&LAWD_CD=${regionCode}&DEAL_YMD=${dealYmd}&pageNo=1&numOfRows=100`;
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) continue;
          const text = await res.text();

          // XML 파싱 (간단한 정규식)
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let match;
          while ((match = itemRegex.exec(text)) !== null) {
            const xml = match[1];
            const get = (tag: string) => {
              const m = xml.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`));
              return m ? m[1].trim() : '';
            };
            allItems.push({
              거래금액: get('거래금액') || get('dealAmount'),
              건축년도: get('건축년도') || get('buildYear'),
              년: get('년') || get('dealYear'),
              월: get('월') || get('dealMonth'),
              일: get('일') || get('dealDay'),
              법정동: get('법정동') || get('umdNm') || get('dongNm'),
              아파트: get('아파트') || get('aptNm'),
              전용면적: get('전용면적') || get('excluUseAr'),
              층: get('층') || get('floor'),
            });
          }
        } catch {
          // 개별 월 실패는 무시
        }
      }

      // 동 필터 (dong이 있으면 해당 동만)
      let filtered = allItems;
      if (params.dong) {
        const dongNorm = params.dong.replace(/동$/, '');
        filtered = allItems.filter(item =>
          item.법정동.includes(dongNorm) || item.법정동.includes(params.dong)
        );
        // 필터 결과가 없으면 전체 사용
        if (filtered.length === 0) filtered = allItems;
      }

      // 최근 20건만
      realTransactions = filtered.slice(0, 20).map(item => {
        const areaSqm = parseFloat(item.전용면적) || 0;
        const areaPyeong = areaSqm / 3.3058;
        const price = parseInt(item.거래금액.replace(/,/g, ''), 10) / 100 || 0; // 만원→백만원
        const pricePerPyeong = areaPyeong > 0 ? Math.round(price / areaPyeong * 100) / 100 : 0;
        return {
          address: `${params.gugun} ${item.법정동}`.trim(),
          buildingName: item.아파트,
          areaSqm: Math.round(areaSqm * 100) / 100,
          price: Math.round(price),
          pricePerPyeong: Math.round(pricePerPyeong * 100) / 100,
          transactionDate: `${item.년}.${item.월.padStart(2, '0')}.${item.일.padStart(2, '0')}`,
          floor: item.층,
        };
      });

      if (realTransactions.length > 0) {
        warnings.push(`실거래가 ${realTransactions.length}건 자동 조회 완료`);
      } else {
        warnings.push('실거래가 조회 결과가 없습니다. 수동 입력 가능.');
      }
    }
  } catch (err) {
    warnings.push(`실거래가 API 호출 실패: ${String(err)}. 수동 입력 가능.`);
  }

  // ── 공시지가 (API 키 미신청 — placeholder) ──
  try {
    warnings.push('공시지가 API 연동 준비 중 — 수동 입력 가능');
  } catch (err) {
    warnings.push(`공시지가 API 호출 실패: ${String(err)}`);
  }

  return {
    realTransactions: {
      data: realTransactions,
      source: '국토교통부 실거래가 공개시스템',
      retrievedAt: now,
    },
    officialLandPrice: {
      data: landPrices,
      source: '국토교통부 부동산공시가격',
      retrievedAt: '',
    },
    warnings,
  };
}
