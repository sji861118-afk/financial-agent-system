#!/usr/bin/env bash
# Node v24 strip-types 래퍼 — tsx 대신 이 스크립트로 .mjs 테스트 실행
# 사용법: ./scripts/run-ts-test.sh test-X.mjs [추가 인자...]
#
# 배경:
#   Node 24의 native TypeScript 지원(--experimental-strip-types)과 tsx가 충돌해
#   tsx로 .mjs에서 .ts 모듈을 import하면 export 인식 실패.
#   우회: node에서 직접 실행하고 --no-warnings로 파싱 경고 억제.
#   상대 import는 .ts 확장자 명시 + `// @ts-expect-error TS5097` 필요.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "사용법: $0 <test-file.mjs> [args...]" >&2
  echo "예: $0 test-appraisal-e2e.mjs" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

exec node --experimental-strip-types --no-warnings "$@"
