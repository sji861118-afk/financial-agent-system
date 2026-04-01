/**
 * 상품 유형 분류 모듈
 * - 대분류 + 소분류 체계
 * - 텍스트/딜 정보 기반 자동 분류
 *
 * Ported from: 5.검토여신/src/core/product_types.py
 */

import type { ProductMajorType, ViewpointCategory } from "@/types/review";

// ── 상품 유형 정의 ──

export const PRODUCT_TYPES: Record<ProductMajorType, string[]> = {
  PF: ["부동산PF", "시설PF", "토지PF", "리파이낸싱"],
  브릿지: ["토지브릿지", "건축브릿지", "인수금융브릿지"],
  기업신용: ["운영자금", "시설자금", "차환"],
  사모사채: ["무보증사채", "담보부사채", "전환사채/BW"],
  담보대출: ["부동산담보", "미분양담보", "지분담보", "매출채권담보", "기타담보"],
};

export const MAJOR_TYPES: ProductMajorType[] = Object.keys(
  PRODUCT_TYPES
) as ProductMajorType[];

// 소분류 → 대분류 역매핑
export const SUBTYPE_TO_MAJOR: Record<string, ProductMajorType> = {};
for (const [major, subs] of Object.entries(PRODUCT_TYPES)) {
  for (const sub of subs) {
    SUBTYPE_TO_MAJOR[sub] = major as ProductMajorType;
  }
}

// ── viewpoint 카테고리 ──

export const VP_CATEGORIES: ViewpointCategory[] = [
  "입지/시장",
  "재무/신용",
  "구조/규모",
  "담보/보전",
  "인허가/법률",
  "사업성/수익성",
  "시공/공사",
  "기타",
];

// ── 대분류 판정 ──

export function classifyProductType(
  text: string,
  deal?: { 구분?: string }
): { major: ProductMajorType; sub: string } {
  const 구분 = deal?.구분 ?? "";
  const combined = `${구분} ${text.slice(0, 5000)}`.toLowerCase();

  let major: ProductMajorType;
  let sub: string;

  // 대분류
  if (/pf|프로젝트금융|프로젝트\s*파이낸/.test(combined)) {
    major = "PF";
  } else if (/브릿지|bridge|브리지/.test(combined)) {
    major = "브릿지";
  } else if (/사모사채|사채|회사채|bond/.test(combined)) {
    major = "사모사채";
  } else if (/담보/.test(combined)) {
    major = "담보대출";
  } else {
    major = "기업신용";
  }

  // 소분류
  if (major === "PF") {
    if (/리파이낸싱|refi|차환|만기연장/.test(combined)) {
      sub = "리파이낸싱";
    } else if (/시설|인프라|발전|에너지/.test(combined)) {
      sub = "시설PF";
    } else if (
      /토지(?!신탁)|용지/.test(combined) &&
      !/건축|시공|준공/.test(combined)
    ) {
      sub = "토지PF";
    } else {
      sub = "부동산PF";
    }
  } else if (major === "브릿지") {
    if (/인수|acquisition/.test(combined)) {
      sub = "인수금융브릿지";
    } else if (/건축|시공|착공/.test(combined)) {
      sub = "건축브릿지";
    } else {
      sub = "토지브릿지";
    }
  } else if (major === "사모사채") {
    if (/전환|cb|bw|신주인수/.test(combined)) {
      sub = "전환사채/BW";
    } else if (/담보부|유담보/.test(combined)) {
      sub = "담보부사채";
    } else {
      sub = "무보증사채";
    }
  } else if (major === "담보대출") {
    if (/미분양/.test(combined)) {
      sub = "미분양담보";
    } else if (/지분|주식담보|출자지분/.test(combined)) {
      sub = "지분담보";
    } else if (
      /부동산|토지|건물|아파트|오피스|빌딩|상가/.test(combined)
    ) {
      sub = "부동산담보";
    } else if (/매출채권담보|ar담보|receivable/.test(combined)) {
      sub = "매출채권담보";
    } else {
      sub = "기타담보";
    }
  } else {
    // 기업신용
    if (/차환|rollover|만기연장/.test(combined)) {
      sub = "차환";
    } else if (/시설|설비|장비/.test(combined)) {
      sub = "시설자금";
    } else {
      sub = "운영자금";
    }
  }

  return { major, sub };
}

// ── 자동 태그 추출 ──

export function autoTags(
  text: string,
  deal?: { 구분?: string; 주소?: string }
): string[] {
  const tags = new Set<string>();
  const combined = `${deal?.구분 ?? ""} ${deal?.주소 ?? ""} ${text.slice(0, 3000)}`;

  // 지역
  for (const region of [
    "CBD", "GBD", "YBD", "강남", "여의도", "종로", "마포", "성수", "판교",
  ]) {
    if (combined.toLowerCase().includes(region.toLowerCase())) {
      tags.add(region);
    }
  }

  // 용도
  for (const use of [
    "오피스", "주거", "상업", "물류", "호텔", "지식산업센터", "생활숙박",
  ]) {
    if (combined.includes(use)) tags.add(use);
  }

  // 구조
  for (const struct of [
    "Tranche", "트렌치", "메자닌", "선순위", "후순위", "PEF",
  ]) {
    if (combined.toLowerCase().includes(struct.toLowerCase())) {
      tags.add(struct);
    }
  }

  // 특성
  for (const feat of [
    "정비사업", "재개발", "재건축", "신탁", "책임준공", "분양", "임대",
    "유동화", "ABL", "매출채권", "연대보증", "사업촉진비",
  ]) {
    if (combined.includes(feat)) tags.add(feat);
  }

  return [...tags].sort();
}
