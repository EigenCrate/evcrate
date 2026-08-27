---
name: repomix
description: Package entire code repositories into single AI-friendly files using Repomix. Capabilities include pack codebases with customizable include/exclude patterns, generate multiple output formats (XML, Markdown, plain text), preserve file structure and context, optimize for AI consumption with token counting, filter by file types and directories, add custom headers and summaries. Use when packaging codebases for AI analysis, creating repository snapshots for LLM context, analyzing third-party libraries, preparing for security audits, generating documentation context, or evaluating unfamiliar codebases.
---

# Repomix Skill

Repomix packs entire repositories into single, AI-friendly files for LLM consumption.

## When to Use

- Packaging codebases for AI analysis or LLM context
- Analyzing third-party libraries or remote repositories
- Preparing security audits or documentation context
- Investigating bugs across large codebases

## Default Setup

Before first run, ensure `.repomixignore` exists to exclude dot-folders:

```bash
ls .repomixignore 2>/dev/null || cp .pi/agent/skills/repomix/assets/.repomixignore .repomixignore
```

See [.repomixignore Setup](./references/repomixignore-setup.md) for details.

## Quick Start

```bash
# Check/install
repomix --version
npm install -g repomix

# Pack current directory
repomix

# Pack with filters
repomix --include "src/**/*.ts" --remove-comments -o output.md --style markdown

# Pack remote repository
npx repomix --remote owner/repo
```

## Core Capabilities

| Capability | Description |
|---|---|
| Repository Packaging | AI-optimized XML/MD/JSON/plain formats, git-aware, security checks |
| Remote Repositories | Process GitHub repos without cloning (`--remote owner/repo`) |
| Comment Removal | Strip comments from 20+ languages (`--remove-comments`) |
| Token Management | Count tokens per file/repo, optimize for LLM context limits |
| Security Scanning | Secretlint detects API keys, credentials, private keys |

## Reference Documentation

- [Configuration](./references/configuration.md) — Config file, glob patterns, `.repomixignore`, pattern precedence
- [Output Formats](./references/output-formats.md) — XML/MD/JSON/plain formats, advanced options, performance
- [Usage Patterns](./references/usage-patterns.md) — AI workflows, documentation, library evaluation, best practices
- [Audit & Integration](./references/audit-and-integration.md) — Security audit, CI/CD, git hooks, language-specific, troubleshooting
- [Token Management](./references/token-management.md) — Token counting, LLM limits, optimization strategies
- [Workflow](./references/workflow.md) — 5-step implementation workflow, security best practices
- [.repomixignore Setup](./references/repomixignore-setup.md) — Dot-folder exclusion, template usage

## Additional Resources

- GitHub: https://github.com/yamadashy/repomix
- Documentation: https://repomix.com/guide/
- MCP Server: Available for AI assistant integration
