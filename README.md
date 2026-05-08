# 여신승인신청서 자동화 시스템
> 한 줄 설명: DART 공시 + 감사보고서 + 업로드 파일 → 재무분석 Excel + 여신신청서 DOCX 자동 생성

## 해결한 문제

저축은행 기업금융부에서 여신승인신청서 작성 시, 재무제표를 DART에서 수작업으로 추출하고 Excel에 옮겨 적는 과정에 1건당 2~3시간이 소요됨. 계정명 불일치, 연도 데이터 밀림, 수치 오류 등이 반복적으로 발생하며 검수에도 추가 시간이 필요. 이를 자동화하여 조회~Excel 생성~검수까지 1분 이내로 단축하고, 에이전트 기반 자동 검수로 데이터 정확도를 보장.

## 시스템 아키텍처

```
입력: 기업명 + 조회연도 / Excel·PDF 업로드 / 기본조건 JSON
↓
[Track A. 도구개발 — 재무데이터 추출 웹앱]
↓
┌──────────────────── 오케스트레이터 ────────────────────┐
│                                                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │data-       │ │parser      │ │merger      │          │
│  │collector   │ │계정명 정규화│ │다중출처 병합│          │
│  │DART/파일   │ │주요계정 확인│ │우선순위 처리│          │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘          │
│        └──────────────┴──────────────┘                  │
│                       ↓                                 │
│  ┌────────────────────────────────────────────┐         │
│  │ financial-analyzer + excel-generator        │         │
│  │ 재무비율 분석 + Excel 보고서                 │         │
│  └────────────────────┬───────────────────────┘         │
│                       ↓                                 │
│  ┌────────────────────────────────────────────┐         │
│  │ qa-verifier (검수팀)                        │         │
│  │ 파싱누락 / 계정명일치 / 수치일치 / 비율검증  │         │
│  │ → PASS / AUTO_FIX / ESCALATE               │         │
│  └────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────┘
↓
output: 검증된 재무현황 Excel (.xlsx) + QA 리포트

========================================================

[Track B. 신청서 작성 — Claude Code 로컬 에이전트]
↓
┌──────────────────── planner (오케스트레이터) ──────────────┐
│                                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │excel-parser│ │calculator  │ │section-    │              │
│  │Excel 파싱  │ │담보 계산   │ │writer      │              │
│  │(SKILL)     │ │(SKILL)     │ │섹션별 작성  │              │
│  └────────────┘ └────────────┘ └────────────┘              │
│                                                            │
│  ┌────────────┐ ┌────────────┐                              │
│  │opinion-    │ │reviewer    │                              │
│  │writer      │ │검수/품질게이트│                             │
│  │종합의견 작성│ │수치 정합성  │                              │
│  └────────────┘ └────────────┘                              │
└────────────────────────────────────────────────────────────┘
↓
output: 여신승인신청서 DOCX

========================================================

[Track C. 감정평가서 분석 자동화 v3 (2026-04-17 추가)]
↓
┌───────────────────── /appraisal 페이지 ─────────────────────┐
│  감정평가서/사업성평가보고서 PDF 업로드 + 유형 자동감지      │
└───────────────────────────┬────────────────────────────────┘
                            ↓
┌───────── /api/appraisal/generate (서버 파이프라인) ─────────┐
│  1. parseAppraisalPdf   (기존 appraisal-parser v2 재사용)    │
│  2. detectApplicationFormType (키워드 점수 기반)              │
│  3. adaptParserResult   (Partial → Complete 정규화)          │
│  4. ★ 2 감수 에이전트 ★                                       │
│     ├─ appraiser-auditor  (감정평가사 관점)                  │
│     └─ reviewer-auditor   (심사역 관점)                       │
│     → ReviewFinding[] (ERROR/WARNING/INFO)                   │
│  5. property-templates/{apt|industrial|land} → workbook     │
│     └─ sheet-builders × 5 (감수의견+담보+상세+비준+공급)    │
└───────────────────────────┬────────────────────────────────┘
                            ↓
output: 신청서 양식 Excel (감수의견 시트 포함) + findings JSON
```

