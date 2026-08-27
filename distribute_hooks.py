#!/usr/bin/env python3
import json
import os
import re
import shlex
import sys
from pathlib import Path


def _assert_no_symlink_ancestors(path: Path, label: str) -> None:
    current = path.parent
    while True:
        if current.is_symlink():
            raise RuntimeError(f"{label} has a symlinked ancestor: {path}")
        if current.parent == current:
            break
        current = current.parent


def _assert_safe_directory(path: Path, label: str) -> None:
    _assert_no_symlink_ancestors(path, label)
    if os.path.lexists(path) and (path.is_symlink() or not path.is_dir()):
        raise RuntimeError(f"{label} must be a real directory: {path}")


def _safe_regular_file(path: Path, label: str) -> bool:
    _assert_no_symlink_ancestors(path, label)
    if not os.path.lexists(path):
        return False
    if path.is_symlink() or not path.is_file():
        raise RuntimeError(f"{label} must be a regular file: {path}")
    return True

def rewrite_codex_global_file(relative_path: str, content: bytes, global_codex: Path) -> bytes:
    if relative_path == "hooks.json":
        data = json.loads(content.decode("utf-8"))
        local_prefix = '"$CODEX_PROJECT_DIR"/.codex/hooks'
        global_prefix = shlex.quote((global_codex / "hooks").as_posix())
        for groups in data.get("hooks", {}).values():
            for group in groups:
                for hook in group.get("hooks", []):
                    command = hook.get("command")
                    if isinstance(command, str):
                        hook["command"] = command.replace(local_prefix, global_prefix)
        return json.dumps(data, indent=2).encode("utf-8")

    if relative_path == "config.toml":
        wrapper = json.dumps((global_codex / "bin" / "run-mcp-package.sh").as_posix())
        content_text = content.decode("utf-8")
        content_text = re.sub(
            r'command\s*=\s*"\.codex/bin/run-mcp-package\.sh"',
            f"command = {wrapper}",
            content_text,
        )
        return content_text.encode("utf-8")

    return content


def rewrite_codex_global_paths(target_codex: Path):
    _assert_safe_directory(target_codex, "Codex target root")
    hooks_path = target_codex / "hooks.json"
    rewritten_hooks = None
    if _safe_regular_file(hooks_path, "Codex hooks.json"):
        try:
            rewritten_hooks = rewrite_codex_global_file("hooks.json", hooks_path.read_bytes(), target_codex)
        except (json.JSONDecodeError, OSError) as error:
            raise RuntimeError(f"Failed to rewrite Codex hooks: {error}") from error

    config_path = target_codex / "config.toml"
    rewritten_config = None
    if _safe_regular_file(config_path, "Codex config.toml"):
        try:
            rewritten_config = rewrite_codex_global_file("config.toml", config_path.read_bytes(), target_codex)
        except OSError as error:
            raise RuntimeError(f"Failed to rewrite Codex config.toml: {error}") from error

    # Complete every safety/read preflight before mutating either file. This
    # prevents a later unsafe config target from leaving hooks.json half-rewritten.
    if rewritten_hooks is not None:
        hooks_path.write_bytes(rewritten_hooks)
    if rewritten_config is not None:
        config_path.write_bytes(rewritten_config)

