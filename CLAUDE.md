@AGENTS.md

## 프로젝트 구조 (Dual-Track)

```
.
├── app/                     # Track A: 재무·감정평가 웹앱 (Next.js 16, Vercel)
│   └── src/lib/             #  ── 핵심 비즈니스 로직 (frozen — 기존 파일 수정 금지)
│
├── docx-generator/          # Track B: 신청서 작성 (Claude Code, 로컬 CLI, gitignored)
│   ├── 01_입력데이터/        #  ── deal JSON + 재무 xlsx
│   ├── 02_초안출력/          #  ── {차주명}_초안.docx
│   └── README.md            #  ── Track A 결합 문서화
│
├── docs/
│   ├── superpowers/         #  ── 진행 중 / 미정 plan + spec (STATUS 마커)
│   ├── archive/             #  ── 완료된 plan + spec (INDEX.md 참조)
│   ├── _obsolete/           #  ── stale 문서 (gitignored)
│   └── SKILLS-AUDIT.md      #  ── 글로벌 스킬 사용 분석
│
├── CHANGELOG-DART.md        # Track A — DART 파싱 lessons
├── CHANGELOG-EBITDA.md      # Track A — EBITDA / 재무비율 / Excel 셀 lessons
├── CHANGELOG-APPRAISAL.md   # Track A — 감정평가서 lessons
├── CHANGELOG-DEPLOY.md      # 인프라 — Vercel / deploy.sh lessons
│
├── loan-app-next/           # Vercel 배포 미러 (gitignored, deploy.sh가 동기화)
├── _archive/                # 폐기 코드 (gitignored)
└── _reference/              # 참고자료 (gitignored)
```

**아키텍처 SVG**(`[아키텍처]신청서 작성 자동화_dual_track_architecture_v3.svg`)와 일치: Track A는 도구 개발(Vercel 자동배포), Track B는 신청서 작성(Claude Code 로컬 실행). 두 트랙의 라이프사이클이 다르므로 디렉토리도 분리.

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

## Lessons Learned (분류별 CHANGELOG)

도메인별로 분리되어 있습니다. 작업 시 해당 영역만 참조하세요.

- **[CHANGELOG-DART.md](./CHANGELOG-DART.md)** — DART API, 감사보고서 XML, K-IFRS/K-GAAP, BS/IS/CF 추출, ZIP 본문 파일 선택, 계정명 정규화
- **[CHANGELOG-EBITDA.md](./CHANGELOG-EBITDA.md)** — EBITDA D&A 보강, 이자비용 dual-source, Excel 셀 수식, 회계 감수 에이전트, financial-analyzer
- **[CHANGELOG-APPRAISAL.md](./CHANGELOG-APPRAISAL.md)** — 감정평가서 PDF 파싱, FCFE/FCFF, 추정비례율/LTV 계산식
- **[CHANGELOG-DEPLOY.md](./CHANGELOG-DEPLOY.md)** — Vercel 배포, deploy.sh, Next.js 16, Firestore 규칙, Git Bash/rsync, 서비스 계정 키 보안

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

