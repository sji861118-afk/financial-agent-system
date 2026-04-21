#!/usr/bin/env bash
# Vercel 프로덕션 env 허용목록 감사
# 사용법: ./scripts/env-audit.sh
#
# app/.env.production.expected (허용목록)과 실제 Vercel prod env를 diff.
# 미승인 변수(허용목록에 없는데 Vercel에 있음) / 누락 변수(있어야 하는데 없음)
# 모두 감지. 보안 리뷰 + 신규 온보딩 체크리스트용.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$APP_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/loan-app-next"
EXPECTED_FILE="$APP_DIR/.env.production.expected"

if [[ ! -f "$EXPECTED_FILE" ]]; then
  echo "✗ 허용목록 없음: $EXPECTED_FILE" >&2
  exit 1
fi

if [[ ! -d "$DEPLOY_DIR" ]]; then
  echo "✗ 배포 디렉토리 없음: $DEPLOY_DIR" >&2
  exit 1
fi

# 허용목록: 주석(#)과 빈 줄 제외한 변수명만 추출
expected=$(grep -vE '^\s*(#|$)' "$EXPECTED_FILE" | sort -u)

# Vercel 실제: `vercel env ls production`에서 변수명 열만 추출
# 최신 CLI는 stderr에 테이블 출력 → 2>&1 병합 필요
actual=$(cd "$DEPLOY_DIR" && npx vercel env ls production 2>&1 \
  | awk '/[[:space:]]Encrypted[[:space:]]|[[:space:]]Plain[[:space:]]/ {print $1}' \
  | sort -u)

echo "== Vercel production env 감사 =="
echo ""

missing=$(comm -23 <(echo "$expected") <(echo "$actual") | grep -v '^$' || true)
extra=$(comm -13 <(echo "$expected") <(echo "$actual") | grep -v '^$' || true)

if [[ -n "$missing" ]]; then
  echo "✗ 누락 (허용목록에 있으나 Vercel에 없음):"
  echo "$missing" | sed 's/^/  - /'
  echo ""
fi

if [[ -n "$extra" ]]; then
  echo "⚠ 미승인 (Vercel에 있으나 허용목록에 없음):"
  echo "$extra" | sed 's/^/  - /'
  echo ""
fi

if [[ -z "$missing" && -z "$extra" ]]; then
  echo "✓ 허용목록과 Vercel prod env 일치"
  exit 0
fi

[[ -n "$missing" ]] && exit 2
exit 1
