# CHANGELOG — EBITDA / 재무비율 / Excel 생성

← back to [CLAUDE.md](./CLAUDE.md)

EBITDA D&A 보강, 이자비용 dual-source, Excel 셀 수식, 회계 감수 에이전트, financial-analyzer 관련 lessons learned.

---

## 2026-05-18
- **총차입금 SUM 수식이 (유동)/(비유동) 분리 행을 캐치하도록 보강** — `excel-generator.ts` `findRow`에 suffix variant lookup 추가 + `findAllRows` 신규 + `borrowingKeywords`에 "차입금" 단독 키워드 추가. CJ대한통운 BS에서 dart-api.ts `disambiguateBsDuplicates`가 부여한 "차입금(유동)" / "차입금(비유동)" 두 행 모두 총차입금 SUM 수식에 포함되도록. 사용자 피드백 "재무비율은 항상 서식(수식)으로 표현"에 대응. 상세 root cause는 [CHANGELOG-DART.md 2026-05-18](./CHANGELOG-DART.md#2026-05-18) 참조. (commit 2bd7ae3)

## 2026-05-07
- **재무비율 단위 접미사 손실 버그 ("배"/"회")**: Excel 1.대시보드 + 8.재무분석 시트에서 `parseFloat("1.6배")` → `1.6` → `numFmt: "#,##0"` 적용 시 정수 반올림 + 단위 사라짐 → "2"로 표시. 이자보상배율, EBITDA/이자비용, 총자산회전율, 매출채권회전율, 재고자산회전율 모두 영향. 해결: `parseRatioValueForExcel()` 헬퍼 — `endsWith("%")` → `0.0"%"`, `endsWith("배")` → `0.00"배"`, `endsWith("회")` → `0.00"회"` 분기. 숫자 fallback은 `#,##0.00`. text 값이 들어오면 그대로 string return (예외 케이스). **lesson: ExcelJS 셀 numFmt는 단위 접미사를 자동 보존 안 함 — string 파싱 단계에서 단위별 분기 필수.**
- **vsBenchmark 필드와 riskLevel 필드 분리 명확화**: 8.재무분석 시트 평가 컬럼에 "양호/보통/주의" 대신 "높음/낮음/보통"이 표시되는 버그. `RatioDetail`에 두 필드 모두 존재 — `vsBenchmark` (벤치마크 대비, 색상 fill 대상) vs `riskLevel` (절대 위험 수준). 코드 review 시 `r.riskLevel`을 평가 컬럼에 사용하던 코드 발견 → `r.vsBenchmark`로 수정 + 함수명도 `ratioRiskFill` → `ratioVsBenchmarkFill`로 rename. **lesson: 비슷한 의미의 두 필드(벤치마크 대비 vs 절대 수준)는 함수명·셀이름·색상 매핑까지 일관되게 분리해야 review에서 잡힘.**
- **benchmarkLabel propagation**: 8.재무분석 + 1.대시보드 시트에서 벤치마크 표시가 "5"로만 보이고 단위 누락 ("5배"이어야 함). financial-analyzer가 `benchmarkLabel` 필드를 채워 보내지만 `excel-generator.ts`의 `RatioDetail` interface에 해당 필드 정의 누락 → TypeScript는 통과하나 런타임에 undefined. interface에 `benchmarkLabel?: string` 추가 + 두 sheet builder에서 `r.benchmarkLabel || r.benchmark` fallback 패턴. **lesson: TypeScript optional 필드는 interface에 빠지면 런타임에 undefined로 silent passthrough — 테스트 데이터에서 단위 표시까지 visual diff 필수.**
- **Excel 1.대시보드 시트 = 차트 대시보드 미러링**: ExcelJS는 native 차트 미지원(이미지 embed만 가능) → 대시보드 12 섹션을 Excel 셀 + dataBar 조건부 서식으로 재구성. 손익 추이 + 현금흐름 셀에 `type: "dataBar"` rule로 셀 내부 가로 막대 (음수=빨강, 양수=파랑). 차트 대신 **데이터 정합성 + 인쇄 가능성**에 최적화. createDashboardSheet가 createSummarySheet를 대체. **lesson: ExcelJS에서 차트가 필요해 보이는 화면은 대부분 dataBar/colorScale + mergeCells + custom numFmt로 충분. 이미지 embed보다 데이터 cell이 검색·복사·수정 가능.**
- **recharts 3.x Tooltip 타입 intersection 침묵 실패**: `Tooltip` 컴포넌트의 `formatter` prop이 type intersection 변경으로 default rendering을 silent suppress. 사용자 hover 시 연도만 표시되고 값이 안 나옴. 해결: `content={<CustomTooltip/>}` 직접 render 패턴으로 우회 — `MultiSeriesKrwTooltip`, `SingleKrwTooltip`, `PercentTooltip` 3 종 분리. **lesson: recharts major version up 후 Tooltip silent failure는 빈 화면 + 콘솔 깨끗 → formatter 패턴 회피 + content prop 직접 render가 가장 robust.**

## 2026-04-28
- **financial-analyzer dual-source-of-truth (이자비용·EBITDA)**: `FinancialDataInput`에 `cfItems` 필드 자체가 부재 → financial-analyzer가 CF 이자지급에 접근 불가능 → IS findItem 1-step만 사용 → "금융비용" fallback (외환/파생손실 포함되어 부정확). 결과 같은 워크북 내 셀리드 이자보상배율 두 값 발생: IS시트 셀수식 -41.07 vs 5번시트 -7.44. 해결: `cfItemsOfs/cfItemsCfs` optional 필드 추가 + `findInterestExpenseItem()` 헬퍼 (IS exact → CF 이자지급 → IS partial → IS 금융비용 4-step). 모든 caller(financial/route.ts, orchestrator.ts) 수정. 2026-04-23 dc1b767의 financial-analyzer 측 미적용분 보완 (commit c4401b4).
- **`calcRatios` 매출 키워드 보강**: 셀리드 IS "매출" 한 단어 매칭 — `getExact` 정확매칭 큐에만 추가, 부분매칭에는 미추가 ("매출원가/매출채권" 충돌 회피). 셀리드 매출증가율 -/-/+112.4% 표시 기대 (commit b0a940e).
- **ExcelJS mergeCells dump 시 master 복제 동작**: `ws.mergeCells(row, 1, row+2, totalCols)` 3행 병합 → 시각적으로는 1셀로 보이나 ExcelJS read API가 모든 cell에 master value 복제 → 검색·복사 시 24번 hit. 일관성 위해 1행 × N칸 + `ws.getRow(row).height = 60` + `wrapText: true`로 통일. 다른 행들과 같은 1행 mergeCells 패턴 유지 (commit e843a42).

## 2026-04-23
- **이자비용 우선순위 재정렬**: IS의 정확매칭 "이자비용" → CF "이자지급/이자납부/이자의지급" → IS "금융비용/금융원가" fallback. 효성중공업처럼 IS에 "금융비용"(이자+외환손실+파생손실 통합)만 있는 회사는 통합값으로 잡혀 이자보상배율을 비합리적으로 낮춤 (25년 0.86→11.86배, 14배 차이). `calcRatios` + `excel-generator` 모두 동일 우선순위.
- **EBITDA Excel 셀 시트 참조 순서 버그**: 시트 생성 순서가 BS→IS→CF인데 IS의 EBITDA formula는 `wb.worksheets.find`로 CF 시트 검색 → 못 찾아 cfDeprRow=0. fix: `createFinancialSheet`에 `cfSheetNameHint` 인자 추가 + `generateExcelReport`에서 CF 시트명 사전 계산해 IS 호출에 전달. 행 번호는 wb 검색 대신 `data.cfItemsOfs/cfItemsCfs` 배열에서 직접 산출 (CF 시트 row offset: title=1, header=2, items=3+i).
- **D&A 보강 통합/참고 행 동시 push**: 효성중공업처럼 사업보고서 주석에 "감가상각비 및 무형자산상각비"가 단일 통합 합계(56,122)로 공시되는 케이스 + "유형자산감가상각비"·"무형자산상각비" 분리 합계가 별도로 더 작게 공시되는 케이스 공존. 통합값이 분리합보다 큼(사용권자산상각비 등 추가 포함) → **통합이 EBITDA 진실값**. `parseDAFromAnnualXml`이 둘 다 수집해 `combined`/`refDepreciation`/`refAmortization` 필드로 반환, `mergeDAIntoCfRows`가 "감가상각비 및 무형자산상각비(주석)" + "유형자산감가상각비(참고)" + "무형자산상각비(참고)" 3행으로 push. **이중 합산 회피**: `calcRatios`가 `(참고)` 행 필터 + 통합 라벨 우선 매칭, `excel-generator`가 cfCombinedDARow 잡히면 cfAmortRow=0으로 EBITDA formula에서 통합값만 한 번 합산.
- **D&A 보강 트리거 조건**: `hasCfDepreciationRows()`가 false일 때만 발동(CF 원본에 감가/무형/사용권 키워드 행이 없을 때). 대부분 회사(삼성/LG/SK/네이버 등)는 CF 원본에 감가 행 있음 → 보강 skip. 효성중공업처럼 CF에 D&A 통째로 누락된 회사만 보강 path. 일반화 검증 9개사 모두 정상 EBITDA 산출.

## 2026-04-16
- **재무비율 null/미추출 값은 0 표기 필수** — `-`로 표시하면 Excel 수식이나 재무비율 계산 시 오류 발생. D&A 등 미추출 항목은 `-`가 아닌 `0`으로 표기해야 계산 연속성 유지.
- **Excel 셀 수식**: ExcelJS에서 `{ formula: "=B5/B10*100" }` 형태로 설정. 크로스시트 참조는 `'시트명'!B5` 형태. 0으로 나누기 방지: `IF(B10=0,"-",B5/B10*100)`.
- **회계 감수 에이전트**: Excel 생성 전 BS 등식, IS 논리, BS 항목 분류, 필수 계정 누락, 비율 이상치 등 자동 검증. 결과를 API 응답에 포함.

## 2026-04-14
- **Vercel US(iad1)→DART Korea 레이턴시**: 단일 API 호출 5~8초, 순차 6회=30~48초. `Promise.all` 병렬화로 3년분 동시 호출 필수. ZIP 다운로드(fetchBorrowingNotes/fetchAuditOpinion)는 20초+ → 재무조회 hot path에서 제외.