### 완료 (2026-05-18) — BS 동명이항목 분리 + 총차입금 SUM 수식 fix (사용자 피드백 2건)
- **[007622c] CJ대한통운 연결 BS 유동/비유동 항목 섞임 fix** — DART CFS BS에서 "계약부채/리스부채/차입금"이 유동(ord=43, ifrs-full_CurrentContractLiabilities)과 비유동(ord=55, ifrs-full_NoncurrentContractLiabilities) 양쪽에 같은 `account_nm`·다른 `account_id`로 등장. `buildStatements`의 `seen.has(nm)` + `vals[nm]=amt`가 silent data loss 유발 (유동 위치에 비유동 금액이 들어가고 비유동 행 누락). 해결: `accountOrder` 항목에 `key = id || nm` 필드 + `yearData[year]` id-keyed primary + nm fallback. `disambiguateBsDuplicates()` 신규 — 같은 nm이 2번 이상 등장 시 직전 depth=1 헤더 추적해 "(유동)/(비유동)" suffix. `normalizeAcct`가 suffix 자동 strip → calcRatios 매칭 영향 없음. CJ 검증: BS 등식 100% 일치, 8건 disambiguation.
- **[2bd7ae3] excel-generator 총차입금 SUM 수식 누락 fix** — `acctRowMap`이 `replace(/[\s()]/g, "")`로 정규화하여 "리스부채(유동)" → "리스부채유동" 키 저장. `findRow("리스부채")` 매칭 실패 → borrowRows 비어 → SUM formula null → raw 숫자 fallback (수식 바 비어 보임). 사용자 피드백 "재무비율은 항상 서식으로 표현". 해결: `findRow`에 suffix variant lookup, `findAllRows` 신규 (multi-row SUM용), `borrowingKeywords`에 "차입금" 단독 추가. 다른 회사 회귀 없음 (suffix 없는 행은 norm 직접 매칭).
- **남청라 (디디아이남청라로지스틱스REIT) 총차입금 미표시 피드백** — 검증 결과 commit 63c5133(2026-04-16 비상장 외감법인 Stage 1/2 스킵 로직 수정) 이후 **이미 해결**됨. 로컬 buildFinancialData 검증: Stage 3 (감사보고서 ZIP) 작동, 장기차입금 690억·부채비율 152.1% 정상 추출. **추가 코드 변경 불필요**.
- **진단 방법론 진화**: 임시 `/api/dart/diag-*` endpoint 배포→curl→제거 cycle 대신 MCP `find_company` + `get_full_financial_statement`로 대화 내 raw 조회 + tsx로 buildFinancialData 직접 호출 (JWT_SECRET 우회). 1 deploy cycle 절약.
- **재사용 가능 진단 스크립트 3개 추가**: `app/scripts/diag-cj-daehan.mts`, `diag-namchungra-local.mts`, `diag-baseline-local.mts` — JWT 없이 production 코드 path 검증.
- **신규 메모리**: `~/.claude/projects/<ws>/memory/project_bs_classification.md` — `classifyBsSectionByName`/`reorderBsAccounts`/`getBsSortRank` 함수 deprecated 명시 + 현재 BS 분류 chain (detectAccountDepth → refineDepthBySumDetection → disambiguateBsDuplicates) 문서화.

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
- **DOCX 총차입금 계산 오류**: BS분석에서 차입금 76,456만 표시 (유동성장기차입금 273,135 + 사채 미포함) — *(2026-05-18 excel-generator는 borrowingKeywords 보강 + suffix variant lookup으로 해결; DOCX side (obligor.ts 등)는 별도 점검 필요)*
- **DOCX opinion 텍스트 HTML 엔티티**: &amp;quot; &amp;apos; 등 PDF 텍스트의 특수문자 이스케이프 처리 필요

