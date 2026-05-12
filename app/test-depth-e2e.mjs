/**
 * E2E 검증: 로컬에서 DART API 직접 호출하여 여러 산업 기업의 depth 분류 확인
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DART_API_KEY = process.env.DART_API_KEY || process.env.NEXT_PUBLIC_DART_API_KEY;
if (!DART_API_KEY) { console.error("DART_API_KEY not found in .env.local"); process.exit(1); }

// 직접 DART API 호출 (corp_code 사전 조회 스킵, 알려진 기업 코드 사용)
const TEST_COMPANIES = [
  { name: "삼성전자",           corpCode: "00126380", stockCode: "005930", industry: "제조업(전자)" },
  { name: "LG화학",             corpCode: "00356361", stockCode: "051910", industry: "제조업(화학)" },
  { name: "카카오",             corpCode: "00258801", stockCode: "035720", industry: "IT/서비스" },
  { name: "SK하이닉스",         corpCode: "00164779", stockCode: "000660", industry: "제조업(반도체)" },
];

// fnlttSinglAcntAll API 호출
async function fetchDartFinancial(corpCode, year, reprtCode) {
  const url = `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${DART_API_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reprtCode}&fs_div=OFS`;
  const res = await fetch(url);
  const data = await res.json();
  return data.status === "000" ? data.list || [] : [];
}

// ── detectAccountDepth 복제 (dart-api.ts에서 최신 버전) ──
const DEPTH0_KEYWORDS = new Set([
  "자산총계", "자산합계", "부채총계", "부채합계", "자본총계", "자본합계",
  "부채와자본총계", "부채및자본총계", "자본과부채총계", "부채와자본합계",
  "매출액", "영업수익", "영업이익", "영업이익(손실)", "영업손실", "영업손익",
  "당기순이익", "당기순이익(손실)", "당기순손실", "당기순손익",
  "반기순이익", "반기순손실", "분기순이익", "분기순손실",
  "법인세비용차감전순이익", "법인세비용차감전순손익",
  "법인세비용차감전순손실", "법인세비용차감전이익",
  "법인세비용차감전손실", "법인세비용차감전손익",
  "법인세차감전순이익", "법인세차감전순손실",
  "법인세차감전계속영업이익", "법인세차감전계속영업손실",
  "총포괄손익", "총포괄이익", "당기총포괄손익", "당기총포괄이익",
  "반기총포괄손익", "분기총포괄손익",
  "공사수익", "도급수익", "건설수익", "분양수익",
  "보험수익", "보험료수익", "수입보험료",
  "순영업수익", "순영업수익합계", "영업수익합계",
  "이자수익합계", "순이자손익",
]);

const DEPTH1_KEYWORDS = new Set([
  "유동자산", "비유동자산", "유동부채", "비유동부채",
  "당좌자산", "고정자산", "고정부채",
  "투자자산", "재고자산", "기타비유동자산", "투자부동산",
  "자본금", "자본잉여금", "자본조정",
  "이익잉여금", "결손금",
  "기타포괄손익누계액", "기타자본항목", "기타자본구성요소",
  "매각예정자산", "매각예정부채",
  "지배기업지분", "지배기업소유주지분", "지배주주지분",
  "비지배지분", "소수주주지분",
  "연결자본잉여금", "연결이익잉여금", "연결기타포괄손익누계액",
  "현금및예치금", "유가증권", "대출채권",
  "차입부채", "기타부채", "기타자산",
  "파생상품자산", "파생상품부채",
  "당기손익인식금융자산", "기타포괄손익인식금융자산",
  "상각후원가측정금융자산", "당기손익-공정가치측정금융자산",
  "기타포괄손익-공정가치측정금융자산",
  "보험계약자산", "보험계약부채", "재보험자산", "재보험부채",
  "매출원가", "매출총이익", "매출총이익(손실)", "매출총손실",
  "판매비와관리비", "판매비와일반관리비", "판관비",
  "영업외수익", "영업외비용",
  "기타수익", "기타비용", "기타영업외수익", "기타영업외비용",
  "금융수익", "금융비용", "금융원가", "순금융수익", "순금융비용", "순금융원가",
  "법인세비용", "법인세수익", "법인세비용(수익)",
  "계속영업이익", "계속영업손실", "계속영업이익(손실)",
  "중단영업이익", "중단영업손실", "중단영업이익(손실)", "중단영업손익",
  "기타포괄손익", "기타포괄이익", "기타포괄손실",
  "수익(매출액)",
  "이자수익", "이자비용",
  "대출평가및처분손실", "대출채권평가및처분손실", "대출채권평가및처분이익",
  "유가증권평가및처분손실", "유가증권평가및처분이익",
  "수수료수익", "수수료비용",
  "공사원가", "도급원가", "건설원가", "분양원가",
  "보험서비스비용", "보험금비용", "보험서비스수익",
]);

function detectAccountDepth(accountNm) {
  const nm = accountNm.replace(/\s/g, "");
  if (DEPTH0_KEYWORDS.has(nm)) return 0;
  if (DEPTH1_KEYWORDS.has(nm)) return 1;
  if (/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVivx]+[.·]/.test(nm)) return 1;
  if (/^\([0-9]+\)/.test(nm)) return 1;
  if (/^[0-9]+[.·]/.test(nm)) return 2;
  if (nm.includes("소계") || nm.includes("합계")) return 1;
  return 2;
}

function refineDepthBySumDetection(rows, yearData, displayYears) {
  if (rows.length < 3 || displayYears.length === 0) return;
  const targetYear = displayYears[displayYears.length - 1];
  const vals = yearData[targetYear] || {};
  const getVal = (nm) => {
    const raw = vals[nm];
    if (!raw || raw === "-" || raw === "") return null;
    const v = parseFloat(String(raw).replace(/,/g, ""));
    return isNaN(v) ? null : v;
  };

  let skipUntil = -1;
  for (let i = 0; i < rows.length - 1; i++) {
    const cur = rows[i];
    if (cur.depth !== 2) { skipUntil = -1; continue; }
    if (i <= skipUntil) continue;
    const parentVal = getVal(cur.nm);
    if (parentVal === null || parentVal === 0) continue;
    let sum = 0, childCount = 0, lastChildIdx = i;
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j];
      if (next.depth <= 1) break;
      const v = getVal(next.nm);
      if (v !== null) { sum += v; childCount++; lastChildIdx = j; }
    }
    if (childCount >= 2 && Math.abs(sum - parentVal) <= 1) {
      cur.depth = 1;
      skipUntil = lastChildIdx;
    }
  }
}

async function testCompany({ name, corpCode, stockCode, industry }) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🏢 ${name} (${industry})`);

  try {
    const items = await fetchDartFinancial(corpCode, "2024", "11011");
    if (!items.length) {
      console.log(`  ⚠ DART 데이터 없음`);
      return false;
    }

    // BS/IS 분리
    const bsItems = items.filter(it => it.sj_div === "BS").sort((a, b) => parseInt(a.ord || "999") - parseInt(b.ord || "999"));
    const isItems = items.filter(it => it.sj_div === "IS" || it.sj_div === "CIS").sort((a, b) => parseInt(a.ord || "999") - parseInt(b.ord || "999"));

    // depth 추론
    const processItems = (rawItems, label) => {
      const seen = new Set();
      const accountOrder = [];
      const yearData = {};
      for (const it of rawItems) {
        const nm = it.account_nm.trim();
        if (!nm) continue;
        if (!seen.has(nm)) {
          seen.add(nm);
          accountOrder.push({ nm, depth: detectAccountDepth(nm) });
        }
        // 금액 수집 (thstrm_amount = 당기)
        if (it.thstrm_amount && it.thstrm_amount !== "-") {
          if (!yearData["2024"]) yearData["2024"] = {};
          yearData["2024"][nm] = it.thstrm_amount;
        }
      }

      // 합계 감지 적용
      refineDepthBySumDetection(accountOrder, yearData, ["2024"]);

      const d0 = accountOrder.filter(r => r.depth === 0).length;
      const d1 = accountOrder.filter(r => r.depth === 1).length;
      const d2 = accountOrder.filter(r => r.depth === 2).length;
      console.log(`  ${label}: depth0=${d0}, depth1=${d1}, depth2=${d2}, total=${accountOrder.length}`);

      // 트리 출력
      console.log(`\n  ${label} 계층 구조:`);
      for (const r of accountOrder.slice(0, 40)) {
        const prefix = r.depth === 0 ? "■" : r.depth === 1 ? "  ├" : "    └";
        console.log(`  ${prefix} ${r.nm}`);
      }
      if (accountOrder.length > 40) console.log(`  ... 외 ${accountOrder.length - 40}개`);

      return { d0, d1, d2 };
    };

    const bs = processItems(bsItems, "BS");
    const is = processItems(isItems, "IS");

    const bsOk = bs.d0 >= 3 && bs.d1 >= 1;
    const isOk = is.d0 >= 2 && is.d1 >= 1;
    console.log(`\n  검증: BS ${bsOk ? "✓" : "✗"}, IS ${isOk ? "✓" : "✗"}`);
    return bsOk && isOk;
  } catch (e) {
    console.log(`  ❌ 에러: ${e.message}`);
    return false;
  }
}

async function main() {
  let passed = 0;
  for (const company of TEST_COMPANIES) {
    const ok = await testCompany(company);
    if (ok) passed++;
  }
  console.log(`\n${"═".repeat(60)}`);
  console.log(`E2E 결과: ${passed}/${TEST_COMPANIES.length} 기업 통과`);
  if (passed < TEST_COMPANIES.length) process.exit(1);
}

main().catch(console.error);
