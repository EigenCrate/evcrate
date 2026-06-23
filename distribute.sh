#!/bin/bash
set -euo pipefail

# Configuration
# Use the directory where the script is located as the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEVKIT_DIR="${DEVKIT_DIR:-$SCRIPT_DIR}"
TARGET_GEMINI="$HOME/.gemini"
TARGET_CLAUDE="$HOME/.claude"
TARGET_CODEX="$HOME/.codex"
TARGET_AGENTS="$HOME/.agents"
TARGET_AGY_CONFIG="$HOME/.gemini/config"
CODEX_STAGE="${CODEX_STAGE:-/tmp/devkit-codex-migration}"
GEMINI_GLOBAL_MODE="${GEMINI_GLOBAL_MODE:-config-and-scripts}"
DEVKIT_GLOBAL_SYNC_MODE="${DEVKIT_GLOBAL_SYNC_MODE:-managed}"

resolve_bin() {
    local name="$1"
    type -P "$name" 2>/dev/null || true
}

reset_dir_contents() {
    local target_dir="$1"
    mkdir -p "$target_dir"
    python3 - "$target_dir" <<'PY'
import shutil
import sys
from pathlib import Path

target = Path(sys.argv[1])
for child in target.iterdir():
    if child.is_dir() and not child.is_symlink():
        shutil.rmtree(child)
    else:
        child.unlink()
PY
}

remove_managed_paths() {
    local target_dir="$1"
    shift

    mkdir -p "$target_dir"
    for rel_path in "$@"; do
        rm -rf "$target_dir/$rel_path"
    done
}

sync_tree() {
    local source_dir="$1"
    local target_dir="$2"

    mkdir -p "$target_dir"
    cp -rv "$source_dir/." "$target_dir/"
}

write_codex_runtime_env() {
    local runtime_file="$1"
    local node_bin=""

    node_bin="$(resolve_bin node)"
    if [ -z "$node_bin" ]; then
        node_bin="$(resolve_bin nodejs)"
    fi

    cat > "$runtime_file" <<EOF
CODEX_NODE_BIN="${node_bin}"
CODEX_NPX_BIN="$(resolve_bin npx)"
CODEX_PNPM_BIN="$(resolve_bin pnpm)"
CODEX_BUNX_BIN="$(resolve_bin bunx)"
CODEX_YARN_BIN="$(resolve_bin yarn)"
CODEX_COREPACK_BIN="$(resolve_bin corepack)"
EOF
}

rewrite_codex_global_paths() {
    local target_codex="$1"
    TARGET_CODEX_FOR_PY="$target_codex" python3 <<'PY'
import json
import os
import shlex
from pathlib import Path

target = Path(os.environ["TARGET_CODEX_FOR_PY"]).resolve()

hooks_path = target / "hooks.json"
if hooks_path.exists():
    data = json.loads(hooks_path.read_text(encoding="utf-8"))
    local_prefix = '"$CODEX_PROJECT_DIR"/.codex/hooks'
    global_prefix = shlex.quote(str(target / "hooks"))
    for groups in data.get("hooks", {}).values():
        for group in groups:
            for hook in group.get("hooks", []):
                command = hook.get("command")
                if isinstance(command, str):
                    hook["command"] = command.replace(local_prefix, global_prefix)
    hooks_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

config_path = target / "config.toml"
if config_path.exists():
    wrapper = json.dumps(str(target / "bin" / "run-mcp-package.sh"))
    lines = []
    for line in config_path.read_text(encoding="utf-8").splitlines():
        if line.strip() == 'command = ".codex/bin/run-mcp-package.sh"':
            lines.append(f"command = {wrapper}")
        else:
            lines.append(line)
    config_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
PY
}