### 완료 (2026-04-28) — DART 추출 정확도 보강 8 commit
- **[1085d85] ZIP 다중 XML 본문 파일 선택**: 사업보고서 ZIP 첫 파일은 첨부 감사보고서(0.5MB), 두 번째가 본문(1.5MB). `Object.keys(zip.files)[0]` → 가장 큰 .xml 선택. parseOneAuditXml + parseDAFromAnnualXml 양쪽 적용. **프로젠 25년 진단: bsItems 36→144, isItems 0→163, cfItems 35→37**
- **[6d1b4e0, 118186c] K-IFRS↔K-GAAP 자동 폐기 (Stage 3 + Stage 1)**: 코넥스→코스닥 전환 회사(프로젠) 같이 회계기준 전환된 보고서가 한 BS 시트에 누적되는 문제. detectAccountingStandard 비율 휴리스틱 + mergeAuditResults 충돌 시 drop + buildStatements 후처리 K-GAAP 라인 필터. accountingStandardChanged 메타플래그 노출
- **[c4401b4] 이자비용 4-step priority dual-source 통일**: FinancialDataInput에 cfItemsOfs/cfItemsCfs 추가 + findInterestExpenseItem 헬퍼 (IS exact → CF 이자지급 → IS partial → IS 금융비용). **셀리드 5번시트 R024 이자보상배율: -7.44 → -41.07 (IS시트 셀수식과 일치)**. findItem 정확매칭 우선
- **[e5b5159] BS 자본 sub-rank + (유동)/(비유동) depth 정규화**: getBsSortRank 신규 (자본 2.0~2.6, 총계 9.1~9.4 강제). detectAccountDepth가 (유동)/(비유동) suffix 정규화 후 매칭. DEPTH1_KEYWORDS 12+ 항목 보강
- **[b0a940e] calcRatios 매출 키워드 보강**: 셀리드 IS "매출" 한 단어 매칭 — getExact 정확매칭 큐에만 추가, 부분매칭에는 미추가 ("매출원가/매출채권" 충돌 회피). **셀리드 매출증가율 -/-/+112.4% 표시 기대**
- **[e843a42] 종합 소견 mergeCells 1행 통일**: 3행 × N칸 → 1행 × N칸 + row height 60 + wrapText. ExcelJS dump 시 24 hit → 1 hit
- **[93b15f5] /api/dart/diag-fetch 임시 진단 endpoint**: fnlttSinglAcntAll OFS/CFS × reprtCode 4종 응답 추적 + buildFinancialData 결과 + annualReports 공시 여부. PUBLIC_PATHS 등록 (원인 확정 후 제거 예정)
- **검증 완료 케이스**: 셀리드 이자보상배율 dual-source 일치 ✓, 종합 소견 mergeCells 1행 통일 ✓, 프로젠 25년 IS 진단 회복 ✓, 매출총이익률/순이익률/회전율 채워짐 ✓
- **검증 보류 케이스**: 프로젠 BS 161 → ~75 (Stage 1 K-GAAP filter 효과는 사용자 재추출 검증), 셀리드 매출증가율 +112.4% 표시
- **확인된 비결함**: 제넥신 24/25년 연결재무제표 누락은 **회사 측 미제출**(사업보고서 본문에 "2. 연결재무제표 - 당사는 보고서 제출일 현재 해당사항이 없습니다." 명시). DART API/본문/별첨 어디에도 데이터 없음

