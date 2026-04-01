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
- develop 브랜치에서 작업, "배포해줘" 시 master merge → Vercel 자동 배포
- DART 파싱 코드 수정 시 반드시 실제 기업 데이터로 테스트 후 배포
- **배포 = 두 레포 동기화**: app/ 수정 → loan-app-next에 복사 → develop commit → master merge → push
- **push 후 반드시 `npx vercel ls`로 `● Ready` 확인** — 확인 전 "배포 완료"라고 말하지 않기

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
- [2026-03-31] 비상장 외감법인은 fnlttSinglAcntAll/fnlttSinglAcnt API 데이터 없음 → 감사보고서 XML 파싱만 가능
- [2026-03-31] 삼일회계법인 가치산정: 금융회사는 FCFE(자기자본 현금흐름) 방식 사용, FCFF(WACC) 아님
- [2026-04-01] PDF 텍스트에 NULL 문자(\u0000) 포함 → 정규식 매칭 실패. 파싱 전 `.replace(/\u0000/g, " ")` 전처리 필수
- [2026-04-01] 연결 숫자 파싱: "78,022,000,0002,435,194,00059.62" → 큰 숫자(콤마포함)를 먼저 추출 후 잔여 파싱
- [2026-04-01] 감정평가서 호실별 감정가 추출 시 합계 검증(sum vs 합계행)으로 정확도 보장
- [2026-04-01] DART XML 파서 재무 값이 string("474,588") 반환 → obligor 분석에서 typeof number 체크하므로 parseFloat 변환 필수
- [2026-04-01] DART fetchBorrowingNotes 차입금 단위는 천원 → loan-engine 백만원 단위이므로 /1000 변환
- [2026-04-01] DOCX 미정 필드는 [TBD] 대신 빈칸('') 처리 — 실무 검토 시 [TBD] 텍스트 남으면 부적절

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
1. **[High] DOCX 버그 수정**: 총차입금 계산(유동성장기차입금+사채 포함), HTML 엔티티 제거
2. **[High] 커밋 + 배포**: 11개 수정 + 15개 신규 파일 정리 → loan-app-next 복사 → Vercel 배포
3. **[Medium] risk-analysis 자동 생성**: obligor 분석 데이터를 활용한 리스크 분석 섹션 자동 생성
4. **[Medium] 웹 UI E2E 테스트**: /review/new 에서 파일 업로드 → DART 조회 → DOCX 다운로드 전체 흐름
5. **여신검토 Phase 4~5**: viewpoint 검색, 승인 워크플로우, 신청서 연동
6. **Firestore init 리팩토링**: review-store.ts 중복 초기화 제거
