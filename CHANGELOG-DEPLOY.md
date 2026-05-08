# CHANGELOG — 인프라 / Vercel / deploy.sh / 보안

← back to [CLAUDE.md](./CLAUDE.md)

Vercel 배포, deploy.sh 스크립트, Next.js 16, Firestore 규칙, Git Bash/rsync, 서비스 계정 키 보안 lessons learned.

---

## 2026-04-23
- **Vercel default region(iad1)↔DART korea 60초 timeout**: `buildFinancialData` 한 번 호출에 30초+, 사업보고서 ZIP 보강 추가 시 FUNCTION_INVOCATION_TIMEOUT. `app/vercel.json`에 `{"regions":["icn1"]}` 설정 → 1.2초로 단축 (50배+). **deploy.sh가 src/만 sync하고 vercel.json은 누락하던 버그 동시 수정** — rsync/robocopy 두 분기 모두에 `cp vercel.json` 추가.

## 2026-04-21
- **Firestore 테스트 모드 만료 → Admin-SDK-only 락다운**: 2026-04-22 만료 대응으로 `allow read, write: if false` 전면 차단 규칙 게시. 이 프로젝트는 **클라이언트 Firebase SDK 미사용**(모든 접근이 서버 `firebase-admin.ts` 경유) → Admin SDK가 서비스 계정 IAM으로 Firestore Rules 우회하므로 서비스 영향 0. 확인: `/api/dart/health` allOk:true. Firestore 규칙은 `firestore.rules` 파일로 git 추적됨 — Firebase Console 직접 편집 금지, `app/scripts/firebase-rules.sh` 경유 배포.
- **Git Bash(Windows)에 rsync 없음**: MSYS2 기본 패키지가 아님. deploy.sh에 `command -v rsync` 체크 + PowerShell `robocopy /MIR` fallback 추가 (+ `cygpath -w` Unix→Windows 경로 변환). **robocopy exit 1~7은 성공** (파일 복사됨), `>= 8`만 실패. 이거 모르면 정상 복사인데 파이프라인이 실패로 인식.
- **Vercel CLI stdout/stderr 분리 파싱**: `vercel ls --prod`는 stdout=URL 목록만, stderr=Ready 상태 테이블. 이전 파서 `head -5 | grep '● Ready'` → stdout의 URL만 보고 상태 못 찾아 Ready를 Unknown으로 오탐 → 실제 성공한 배포를 롤백 시도. fix: `2>&1` 병합 + `grep -oE '● [A-Za-z]+' | head -1`.
- **서비스 계정 키 감사 명령**: `git log --all --full-history -- "*firebase*"` (파일 단위) + `git log --all --full-history -p | grep "BEGIN PRIVATE KEY"` (본문 단위) 이중 체크. `.gitignore` 패턴은 `*firebase-adminsdk*.json` + `*-firebase-*.json` 이중(Console 기본명 + 변형 모두 커버). `.claude/settings.json`의 PreToolUse hook이 credential 패턴 포함 staged 파일을 commit 차단.
- **Dead code 삭제 heuristic**: ES 모듈은 `grep -rEl "from ['\"].*<module>['\"]"` 0건이면 안전 삭제. 단 (a) 동적 import 없음, (b) 문자열 기반 resolution 없음, (c) re-export 체인 없음 전제. `app/src/lib/firebase.ts` 제거 사례 — 1개월간 import 0건으로 남아있던 dead code.

## 2026-04-20
- **Vercel `● Ready` ≠ 실제 서비스 정상**: 3d 전 배포(dqgdzmgs8/69vje088h)가 Ready 상태로 표시됐으나 모든 보호 라우트(/financial, /appraisal, /review, /admin, /feedback)가 404 반환. /login만 200, 루트는 307 정상. 원인 추정: 감정평가서 작업 중 app/→loan-app-next 부분 수동 복사로 파일 세트 불일치 → 빌드 산출물에서 페이지 라우트 일부 누락. 복구는 이전 Ready 배포(gx1g2n3u4, 4d 전)로 alias 복원. **재발 방지**: (1) `app/scripts/deploy.sh`로만 배포 (rsync --delete로 완전 동기화), (2) 배포 후 라우트 HTTP 헬스체크 필수 — `/login(200)`, `/financial(307)`, `/appraisal(307)`, `/(307)`, (3) 헬스체크 실패 시 이전 Ready URL(`loan-app-next/.last-ready-deploy.txt` 저장)로 alias 자동 롤백.

## 2026-04-14
- **loan-app-next에 review API routes 복사 시 의존성**(review-store, deal-to-loan-mapper, loan-engine 등) 전체가 필요 — 부분 복사 시 빌드 실패.
- **Vercel 함수 크래시 식별**: "An error occurred" 텍스트 응답 = non-JSON → 프론트엔드에서 `res.text()` 후 `JSON.parse()`로 안전 처리. `res.json()` 직접 호출 시 SyntaxError.
- **Vercel Hobby 제약**: 60초 serverless timeout, 4.5MB response size limit, iad1 리전 고정. Excel base64가 3MB 이상이면 응답에서 제외 필요.
- **Firestore fire-and-forget**: 크리티컬하지 않은 저장은 `Promise.resolve().then(async () => { ... })` 패턴으로 응답 블로킹 없이 처리.

## 2026-04-13
- 배포 시 loan-app-next는 .gitignore에 포함 → git push로 자동 배포 안 됨. `cd loan-app-next && npx vercel --prod`로 수동 배포 필요.

## 2026-03-31
- Vercel Hobby 플랜 기본 serverless timeout 10초 → `export const maxDuration = 60` 으로 확장 필요 (비상장 감사보고서 XML 파싱 등).
- Next.js 16에서 `middleware.ts` → `proxy.ts`로 컨벤션 변경 (빌드 출력: "ƒ Proxy (Middleware)").

## 2026-03-26
- 새 패키지 import 시 반드시 `npm install --save` 먼저 — 로컬 node_modules에 있어도 Vercel에서 설치 안됨.
- 브라우저용 라이브러리(pdfjs-dist 등)를 서버에서 쓸 때 DOMMatrix/Path2D 등 폴리필 필요 여부 사전 확인.
- 작동하는 코드를 수정할 때 원본 로직 보존, 새 로직은 try/catch fallback으로만 추가.
