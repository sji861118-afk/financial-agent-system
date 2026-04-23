@AGENTS.md

## 프로젝트 구조

```
.
├── app/                    # 재무분석 웹앱 (Next.js 16 + React 19)
│   ├── src/               # 소스코드
│   │   ├── app/           # Next.js App Router (페이지 + API)
│   │   ├── components/    # UI 컴포넌트 (shadcn/ui)
│   │   ├── lib/           # 핵심 비즈니스 로직
│   │   │   ├── dart-api.ts          # DART 전자공시 API
│   │   │   ├── excel-generator.ts   # Excel 보고서 생성
│   │   │   ├── financial-analyzer.ts # 재무비율 분석
│   │   │   ├── appraisal-parser.ts  # 감정평가서 PDF 파서 v2
│   │   │   ├── appraisal-excel.ts   # 감정평가서 Excel 시트 생성
│   │   │   └── ...
│   │   └── types/         # TypeScript 타입 정의
│   └── public/            # 정적 파일
├── docx-generator/         # 여신신청서 DOCX 생성기
├── docs/                   # 기획/설계 문서
├── .devcontainer/          # GitHub Codespaces 설정
├── _archive/               # 아카이브 (git 미포함)
└── _reference/             # 참고자료 (git 미포함)
```

## 개발 워크플로우
- main 브랜치에서 작업, 커밋 후 push
- DART 파싱 코드 수정 시 반드시 실제 기업 데이터로 테스트 후 배포
- **배포는 반드시 `app/scripts/deploy.sh` 사용** (수동 `cp` 금지)
  - `app/` → `loan-app-next/` 전체 rsync 동기화 → `npx vercel --prod` → Ready 대기 → **HTTP 라우트 헬스체크** → 실패 시 **이전 Ready 배포로 alias 자동 롤백**
  - loan-app-next/는 .gitignore에 포함 → git push로 자동 배포 안 됨
  - Vercel 프로젝트명: `loan-app-next` / 프로덕션 도메인: `ok-cf1.vercel.app`
- **`● Ready`만 확인하고 "배포 완료" 선언 금지** — 반드시 `/login`, `/financial`, `/appraisal` 라우트 HTTP 응답까지 확인 (deploy.sh가 자동 수행)
- **피드백 루프**: ok-cf1.vercel.app/feedback 페이지에서 사용자 피드백 확인 → 수정 → 배포

## Development Rules
- Firestore 초기화 코드 절대 복제 금지 — 반드시 `@/lib/firebase-admin`에서 import하여 사용
- Python 모듈 포팅 시 컨벤션: dataclass→interface, Enum→string union, dict→Record, 함수명은 camelCase 유지
- 3개 이상 파일 생성/수정 후 반드시 `cd app && npx tsc --noEmit`으로 타입 검증 후 진행

