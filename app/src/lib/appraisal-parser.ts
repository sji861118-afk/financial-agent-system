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

// ── 텍스트 추출 ──

async function extractLines(buffer: Buffer): Promise<string[]> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as any).default || mod;
  const data = await pdfParse(buffer);
  const text: string = data.text || "";
  if (!text || text.trim().length < 50) return [];
  return text.split(/\n/).filter((l: string) => l.trim().length > 0);
}

// ── 섹션 파서 스텁 (Task 3~7에서 구현) ──

function parseBasicInfo(lines: string[]): {
  data: Partial<CollateralAnalysis>;
  confidence: number;
} {
  const data: Partial<CollateralAnalysis> = {};
  let found = 0;

  // 감정평가서번호 (serial number like C32508-2-1401)
  const serialIdx = findLineIndex(lines, /감정평가서번호/, 0);
  if (serialIdx >= 0) {
    // Serial is typically a few lines after the header
    for (let i = serialIdx + 1; i < Math.min(serialIdx + 10, lines.length); i++) {
      const m = lines[i].match(/([A-Z]\d[\d\-]+)/);
      if (m) { data.serialNo = m[1]; found++; break; }
    }
  }

  // 소유자
  const ownerIdx = findLineIndex(lines, /소\s*유\s*자/, 0);
  if (ownerIdx >= 0) {
    for (let i = ownerIdx + 1; i < Math.min(ownerIdx + 5, lines.length); i++) {
      const t = lines[i].trim();
      if (t.length > 1 && !/^\d/.test(t) && !/소\s*유\s*자/.test(t)) {
        data.owner = t; found++; break;
      }
    }
  }

  // 감정평가법인 (appraiser) — near the top
  const appIdx = findLineIndex(lines, /감정평가법인/, 0);
  if (appIdx >= 0) {
    const appLine = lines[appIdx].replace(/\s/g, "");
    const m = appLine.match(/([\uAC00-\uD7A3()]+감정평가법인)/);
    if (m) { data.appraiser = m[1]; found++; }
  }

  // 채무자 — typically near line 97 area
  const debtorIdx = findLineIndex(lines, /채\s*무\s*자/, 0);
  if (debtorIdx >= 0) {
    for (let i = debtorIdx; i < Math.min(debtorIdx + 5, lines.length); i++) {
      const t = lines[i].trim();
      // Look for a company/person name after 채무자
      const afterLabel = t.replace(/.*채\s*무\s*자\s*/, "").trim();
      if (afterLabel.length > 1) { data.debtor = afterLabel; found++; break; }
      if (i > debtorIdx && t.length > 1 && !/채\s*무\s*자/.test(t)) {
        data.debtor = t; found++; break;
      }
    }
  }

  // 신탁사 (trustee)
  for (let i = 0; i < Math.min(150, lines.length); i++) {
    const m = lines[i].match(/([\uAC00-\uD7A3]+(?:자산)?신탁(?:\(주\)|\s*주식회사)?)/);
    if (m && !data.trustee) { data.trustee = m[1]; found++; break; }
  }

  // 목적 (purpose) — look for 담보 near top
  const purposeIdx = findLineIndex(lines, /^담보$/, 0);
  if (purposeIdx >= 0) { data.purpose = "담보"; found++; }

  // 의뢰인 / 제출처
  for (let i = 0; i < Math.min(100, lines.length); i++) {
    const stripped = lines[i].replace(/\s/g, "");
    if (!data.submittedTo && stripped.length > 2) {
      // Look for financial institution names right before/after serial
      if (/증권|은행|캐피탈|저축/.test(stripped) && !/감정평가/.test(stripped)) {
        data.submittedTo = lines[i].trim(); found++;
      }
    }
  }

  // 기준시점 (base date) — pattern: 2025. 08. 182025. 08. 18
  for (let i = 0; i < Math.min(150, lines.length); i++) {
    const d = extractDate(lines[i]);
    if (d) { data.baseDate = d; found++; break; }
  }

  // 감정평가액 — look for the total value line with ₩ or \
  for (let i = 0; i < Math.min(150, lines.length); i++) {
    const stripped = lines[i].replace(/\s/g, "");
    // Pattern: \78,022,000,000 or ₩78,022,000,000
    const m = stripped.match(/[\\₩￦]([\d,]+)/);
    if (m) {
      const val = parseNum(m[1]);
      if (val && val >= 100_000_000) { // at least 1억
        data.appraisalValue = val; found++;
        break;
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
      if (/실거래사례/.test(flat)) {
        // Skip header lines, then read transaction rows
        let k = j + 1;
        // Skip header row
        while (k < scanEnd && /구분|층|호|면적|거래일자|거래금액|단가|비고/.test(lines[k].replace(/\s/g, ""))) k++;
        // Read data rows
        while (k < scanEnd) {
          const row = lines[k].trim();
          if (!row || /감정평가사례|^$/.test(row) || /구분.*층.*호/.test(row.replace(/\s/g, ""))) break;
          // Try to parse: label floor unit area date price unitPrice remark
          const parts = row.split(/\s+/);
          if (parts.length >= 5) {
            // Find numeric values
            const nums: number[] = [];
            let dateStr = "";
            for (const p of parts) {
              if (/\d{4}-\d{2}-\d{2}/.test(p)) dateStr = p;
              const n = parseNum(p);
              if (n !== null) nums.push(n);
            }
            if (nums.length >= 2) {
              const txCase: ComparativeCase = {
                type: "거래",
                label: parts[0] || "",
                address,
                buildingName,
                unit: `${parts[1] || ""}층 ${parts[2] || ""}`,
                usage: "",
                purpose: "거래",
                source: "실거래가",
                areaSqm: nums[0] < 1000 ? nums[0] : 0,
                areaPyeong: (nums[0] < 1000 ? nums[0] : 0) * 0.3025,
                price: nums.find(n => n > 10_000_000) || 0,
                pricePerPyeong: nums[nums.length - 1] > 1_000_000 ? nums[nums.length - 1] : 0,
                baseDate: dateStr,
              };
              allCases.push(txCase);
            }
          }
          k++;
        }
      }

      // Parse appraisal cases (감정평가사례)
      if (/감정평가사례/.test(flat)) {
        let k = j + 1;
        while (k < scanEnd && /구분|층|호|면적|기준시점|감정평가액|단가|비고/.test(lines[k].replace(/\s/g, ""))) k++;
        while (k < scanEnd) {
          const row = lines[k].trim();
          if (!row || casePattern.test(row) || /^\d+\.\s/.test(row)) break;
          const parts = row.split(/\s+/);
          if (parts.length >= 5) {
            const nums: number[] = [];
            let dateStr = "";
            for (const p of parts) {
              if (/\d{4}-\d{2}-\d{2}/.test(p)) dateStr = p;
              const n = parseNum(p);
              if (n !== null) nums.push(n);
            }
            if (nums.length >= 2) {
              const apCase: ComparativeCase = {
                type: "평가",
                label: parts[0] || "",
                address,
                buildingName,
                unit: `${parts[1] || ""}층 ${parts[2] || ""}`,
                usage: "",
                purpose: "감정평가",
                source: "감정평가",
                areaSqm: nums[0] < 1000 ? nums[0] : 0,
                areaPyeong: (nums[0] < 1000 ? nums[0] : 0) * 0.3025,
                price: nums.find(n => n > 10_000_000) || 0,
                pricePerPyeong: nums[nums.length - 1] > 1_000_000 ? nums[nums.length - 1] : 0,
                baseDate: dateStr,
              };
              allCases.push(apCase);
            }
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

    // Region and period: "경기 안양시 동안구 2024 년 08 월 ~ 2025 년 07 월"
    const periodMatch = l.match(/([\uAC00-\uD7A3\s]+(?:시|군|구))\s*(\d{4}\s*년?\s*\d{1,2}\s*월?\s*~\s*\d{4}\s*년?\s*\d{1,2}\s*월?)/);
    if (periodMatch) {
      region = periodMatch[1].trim();
      period = periodMatch[2].replace(/\s+/g, " ").trim();
    }

    // Also try: "용도별경기안양시동안구2024년08월~2025년07월"
    if (!region && /용도별/.test(flat)) {
      const m2 = flat.match(/용도별([\uAC00-\uD7A3]+(?:시|군|구))([\d년월~]+)/);
      if (m2) {
        region = m2[1];
        period = m2[2].replace(/년/g, ".").replace(/월/g, "").replace(/~/g, " ~ ");
      }
    }

    // Data rows: "근린상가4,083,000,0002,435,194,00059.6241041.7"
    // or with spaces: "근린상가 4,083,000,000 2,435,194,000 59.62 4 10 41.7"
    const usageMatch = flat.match(/^([\uAC00-\uD7A3]+(?:상가|공장|주거|오피스|아파트형공장|근린상가))([\d,.]+)/);
    if (usageMatch) {
      const usage = usageMatch[1];
      // Extract numbers from the rest of the line
      const numPart = flat.replace(usage, "");
      const numTokens: number[] = [];
      // Split by known boundaries: large numbers, then percentages, then small counts
      const allNums = numPart.match(/[\d,.]+/g);
      if (allNums) {
        for (const n of allNums) {
          const v = parseNum(n);
          if (v !== null) numTokens.push(v);
        }
      }
      // Expected: totalAppraisal, totalBid, bidRate, totalCases, bidCases, bidCaseRate
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

  const scanEnd = Math.min(idx + 60, lines.length);
  for (let i = idx; i < scanEnd; i++) {
    const l = lines[i];
    const flat = l.replace(/\s/g, "");

    // Look for "소계" or totals line with two large numbers
    if (/소\s*계/.test(l)) {
      const nums = flat.match(/[\d,]+/g);
      if (nums) {
        const parsed = nums.map(n => parseNum(n)).filter((n): n is number => n !== null && n > 1_000_000);
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
      confidence: {},
      warnings: ["PDF에서 텍스트를 추출할 수 없습니다."],
    };
  }

  console.log(`[AppraisalParser v2] ${lines.length}줄 추출`);

  const parsers: [string, () => any][] = [
    ["basicInfo", () => parseBasicInfo(lines)],
    ["unitAppraisals", () => parseUnitAppraisals(lines)],
    ["comparatives", () => parseComparativeBuildings(lines)],
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

  return {
    collateral: results.basicInfo || {},
    comparatives: comp.cases,
    comparativeBuildings: comp.buildings,
    supply: results.propertyOverview || {},
    collateralDetail: detail,
    auctionQuote: results.auctionQuote || null,
    valuationSummary: results.valuationSummary || null,
    confidence,
    warnings,
  };
}
