# 재무제표 추출자동화 에이전트 시스템 설계서

> 작성일: 2026-03-27
> 목적: Claude Code 구현 참조용 계획서 — 오케스트레이터 + 서브에이전트 + 검수팀 구조

---

## 1. 작업 컨텍스트

### 배경 및 목적
현재 재무제표 추출 도구는 단일 플로우(DART API → 파싱 → 병합 → Excel)로 동작하며, 각 단계에서 발생하는 오류(파싱 누락, 계정명 불일치, 연도별 수치 오류)를 사후에 발견하고 반복 수정하는 패턴이 계속됨. 이를 해결하기 위해:

1. **각 단계를 독립 에이전트로 분리**하여 책임을 명확히 함
2. **검수(QA) 에이전트**가 최종 산출물 전에 원본 대비 정확성을 자동 검증
3. **불일치 발견 시 자동 재처리**, 애매한 항목은 사람에게 에스컬레이션

### 범위
- 포함: DART 재무데이터 조회, 감사보고서 XML 파싱, 업로드 파일 파싱, 데이터 병합, 재무비율 분석, Excel 생성, **산출물 검수**
- 제외: 사용자 인증/권한, UI/프론트엔드, 감정평가 관련 기능, NICE/FISIS 외부 API 연동 (기존 로직 유지)

### 입출력 정의

| 항목 | 내용 |
|------|------|
| **입력** | 기업명 + 조회연도 (DART 경로) / Excel·PDF 파일 (업로드 경로) |
| **출력** | 검증 완료된 Excel 보고서 (.xlsx) + 검수 리포트 (JSON) |
| **트리거** | `/api/dart/financial` 또는 `/api/dart/merge` API 호출 |

### 제약조건
- DART API 일일 호출 한도 (10,000건)
- Vercel 서버리스 함수 실행 시간 제한 (60초, Hobby 플랜)
- 감사보고서 ZIP 다운로드 + XML 파싱은 시간 소모 큼 → 캐싱 필요
- 검수 단계 추가로 전체 응답 시간 증가 허용 범위: +3초 이내

### 용어 정의

| 용어 | 정의 |
|------|------|
| BS | Balance Sheet, 재무상태표 |
| IS | Income Statement, 손익계산서 |
| OFS | 개별재무제표 (별도) |
| CFS | 연결재무제표 |
| 원본 데이터 | DART API 응답 또는 업로드 파일의 파싱 전 raw 데이터 |
| 검수 리포트 | QA 에이전트가 생성하는 항목별 일치/불일치 결과 |

---

## 2. 워크플로우 정의

### 전체 흐름도

```
[사용자 요청] → [오케스트레이터]
                    │
                    ├─→ [Step 1: 데이터 수집] ──→ /output/raw_data.json
                    │
                    ├─→ [Step 2: 파싱·정규화] ──→ /output/parsed_data.json
                    │
                    ├─→ [Step 3: 병합] ─────────→ /output/merged_data.json
                    │
                    ├─→ [Step 4: 분석] ─────────→ /output/analysis.json
                    │
                    ├─→ [Step 5: Excel 생성] ───→ /output/report.xlsx
                    │
                    ├─→ [Step 6: 검수] ─────────→ /output/qa_report.json
                    │       │
                    │       ├─ PASS → 최종 산출물 전달
                    │       ├─ AUTO_FIX → Step 2~5 자동 재처리 (최대 2회)
                    │       └─ ESCALATE → 사람 판단 요청 (불일치 항목 표시)
                    │
                    └─→ [최종 응답] → Excel + 검수 리포트
```

### LLM 판단 vs 코드 처리 구분

| LLM이 직접 수행 | 스크립트로 처리 |
|----------------|----------------|
| 계정명 유사도 판단 (애매한 매칭) | DART API 호출 및 응답 파싱 |
| 검수 불일치 원인 분류 | XML/Excel/PDF 파일 파싱 |
| 에스컬레이션 메시지 작성 | 계정명 정규화 (normalizeAcct) |
| 재처리 전략 결정 | 재무비율 계산 |
| | Excel 셀 생성·포매팅 |
| | 원본 vs 산출물 수치 비교 |