## Lessons Learned
- [2026-03-26] 새 패키지 import 시 반드시 `npm install --save` 먼저 — 로컬 node_modules에 있어도 Vercel에서 설치 안됨
- [2026-03-26] 브라우저용 라이브러리(pdfjs-dist 등)를 서버에서 쓸 때 DOMMatrix/Path2D 등 폴리필 필요 여부 사전 확인
- [2026-03-26] 작동하는 코드를 수정할 때 원본 로직 보존, 새 로직은 try/catch fallback으로만 추가
- [2026-03-26] PDF 파서 수정 시 실제 pdf-parse 텍스트 출력을 console.log로 먼저 확인 후 코드 작성
- [2026-03-26] DART 분기보고서 IS는 thstrm_add_amount(누적) 사용 필수, thstrm_amount는 3개월치만
- [2026-03-26] Excel 연도 컬럼은 항상 오름차순(22→25), 분기보고서는 기준월 표시(25.09)
- [2026-03-26] 감사보고서 XML 주석번호("4,5,6,7") 셀이 `/[\d,]{3,}/`에 매칭 → 금액으로 오인식. `/\d{3,}/` + 주석 패턴 선 필터 필요
- [2026-03-26] 감사보고서 간 계정명 표기 차이(주석 공백, 번호접두사) → merge 실패의 주원인. normalizeAcct() 통합 필수
- [2026-03-26] 총차입금 계산 시 차입금 바로 다음 행의 현재가치할인차금(음수)을 감지하여 순액 반영해야 정확
- [2026-03-31] Vercel Hobby 플랜 기본 serverless timeout 10초 → export const maxDuration = 60 으로 확장 필요 (비상장 감사보고서 XML 파싱 등)
- [2026-03-31] Next.js 16에서 middleware.ts → proxy.ts로 컨벤션 변경 (빌드 출력: "ƒ Proxy (Middleware)")
- [2026-03-31] 비상장 외감법인은 fnlttSinglAcntAll/fnlttSinglAcnt API 데이터 없음 → 감사보고서 XML 파싱만 가능 (→ 2026-04-13 사업보고서 XML fallback 추가로 보완)
- [2026-04-13] **비상장(stockCode 빈값) 회사는 Stage 1/2 API 호출 스킵 필수** — 27+ 불필요 호출로 60초 타임아웃 발생. buildFinancialData에 stockCode 파라미터 전달하여 감지
- [2026-04-13] **일부 외감법인(corp_cls=E)은 사업보고서를 제출하지만 fnlttSinglAcntAll API에 데이터 없음** — 대지개발(00415558) 등. 사업보고서 document.xml 파싱으로 재무데이터 추출 가능
- [2026-04-13] Stage 3 감사보고서(F-type)가 최신 연도를 커버 못 할 때 사업보고서(A-type) XML을 fallback으로 파싱하도록 fetchAuditReportData 확장
- [2026-04-13] hasData=false일 때 빈 엑셀 생성/저장 방지 — 파일관리에 빈 파일이 나타나는 문제 해결
- [2026-04-13] 배포 시 loan-app-next는 .gitignore에 포함 → git push로 자동 배포 안 됨. `cd loan-app-next && npx vercel --prod`로 수동 배포 필요
- [2026-03-31] 삼일회계법인 가치산정: 금융회사는 FCFE(자기자본 현금흐름) 방식 사용, FCFF(WACC) 아님
- [2026-04-01] PDF 텍스트에 NULL 문자(\u0000) 포함 → 정규식 매칭 실패. 파싱 전 `.replace(/\u0000/g, " ")` 전처리 필수
- [2026-04-01] 연결 숫자 파싱: "78,022,000,0002,435,194,00059.62" → 큰 숫자(콤마포함)를 먼저 추출 후 잔여 파싱
- [2026-04-01] 감정평가서 호실별 감정가 추출 시 합계 검증(sum vs 합계행)으로 정확도 보장
- [2026-04-01] DART XML 파서 재무 값이 string("474,588") 반환 → obligor 분석에서 typeof number 체크하므로 parseFloat 변환 필수
- [2026-04-01] DART fetchBorrowingNotes 차입금 단위는 천원 → loan-engine 백만원 단위이므로 /1000 변환
- [2026-04-01] DOCX 미정 필드는 [TBD] 대신 빈칸('') 처리 — 실무 검토 시 [TBD] 텍스트 남으면 부적절
- [2026-04-14] detectAccountDepth() 전 산업 키워드 확장 필수 — 제조/건설/보험/금융/IT 등 80+ depth1 키워드, 30+ depth0 키워드로 K-IFRS/K-GAAP 전체 커버
- [2026-04-14] DOCX 재무제표 depth→indent 매핑 누락 주의 — StatementLineItem 인터페이스의 `indent` 필드에 값을 넣어야 obligor.ts에서 들여쓰기 적용됨 (`depth` 필드는 Excel 전용)
- [2026-04-14] refineDepthBySumDetection(): 키워드 미커버 계정도 합계금액 매칭으로 자동 부모-자식 감지 가능. 단, 승격된 부모의 자식 영역은 skipUntil로 건너뛰어야 연쇄 오승격 방지
- [2026-04-14] loan-app-next에 review API routes 복사 시 의존성(review-store, deal-to-loan-mapper, loan-engine 등) 전체가 필요 — 부분 복사 시 빌드 실패
- [2026-04-14] **Vercel US(iad1)→DART Korea 레이턴시**: 단일 API 호출 5~8초, 순차 6회=30~48초. `Promise.all` 병렬화로 3년분 동시 호출 필수. ZIP 다운로드(fetchBorrowingNotes/fetchAuditOpinion)는 20초+ → 재무조회 hot path에서 제외
- [2026-04-14] **Vercel 함수 크래시 식별**: "An error occurred" 텍스트 응답 = non-JSON → 프론트엔드에서 `res.text()` 후 `JSON.parse()`로 안전 처리. `res.json()` 직접 호출 시 SyntaxError
- [2026-04-14] **Vercel Hobby 제약**: 60초 serverless timeout, 4.5MB response size limit, iad1 리전 고정. Excel base64가 3MB 이상이면 응답에서 제외 필요
- [2026-04-14] **Firestore fire-and-forget**: 크리티컬하지 않은 저장은 `Promise.resolve().then(async () => { ... })` 패턴으로 응답 블로킹 없이 처리
- [2026-04-14] **여신승인신청서 추정비례율** = (총수입 - 총사업비) / 종전자산평가액 × 100%. 재개발사업 LTV = 사업비대출합계 / 분양수입금
- [2026-04-14] 비상장사(롯데건설 등) DART 조회: 연결 재무제표 없음(개별만 가능). 연결 데이터는 IM(투자설명서) 등 별도 소스 필요
- [2026-04-16] **buildFinancialData OFS/CFS 완전 병렬화 필수** — 기존 for 루프(OFS→CFS 순차)는 Vercel US→DART Korea 레이턴시로 CFS 타임아웃 빈발. `Promise.all`로 6개(OFS 3년+CFS 3년) 동시 호출해야 안정적
- [2026-04-16] **DART 계정명 연도간 변경 흡수**: `영업이익(손실)`↔`영업이익`, `당기순이익(손실)`↔`연결당기순이익` 등. `normalizeForMatch()` 함수로 `(손실)` 접미사 제거 + `연결` 접두사 제거하여 매칭. yearData 저장 시 정규화 키도 함께 저장, 조회 시 fallback
- [2026-04-16] **fetchFinancialItems 타임아웃 12초→20초**: Vercel US↔DART Korea 간 레이턴시 고려. 12초 타임아웃은 CFS 호출 실패의 원인
- [2026-04-16] **최신 보고서 기준 원칙**: 기업은 정정공시를 통해 최신 보고서(2025년)에 과거연도(2023년) 수치를 수정 반영함. 따라서 2023년 데이터는 2023년 자체 보고서의 thstrm이 아니라, 2025년 보고서의 bfefrmtrm을 사용해야 정확. `buildStatements`에서 가장 최근 보고서(reverse sort 먼저 처리)의 데이터가 우선되도록 변경 — `yearData[dataYear]`가 이미 채워져 있으면 이전 보고서로 덮어쓰지 않음
- [2026-04-16] **비상장 외감법인(corp_cls=E)도 fnlttSinglAcntAll 데이터 있을 수 있음** — 교보생명보험 등. 비상장이라고 무조건 Stage 1/2 스킵하면 안 됨. 항상 시도 후 실패 시 Stage 3 fallback
- [2026-04-16] **재무비율 null/미추출 값은 0 표기 필수** — `-`로 표시하면 Excel 수식이나 재무비율 계산 시 오류 발생. D&A 등 미추출 항목은 `-`가 아닌 `0`으로 표기해야 계산 연속성 유지
- [2026-04-16] **BS 정렬**: DART API ord 필드가 부정확한 기업이 많음. `classifyBsSectionByName()` + `reorderBsAccounts()`로 자산→부채→자본 섹션 재정렬 필수
- [2026-04-16] **감사보고서 XML CF 파싱**: parseOneAuditXml에서 BS/IS 이후 `현금흐름표` 키워드 감지 → cf 섹션 진입. `영업활동`, `투자활동`, `재무활동` 항목 추출. `기말의현금` 행 이후 종료
- [2026-04-16] **감사보고서 주석 추출**: 감사보고서(F-type) 없으면 사업보고서(A-type) fallback. ZIP 내 여러 XML 파일 중 주석이 가장 많은 파일 선택. `별첨 주석` 또는 `재무제표에 대한 주석` 이후만 파싱
- [2026-04-16] **감사보고서 연도 범위 확장 방지**: Stage 3 XML 파싱은 당기+전기 2개년 추출하므로 3년 요청 시 5년으로 확장됨. `filterYearsToRange()`로 요청 범위(minReq~maxReq)로 필터링 필수
- [2026-04-16] **Excel 셀 수식**: ExcelJS에서 `{ formula: "=B5/B10*100" }` 형태로 설정. 크로스시트 참조는 `'시트명'!B5` 형태. 0으로 나누기 방지: `IF(B10=0,"-",B5/B10*100)`
- [2026-04-16] **회계 감수 에이전트**: Excel 생성 전 BS 등식, IS 논리, BS 항목 분류, 필수 계정 누락, 비율 이상치 등 자동 검증. 결과를 API 응답에 포함
- [2026-04-16] **BS 분류 일반 규칙**: 키워드 목록 매칭 실패 시 계정명에 "부채" 포함되면 부채로 분류. "당기손익-공정가치측정금융부채" 같은 비표준 계정명 누락 방지. 감수 에이전트에서도 자산 영역에 부채 계정 배치 시 ERROR 감지
- [2026-04-20] **Vercel `● Ready` ≠ 실제 서비스 정상**: 3d 전 배포(dqgdzmgs8/69vje088h)가 Ready 상태로 표시됐으나 모든 보호 라우트(/financial, /appraisal, /review, /admin, /feedback)가 404 반환. /login만 200, 루트는 307 정상. 원인 추정: 감정평가서 작업 중 app/→loan-app-next 부분 수동 복사로 파일 세트 불일치 → 빌드 산출물에서 페이지 라우트 일부 누락. 복구는 이전 Ready 배포(gx1g2n3u4, 4d 전)로 alias 복원. **재발 방지**: (1) `app/scripts/deploy.sh`로만 배포 (rsync --delete로 완전 동기화), (2) 배포 후 라우트 HTTP 헬스체크 필수 — `/login(200)`, `/financial(307)`, `/appraisal(307)`, `/(307)`, (3) 헬스체크 실패 시 이전 Ready URL(`loan-app-next/.last-ready-deploy.txt` 저장)로 alias 자동 롤백
- [2026-04-21] **Firestore 테스트 모드 만료 → Admin-SDK-only 락다운**: 2026-04-22 만료 대응으로 `allow read, write: if false` 전면 차단 규칙 게시. 이 프로젝트는 **클라이언트 Firebase SDK 미사용**(모든 접근이 서버 `firebase-admin.ts` 경유) → Admin SDK가 서비스 계정 IAM으로 Firestore Rules 우회하므로 서비스 영향 0. 확인: `/api/dart/health` allOk:true. Firestore 규칙은 `firestore.rules` 파일로 git 추적됨 — Firebase Console 직접 편집 금지, `app/scripts/firebase-rules.sh` 경유 배포
- [2026-04-21] **Git Bash(Windows)에 rsync 없음**: MSYS2 기본 패키지가 아님. deploy.sh에 `command -v rsync` 체크 + PowerShell `robocopy /MIR` fallback 추가 (+ `cygpath -w` Unix→Windows 경로 변환). **robocopy exit 1~7은 성공** (파일 복사됨), `>= 8`만 실패. 이거 모르면 정상 복사인데 파이프라인이 실패로 인식
- [2026-04-21] **Vercel CLI stdout/stderr 분리 파싱**: `vercel ls --prod`는 stdout=URL 목록만, stderr=Ready 상태 테이블. 이전 파서 `head -5 | grep '● Ready'` → stdout의 URL만 보고 상태 못 찾아 Ready를 Unknown으로 오탐 → 실제 성공한 배포를 롤백 시도. fix: `2>&1` 병합 + `grep -oE '● [A-Za-z]+' | head -1`
- [2026-04-21] **서비스 계정 키 감사 명령**: `git log --all --full-history -- "*firebase*"` (파일 단위) + `git log --all --full-history -p | grep "BEGIN PRIVATE KEY"` (본문 단위) 이중 체크. `.gitignore` 패턴은 `*firebase-adminsdk*.json` + `*-firebase-*.json` 이중(Console 기본명 + 변형 모두 커버). `.claude/settings.json`의 PreToolUse hook이 credential 패턴 포함 staged 파일을 commit 차단
- [2026-04-21] **Dead code 삭제 heuristic**: ES 모듈은 `grep -rEl "from ['\"].*<module>['\"]"` 0건이면 안전 삭제. 단 (a) 동적 import 없음, (b) 문자열 기반 resolution 없음, (c) re-export 체인 없음 전제. `app/src/lib/firebase.ts` 제거 사례 — 1개월간 import 0건으로 남아있던 dead code
- [2026-04-23] **Vercel default region(iad1)↔DART korea 60초 timeout**: buildFinancialData 한 번 호출에 30초+, 사업보고서 ZIP 보강 추가 시 FUNCTION_INVOCATION_TIMEOUT. `app/vercel.json`에 `{"regions":["icn1"]}` 설정 → 1.2초로 단축 (50배+). **deploy.sh가 src/만 sync하고 vercel.json은 누락하던 버그 동시 수정** — rsync/robocopy 두 분기 모두에 `cp vercel.json` 추가
- [2026-04-23] **이자비용 우선순위 재정렬**: IS의 정확매칭 "이자비용" → CF "이자지급/이자납부/이자의지급" → IS "금융비용/금융원가" fallback. 효성중공업처럼 IS에 "금융비용"(이자+외환손실+파생손실 통합)만 있는 회사는 통합값으로 잡혀 이자보상배율을 비합리적으로 낮춤 (25년 0.86→11.86배, 14배 차이). calcRatios + excel-generator 모두 동일 우선순위
- [2026-04-23] **EBITDA Excel 셀 시트 참조 순서 버그**: 시트 생성 순서가 BS→IS→CF인데 IS의 EBITDA formula는 `wb.worksheets.find`로 CF 시트 검색 → 못 찾아 cfDeprRow=0. fix: createFinancialSheet에 `cfSheetNameHint` 인자 추가 + generateExcelReport에서 CF 시트명 사전 계산해 IS 호출에 전달. 행 번호는 wb 검색 대신 `data.cfItemsOfs/cfItemsCfs` 배열에서 직접 산출 (CF 시트 row offset: title=1, header=2, items=3+i)
- [2026-04-23] **D&A 보강 통합/참고 행 동시 push**: 효성중공업처럼 사업보고서 주석에 "감가상각비 및 무형자산상각비"가 단일 통합 합계(56,122)로 공시되는 케이스 + "유형자산감가상각비"·"무형자산상각비" 분리 합계가 별도로 더 작게 공시되는 케이스 공존. 통합값이 분리합보다 큼(사용권자산상각비 등 추가 포함) → **통합이 EBITDA 진실값**. parseDAFromAnnualXml이 둘 다 수집해 `combined`/`refDepreciation`/`refAmortization` 필드로 반환, mergeDAIntoCfRows가 "감가상각비 및 무형자산상각비(주석)" + "유형자산감가상각비(참고)" + "무형자산상각비(참고)" 3행으로 push. **이중 합산 회피**: calcRatios가 `(참고)` 행 필터 + 통합 라벨 우선 매칭, excel-generator가 cfCombinedDARow 잡히면 cfAmortRow=0으로 EBITDA formula에서 통합값만 한 번 합산
- [2026-04-23] **D&A 보강 트리거 조건**: `hasCfDepreciationRows()`가 false일 때만 발동(CF 원본에 감가/무형/사용권 키워드 행이 없을 때). 대부분 회사(삼성/LG/SK/네이버 등)는 CF 원본에 감가 행 있음 → 보강 skip. 효성중공업처럼 CF에 D&A 통째로 누락된 회사만 보강 path. 일반화 검증 9개사 (삼성·LG화학·SK하이닉스·카카오·셀트리온·NAVER·현대건설·대우건설·효성중공업) 모두 정상 EBITDA 산출

