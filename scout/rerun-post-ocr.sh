#!/bin/bash
# rerun-post-ocr.sh
# After OCR completes: migrate results, rerun all affected phases P6→P12
# Usage: bash rerun-post-ocr.sh "Ashwagandha Gummies"

set -e
KEYWORD="${1:-Ashwagandha Gummies}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "════════════════════════════════════════════════"
echo "  POST-OCR RERUN — \"$KEYWORD\""
echo "  Phases: migrate-ocr → P6 → P7 → P8 → P9 → P10 → P11"
echo "════════════════════════════════════════════════"
echo ""

run_phase() {
  local name="$1"; shift
  echo ""
  echo "────────────────────────────────────────────────"
  echo "  RUNNING: $name"
  echo "────────────────────────────────────────────────"
  node "$@"
  echo "  ✅ $name DONE"
}

# 1. Migrate OCR results to Lovable DASH
run_phase "Migrate OCR → DASH" migrate-ocr-to-dash.js --keyword "$KEYWORD"

# 2. Migrate reviews (refresh)
run_phase "Migrate Reviews → DASH" migrate-reviews-to-dash.js --keyword "$KEYWORD"

# 3. P6 Product Intelligence (uses OCR data for formula landscape)
run_phase "P6 Product Intelligence" phase6-product-intelligence.js --keyword "$KEYWORD" --force

# 4. P7 Market Analysis
run_phase "P7 Market Intelligence" phase6-market-analysis.js --keyword "$KEYWORD" --force

# 5. P8 Packaging Intelligence
run_phase "P8 Packaging Intelligence" phase7-packaging-intelligence.js --keyword "$KEYWORD" --force

# 6. P9 Formula Brief (with Grok retry)
run_phase "P9 Formula Brief (dual-AI)" phase8-formula-brief.js --keyword "$KEYWORD" --force

# 7. P10 Formula QA
run_phase "P10 Formula QA" phase9-formula-qa.js --keyword "$KEYWORD" --force

# 8. P11 Competitive Benchmarking
run_phase "P11 Competitive Benchmarking" phase10-competitive-benchmarking.js --keyword "$KEYWORD" --force

# 9. P12 FDA Compliance
run_phase "P12 FDA Compliance" phase11-fda-compliance.js --keyword "$KEYWORD" --force

echo ""
echo "════════════════════════════════════════════════"
echo "  ALL PHASES COMPLETE — \"$KEYWORD\""
echo "════════════════════════════════════════════════"
