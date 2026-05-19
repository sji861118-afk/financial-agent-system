import type { AuditOpinionInfo } from "@/lib/dart-api";
import type { Cells24, WarningFlags, YN } from "./types";

/**
 * 부실징후 자동 판정 룰.
 *
 *   ⚠️ 이 파일의 judgeWarnings() 본문은 의도적으로 비어 있다.
 *   여신심사 도메인 룰 자체이므로 시니어 심사역의 판단이 반영되어야 한다.
 *
 *   본문 작성 가이드: 같은 디렉토리의 README 또는 sjI861118 노트 참조.
 *   참고 데이터(PDF "전수조사 부실징후점검 OO지점" 1행 = 한국토지신탁):
 *     - 직전년도 자본총계 892,910 > 0       → 완전자본잠식 N
 *     - 직전년도 차입금 677,193 > 매출액 193,915  → 차입금>매출액 Y
 *     - 당기순손익 3년: 24,074 / 27,922 / 25,247  → 모두 양수 → 3년연속결손 N
 */

const fmt = (v: number): string =>
  v === 0 ? "0" : v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

/** 백만원 단위 포맷 (DART raw는 원 단위) */
const fmtMillions = (v: number): string => fmt(Math.round(v / 1_000_000));

export interface JudgeWarningsContext {
  cells: Cells24;
  years: string[];                       // [직전, 직전전, 직전전전]
  opinion: AuditOpinionInfo | null;      // 감사의견 (없으면 "-" 표시)
}

/**
 * 4개 자동 판정 + evidence 문자열 작성.
 * manual 4개는 기본 "N"으로 두고 UI에서 사용자가 직접 수정.
 *
 * ⚠️ TODO (사용자 작성 — 약 30~40줄):
 *   - 4개 룰의 정확한 비교/매칭 + evidence 문자열 작성
 *   - 데이터 결측(0) 처리 정책 (Y/N/- 어느 것?)
 *   - "한정" 의견을 거절로 볼지 여부 (현재 미정)
 */