## Current Progress
### 완료 (2026-03-26)
- 업로드 전용 Excel 생성 (DART 없이 PDF/Excel만으로)
- 여러 파일 동시 업로드 + BS/IS 병합
- PDF 파싱: pdfjs-dist 좌표 기반 → pdf-parse fallback 구조
- BS/IS 연도 정렬 오름차순(22→25)
- IS 섹션 종료 (당기순이익/손실 이후 자동 종료)
- merge API에서 직접 재무비율 계산 (부채비율, 유동비율, ROA, ROE 등)
- 총차입금/순차입금 계산 (주임종단기차입금 등 확장 매칭)
- DART 분기보고서 누적금액(thstrm_add_amount) 사용
- 분기보고서 기준월 표시 (25.09) + 경고 토스트
- **감사보고서 XML 파싱 정확도 대폭 개선** (2026-03-26~27):
  - 주석번호 컬럼("4,5,6,7") 오인식 → 연도 데이터 밀림 수정
  - normalizeAcct() 통합으로 연도간 계정명 일관성 확보
  - mergeAuditResults 중복계정(대손충당금 등) 순서 보존 매칭
  - 총차입금에 현재가치할인차금 순액 반영

### 완료 (2026-03-31)
- loan-engine equity-pledge 플러그인 완성 (삼일 FCFE DCF, valuation summary, sensitivity, peer group, WACC 산출)
- conditions-security 섹션 업데이트 (인출선행조건, 인출후행조건, 기한이익상실사유 렌더링)
- techmate-full.json 실데이터 투입 (DART 개별+연결 BS/IS, IM 사업조건, 자금용도, SPC 구조)
- 테크메이트홀딩스 재무제표(full detail) 추가
- 소버린제이엘홀딩스 제거 (본건 무관)
- Vercel maxDuration=60 timeout fix 배포 (commit 237e9e6)
- **최종 DOCX 출력: 36KB, 2,098 paragraphs, 43 tables, 14 page breaks**
- **여신검토 워크플로우 Phase 1~3 통합**:
  - types/review.ts (ReviewDeal, ReviewOpinion, ReviewViewpoint, ReviewApproval)
  - lib/review-store.ts (Firestore CRUD + 로컬 JSON 폴백 + 상태 자동전환)
  - lib/product-classifier.ts (5.검토여신 product_types.py → TS 포팅, 자동분류+태그)
  - API 7개: deals(CRUD), classify, opinions(CRUD)
  - UI 4페이지: /review(목록), /review/new(접수), /review/[id](상세), /review/[id]/opinion(의견작성)
  - 컴포넌트 4개: deal-form(DART연동), deal-card, deal-status-badge, financial-snapshot-table
  - Firestore 4컬렉션 설계: review_deals, review_opinions, review_viewpoints, review_approvals

