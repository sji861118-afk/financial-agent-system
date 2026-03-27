/**
 * NICE BizAPI 연동 모듈
 * =======================
 * NICE BizLine의 실제 기업신용등급(기업평가등급)을 조회합니다.
 *
 * API: [OCGD01] [기업]등급-기업평가등급
 * URL: GET https://api.nicebizline.com/api/opengate/v1/company/grade/{companyKey}/credit-rating
 * 인증: client-id, client-secret 헤더
 * companyKey: 사업자번호(bizno), 법인번호(crpno), 업체코드(upchecd) 중 하나
 *
 * 설정: .env.local에 다음 2개 추가
 *   NICE_CLIENT_ID=xxx
 *   NICE_CLIENT_SECRET=xxx
 */

const NICE_API_BASE = "https://api.nicebizline.com/api/opengate/v1";

function getCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.NICE_CLIENT_ID;
  const clientSecret = process.env.NICE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export interface NiceCreditRating {
  grade: string;        // e.g. "AA+", "BBB", "A-"
  gradeDate: string;    // 평가기준일 (yyyymmdd)
  gradeEndDate: string; // 평가종료일
  gradeAgency: string;  // 평가기관
  available: boolean;
}

// NICE 등급코드 → 표시 등급 변환
const GRADE_CODE_MAP: Record<string, string> = {
  "AAA": "AAA", "AA+": "AA+", "AA0": "AA", "AA-": "AA-",
  "A+": "A+", "A0": "A", "A-": "A-",
  "BBB+": "BBB+", "BBB0": "BBB", "BBB-": "BBB-",
  "BB+": "BB+", "BB0": "BB", "BB-": "BB-",
  "B+": "B+", "B0": "B", "B-": "B-",
  "CCC+": "CCC+", "CCC0": "CCC", "CCC-": "CCC-",
  "CC": "CC", "C": "C", "D": "D",
  "R": "등급보류", "NR": "미평가",
};

function formatGrade(raw: string): string {
  if (!raw) return "";
  const upper = raw.trim().toUpperCase();
  return GRADE_CODE_MAP[upper] || upper;
}

function formatDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8 || yyyymmdd === "99991231") return "";
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6)}`;
}

/**
 * NICE BizAPI로 기업 기업평가등급 조회
 * @param bizrNo 사업자번호 (10자리)
 * @param corpName 기업명 (로그용)
 */
export async function fetchNiceCreditRating(
  corpName: string,
  bizrNo?: string
): Promise<NiceCreditRating | null> {
  const creds = getCredentials();
  if (!creds) {
    console.log("[NICE] NICE_CLIENT_ID/SECRET 미설정 → 등급 조회 건너뜀");
    return null;
  }

  // companyKey: 사업자번호 우선, 없으면 기업명으로는 조회 불가
  const companyKey = bizrNo?.replace(/-/g, "");
  if (!companyKey) {
    console.log(`[NICE] ${corpName} 사업자번호 없음 → 등급 조회 불가`);
    return null;
  }

  try {
    const url = `${NICE_API_BASE}/company/grade/${companyKey}/credit-rating?pageSize=5`;

    const res = await fetch(url, {
      headers: {
        "accept": "application/json",
        "client-id": creds.clientId,
        "client-secret": creds.clientSecret,
      },
    });

    if (!res.ok) {
      console.error(`[NICE] API 오류 ${res.status}: ${corpName} (${companyKey})`);
      return null;
    }

    const d = await res.json();
    const list = d?.data?.creditRatingList;

    if (!list || !list.length) {
      console.log(`[NICE] ${corpName} 등급 데이터 없음`);
      // message 확인
      if (d?.data?.message) console.log(`[NICE] message: ${d.data.message}`);
      return null;
    }

    // 가장 최근 유효 등급 (grdEndDate가 99991231인 것 = 현재 유효)
    const current = list.find((item: { grdEndDate: string }) => item.grdEndDate === "99991231") || list[0];
    const rawGrade = current.crgrade || current.trangrade || "";
    const grade = formatGrade(rawGrade);

    if (!grade || grade === "등급보류" || grade === "미평가") {
      console.log(`[NICE] ${corpName} 등급: ${grade || rawGrade} (유효 등급 없음)`);
      return null;
    }

    const gradeDate = formatDate(current.grdBaseDate);
    console.log(`[NICE] ${corpName} 기업평가등급: ${grade} (${gradeDate})`);

    return {
      grade,
      gradeDate,
      gradeEndDate: formatDate(current.grdEndDate),
      gradeAgency: "NICE평가정보",
      available: true,
    };
  } catch (e) {
    console.error(`[NICE] ${corpName} API 호출 오류:`, e);
    return null;
  }
}
