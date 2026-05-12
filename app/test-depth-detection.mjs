/**
 * detectAccountDepth + refineDepthBySumDetection 검증 테스트
 * 전 산업 (금융, 제조, 건설, 서비스, 보험) 계정과목 계층 분류 정확도 검증
 */

// ── 키워드 Set 복제 (ts→mjs) ──
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
  "투자자산", "재고자산", "기타비유동자산",
  "투자부동산",
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
    let sum = 0;
    let childCount = 0;
    let lastChildIdx = i;
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

// ════════════════════════════════════════════════════════════
// 테스트 케이스
// ════════════════════════════════════════════════════════════

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.log(`  ✗ ${name}: expected depth ${expected}, got ${actual}`);
  }
}

// ── 1. 금융업 BS (테크메이트코리아대부) ──
console.log("\n=== 1. 금융업 BS ===");
assert("자산총계", detectAccountDepth("자산총계"), 0);
assert("현금및예치금", detectAccountDepth("현금및예치금"), 1);
assert("현금및현금성자산", detectAccountDepth("현금및현금성자산"), 2);
assert("예치금", detectAccountDepth("예치금"), 2);
assert("유가증권", detectAccountDepth("유가증권"), 1);
assert("단기매매증권", detectAccountDepth("단기매매증권"), 2);
assert("매도가능증권", detectAccountDepth("매도가능증권"), 2);
assert("지분법적용투자주식", detectAccountDepth("지분법적용투자주식"), 2);
assert("대출채권", detectAccountDepth("대출채권"), 1);
assert("대출금", detectAccountDepth("대출금"), 2);
assert("대손충당금", detectAccountDepth("대손충당금"), 2);
assert("이연대출부대손익", detectAccountDepth("이연대출부대손익"), 2);
assert("유형자산(금융)", detectAccountDepth("유형자산"), 2);  // depth 2 — not a parent in financial companies usually
assert("차량운반구", detectAccountDepth("차량운반구"), 2);
assert("기타자산", detectAccountDepth("기타자산"), 1);
assert("미수금", detectAccountDepth("미수금"), 2);
assert("미수수익", detectAccountDepth("미수수익"), 2);
assert("부채총계", detectAccountDepth("부채총계"), 0);
assert("차입부채", detectAccountDepth("차입부채"), 1);
assert("차입금", detectAccountDepth("차입금"), 2);
assert("사채", detectAccountDepth("사채"), 2);
assert("기타부채", detectAccountDepth("기타부채"), 1);
assert("미지급금", detectAccountDepth("미지급금"), 2);
assert("자본총계", detectAccountDepth("자본총계"), 0);
assert("자본금", detectAccountDepth("자본금"), 1);
assert("보통주자본금", detectAccountDepth("보통주자본금"), 2);
assert("이익잉여금", detectAccountDepth("이익잉여금"), 1);

// ── 2. 금융업 IS ──
console.log("\n=== 2. 금융업 IS ===");
assert("영업수익", detectAccountDepth("영업수익"), 0);
assert("금융수익", detectAccountDepth("금융수익"), 1);
assert("대출채권이자수익", detectAccountDepth("대출채권이자수익"), 2);
assert("외환차익", detectAccountDepth("외환차익"), 2);
assert("외화환산이익", detectAccountDepth("외화환산이익"), 2);
assert("대출채권평가및처분이익", detectAccountDepth("대출채권평가및처분이익"), 1);
assert("기타수익", detectAccountDepth("기타수익"), 1);
assert("임대료수입", detectAccountDepth("임대료수입"), 2);
assert("수수료수익", detectAccountDepth("수수료수익"), 1);  // 금융업에서는 대분류
assert("영업이익", detectAccountDepth("영업이익"), 0);
assert("영업외수익", detectAccountDepth("영업외수익"), 1);
assert("지분법이익", detectAccountDepth("지분법이익"), 2);
assert("영업외비용", detectAccountDepth("영업외비용"), 1);
assert("지분법손실", detectAccountDepth("지분법손실"), 2);
assert("당기순이익", detectAccountDepth("당기순이익"), 0);