### 완료 (2026-04-01)
- **감정평가서 파서 v2 완성** (appraisal-parser.ts 1,271줄 재작성):
  - 8개 추출 블록: 기본정보, 평가방법별금액, 감정평가서요건, 대상물건개요, 층별요약, 호실별감정가(170호), 비준사례(4건물), 경매통계
  - types/appraisal.ts에 7개 새 인터페이스 추가
  - 통합 테스트 20/20 통과 (test-appraisal-v2.mjs)
  - NULL 문자 처리 + 연결 숫자 파싱 edge case 수정
- **Excel 시트 2개 추가** (appraisal-excel.ts):
  - 시산가액검토: 비교방식/수익방식/원가방식 시산가 비교표
  - 경매통계(감평): 물건유형별 낙찰가율 통계

- **에이엠플러스자산개발 여신신청서 DOCX 생성 파이프라인**:
  - upload-and-generate API를 DART API 연동으로 재작성 (PDF 파싱 → DART 직접 조회)
  - unsold-collateral 프로필 신규 생성 (미분양담보대출 전용)
  - DART 데이터 string→number 변환 → obligor 분석 코멘트(BS/IS) 자동 생성 성공
  - 차입금 주석(fetchBorrowingNotes) 천원→백만원 변환 + 주요 차입처 top10 표시
  - 섹션 넘버링 수정: 1→2→3→4→5→6→7 순차 (opinion 3→7)
  - 미정 필드 빈칸 처리, DART companyInfo로 법인정보 자동 채움
  - 테스트 결과: 22.4KB DOCX, BS/IS 분석 코멘트 + 차입금 현황 포함

