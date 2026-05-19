#!/usr/bin/env tsx
// 9사 회귀 검증용 corp_code 매핑 검증 — regression-check.mjs의 COMPANIES_CORP가
// 실제 findCorpCode 결과와 일치하는지 일회성 점검
import "./lib/diag-bootstrap.mts";
const mod: any = await import("../src/lib/dart-corp-codes.ts");
const findCorpCode = mod.findCorpCode;
const COMPANIES_CORP: Record<string, string> = {
  "삼성전자": "00126380",
  "LG화학": "00356361",
  "SK하이닉스": "00164779",
  "카카오": "00258801",
  "셀트리온": "00421045",
  "NAVER": "00266961",
  "현대건설": "00164742",
  "대우건설": "00146772",
  "효성중공업": "01515323",
};
for (const [name, hardcoded] of Object.entries(COMPANIES_CORP)) {
  const r = findCorpCode(name);
  const actual = r ? r.corpCode : "(없음)";
  const match = actual === hardcoded ? "✓" : "❌";
  console.log(`${match} ${name.padEnd(10)} hardcoded=${hardcoded} actual=${actual} ${r ? `(${r.corpName})` : ""}`);
}
