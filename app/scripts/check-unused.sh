#!/usr/bin/env bash
# Dead code 감지 스크립트 (knip 래퍼)
# 사용법: ./scripts/check-unused.sh
#
# 미사용 export / 미사용 파일 / 미사용 의존성을 보고.
# 삭제 전 안전 heuristic — 0 import 확인용.
# 참고: 2026-04-21 app/src/lib/firebase.ts 삭제가 이 도구 없이 수동으로 수행됨.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$APP_DIR"

echo "== Dead code 감지 (knip) =="
if ! npx --no-install knip --version >/dev/null 2>&1; then
  echo "  knip 미설치 — 설치 후 실행합니다 (npm install --save-dev knip)"
  npm install --save-dev knip
fi

# --reporter compact: 테이블 형식. 명시적 knip.json 없어도 기본값으로 동작.
npx knip --reporter compact || {
  code=$?
  # knip은 발견 시 exit 1 반환 — 정상 동작. exit 0으로 감싸면 CI에서 실패 감지 못 하므로 그대로 유지.
  echo ""
  echo "⚠ 미사용 코드 감지됨. 삭제 전 반드시 import 경로 수동 재확인 (동적 import / re-export 체인 고려)"
  exit $code
}

echo ""
echo "✓ 미사용 코드 없음"