## 에이전트 구성

### Track A. 도구개발 (재무데이터 추출)

| 에이전트명 | 파일 경로 | 역할 한 줄 | 모델 |
|-----------|-----------|-----------|------|
| orchestrator | `app/src/lib/agents/orchestrator.ts` | 전체 워크플로우 상태 머신 + 순차 호출 제어 | - (코드) |
| data-collector | `app/src/lib/agents/data-collector.ts` | DART API/업로드 파일 수집 + 원본 스냅샷 생성 | - (코드) |
| parser | `app/src/lib/agents/parser.ts` | 계정명 정규화 + 주요 계정 존재 확인 | - (코드) |
| merger | `app/src/lib/agents/merger.ts` | 다중 출처 데이터 병합 (DART 우선, 순서 보존) | - (코드) |
| qa-verifier | `app/src/lib/agents/qa-verifier.ts` | 4단계 자동 검수 (파싱누락/계정명/수치/비율) | - (코드) |
| financial-analyzer | `app/src/lib/financial-analyzer.ts` | 재무비율 분석 + 등급 산출 | - (코드) |
| excel-generator | `app/src/lib/excel-generator.ts` | 다중 시트 Excel 보고서 생성 | - (코드) |
| rule-based-expert | `app/src/lib/rule-based-expert.ts` | 룰 기반 전문가 소견 생성 (외부 API 불필요) | - (코드) |

### Track B. 신청서 작성 (여신신청서 자동 생성)

| 에이전트명 | 파일 경로 | 역할 한 줄 | 모델 |
|-----------|-----------|-----------|------|
| planner | `여신심사_워크스페이스/_공통/planner.md` | 오케스트레이터 — 입력 판독 + 유형 판별 + 작업 배분 | Claude Opus |
| section-writer | `여신심사_워크스페이스/_공통/section-writer.md` | 공통/유형별 섹션 작성 (유형 플러그인 구조) | Claude Opus |
| opinion-writer | `여신심사_워크스페이스/_공통/opinion-writer.md` | 종합의견 작성 (관공서 문체, 수치 인용 기반) | Claude Opus |
| reviewer | `여신심사_워크스페이스/_공통/reviewer.md` | QA 게이트 — 수치 정합성/단위/문체 검증 | Claude Opus |
| excel-parser | `여신심사_워크스페이스/_공통/excel-parser.md` | SKILL — 재무현황 Excel 파싱 → 구조화 객체 | Claude Opus |
| calculator | `여신심사_워크스페이스/_공통/calculator.md` | SKILL — 담보가치/사업성 계산 (유형별 분기) | Claude Opus |
| data-schema | `여신심사_워크스페이스/_공통/data-schema.md` | SKILL — Excel 필드 → 신청서 필드 매핑 테이블 | - (참조) |

### Track C. 감정평가서 분석 자동화 v3

| 파일 경로 | 역할 한 줄 |
|-----------|-----------|
| `app/src/lib/appraisal/orchestrator.ts` | 감수→워크북 빌드 파이프라인 조립 |
| `app/src/lib/appraisal/property-detector.ts` | PDF 키워드 점수 기반 물건유형 자동감지 |
| `app/src/lib/appraisal/parser-adapter.ts` | Partial 파서 결과 → Complete AppraisalData 정규화 (derived 값 도출) |
| `app/src/lib/appraisal/auditors/appraiser-auditor.ts` | 감정평가사 관점 검증 (평가방법/호별분포/비교사례 괴리율/기준시점) |
| `app/src/lib/appraisal/auditors/reviewer-auditor.ts` | 심사역 관점 검증 (LTV/규모분류/거래시장/분양현황/평가시점위험) |
| `app/src/lib/appraisal/auditors/stats-helpers.ts` | 통계 도구 (computeStats, detectOutliers, formatKRW, classifyScale) |
| `app/src/lib/appraisal/sheet-builders/*.ts` | 5개 시트 빌더 (감수의견/담보분석/상세담보/비준사례/공급분양) |
| `app/src/lib/appraisal/property-templates/*.ts` | 3개 템플릿 (apartment-pf/industrial-center/land-pf) |
| `app/src/app/api/appraisal/generate/route.ts` | 단일 멀티파트 엔드포인트 |
| `app/src/app/appraisal/page.tsx` | 업로드 UI + 감수결과 미리보기 + 다운로드 |

