#!/usr/bin/env bash
# Firestore 보안 규칙 배포 스크립트
# 사용법: ./scripts/firebase-rules.sh
#
# Firebase Console 직접 편집 대신 이 스크립트로만 규칙을 변경.
# 이유: git 추적된 firestore.rules가 source of truth이어야 하고,
# Console 편집은 이력 추적이 어려우며 실수로 테스트 모드 규칙으로
# 되돌리는 사고를 막기 위해.
#
# 사전 조건:
#   npm install -g firebase-tools
#   firebase login
#
# 이 스크립트는 프로젝트 루트의 firestore.rules 파일을
# loan-app-180d1 프로젝트의 (default) 데이터베이스에 게시합니다.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RULES_FILE="$PROJECT_ROOT/firestore.rules"

if [[ ! -f "$RULES_FILE" ]]; then
  echo "✗ firestore.rules 파일 없음: $RULES_FILE" >&2
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "✗ firebase CLI 미설치 — 'npm install -g firebase-tools' 먼저 실행" >&2
  exit 1
fi

echo "== Firestore 규칙 배포 =="
echo "  파일: $RULES_FILE"
echo "  프로젝트: loan-app-180d1 (default 데이터베이스)"
echo ""

cd "$PROJECT_ROOT"
firebase deploy --only firestore:rules

echo ""
echo "✓ 배포 완료 — Firebase Console에서 버전 이력 확인 가능"
