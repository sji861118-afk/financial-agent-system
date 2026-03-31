#!/bin/bash
# DOCX 생성 + 내용 검증 스크립트
# Usage: bash scripts/verify-docx.sh [keyword1,keyword2,...]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📄 Generating DOCX..."
cd "$ROOT_DIR/docx-generator"
npx tsx cli.ts 2>&1

# Find the latest generated file
DOCX=$(ls -t 02_초안출력/*.docx 2>/dev/null | head -1)
if [ -z "$DOCX" ]; then
  echo "❌ No DOCX file found"
  exit 1
fi
echo "📁 File: $DOCX ($(du -h "$DOCX" | cut -f1))"

# Extract and verify
TMPDIR=$(mktemp -d)
cp "$DOCX" "$TMPDIR/test.zip"
powershell Expand-Archive -Force -Path "$TMPDIR/test.zip" -DestinationPath "$TMPDIR/out" 2>/dev/null
XML="$TMPDIR/out/word/document.xml"

if [ ! -f "$XML" ]; then
  echo "❌ Failed to extract document.xml"
  exit 1
fi

# Stats
PARAGRAPHS=$(grep -o '<w:p[ >]' "$XML" | wc -l)
TABLES=$(grep -o '<w:tbl[ >]' "$XML" | wc -l)
BREAKS=$(grep -o '<w:br w:type="page"' "$XML" | wc -l)
echo "📊 Stats: ${PARAGRAPHS} paragraphs, ${TABLES} tables, ${BREAKS} page breaks"

# Section titles
echo ""
echo "📋 Sections:"
grep -oP '<w:t[^>]*>■[^<]+</w:t>' "$XML" | sed 's/<[^>]*>//g' | while read -r title; do
  echo "  $title"
done

# Keyword verification
KEYWORDS="${1:-삼일회계법인,FCFE,LTV,인출선행조건,기한이익상실,연결재무,대손충당금,Peer Group}"
echo ""
echo "🔍 Keyword check:"
IFS=',' read -ra KW_ARRAY <<< "$KEYWORDS"
PASS=0
FAIL=0
for kw in "${KW_ARRAY[@]}"; do
  if grep -q "$kw" "$XML"; then
    echo "  ✅ $kw"
    ((PASS++))
  else
    echo "  ❌ $kw"
    ((FAIL++))
  fi
done
echo ""
echo "Result: $PASS passed, $FAIL failed"

# Cleanup
rm -rf "$TMPDIR"