## 기술 스택
- **AI**: Claude Opus (Track B 에이전트), 룰 기반 분석 엔진 (Track A)
- **외부 API**: DART Open API (전자공시), NICE BizLine (신용등급), FISIS (금융통계), Firebase (인증/저장)
- **Infra**: Next.js 16 + React 19, Vercel (서버리스), Firestore + Cloud Storage, shadcn/ui
- **문서 생성**: ExcelJS (xlsx), docx (여신신청서)

## 환경 변수

| 변수명 | 용도 |
|--------|------|
| `DART_API_KEY` | FSS DART Open API 인증키 |
| `NICE_CLIENT_ID` | NICE BizLine 클라이언트 ID |
| `NICE_CLIENT_SECRET` | NICE BizLine 시크릿 |
| `FISIS_AUTH_KEY` | FISIS 금융통계 인증키 (선택) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase 서비스 계정 JSON (서버 Admin SDK — 필수) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Cloud Storage 버킷명 (서버 Admin SDK에서만 참조) |

> **Firestore 접근 경로**: 모든 읽기/쓰기는 서버사이드 `firebase-admin.ts` 경유. 클라이언트 Firebase SDK는 사용하지 않으며, Firestore 보안 규칙은 `allow read, write: if false` 전면 차단 상태입니다. Admin SDK는 서비스 계정 IAM으로 인증되어 규칙을 우회하므로 서버 API는 정상 동작합니다.

