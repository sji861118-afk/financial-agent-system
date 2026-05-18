# CHANGELOG — DART 파싱 / 재무제표 추출

← back to [CLAUDE.md](./CLAUDE.md)

DART 전자공시 API, 감사보고서 XML, 사업보고서 XML, 회계기준(K-IFRS/K-GAAP), 재무제표 BS/IS/CF 추출에 관한 lessons learned.

---

## 2026-05-18
- **DART CFS BS 동명이항목 분리 (account_id를 unique key로)** — 대기업 K-IFRS 표준 BS에서 "계약부채" / "리스부채" / "차입금" 같은 계정이 유동(예: `ord=43`, `ifrs-full_CurrentContractLiabilities`)과 비유동(`ord=55`, `ifrs-full_NoncurrentContractLiabilities`) 양쪽에 **같은 `account_nm`·다른 `account_id`** 로 등장. `buildStatements`가 `seen.has(nm)` + `vals[nm]=amt` 패턴으로 nm-keyed 처리하면 (1) `accountOrder`는 첫 번째 ord 위치(유동)만 가지고 (2) `yearData[year][nm]`은 마지막 처리(비유동) 값으로 덮어쓰기 → **유동부채 하위 행에 비유동 금액 표시 + 비유동부채 하위 행 자체 누락**. CJ대한통운 사용자 피드백과 정확히 일치. 해결: `accountOrder` 항목에 `key = id || nm` 필드 추가, `yearData[year]`도 `key`-primary + nm fallback. `disambiguateBsDuplicates()` 신규 — 같은 nm이 2번 이상 등장 시 직전 depth=1 헤더(`유동/비유동부채/자산`)를 추적해 "(유동)"/"(비유동)" suffix 부여. `normalizeAcct`가 suffix를 자동 strip하므로 `calcRatios` 키워드 매칭은 영향 없음. **lesson: DART CFS BS의 dedup 키는 반드시 `account_id` 기반이어야 함. nm-keyed dedup은 K-IFRS 표준 분류 회사에서 silent data loss 발생. memory 상의 `classifyBsSectionByName`/`reorderBsAccounts`/`getBsSortRank` 함수는 현재 코드에 없음 — 단순 ord-based + detectAccountDepth + refineDepthBySumDetection chain으로 단순화됨.** (commit 007622c)
- **excel-generator acctRowMap 괄호 normalize 손실 → SUM 수식 누락** — `acctRowMap`은 계정명을 `replace(/[\s()]/g, "")`로 정규화하여 키 저장. disambiguation suffix `(유동)/(비유동)`가 붙은 행은 "리스부채유동"/"리스부채비유동" 키가 됨 → `findRow("리스부채")` 매칭 실패 → `borrowRows` 비어 → 총차입금 SUM formula `null` → raw 숫자 fallback (수식 바 비어 보임). 사용자 피드백: "재무비율은 항상 서식(수식)으로 표현". 해결: `findRow`에 suffix variant lookup 추가 (`norm + "유동"` / `norm + "비유동"` 순차 시도), `findAllRows` 신규 — keyword별 매칭 행 모두 수집해서 SUM 수식이 분리된 유동/비유동 행을 양쪽 다 참조. `borrowingKeywords`에 "차입금" 단독 키워드 추가 (CJ대한통운은 "단기차입금"/"장기차입금" 구분 없이 그냥 "차입금"만 공시). **lesson: pipeline 중간에 부여한 disambiguation suffix가 downstream의 정규화 정책에서 silent하게 흡수되어 매칭이 깨지는 패턴 주의 — 매핑 단계 일관성이 매번 필요. 또한 `data fix` 통과 후에도 `Excel cell formula`까지 production UI에서만 드러나는 secondary bug 가능성을 항상 체크.** (commit 2bd7ae3)
- **MCP 도구로 임시 diag endpoint 회피** — 과거 패턴(`/api/dart/diag-da`, `/api/dart/diag-fetch` 배포→curl→제거)을 `mcp__claude_ai_mcp__opendart-find_company` + `get_full_financial_statement` 대화 내 호출로 대체. 배포 cycle 불필요, PUBLIC_PATHS 등록·정리 부담 사라짐. 진단 raw 데이터가 conversation context에 바로 유입.
- **로컬 tsx로 buildFinancialData 직접 호출 (JWT 우회)** — `app/scripts/diag-*.mts`에서 `import * as dartApi from "../src/lib/dart-api.ts"` 후 `dartApi.buildFinancialData(corp_code, years, stockCode)` 직접 호출. tsx CJS 호환 모드라 `mod.buildFinancialData || mod.default?.buildFinancialData` 양호환 unwrap 필요. 운영 JWT_SECRET 없이 production 코드 path 검증 가능 — regression-check.mjs HTTP 모드의 대안.