### 단계별 상세

#### Step 1: 데이터 수집 (data-collector)

- **처리 주체**: 서브에이전트 `data-collector`
- **입력**: 기업명, corpCode, 조회연도 배열 / 업로드 파일 (Excel·PDF)
- **처리 내용**:
  - DART 경로: `fetchFinancialItems()` → BS·IS raw 데이터 수집
  - DART 감사보고서 경로: ZIP 다운로드 → XML 추출
  - 업로드 경로: 파일 타입 감지 → Excel 파싱 or PDF 파싱
  - **원본 데이터 스냅샷 저장** (검수용)
- **출력**: `/output/raw_data.json` — 원본 그대로의 데이터 + 메타정보 (출처, 보고서유형, 조회일시)
- **성공 기준**: 요청한 모든 연도에 대해 BS 또는 IS 데이터가 1건 이상 존재
- **검증 방법**: 스키마 검증 (연도별 항목 수 > 0, 필수 필드 존재)
- **실패 시 처리**: 특정 연도 데이터 없음 → 해당 연도 스킵 + 로그, API 오류 → 자동 재시도 (최대 2회)

#### Step 2: 파싱·정규화 (parser)

- **처리 주체**: 서브에이전트 `parser`
- **입력**: `/output/raw_data.json`
- **처리 내용**:
  - 감사보고서 XML: TD/TH/TE 태그 파싱, 주석번호 필터링, BS→IS 전환 감지
  - 계정명 정규화: `normalizeAcct()` 적용 (주석 제거, 공백 통일, 번호접두사 제거)
  - 금액 단위 통일 (원 → 백만원)
  - 현재가치할인차금 감지 → 순액 반영
  - IS 섹션 종료점 감지 (당기순이익/손실 이후)
- **출력**: `/output/parsed_data.json` — 정규화된 `{bsItems, isItems}[]` (연도별)
- **성공 기준**: 모든 항목의 계정명이 정규화됨, 금액 단위 통일, BS/IS 구분 정확
- **검증 방법**: 규칙 기반 — 주요 계정(자산총계, 부채총계, 매출액) 존재 여부 확인
- **실패 시 처리**: 주요 계정 누락 → 에스컬레이션 (원본 데이터와 함께 사람에게 표시)

#### Step 3: 병합 (merger)

- **처리 주체**: 서브에이전트 `merger`
- **입력**: `/output/parsed_data.json` + (선택) 기존 DART 데이터
- **처리 내용**:
  - 다중 출처 데이터 병합 (DART + 업로드 + 감사보고서)
  - 계정명 기반 매칭 (정규화된 이름으로)
  - 중복 계정 순서 보존 매칭
  - 우선순위: DART > 감사보고서 > 업로드 (설정 가능)
  - 연도 컬럼 오름차순 정렬
- **출력**: `/output/merged_data.json` — 통합된 `{years, bsItems, isItems}`
- **성공 기준**: 모든 출처의 데이터가 빠짐없이 반영, 연도 정렬 정확
- **검증 방법**: 규칙 기반 — 각 출처별 항목 수 합산 ≥ 병합 후 항목 수 (병합 시 손실 없음)
- **실패 시 처리**: 계정명 매칭 실패 (유사도 < 70%) → 에스컬레이션 (후보 목록 제시)

#### Step 4: 분석 (analyzer)

- **처리 주체**: 스크립트 (기존 `financial-analyzer.ts` + `rule-based-expert.ts`)
- **입력**: `/output/merged_data.json`
- **처리 내용**:
  - 재무비율 계산 (안정성/수익성/성장성/활동성)
  - NICE 등급 산출
  - 룰 기반 전문가 의견 생성
  - 총차입금/순차입금 계산
