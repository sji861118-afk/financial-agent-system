#!/usr/bin/env bash
# Vercel 프로덕션 배포 — 라우트 헬스체크 + 실패 시 자동 alias 롤백
# 사용법: ./scripts/deploy.sh
#
# 설계 이유 (2026-04-20 장애):
#   Vercel "● Ready" 상태가 실제 라우트 동작을 보장하지 않는 케이스 확인.
#   빌드 성공했지만 보호 라우트(/financial, /appraisal 등)가 전부 404 반환.
#   Ready 확인 후 HTTP 라우트 실제 응답까지 검증하고, 실패 시 이전 Ready
#   배포로 alias 자동 복원하여 서비스 중단 방지.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "$APP_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/loan-app-next"
PROD_ALIAS="ok-cf1.vercel.app"

# 라우트 헬스체크 기준
#   /login      → 200       (공개 페이지, 빌드 산출물 검증)
#   /financial  → 307|302   (proxy가 /login 리다이렉트 → 라우트 존재 증거)
#   /appraisal  → 307|302   (동일)
#   /          → 307|302|200 (proxy 동작 확인)
HEALTH_CHECKS=(
  "/login=200"
  "/financial=307,302"
  "/appraisal=307,302"
  "/=307,302,200"
  "/api/dart/health=200"
)

# 바디 검증: /api/dart/health 응답에 allOk:true 있어야 통과.
# Admin SDK의 Firestore write까지 체크하는 효과 (health 엔드포인트가 DART 조회 후 저장함).
HEALTH_BODY_ASSERTIONS=(
  "/api/dart/health=\"allOk\":true"
)

if [[ ! -d "$DEPLOY_DIR" ]]; then
  echo "✗ 배포 대상 디렉토리 없음: $DEPLOY_DIR" >&2
  echo "  CLAUDE.md 배포 가이드 참조 — loan-app-next 클론 필요" >&2
  exit 1
fi

rollback_alias() {
  if [[ -f "$DEPLOY_DIR/.last-ready-deploy.txt" ]]; then
    local prev
    prev=$(cat "$DEPLOY_DIR/.last-ready-deploy.txt")
    if [[ -n "$prev" ]]; then
      echo "↩ alias 자동 롤백: $PROD_ALIAS → $prev" >&2
      (cd "$DEPLOY_DIR" && npx vercel alias set "$prev" "$PROD_ALIAS" 2>&1 | tail -3) || \
        echo "  ⚠ 롤백 실패 — 수동 복구 필요: npx vercel alias set <이전url> $PROD_ALIAS" >&2
    fi
  fi
}