def get_agy_js_wrapper(hook_file: str) -> str:
    return f"""#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {{ spawnSync }} = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

const sourceHook = path.join(__dirname, "{hook_file}.original.cjs");

const hasSymlinkedPathComponent = (candidate) => {{
  let current = path.resolve(candidate);
  while (true) {{
    let stat;
    try {{
      stat = fs.lstatSync(current);
    }} catch {{
      return true;
    }}
    if (stat.isSymbolicLink()) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }}
}};

const isUsableHook = (candidate) => {{
  try {{
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !hasSymlinkedPathComponent(candidate);
  }} catch {{
    return false;
  }}
}};

// Format Antigravity payload for Claude hook
let claudePayload = input;
try {{
  const data = JSON.parse(input);
  if (data && !data.tool_input) {{
    let toolName = "unknown";
    if (data.toolCall && data.toolCall.args) {{
       const args = data.toolCall.args;
       if (args.CommandLine) toolName = "run_command";
       else if (args.TargetFile) toolName = "replace_file_content";
       else if (args.Query) toolName = "grep_search";
       else if (args.DirectoryPath) toolName = "list_dir";
       else if (args.AbsolutePath) toolName = "view_file";
       
        const findProjectRoot = () => {{
          if (data.workspacePaths && data.workspacePaths.length > 0) {{
            return data.workspacePaths[0];
          }}
          if (data.cwd) {{
            return data.cwd;
          }}
          if (process.env.GEMINI_PROJECT_DIR) return process.env.GEMINI_PROJECT_DIR;
          if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
          let current = process.cwd();
          while (true) {{
            if (fs.existsSync(path.join(current, '.antigravity')) ||
                fs.existsSync(path.join(current, '.codex')) ||
                fs.existsSync(path.join(current, '.gemini')) ||
                fs.existsSync(path.join(current, '.pi'))) {{
              return current;
            }}
            if (fs.existsSync(path.join(current, '.agents')) || 
                fs.existsSync(path.join(current, '.git'))) {{
              return current;
            }}
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
          }}
          return process.cwd();
        }};

        const projectRoot = findProjectRoot();

        const mapKeys = (obj) => {{
          if (typeof obj === "string") {{
            let normalized = obj.replace(/\\\\/g, '/');
            let projNormalized = projectRoot.replace(/\\\\/g, '/');
            if (normalized.startsWith(projNormalized)) {{
              let rel = normalized.substring(projNormalized.length);
              if (rel.startsWith('/')) rel = rel.substring(1);
              return rel;
            }}
            return obj;
          }}
          if (Array.isArray(obj)) return obj.map(mapKeys);
          if (typeof obj === "object" && obj !== null) {{
            const newObj = {{}};
            for (const key of Object.keys(obj)) {{
              let mappedKey = key;
              if (key === 'AbsolutePath') mappedKey = 'path';
              else if (key === 'TargetFile') mappedKey = 'path';
              else if (key === 'SearchPath') mappedKey = 'path';
              else if (key === 'DirectoryPath') mappedKey = 'path';
              else if (key === 'CommandLine') mappedKey = 'command';
              
              newObj[mappedKey] = mapKeys(obj[key]);
            }}
            return newObj;
          }}
          return obj;
        }};
        
        claudePayload = JSON.stringify({{
          tool_name: toolName,
          tool_input: mapKeys(args)
        }});
     }}
   }}
 }} catch(e) {{}}

if (!isUsableHook(sourceHook)) {{
  process.stdout.write(JSON.stringify({{
    decision: "deny",
    reason: "EVCREATE_HOOK_UNAVAILABLE",
  }}) + '\\n');
  process.exit(0);
}}

const result = spawnSync(process.execPath, [sourceHook], {{
  input: claudePayload,
  encoding: 'utf-8',
  env: {{
    ...process.env,
    CLAUDE_PROJECT_DIR: process.cwd(),
    GEMINI_PROJECT_DIR: process.cwd(),
  }},
}});

const reason = (result.stderr || result.stdout || '').trim();
if (result.status === 0 && !result.error) {{
  // Allow
  process.stdout.write(JSON.stringify({{ decision: "allow" }}) + '\\n');
  process.exit(0);
}} else {{
  // Deny
  process.stdout.write(JSON.stringify({{
    decision: "deny",
    reason: reason || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.'
  }}) + '\\n');
  process.exit(0);
}}
"""

def rewrite_agy_global_paths(target_agy: Path, global_prefix: str | None = None):
    _assert_safe_directory(target_agy, "Antigravity target root")
    hooks_path = target_agy / "hooks.json"
    rewritten_hooks = None
    if _safe_regular_file(hooks_path, "Antigravity hooks.json"):
        try:
            data = json.loads(hooks_path.read_text(encoding="utf-8"))
            local_prefixes = (
                '"$CODEX_PROJECT_DIR"/.codex/hooks',
                '"$AGY_PROJECT_DIR"/.gemini/config/hooks',
                '"$AGY_PROJECT_DIR"/.antigravity/hooks',
                '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
                '"$CLAUDE_PROJECT_DIR"/.antigravity/hooks',
                '"$GEMINI_PROJECT_DIR"/.gemini/hooks',
                '"$GEMINI_PROJECT_DIR"/.antigravity/hooks',
            )
            resolved_prefix = global_prefix or shlex.quote(Path(target_agy / "hooks").as_posix())
            for groups in data.get("hooks", {}).values():
                for group in groups:
                    for hook in group.get("hooks", []):
                        command = hook.get("command")
                        if isinstance(command, str):
                            for local_prefix in local_prefixes:
                                command = command.replace(local_prefix, resolved_prefix)
                            hook["command"] = command
            rewritten_hooks = json.dumps(data, indent=2)
        except (json.JSONDecodeError, OSError) as error:
            raise RuntimeError(f"Failed to rewrite Antigravity hooks: {error}") from error

    hooks_dir = target_agy / "hooks"
    hook_operations = []
    if os.path.lexists(hooks_dir):
        _assert_safe_directory(hooks_dir, "Antigravity hooks directory")
        for hook_file in ["scout-block.cjs", "privacy-block.cjs", "pretool-scout-block.cjs", "pretool-privacy-block.cjs"]:
            hook_path = hooks_dir / hook_file
            if not _safe_regular_file(hook_path, "Antigravity hook"):
                continue
            original_backup = hooks_dir / f"{hook_file}.original.cjs"
            backup_exists = os.path.lexists(original_backup)
            _safe_regular_file(original_backup, "Antigravity hook backup")
            original = None
            if not backup_exists:
                try:
                    original = hook_path.read_text(encoding="utf-8")
                except OSError as error:
                    raise RuntimeError(f"Failed to read Antigravity hook {hook_file}: {error}") from error
            hook_operations.append((hook_path, original_backup, original, get_agy_js_wrapper(hook_file)))

    # All unsafe hook/backup targets have been rejected before any publication
    # write. The remaining writes are now limited to the preflighted paths.
    if rewritten_hooks is not None:
        hooks_path.write_text(rewritten_hooks, encoding="utf-8")
    for hook_path, original_backup, original, wrapper in hook_operations:
        try:
            if original is not None:
                original_backup.write_text(original, encoding="utf-8")
            hook_path.write_text(wrapper, encoding="utf-8")
            hook_path.chmod(0o755)
        except OSError as error:
            raise RuntimeError(f"Failed to write Antigravity hook {hook_path.name}: {error}") from error