### 완료 (2026-04-13)
- **비상장 회사 재무조회 타임아웃 해결** (피드백: 대지개발):
  - buildFinancialData에 stockCode 파라미터 추가 → 비상장 감지 시 Stage 1/2 스킵
  - fetchAuditReportData에 사업보고서(A-type) XML 파싱 fallback 추가
  - hasData=false일 때 빈 엑셀 생성 방지 + UI warning toast 추가
  - 커밋: b25366f, 5942cb4 → Vercel Production 배포 완료
- **jangpm-meta-skills 유저 스코프 설치** (~/.claude/skills/):
  - autoresearch, blueprint, deep-dive, reflect 4개 스킬
- **재무제표 계층구조(들여쓰기) 전 업종 지원** (dart-api.ts, upload-and-generate, generate-docx):
  - detectAccountDepth() 재작성: 30+ depth0 키워드, 80+ depth1 키워드 (제조/건설/보험/금융/IT 전 업종 K-IFRS/K-GAAP)
  - refineDepthBySumDetection() 신규: 합계금액 매칭으로 자동 부모-자식 감지 (키워드 미커버 계정 보정)
  - DOCX 파이프라인 depth→indent 매핑 추가 (upload-and-generate, generate-docx 두 route)
  - 단위테스트 116/116 통과, E2E 4개 실기업 검증 (삼성전자, LG화학, 카카오, SK하이닉스)
  - 커밋: 6754fa5, 6b1019d → Vercel 프로덕션 배포 완료