## 2026-05-07
- **K-IFRS↔K-GAAP 회계기준 변경 회사 매출 추출 fallback (`getRevenueByYear`)**: 프로젠처럼 K-GAAP(23년) → K-IFRS(24/25년) 전환된 회사는 IS 시트에 매출 데이터가 두 행으로 흩어짐 (Row 3 "매출액" 일부 연도만 + Row 167 "매출총이익" 다른 연도). `findItem`이 첫 매치만 반환하므로 한 행에서 전 연도가 0 ratio 발생. 해결: `financial-analyzer.ts`에 `getRevenueByYear(isItems, year)` 헬퍼 신규 — 1차로 매출 직접 매칭, 0/null이면 **회계 항등식 fallback `매출총이익 + |매출원가|`** 시도. `calcGrowthRatios` (매출증가율), `calcActivityRatios` (총자산회전율, 매출채권회전율), `calcAdditionalRatios` (매출총이익률, 순이익률) 3 site에 적용. `dart-api.ts:calcRatios`에도 동일 fallback inline. **lesson: K-IFRS↔K-GAAP 전환 회사는 row-level fallback이 아닌 accounting identity 기반 derived value가 필요. findItem 반환값이 0인 케이스는 "매칭 실패"가 아닌 "다른 행에 있음" 신호일 수 있음.**
- **이중 산출 site 데이터 단절**: 비율은 `dart-api.ts:calcRatios` (Excel 셀수식 기반)와 `financial-analyzer.ts` 3 함수 (집계 카드 기반) 두 곳에서 별도로 계산. 한쪽만 fallback 추가하면 같은 워크북 안에서 8.재무분석 시트와 1.대시보드 시트의 매출증가율이 다르게 표시됨. **lesson: 이중 산출 path가 있는 코드는 fallback/normalization 추가 시 양쪽 모두 적용 — root cause는 데이터 가공 site의 분산이 아니라 입력 단계(매출 추출)에서 통합 헬퍼로 해결해야 정합성 유지.**