> API 키 발급: [DART](https://opendart.fss.or.kr), [NICE BizLine](https://www.nicebizline.com), [FISIS](https://fisis.fss.or.kr)

## 실행 방법

### Track A. 재무데이터 조회 (웹)
```bash
cp .env.example .env.local   # 환경변수 설정
cd app && npm install && npm run dev
# http://localhost:3000/financial 에서 기업명 입력 → Excel 다운로드
```

### Track B. 여신신청서 작성 (Claude Code)
```bash
cd docx-generator
# 01_입력데이터/ 에 기본조건_입력.json + 재무현황 Excel 배치
claude "planner.md를 참고해서 여신승인신청서를 작성해줘"
```

### Track C. 감정평가서 분석 (웹)
```bash
cd app && npm run dev
# http://localhost:3000/appraisal 에서 PDF 업로드 → 신청서 양식 Excel 다운로드
# API 직접 호출: POST /api/appraisal/generate (multipart/form-data)
#   fields: appraisalFiles, feasibilityFiles(선택), propertyType(auto|apartment-pf|industrial-center|land-pf)
# 로컬 E2E: node --experimental-strip-types --no-warnings test-appraisal-e2e.mjs
```

### 프로덕션 배포
```bash
cd app && ./scripts/deploy.sh
```
`app/scripts/deploy.sh`가 유일한 지원 경로. 주요 특징:
- `app/src/` → `loan-app-next/src/` 전체 동기화 (rsync, Git Bash/Windows는 `robocopy /MIR` fallback)
- `npx vercel --prod` 실행 → Ready 상태 폴링 (`vercel ls --prod 2>&1` stdout+stderr 병합 파싱)
- HTTP 라우트 헬스체크 (`/login` 200, `/financial` `/appraisal` `/` 307)
- 실패 시 이전 Ready 배포로 alias 자동 롤백 (`loan-app-next/.last-ready-deploy.txt`)

수동 `cp`로 부분 복사 금지 — 파일 세트 불일치로 라우트 404 발생 가능 (2026-04-20 장애 사례).

## 작업 컨텍스트 (Claude용)
> 이 섹션은 Claude Code가 프로젝트를 이어받을 때 참조하는 구간입니다.

### 현재 진행 상태
- [x] 완료된 에이전트 (Track A): orchestrator, data-collector, parser, merger, qa-verifier, financial-analyzer, excel-generator, rule-based-expert
- [x] 완료된 에이전트 (Track B): planner, section-writer, opinion-writer, reviewer, excel-parser, calculator, data-schema
- [x] Track C 감정평가 자동화 v3 (2026-04-17~20): 5 Phase 완료, 실 PDF 2종 E2E 5/5 통과, 13 커밋 (2e9e575→b79dd81)
- [ ] 미완성: qa-verifier ESCALATE 시 사용자 응답 → 재처리 루프 (현재 표시만 됨)
- [ ] 미완성: Track B docx-generator 실제 DOCX 출력 (현재 프롬프트 구조만 완성)
- [ ] 미완성: Track C 프로덕션 배포 (로컬 검증만 완료, 아직 loan-app-next 복사·Vercel 업로드 안 됨)
- [ ] 다음 작업: 치평동 appraiser 추출 버그 수정, /appraisal 브라우저 수동 E2E, 지산센터 비교사례 226% 괴리 조사

### 설계 결정 이유

**왜 에이전트 구조인가?**
단일 플로우에서 오류 발생 시 전체를 다시 돌려야 했고, 어디서 틀렸는지 추적이 어려웠음. 각 단계를 독립 모듈로 분리하면 (1) 실패 지점을 특정할 수 있고, (2) 해당 단계만 재처리 가능하며, (3) 검수를 별도 관점에서 수행 가능.

**왜 기존 코드를 래핑(wrapper)하는 방식인가?**
dart-api.ts, financial-analyzer.ts 등 이미 검증된 로직을 다시 작성하면 새 버그 유입 위험. 에이전트 레이어는 기존 함수를 호출하는 얇은 레이어로만 추가.

**왜 검수(QA)가 별도 에이전트인가?**
"생성자 ≠ 검수자" 원칙. 데이터를 만든 코드가 스스로를 검증하면 동일한 버그를 놓칠 수 있음. 원본 스냅샷과 최종 산출물을 독립적으로 대조하는 구조.

**왜 Track A/B 분리인가?**
Track A(웹앱)는 범용 재무데이터 조회 도구이고, Track B(신청서 작성)는 특정 금융기관 전용 업무 자동화. 의존성을 분리하여 Track A를 다른 기관에도 재사용 가능하게 설계.

### 알려진 이슈
- 감사보고서 파싱 수정 후 일부 기업 실데이터 검증 미완
- 일부 감사보고서 ZIP에 재무상태표 본문 없는 케이스 존재
- 계정명이 완전히 다른 경우 (예: 공사미수금 ↔ 미수금) 자동 merge 불가
- PDF 업로드 IS 파싱이 Vercel 서버리스에서 작동하는지 최종 확인 필요
- Vercel Hobby 플랜 60초 제한으로 대용량 감사보고서 ZIP 처리 시 타임아웃 가능
- Track B DOCX 생성기는 프롬프트 구조만 완성, 실 출력 미검증
- **Track C**: 치평동 샘플 `appraiser` 필드에 본문 텍스트 잘못 캡처(파서 정규식 버그)
- **Track C**: 지산센터 비교사례 평단가 9백만/평 (본건 31백만/평 대비 226% 괴리) — 데이터 출처 확인 필요
- **Track C**: `appraisal-excel.ts` 1,449→343줄 슬림화. 레거시 `/api/appraisal/excel` 라우트는 시산가액/경매통계만 반환 (신규 기능은 `/api/appraisal/generate` 사용)

### 폴더 구조

```
.
├── README.md                 # 통합 프로젝트 문서
├── CLAUDE.md                 # Claude Code 프로젝트 지시사항 (slim)
├── AGENTS.md                 # Next.js 에이전트 규칙
├── CHANGELOG-DART.md         # Track A — DART 파싱 lessons
├── CHANGELOG-EBITDA.md       # Track A — EBITDA / 재무비율 / Excel 셀 lessons
├── CHANGELOG-APPRAISAL.md    # Track A — 감정평가서 lessons
├── CHANGELOG-DEPLOY.md       # 인프라 — Vercel / deploy.sh lessons
│
├── app/                      # ── Track A: 재무·감정평가 웹앱 (Next.js 16, Vercel)
│   ├── src/
│   │   ├── app/              #    App Router (페이지 + API)
│   │   ├── components/       #    UI (shadcn/ui)
│   │   │   └── financial-dashboard/ # ─ /financial 차트 대시보드 (16 컴포넌트, recharts 3.x)
│   │   ├── lib/              #    핵심 비즈니스 로직 (frozen — 기존 파일 수정 금지)
│   │   │   ├── agents/       #     ─ 데이터수집·파싱·병합·QA 에이전트
│   │   │   ├── appraisal/    #     ─ 감정평가서 자동화 v3
│   │   │   ├── docx-v5/      #     ─ DOCX 생성 v5 (개발 중)
│   │   │   ├── loan-engine/  #     ─ 여신신청서 엔진 + profiles
│   │   │   └── *.ts          #     ─ dart-api, financial-analyzer, excel-generator 등
│   │   └── types/
│   ├── public/
│   ├── scripts/deploy.sh     #    rsync → Vercel → 라우트 헬스체크 → 자동 롤백
│   └── vercel.json           #    icn1 region pinned
│
├── docx-generator/           # ── Track B: 신청서 작성 (Claude Code, 로컬 CLI)
│   ├── 01_입력데이터/         #    deal JSON + 재무 xlsx
│   ├── 02_초안출력/           #    {차주명}_초안.docx
│   ├── _공통/                 #    FUTURE: planner.md / reviewer.md
│   ├── _유형별_프롬프트/        #    FUTURE: subagents (지분담보·PF·미분양·사모사채)
│   └── README.md             #    Track A 결합 문서화 (gitignored)
│
├── docs/
│   ├── superpowers/          # ── 진행 중 / 미정 plan + spec (STATUS 마커)
│   ├── archive/              # ── 완료된 plan + spec
│   │   └── completed-plans/  #     ─ INDEX.md 참조
│   ├── _obsolete/            # ── stale 문서 (gitignored, 로컬 보존만)
│   └── SKILLS-AUDIT.md       # ── 글로벌 스킬 사용 분석
│
├── loan-app-next/            # Vercel 배포 미러 (gitignored, deploy.sh가 동기화)
├── _archive/                 # 폐기 코드 (gitignored, 로컬 전용)
└── _reference/               # 참고자료 (gitignored)
```


## Lessons Learned

도메인별 CHANGELOG로 분리되어 있습니다 — 작업 시 해당 영역만 참조하세요.

- **[CHANGELOG-DART.md](./CHANGELOG-DART.md)** — DART API, 감사보고서 XML, K-IFRS/K-GAAP, BS/IS/CF 추출
- **[CHANGELOG-EBITDA.md](./CHANGELOG-EBITDA.md)** — EBITDA D&A, 이자비용 dual-source, Excel 셀 수식, 회계 감수
- **[CHANGELOG-APPRAISAL.md](./CHANGELOG-APPRAISAL.md)** — 감정평가서 PDF 파싱, FCFE/FCFF, 추정비례율/LTV
- **[CHANGELOG-DEPLOY.md](./CHANGELOG-DEPLOY.md)** — Vercel, deploy.sh, Next.js 16, Firestore, Git Bash/rsync

## 알려진 이슈

- 분기보고서 전기 데이터(frmtrm_add_amount)의 누적금액 정확성 미검증
- 감사보고서 파싱 수정 후 일부 기업 실데이터 검증 미완 + **회계기준(K-IFRS/K-GAAP) 변경 회사 휴리스틱 false positive 모니터링 필요** (비율 임계값 튜닝 후속 작업)
- 일부 감사보고서 ZIP에 재무상태표 본문 없음 (특정 연도 연결 등)
- 계정명이 완전히 다른 경우(공사미수금↔미수금) 자동 merge 불가
- 일부 회사가 사업보고서에 연결재무제표 미제출 시 빈값으로 표시 — UI 안내 메시지 추가 필요

## 버전 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|---------|
| v2.2 | 2026-05-07 | **/financial 차트 대시보드 + Excel 1.대시보드 시트** — form+table → recharts 차트 대시보드 교체 (16 신규 컴포넌트 `app/src/components/financial-dashboard/`: 회사헤더, 매출추이 ComposedChart, 3-up 손익, 현금흐름 워터폴, 건전성 RadarChart, 비율 KPI grid, 주주 도넛, 차입금 표, 감사인 의견, 리스크/기회, AI 분석 탭, 상세 BS/IS/CF 서브탭, OFS/CFS shadcn Tabs). Excel 1.요약 → 1.대시보드 시트로 재구성 (12 섹션 + 데이터바 + 차트 스타일). 비율 버그 4건 수정 — vsBenchmark↔riskLevel 필드 분리, "배"/"회" 단위 손실 (parseRatioValueForExcel), benchmarkLabel propagation, K-IFRS↔K-GAAP 매출 fallback (getRevenueByYear: 매출총이익+\|매출원가\| accounting identity). recharts 3.x Tooltip intersection bug 회피 (content prop 직접 렌더). 4사 검증 (한화·제넥신·프로젠·셀리드). DartPoint AI MCP 평가 결과: skip (90% 중복) |
| v2.1 | 2026-04-28 | **DART 추출 정확도 보강** — 8 commit (ZIP 본문 파일 선택, K-IFRS/K-GAAP 자동 폐기, 이자비용 dual-source 통일, BS 자본 sub-rank, 매출 키워드 보강, 종합소견 mergeCells, 코넥스 진단 endpoint). 프로젠 25년 IS 0→163, 셀리드 이자보상배율 dual-source 일치 |
| v2.0 | 2026-04-17~20 | **Track C 감정평가 자동화 v3** — 5 Phase 신규 구현 (2 감수 에이전트 + 3 property templates + 5 sheet builders + parser-adapter + API/UI), 실 PDF 2종 E2E 5/5 통과, 감수의견 품질 개선 (false positive 제거 + 통계 분석), 13 커밋 |
| v1.0 | 2026-03-27 | 초기 구조화 — 에이전트 시스템 (오케스트레이터 + 4 서브에이전트 + QA 검수) 구축, 통합 README 생성 |
| v0.9 | 2026-03-26 | 감사보고서 XML 파싱 정확도 대폭 개선 (주석번호 필터, normalizeAcct, 현재가치할인차금 순액) |
| v0.8 | 2026-03-26 | 업로드 전용 Excel + PDF 파싱 + 분기보고서 누적금액 + BS/IS 병합 |
| v0.7 | 2026-03-24 | 팀 배포, 인증/권한/활동로그, NICE 연동 |
| v0.6 | 2026-03-23 | Firebase 영구저장 (Vercel tmpdir 문제 해결), 관리자 페이지 |
| v0.5 | 2026-03-20 | 룰 기반 전문가 소견 (외부 LLM 의존 제거) |

## License

MIT
