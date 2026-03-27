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

### 미확인/잠재 이슈
- PDF 업로드 IS 파싱이 Vercel에서 실제 작동하는지 최종 확인 필요 (pdf-parse fallback 줄 재구성)
- 파일 제거 시 파싱 결과 유지 로직 (남은 파일의 데이터가 정확한지)
- 분기보고서 전기 데이터(frmtrm_add_amount)의 누적금액 정확성
- **감사보고서 파싱 수정 후 실데이터 검증 미완** (테스트 대상 기업 재조회 필요)
- 일부 감사보고서 ZIP에 재무상태표 본문 없음 (특정 연도 연결 등)
- 계정명이 완전히 다른 경우(공사미수금↔미수금) 자동 merge 불가

## Next Session Context
1. **[긴급] 감사보고서 파싱 실데이터 검증**: 테스트 대상 기업 재조회하여 연도별 데이터 정확성 확인
2. PDF 업로드 IS 파싱: pdfjs-dist가 Vercel에서 작동하면 좌표 기반(정확), 실패하면 pdf-parse fallback(줄 재구성)
3. DART 분기보고서: 누적 매출 정확성 검증 필요
4. 배포 체크리스트: app/ 수정 → 빌드 확인 → 배포 레포 복사 → develop→master→push → `vercel ls` Ready 확인
