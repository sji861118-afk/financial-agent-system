#!/usr/bin/env tsx
/**
 * DART OpenAPI raw 응답 직접 dump (buildFinancialData 우회).
 *
 * 사용 케이스: account_id / account_nm / thstrm / frmtrm / bfefrmtrm 칸을
 *   직접 확인해야 할 때 (placeholder ID 충돌 진단, 분기 frmtrm_add 단위 검증,
 *   계정명 변형 매칭 검증 등). buildFinancialData가 통합/병합/정렬한 결과는
 *   가공 단계 버그를 가릴 수 있어 raw 응답이 진실의 source.
 *
 * 필요 환경: app/.env.local 에 DART_API_KEY (JWT_SECRET 불필요 — production 우회).
 *
 * 사용:
 *   npx tsx app/scripts/diag-dart-raw.mts <corp_name|corp_code> [--year=2024] [--reprt=11011] [--fs=OFS|CFS|both] [--grep=차입]
 *
 *   corp_name 입력 시 find_company로 corp_code 자동 resolve (한글 OK).
 *   corp_code 8자리 숫자 직접 입력도 가능.
 *   --reprt: 11011(사업), 11014(3Q), 11012(반기), 11013(1Q). 기본 11011.
 *   --fs: OFS(개별)/CFS(연결)/both. 기본 both.
 *   --grep: 정규식으로 account_nm 필터링 (예: "차입|사채").
 *
 * 출력 예:
 *   == 롯데건설 (corp_code=00120438) 2024 사업 OFS ==
 *   ord=46 | sj=BS  | id=-표준계정코드 미사용- | nm=단기차입금 및 유동성 장기부채 | thstrm=1,363,065,000,000 | frmtrm=1,868,137,000,000
 *   ord=57 | sj=BS  | id=-표준계정코드 미사용- | nm=장기차입금 및 사채            | thstrm=  675,640,000,000 | frmtrm=  934,699,000,000
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal(): void {
  const appDir = path.resolve(__dirname, "..");
  const envPath = path.join(appDir, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();

const REPRT_LABEL: Record<string, string> = {
  "11011": "사업", "11014": "3Q", "11012": "반기", "11013": "1Q",
};

function parseArgs(argv: string[]): {
  target: string;
  year: string;
  reprt: string;
  fs: "OFS" | "CFS" | "both";
  grep?: RegExp;
} {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      else flags[arg.slice(2)] = "true";
    } else {
      positional.push(arg);
    }
  }
  if (positional.length === 0) {
    console.error("Usage: diag-dart-raw <corp_name|corp_code> [--year=2024] [--reprt=11011] [--fs=both] [--grep=차입]");
    process.exit(1);
  }
  return {
    target: positional[0],
    year: flags.year || String(new Date().getFullYear() - 1),
    reprt: flags.reprt || "11011",
    fs: (flags.fs as any) || "both",
    grep: flags.grep ? new RegExp(flags.grep) : undefined,
  };
}

async function resolveCorpCode(input: string): Promise<{ corpCode: string; corpName: string }> {
  if (/^\d{8}$/.test(input)) return { corpCode: input, corpName: input };
  // 한글 또는 영문 회사명 → dart-corp-codes 모듈 사용
  const mod: any = await import("../src/lib/dart-corp-codes.ts");
  const findCorpCode = mod.findCorpCode || mod.default?.findCorpCode;
  if (!findCorpCode) {
    console.error("findCorpCode export 없음. 8자리 corp_code를 직접 입력하세요.");
    process.exit(1);
  }
  const corp = findCorpCode(input);
  if (!corp) {
    console.error(`회사명 "${input}" 으로 corp_code 찾을 수 없음. DART 등록명 확인 또는 8자리 corp_code 직접 입력.`);
    process.exit(1);
  }
  return { corpCode: corp.corpCode, corpName: input };
}

async function fetchRaw(corpCode: string, year: string, reprt: string, fsDiv: "OFS" | "CFS"): Promise<any[]> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.error("DART_API_KEY 미설정 — app/.env.local 확인");
    process.exit(1);
  }
  const url = `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reprt}&fs_div=${fsDiv}`;
  const res = await fetch(url);
  const j = await res.json();
  if (j.status !== "000") {
    console.log(`  (status=${j.status}, message=${j.message || "-"})`);
    return [];
  }
  return j.list || [];
}

function formatNum(s: string | undefined): string {
  if (!s) return "-".padStart(20);
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s.padStart(20);
  return n.toLocaleString("en-US").padStart(20);
}

function dumpItems(items: any[], grep?: RegExp): void {
  const filtered = grep ? items.filter((it) => grep.test(it.account_nm || "")) : items;
  console.log(`  총 ${items.length}개 항목${grep ? ` (필터 매칭 ${filtered.length})` : ""}`);
  console.log("  ord  | sj  | account_id                                            | account_nm                              | thstrm                | thstrm_add            | frmtrm                | frmtrm_add            | bfefrmtrm");
  console.log("  -----+-----+-------------------------------------------------------+-----------------------------------------+-----------------------+-----------------------+-----------------------+-----------------------+----------");
  for (const it of filtered) {
    const ord = String(it.ord || "").padStart(4);
    const sj = String(it.sj_div || "").padEnd(4);
    const id = String(it.account_id || "").slice(0, 55).padEnd(55);
    const nm = String(it.account_nm || "").slice(0, 40).padEnd(40);
    console.log(`  ${ord} | ${sj}| ${id} | ${nm} | ${formatNum(it.thstrm_amount)} | ${formatNum(it.thstrm_add_amount)} | ${formatNum(it.frmtrm_amount)} | ${formatNum(it.frmtrm_add_amount)} | ${formatNum(it.bfefrmtrm_amount)}`);
  }
}

async function main() {
  const { target, year, reprt, fs: fsDiv, grep } = parseArgs(process.argv);
  const { corpCode, corpName } = await resolveCorpCode(target);
  const label = REPRT_LABEL[reprt] || reprt;
  const divs: ("OFS" | "CFS")[] = fsDiv === "both" ? ["OFS", "CFS"] : [fsDiv];

  for (const div of divs) {
    console.log(`\n== ${corpName} (corp_code=${corpCode}) ${year} ${label} ${div} ==`);
    const items = await fetchRaw(corpCode, year, reprt, div);
    if (items.length > 0) dumpItems(items, grep);
  }
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
