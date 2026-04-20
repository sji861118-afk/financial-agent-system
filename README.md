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
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase 서비스 계정 JSON |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Cloud Storage 버킷명 |

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
├── README.md                          # 이 파일 (통합 프로젝트 문서)
├── CLAUDE.md                          # Claude Code 프로젝트 지시사항
├── AGENTS.md                          # Next.js 에이전트 규칙
├── blueprint-financial-extraction.md  # 에이전트 시스템 설계서
│
├── app/                               # Track A+C. 재무분석 + 감정평가 웹앱 (Next.js 16)
│   ├── src/
│   │   ├── app/                       # App Router (페이지 + API)
│   │   │   ├── api/dart/financial/    # 재무조회 API (+ QA 검수)
│   │   │   ├── api/dart/merge/        # 병합 API (+ QA 검수)
│   │   │   ├── api/upload/            # 파일 업로드 파서
│   │   │   ├── api/appraisal/generate/# Track C 감정평가→Excel 생성 (신규)
│   │   │   ├── appraisal/             # Track C 업로드 페이지 (신규)
│   │   │   └── financial/             # 재무조회 페이지
│   │   ├── components/ui/             # shadcn/ui 컴포넌트
│   │   ├── lib/
│   │   │   ├── agents/                # 에이전트 시스템
│   │   │   │   ├── orchestrator.ts    # 오케스트레이터
│   │   │   │   ├── data-collector.ts  # 데이터 수집 + 스냅샷
│   │   │   │   ├── parser.ts          # 파싱/정규화
│   │   │   │   ├── merger.ts          # 다중출처 병합
│   │   │   │   ├── qa-verifier.ts     # 4단계 자동 검수
│   │   │   │   ├── types.ts           # 공유 타입
│   │   │   │   └── index.ts           # 모듈 export
│   │   │   ├── appraisal/             # Track C 감정평가 자동화 (신규)
│   │   │   │   ├── orchestrator.ts    # 감수→빌드 파이프라인
│   │   │   │   ├── property-detector.ts # 물건유형 자동감지
│   │   │   │   ├── parser-adapter.ts  # Partial→Complete 정규화
│   │   │   │   ├── auditors/          # 2 감수 에이전트 + stats-helpers
│   │   │   │   ├── sheet-builders/    # 5 시트 빌더
│   │   │   │   └── property-templates/ # 3 유형별 템플릿
│   │   │   ├── appraisal-parser.ts    # 감정평가서 PDF 파서 v2
│   │   │   ├── appraisal-excel.ts     # 시산가액·경매통계 시트 (슬림화)
│   │   │   ├── dart-api.ts            # DART 전자공시 API
│   │   │   ├── financial-analyzer.ts  # 재무비율 분석 엔진
│   │   │   ├── excel-generator.ts     # Excel 보고서 생성
│   │   │   ├── rule-based-expert.ts   # 룰 기반 전문가 소견
│   │   │   ├── nice-api.ts            # NICE 신용등급 API
│   │   │   ├── fisis-api.ts           # FISIS 금융통계 API
│   │   │   ├── firebase-admin.ts      # Firestore/Storage
│   │   │   └── auth.ts                # 인증/권한/활동로그
│   │   └── types/index.ts             # 공유 타입 정의
│   └── public/                        # 정적 파일
│
├── docx-generator/                    # Track B. 여신신청서 DOCX 생성
│   ├── _공통/                         # 에이전트 프롬프트 (공유)
│   ├── _유형별_프롬프트/              # 대출유형별 플러그인
│   ├── 01_입력데이터/                 # 입력 (JSON + Excel + 추가자료)
│   └── 02_초안출력/                   # 출력 (DOCX)
│
├── 여신심사_워크스페이스/             # Track B 에이전트 정의
│   └── _공통/                         # planner, writer, reviewer 등
│
├── docs/                              # 설계/기획 문서
├── _archive/                          # 아카이브 (git 미포함)
└── _reference/                        # 참고자료 (git 미포함)
```

## Lessons Learned
- 새 패키지 import 시 반드시 `npm install --save` 먼저 (Vercel에서 빌드 실패 방지)
- 작동하는 코드를 수정할 때 원본 로직 보존, 새 로직은 try/catch fallback으로만 추가
- 감사보고서 XML 주석번호("4,5,6,7")가 금액 정규식에 매칭 → 선 필터 필수
- 감사보고서 간 계정명 표기 차이 → normalizeAcct() 통합으로 해결
- DART 분기보고서 IS는 thstrm_add_amount(누적) 사용 필수
- push 후 반드시 `npx vercel ls`로 빌드 성공 확인
- **[2026-04-20] JS prototype shadowing**: TS에서 `string`으로 타이핑된 필드명이 `constructor`/`toString` 등 Object.prototype property와 겹치면, 파서가 미할당 시 prototype의 함수가 반환됨 → ExcelJS crash. `Object.hasOwn()` 기반 접근 필수
- **[2026-04-20] Node v24 strip-types + tsx 충돌**: `npx tsx` 대신 `node --experimental-strip-types --no-warnings test-X.mjs` 사용. 상대 import에 `.ts` 확장자 명시 + `@ts-expect-error TS5097` 주석
- **[2026-04-20] 감수 에이전트 false positive 방지**: 데이터 누락(추출 실패) vs 실제 위반을 `missingFields: string[]`로 구분. 누락은 INFO, 위반은 ERROR/WARNING
- **[2026-04-20] Partial→Complete 어댑터 패턴**: 파서는 부분 결과만 반환, 어댑터에서 `EMPTY_*` 기본값 + spread + derived value(예: collateralDetail에서 totalArea 도출)로 정규화
- **[2026-04-20] 통계 도구**: IQR 기반 이상치 검출, CV(변동계수 = stddev/mean)로 상대편차 판단, 규모별 분류(50/300/1000억 임계)는 대형 PF 위험 분류에 실용적

## 버전 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|---------|
| v2.0 | 2026-04-17~20 | **Track C 감정평가 자동화 v3** — 5 Phase 신규 구현 (2 감수 에이전트 + 3 property templates + 5 sheet builders + parser-adapter + API/UI), 실 PDF 2종 E2E 5/5 통과, 감수의견 품질 개선 (false positive 제거 + 통계 분석), 13 커밋 |
| v1.0 | 2026-03-27 | 초기 구조화 — 에이전트 시스템 (오케스트레이터 + 4 서브에이전트 + QA 검수) 구축, 통합 README 생성 |
| v0.9 | 2026-03-26 | 감사보고서 XML 파싱 정확도 대폭 개선 (주석번호 필터, normalizeAcct, 현재가치할인차금 순액) |
| v0.8 | 2026-03-26 | 업로드 전용 Excel + PDF 파싱 + 분기보고서 누적금액 + BS/IS 병합 |
| v0.7 | 2026-03-24 | 팀 배포, 인증/권한/활동로그, NICE 연동 |
| v0.6 | 2026-03-23 | Firebase 영구저장 (Vercel tmpdir 문제 해결), 관리자 페이지 |
| v0.5 | 2026-03-20 | 룰 기반 전문가 소견 (외부 LLM 의존 제거) |

## License

MIT
