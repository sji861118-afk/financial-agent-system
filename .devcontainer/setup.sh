#!/bin/bash
# Codespaces 초기 설정 스크립트
set -e

echo "🔧 Setting up development environment..."

# app (Next.js) 의존성 설치
cd /workspaces/*/app
npm install

# docx-generator 의존성 설치
cd /workspaces/*/docx-generator
npm install 2>/dev/null || true

echo "✅ Setup complete!"
echo ""
echo "시작하려면:"
echo "  cd app && npm run dev"
echo ""
echo "⚠️ .env.local 파일을 app/ 폴더에 생성해야 합니다."
echo "  app/.env.local.example을 참고하세요."
