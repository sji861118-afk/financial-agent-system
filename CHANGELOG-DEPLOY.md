# CHANGELOG — 인프라 / Vercel / deploy.sh / 보안

← back to [CLAUDE.md](./CLAUDE.md)

Vercel 배포, deploy.sh 스크립트, Next.js 16, Firestore 규칙, Git Bash/rsync, 서비스 계정 키 보안 lessons learned.

---

## 2026-05-08
- **PowerShell 5.1 `&&` 미지원으로 인한 silent push skip**: Windows 기본 셸 PowerShell 5.1은 `&&`/`||` chain operator를 parser error로 거부. Bash on Git Bash에서 `git commit ... && git push`를 한 명령으로 실행해도 commit은 성공하지만 push가 silent skip(exit 0)되는 케이스 발생. **`git log --oneline origin/main..HEAD`로 미push 확인 필수**. 또는 두 명령 분리 호출. `/ship` 슬래시 커맨드도 step 단위로 분리 호출하도록 명시 (commit 0f3872c 후속 lesson).
- **`git add <file>` 사이드이펙트 — 사용자 unstaged 변경분 동시 staging**: 같은 파일에 사용자가 미리 손댄 unstaged 변경이 있으면 `git add path/to/file` 한 번에 모두 staged됨. CLAUDE.md case에서 의도한 3 line 변경에 사용자의 89 line 정리 작업이 함께 commit. 의도와 일관할 때만 안전. 방어법: stage 후 `git diff --cached <file>`로 확인하거나 `git add -p`로 hunk 단위 staging. **PreToolUse hook으로 `git diff --cached --name-status` stderr preview 권장**.
- **README ↔ CHANGELOG-* 링크 drift 감지 패턴**: README가 link하는 CHANGELOG-APPRAISAL.md / CHANGELOG-DEPLOY.md가 git에 untracked 상태로 존재 가능. README 갱신 시 cross-check 안 하면 invisible. `git ls-files --error-unmatch` 또는 deploy.sh Step 0에서 link target 검증 hook 권장.
- **production JWT_SECRET drift from `||` fallback default**: 코드의 `process.env.JWT_SECRET || "loan-app-jwt-secret-key-2024-change-in-production"` 패턴은 local dev에서만 fallback 의도. production Vercel env에는 다른 secret 설정됨 → dev 스크립트가 default로 mint한 JWT는 production에서 9/9 "세션이 만료되었습니다" 거부. 회귀 검증/baseline 스크립트는 (a) local dev server 띄우고 호출, (b) `vercel env pull`로 secret 받기, 또는 (c) `~/.config/loan-app-next/regression.env` wrapper 중 하나 필요. **2026-05-08 학습 항목과 contradicts: "프로덕션 secret과 같은 값"이라는 prior assumption은 wrong**.
- **deploy.sh robocopy 한국어 경로 mojibake (cosmetic only)**: Git Bash on Windows에서 robocopy /MIR 실행 시 stdout이 cp1252 코드페이지로 출력되어 한국어 경로가 `*�߰� ���͸�` 같이 깨져 보임. 실제 파일 복사는 UTF-16 LE 기반 NTFS layer라 정상. 가독성 문제만 있음. `chcp 65001 >NUL` 사전 호출 또는 rsync 사용으로 회피 가능.
- **rsync/robocopy `--delete`/`/MIR`은 라우트 삭제 transparent**: 메인 레포에서 route file 삭제 후 deploy.sh 실행 시 별도 cleanup step 없이 mirror에서도 자동 제거됨. diag-da/diag-fetch route 삭제 검증 완료 (commit 1938f12 + 헬스체크 5/5 pass).
- **Next.js 16 `.next/dev/types/routes.d.ts` stale cache after route deletion**: API route 디렉토리 삭제 후 `npx tsc --noEmit` 실행 시 `.next/dev/types/routes.d.ts`에 phantom 엔트리가 남아 false TS error 발생. 빌드 시 자동 재생성되므로 운영 영향 없음. 검증 명령: `npx tsc --noEmit 2>&1 | grep -v "^\.next/"`.
- **/ship 슬래시 커맨드 도입** (`~/.claude/commands/ship.md`): commit + push + deploy.sh + 헬스체크 step별 자동화. **docs-only 변경(README/CHANGELOG/docs/* 만)은 deploy skip 분기 포함** — Vercel 빌드 ~3분 절약. user-level이라 README "실행 방법"에는 미기재 (사용자 에이전트 환경 한정).

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
