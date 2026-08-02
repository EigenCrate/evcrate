#!/usr/bin/env python3
import json
import re
import shlex
import sys
from pathlib import Path

def rewrite_codex_global_paths(target_codex: Path):
    hooks_path = target_codex / "hooks.json"
    if hooks_path.exists():
        try:
            data = json.loads(hooks_path.read_text(encoding="utf-8"))
            local_prefix = '"$CODEX_PROJECT_DIR"/.codex/hooks'
            global_prefix = shlex.quote(Path(target_codex / "hooks").as_posix())
            for groups in data.get("hooks", {}).values():
                for group in groups:
                    for hook in group.get("hooks", []):
                        command = hook.get("command")
                        if isinstance(command, str):
                            hook["command"] = command.replace(local_prefix, global_prefix)
            hooks_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except (json.JSONDecodeError, OSError) as error:
            raise RuntimeError(f"Failed to rewrite Codex hooks: {error}") from error

    config_path = target_codex / "config.toml"
    if config_path.exists():
        try:
            wrapper = json.dumps(Path(target_codex / "bin" / "run-mcp-package.sh").as_posix())
            content = config_path.read_text(encoding="utf-8")
            content = re.sub(
                r'command\s*=\s*"\.codex/bin/run-mcp-package\.sh"',
                f"command = {wrapper}",
                content
            )
            config_path.write_text(content, encoding="utf-8")
        except OSError as error:
            raise RuntimeError(f"Failed to rewrite Codex config.toml: {error}") from error

def get_agy_js_wrapper(hook_file: str) -> str:
    return f"""#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {{ spawnSync }} = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

const sourceHook = path.join(__dirname, "{hook_file}.original.cjs");

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
            if (fs.existsSync(path.join(current, '.agents')) || 
                fs.existsSync(path.join(current, '.claude')) || 
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

if (!fs.existsSync(sourceHook)) {{
  process.stdout.write(JSON.stringify({{ decision: "allow" }}) + '\\n');
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
    hooks_path = target_agy / "hooks.json"
    if hooks_path.exists():
        try:
            data = json.loads(hooks_path.read_text(encoding="utf-8"))
            local_prefix = '"$CODEX_PROJECT_DIR"/.codex/hooks'
            local_prefix_agy = '"$AGY_PROJECT_DIR"/.gemini/config/hooks'
            local_prefix_claude = '"$CLAUDE_PROJECT_DIR"/.claude/hooks'
            resolved_prefix = global_prefix or shlex.quote(Path(target_agy / "hooks").as_posix())
            for groups in data.get("hooks", {}).values():
                for group in groups:
                    for hook in group.get("hooks", []):
                        command = hook.get("command")
                        if isinstance(command, str):
                            command = command.replace(local_prefix, resolved_prefix).replace(local_prefix_agy, resolved_prefix).replace(local_prefix_claude, resolved_prefix)
                            hook["command"] = command
            hooks_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except (json.JSONDecodeError, OSError) as error:
            raise RuntimeError(f"Failed to rewrite Antigravity hooks: {error}") from error

    hooks_dir = target_agy / "hooks"
    if hooks_dir.exists():
        for hook_file in ["scout-block.cjs", "privacy-block.cjs", "pretool-scout-block.cjs", "pretool-privacy-block.cjs"]:
            hook_path = hooks_dir / hook_file
            if not hook_path.exists():
                continue
            try:
                original_backup = hooks_dir / f"{hook_file}.original.cjs"
                # IDEMPOTENCY BUG FIX: Avoid wrapping the wrapper recursively
                if original_backup.exists():
                    # Backup already exists, wrapper is active. Do not backup again.
                    pass
                else:
                    original = hook_path.read_text(encoding="utf-8")
                    original_backup.write_text(original, encoding="utf-8")
                
                wrapper = get_agy_js_wrapper(hook_file)
                hook_path.write_text(wrapper, encoding="utf-8")
                hook_path.chmod(0o755)
            except OSError as error:
                raise RuntimeError(f"Failed to write wrapper for {hook_file}: {error}") from error
