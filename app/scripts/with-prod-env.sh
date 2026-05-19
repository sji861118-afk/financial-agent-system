#!/usr/bin/env bash
# Vercel production env를 안전하게 가져와서 임시로 명령에 주입한 후 자동 정리.
#
# 문제: `npx vercel env pull .env.vercel-production` 후 작업하다 `rm` 까먹으면
#       secrets 파일이 디스크에 남음. 한 세션에서 7+ 회 반복되는 패턴 + 보안 위험.
#
# 해결: mktemp + EXIT trap. 자식 프로세스는 환경변수로만 접근, 디스크에 영구 저장 X.
#
# 사용:
#   ./app/scripts/with-prod-env.sh node app/scripts/regression-check.mjs
#   ./app/scripts/with-prod-env.sh -- node -e "console.log(process.env.JWT_SECRET?.length)"
#   ./app/scripts/with-prod-env.sh tsx app/scripts/diag-something.mts <args>
#
# 필요: npx vercel CLI 로그인 + 해당 프로젝트 권한
#
# 동작:
#   1. mktemp으로 임시 .env 파일 생성
#   2. cd loan-app-next && npx vercel env pull <임시파일> --environment=production
#   3. node --env-file=<임시파일> "$@" (또는 set -a; source; set +a 후 exec)
#   4. EXIT trap으로 임시파일 자동 삭제 (script crash나 Ctrl+C 포함)

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $(basename "$0") <command> [args...]"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") node app/scripts/regression-check.mjs"
  echo "  $(basename "$0") tsx app/scripts/diag-baseline-local.mts 롯데건설"
  echo ""
  echo "JWT_SECRET을 환경변수로 주입한 후 자식 프로세스 실행. 종료 시 임시 env 파일 자동 삭제."
  exit 1
fi

# stop-parsing argument 지원: with-prod-env.sh -- node -e "..."
if [ "$1" = "--" ]; then
  shift
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERCEL_DIR="$PROJECT_ROOT/loan-app-next"

if [ ! -d "$VERCEL_DIR" ]; then
  echo "ERROR: $VERCEL_DIR 디렉토리 없음. deploy.sh가 한번이라도 실행됐는지 확인." >&2
  exit 1
fi

# 임시 env 파일 (Windows Git Bash 호환 — TMPDIR 또는 /tmp)
TMP_ENV="$(mktemp -t with-prod-env.XXXXXX)"

# 종료 시 무조건 삭제 (정상/에러/Ctrl+C 모두)
cleanup() {
  if [ -f "$TMP_ENV" ]; then
    rm -f "$TMP_ENV"
  fi
}
trap cleanup EXIT INT TERM

# Vercel env pull — vercel CLI는 --env-file을 지원하지 않으므로 vercel 디렉토리에서 실행 후 이동
(
  cd "$VERCEL_DIR"
  npx vercel env pull "$TMP_ENV" --environment=production --yes >/dev/null 2>&1
) || {
  echo "ERROR: vercel env pull 실패. 'npx vercel login' 또는 프로젝트 권한 확인." >&2
  exit 1
}

if [ ! -s "$TMP_ENV" ]; then
  echo "ERROR: env 파일이 비어있음." >&2
  exit 1
fi

# 자식 프로세스에 env 주입 — node 명령은 --env-file 옵션 사용, 그 외는 set -a / source / exec
case "$1" in
  node)
    # node는 --env-file 직접 지원 (Node 20.6+)
    exec node --env-file="$TMP_ENV" "${@:2}"
    ;;
  *)
    # tsx 등은 set -a → source → exec 패턴 (단, multiline value 깨질 위험 있음)
    set -a
    # shellcheck disable=SC1090
    source "$TMP_ENV" 2>/dev/null || true
    set +a
    exec "$@"
    ;;
esac