- **출력**: `/output/analysis.json` — `{ratios, grade, expertOpinion, borrowings}`
- **성공 기준**: 모든 비율이 수치 범위 내 (부채비율 0~99999%, ROA -100~100%)
- **검증 방법**: 스키마 검증 + 범위 검증
- **실패 시 처리**: 범위 초과 → 입력 데이터 이상으로 판단, 원본 수치와 대조 후 에스컬레이션

#### Step 5: Excel 생성 (excel-builder)

- **처리 주체**: 스크립트 (기존 `excel-generator.ts`)
- **입력**: `/output/merged_data.json` + `/output/analysis.json`
- **처리 내용**:
  - 다중 시트 워크북 생성 (요약, BS, IS, 연결, 재무분석)
  - 셀 포매팅 (천단위 구분, 음수 표시, 깊이별 들여쓰기)
  - 산출근거(계산식) 하단 표시
- **출력**: `/output/report.xlsx`
- **성공 기준**: 파일 생성됨, 모든 시트 존재, 셀 값이 비어있지 않음
- **검증 방법**: 스키마 검증 (시트 수, 시트명 확인)
- **실패 시 처리**: 자동 재시도 (최대 1회)

#### Step 6: 검수 (qa-verifier) ⭐ 핵심 신규 단계

- **처리 주체**: 서브에이전트 `qa-verifier`
- **입력**: `/output/raw_data.json` (원본) + `/output/report.xlsx` (산출물) + `/output/merged_data.json`
- **처리 내용**:

  **검증 1: 파싱 누락 검사**
  - 원본 raw_data의 항목 수 vs parsed_data 항목 수 비교
  - 원본에 있으나 파싱 결과에 없는 항목 식별
  - 주요 계정(자산총계, 부채총계, 자본총계, 매출액, 영업이익, 당기순이익) 존재 필수

  **검증 2: 계정명 일치 검사**
  - 원본 계정명 → 정규화된 계정명 매핑 테이블 검증
  - 동일 계정이 연도별로 다른 이름으로 존재하는지 탐지
  - 유사도 기반 의심 항목 플래그 (예: "단기차입금" vs "단기 차입금")

  **검증 3: 연도별 수치 일치 검사**
  - 원본 데이터의 각 항목·연도별 금액 vs Excel 시트 내 해당 셀 값 1:1 대조
  - 허용 오차: ±1 (반올림 차이) — 그 외 불일치는 모두 플래그
  - 합계 항목 검증: 자산총계 = 부채총계 + 자본총계 (BS 등식)

  **검증 4: 비율 수치 검증**
  - Excel 재무분석 시트의 비율값 vs merged_data 기반 직접 재계산
  - 부채비율, 유동비율, ROA, ROE 등 주요 비율 ±0.1%p 이내 일치

- **출력**: `/output/qa_report.json`
  ```json
  {
    "status": "PASS | AUTO_FIX | ESCALATE",
    "timestamp": "2026-03-27T...",
    "checks": [
      {
        "type": "파싱누락",
        "result": "PASS | FAIL",
        "details": "원본 45항목 중 45항목 파싱 완료",
        "missingItems": []
      },
      {
        "type": "계정명일치",
        "result": "PASS | WARN | FAIL",
        "details": "...",
        "suspiciousMatches": [
          {"original": "...", "normalized": "...", "similarity": 0.85}
        ]
      },
      {
        "type": "수치일치",
        "result": "PASS | FAIL",
        "details": "...",
        "mismatches": [
          {"account": "...", "year": "2024", "original": 1000, "excel": 999, "diff": 1}
        ]
      },
      {
        "type": "비율검증",
        "result": "PASS | FAIL",
        "details": "...",
        "mismatches": []
      }
    ],
    "autoFixable": [...],
    "needsHumanReview": [...]
  }
  ```
- **성공 기준**: 4가지 검증 모두 PASS
- **검증 방법**: 규칙 기반 (수치 비교, 항목 수 비교)
- **실패 시 처리**:
  - `autoFixable` 항목 존재 → Step 2~5 자동 재처리 (최대 2회)
  - `needsHumanReview` 항목 존재 → 에스컬레이션 (불일치 항목 + 원본 데이터 + 제안 표시)
  - 재처리 2회 후에도 FAIL → 강제 에스컬레이션