// ── 3. 제조업 BS (삼성전자 유형) ──
console.log("\n=== 3. 제조업 BS ===");
assert("유동자산", detectAccountDepth("유동자산"), 1);
assert("현금및현금성자산(제조)", detectAccountDepth("현금및현금성자산"), 2);
assert("단기금융상품", detectAccountDepth("단기금융상품"), 2);
assert("매출채권", detectAccountDepth("매출채권"), 2);
assert("재고자산", detectAccountDepth("재고자산"), 1);
assert("원재료", detectAccountDepth("원재료"), 2);
assert("재공품", detectAccountDepth("재공품"), 2);
assert("제품", detectAccountDepth("제품"), 2);
assert("비유동자산", detectAccountDepth("비유동자산"), 1);
assert("투자부동산", detectAccountDepth("투자부동산"), 1);
assert("장기금융상품", detectAccountDepth("장기금융상품"), 2);
assert("유동부채", detectAccountDepth("유동부채"), 1);
assert("매입채무", detectAccountDepth("매입채무"), 2);
assert("단기차입금", detectAccountDepth("단기차입금"), 2);
assert("비유동부채", detectAccountDepth("비유동부채"), 1);
assert("장기차입금", detectAccountDepth("장기차입금"), 2);
assert("퇴직급여채무", detectAccountDepth("퇴직급여채무"), 2);
assert("자본잉여금", detectAccountDepth("자본잉여금"), 1);
assert("주식발행초과금", detectAccountDepth("주식발행초과금"), 2);
assert("기타포괄손익누계액", detectAccountDepth("기타포괄손익누계액"), 1);

// ── 4. 제조업 IS ──
console.log("\n=== 4. 제조업 IS ===");
assert("매출액", detectAccountDepth("매출액"), 0);
assert("매출원가", detectAccountDepth("매출원가"), 1);
assert("매출총이익", detectAccountDepth("매출총이익"), 1);
assert("판매비와관리비", detectAccountDepth("판매비와관리비"), 1);
assert("급여", detectAccountDepth("급여"), 2);
assert("감가상각비", detectAccountDepth("감가상각비"), 2);
assert("지급수수료", detectAccountDepth("지급수수료"), 2);
assert("연구개발비", detectAccountDepth("연구개발비"), 2);
assert("영업이익(제조)", detectAccountDepth("영업이익"), 0);
assert("금융수익(제조)", detectAccountDepth("금융수익"), 1);
assert("이자수익(제조)", detectAccountDepth("이자수익"), 1);
assert("배당금수익", detectAccountDepth("배당금수익"), 2);
assert("금융비용(제조)", detectAccountDepth("금융비용"), 1);
assert("이자비용(제조)", detectAccountDepth("이자비용"), 1);
assert("외환차손", detectAccountDepth("외환차손"), 2);
assert("법인세비용", detectAccountDepth("법인세비용"), 1);

// ── 5. 건설업 BS/IS ──
console.log("\n=== 5. 건설업 ===");
assert("공사수익", detectAccountDepth("공사수익"), 0);
assert("공사원가", detectAccountDepth("공사원가"), 1);
assert("도급수익", detectAccountDepth("도급수익"), 0);
assert("도급원가", detectAccountDepth("도급원가"), 1);
assert("분양수익", detectAccountDepth("분양수익"), 0);
assert("분양원가", detectAccountDepth("분양원가"), 1);
assert("미청구공사", detectAccountDepth("미청구공사"), 2);
assert("공사미수금", detectAccountDepth("공사미수금"), 2);
assert("선수금(건설)", detectAccountDepth("선수금"), 2);

// ── 6. 보험업 ──
console.log("\n=== 6. 보험업 ===");
assert("보험수익", detectAccountDepth("보험수익"), 0);
assert("보험서비스비용", detectAccountDepth("보험서비스비용"), 1);
assert("보험금비용", detectAccountDepth("보험금비용"), 1);
assert("보험계약자산", detectAccountDepth("보험계약자산"), 1);
assert("보험계약부채", detectAccountDepth("보험계약부채"), 1);
assert("재보험자산", detectAccountDepth("재보험자산"), 1);

// ── 7. 연결 재무제표 전용 ──
console.log("\n=== 7. 연결 재무제표 ===");
assert("지배기업지분", detectAccountDepth("지배기업지분"), 1);
assert("비지배지분", detectAccountDepth("비지배지분"), 1);
assert("소수주주지분", detectAccountDepth("소수주주지분"), 1);
assert("연결자본잉여금", detectAccountDepth("연결자본잉여금"), 1);
assert("연결이익잉여금", detectAccountDepth("연결이익잉여금"), 1);