echo "== 0/5 현재 Ready 배포 URL 백업 (롤백용) =="
# 최신 Vercel CLI: 테이블은 stderr. 2>&1 로 합쳐야 Ready/URL 모두 같은 줄에서 파싱 가능.
PREV_DEPLOY=$(cd "$DEPLOY_DIR" && npx vercel ls --prod 2>&1 \
  | grep -E '● Ready' \
  | head -1 \
  | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' \
  | head -1 || echo "")
if [[ -n "$PREV_DEPLOY" ]]; then
  echo "  현재 Ready: $PREV_DEPLOY"
  echo "$PREV_DEPLOY" > "$DEPLOY_DIR/.last-ready-deploy.txt"
else
  echo "  ⚠ 이전 Ready 배포를 찾을 수 없음 — 롤백 불가, 신중히 진행"
fi

echo ""
echo "== 1/5 app/ → loan-app-next 전체 동기화 =="
if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete \
    --exclude=node_modules \
    --exclude=.next \
    --exclude=.vercel \
    --exclude=test-*.mjs \
    --exclude=test-*.ts \
    --exclude=fetch_*.mjs \
    --exclude=gen-*.mjs \
    "$APP_DIR/src/" "$DEPLOY_DIR/src/"
  # vercel.json은 src/ 외부에 있어 src 동기화에 포함 안 됨 → 별도 복사 (region 설정 등)
  if [[ -f "$APP_DIR/vercel.json" ]]; then
    cp "$APP_DIR/vercel.json" "$DEPLOY_DIR/vercel.json"
    echo "  ✓ vercel.json 복사: $(cat "$APP_DIR/vercel.json" | tr -d '\n' | head -c 80)"
  fi
else
  # Windows Git Bash fallback — rsync 미제공 시 robocopy /MIR 사용.
  # /MIR = --delete 동등 (대상에만 있는 파일 제거)
  # robocopy는 성공 시에도 exit 1~7 반환 → || true로 흡수
  echo "  ⚠ rsync 없음 — Windows robocopy /MIR fallback"
  if ! command -v cygpath >/dev/null 2>&1; then
    echo "✗ cygpath 없음 — Git Bash 환경 확인 필요" >&2; exit 1
  fi
  src_win=$(cygpath -w "$APP_DIR/src")
  dst_win=$(cygpath -w "$DEPLOY_DIR/src")
  powershell.exe -NoProfile -Command "robocopy '$src_win' '$dst_win' /MIR /XD node_modules .next .vercel /XF test-*.mjs test-*.ts fetch_*.mjs gen-*.mjs /NFL /NDL /NJH /NJS /R:1 /W:1; if (\$LASTEXITCODE -ge 8) { exit 1 } else { exit 0 }"
  # vercel.json 별도 복사 (robocopy 분기에서도 동일)
  if [[ -f "$APP_DIR/vercel.json" ]]; then
    cp "$APP_DIR/vercel.json" "$DEPLOY_DIR/vercel.json"
    echo "  ✓ vercel.json 복사: $(cat "$APP_DIR/vercel.json" | tr -d '\n' | head -c 80)"
  fi
fi

echo ""
echo "== 2/5 Vercel 프로덕션 배포 =="
cd "$DEPLOY_DIR"
npx vercel --prod

echo ""
echo "== 3/5 Ready 대기 (최대 120초) =="
# 최신 CLI는 테이블 출력 — 헤더/메시지 여러 줄 이후에 데이터 등장. head -5 로는 데이터 못 잡음.
# "Production" 컬럼이 있는 *프로덕션 배포 데이터 줄*에서 ● 상태 추출.
READY=false
for i in $(seq 1 24); do
  # 최신 Vercel CLI: 테이블은 stderr에 찍힘. 2>&1 로 합쳐야 파싱 가능.
  # --prod 플래그로 프로덕션 배포만 나열되므로 첫 ● 상태 = 최신 프로덕션 배포 상태.
  status=$(npx vercel ls --prod 2>&1 \
    | grep -oE '● [A-Za-z]+' \
    | head -1 \
    || echo "● Unknown")
  echo "  [$((i*5))s] 상태: $status"
  if [[ "$status" == "● Ready" ]]; then
    READY=true
    break
  fi
  if [[ "$status" == "● Error" ]]; then
    echo "✗ 배포 에러 — 롤백 후 로그 확인" >&2
    rollback_alias
    exit 3
  fi
  sleep 5
done

if [[ "$READY" != "true" ]]; then
  echo "⚠ 120초 내 Ready 확정 실패 — 롤백" >&2
  rollback_alias
  exit 2
fi

echo ""
echo "== 4/5 라우트 헬스체크 ($PROD_ALIAS) =="
# alias 전파 대기
sleep 30

FAILED_ROUTES=()
for entry in "${HEALTH_CHECKS[@]}"; do
  path="${entry%=*}"
  allowed="${entry#*=}"
  code=$(curl -sk -o /dev/null -w "%{http_code}" "https://$PROD_ALIAS$path" --max-time 30 --insecure 2>/dev/null || echo "000")
  if [[ ",$allowed," == *",$code,"* ]]; then
    echo "  ✓ $path → $code (허용: $allowed)"
  else
    echo "  ✗ $path → $code (허용: $allowed) — 실패"
    FAILED_ROUTES+=("$path($code)")
  fi
done

# 바디 검증 — 200 OK여도 내용이 틀리면 실패 처리
for entry in "${HEALTH_BODY_ASSERTIONS[@]}"; do
  path="${entry%=*}"
  expected="${entry#*=}"
  body=$(curl -sk "https://$PROD_ALIAS$path" --max-time 30 --insecure 2>/dev/null || echo "")
  if echo "$body" | grep -qF "$expected"; then
    echo "  ✓ $path body contains: $expected"
  else
    echo "  ✗ $path body missing: $expected — 실패"
    FAILED_ROUTES+=("$path(body)")
  fi
done

if [[ ${#FAILED_ROUTES[@]} -gt 0 ]]; then
  echo ""
  echo "✗ 라우트 헬스체크 실패: ${FAILED_ROUTES[*]}" >&2
  rollback_alias
  exit 4
fi

echo ""
echo "== 5/5 완료 =="
echo "✓ 배포 + 헬스체크 통과 — $PROD_ALIAS 서비스 정상"
exit 0