### 상태 전이

| 상태 | 전이 조건 | 다음 상태 |
|------|----------|----------|
| COLLECTING | 데이터 수집 완료 | PARSING |
| PARSING | 정규화 완료 + 주요 계정 존재 | MERGING |
| PARSING | 주요 계정 누락 | ESCALATE |
| MERGING | 병합 완료 + 손실 없음 | ANALYZING |
| MERGING | 계정 매칭 실패 (유사도 < 70%) | ESCALATE |
| ANALYZING | 비율 계산 완료 + 범위 정상 | BUILDING |
| BUILDING | Excel 생성 완료 | VERIFYING |
| VERIFYING | QA 전체 PASS | COMPLETE |
| VERIFYING | AUTO_FIX 가능 항목 존재 | PARSING (재처리) |
| VERIFYING | 사람 판단 필요 항목 존재 | ESCALATE |
| ESCALATE | 사람 판단 완료 | 이전 단계 재진입 |

---

## 3. 구현 스펙

### 폴더 구조

```
/app/src/
  ├── lib/
  │   ├── agents/                          # 에이전트 시스템 (신규)
  │   │   ├── orchestrator.ts              # 오케스트레이터 — 전체 플로우 제어
  │   │   ├── data-collector.ts            # 서브에이전트 — 데이터 수집
  │   │   ├── parser.ts                    # 서브에이전트 — 파싱·정규화
  │   │   ├── merger.ts                    # 서브에이전트 — 병합
  │   │   ├── qa-verifier.ts              # 서브에이전트 — 검수 ⭐
  │   │   └── types.ts                     # 에이전트 간 공유 타입
  │   │
  │   ├── dart-api.ts                      # 기존 유지 (data-collector가 호출)
  │   ├── financial-analyzer.ts            # 기존 유지 (analyzer 단계)
  │   ├── excel-generator.ts               # 기존 유지 (excel-builder 단계)
  │   ├── rule-based-expert.ts             # 기존 유지
  │   └── ...
  │
  ├── app/api/
  │   ├── dart/financial/route.ts          # 기존 → orchestrator 호출로 리팩터
  │   ├── dart/merge/route.ts              # 기존 → orchestrator 호출로 리팩터
  │   └── qa/report/route.ts              # 신규 — 검수 리포트 조회 API
  │
  └── types/
      └── index.ts                         # QAReport, AgentState 타입 추가
```

### 기존 코드와의 관계

**핵심 원칙: 기존 로직 보존, 에이전트 레이어는 래퍼(wrapper)로 추가**

| 기존 모듈 | 에이전트 역할 | 변경 내용 |
|-----------|-------------|----------|
| `dart-api.ts` | `data-collector`가 호출 | 변경 없음 — 원본 스냅샷 저장 로직만 추가 |
| `normalizeAcct()` | `parser`가 호출 | 변경 없음 |
| `financial-analyzer.ts` | `orchestrator`가 직접 호출 | 변경 없음 |
| `excel-generator.ts` | `orchestrator`가 직접 호출 | 변경 없음 |
| API routes | `orchestrator` 진입점 | 기존 로직 → `orchestrator.run()` 호출로 교체 |

### 에이전트 구조

**구조 선택**: 멀티 에이전트 (오케스트레이터 + 서브에이전트 4개)

**선택 근거**:
1. 각 단계의 실패 원인이 다름 → 독립적 재시도/에스컬레이션 필요
2. 검수(QA)는 다른 단계와 완전히 독립적인 관점 필요 (생성자 ≠ 검수자)
3. 중간 산출물(JSON)을 기반으로 단계 간 데이터 전달 → 디버깅 용이