rewrite_agy_global_paths() {
    local target_agy="$1"
    TARGET_AGY_FOR_PY="$target_agy" python3 <<'PY'
import json
import os
import shlex
from pathlib import Path

target = Path(os.environ["TARGET_AGY_FOR_PY"]).resolve()

hooks_path = target / "hooks.json"
if hooks_path.exists():
    data = json.loads(hooks_path.read_text(encoding="utf-8"))
    local_prefix = '"$CODEX_PROJECT_DIR"/.codex/hooks'
    local_prefix_agy = '"$AGY_PROJECT_DIR"/.gemini/config/hooks'
    global_prefix = shlex.quote(str(target / "hooks"))
    for groups in data.get("hooks", {}).values():
        for group in groups:
            for hook in group.get("hooks", []):
                command = hook.get("command")
                if isinstance(command, str):
                    command = command.replace(local_prefix, global_prefix).replace(local_prefix_agy, global_prefix)
                    hook["command"] = command
    hooks_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
PY
}

echo "🚀 Starting distribution from $DEVKIT_DIR..."
echo "   Global sync mode: $DEVKIT_GLOBAL_SYNC_MODE"
if [ "$DEVKIT_GLOBAL_SYNC_MODE" != "managed" ] && [ "$DEVKIT_GLOBAL_SYNC_MODE" != "full" ]; then
    echo "❌ Error: DEVKIT_GLOBAL_SYNC_MODE must be 'managed' or 'full'."
    exit 1
fi

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
import re
from pathlib import Path

settings_path = Path(sys.argv[1])
hook_root = str(Path(sys.argv[2]) / "hooks")
data = json.loads(settings_path.read_text(encoding="utf-8"))

for event_groups in data.get("hooks", {}).values():
    for group in event_groups:
        for hook in group.get("hooks", []):
            command = hook.get("command")
            if isinstance(command, str):
                # Handle both quoted and unquoted project dir with or without node prefix
                # node "$GEMINI_PROJECT_DIR"/.gemini/hooks -> ~/.gemini/hooks
                # node $GEMINI_PROJECT_DIR/.gemini/hooks -> ~/.gemini/hooks
                # "$GEMINI_PROJECT_DIR"/.gemini/hooks -> ~/.gemini/hooks
                # $GEMINI_PROJECT_DIR/.gemini/hooks -> ~/.gemini/hooks
                
                command = re.sub(
                    r'(?:node\s+)?\"?\$GEMINI_PROJECT_DIR\"?/\.gemini/hooks',
                    hook_root,
                    command
                )
                hook["command"] = command

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
    if [ "$DEVKIT_GLOBAL_SYNC_MODE" = "full" ]; then
        echo "🧹 Fully replacing global Codex directory: $TARGET_CODEX"
        reset_dir_contents "$TARGET_CODEX"
    else
        echo "🧹 Removing managed Codex assets only: $TARGET_CODEX"
        remove_managed_paths "$TARGET_CODEX" \
            agents \
            bin \
            commands \
            hooks \
            workflows \
            config.toml \
            global-guidance.md \
            hooks.json \
            migration-behavior-matrix.json
    fi

    echo "📦 Copying .codex items..."
    sync_tree "$CODEX_SOURCE" "$TARGET_CODEX"
    write_codex_runtime_env "$TARGET_CODEX/runtime.env"
    rewrite_codex_global_paths "$TARGET_CODEX"
else
    echo "⚠️ Warning: Codex source not found. Codex migration may have failed."
fi

if [ -d "$AGENTS_SOURCE" ]; then
    if [ "$DEVKIT_GLOBAL_SYNC_MODE" = "full" ]; then
        echo "🧹 Fully replacing global Codex agents directory: $TARGET_AGENTS"
        reset_dir_contents "$TARGET_AGENTS"
    else
        echo "🧹 Removing managed Codex agents assets only: $TARGET_AGENTS"
        remove_managed_paths "$TARGET_AGENTS" skills
    fi

    echo "📦 Copying .agents items..."
    sync_tree "$AGENTS_SOURCE" "$TARGET_AGENTS"
else
    echo "⚠️ Warning: Codex agents source not found. Codex skills migration may have failed."
fi

