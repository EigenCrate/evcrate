#!/usr/bin/env bash
# Script to grant executable permissions to EVCrate binaries and shell scripts
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "Setting executable permissions..."

# CLI entrypoints and installers
[ -f "dist/cli/evcrate.js" ] && chmod +x "dist/cli/evcrate.js" 2>/dev/null || true
[ -f "install.sh" ] && chmod +x "install.sh" 2>/dev/null || true

# Advisor controller binary
if [ -f ".evcrate/source/.evcrate/bin/evcrate-advisor" ]; then
  chmod +x ".evcrate/source/.evcrate/bin/evcrate-advisor" 2>/dev/null || true
fi

# Shell scripts and executables across projections and scripts
find scripts -name "*.sh" -exec chmod +x {} + 2>/dev/null || true
if [ -d ".evcrate/source" ]; then
  find .evcrate/source -type f \( -name "*.sh" -o -name "*.cjs" -o -name "evcrate-advisor" \) -exec chmod +x {} + 2>/dev/null || true
fi

echo "Executable permissions successfully granted."