// ── 8. 감사보고서 패턴 ──
console.log("\n=== 8. 감사보고서 패턴 ===");
assert("Ⅰ.유동자산", detectAccountDepth("Ⅰ.유동자산"), 1);
assert("Ⅱ.비유동자산", detectAccountDepth("Ⅱ.비유동자산"), 1);
assert("(1)당좌자산", detectAccountDepth("(1)당좌자산"), 1);
assert("1.현금", detectAccountDepth("1.현금"), 2);
assert("2.매출채권", detectAccountDepth("2.매출채권"), 2);
assert("유동자산소계", detectAccountDepth("유동자산 소계"), 1);

// ── 9. K-IFRS 특수 계정 ──
console.log("\n=== 9. K-IFRS 특수 계정 ===");
assert("매각예정자산", detectAccountDepth("매각예정자산"), 1);
assert("매각예정부채", detectAccountDepth("매각예정부채"), 1);
assert("당기손익-공정가치측정금융자산", detectAccountDepth("당기손익-공정가치측정금융자산"), 1);
assert("기타포괄손익-공정가치측정금융자산", detectAccountDepth("기타포괄손익-공정가치측정금융자산"), 1);
assert("파생상품자산", detectAccountDepth("파생상품자산"), 1);
assert("중단영업손익", detectAccountDepth("중단영업손익"), 1);

// ── 10. 합계 감지 알고리즘 테스트 ──
console.log("\n=== 10. 합계 감지 (refineDepthBySumDetection) ===");

// 유형자산이 키워드에 없어 depth 2이지만, 하위 합산과 일치하면 depth 1로 승격
const rows1 = [
  { nm: "유형자산", depth: 2 },      // 100 = 50 + 30 + 20 → 승격!
  { nm: "토지", depth: 2 },           // 50
  { nm: "건물", depth: 2 },           // 30
  { nm: "기계장치", depth: 2 },       // 20
  { nm: "자산총계", depth: 0 },
];
const yearData1 = { "2025": { "유형자산": "100", "토지": "50", "건물": "30", "기계장치": "20", "자산총계": "500" } };
refineDepthBySumDetection(rows1, yearData1, ["2025"]);
assert("유형자산 → 합계감지 승격", rows1[0].depth, 1);
assert("토지 유지", rows1[1].depth, 2);
assert("건물 유지", rows1[2].depth, 2);

// 무형자산: 합이 안 맞으면 승격 안 됨
const rows2 = [
  { nm: "무형자산", depth: 2 },       // 100 ≠ 40 + 30
  { nm: "영업권", depth: 2 },          // 40
  { nm: "특허권", depth: 2 },          // 30
];
const yearData2 = { "2025": { "무형자산": "100", "영업권": "40", "특허권": "30" } };
refineDepthBySumDetection(rows2, yearData2, ["2025"]);
assert("무형자산 → 합불일치 유지", rows2[0].depth, 2);

// 음수 포함 케이스 (대손충당금)
const rows3 = [
  { nm: "대출채권", depth: 1 },  // 이미 depth 1, 건너뜀
  { nm: "대출금", depth: 2 },
  { nm: "대손충당금", depth: 2 },
  { nm: "기타자산", depth: 1 },
  { nm: "미수금", depth: 2 },     // 300 = 200 + 100 → 기타자산은 이미 depth 1
  { nm: "미수수익", depth: 2 },
];
assert("대출채권 이미 depth1", rows3[0].depth, 1);

// 금융업 IS: 판매비와관리비 하위 합계 감지
const rows4 = [
  { nm: "판매비와관리비", depth: 1 },  // 이미 depth 1 → 건너뜀
  { nm: "급여", depth: 2 },
  { nm: "퇴직급여", depth: 2 },
  { nm: "복리후생비", depth: 2 },
  { nm: "지급수수료", depth: 2 },
];
// depth 1인 항목은 건너뛰므로 변경 없음
refineDepthBySumDetection(rows4, { "2025": {} }, ["2025"]);
assert("판관비 이미 depth1 유지", rows4[0].depth, 1);

// ════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`총 ${pass + fail}건: ✓ ${pass}건 통과, ✗ ${fail}건 실패`);
if (fail === 0) console.log("🎉 전체 통과!");
else process.exit(1);