### 완료 (2026-04-14~15)
- **광명9R구역 여신승인신청서 초안 작성**:
  - 샘플 2건(개포주공5단지 24p, 한남2구역 30p) 분석하여 양식 구조 파악
  - 소스 ~20건(IM, 사업성평가보고서, 약정서, 공정확인서, 분양현황, 재무제표, 설계개요 등) 데이터 추출
  - DART API로 롯데건설(주) 개별 BS/IS 조회 반영
  - 마크다운 55KB + DOCX 28KB(11페이지) 생성 — generate-docx.mjs 스크립트
  - 출력: `docx-generator/02_초안출력/광명9R구역 추가사업비대출/여신승인신청서_광명9R구역_초안.{md,docx}`
- **DART 재무조회 타임아웃 수정** (피드백: 대우건설):
  - buildFinancialData 연도별 API 호출 `Promise.all` 병렬화 (순차 30~48초 → 병렬 ~8~16초)
  - fetchBorrowingNotes/fetchAuditOpinion ZIP 다운로드를 재무조회 hot path에서 제거 (각 20초+)
  - Firestore 저장 fire-and-forget, QA 검수 스킵, Excel base64 3MB 가드
  - 프론트엔드 non-JSON 응답 안전 처리 (`res.text()` + `JSON.parse()`)
  - `/api/dart/health` 진단 엔드포인트 추가 (PUBLIC_PATHS)
  - 수정파일: dart-api.ts, financial/route.ts, financial/page.tsx, proxy.ts
  - 다수 Vercel 배포 실행 — 아직 최종 확인 필요

### 완료 (2026-04-16) — 재무제표 자동 추출 대규모 개선
- **비상장 외감법인 Stage 1/2 스킵 로직 수정** (교보생명 등):
  - 비상장이라도 fnlttSinglAcntAll API에 데이터 있는 외감법인(corp_cls=E) 존재 → 무조건 스킵 제거, 항상 시도 후 실패 시만 Stage 3 fallback
  - 커밋: 63c5133
- **BS 재무상태표 정렬 수정**:
  - DART API ord 필드 부정확 기업(교보생명 등)에서 자산총계가 중간에 나오는 문제
  - `classifyBsSectionByName()` + `reorderBsAccounts()` 추가 → 자산→자산총계→부채→부채총계→자본→자본총계→자본과부채총계 순서 보장
  - 보험업/금융업 부채 계정(보험계약부채, 투자계약부채 등) 정확 분류
  - 커밋: 0e9c574
- **증감사유 자동 분석 신규 기능** (감사보고서 주석 매칭):
  - `extractNoteSections()`: 감사보고서 HTML에서 번호별 주석 섹션 파싱
  - `fetchAuditNotes()`: F-type 감사보고서 + A-type 사업보고서 fallback, ZIP 내 모든 파일 탐색
  - `yoy-note-analyzer.ts`: 임계값 초과 감지 + noteRef/키워드 기반 주석 매칭 + 사유 요약 추출
  - UI: 검색 폼에 기준금액(백만원)/기준비율(%) 입력 필드 추가
  - Excel: 재무제표 셀에 간략 참조(`→ 주석12 (차입금) [2024 감사보고서]`) + 별도 "증감사유분석" 시트에 상세 표
  - 증감사유 셀 → 분석 시트 하이퍼링크 연결 (클릭 시 해당 행으로 이동)
  - "다음과 같습니다" 등 무의미 표현 자동 제거 (`cleanNoteText()`)
  - 삼성전자 테스트: 34개 주석 섹션 추출, 18건 증감사유 매칭 성공
  - 커밋: 7683261, 1866e39, b011a9e
- **감사보고서 연도 범위 필터링**:
  - 감사보고서 Stage 3에서 당기/전기 확장으로 요청 범위 초과 문제 수정 (2023~2025 요청 → 2021~2025 → 이제 요청 범위만 표시)
  - `filterYearsToRange()` / `filterRowsToRange()` 추가
- **현금흐름표(CF) 감사보고서 파싱 추가**:
  - `parseOneAuditXml`에 CF 섹션 감지 (영업활동/투자활동/재무활동)
  - 감가상각비, 이자지급 등 EBITDA 산출 핵심 항목 추출
  - Excel 현금흐름표 탭 자동 생성 (개별/연결)
  - 케이티에스테이트 테스트: 개별 34항목, 연결 49항목 정상 추출