## 2026-04-28
- **ZIP 다중 XML 본문 파일 선택 필수**: 사업보고서 ZIP 첫 파일은 첨부 감사보고서(~0.5MB, 개별 BS만), 두 번째가 사업보고서 본문(~1.5MB, BS+IS+CF 풍부). `Object.keys(zip.files)[0]` 첫 파일 선택 패턴은 본문 누락. 가장 큰 .xml 파일 선택으로 변경 — `parseOneAuditXml` + `parseDAFromAnnualXml` 양쪽 적용. 프로젠 25년 IS items 0→163 추출 성공의 핵심 fix. 2026-04-16 "주석 가장 많은 파일 선택"의 BS/IS/CF 본문 미적용 부분 보완 (commit 1085d85).
- **K-IFRS↔K-GAAP 회계기준 변경 자동 폐기**: 코넥스→코스닥 전환 회사(프로젠) 같이 23년 K-GAAP + 24/25년 K-IFRS 보고서가 한 BS 시트에 누적되는 문제. `parseOneAuditXml`에 `detectAccountingStandard` 휴리스틱 추가 — **비율 판정**(K-GAAP 토큰 K-IFRS 2배 이상 + 절대 3+ → K-GAAP, K-IFRS 1+ + K-GAAP <3 → K-IFRS). 단순 "토큰 1+" 룰은 정정공시로 K-IFRS 라벨 차용 시 오분류. `mergeAuditResults`가 충돌 시 false 반환 + 이전 보고서 drop. Stage 1 (`buildStatements`)에도 동일 적용 + `accountingStandardChanged` 메타플래그 (commit 6d1b4e0, 118186c).
- **BS 자본 sub-rank 정렬 + (유동)/(비유동) suffix depth 정규화**: `classifyBsSectionByName`의 4 카테고리(자산/부채/자본/총계)만으로는 자본 *내부* 순서(자본금→자본잉여금→기타자본→기타포괄→이익잉여금) 미정렬. `getBsSortRank()` 신규 — 2.0~2.6 자본 sub-rank, 9.1~9.4 총계 강제. `detectAccountDepth`가 `(유동)/(비유동)` suffix 정규화 후 매칭 → "당기손익-공정가치측정금융자산(유동)" 같은 케이스도 DEPTH1 매치. DEPTH1_KEYWORDS에 관계기업및공동기업투자/사용권자산/매출채권및기타채권 등 12+ 항목 보강 (commit e5b5159).
- **findItem 정확매칭 우선 + 짧은 계정명 처리 ("매출액" vs "매출")**: 셀리드 IS는 "매출" 한 단어로만 공시. findItem이 ["매출액", ...]만 검사하면 미매치, "매출"을 부분매칭에 추가하면 "매출원가/매출채권"이 먼저 매치되는 충돌. 해결: findItem이 정확매칭(===) 단계를 부분매칭(includes) 앞에 두고, `calcRatios`의 `getExact` 키워드에 "매출" 추가 (정확매칭만, 부분매칭에는 금지). 셀리드 매출증가율 R034 `-/-/-` → `-/-/+112.4%` 해결 (commit b0a940e + c4401b4 findItem 부분).

## 2026-04-16
- **비상장 외감법인(corp_cls=E)도 fnlttSinglAcntAll 데이터 있을 수 있음** — 교보생명보험 등. 비상장이라고 무조건 Stage 1/2 스킵하면 안 됨. 항상 시도 후 실패 시 Stage 3 fallback.
- **buildFinancialData OFS/CFS 완전 병렬화 필수** — 기존 for 루프(OFS→CFS 순차)는 Vercel US→DART Korea 레이턴시로 CFS 타임아웃 빈발. `Promise.all`로 6개(OFS 3년+CFS 3년) 동시 호출해야 안정적.
- **DART 계정명 연도간 변경 흡수**: `영업이익(손실)`↔`영업이익`, `당기순이익(손실)`↔`연결당기순이익` 등. `normalizeForMatch()` 함수로 `(손실)` 접미사 제거 + `연결` 접두사 제거하여 매칭. yearData 저장 시 정규화 키도 함께 저장, 조회 시 fallback.
- **fetchFinancialItems 타임아웃 12초→20초**: Vercel US↔DART Korea 간 레이턴시 고려. 12초 타임아웃은 CFS 호출 실패의 원인.
- **최신 보고서 기준 원칙**: 기업은 정정공시를 통해 최신 보고서(2025년)에 과거연도(2023년) 수치를 수정 반영함. 2023년 데이터는 2023년 자체 보고서의 thstrm이 아니라, 2025년 보고서의 bfefrmtrm을 사용해야 정확. `buildStatements`에서 가장 최근 보고서(reverse sort 먼저 처리)의 데이터가 우선되도록 변경.
- **BS 정렬**: DART API ord 필드가 부정확한 기업이 많음. `classifyBsSectionByName()` + `reorderBsAccounts()`로 자산→부채→자본 섹션 재정렬 필수.
- **감사보고서 XML CF 파싱**: `parseOneAuditXml`에서 BS/IS 이후 `현금흐름표` 키워드 감지 → cf 섹션 진입. `영업활동`, `투자활동`, `재무활동` 항목 추출. `기말의현금` 행 이후 종료.
- **감사보고서 주석 추출**: 감사보고서(F-type) 없으면 사업보고서(A-type) fallback. ZIP 내 여러 XML 파일 중 주석이 가장 많은 파일 선택. `별첨 주석` 또는 `재무제표에 대한 주석` 이후만 파싱.
- **감사보고서 연도 범위 확장 방지**: Stage 3 XML 파싱은 당기+전기 2개년 추출하므로 3년 요청 시 5년으로 확장됨. `filterYearsToRange()`로 요청 범위(minReq~maxReq)로 필터링 필수.
- **BS 분류 일반 규칙**: 키워드 목록 매칭 실패 시 계정명에 "부채" 포함되면 부채로 분류. "당기손익-공정가치측정금융부채" 같은 비표준 계정명 누락 방지. 감수 에이전트에서도 자산 영역에 부채 계정 배치 시 ERROR 감지.