## Next Session Context
1. **[High] 3사 재추출 사용자 시각 검증**: 1085d85 deploy 후 프로젠/셀리드/제넥신 재추출 → BS 행수, 매출증가율, 25년 IS 표시 확인
2. **[High] 9사 회귀 검증**: `app/scripts/regression-check.mjs` (2026-05-08 추가). 사용 시 production JWT_SECRET 환경변수 필요 (default secret과 다름). 먼저 `--baseline`로 baseline.json 생성 후 비교 모드. 효성중공업 D&A 통합/참고 path는 fragile
3. ~~**[완료 2026-05-08]** 임시 진단 endpoint 2개 통합 제거~~ — `/api/dart/diag-da` + `/api/dart/diag-fetch` 삭제 + PUBLIC_PATHS 제거 + 배포 완료 (commit 1938f12)
4. **[Medium] 연결재무제표 미제출 회사 UI 안내**: 빈값 대신 "이 회사는 사업보고서에 연결재무제표 미제출 (개별만 조회 가능)" 표시. accountingStandardChanged 메타플래그도 함께 활용
5. **[Medium] 회계기준 변경 휴리스틱 임계값 튜닝**: 비율 기반 detectAccountingStandard false positive/negative 모니터링. 현재 K-GAAP 2배+절대3, K-IFRS 1+ — 회귀 검증 후 조정
6. **[Medium] ZIP 본문 파일 선택 휴리스틱 일반화**: 현재 "가장 큰 .xml" 룰을 다른 보고서 유형(반기/분기/감사)에도 확대 검토. fetchAuditNotes에도 동일 패턴 적용 가능성
7. **[Medium] D&A 일반화 강화 검토**: 현재 `hasCfDepreciationRows()` false일 때만 사업보고서 보강. CF에 감가는 있지만 무형/사용권 별도 행이 없는 회사들도 가시성 향상 위해 사업보고서 분리 참고 행 push 옵션 검토 (성능 trade-off)
8. **[Medium] 대우건설 EBITDA 음수 케이스 검증**: CF 감가 970(매우 작음) + 영업이익 음수 → EBITDA -921,063. 사업보고서 보강 강제 trigger 임계값(예: CF 감가가 영업이익의 1% 미만) 도입 검토
9. **[High] 표 서식 최종 정리**: BS/IS/CF 시트에서 빈 셀 테두리 누락, 비율행 아래 이탈 항목(R51-56 등) 정리 필요
10. **[High] 회계 감수 에이전트 UI 표시**: 현재 API 응답에만 포함 → 프론트엔드에 검증 결과 표시 (경고 배지, 상세 팝업)
11. **[High] 증감사유 주석 매칭 품질 개선**: 키워드 매칭 정확도 향상, 관련 없는 주석 필터링, 주석 본문 중 증감 관련 테이블 데이터 추출
12. **[Medium] fetchBorrowingNotes/fetchAuditOpinion 복원**: 현재 스킵 → 타임아웃 안전하게 재통합 (총차입금 셀수식 SUM에 빠진 항목 보완 — 2026-05-18 acctRowMap suffix variant lookup으로 (유동)/(비유동) 분리 차입금도 SUM에 잡힘. 주석 자체 복원만 남음)
18. **[High] 사용자 측 UI 일괄 시각 검증** (2026-05-18 fix 후): CJ대한통운 + 남청라 + 프로젠 + 셀리드 + 제넥신 5건. CJ는 Excel 5번시트 총차입금 수식 바에 SUM 표시 확인 + BS 시트 "계약부채(유동)/(비유동)" 별개 행 표시 확인
19. **[Medium] disambiguateBsDuplicates 일반화 검증**: CJ대한통운 외 다른 연결 CFS 보고서에서 false positive 모니터링. 자본 섹션·기타 헤더에서 "(유동)/(비유동)" 잘못 부여되는 케이스 없는지
20. **[Medium] acctRowMap 괄호 normalize 정책 재검토**: 다른 suffix 계정 ("(유동성)", "(단기)", "(장기)" 등)에서도 동일 silent matching 손실 가능. excel-generator 전체 점검
21. **[Medium] 남청라 반기 audit "전기" 라벨 mislabeling**: REIT 반기 audit의 "전기"(=2024.06)가 우리 코드에서 2023 키로 매핑되는 별개 이슈. fetchAuditReportData의 targetYear-1 추정 로직 점검
22. **[High] 9사 회귀 baseline.json 재생성**: 이번 세션 CJ fix + 효성중공업 사업보고서 갱신으로 baseline stale. production JWT 필요 OR 신규 `regression-check.mjs --local` 모드 활용
13. **[Medium] DOCX 버그 수정**: 총차입금 계산(유동성장기차입금+사채 포함), HTML 엔티티 제거
14. **[Medium] 광명9R 여신승인신청서 완성**: 금리/수수료/대주단 확정 시 공란 채우기
15. **[Medium] 피드백 확인 루프**: ok-cf1.vercel.app/feedback 에서 신규 피드백 확인 → 수정 → 배포
16. **[Low] P3 바이오텍 R&D 자산화 EBITDA D&A 보강**: 제넥신 BS 무형자산 변동에서 상각비 추정. 회계 가정 많아 일반화 어려움 — 별도 세션 권장
17. **여신검토 Phase 4~5**: viewpoint 검색, 승인 워크플로우, 신청서 연동

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