# 2c. Distribute to .gemini/config for Antigravity CLI (agy)
if [ -d "$CODEX_SOURCE" ]; then
    if [ "$DEVKIT_GLOBAL_SYNC_MODE" = "full" ]; then
        echo "🧹 Fully replacing global Antigravity config directory: $TARGET_AGY_CONFIG"
        reset_dir_contents "$TARGET_AGY_CONFIG"
    else
        echo "🧹 Removing managed Antigravity config assets only: $TARGET_AGY_CONFIG"
        remove_managed_paths "$TARGET_AGY_CONFIG" \
            agents \
            bin \
            commands \
            hooks \
            workflows \
            hooks.json \
            skills \
            migration-behavior-matrix.json \
            global-guidance.md
    fi

    echo "📦 Copying .codex items to Antigravity config..."
    sync_tree "$CODEX_SOURCE" "$TARGET_AGY_CONFIG"
    write_codex_runtime_env "$TARGET_AGY_CONFIG/runtime.env"
    rewrite_agy_global_paths "$TARGET_AGY_CONFIG"
else
    echo "⚠️ Warning: Codex source not found. Antigravity config migration may have failed."
fi

if [ -d "$AGENTS_SOURCE" ]; then
    echo "📦 Copying .agents items to Antigravity config..."
    sync_tree "$AGENTS_SOURCE" "$TARGET_AGY_CONFIG"
fi

if [ -d "$AGENTS_SOURCE/skills" ]; then
    if find "$AGENTS_SOURCE/skills" -maxdepth 1 -type d -name 'cmd_*' | grep -q .; then
        echo "ℹ️ Reusing migrated cmd_* skills from $AGENTS_SOURCE for Antigravity."
    elif [ -d "$DEVKIT_DIR/.claude/commands" ]; then
        echo "📦 Converting legacy .claude slash commands to Antigravity skills (fallback)..."
        python3 - "$DEVKIT_DIR" "$TARGET_AGY_CONFIG" <<'PY'
import sys
from pathlib import Path

source_dir = Path(sys.argv[1]) / ".claude" / "commands"
target_skills = Path(sys.argv[2]) / "skills"
target_skills.mkdir(parents=True, exist_ok=True)

if source_dir.exists():
    for md_file in source_dir.rglob("*.md"):
        rel_path = md_file.relative_to(source_dir).with_suffix("")
        cmd_name = str(rel_path).replace("\\", "/")

        content = md_file.read_text(encoding="utf-8")
        desc = "Migrated command from .claude"
        for line in content.splitlines():
            if line.startswith("Description:"):
                desc = line[len("Description:"):].strip()
                break

        skill_dir_name = "cmd_" + str(rel_path).replace("\\", "_").replace("/", "_")
        skill_dir = target_skills / skill_dir_name
        skill_dir.mkdir(parents=True, exist_ok=True)

        skill_content = (
            f"---\nname: {skill_dir_name}\ndescription: {desc}\n---\n"
            f"# {skill_dir_name}\n\n"
            f"Command Path: /{cmd_name}\n\n"
            f"Description: {desc}\n\n"
            f"{content}"
        )
        (skill_dir / "SKILL.md").write_text(skill_content, encoding="utf-8")
PY
    fi
fi

# 3. Distribute .claude (Legacy Support)
if [ -d "$DEVKIT_DIR/.claude" ]; then
    echo "📦 Syncing legacy .claude items to $TARGET_CLAUDE..."
    if [ "$DEVKIT_GLOBAL_SYNC_MODE" = "full" ]; then
        echo "🧹 Fully replacing legacy Claude directory: $TARGET_CLAUDE"
        rm -rf "$TARGET_CLAUDE"
        mkdir -p "$TARGET_CLAUDE"
    else
        echo "🧹 Removing managed Claude assets only: $TARGET_CLAUDE"
        remove_managed_paths "$TARGET_CLAUDE" \
            agents \
            commands \
            hooks \
            scripts \
            skills \
            workflows \
            settings.json \
            .mcp.json.example \
            statusline.cjs
    fi
    sync_tree "$DEVKIT_DIR/.claude" "$TARGET_CLAUDE"
fi

echo "✅ Distribution complete! Your global configurations are now synced with devkit."
echo "   Model set to: $(python3 - "$TARGET_GEMINI/settings.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)

print(data.get("model", {}).get("name", "unknown"))
PY
)"
if [ -f "$TARGET_CODEX/config.toml" ]; then
    echo "   Codex model set to: $(grep '^model = ' "$TARGET_CODEX/config.toml" | head -1 | cut -d'"' -f2)"
fi
