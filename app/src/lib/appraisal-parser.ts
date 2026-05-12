import type {
  AppraisalParseResult,
  CollateralAnalysis,
  ComparativeCase,
  ComparativeBuilding,
  SupplyOverview,
  CollateralDetailItem,
  AuctionQuote,
} from "@/types/appraisal";

// ── 유틸리티 ──────────────────────────────────────

/** 숫자 파싱: 쉼표 제거, 괄호/마이너스, 원화기호(\, ₩, \\) */
export function parseNum(raw: string): number | null {
  if (!raw || raw === "-" || raw === "—" || raw === "·") return null;
  let s = raw.replace(/[\s,]/g, "");
  s = s.replace(/^[\\₩￦]/, "");
  const negative = (s.startsWith("(") && s.endsWith(")")) || s.startsWith("-");
  s = s.replace(/[()\\₩￦\-]/g, "");
  s = s.replace(/[^\d.]/g, "");
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

/** 날짜 추출 */
export function extractDate(text: string): string | null {
  const m = text.match(/(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*일?/);
  if (m) return `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
  return null;
}

/** 공백 제거 후 패턴 매칭으로 줄 인덱스 찾기 */
export function findLineIndex(lines: string[], pattern: RegExp, startFrom = 0): number {
  for (let i = startFrom; i < lines.length; i++) {
    if (pattern.test(lines[i].replace(/\s/g, ""))) return i;
  }
  return -1;
}

/** 페이지 헤더 줄 판별 (무시 대상) */
export function isPageHeader(line: string): boolean {
  const c = line.replace(/\s/g, "");
  return /^감정평가액의산출근거및결정의견$/.test(c) ||
    /^\d{1,3}감정평가액의산출근거및결정의견$/.test(c) ||
    /^구분건물감정평가명세표$/.test(c);
}

/** 인라인 KV 추출: "소재지경기도 안양시건물명인덕원역 AK밸리" */
export function extractInlineKV(line: string, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const positions: { key: string; idx: number }[] = [];
  for (const key of keys) {
    const idx = line.indexOf(key);
    if (idx >= 0) positions.push({ key, idx });
  }
  positions.sort((a, b) => a.idx - b.idx);
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx + positions[i].key.length;
    const end = i + 1 < positions.length ? positions[i + 1].idx : line.length;
    const val = line.slice(start, end).trim();
    if (val) result[positions[i].key] = val;
  }
  return result;
}

/**
 * 공백없이 연결된 비준사례 행 파싱
 * 예: "ᄅ6B-F60576.442023-01-11580,000,0007,587,650선정"
 *      "e9F-90392.822024-10-08670,000,0007,218,272-"
 * 패턴: 기호(1자) + 층호정보 + 면적(소수) + 날짜(YYYY-MM-DD) + 금액(콤마) + 단가 + 비고
 */
function parseConcatenatedCaseRow(
  row: string,
): { label: string; unit: string; areaSqm: number; dateStr: string; price: number; unitPrice: number; remark: string } | null {
  // 날짜 패턴으로 기준 잡기
  const dateMatch = row.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  if (!dateMatch) return null;
  const dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const dateIdx = row.indexOf(dateMatch[0]);

  // 날짜 앞: 기호 + 층호 + 면적
  const before = row.substring(0, dateIdx);
  // 면적 추출: 금액 / 단가 = 면적 (역산)으로 정확한 면적 결정
  // 날짜 뒤에서 금액과 단가를 먼저 추출
  const after = row.substring(dateIdx + dateMatch[0].length);
  const afterBigNums = after.match(/\d{1,3}(?:,\d{3}){2,}/g) || [];
  const priceVal = afterBigNums.length > 0 ? parseNum(afterBigNums[0]) || 0 : 0;
  const unitPriceVal = afterBigNums.length > 1 ? parseNum(afterBigNums[1]) || 0 : 0;

  // 면적 후보들 생성 (정수부 1~3자리 + 소수점 2자리)
  let areaSqm = 0;
  let areaStr = "";
  const calcArea = unitPriceVal > 0 ? priceVal / unitPriceVal : 0;

  for (const digits of [1, 2, 3]) {
    const pat = new RegExp(`(\\d{${digits}}\\.\\d{2})$`);
    const m = before.match(pat);
    if (m) {
      const val = parseFloat(m[1]);
      // 역산 면적과 비교하여 가장 가까운 값 선택
      if (calcArea > 0 && Math.abs(val - calcArea) < 1) {
        areaSqm = val;
        areaStr = m[1];
        break;
      }
    }
  }
  // 역산 매칭 실패 시 합리적 범위 내 값 사용
  if (!areaStr) {
    for (const digits of [3, 2, 1]) {
      const pat = new RegExp(`(\\d{${digits}}\\.\\d{2})$`);
      const m = before.match(pat);
      if (m) {
        const val = parseFloat(m[1]);
        if (val >= 5 && val <= 500) {
          areaSqm = val;
          areaStr = m[1];
          break;
        }
      }
    }
  }
  if (!areaStr) return null;
  const labelPart = before.substring(0, before.length - areaStr.length);

  // 기호(1자) + 층(1~2자리숫자) + 호(나머지)
  // "ᄅ6B-F605" → ᄅ | 6층 | B-F605호
  // "e9F-903" → e | 9층 | F-903호
  // "g5501" → g | 5층 | 501호
  // "ᄋ111109" → ᄋ | 11층 | 1109호
  // "k151501" → k | 15층 | 1501호
  let label = labelPart.charAt(0);
  let unit = labelPart.substring(1);
  // 영문 대문자가 포함된 경우: 층(1~2자리) + 영문호(B-F605 등)
  const alphaMatch = labelPart.match(/^(.)(\d{1,2})([A-Z].*)$/);
  if (alphaMatch) {
    label = alphaMatch[1];
    unit = `${alphaMatch[2]}층 ${alphaMatch[3]}`;
  } else {
    // 순수 숫자만: 기호 + 층 + 호
    // "g5501" → 5층 501호 (호가 3자리+ 우선)
    // "ᄋ111109" → 11층 1109호 (2자리 층 + 4자리 호)
    // "k151501" → 15층 1501호
    const digits = labelPart.substring(1);
    if (digits.length >= 3) {
      // 호가 3자리 이상 되도록 분리: 남은 자릿수 >= 3이면 층=1자리, 아니면 2자리
      let floorLen = 1;
      if (digits.length >= 5) {
        // 4자리+ 남으면 2자리 층 가능 (11층 1109호, 15층 1501호)
        floorLen = 2;
      }
      label = labelPart.charAt(0);
      const floor = digits.substring(0, floorLen);
      const ho = digits.substring(floorLen);
      unit = `${floor}층 ${ho}호`;
    }
  }

  // 비고: 금액 뒤 한글 텍스트
  const price = priceVal;
  const unitPrice = unitPriceVal;
  let remark = "";
  const remarkMatch = after.match(/([\uAC00-\uD7A3]+)$/);
  if (remarkMatch && !/^[원천만억]$/.test(remarkMatch[1])) {
    remark = remarkMatch[1];
  }

  return { label, unit, areaSqm, dateStr, price, unitPrice, remark };
}

// ── 텍스트 추출 ──

export async function extractLines(buffer: Buffer): Promise<string[]> {
  // pdf-parse index.js는 디버그용 테스트 PDF를 require 시점에 읽으려 하여 일부 환경에서 에러.
  // 실제 파서만 직접 import하여 우회.
  try {
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = (mod as any).default || mod;
    const data = await pdfParse(buffer);
    const text: string = data.text || "";
    if (!text || text.trim().length < 50) return [];
    // NULL 문자(\u0000)를 공백으로 치환 — pdf-parse가 일부 PDF에서 NULL을 삽입함
    const cleaned = text.replace(/\u0000/g, " ");
    return cleaned.split(/\n/).filter((l: string) => l.trim().length > 0);
  } catch (e: any) {
    console.warn(`[appraisal-parser] pdf-parse 실패: ${e?.message || e}`);
    return [];
  }
}

// ── 섹션 파서 스텁 (Task 3~7에서 구현) ──

function parseBasicInfo(lines: string[]): {
  data: Partial<CollateralAnalysis>;
  confidence: number;
} {
  const data: Partial<CollateralAnalysis> = {};
  let found = 0;

  // ── 괄호감정표 기반 추출 (가장 정확한 영역) ──
  // PDF 구조: L60~L100 부근에 괄호감정표가 있으며, 레이블 행과 값 행이 분리됨
  // 레이블: 의뢰인 / 소유자 / (대상업체명) / 목록표시근거 / 감정평가목적 / 제출처 / 기준시점
  // 값: 카카오페이증권 / 우리자산신탁(주) / 등기사항전부증명서 / 담보 / ...
  const gwalhIdx = findLineIndex(lines, /괄호감정표/, 0);

  if (gwalhIdx >= 0) {
    // 괄호감정표 ~ 100줄 내 스캔
    const scanStart = gwalhIdx;
    const scanEnd = Math.min(gwalhIdx + 60, lines.length);

    // 레이블 위치를 기록하여 다음 값 행과 매핑
    const labelMap: { label: string; idx: number }[] = [];
    for (let i = scanStart; i < scanEnd; i++) {
      const flat = lines[i].replace(/\s/g, "");
      if (/^감정평가서번호/.test(flat)) {
        const m = flat.match(/([A-Z]\d[\d\-]+)/);
        if (m) { data.serialNo = m[1]; found++; }
      }
      if (/^감정평가사$/.test(flat)) labelMap.push({ label: "감정평가사", idx: i });
      if (/^의\s*뢰\s*인$/.test(lines[i].trim()) || /^의뢰인$/.test(flat)) labelMap.push({ label: "의뢰인", idx: i });
      if (/^소\s*유\s*자$/.test(lines[i].trim()) || /^소유자$/.test(flat)) labelMap.push({ label: "소유자", idx: i });
      if (/^감정평가목적$/.test(flat)) labelMap.push({ label: "목적", idx: i });
      if (/^제\s*출\s*처$/.test(lines[i].trim()) || /^제출처$/.test(flat)) labelMap.push({ label: "제출처", idx: i });
      if (/^기\s*준\s*시\s*점$/.test(lines[i].trim()) || /^기준시점$/.test(flat)) labelMap.push({ label: "기준시점", idx: i });
      if (/^채\s*무\s*자$/.test(lines[i].trim()) || /^채무자$/.test(flat)) labelMap.push({ label: "채무자", idx: i });
    }

    // 감정평가법인 — 이름 뒤에 있음
    const appIdx = findLineIndex(lines, /감정평가법인/, scanStart);
    if (appIdx >= 0 && appIdx < scanEnd) {
      const appFlat = lines[appIdx].replace(/\s/g, "");
      const m = appFlat.match(/([\uAC00-\uD7A3()]+감정평가법인)/);
      if (m) { data.appraiser = m[1]; found++; }
    }

    // 레이블 → 값 매핑: 레이블 행은 여러개가 연속된 뒤, 값 행이 같은 순서로 나옴
    // 이 PDF의 패턴:
    //   L74: 의뢰인 / L75: 소유자 / L76: (대상업체명) / ...
    //   L81: 카카오페이증권 / L82: 우리자산신탁(주) / ...
    // 레이블 그룹과 값 그룹을 찾음
    const labelGroups: { labels: string[]; startIdx: number }[] = [];
    let curGroup: string[] = [];
    let curStart = -1;
    for (const lm of labelMap) {
      if (curGroup.length === 0) {
        curGroup.push(lm.label);
        curStart = lm.idx;
      } else if (lm.idx - (curStart + curGroup.length) <= 2) {
        curGroup.push(lm.label);
      } else {
        labelGroups.push({ labels: [...curGroup], startIdx: curStart });
        curGroup = [lm.label];
        curStart = lm.idx;
      }
    }
    if (curGroup.length > 0) labelGroups.push({ labels: curGroup, startIdx: curStart });

    // 각 레이블 그룹 처리
    for (const grp of labelGroups) {
      // 값은 레이블 블록 끝 이후에 나옴 — 비-레이블 행을 값으로 수집
      const valStart = grp.startIdx + grp.labels.length;
      const vals: string[] = [];
      for (let vi = valStart; vi < Math.min(valStart + grp.labels.length + 10, scanEnd); vi++) {
        const vt = lines[vi].trim();
        const vFlat = vt.replace(/\s/g, "");
        // 다음 레이블 그룹이면 중단
        if (/^(의뢰인|소유자|감정평가목적|제출처|기준시점|채무자|감정평가사|작성일|감정평가조건|기준가치|감정평가액|공부)$/.test(vFlat)) break;
        // 부가 레이블 행 skip
        if (/^\(대상업체명\)$/.test(vFlat) || /^목록표시근거$/.test(vFlat)) continue;
        // 승인번호 행 skip
        if (/^\(승인번호/.test(vFlat)) continue;
        // 빈 행 skip
        if (vt.length === 0) continue;
        vals.push(vt);
        if (vals.length >= grp.labels.length) break;
      }

      for (let li = 0; li < grp.labels.length && li < vals.length; li++) {
        const val = vals[li].replace(/\s+/g, " ").trim();
        switch (grp.labels[li]) {
          case "의뢰인":
          case "제출처":
            if (!data.submittedTo && val.length > 1) { data.submittedTo = val; found++; }
            break;
          case "소유자":
            if (!data.owner && val.length > 1) { data.owner = val; found++; }
            break;
          case "목적":
            if (!data.purpose && val.length > 0) { data.purpose = val; found++; }
            break;
          case "채무자":
            if (!data.debtor && val.length > 1) { data.debtor = val; found++; }
            break;
        }
      }
    }

    // 기준시점 — PDF 구조상 레이블(L80)과 값(L89)이 멀리 떨어져 있음
    // 값 행 패턴: "2025. 08. 182025. 08. 182025. 08. 18" (작성일+조사기간+기준시점 연결)
    // "작성일" 또는 "조사기간" 레이블 뒤에서 찾기
    const writeDateIdx = findLineIndex(lines, /작\s*성\s*일|조\s*사\s*기\s*간/, scanStart);
    if (writeDateIdx >= 0 && writeDateIdx < scanEnd) {
      for (let i = writeDateIdx; i < Math.min(writeDateIdx + 5, scanEnd); i++) {
        const d = extractDate(lines[i]);
        if (d) { data.baseDate = d; found++; break; }
      }
    }
    // Fallback: 기준시점 레이블에서 더 넓은 범위 스캔
    if (!data.baseDate) {
      const baseDateIdx = findLineIndex(lines, /기\s*준\s*시\s*점/, scanStart);
      if (baseDateIdx >= 0 && baseDateIdx < scanEnd) {
        for (let i = baseDateIdx + 1; i < Math.min(baseDateIdx + 15, scanEnd); i++) {
          const d = extractDate(lines[i]);
          if (d) { data.baseDate = d; found++; break; }
        }
      }
    }

    // 감정평가액 — \78,022,000,000 패턴
    for (let i = scanStart; i < scanEnd; i++) {
      const stripped = lines[i].replace(/\s/g, "");
      const m = stripped.match(/[\\₩￦]([\d,]+)/);
      if (m) {
        const val = parseNum(m[1]);
        if (val && val >= 100_000_000) {
          data.appraisalValue = val; found++;
          break;
        }
      }
    }
  }

  // ── Fallback: 괄호감정표가 없을 때 기존 방식 ──
  if (!data.serialNo) {
    const serialIdx = findLineIndex(lines, /감정평가서번호/, 0);
    if (serialIdx >= 0) {
      for (let i = serialIdx; i < Math.min(serialIdx + 5, lines.length); i++) {
        const m = lines[i].match(/([A-Z]\d[\d\-]+)/);
        if (m) { data.serialNo = m[1]; found++; break; }
      }
    }
  }

  if (!data.appraiser) {
    const appIdx = findLineIndex(lines, /감정평가법인/, 0);
    if (appIdx >= 0) {
      const flat = lines[appIdx].replace(/\s/g, "");
      const m = flat.match(/([\uAC00-\uD7A3()]+감정평가법인)/);
      if (m) { data.appraiser = m[1]; found++; }
    }
  }

  if (!data.trustee) {
    for (let i = 0; i < Math.min(150, lines.length); i++) {
      const m = lines[i].match(/([\uAC00-\uD7A3]+(?:자산)?신탁(?:\(주\)|\s*주식회사)?)/);
      if (m) { data.trustee = m[1]; found++; break; }
    }
  }

  if (!data.purpose) {
    const purposeIdx = findLineIndex(lines, /^담보$/, 0);
    if (purposeIdx >= 0) { data.purpose = "담보"; found++; }
  }

  if (!data.submittedTo) {
    for (let i = 0; i < Math.min(100, lines.length); i++) {
      const stripped = lines[i].replace(/\s/g, "");
      if (stripped.length > 2 && /증권|은행|캐피탈|저축/.test(stripped) && !/감정평가/.test(stripped)) {
        data.submittedTo = lines[i].trim(); found++;
        break;
      }
    }
  }

  if (!data.baseDate) {
    for (let i = 0; i < Math.min(150, lines.length); i++) {
      // 감정평가서번호 행에서 잘못된 날짜 추출 방지 (C32508-2-1401 → 3250.08.02)
      if (/감정평가서번호|[A-Z]\d{4,}/.test(lines[i])) continue;
      const d = extractDate(lines[i]);
      if (d && d.startsWith("20")) { data.baseDate = d; found++; break; }
    }
  }

  if (!data.appraisalValue) {
    for (let i = 0; i < Math.min(150, lines.length); i++) {
      const stripped = lines[i].replace(/\s/g, "");
      const m = stripped.match(/[\\₩￦]([\d,]+)/);
      if (m) {
        const val = parseNum(m[1]);
        if (val && val >= 100_000_000) {
          data.appraisalValue = val; found++;
          break;
        }
      }
    }
  }

  return { data, confidence: Math.min(found / 6, 1) };
}

function parseUnitAppraisals(lines: string[]): {
  data: CollateralDetailItem[];
  confidence: number;
} {
  const items: CollateralDetailItem[] = [];

  // Find the clean 비준가액 table section (around line 2700+)
  // Header pattern: "층·호적용단가(원/㎡)전유면적(㎡)비준가액(원)"
  let tableStart = findLineIndex(lines, /비준가액.*유효숫자|층.*호.*적용단가.*전유면적.*비준가액/, 0);
  if (tableStart < 0) {
    // Fallback: find a section that has 일련 번호 header near 비준가액
    tableStart = findLineIndex(lines, /일련/, Math.floor(lines.length * 0.3));
    if (tableStart >= 0) {
      // Verify it's near 비준가액 context
      const nearby = lines.slice(Math.max(0, tableStart - 10), tableStart + 10).join("");
      if (!/비준가액/.test(nearby)) tableStart = -1;
    }
  }
  if (tableStart < 0) return { data: [], confidence: 0 };

  // Parse units: pattern is serial number, then floor, then unit name, then numbers line
  let serial = 0;
  let i = tableStart;
  const endPattern = /수익방식의\s*적용|감정평가액\s*결정|소\s*계/;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (isPageHeader(line)) { i++; continue; }
    // Check end of section
    if (endPattern.test(line.replace(/\s/g, ""))) {
      // Check for 소계 totals before ending
      break;
    }

    // Look for a standalone serial number (1-3 digits)
    if (/^\d{1,3}$/.test(line)) {
      serial = parseInt(line, 10);
      // Next lines should be: floor, unit, numbers
      let floor = "";
      let unit = "";
      let areaSqm = 0;
      let appraisalValue = 0;

      let j = i + 1;
      // Skip blank/header lines
      while (j < lines.length && isPageHeader(lines[j].trim())) j++;

      // Read floor (제N층 or 지하N층)
      if (j < lines.length) {
        const floorLine = lines[j].trim();
        const floorMatch = floorLine.match(/(지하\s*\d+|제?\s*\d+)\s*층/);
        if (floorMatch) {
          floor = floorLine; j++;
        }
      }

      // Read unit (제N호 or 제근생N호 etc)
      while (j < lines.length && isPageHeader(lines[j].trim())) j++;
      if (j < lines.length) {
        const unitLine = lines[j].trim();
        if (/호/.test(unitLine)) {
          unit = unitLine; j++;
        }
      }

      // Read numbers line: 적용단가 전유면적 비준가액
      while (j < lines.length && isPageHeader(lines[j].trim())) j++;
      if (j < lines.length) {
        const numsLine = lines[j].trim();
        // Extract all number tokens
        const tokens = numsLine.split(/\s+/).filter(t => /[\d,.]/.test(t));
        if (tokens.length >= 3) {
          // Format: 적용단가 전유면적(㎡) 비준가액(원)
          const unitPrice = parseNum(tokens[0]);
          const area = parseNum(tokens[1]);
          const value = parseNum(tokens[2]);

          if (unitPrice && area && value && unitPrice > 1_000_000 && area < 500 && value > 100_000_000) {
            areaSqm = area;
            appraisalValue = value;
          } else if (tokens.length >= 5) {
            // Early table format: 거래사례단가 사정보정 시점수정 가치형성요인 적용단가
            // In this case, no 비준가액 on this line — skip (will be in later table)
            i = j + 1;
            continue;
          }
        }
      }

      if (appraisalValue > 0) {
        const areaPyeong = Math.round(areaSqm * 0.3025 * 100) / 100;
        items.push({
          no: serial,
          unit: unit || `${serial}`,
          floor: floor.replace(/\s+/g, " ").trim(),
          areaSqm,
          areaPyeong,
          appraisalValue,
          planPrice: 0,
          releaseCondition: 0,
          appraisalPricePerPyeong: areaPyeong > 0 ? Math.round(appraisalValue / areaPyeong) : 0,
          planPricePerPyeong: 0,
          status: "분양",
          remarks: "",
        });
        i = j + 1;
        continue;
      }
    }
    i++;
  }

  return { data: items, confidence: items.length > 0 ? Math.min(items.length / 10, 1) : 0 };
}

function parseComparativeBuildings(lines: string[]): {
  data: { buildings: ComparativeBuilding[]; cases: ComparativeCase[] };
  confidence: number;
} {
  const buildings: ComparativeBuilding[] = [];
  const allCases: ComparativeCase[] = [];

  // Find comparative sections: "사례 A:", "사례 B:", etc.
  const casePattern = /사례\s*([A-Z])\s*[:：]/;
  let i = 0;
  while (i < lines.length) {
    const stripped = lines[i].replace(/\s/g, "");
    const caseMatch = lines[i].match(casePattern);
    if (!caseMatch) { i++; continue; }

    const label = `사례 ${caseMatch[1]}`;
    // Extract building name from same line
    const nameAfterLabel = lines[i].replace(casePattern, "").trim();
    const buildingName = nameAfterLabel || "";

    // Parse building details from following lines
    let address = "";
    let landAreaSqm = 0;
    let grossAreaSqm = 0;
    let buildingAreaSqm = 0;
    let coverageFloorRatio = "";
    let scale = "";
    let approvalDate = "";
    let category = "";

    // Scan next ~20 lines for KV pairs
    const scanEnd = Math.min(i + 30, lines.length);
    for (let j = i + 1; j < scanEnd; j++) {
      const l = lines[j];
      const flat = l.replace(/\s/g, "");

      // Check if we hit the next 사례 or a different section
      if (casePattern.test(l) && j > i + 1) break;
      if (/^\d+\.\s/.test(l.trim()) && !/^\d+\.\d/.test(l.trim())) break;

      // Address
      if (/소재지/.test(flat)) {
        address = flat.replace(/소재지/, "").trim();
      }
      // Land area
      if (/대지면적/.test(flat)) {
        const m = flat.match(/대지면적\(㎡\)([\d,.]+)/);
        if (m) landAreaSqm = parseNum(m[1]) || 0;
      }
      // Gross area
      if (/연면적/.test(flat)) {
        const m = flat.match(/연면적\(㎡\)([\d,.]+)/);
        if (m) grossAreaSqm = parseNum(m[1]) || 0;
      }
      // Building area
      if (/건축면적/.test(flat)) {
        const m = flat.match(/건축면적\(㎡\)([\d,.]+)/);
        if (m) buildingAreaSqm = parseNum(m[1]) || 0;
      }
      // Coverage/floor ratio
      if (/건폐율|용적률/.test(flat)) {
        const m = flat.match(/([\d.]+%\s*\/?\s*[\d.]+%)/);
        if (m) coverageFloorRatio = m[1];
      }
      // Scale
      if (/규모/.test(flat) && /지하|지상/.test(flat)) {
        const m = flat.match(/규모(.*)/);
        if (m) scale = m[1].replace(/사용승인일.*/, "").trim();
      }
      // Approval date
      if (/사용승인일/.test(flat)) {
        const m = flat.match(/사용승인일([\d\-. ]+)/);
        if (m) approvalDate = m[1].trim();
      }

      // Detect category from section header above (공장, 지식산업센터, 아파트형공장)
      if (/공장|지식산업센터/.test(flat) && j < i + 3) {
        category = "공장(지식산업센터)";
      }

      // Parse transaction rows (실거래사례)
      // PDF 텍스트가 공백 없이 연결됨: "ᄅ6B-F60576.442023-01-11580,000,0007,587,650선정"
      if (/실거래사례/.test(flat)) {
        let k = j + 1;
        // Skip header rows
        while (k < scanEnd && /구분|층|호|면적|거래일자|거래금액|단가|비고/.test(lines[k].replace(/\s/g, ""))) k++;
        while (k < scanEnd) {
          const row = lines[k].replace(/\s/g, "");
          if (!row || /감정평가사례/.test(row) || /구분.*층.*호/.test(row)) break;
          // 연결행 파싱: 기호+층호+면적+날짜+금액+단가+비고
          const txParsed = parseConcatenatedCaseRow(row);
          if (txParsed) {
            allCases.push({
              type: "거래",
              label: txParsed.label,
              address,
              buildingName,
              unit: txParsed.unit,
              usage: "",
              purpose: "거래",
              source: "실거래가",
              areaSqm: txParsed.areaSqm,
              areaPyeong: txParsed.areaSqm * 0.3025,
              price: txParsed.price,
              pricePerPyeong: txParsed.unitPrice,
              baseDate: txParsed.dateStr,
            });
          }
          k++;
        }
      }

      // Parse appraisal cases (감정평가사례)
      if (/감정평가사례/.test(flat)) {
        let k = j + 1;
        while (k < scanEnd && /구분|층|호|면적|기준시점|감정평가액|단가|비고/.test(lines[k].replace(/\s/g, ""))) k++;
        while (k < scanEnd) {
          const row = lines[k].replace(/\s/g, "");
          if (!row || casePattern.test(row) || /^\d+\.\s/.test(lines[k].trim())) break;
          const apParsed = parseConcatenatedCaseRow(row);
          if (apParsed) {
            allCases.push({
              type: "평가",
              label: apParsed.label,
              address,
              buildingName,
              unit: apParsed.unit,
              usage: "",
              purpose: "감정평가",
              source: "감정평가",
              areaSqm: apParsed.areaSqm,
              areaPyeong: apParsed.areaSqm * 0.3025,
              price: apParsed.price,
              pricePerPyeong: apParsed.unitPrice,
              baseDate: apParsed.dateStr,
            });
          }
          k++;
        }
      }
    }

    buildings.push({
      label,
      category: category || "공장(지식산업센터)",
      address,
      buildingName,
      landAreaSqm,
      grossAreaSqm,
      buildingAreaSqm,
      coverageFloorRatio,
      scale,
      approvalDate,
      source: "감정평가서",
      transactions: allCases.filter(c => c.type === "거래" && c.buildingName === buildingName),
      appraisals: allCases.filter(c => c.type === "평가" && c.buildingName === buildingName),
    });

    i++;
  }

  const confidence = buildings.length > 0 ? Math.min(buildings.length / 3, 1) : 0;
  return { data: { buildings, cases: allCases }, confidence };
}

// ────────────────────────────────────────────────────────────────
// 토지·구분건물 비준사례 파서 (P55-58 토지, P67-69 구분건물 기준)
// ────────────────────────────────────────────────────────────────

/** 섹션 헤더(예: "■ 인근지역 구분건물 거래사례") 다음에 데이터 시작 라인 위치 탐지 */
function findSectionDataStart(lines: string[], headerIdx: number, isCaseMarker: (s: string) => boolean): number {
  for (let i = headerIdx + 1; i < Math.min(headerIdx + 40, lines.length); i++) {
    if (isCaseMarker(lines[i].trim())) return i;
  }
  return -1;
}

/** 한 케이스 블록 = 다음 마커/소프트 경계 직전까지의 line 배열
 *  - sectionEnd: 섹션 전체 종료 (이 라인 도달 시 즉시 중단)
 *  - blockBoundary: 현재 블록만 종료 (다음 마커는 계속 탐색)
 */
function splitCaseBlocks(
  lines: string[],
  startIdx: number,
  isCaseMarker: (s: string) => boolean,
  sectionEnd: (s: string) => boolean,
  blockBoundary?: (s: string) => boolean,
): string[][] {
  const blocks: string[][] = [];
  let i = startIdx;
  while (i < lines.length) {
    const t0 = lines[i].trim();
    if (sectionEnd(t0)) break;
    if (!isCaseMarker(t0)) { i++; continue; }
    const block: string[] = [t0];
    let j = i + 1;
    while (j < lines.length) {
      const t = lines[j].trim();
      if (sectionEnd(t) || isCaseMarker(t)) break;
      if (blockBoundary && blockBoundary(t)) { j++; break; }
      block.push(t);
      j++;
    }
    blocks.push(block);
    i = j;
  }
  return blocks;
}

/** 토지 사례 케이스 1개 파싱 (평가사례 + 거래사례 공용) */
function parseLandCaseBlock(block: string[], type: '거래' | '평가'): ComparativeCase | null {
  if (block.length < 8) return null;
  const label = block[0];
  // 지번: "마곡동" + "762-2" 같은 2줄, 또는 "마곡동76" + "2-2" 처럼 끊긴 경우도 합쳐 정규화
  // 면적+지목 anchor 찾기: "FLOAT 한자(대/답/전/임/잡)"
  let areaIdx = -1;
  let areaSqm = 0;
  let landCategory = '';
  for (let i = 1; i < block.length; i++) {
    const m = block[i].match(/^([\d,.]+)\s+([대답전임잡장])$/);
    if (m) {
      const v = parseNum(m[1]);
      if (v) { areaSqm = v; landCategory = m[2]; areaIdx = i; break; }
    }
  }
  if (areaIdx < 0) return null;

  const plotNumber = block.slice(1, areaIdx).join(' ').replace(/\s+/g, ' ').trim();

  // areaIdx 이후 positional: 용도지역 / 이용상황 / 형상 / 도로조건 / 시점+(목적|가액) / 단가 / 개별지가
  const zoning = block[areaIdx + 1] ?? '';
  const usage = block[areaIdx + 2] ?? '';
  const shape = block[areaIdx + 3] ?? '';
  const roadCondition = block[areaIdx + 4] ?? '';
  const dateLine = block[areaIdx + 5] ?? '';
  const unitPriceLine = block[areaIdx + 6] ?? '';
  const individualLandLine = block[areaIdx + 7] ?? '';

  // 시점+(목적|가액) 분해
  const dateMatch = dateLine.match(/(\d{4}[.\-]\d{2}[.\-]\d{2})\s*(.*)/);
  const baseDate = dateMatch ? dateMatch[1].replace(/\./g, '-') : '';
  const dateRest = dateMatch ? dateMatch[2].trim() : '';

  let price = 0;
  let purpose = type === '평가' ? '담보' : '거래';
  if (type === '거래') {
    // dateRest가 큰 숫자 (실거래가액)
    const v = parseNum(dateRest);
    if (v) price = v;
  } else {
    // dateRest는 평가목적 (담보/자산재평가 등)
    if (dateRest) purpose = dateRest;
  }

  const unitPrice = parseNum(unitPriceLine) || 0;
  // 평가사례에서 가격은 사례단가만 표시되므로 price = 0이 정상.
  // 거래사례 + price 미추출 시 단가×면적 보완은 하지 않음 (raw fidelity 우선)

  // 개별지가 "(NUMBER)"
  let individualLandPrice: number | undefined;
  const ilMatch = individualLandLine.match(/^\(([\d,.]+)\)$/);
  if (ilMatch) {
    const v = parseNum(ilMatch[1]);
    if (v) individualLandPrice = v;
  }

  return {
    type,
    label,
    address: plotNumber,
    buildingName: '',
    unit: '',
    usage,
    purpose,
    source: type === '거래' ? '실거래가' : '감정평가',
    areaSqm,
    areaPyeong: areaSqm * 0.3025,
    price,
    pricePerPyeong: unitPrice, // 사례단가(원/㎡) — pyeong 변환 X (raw 원/㎡)
    baseDate,
    caseCategory: '토지',
    plotNumber,
    landCategory,
    zoning,
    shape,
    roadCondition,
    individualLandPrice,
  };
}

function parseLandComparatives(lines: string[]): {
  data: { trades: ComparativeCase[]; appraisals: ComparativeCase[] };
  confidence: number;
} {
  const trades: ComparativeCase[] = [];
  const appraisals: ComparativeCase[] = [];

  // 평가사례 토지: "㉠ 평가사례" 헤더 + 알파벳/숫자 케이스
  // 거래사례 토지: "㉡ 거래사례" 헤더 + 알파벳 케이스
  // 평가사례 마커는 숫자(1,2,3,4), 거래사례 마커는 알파벳(A,B,C)
  const isDigitMarker = (s: string) => /^[1-9]$/.test(s);
  const isAlphaMarker = (s: string) => /^[A-Z]$/.test(s);
  const isTerminator = (s: string) => /^[※]/.test(s) || /^㉠|^㉡|^㉢|^㉣|^㉤|^■/.test(s) || /^\(.+\)$/.test(s) && false;

  // 평가사례 섹션 — "㉠ 평가사례" 시작, "㉡" 또는 "※"에서 종료
  const evalHeaderIdx = findLineIndex(lines, /^㉠\s*평가사례$/, 0);
  if (evalHeaderIdx >= 0) {
    const dataStart = findSectionDataStart(lines, evalHeaderIdx, isDigitMarker);
    if (dataStart > 0) {
      // 종료 조건: "㉡" 헤더 또는 "※ 출처"
      const sectionEnd = (() => {
        for (let i = dataStart; i < lines.length; i++) {
          const t = lines[i].trim();
          if (/^㉡/.test(t) || /^※\s*출처/.test(t)) return i;
        }
        return lines.length;
      })();
      const subLines = lines.slice(0, sectionEnd);
      const blocks = splitCaseBlocks(
        subLines,
        dataStart,
        isDigitMarker,
        (s) => /^※\s*출처/.test(s) || /^㉡/.test(s),
      );
      for (const b of blocks) {
        const c = parseLandCaseBlock(b, '평가');
        if (c) appraisals.push(c);
      }
    }
  }

  // 거래사례 섹션 — "㉡ 거래사례" 시작, "㉢/※" 종료. 비 고 블록은 케이스 사이에 끼어들 수 있음.
  const tradeHeaderIdx = findLineIndex(lines, /^㉡\s*거래사례$/, 0);
  if (tradeHeaderIdx >= 0) {
    const dataStart = findSectionDataStart(lines, tradeHeaderIdx, isAlphaMarker);
    if (dataStart > 0) {
      const sectionEnd = (() => {
        for (let i = dataStart; i < lines.length; i++) {
          const t = lines[i].trim();
          if (/^㉢/.test(t) || /^※\s*출처/.test(t) || /^※\s*사례\s*위치도/.test(t)) return i;
        }
        return lines.length;
      })();
      const subLines = lines.slice(0, sectionEnd);
      const blocks = splitCaseBlocks(
        subLines,
        dataStart,
        isAlphaMarker,
        (s) => /^㉢/.test(s) || /^※\s*출처/.test(s) || /^※\s*사례\s*위치도/.test(s),
        (s) => /^비\s*고$/.test(s),
      );
      for (const b of blocks) {
        const c = parseLandCaseBlock(b, '거래');
        if (c) trades.push(c);
      }
    }
  }

  void isTerminator;
  const confidence = (trades.length + appraisals.length) > 0 ? Math.min((trades.length + appraisals.length) / 6, 1) : 0;
  return { data: { trades, appraisals }, confidence };
}

/** 구분건물 사례 케이스 1개 파싱 */
function parseUnitCaseBlock(block: string[], type: '거래' | '평가'): ComparativeCase | null {
  if (block.length < 9) return null;
  const label = block[0];
  // 지번: 2 라인 (시/구/동) + (지번) — "마곡동" + "792-9"
  // 전유면적 anchor 찾기: 콤마 없는 "NN.NN" 또는 콤마 있는 면적 숫자, 직전 라인이 동/층/호 패턴
  // 더 안전한 방식: "FLOAT, no 한글" 형태 + 직전 라인이 한글없는 동/층/호 형태(/, 층, 호 포함)
  let areaIdx = -1;
  for (let i = 3; i < block.length; i++) {
    const t = block[i];
    if (/^[\d,.]+$/.test(t) && !t.includes('-')) {
      // 직전 라인이 동/층/호 패턴 (/와 숫자 포함, OR 한글+숫자)
      const prev = block[i - 1] || '';
      if (/[\/층호동]/.test(prev) || /^[A-Z]?\-?\d/.test(prev)) {
        areaIdx = i;
        break;
      }
    }
  }
  if (areaIdx < 0) return null;

  // areaIdx-1 = 동/층/호, areaIdx-2 = 명칭, areaIdx-3 = 지번 line 2, areaIdx-4 = 지번 line 1
  if (areaIdx < 4) return null;
  const district = block[1] || '';
  const plotNumber = `${district} ${block[2] || ''}`.trim();
  const buildingName = block[areaIdx - 2] || '';
  const dongFloorUnit = block[areaIdx - 1] || '';
  const areaSqm = parseNum(block[areaIdx]) || 0;

  // areaIdx 이후 — 이용상황(보통 2줄, 두 번째 줄이 괄호) / 거래액+단가 1줄 / 시점 / (목적) / 사용승인일
  let cursor = areaIdx + 1;

  // 이용상황: 첫 줄 + 괄호로 시작하는 두 번째 줄
  let usage = block[cursor] || '';
  cursor++;
  if (cursor < block.length && /^\(.+\)$/.test(block[cursor])) {
    usage = `${usage} ${block[cursor]}`.trim();
    cursor++;
  }

  // 거래액+단가 1줄: "6,230,000,000 7,260,000"
  const moneyLine = block[cursor] || '';
  cursor++;
  const bigNums = moneyLine.match(/\d{1,3}(?:,\d{3})+/g) || [];
  const price = bigNums.length > 0 ? parseNum(bigNums[0]) || 0 : 0;
  const unitPrice = bigNums.length > 1 ? parseNum(bigNums[1]) || 0 : 0;

  // 시점
  const dateLine = block[cursor] || '';
  cursor++;
  const baseDate = (dateLine.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/) || [''])[0].replace(/\./g, '-');

  // 평가목적 (평가사례만)
  let purpose = type === '거래' ? '거래' : '담보';
  let approvalDate = '';
  if (type === '평가') {
    const purposeLine = block[cursor] || '';
    if (purposeLine && !/\d{4}/.test(purposeLine)) {
      purpose = purposeLine;
      cursor++;
    }
    approvalDate = (block[cursor]?.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/) || [''])[0];
  } else {
    approvalDate = (block[cursor]?.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/) || [''])[0];
  }

  return {
    type,
    label,
    address: plotNumber,
    buildingName,
    unit: dongFloorUnit,
    usage,
    purpose,
    source: type === '거래' ? '실거래가' : '감정평가',
    areaSqm,
    areaPyeong: areaSqm * 0.3025,
    price,
    pricePerPyeong: unitPrice,
    baseDate,
    caseCategory: '구분건물',
    plotNumber,
    dongFloorUnit,
    approvalDate,
  };
}

function parseUnitComparatives(lines: string[]): {
  data: { trades: ComparativeCase[]; appraisals: ComparativeCase[] };
  confidence: number;
} {
  const trades: ComparativeCase[] = [];
  const appraisals: ComparativeCase[] = [];

  const isAlphaMarker = (s: string) => /^[A-Z]$/.test(s);
  const isDigitMarker = (s: string) => /^[1-9][0-9]?$/.test(s);
  const isTerminator = (s: string) => /^※\s*출처/.test(s) || /^■/.test(s) || /^③/.test(s);

  const tradeHeaderIdx = findLineIndex(lines, /^■?\s*인근지역\s*구분건물\s*거래사례/, 0);
  if (tradeHeaderIdx >= 0) {
    const dataStart = findSectionDataStart(lines, tradeHeaderIdx, isAlphaMarker);
    if (dataStart > 0) {
      const blocks = splitCaseBlocks(lines, dataStart, isAlphaMarker, isTerminator);
      for (const b of blocks) {
        const c = parseUnitCaseBlock(b, '거래');
        if (c) trades.push(c);
      }
    }
  }

  const evalHeaderIdx = findLineIndex(lines, /^■?\s*인근지역\s*구분건물\s*평가사례/, 0);
  if (evalHeaderIdx >= 0) {
    const dataStart = findSectionDataStart(lines, evalHeaderIdx, isDigitMarker);
    if (dataStart > 0) {
      const blocks = splitCaseBlocks(lines, dataStart, isDigitMarker, isTerminator);
      for (const b of blocks) {
        const c = parseUnitCaseBlock(b, '평가');
        if (c) appraisals.push(c);
      }
    }
  }

  const confidence = (trades.length + appraisals.length) > 0 ? Math.min((trades.length + appraisals.length) / 8, 1) : 0;
  return { data: { trades, appraisals }, confidence };
}

function parseAuctionQuote(lines: string[]): {
  data: AuctionQuote | null;
  confidence: number;
} {
  // Find "경매통계" section
  const idx = findLineIndex(lines, /경매통계/, 0);
  if (idx < 0) return { data: null, confidence: 0 };

  let region = "";
  let period = "";
  const rows: AuctionQuote["rows"] = [];
  let source = "인포케어";

  // Scan lines after header
  const scanEnd = Math.min(idx + 30, lines.length);
  for (let i = idx; i < scanEnd; i++) {
    const l = lines[i];
    const flat = l.replace(/\s/g, "");

    // Region and period: "용도별경기   안양시    동안구    2024  년  08 월  ~  2025  년  07 월"
    // "용도별" 제거 후 매칭
    const stripped = l.replace(/용\s*도\s*별/, "").trim();
    if (!region && /\d{4}\s*년?\s*\d{1,2}\s*월/.test(stripped)) {
      const periodMatch = stripped.match(/([\uAC00-\uD7A3\s]+(?:시|군|구))\s*(\d{4}\s*년?\s*\d{1,2}\s*월?\s*~\s*\d{4}\s*년?\s*\d{1,2}\s*월?)/);
      if (periodMatch) {
        region = periodMatch[1].replace(/\s+/g, " ").trim();
        period = periodMatch[2].replace(/\s+/g, " ").trim();
      }
    }

    // Data rows: "근린상가4,083,000,0002,435,194,00059.6241041.7"
    // 해석: 총감정가=4,083,000,000 / 총낙찰가=2,435,194,000 / 낙찰가율=59.62 / 총건수=4 / 낙찰건수=10 / 낙찰률=41.7
    // 또는: "아파트형공장17,021,000,00011,228,432,00066.0601931.7"
    const usageMatch = flat.match(/^([\uAC00-\uD7A3]+(?:상가|공장|주거|오피스|아파트형공장|근린상가))([\d,.]+)/);
    if (usageMatch) {
      const usage = usageMatch[1];
      const numPart = flat.replace(usage, "");
      // 1단계: 콤마 포함 큰 수(금액) 먼저 추출
      const bigNums = numPart.match(/\d{1,3}(?:,\d{3}){2,}/g) || [];
      let rest = numPart;
      for (const bn of bigNums) rest = rest.replace(bn, "|");
      // 2단계: 나머지에서 소수/정수 분리 — "59.6241041.7" 처리
      // 경매통계 구조: 낙찰가율(소수,100미만) + 총건수(정수) + 낙찰건수(정수) + 낙찰률(소수,100미만)
      // "59.6241041.7" → 59.62, 4, 10, 41.7
      // "66.0601931.7" → 66.06, 0, 19, 31.7
      const restClean = rest.split("|").join("");
      const smallTokens: number[] = [];
      // 소수: 정수부 1~2자리 + 소수점 이하 1~2자리 (% 값이므로 100 미만)
      const smartDecPattern = /(\d{1,2}\.\d{1,2})/g;
      let dm;
      const decimals: { val: number; idx: number; len: number }[] = [];
      while ((dm = smartDecPattern.exec(restClean)) !== null) {
        decimals.push({ val: parseFloat(dm[1]), idx: dm.index, len: dm[0].length });
      }
      let cursor = 0;
      for (const dec of decimals) {
        if (dec.idx > cursor) {
          const intPart = restClean.substring(cursor, dec.idx);
          const ints = intPart.match(/\d+/g) || [];
          for (const iv of ints) smallTokens.push(parseInt(iv));
        }
        smallTokens.push(dec.val);
        cursor = dec.idx + dec.len;
      }
      if (cursor < restClean.length) {
        const tail = restClean.substring(cursor);
        const ints = tail.match(/\d+/g) || [];
        for (const iv of ints) smallTokens.push(parseInt(iv));
      }
      if (decimals.length === 0) {
        const ints = restClean.match(/\d+/g) || [];
        for (const iv of ints) smallTokens.push(parseInt(iv));
      }

      const numTokens = [...bigNums.map(bn => parseNum(bn)!), ...smallTokens];
      // Expected: totalAppraisal, totalBid, bidRate, totalCases, bidCases, bidCaseRate
      // 5개 토큰일 때: bidRate와 bidCaseRate 사이 정수가 "총건수+낙찰건수" 합쳐진 것
      // 예: [4083M, 2435M, 59.62, 410, 41.7] → 410 = "4"+"10" → 분리 불가하므로 합산으로 기록
      if (numTokens.length >= 6) {
        rows.push({
          usage,
          totalAppraisal: numTokens[0],
          totalBid: numTokens[1],
          bidRate: numTokens[2],
          totalCases: numTokens[3],
          bidCases: numTokens[4],
          bidCaseRate: numTokens[5],
        });
      } else if (numTokens.length === 5) {
        // totalCases + bidCases가 합쳐진 경우 — 개별 분리가 어려우므로 합산값 사용
        rows.push({
          usage,
          totalAppraisal: numTokens[0],
          totalBid: numTokens[1],
          bidRate: numTokens[2],
          totalCases: numTokens[3], // 합산 값이지만 기록
          bidCases: 0,
          bidCaseRate: numTokens[4],
        });
      }
    }

    // Source
    if (/인포케어/.test(flat)) source = "인포케어";
  }

  if (rows.length === 0) return { data: null, confidence: 0 };

  return {
    data: { region, period, rows, source },
    confidence: rows.length > 0 ? 0.8 : 0,
  };
}

function parsePropertyOverview(lines: string[]): {
  data: Partial<SupplyOverview>;
  confidence: number;
} {
  // Find "대상물건 개요" or "부동산" section
  let startIdx = findLineIndex(lines, /대상물건\s*개요/, 0);
  if (startIdx < 0) startIdx = findLineIndex(lines, /^1\.\s*부동산/, 0);
  if (startIdx < 0) return { data: {}, confidence: 0 };

  const project: Partial<SupplyOverview["project"]> = {};
  let found = 0;
  const scanEnd = Math.min(startIdx + 40, lines.length);

  for (let i = startIdx; i < scanEnd; i++) {
    const l = lines[i];
    const flat = l.replace(/\s/g, "");

    // 소재지 + 건물명
    if (/소\s*재\s*지/.test(l)) {
      const kv = extractInlineKV(flat, ["소재지", "건물명"]);
      if (kv["소재지"]) { project.address = kv["소재지"]; found++; }
      if (kv["건물명"]) { project.name = kv["건물명"]; found++; }
    }

    // 주용도 + 사용승인일
    if (/주\s*용\s*도/.test(l) || /사\s*용\s*승\s*인\s*일/.test(l)) {
      const kv = extractInlineKV(flat, ["주용도", "사용승인일"]);
      if (kv["주용도"]) { project.purpose = kv["주용도"]; found++; }
      if (kv["사용승인일"]) { project.completionDate = kv["사용승인일"]; found++; }
    }

    // 구조 + 층수
    if (/구\s*조/.test(l) && /층수|층/.test(l)) {
      const kv = extractInlineKV(flat, ["구조", "층수"]);
      if (kv["층수"]) { project.scale = kv["층수"]; found++; }
    }

    // 대지면적
    if (/대\s*지\s*면\s*적/.test(l)) {
      const m = flat.match(/대지면적[^0-9]*([\d,.]+)/);
      if (m) {
        const sqm = parseNum(m[1]) || 0;
        project.landArea = { sqm, pyeong: Math.round(sqm * 0.3025 * 100) / 100 };
        found++;
      }
    }

    // 건축면적
    if (/건\s*축\s*면\s*적/.test(l)) {
      const m = flat.match(/건축면적[^0-9]*([\d,.]+)/);
      if (m) {
        const sqm = parseNum(m[1]) || 0;
        project.buildingArea = { sqm, pyeong: Math.round(sqm * 0.3025 * 100) / 100 };
        found++;
      }
    }

    // 연면적
    if (/연\s*면\s*적/.test(l)) {
      const m = flat.match(/연면적[^0-9]*([\d,.]+)/);
      if (m) {
        const sqm = parseNum(m[1]) || 0;
        project.grossArea = { sqm, pyeong: Math.round(sqm * 0.3025 * 100) / 100 };
        found++;
      }
    }

    // 건폐율/용적률
    if (/건폐율|용적률/.test(flat)) {
      const cm = flat.match(/([\d.]+)%/);
      const fm = flat.match(/용적률[^0-9]*([\d.]+)%/);
      if (cm) project.coverageRatio = parseFloat(cm[1]);
      if (fm) project.floorAreaRatio = parseFloat(fm[1]);
    }

    // 세대수(호수)
    if (/세\s*대\s*수|호수/.test(l)) {
      const m = flat.match(/([\d,]+)\s*호/);
      if (m) {
        // Store as parking temporarily; there's no 'units' field in project
        // Actually, no direct field — skip or use scale
      }
    }
  }

  const supply: Partial<SupplyOverview> = {};
  if (found > 0) {
    supply.project = project as SupplyOverview["project"];
  }

  return { data: supply, confidence: Math.min(found / 4, 1) };
}

function parseFloorSummary(lines: string[]): {
  data: CollateralDetailItem[];
  confidence: number;
} {
  // Floor summary is typically in "구분건물 감정평가 명세표" section
  // This is a fallback when parseUnitAppraisals can't find the 비준가액 table
  const idx = findLineIndex(lines, /구분건물\s*감정평가\s*명세표|감정평가명세표/, 0);
  if (idx < 0) return { data: [], confidence: 0 };

  const items: CollateralDetailItem[] = [];
  let serial = 0;
  const scanEnd = Math.min(idx + 500, lines.length);

  for (let i = idx; i < scanEnd; i++) {
    const l = lines[i].trim();
    if (isPageHeader(l)) continue;
    if (/합\s*계|소\s*계/.test(l) && /[\d,]+/.test(l)) break;

    // Look for floor + unit + area + value patterns on consecutive lines
    const floorMatch = l.match(/(지하\s*\d+|제?\s*\d+)\s*층/);
    if (floorMatch) {
      const floor = l.trim();
      // Next line may have unit name
      if (i + 1 < scanEnd) {
        const unitLine = lines[i + 1].trim();
        if (/호/.test(unitLine)) {
          // Next line has numbers
          if (i + 2 < scanEnd) {
            const numLine = lines[i + 2].trim();
            const tokens = numLine.split(/\s+/).filter(t => /[\d,.]/.test(t));
            if (tokens.length >= 2) {
              serial++;
              const area = parseNum(tokens[tokens.length - 2]) || 0;
              const value = parseNum(tokens[tokens.length - 1]) || 0;
              if (area > 0 && area < 500 && value > 100_000_000) {
                const areaPyeong = Math.round(area * 0.3025 * 100) / 100;
                items.push({
                  no: serial,
                  unit: unitLine,
                  floor,
                  areaSqm: area,
                  areaPyeong,
                  appraisalValue: value,
                  planPrice: 0,
                  releaseCondition: 0,
                  appraisalPricePerPyeong: areaPyeong > 0 ? Math.round(value / areaPyeong) : 0,
                  planPricePerPyeong: 0,
                  status: "분양",
                  remarks: "",
                });
              }
            }
          }
        }
      }
    }
  }

  return { data: items, confidence: items.length > 0 ? Math.min(items.length / 10, 1) : 0 };
}

function parseValuationSummary(lines: string[]): {
  data: AppraisalParseResult["valuationSummary"];
  confidence: number;
} {
  // Find "시산가액 검토" or "감정평가액 결정"
  let idx = findLineIndex(lines, /시산가액\s*검토/, 0);
  if (idx < 0) idx = findLineIndex(lines, /감정평가액\s*결정/, 0);
  if (idx < 0) return { data: null, confidence: 0 };

  let comparisonTotal = 0;
  let incomeTotal = 0;
  let finalValue = 0;
  let method = "";

  const scanEnd = Math.min(idx + 300, lines.length);
  for (let i = idx; i < scanEnd; i++) {
    const l = lines[i];
    const flat = l.replace(/\s/g, "");

    // Look for "소계" or totals line with two large numbers
    if (/소\s*계/.test(l)) {
      // 숫자가 공백 없이 연결됨 — 콤마 포함 큰 수 패턴으로 분리
      const bigNums = flat.match(/\d{1,3}(?:,\d{3}){2,}/g);
      if (bigNums) {
        const parsed = bigNums.map(n => parseNum(n)).filter((n): n is number => n !== null && n > 1_000_000);
        if (parsed.length >= 2) {
          comparisonTotal = parsed[0];
          incomeTotal = parsed[1];
        } else if (parsed.length === 1) {
          comparisonTotal = parsed[0];
        }
      }
    }

    // "감정평가액 결정" section — find final value
    if (/감정평가액\s*결정|감정평가액결정/.test(flat)) {
      // Scan for the determination
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        const fl = lines[j].replace(/\s/g, "");

        // Method detection
        if (/거래사례비교법/.test(fl) && /시산가액/.test(fl)) {
          method = "거래사례비교법";
        }
        if (/수익환원법/.test(fl) && /시산가액/.test(fl) && !method) {
          method = "수익환원법";
        }

        // Final value: "합계" or "구분건물" line with number
        if (/합\s*계|구분건물/.test(lines[j])) {
          const nums = fl.match(/[\d,]+/g);
          if (nums) {
            const parsed = nums.map(n => parseNum(n)).filter((n): n is number => n !== null && n > 1_000_000_000);
            if (parsed.length > 0) {
              finalValue = parsed[parsed.length - 1];
            }
          }
        }
      }
    }
  }

  // If we found comparisonTotal but no finalValue, use comparisonTotal
  if (!finalValue && comparisonTotal) finalValue = comparisonTotal;

  if (!comparisonTotal && !finalValue) return { data: null, confidence: 0 };

  return {
    data: {
      comparisonTotal,
      incomeTotal,
      finalValue,
      method: method || "거래사례비교법",
    },
    confidence: finalValue > 0 ? 0.9 : 0.5,
  };
}

// ── 메인 파서 ──

export async function parseAppraisalPdf(
  buffer: Buffer,
  _propertyType: string,
): Promise<AppraisalParseResult> {
  const warnings: string[] = [];
  const confidence: Record<string, number> = {};

  const lines = await extractLines(buffer);
  if (lines.length === 0) {
    return {
      collateral: {},
      comparatives: [],
      comparativeBuildings: [],
      supply: {},
      collateralDetail: [],
      auctionQuote: null,
      valuationSummary: null,
      landTradeCases: [],
      landAppraisalCases: [],
      unitTradeCases: [],
      unitAppraisalCases: [],
      confidence: {},
      warnings: ["PDF에서 텍스트를 추출할 수 없습니다."],
    };
  }

  console.log(`[AppraisalParser v2] ${lines.length}줄 추출`);

  const parsers: [string, () => any][] = [
    ["basicInfo", () => parseBasicInfo(lines)],
    ["unitAppraisals", () => parseUnitAppraisals(lines)],
    ["comparatives", () => parseComparativeBuildings(lines)],
    ["landComparatives", () => parseLandComparatives(lines)],
    ["unitComparatives", () => parseUnitComparatives(lines)],
    ["auctionQuote", () => parseAuctionQuote(lines)],
    ["propertyOverview", () => parsePropertyOverview(lines)],
    ["floorSummary", () => parseFloorSummary(lines)],
    ["valuationSummary", () => parseValuationSummary(lines)],
  ];

  const results: Record<string, any> = {};
  for (const [name, fn] of parsers) {
    try {
      const r = fn();
      results[name] = r.data;
      confidence[name] = r.confidence;
      if (r.confidence === 0) warnings.push(`${name} 섹션을 찾지 못했습니다.`);
    } catch (e: any) {
      warnings.push(`${name} 파싱 오류: ${e?.message || e}`);
      confidence[name] = 0;
    }
  }

  const unitItems: CollateralDetailItem[] = results.unitAppraisals || [];
  const floorItems: CollateralDetailItem[] = results.floorSummary || [];
  const detail = unitItems.length > 0 ? unitItems : floorItems;
  const comp = results.comparatives || { buildings: [], cases: [] };
  const land = results.landComparatives || { trades: [], appraisals: [] };
  const unit = results.unitComparatives || { trades: [], appraisals: [] };

  return {
    collateral: results.basicInfo || {},
    comparatives: comp.cases,
    comparativeBuildings: comp.buildings,
    supply: results.propertyOverview || {},
    collateralDetail: detail,
    auctionQuote: results.auctionQuote || null,
    valuationSummary: results.valuationSummary || null,
    landTradeCases: land.trades,
    landAppraisalCases: land.appraisals,
    unitTradeCases: unit.trades,
    unitAppraisalCases: unit.appraisals,
    confidence,
    warnings,
  };
}

// ── Raw text 추출 헬퍼 (물건유형 자동감지용) ──

export async function extractRawText(buffer: Buffer): Promise<string> {
  const lines = await extractLines(buffer);
  return lines.join('\n');
}