#### 오케스트레이터 (orchestrator.ts)
- **역할**: 전체 워크플로우 제어, 상태 관리, 에스컬레이션 판단
- **담당**: Step 1~6 순차 호출, 재처리 루프 관리, 최종 응답 조합
- **상태 머신**: `COLLECTING → PARSING → MERGING → ANALYZING → BUILDING → VERIFYING → COMPLETE/ESCALATE`

#### 서브에이전트 목록

| 이름 | 역할 | 트리거 조건 | 입력 | 출력 |
|------|------|-----------|------|------|
| `data-collector` | DART/파일 데이터 수집 + 원본 스냅샷 | 오케스트레이터 호출 | 기업명, 연도, 파일 | `raw_data.json` |
| `parser` | XML/Excel/PDF 파싱 + 정규화 | 수집 완료 후 | `raw_data.json` | `parsed_data.json` |
| `merger` | 다중 출처 병합 | 파싱 완료 후 | `parsed_data.json` | `merged_data.json` |
| `qa-verifier` | 원본 vs 산출물 검증 | Excel 생성 후 | `raw_data.json` + `merged_data.json` + `report.xlsx` | `qa_report.json` |

### 주요 산출물 파일

| 파일 | 형식 | 생성 단계 | 용도 |
|------|------|----------|------|
| `raw_data.json` | JSON | Step 1 | 원본 스냅샷 — 검수 기준 데이터 |
| `parsed_data.json` | JSON | Step 2 | 정규화된 BS/IS 항목 |
| `merged_data.json` | JSON | Step 3 | 병합된 최종 재무 데이터 |
| `analysis.json` | JSON | Step 4 | 재무비율 + 전문가 의견 |
| `report.xlsx` | Excel | Step 5 | 최종 Excel 보고서 |
| `qa_report.json` | JSON | Step 6 | 검수 결과 리포트 |

### 에스컬레이션 UX

사람에게 판단을 요청할 때의 인터페이스:

```
⚠️ 검수 결과: 2건의 확인 필요 항목

1. [계정명 불일치] 2023년 감사보고서
   원본: "단기차입금(주석 12)"  →  정규화: "단기차입금"
   ✅ 자동 처리됨 (주석 제거)

2. [수치 불일치] 2024년 자산총계
   원본 (DART): 15,234,567천원
   Excel 출력:  15,234,000천원
   차이: 567천원 (0.004%)
   → [승인] [수정 요청] [원본 값 사용]
```

---

## 4. 구현 우선순위

### Phase 1: 기반 구축 (최우선)
1. `agents/types.ts` — 공유 타입 정의 (AgentState, QAReport, RawDataSnapshot)
2. `agents/orchestrator.ts` — 상태 머신 + 순차 호출 골격
3. 기존 API route → orchestrator 연결

### Phase 2: 검수 에이전트 (핵심 가치)
4. `agents/qa-verifier.ts` — 4가지 검증 로직
5. `agents/data-collector.ts` — 기존 로직 래핑 + 원본 스냅샷 저장
6. QA 결과 → 프론트엔드 표시 (에스컬레이션 UI)

### Phase 3: 파서·머저 분리
7. `agents/parser.ts` — 기존 파싱 로직 래핑
8. `agents/merger.ts` — 기존 병합 로직 래핑
9. 자동 재처리 루프 구현

### Phase 4: 안정화
10. 실데이터 검증 (다양한 업종/규모 테스트 기업)
11. 에스컬레이션 이력 저장 (Firestore)
12. 검수 통과율 대시보드

---

## 5. 향후 도구 적용 가이드

이 구조를 다른 도구에 적용할 때의 표준 패턴:

```
어떤 도구든 동일 구조:
├── orchestrator  — 전체 플로우 제어 + 상태 머신
├── sub-agents    — 각 단계별 독립 처리
├── qa-verifier   — 원본 vs 산출물 검증 (도구별 검증 규칙만 교체)
└── escalation    — 자동 처리 불가 시 사람 개입 경로
```

**교체 포인트**: 데이터 수집 방법, 파싱 규칙, 검증 규칙만 도구별로 다르고, 오케스트레이터 골격·상태 머신·에스컬레이션 패턴은 재사용.