- **재무비율 전체 셀 수식 적용** (excel-generator.ts):
  - BS: 총차입금(SUM), 순차입금, 부채비율, 유동비율, 자기자본비율, 차입금의존도
  - IS: 영업이익률, ROA(BS시트 크로스참조), ROE(BS시트 크로스참조), EBITDA(CF시트 크로스참조), EBITDA/이자비용, 이자보상배율, 매출증가율
  - 셀 클릭 시 수식 바에 참조 행이 표시되어 검증 가능
- **회계 감수 에이전트** (`financial-auditor.ts` 신규):
  - BS 등식 검증 (자산총계 = 부채총계 + 자본총계)
  - IS 논리 검증 (영업이익률 이상치 감지)
  - CF 정합성, 필수 계정 누락, 비율 이상치, 연도간 급변 감지
  - 검증 결과 API 응답에 포함 + 서버 로그
- **불필요 Excel 탭 제거**: 담보물조사, 낙찰률통계, 담보물사진, 비준사례 4개 placeholder 시트 삭제
- **기존 피드백 반영 확인**:
  - EBITDA CF 기반 계산: 어제 커밋(0ff15d3)에서 수정 완료 — CF 우선, IS/BS fallback
  - 금융비용 음수 Math.abs(): 어제 커밋에서 수정 완료
  - 전년대비 증감액+증감률 두 컬럼: 어제 커밋에서 수정 완료
- **교보생명보험 연결재무제표 추출 불가 해결**:
  - **OFS/CFS 완전 병렬화**: `Promise.all` 6개 동시 호출로 CFS 타임아웃 해소
  - **계정명 매칭 정규화** (`normalizeForMatch()`): 연도별 DART 계정명 변경 흡수
  - fetchFinancialItems 타임아웃 12초→20초 확장
- **최신 보고서 기준 수치 반영** (정정공시 원칙):
  - `buildStatements`에서 최신 보고서 우선 원칙 적용
- **BS 분류 일반 규칙 추가** (047bfaa):
  - `classifyBsSectionByName`: 계정명에 "부채" 포함 시 무조건 부채 분류 (당기손익-공정가치측정금융부채 등 비표준 계정 누락 방지)
  - "미지급", "선수금", "예수금", "매입채무" 패턴도 부채 자동 분류
  - 감수 에이전트에 BS 항목 분류 검증 추가 — 자산 영역에 부채 계정 배치 시 ERROR 감지
- 커밋: ce96a53, 63c5133, 0e9c574, 7683261, 1866e39, b011a9e, 2b86e4e, 3363a60, 047bfaa
- Vercel 프로덕션 배포 9회 모두 `● Ready` 확인

### 완료 (2026-04-23) — EBITDA D&A 보강 종합 + Vercel ICN1 region
- **이자비용 우선순위 재정렬** (commit dc1b767): IS 정확매칭 "이자비용" → CF "이자지급/이자납부" → IS "금융비용". 효성중공업 25년 이자보상배율 0.86→11.86배 (개별), —→14.0배 (연결)
- **Excel 시트 참조 시점 버그 수정** (commit 1f65366): IS 빌드 시 CF 시트 미생성 → cfDeprRow=0 fail. createFinancialSheet에 `cfSheetNameHint` 인자 추가 + generateExcelReport에서 CF 시트명 사전 계산 → IS formula가 미래 CF 시트명 참조 (Excel sheet name 기반 lazy resolution). 행 번호는 `data.cfItemsOfs/cfItemsCfs` 배열에서 직접 산출
- **Vercel region 이전** (commit dd24d2d/65d901e): default iad1 → icn1(Seoul). buildFinancialData 60s→1.2s (50배+). `app/vercel.json` 신규 + deploy.sh가 src/만 sync하던 버그 동시 수정 (rsync/robocopy 두 분기 모두에 vercel.json cp 추가)
- **D&A 통합/참고 행 동시 push** (commit 9f474be): 효성중공업 사업보고서 주석에 "감가상각비 및 무형자산상각비"(통합 56,122) + "유형자산감가상각비"(10,327) + "무형자산상각비"(3,767) 모두 공시. parseDAFromAnnualXml이 DAResultPerFs에 `combined`/`refDepreciation`/`refAmortization` 필드 추가. mergeDAIntoCfRows가 "감가상각비 및 무형자산상각비(주석)" + "(참고)" 행 3개 push. calcRatios+excel-generator가 통합 우선 + 참고 skip으로 이중 합산 방지
- **/api/dart/diag-da 임시 진단 endpoint** (commit e1b5838): production buildFinancialData/list.json/document.xml/JSZip path 진단용. 원인 추적 후 정리 예정
- **다중 회사 일반화 검증**: 삼성전자(EBITDA 61.6조)·카카오(40.3조)·셀트리온(15.5조)·현대건설(0.39조)·효성중공업(0.5조 with 보강) 모두 정상. CF 원본에 D&A 있는 회사는 보강 skip, 효성중공업처럼 누락된 회사만 사업보고서 보강 path 발동
- 효성중공업 검증 (개별 25년): EBITDA 442,378→**498,500** (영업이익+통합 56,122), 이자보상배율 **11.9배**