export function judgeWarnings(ctx: JudgeWarningsContext): WarningFlags {
  const { cells, years, opinion } = ctx;
  const [y1, y2, y3] = years;
  const c1 = cells.byYear[y1];
  const c2 = cells.byYear[y2];
  const c3 = cells.byYear[y3];

  const flags: WarningFlags = {
    threeYearsLoss: "-",
    fullCapitalImpair: "-",
    borrowGtRevenue: "-",
    auditOpinionReject: "-",
    internalConflict: "N",
    operationStopped: "N",
    bankruptcy: "N",
    consortiumLoan: "N",
    evidence: {},
  };

  // ─── ① 3년연속결손 ───
  // 정책: "최근년도 기준" — c1(최근결산일) 데이터가 가장 우선
  //   • c1 결측 → "-" (판정 불가)
  //   • c1 음수 + c2 음수 + c3 음수 → "Y" (3년 모두 명시적 결손)
  //   • 그 외 (c2/c3 결측 또는 양수 포함) → "N" (3년 연속 아님)
  if (!c1) {
    flags.threeYearsLoss = "-";
    flags.evidence.threeYearsLoss = `${y1} 데이터 미수신`;
  } else if (c1.netIncome < 0 && c2 && c2.netIncome < 0 && c3 && c3.netIncome < 0) {
    flags.threeYearsLoss = "Y";
    flags.evidence.threeYearsLoss =
      `당기순손익 ${y1}:${fmtMillions(c1.netIncome)} · ${y2}:${fmtMillions(c2.netIncome)} · ${y3}:${fmtMillions(c3.netIncome)} (3년 연속 결손)`;
  } else {
    flags.threeYearsLoss = "N";
    const parts: string[] = [];
    if (c1) parts.push(`${y1}:${fmtMillions(c1.netIncome)}`);
    if (c2) parts.push(`${y2}:${fmtMillions(c2.netIncome)}`); else parts.push(`${y2}:결측`);
    if (c3) parts.push(`${y3}:${fmtMillions(c3.netIncome)}`); else parts.push(`${y3}:결측`);
    flags.evidence.threeYearsLoss = `당기순손익 ${parts.join(" · ")}`;
  }

  // ─── ② 완전자본잠식 ───
  // 정책: c1.totalEquity < 0 → "Y"; c1 결측 → "-"; c1.totalEquity >= 0 → "N"
  if (!c1) {
    flags.fullCapitalImpair = "-";
    flags.evidence.fullCapitalImpair = `${y1} 자본총계 데이터 미수신`;
  } else if (c1.totalEquity < 0) {
    flags.fullCapitalImpair = "Y";
    flags.evidence.fullCapitalImpair = `${y1} 자본총계 ${fmtMillions(c1.totalEquity)}백만 (음수)`;
  } else {
    flags.fullCapitalImpair = "N";
    flags.evidence.fullCapitalImpair = `${y1} 자본총계 ${fmtMillions(c1.totalEquity)}백만`;
  }

  // ─── ③ 1·2금융권차입금 > 매출액 (근사: 전체 총차입금 > 매출액) ───
  // 정책:
  //   • c1 결측 → "-"
  //   • c1.revenue === 0 && c1.borrowings > 0 → "Y" (신설 SPC: 매출 없는데 차입금만 있음 = 위험)
  //   • c1.borrowings > c1.revenue → "Y"
  //   • c1.borrowings === 0 && c1.revenue === 0 → "-" (양쪽 다 결측)
  //   • 그 외 → "N"
  if (!c1) {
    flags.borrowGtRevenue = "-";
    flags.evidence.borrowGtRevenue = `${y1} 데이터 미수신`;
  } else if (c1.borrowings === 0 && c1.revenue === 0) {
    flags.borrowGtRevenue = "-";
    flags.evidence.borrowGtRevenue = `${y1} 차입금·매출액 양쪽 결측`;
  } else if (c1.revenue === 0 && c1.borrowings > 0) {
    flags.borrowGtRevenue = "Y";
    flags.evidence.borrowGtRevenue =
      `${y1} 매출액 0 (신설/SPC) · 차입금 ${fmtMillions(c1.borrowings)}백만`;
  } else if (c1.borrowings > c1.revenue) {
    flags.borrowGtRevenue = "Y";
    flags.evidence.borrowGtRevenue =
      `${y1} 차입금 ${fmtMillions(c1.borrowings)}백만 > 매출액 ${fmtMillions(c1.revenue)}백만`;
  } else {
    flags.borrowGtRevenue = "N";
    flags.evidence.borrowGtRevenue =
      `${y1} 차입금 ${fmtMillions(c1.borrowings)}백만 ≤ 매출액 ${fmtMillions(c1.revenue)}백만`;
  }

  // ─── ④ 감사의견 거절 ───
  // 정책:
  //   • opinion === null → "-" (감사보고서 미수신)
  //   • opinion.opinionType이 "한정" / "부적정" / "의견거절" 포함 → "Y" + 의견 그대로 노출
  //   • "적정" 또는 빈값 → "-" (DART 정기공시 default가 "적정"이라 신뢰 불가 → 직접 확인 필요)
  if (!opinion) {
    flags.auditOpinionReject = "-";
    flags.evidence.auditOpinionReject = "감사보고서 미수신 — 별도 확인 필요";
  } else {
    const t = (opinion.opinionType || "").trim();
    const negative = t.includes("의견거절") || t.includes("부적정") || t.includes("한정");
    if (negative) {
      flags.auditOpinionReject = "Y";
      flags.evidence.auditOpinionReject =
        `${opinion.fiscalYear} ${opinion.auditorName} 의견: ${t}`;
    } else {
      flags.auditOpinionReject = "-";
      flags.evidence.auditOpinionReject =
        `${opinion.fiscalYear} ${opinion.auditorName} 의견: ${t || "(미수신)"} — DART 정기공시 default는 신뢰 불가, 감사보고서 직접 확인 필요`;
    }
  }

  void fmt;
  return flags;
}

/** Excel 출력 시 사용자 override를 합쳐 최종 값 결정 */
export function applyOverrides(flags: WarningFlags, overrides?: Partial<Record<keyof WarningFlags, YN>>): WarningFlags {
  if (!overrides) return flags;
  return {
    ...flags,
    threeYearsLoss: (overrides.threeYearsLoss as YN) ?? flags.threeYearsLoss,
    fullCapitalImpair: (overrides.fullCapitalImpair as YN) ?? flags.fullCapitalImpair,
    borrowGtRevenue: (overrides.borrowGtRevenue as YN) ?? flags.borrowGtRevenue,
    auditOpinionReject: (overrides.auditOpinionReject as YN) ?? flags.auditOpinionReject,
    internalConflict: ((overrides.internalConflict as "Y" | "N") ?? flags.internalConflict) as "Y" | "N",
    operationStopped: ((overrides.operationStopped as "Y" | "N") ?? flags.operationStopped) as "Y" | "N",
    bankruptcy: ((overrides.bankruptcy as "Y" | "N") ?? flags.bankruptcy) as "Y" | "N",
    consortiumLoan: ((overrides.consortiumLoan as "Y" | "N") ?? flags.consortiumLoan) as "Y" | "N",
  };
}
