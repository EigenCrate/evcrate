# Codebase Summary

**Last Updated**: 2026-08-09
**Version**: 1.14.8
**Repository**: [NEBULEA-M/evcrate](https://github.com/NEBULEA-M/evcrate)

## Overview

evcrate is a comprehensive boilerplate template for building professional software projects with CLI Coding Agents (Claude Code and Open Code). It provides a complete development environment with AI-powered agent orchestration, automated workflows, and intelligent project management.

## Project Structure

```
evcrate/
├── .evcrate/source/      # Physical local config root; not project-discovered
│   ├── .claude/          # Canonical Claude Code source
│   ├── .codex/           # Generated Codex artifact
│   ├── .agents/          # Codex-owned, Pi-compatible shared skills
│   ├── .pi/              # Generated native Pi resource projection and runtime
│   ├── .gemini/          # Generated Gemini artifact
│   ├── .antigravity/     # Generated Antigravity artifact
│   ├── .opencode/        # OpenCode compatibility source
│   ├── CLAUDE.md         # Canonical project instructions
│   ├── AGENTS.md         # Generated Codex instructions
│   └── GEMINI.md         # Generated Gemini instructions
├── .evcrate/targets/     # Logical target manifests and overlays
├── docs/                 # Project documentation
├── guide/                # User guides and references
├── plans/                # Implementation plans and reports
├── distribute.py         # Build/check/publish distribution gate entrypoint
├── distribution/         # Immutable path context, gate contracts, and gate orchestration
├── migrate_claude_to_codex.py   # Codex target generator
├── migrate_claude_to_gemini.py  # Gemini target generator
├── migrate_claude_to_pi.py      # Deterministic, staging-only native Pi resource migrator
├── pi_adapter/                  # Native Pi resource inventory, translation, validation, conversion, and containment helpers
├── README.md             # Project overview
├── package.json          # Node.js dependencies
└── repomix-output.xml    # Codebase compaction file
```

### Distribution gates

The distribution entrypoint separates local generation from HOME publication. `.evcrate/source/.claude` is a source-backed target: the build gate copies the complete source tree into the finalized nested `.evcrate/source/.claude` artifact, and `--check` verifies that tree and all other generated outputs without writes. `--publish` consumes that complete artifact for `HOME/.claude`, excluding regular files directly under `.claude/skills/` (installation/readme/notices/archives) while retaining skill package directories and nested resources; stale managed copies absent from the current source are removed. `--publish --dry-run` reports the diff (with optional `--json`); `--recover` restores an interrupted release; and `--all` runs both gates. A bare invocation is retained as a deprecated `--all` alias. Direct migrator `--global` modes are blocked by default and require the explicit `EVCRATE_ALLOW_DIRECT_GLOBAL=1` emergency escape hatch.

Phase 2–4 support creates generated targets in an empty same-volume staging root, applies declared overlays and parser-backed JSON/TOML patches, validates ownership and path safety, computes deterministic source/output hashes, and writes `.evcrate/build-manifest.json`. The Codex output includes the portable `advisor-strategy` skill and its brief contract. Migrated command guides may include one explicit, non-executing pointer to the skill. Publication rejects stale manifests or changed outputs, rejects symlinks in managed artifacts and unsafe HOME paths, applies generic manifest bindings while preserving unmanaged HOME files, and records owner-only release state/locking. The `.evcrate/source/.agents/skills/` binding continues to publish the Pi-compatible tree to `$HOME/.agents/skills`; authored and generated `SKILL.md` descriptions are capped at 1,024 characters.

`EVCRATE_HOME` selects the HOME root used by publish and verification; it defaults to the platform HOME directory. Runtime compatibility retains `/tmp/ck`, `ck-session-*`, and external `ck` CLI boundaries; session variables use the `EVCRATE_*` prefix.

Native Pi Phases 02–04 extend the manifest-backed, staging-only `.pi` adapter with a deterministic `agent/` projection, native runtime, and canonical hook adapter. The projection contains 73 commands, 4 static workflows, 17 provider-neutral agent definitions, 53 validated skill packages, copied canonical hooks/scripts, and the `agent/evcrate/inventory.json` inventory; it excludes legacy `claude-code/skill.md`. The managed extension recursively registers native commands, provides bounded `evcrate_command` nested dispatch, applies an authoritative operation-policy gate, resolves semantic model roles at delegation time, and delegates through the structured `pi-subagents` protocol without rewriting its public `workflowScript` tool. The child-start seam invokes generated child-start hooks before a request is emitted. The sole lifecycle/tool adapter maps generated canonical hooks, blocks safety-hook failures, injects parsed context only, and scopes `EVCRATE_*` session values to the Pi runtime. `model-roles.json` retains only `strong`, `standard`, `fast`, and `parent`; provider/model IDs remain runtime-only. The `evcrate-pi-managed-settings-v1` fragment pins exactly `npm:pi-subagents@0.44.0`, `npm:@juicesharp/rpiv-ask-user-question@2.4.0`, and `npm:@juicesharp/rpiv-todo@2.4.0`; the Node.js baseline is `>=22.19.0` and extension smoke coverage targets Pi `0.84.1`. `agent/settings.json` stays user-owned; manual quiescence is required, `pi-code` is never removed automatically, and live cutover remains user-controlled after isolated validation. `/evcrate-help` is the canonical command-discovery interface; `ck-help` is not a first-party command.

The advisor is current-session guidance only: it structures a local decision brief and reasons over already available evidence. It invokes no provider, model, MCP server, app, command, network or file operation, delegation, quota, audit, or enforcement mechanism. The former `advisor_consult` broker contract is removed; callers use explicit `$advisor-strategy`. Distribution behavior is covered by the Python regression suites.

## Core Technologies

### Runtime & Dependencies
- **Node.js**: >=22.19.0
- **Package Manager**: npm
- **License**: MIT

### Development Tools
- **Semantic Release**: Automated versioning and changelog
- **Commitlint**: Conventional commit enforcement
- **Husky**: Git hooks automation
- **Repomix**: Codebase compaction for AI consumption
- **Vite + TypeScript**: Isolated browser demo under `examples/simple-web-testing-demo/` with release-gate testing workflow

### Testing & Quality Assurance (simple-web-testing-demo)
- **Playwright**: Browser flow testing (5 tests covering modal interactions, validation, focus, keyboard navigation)
- **Vitest**: Helper validation tests for client logic
- **Axe + Playwright**: WCAG accessibility scanning with `@axe-core/playwright` (page and modal-open states)
- **Playwright Visual Regression**: Deterministic snapshot testing with frozen viewport
- **Lighthouse**: Direct budget enforcement against built demo output (local reports, no external upload)
- **k6**: Required smoke testing in the demo web gate, with install guidance or Windows install-path fallback when PATH is not refreshed
- **Security**: npm audit --audit-level=high: 0 vulnerabilities

### CI/CD
- **GitHub Actions**: Automated release workflow
- **Semantic Versioning**: Automated version management
- **Conventional Commits**: Structured commit messages

## Key Components

### 1. Agent Orchestration System

**Claude Code Agents** (`.evcrate/source/.claude/agents/`):
- `planner.md` - Technical planning and architecture
- `researcher.md` - Research and analysis
- `tester.md` - Testing and validation
- `debugger.md` - Issue analysis and debugging
- `code-reviewer.md` - Code quality assessment
- `docs-manager.md` - Documentation management
- `git-manager.md` - Version control operations
- `project-manager.md` - Project tracking and oversight
- `database-admin.md` - Database operations
- `ui-ux-designer.md` - UI/UX design
- `copywriter.md` - Content creation
- `scout.md` - Codebase exploration
- `journal-writer.md` - Development journaling
- `brainstormer.md` - Solution ideation

**OpenCode Agents** (`.evcrate/source/.opencode/agent/`):
- Similar agent definitions optimized for OpenCode CLI
- `planner-researcher.md` - Combined planning and research
- `solution-brainstormer.md` - Advanced brainstorming
- `system-architecture.md` - Architecture documentation

### 2. Slash Commands System

**Categories**:
- **Core Development**: `/plan`, `/cook`, `/ask`, `/bootstrap`, `/brainstorm`, `/test`
- **Debugging**: `/debug`, `/fix:fast`, `/fix:hard`, `/fix:ci`, `/fix:logs`, `/fix:test`, `/fix:types`, `/fix:ui`
- **Design**: `/design:fast`, `/design:good`, `/design:3d`, `/design:screenshot`, `/design:video`
- **Documentation**: `/docs:init`, `/docs:update`, `/docs:summarize`
- **Git Operations**: `/git:cm`, `/git:cp`, `/git:pr`
- **Planning**: `/plan:two`, `/plan:ci`, `/plan:cro`
- **Content**: `/content:fast`, `/content:good`, `/content:enhance`, `/content:cro`
- **Integration**: `/integrate:polar`, `/integrate:sepay`
- **Utility**: `/watzup`, `/journal`, `/scout:ext`, `/scout`

### 3. Skills Library

**Skills Organization** (`.evcrate/source/.claude/skills/`):

**Phase 1 Skill Groups** (Progressive Disclosure Pattern):
- **DevOps** (`devops/`) - Cloudflare edge platform, Docker containerization, Google Cloud Platform
  - 11 reference files (<250 lines each), 2 Python utilities, 45 tests
  - Consolidates: Cloudflare (5 skills), Docker, GCloud
- **Databases** (`databases/`) - MongoDB document database, PostgreSQL relational database
  - 8 reference files, 3 Python utilities
  - Consolidates: MongoDB, PostgreSQL
- **Web Frameworks** (`web-frameworks/`) - Next.js, Turborepo monorepos, RemixIcon
  - 7 reference files, 2 Python utilities
  - Consolidates: Next.js, Turborepo, RemixIcon
- **UI Styling** (`ui-styling/`) - shadcn/ui components, Tailwind CSS, canvas-design
  - 7 reference files, 2 Python utilities
  - Consolidates: shadcn/ui, Tailwind CSS, canvas-design

**Individual Skills** (Original Pattern):
- **Authentication**: `better-auth/`
- **Browser Automation**: `chrome-devtools/`
- **Debugging**: `systematic-debugging/`, `root-cause-tracing/`, `defense-in-depth/`, `verification-before-completion/`
- **Documentation**: `docs-seeker/`, `repomix/`
- **Document Processing**: `document-skills/` (docx, pdf, pptx, xlsx)
- **Media**: `ffmpeg/`, `imagemagick/`
- **Gemini AI**: `gemini-audio/`, `gemini-document-processing/`, `ai-multimodal/`, `gemini-video-understanding/`, `ai-multimodal/`
- **MCP**: `mcp-builder/`
- **Problem Solving**: `collision-zone-thinking/`, `meta-pattern-recognition/`, `scale-game/`, `inversion-exercise/`, `simplification-cascades/`, `when-stuck/`
- **Ecommerce**: `shopify/`
- **Development**: `sequential-thinking/`, `skill-creator/`, `google-adk-python/`

**Archived Skills** (`.evcrate/source/.claude/skills/_archive/20251104-*/`):
- 14 original skills consolidated into Phase 1 groups
- Full preservation of original content
- Available for reference or rollback

**See:** `docs/skills-migration-guide-phase1.md` for migration details

### 4. Workflows

**Primary Workflows** (`.evcrate/source/.claude/workflows/`):
1. **primary-workflow.md**: Core development cycle
   - Code implementation
   - Testing
   - Code quality
   - Integration
   - Debugging

2. **orchestration-protocol.md**: Agent coordination patterns
   - Sequential chaining
   - Parallel execution

3. **development-rules.md**: Development standards
   - File size management (<500 lines)
   - YANGI, KISS, DRY principles
   - Code quality guidelines
   - Pre-commit/push rules

4. **documentation-management.md**: Doc maintenance
   - Roadmap and changelog updates
   - Automatic update triggers
   - Documentation protocols

## Entry Points

### For Users
- **README.md**: Project overview and quick start
- **guide/COMMANDS.md**: Comprehensive command reference (7,073 tokens)
- **.evcrate/source/CLAUDE.md**: Development instructions and workflows

### For Developers
- **package.json**: Dependencies and scripts
- **.releaserc.json**: Release configuration
- **.commitlintrc.json**: Commit message linting rules
- **.gitignore**: Version control exclusions
- **distribute.py**: Script to coordinate configuration and asset distribution
- **distribute_sync.py**: Asset syncing, settings rewriting, and skill translation modules
- **distribute_hooks.py**: Hook rewriting and wrapper generation modules
- **distribute_utils.py**: Path handling, environment resolver, and CLI utilities
- **migrate_claude_to_codex.py**: Claude Code to Codex migration engine and source of truth for GPT-5.6 role-tier model mappings
- **migrate_claude_to_gemini.py**: Claude Code to Gemini/Antigravity migration engine
- **evcrate-config-utils.cjs**: Shared hook config resolver for product-scoped `.evcrate.json` files under `.claude/` and `.codex/`, using the discovered project root and the fixed `EVCRATE_CONFIG_DIR=.codex` selector for Codex bridges
- **privacy-block.cjs**: Sensitive-file blocker that consults only the selected local `.evcrate.json` for `privacyBlock`
- **distribute_sync.py**: Python sync path that preserves user-owned global `~/.codex/.evcrate.json` during normal sync and only replaces it on explicit full sync

### For Agents
- **.evcrate/source/CLAUDE.md**: Primary agent instructions
- **.evcrate/source/.claude/workflows/**: Workflow definitions
- **plans/templates/**: Implementation plan templates

## Development Principles

### YANGI (You Aren't Gonna Need It)
Avoid over-engineering and unnecessary features

### KISS (Keep It Simple, Stupid)
Prefer simple, straightforward solutions

### DRY (Don't Repeat Yourself)
Eliminate code duplication

### File Size Management
- Keep files under 500 lines
- Split large files into focused components
- Extract utilities into separate modules

### Security First
- Try-catch error handling
- Security standards coverage
- No secrets in commits
- Confidential info protection

## Agent Communication Protocol

**Report Format**: Markdown files in `./plans/<plan-name>/reports/`
**Naming Convention**: `YYMMDD-from-[agent]-to-[agent]-[task]-report.md`

**Communication Patterns**:
- Sequential: Task dependencies require ordered execution
- Parallel: Independent tasks run simultaneously
- Query Fan-Out: Multiple researchers explore different approaches

## Git Workflow

**Commit Message Format**: Conventional Commits
```
type(scope): description

Types:
- feat: Features (minor bump)
- fix: Bug fixes (patch bump)
- docs: Documentation (patch bump)
- refactor: Code refactoring (patch bump)
- test: Tests (patch bump)
- ci: CI changes (patch bump)
- BREAKING CHANGE: Major version bump
```

**Automated Release**:
- Every push to `main` triggers release check
- Semantic versioning (MAJOR.MINOR.PATCH)
- Automated changelog generation
- GitHub releases with generated notes

## Testing Strategy

- Comprehensive unit tests required
- Demo unit checks use Vitest via `cd examples/simple-web-testing-demo && npm run test`
- Demo browser checks use Playwright via `cd examples/simple-web-testing-demo && npm run test:e2e`
- High code coverage mandatory
- Error scenario testing
- Performance validation
- Tests must pass before push
- No ignoring failed tests

## Documentation Standards

**Required Docs** (`./docs/`):
- `project-overview-pdr.md` - Project overview and PDR
- `code-standards.md` - Coding standards and structure
- `codebase-summary.md` - This file
- `system-architecture.md` - Architecture documentation
- `project-roadmap.md` - Development roadmap
- `project-changelog.md` - Detailed changelog
- `statusline-windows-support.md` - Windows statusline setup guide
- `statusline-architecture.md` - Technical statusline implementation

**Documentation Triggers**:
- Feature implementation completion
- Major milestone achievements
- Bug fixes
- Security updates
- Weekly reviews

## Dependencies Overview

### Production Dependencies
None (template project)

### Development Dependencies
- **@commitlint/cli**: ^18.4.3
- **@commitlint/config-conventional**: ^18.4.3
- **@semantic-release/changelog**: ^6.0.3
- **@semantic-release/commit-analyzer**: ^11.1.0
- **@semantic-release/git**: ^10.0.1
- **@semantic-release/github**: ^9.2.6
- **@semantic-release/npm**: ^11.0.2
- **@semantic-release/release-notes-generator**: ^12.1.0
- **conventional-changelog-conventionalcommits**: ^7.0.2
- **husky**: ^8.0.3
- **semantic-release**: ^22.0.12

## File Statistics

**Total Files**: 48 files (in repomix output)
**Total Tokens**: 38,868 tokens
**Total Characters**: 173,077 chars

**Top 5 Files by Token Count**:
1. `guide/COMMANDS.md` - 7,073 tokens (18.2%)
2. `CHANGELOG.md` - 4,836 tokens (12.4%)
3. `README.md` - 3,261 tokens (8.4%)
4. `.evcrate/source/.opencode/agent/ui-ux-designer.md` - 2,521 tokens (6.5%)
5. `.evcrate/source/.opencode/agent/system-architecture.md` - 1,714 tokens (4.4%)

## Integration Capabilities

### Discord Notifications
Script: `.evcrate/source/.claude/hooks/send-discord.sh`
Purpose: Send project updates to Discord channels

### GitHub Actions
Workflow: `.github/workflows/release.yml`
Features: Automated releases, changelog generation

### Agent Skills
- **brain**: Advanced reasoning
- **docs-seeker**: Documentation reading
- **ai-multimodal**: Visual understanding
- **ai-multimodal & imagemagick skills**: Content generation and processing

## Critical Files

### Configuration
- `package.json` - Node.js config
- `.releaserc.json` - Release config
- `.commitlintrc.json` - Commit linting
- `.gitignore` - Git exclusions
- `.repomixignore` - Repomix exclusions

### Documentation
- `README.md` - Main project docs
- `.evcrate/source/CLAUDE.md` - Agent instructions
- `CHANGELOG.md` - Version history
- `guide/COMMANDS.md` - Command reference

### Migration & Distribution
- `distribute.py` - Core distribution runner script
- `distribute_sync.py` - Asset, config, and skills sync manager
- `distribute_hooks.py` - Hook rewriter and wrapper generator
- `distribute_utils.py` - Shared utilities and path config resolver
- `migrate_claude_to_codex.py` - Codex migration engine
- `migrate_claude_to_gemini.py` - Gemini migration engine

### Workflows
- `.evcrate/source/.claude/workflows/primary-workflow.md`
- `.evcrate/source/.claude/workflows/development-rules.md`
- `.evcrate/source/.claude/workflows/orchestration-protocol.md`
- `.evcrate/source/.claude/workflows/documentation-management.md`

## Related Projects

- **claudekit** - ClaudeKit website (`../claudekit`)
- **claudekit-marketing** - Marketing Kit (`../claudekit-marketing`)
- **claudekit-cli** - CLI setup tool (`../claudekit-cli`)
- **claudekit-docs** - Public docs (`../claudekit-docs`)

## Version History

**Current**: v1.8.0
**License**: MIT
**Author**: Duy Nguyen
**Repository**: https://github.com/NEBULEA-M/evcrate

## Unresolved Questions

None identified. All core components are well-documented and functional.
