#!/usr/bin/env bash
# regression-baseline.sh — 9사 회귀 검증 baseline 생성/비교 wrapper
#
# JWT_SECRET drift 회피 — production env과 분리된 secret을 별도 파일에 저장하고
# 거기서 읽어옴. ~/.config/loan-app-next/regression.env (gitignored, 사용자가 1회 설정).
#
# 사용:
#   ./regression-baseline.sh              # 비교 모드 (default)
#   ./regression-baseline.sh --baseline   # baseline 갱신
#   ./regression-baseline.sh --local      # localhost:3000 사용 (dev server 띄운 상태)
#
# 최초 1회 설정:
#   mkdir -p ~/.config/loan-app-next
#   cat > ~/.config/loan-app-next/regression.env <<EOF
#   # production JWT_SECRET (vercel env pull production 후 .env에서 추출)
#   JWT_SECRET=<actual-production-secret>
#   # 또는 local 모드는 default와 같음
#   # JWT_SECRET=loan-app-jwt-secret-key-2024-change-in-production
#   EOF
#   chmod 600 ~/.config/loan-app-next/regression.env

set -euo pipefail

ENV_FILE="${HOME}/.config/loan-app-next/regression.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="${SCRIPT_DIR}/regression-check.mjs"

ARGS=()
USE_LOCAL=0

for arg in "$@"; do
  case "$arg" in
    --local)
      USE_LOCAL=1
      ;;
    *)
      ARGS+=("$arg")
      ;;
  esac
done

if [[ ! -f "$NODE_SCRIPT" ]]; then
  echo "❌ regression-check.mjs 없음: $NODE_SCRIPT" >&2
  exit 1
fi

if [[ "$USE_LOCAL" -eq 1 ]]; then
  ARGS+=("--base=http://localhost:3000")
  echo "🔧 local mode — dev server 동작 중인지 확인 (http://localhost:3000)"
  # default secret은 코드 fallback과 일치 — env 파일 불필요
else
  if [[ ! -f "$ENV_FILE" ]]; then
    cat <<EOF >&2
❌ env 파일 없음: $ENV_FILE

production 회귀 검증을 위해 1회 설정 필요:

  mkdir -p ~/.config/loan-app-next
  cat > $ENV_FILE <<'INNER_EOF'
JWT_SECRET=<production secret here>
INNER_EOF
  chmod 600 $ENV_FILE

production secret 확인: cd app && npx vercel env pull --environment=production
.env에서 JWT_SECRET 라인을 위 파일로 옮긴 후 .env 삭제.

또는 --local 옵션으로 localhost dev server에서 baseline 생성 가능.
EOF
    exit 1
  fi
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  if [[ -z "${JWT_SECRET:-}" ]]; then
    echo "❌ $ENV_FILE 에 JWT_SECRET 미설정" >&2
    exit 1
  fi
  export JWT_SECRET
fi

echo "🔍 regression-check.mjs 실행 (mode=$([ ${#ARGS[@]} -gt 0 ] && echo "${ARGS[*]}" || echo "compare"))"
exec node "$NODE_SCRIPT" "${ARGS[@]}"