### 미확인/잠재 이슈
- PDF 업로드 IS 파싱이 Vercel에서 실제 작동하는지 최종 확인 필요 (pdf-parse fallback 줄 재구성)
- 파일 제거 시 파싱 결과 유지 로직 (남은 파일의 데이터가 정확한지)
- 분기보고서 전기 데이터(frmtrm_add_amount)의 누적금액 정확성
- **감사보고서 파싱 수정 후 실데이터 검증 미완** (테스트 대상 기업 재조회 필요)
- 일부 감사보고서 ZIP에 재무상태표 본문 없음 (특정 연도 연결 등)
- 계정명이 완전히 다른 경우(공사미수금↔미수금) 자동 merge 불가
- **여신검토 Phase 4~5 미구현**: 유사 사례 검색(viewpoint-search.ts), DOCX 내보내기, 승인 워크플로우, 신청서 연동
- **여신검토 E2E 테스트 미수행**: 실데이터로 접수→의견→상태전환 전체 흐름 검증 필요
- review-store.ts Firestore init 중복 (firebase-admin.ts와 별도 초기화 → 공유 함수 추출 리팩토링 필요)
- upload-and-generate DART 연동이 Vercel maxDuration(60초) 내에 완료되는지 실배포 확인 필요
- **DOCX 총차입금 계산 오류**: BS분석에서 차입금 76,456만 표시 (유동성장기차입금 273,135 + 사채 미포함)
- **DOCX opinion 텍스트 HTML 엔티티**: &amp;quot; &amp;apos; 등 PDF 텍스트의 특수문자 이스케이프 처리 필요

## Next Session Context
1. **[High] /api/dart/diag-da 임시 endpoint 제거**: 원인 추적용으로 추가, production에 노출 중. PUBLIC_PATHS에서도 제거
2. **[Medium] D&A 일반화 강화 검토**: 현재 `hasCfDepreciationRows()` false일 때만 사업보고서 보강. CF에 감가는 있지만 무형/사용권 별도 행이 없는 회사들도 가시성 향상 위해 사업보고서 분리 참고 행 push 옵션 검토 (성능 trade-off)
3. **[Medium] 대우건설 EBITDA 음수 케이스 검증**: CF 감가 970(매우 작음) + 영업이익 음수 → EBITDA -921,063. 사업보고서 보강 강제 trigger 임계값(예: CF 감가가 영업이익의 1% 미만) 도입 검토
4. **[High] 표 서식 최종 정리**: BS/IS/CF 시트에서 빈 셀 테두리 누락, 비율행 아래 이탈 항목(R51-56 등) 정리 필요
2. **[High] 회계 감수 에이전트 UI 표시**: 현재 API 응답에만 포함 → 프론트엔드에 검증 결과 표시 (경고 배지, 상세 팝업)
3. **[High] 증감사유 주석 매칭 품질 개선**: 키워드 매칭 정확도 향상, 관련 없는 주석 필터링, 주석 본문 중 증감 관련 테이블 데이터 추출
4. **[Medium] fetchBorrowingNotes/fetchAuditOpinion 복원**: 현재 스킵 → 타임아웃 안전하게 재통합 (총차입금 셀수식 SUM에 빠진 항목 보완)
5. **[Medium] DOCX 버그 수정**: 총차입금 계산(유동성장기차입금+사채 포함), HTML 엔티티 제거
6. **[Medium] 광명9R 여신승인신청서 완성**: 금리/수수료/대주단 확정 시 공란 채우기
7. **[Medium] 피드백 확인 루프**: ok-cf1.vercel.app/feedback 에서 신규 피드백 확인 → 수정 → 배포
8. **여신검토 Phase 4~5**: viewpoint 검색, 승인 워크플로우, 신청서 연동

## 배포 방법 (중요)
```bash
# 1. 메인 레포 커밋 + push (소스 히스토리 보존)
cd /c/Users/OK/Documents/AI개발/1.신청서\ 관련
git add <변경파일> && git commit && git push

# 2. 자동 배포 — deploy.sh가 다음을 순차 수행:
#    (a) 현재 Ready 배포 URL 백업 (loan-app-next/.last-ready-deploy.txt)
#    (b) app/src → loan-app-next/src 전체 rsync 동기화 (--delete)
#    (c) npx vercel --prod
#    (d) Ready 대기 (최대 120초)
#    (e) 라우트 HTTP 헬스체크 — /login(200), /financial(307), /appraisal(307), /(307)
#    (f) 실패 시 이전 Ready 배포로 alias 자동 롤백
cd app && ./scripts/deploy.sh
```

**금지 사항**:
- 수동 `cp`로 부분 복사 (파일 세트 불일치 → 라우트 누락 가능)
- `● Ready`만 확인하고 배포 완료 선언 (Ready여도 라우트 404 가능)

**수동 개입이 필요한 경우**:
- deploy.sh 헬스체크 실패 → 자동 롤백됨. `npx vercel ls`에서 에러 배포 URL 확보 후 `npx vercel inspect <url> --logs`로 빌드 로그 확인
- 롤백 대상이 없을 때 (`.last-ready-deploy.txt` 없음) → `npx vercel ls`에서 직전 Ready URL 수동 확인 후 `npx vercel alias set <url> ok-cf1.vercel.app`
