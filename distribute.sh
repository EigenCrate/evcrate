#!/bin/bash

# Configuration
# Use the directory where the script is located as the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEVKIT_DIR="${DEVKIT_DIR:-$SCRIPT_DIR}"
TARGET_GEMINI="$HOME/.gemini"
TARGET_CLAUDE="$HOME/.claude"
TARGET_CODEX="$HOME/.codex"
TARGET_AGENTS="$HOME/.agents"
CODEX_STAGE="${CODEX_STAGE:-/tmp/devkit-codex-migration}"
GEMINI_GLOBAL_MODE="${GEMINI_GLOBAL_MODE:-config-and-scripts}"

echo "🚀 Starting distribution from $DEVKIT_DIR..."

# 1. Ensure .gemini is up to date by running the migration script
if [ -f "$DEVKIT_DIR/migrate_claude_to_gemini.py" ]; then
    echo "🔄 Syncing .claude -> .gemini changes..."
    # Running migration to ensure latest patterns and models are applied
    python3 "$DEVKIT_DIR/migrate_claude_to_gemini.py"
else
    echo "⚠️ Warning: migrate_claude_to_gemini.py not found. Skipping project-level migration."
fi

# 1b. Ensure .codex/.agents are up to date by running the Codex migration script
if [ -f "$DEVKIT_DIR/migrate_claude_to_codex.sh" ]; then
    echo "🔄 Syncing .claude -> .codex/.agents changes..."
    rm -rf "$CODEX_STAGE"
    mkdir -p "$CODEX_STAGE"
    CODEX_OUTPUT_DIR="$CODEX_STAGE/.codex" AGENTS_OUTPUT_DIR="$CODEX_STAGE/.agents" bash "$DEVKIT_DIR/migrate_claude_to_codex.sh"
elif [ -f "$DEVKIT_DIR/migrate_claude_to_codex.py" ]; then
    echo "🔄 Syncing .claude -> .codex/.agents changes..."
    rm -rf "$CODEX_STAGE"
    mkdir -p "$CODEX_STAGE"
    CODEX_OUTPUT_DIR="$CODEX_STAGE/.codex" AGENTS_OUTPUT_DIR="$CODEX_STAGE/.agents" python3 "$DEVKIT_DIR/migrate_claude_to_codex.py"
else
    echo "⚠️ Warning: migrate_claude_to_codex.sh not found. Skipping Codex migration."
fi

# 2. Distribute .gemini user-scoped assets.
# Avoid copying project commands/skills globally by default because Gemini CLI
# loads both workspace and user registries. Duplicating this devkit into
# ~/.gemini produces the /user.* and /workspace.* command renames and skill
# override warnings the user sees when running `gemini` inside this repo.
if [ -d "$DEVKIT_DIR/.gemini" ]; then
    mkdir -p "$TARGET_GEMINI"

    echo "🧹 Syncing global Gemini assets (mode: $GEMINI_GLOBAL_MODE)"
    if [ -f "$DEVKIT_DIR/.gemini/settings.json" ]; then
        cp -v "$DEVKIT_DIR/.gemini/settings.json" "$TARGET_GEMINI/settings.json"
        python3 - "$TARGET_GEMINI/settings.json" "$TARGET_GEMINI" <<'PY'
import json
import sys
from pathlib import Path

settings_path = Path(sys.argv[1])
hook_root = str(Path(sys.argv[2]) / "hooks")
data = json.loads(settings_path.read_text(encoding="utf-8"))

for event_groups in data.get("hooks", {}).values():
    for group in event_groups:
        for hook in group.get("hooks", []):
            command = hook.get("command")
            if isinstance(command, str):
                hook["command"] = command.replace(
                    "$GEMINI_PROJECT_DIR/.gemini/hooks",
                    hook_root,
                )

settings_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
PY
    fi

    if [ -d "$DEVKIT_DIR/.gemini/scripts" ]; then
        rm -rf "$TARGET_GEMINI/scripts"
        mkdir -p "$TARGET_GEMINI/scripts"
        cp -rv "$DEVKIT_DIR/.gemini/scripts/." "$TARGET_GEMINI/scripts/"
    fi

    if [ -d "$DEVKIT_DIR/.gemini/hooks" ]; then
        rm -rf "$TARGET_GEMINI/hooks"
        mkdir -p "$TARGET_GEMINI/hooks"
        cp -rv "$DEVKIT_DIR/.gemini/hooks/." "$TARGET_GEMINI/hooks/"
    fi

    if [ "$GEMINI_GLOBAL_MODE" = "full" ]; then
        for subdir in agents commands skills workflows; do
            if [ -d "$DEVKIT_DIR/.gemini/$subdir" ]; then
                rm -rf "$TARGET_GEMINI/$subdir"
                mkdir -p "$TARGET_GEMINI/$subdir"
                cp -rv "$DEVKIT_DIR/.gemini/$subdir/." "$TARGET_GEMINI/$subdir/"
            fi
        done
    else
        for subdir in agents commands skills workflows; do
            rm -rf "$TARGET_GEMINI/$subdir"
        done
        echo "ℹ️ Skipping ~/.gemini/{agents,commands,skills,workflows} to avoid user/workspace duplication."
        echo "   Hooks and scripts are still synced globally because they do not create duplicated command/skill registries."
        echo "   Use GEMINI_GLOBAL_MODE=full if you explicitly want global Gemini commands and skills."
    fi
else
    echo "❌ Error: $DEVKIT_DIR/.gemini not found. Migration may have failed."
    exit 1
fi

# 2b. Distribute .codex and .agents for Codex CLI
CODEX_SOURCE="$DEVKIT_DIR/.codex"
AGENTS_SOURCE="$DEVKIT_DIR/.agents"
if [ -d "$CODEX_STAGE/.codex" ]; then
    CODEX_SOURCE="$CODEX_STAGE/.codex"
fi
if [ -d "$CODEX_STAGE/.agents" ]; then
    AGENTS_SOURCE="$CODEX_STAGE/.agents"
fi

if [ -d "$CODEX_SOURCE" ]; then
    echo "🧹 Cleaning global Codex directory: $TARGET_CODEX"
    rm -rf "$TARGET_CODEX"
    mkdir -p "$TARGET_CODEX"

    echo "📦 Copying .codex items..."
    cp -rv "$CODEX_SOURCE/." "$TARGET_CODEX/"
else
    echo "⚠️ Warning: Codex source not found. Codex migration may have failed."
fi

if [ -d "$AGENTS_SOURCE" ]; then
    echo "🧹 Cleaning global Codex agents directory: $TARGET_AGENTS"
    rm -rf "$TARGET_AGENTS"
    mkdir -p "$TARGET_AGENTS"

    echo "📦 Copying .agents items..."
    cp -rv "$AGENTS_SOURCE/." "$TARGET_AGENTS/"
else
    echo "⚠️ Warning: Codex agents source not found. Codex skills migration may have failed."
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
if [ -f "$TARGET_CODEX/config.toml" ]; then
    echo "   Codex model set to: $(grep '^model = ' "$TARGET_CODEX/config.toml" | head -1 | cut -d'"' -f2)"
fi
