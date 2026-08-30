"""Copy non-native Copilot support assets without activating examples."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from .resources import ResourceError, copy_file, ensure_parent, read_json, write_json


def _statusline_transform(value: str, transform: Callable[[str], str]) -> str:
    rendered = transform(value)
    rendered = rendered.replace(
        "data.workspace?.current_dir",
        "data.workspace?.current_dir || data.workspace?.currentDir || data.workspace?.path",
    )
    rendered = rendered.replace(
        "currentDir = data.workspace.current_dir;",
        "currentDir = data.workspace.current_dir || data.workspace?.currentDir || data.workspace?.path;",
    )
    rendered = rendered.replace(
        "session_id: data.session_id,",
        "session_id: data.session_id || data.sessionId,",
    )
    rendered = rendered.replace(
        "const transcriptPath = data.transcript_path;",
        "const transcriptPath = data.transcript_path || data.transcriptPath;",
    )
    rendered = rendered.replace(
        "const modelName = data.model?.display_name || 'Copilot';",
        "const modelName = data.model?.display_name || data.model?.displayName || data.model?.name || 'Copilot';",
    )
    rendered = rendered.replace(
        "const modelVersion = data.model?.version && data.model.version !== 'null' ? data.model.version : '';",
        "const modelVersion = (data.model?.version || data.model?.versionName) && (data.model.version || data.model.versionName) !== 'null' ? (data.model.version || data.model.versionName) : '';",
    )
    rendered = rendered.replace(
        "costUSD = data.cost?.total_cost_usd || '';",
        "costUSD = data.cost?.total_cost_usd || data.cost?.totalCostUsd || '';",
    )
    rendered = rendered.replace(
        "linesAdded = data.cost?.total_lines_added || 0;",
        "linesAdded = data.cost?.total_lines_added || data.cost?.totalLinesAdded || 0;",
    )
    rendered = rendered.replace(
        "linesRemoved = data.cost?.total_lines_removed || 0;",
        "linesRemoved = data.cost?.total_lines_removed || data.cost?.totalLinesRemoved || 0;",
    )
    rendered = rendered.replace(
        "const contextInput = data.context_window?.total_input_tokens || 0;\n"
        "        const contextOutput = data.context_window?.total_output_tokens || 0;\n"
        "        const contextSize = data.context_window?.context_window_size || 0;",
        "const contextData = data.context_window || data.contextWindow || data.context || {};\n"
        "        const contextInput = contextData.total_input_tokens || contextData.totalInputTokens || contextData.input_tokens || contextData.inputTokens || 0;\n"
        "        const contextOutput = contextData.total_output_tokens || contextData.totalOutputTokens || contextData.output_tokens || contextData.outputTokens || 0;\n"
        "        const contextSize = contextData.context_window_size || contextData.contextWindowSize || contextData.window_size || contextData.windowSize || 0;",
    )
    marker = "        console.log(output);"
    if marker in rendered and "MAX_STATUSLINE_LENGTH" not in rendered:
        rendered = rendered.replace(
            "        console.log(output);",
            "        const boundedOutput = output.slice(0, MAX_STATUSLINE_LENGTH);\n"
            "        console.log(boundedOutput);",
        )
        rendered = rendered.replace(
            "async function main() {",
            "const MAX_STATUSLINE_LENGTH = 512;\n\nasync function main() {",
        )
    return rendered


def _validate_mcp(value: dict[str, object]) -> dict[str, object]:
    servers = value.get("mcpServers")
    if not isinstance(servers, dict) or not servers:
        raise ResourceError("MCP example requires a non-empty mcpServers object")
    rendered: dict[str, object] = {}
    for name, raw in sorted(servers.items()):
        if not isinstance(name, str) or not name or not isinstance(raw, dict):
            raise ResourceError("MCP example server entries must be named objects")
        command = raw.get("command")
        args = raw.get("args", [])
        env = raw.get("env", {})
        tools = raw.get("tools")
        if not isinstance(command, str) or not command:
            raise ResourceError(f"MCP example server has no local command: {name}")
        if not isinstance(args, list) or not all(isinstance(item, str) for item in args):
            raise ResourceError(f"MCP example args must be strings: {name}")
        if not isinstance(env, dict) or not all(isinstance(key, str) and isinstance(item, str) for key, item in env.items()):
            raise ResourceError(f"MCP example env must be a string map: {name}")
        if tools is not None and (not isinstance(tools, list) or not all(isinstance(item, str) for item in tools)):
            raise ResourceError(f"MCP example tools must be strings: {name}")
        item: dict[str, object] = {"command": command, "args": args}
        if env:
            item["env"] = dict(sorted(env.items()))
        if tools is not None:
            item["tools"] = tools
        rendered[name] = item
    return {"mcpServers": rendered}


def convert_support(source: Path, output: Path, transform: Callable[[str], str]) -> dict[str, object]:
    """Publish root config, audit archives, status lines, and an opt-in MCP example."""

    config = source / ".evcrate.json"
    ignore = source / ".evcrateignore"
    for path, label in ((config, "canonical EVCrate config"), (ignore, "canonical EVCrate ignore file")):
        if path.is_symlink() or not path.is_file():
            raise ResourceError(f"Missing or unsafe {label}: {path}")
    copy_file(config, output / ".evcrate.json", output, transform)
    copy_file(ignore, output / ".evcrateignore", output, transform)

    gitignore = source / ".gitignore"
    settings = source / "settings.json"
    if gitignore.is_symlink() or not gitignore.is_file() or settings.is_symlink() or not settings.is_file():
        raise ResourceError("Canonical source audit files are missing or unsafe")
    copy_file(gitignore, output / "evcrate" / "source-gitignore", output, transform)
    copy_file(settings, output / "evcrate" / "claude-settings.json", output, transform)

    statusline_paths: list[str] = []
    for path in sorted(source.glob("statusline.*")):
        if path.is_symlink() or not path.is_file():
            raise ResourceError(f"Unsafe status-line variant: {path}")
        destination = output / "evcrate" / path.name
        copy_file(path, destination, output, lambda value: _statusline_transform(value, transform))
        statusline_paths.append(f"evcrate/{path.name}")

    example = source / ".mcp.json.example"
    if example.is_symlink() or not example.is_file():
        raise ResourceError(f"Missing or unsafe MCP example: {example}")
    try:
        mcp = _validate_mcp(read_json(example, "canonical MCP example"))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise ResourceError(f"Invalid canonical MCP example: {example}") from error
    write_json(output / "mcp-config.example.json", output, mcp)
    return {
        "config": [".evcrate.json", ".evcrateignore"],
        "archives": ["evcrate/source-gitignore", "evcrate/claude-settings.json"],
        "statusline": statusline_paths,
        "mcpExample": "mcp-config.example.json",
    }
