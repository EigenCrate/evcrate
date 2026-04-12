#!/bin/bash

# Configuration
# Use the directory where the script is located as the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEVKIT_DIR="${DEVKIT_DIR:-$SCRIPT_DIR}"
TARGET_GEMINI="$HOME/.gemini"
TARGET_CLAUDE="$HOME/.claude"

echo "🚀 Starting distribution from $DEVKIT_DIR..."

# 1. Ensure .gemini is up to date by running the migration script
if [ -f "$DEVKIT_DIR/migrate_claude_to_gemini.py" ]; then
    echo "🔄 Syncing .claude -> .gemini changes..."
    # Running migration to ensure latest patterns and models are applied
    python3 "$DEVKIT_DIR/migrate_claude_to_gemini.py"
else
    echo "⚠️ Warning: migrate_claude_to_gemini.py not found. Skipping project-level migration."
fi

# 2. Distribute .gemini (Primary)
if [ -d "$DEVKIT_DIR/.gemini" ]; then
    echo "🧹 Cleaning global Gemini directory: $TARGET_GEMINI"
    rm -rf "$TARGET_GEMINI"
    mkdir -p "$TARGET_GEMINI"
    
    echo "📦 Copying .gemini items..."
    cp -rv "$DEVKIT_DIR/.gemini/." "$TARGET_GEMINI/"
else
    echo "❌ Error: $DEVKIT_DIR/.gemini not found. Migration may have failed."
    exit 1
fi

# 3. Distribute .claude (Legacy Support)
if [ -d "$DEVKIT_DIR/.claude" ]; then
    echo "📦 Syncing legacy .claude items to $TARGET_CLAUDE..."
    rm -rf "$TARGET_CLAUDE"
    mkdir -p "$TARGET_CLAUDE"
    cp -rv "$DEVKIT_DIR/.claude/." "$TARGET_CLAUDE/"
fi

echo "✅ Distribution complete! Your global configurations are now synced with devkit."
echo "   Model set to: $(grep '"name":' "$TARGET_GEMINI/settings.json" | cut -d'"' -f4)"