## 2026-04-14
- `detectAccountDepth()` 전 산업 키워드 확장 필수 — 제조/건설/보험/금융/IT 등 80+ depth1 키워드, 30+ depth0 키워드로 K-IFRS/K-GAAP 전체 커버.
- DOCX 재무제표 depth→indent 매핑 누락 주의 — `StatementLineItem` 인터페이스의 `indent` 필드에 값을 넣어야 obligor.ts에서 들여쓰기 적용됨 (`depth` 필드는 Excel 전용).
- `refineDepthBySumDetection()`: 키워드 미커버 계정도 합계금액 매칭으로 자동 부모-자식 감지 가능. 단, 승격된 부모의 자식 영역은 skipUntil로 건너뛰어야 연쇄 오승격 방지.
- 비상장사(롯데건설 등) DART 조회: 연결 재무제표 없음(개별만 가능). 연결 데이터는 IM(투자설명서) 등 별도 소스 필요.

## 2026-04-13
- **비상장(stockCode 빈값) 회사는 Stage 1/2 API 호출 스킵 필수** — 27+ 불필요 호출로 60초 타임아웃 발생. `buildFinancialData`에 stockCode 파라미터 전달하여 감지.
- **일부 외감법인(corp_cls=E)은 사업보고서를 제출하지만 fnlttSinglAcntAll API에 데이터 없음** — 대지개발(00415558) 등. 사업보고서 document.xml 파싱으로 재무데이터 추출 가능.
- Stage 3 감사보고서(F-type)가 최신 연도를 커버 못 할 때 사업보고서(A-type) XML을 fallback으로 파싱하도록 `fetchAuditReportData` 확장.
- hasData=false일 때 빈 엑셀 생성/저장 방지 — 파일관리에 빈 파일이 나타나는 문제 해결.

## 2026-04-01
- DART XML 파서 재무 값이 string("474,588") 반환 → obligor 분석에서 typeof number 체크하므로 `parseFloat` 변환 필수.
- DART `fetchBorrowingNotes` 차입금 단위는 천원 → loan-engine 백만원 단위이므로 /1000 변환.

## 2026-03-31
- 비상장 외감법인은 fnlttSinglAcntAll/fnlttSinglAcnt API 데이터 없음 → 감사보고서 XML 파싱만 가능 (→ 2026-04-13 사업보고서 XML fallback 추가로 보완).

## 2026-03-26
- DART 분기보고서 IS는 thstrm_add_amount(누적) 사용 필수, thstrm_amount는 3개월치만.
- Excel 연도 컬럼은 항상 오름차순(22→25), 분기보고서는 기준월 표시(25.09).
- 감사보고서 XML 주석번호("4,5,6,7") 셀이 `/[\d,]{3,}/`에 매칭 → 금액으로 오인식. `/\d{3,}/` + 주석 패턴 선 필터 필요.
- 감사보고서 간 계정명 표기 차이(주석 공백, 번호접두사) → merge 실패의 주원인. `normalizeAcct()` 통합 필수.
- 총차입금 계산 시 차입금 바로 다음 행의 현재가치할인차금(음수)을 감지하여 순액 반영해야 정확.
