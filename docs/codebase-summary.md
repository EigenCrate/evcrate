# Codebase Summary

**Last Updated**: 2026-08-31
**Version**: 1.0.0 (Phase 3 CLI changes remain Unreleased)
**Repository**: [NEBULEA-M/evcrate](https://github.com/NEBULEA-M/evcrate)

## Overview

evcrate is a comprehensive boilerplate template for building professional software projects with CLI Coding Agents (Claude Code, GitHub Copilot CLI, Open Code, Codex, Gemini, Antigravity, and Pi). It provides a complete development environment with AI-powered agent orchestration, automated workflows, deterministic target distribution, and intelligent project management.

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
│   ├── .copilot/         # Generated personal GitHub Copilot CLI artifact
│   ├── .opencode/        # OpenCode compatibility source
│   ├── CLAUDE.md         # Canonical project instructions
│   ├── AGENTS.md         # Generated Codex instructions
│   ├── GEMINI.md         # Generated Gemini instructions
├── .evcrate/targets/     # Logical target manifests and overlays
├── docs/                 # Project documentation
├── guide/                # User guides and references
├── plans/                # Implementation plans and reports
├── distribute.py         # Build/check/publish distribution gate entrypoint
├── distribution/         # Immutable path context, gate contracts, and gate orchestration
├── migrate_claude_to_codex.py   # Codex target generator
├── migrate_claude_to_gemini.py  # Gemini target generator
├── migrate_claude_to_pi.py      # Deterministic, staging-only native Pi resource migrator
├── migrate_claude_to_copilot.py # Deterministic, staging-only personal Copilot migrator
├── copilot_adapter/             # Copilot resource, hook, settings, and inventory adapters
├── pi_adapter/                  # Native Pi resource inventory, translation, validation, conversion, and containment helpers
├── src/                  # TypeScript/npm control-plane CLI, context, and contracts
│   ├── cli/              # CommonJS entrypoint, dispatch, output, health, and bridges
│   ├── context/          # Manifest, target, project, HOME, and state resolution
│   ├── protocol/         # Bounded JSON, resource, settings, and diagnostic contracts
│   └── errors/           # Stable control-plane errors and exit mapping
├── tests/                # TypeScript CLI/protocol, CommonJS diagnostic, and distribution suites
├── dist/                 # Generated TypeScript JavaScript/declaration output
├── README.md             # Project overview
├── package.json          # CommonJS package, exports, bins, and npm scripts
└── repomix-output.xml    # Codebase compaction file
```

### TypeScript/npm control-plane CLI (Phases 2–3)

Phase 2 freezes the typed version-1 protocol/error boundaries. Phase 3 adds a
one-shot `evcrate` CommonJS executable: parse once, resolve immutable context,
dispatch once, emit one validated result, and exit. It has no listener, daemon,
retry, background process, or counsel proxy.

- Commands are `version`, `health`, `advisor settings get|preview|apply`, and
  `distribute build|check|publish|all|recover`; `--request-file` accepts one
  complete bounded versioned envelope and is mutually exclusive with
  positionals. `--json` forces machine output; non-TTY output is JSON, while
  TTY text is derived from the same validated result.
- The request-file loader resolves a safe path, opens a regular file read-only,
  reads at most 64 KiB with a one-byte overflow check, then applies fatal UTF-8
  and strict JSON validation. On Linux it adds `O_NOFOLLOW` to the descriptor
  open for final-component symlink protection; this is Linux-first scope, not
  a Windows security-equivalence claim.
- Every child process uses fixed argv and `shell:false`, an allowlisted
  environment, bounded input/output and line counts, timeout/abort handling,
  and termination cleanup. Raw process paths and stderr are not exposed.
- `json.ts` enforces fatal UTF-8, duplicate-key/control-character rejection,
  canonical JSON, a 64 KiB document limit, and depth 16. Protocol validators
  enforce exact keys, bounded values, safe paths, target normalization,
  credential/counsel-field rejection, and stable exit bands 0/2/3/4/5/6.
- `manifest.json` (schema 2) is the sole persisted-target authority for
  `antigravity`, `claude`, `codex`, `copilot`, `gemini`, `omp`, and `pi`;
  `agy` is input-only. `--source` selects canonical harness input but cannot
  replace package-owned controller or registry roots.
- Context precedence is `--home` > `EVCRATE_HOME` > platform home. State
  precedence is exact `--state-home` > `EVCRATE_STATE_HOME/evcrate` >
  `XDG_STATE_HOME/evcrate` > `<home>/.local/state/evcrate`; unsafe paths and
  symlink ancestors fail closed.
- `health` invokes only the packaged CommonJS `evcrate-advisor` with an
  `evcrate-advisor-diagnostic` `qualify` request. It requires one bounded JSON
  stdout line, empty stderr, matching request ID, and no counsel-shaped output.
- `advisor settings get|preview|apply` remains a typed, fail-closed boundary:
  without an injected handler each operation returns validated
  `CAPABILITY_UNSUPPORTED` and performs no policy I/O. Functional policy
  transactions, CAS, publication, and recovery are deferred to Phases 7–8.
- Distribution actions invoke only package-relative `python3 distribute.py`
  with one exact action/target argv. The bridge labels results
  `engine: "python-compatibility"` and passes the resolved state root as the
  exact `EVCRATE_STATE_DIR`; it never invokes migrators or a TypeScript
  fallback, and does not claim Python-free parity.
- `package.json` stays CommonJS (no `"type": "module"`), exports `dist/index`,
  retains `evcrate-advisor`, and adds `evcrate: dist/cli/evcrate.js`. `npm run
  build` emits JavaScript/declarations; packed contents include `dist`, the
  controller closure, schema-2 targets, Python distribution modules, and
  `distribute.py`.
- Release CI installs Node 22.19 and Python 3.12, then runs `npm ci`,
  `npm run build`, `npm run test:protocol`, and `npm run test:cli` before the
  legacy tests and distribution checks. Focused Phase 3 evidence is build
  PASS, CLI **28/28**, protocol **16/16**, and packed
  install/version/context smoke PASS.

The existing CommonJS controller remains the sole counsel owner. Phase 4
manifest/build authorization and target adapters, later resource operations,
Python removal, and full platform/vendor qualification remain deferred.
### Distribution gates

The distribution entrypoint separates local generation from HOME publication.
`.evcrate/source/.claude` is the canonical harness source; `--build` creates
finalized target artifacts in isolated same-volume staging and `--check`
verifies them without writes. `--publish` consumes only a current verified
schema-2 build, preserves unmanaged HOME files, reports diffs with
`--publish --dry-run [--json]`, and restores an interrupted release with
`--recover`. `--all` runs the build and publication gates.

The build validates manifests, overlays, ownership, safe paths, parser-backed
configuration patches, generated outputs, and deterministic hashes. It records
ordinary source/output hashes plus `controller_hashes` for the shared advisor
closure. A failed build does not replace the last valid local artifacts or
HOME.


### Central advisor controller

Checkpoint advice uses the single managed executable
`$HOME/.evcrate/bin/evcrate-advisor`. Its only authored source is
`.evcrate/source/.evcrate/bin`; generated harness trees do not contain
controller copies. The required user-owned policy is
`$HOME/.evcrate/advisor-routing.json`:

```json
{
  "version": 1,
  "advisor": {
    "backend": "codex",
    "model": "gpt-5.6-sol",
    "effort": "high",
    "timeout_ms": 900000
  }
}
```

The policy has exact keys, a 60000..900000 inclusive timeout, and no default or
partial merge. Missing policy, legacy `hosts`, malformed JSON, duplicate keys,
unsafe paths, credentials, extra fields, and bounds violations fail closed.
Candidate backends are `claude`, `codex`, `antigravity`, `pi`, and `omp`;
Claude/Codex/Pi/OMP are enabled, Antigravity returns
`CLI_CAPABILITY_UNSUPPORTED`, and Gemini is `ADAPTER_UNSUPPORTED`.

The executable accepts one direct ten-field
`evcrate-advisor-checkpoint/v1` request: `protocol`, `version`, `checkpoint`,
`question`, `kind`, `task_or_phase`, `evidence`, `changed_paths`,
`prior_counsel`, and `owner_disposition`. The request is bounded at 32 KiB,
with bounded question/task/terminal evidence, four evidence files, and sixteen
changed paths. Paths are safe normalized relative POSIX metadata and are never
read by the controller.

The controller generates the correlation UUID, validates input, selects and
qualifies one adapter, creates one empty owner-only workspace, runs one final
process, and normalizes one result. It uses fixed argv, `shell:false`, an
allowlisted environment, stdin-only evidence, bounded streams, POSIX process
groups, TERM/KILL cancellation, descendant reaping, and a deadline shared by
probes and final execution. It never retries, switches backend, substitutes
model/effort, calls a native callback, or uses a local fallback.

The frozen `evcrate-advisor-controller/v1` envelope has one controller UUID and
a fixed receipt. Success adds `evcrate-advisor-result/v1`; failure adds only
sanitized `code`, `category`, `action`, and `message`. Stdout has one JSON line
and stderr is empty. Only `ADVICE_READY` completes the checkpoint.

The first-release controller claim is Linux-only. Fake-CLI tests cover
deterministic contracts; each enabled installed CLI requires a separate
credential-safe operator qualification and requalification after upgrades.
`advisor-strategy` remains static, non-binding guidance, and `/advise` remains a
separate inline-first feature rather than a checkpoint execution path.
### OMP command projection

The OMP adapter is a staging-only projection from the canonical Claude command
tree (`.evcrate/source/.claude/commands/`). A relative Markdown path is mapped
deterministically: components are joined with `:` for `sourceName` and with
`__` after a required `cmd-` prefix for `targetName`. Thus
`fix/hard.md` becomes `cmd-fix__hard.md` and `/fix:hard` (including the
`/evcrate:` spelling) becomes `/cmd-fix__hard`.

`evcrate/command-name-map.json` is generated with schema
`evcrate-omp-command-map-v1` and is the sole authority for `source`,
`sourceName`, `target`, and `targetName` entries. Command-file references,
slash references, generated help, scanner output, and catalogs use that map;
URI references are protected during translation. Unsafe names, non-Markdown
canonical commands, and flattening collisions fail closed. The adapter requires
`OMP_STAGE_ROOT` and never publishes the command projection or map to HOME;
verified distribution gates own publication.

### Personal Copilot CLI projection

The Copilot adapter requires empty isolated staging and emits a deterministic
`.evcrate/source/.copilot/` tree. Every canonical command maps to a
user-invocable `evcrate-cmd-*` skill with literal `$ARGUMENTS`; native skills
and agents use `evcrate-*` namespaces; workflows and non-native resources remain
under `.copilot/evcrate/`. A machine-checkable migration inventory records
every canonical source path and its disposition.

Publication uses the manifest binding `.copilot` → `.copilot`, rejects
unmanaged collisions, and merges only `includeCoAuthoredBy`, `effortLevel`, and
`statusLine` into `$HOME/.copilot/settings.json` while preserving unrelated
JSONC bytes. The target is a personal compatibility projection, not an advisor
controller backend.

## Core Technologies

### Runtime & Dependencies
- **Node.js**: >=22.19.0
- **Package Manager**: npm
- **TypeScript**: strict NodeNext compiler for Phase 2–3 contracts and CLI
- **Node test runner**: protocol and CommonJS contract suites
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

### TypeScript/npm and compatibility verification (Phases 2–3)

- `npm run build` passed; it invokes strict NodeNext TypeScript and emits
  JavaScript plus declarations under `dist/`.
- `npm run test:cli` passed **28/28**; `npm run test:protocol` passed
  **16/16**.
- `python3 -m unittest tests.test_distribution_cli` passed **8/8** and
  targeted release validators passed **16/16**.
- `npm test` passed Python **102/102**, Pi **49/49**, and advisor-controller
  **35/35**; `npm run test:pi` passed **49/49**.
- Packed install/version/context smoke passed. Distribution remains
  Python-backed; these checks do not establish Python-free parity.
 
The release workflow runs the build and the two TypeScript test gates before
legacy tests and distribution checks.


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
- **pi-code-graph**: ^0.16.0

### Development Dependencies
- **@commitlint/cli**: ^18.4.3
- **@commitlint/config-conventional**: ^18.4.3
- **@semantic-release/changelog**: ^6.0.3
- **@semantic-release/npm**: ^11.0.2
- **@semantic-release/release-notes-generator**: ^12.1.0
- **conventional-changelog-conventionalcommits**: ^7.0.2
- **husky**: ^8.0.3
- **semantic-release**: ^22.0.12

## File Statistics

The latest 2026-08-31 repomix scan contains **2,492 files**, **8,625,213
tokens**, and **32,496,123 characters**. The TypeScript source tree contains
**2,867 lines** across `src/`.

**Top 5 Files by Token Count**:
1. `.evcrate/source/.copilot/skills/evcrate-ui-ux-pro-max/data/phosphor-icons-upstream.json` - 230,228 tokens (2.7%)
2. `.evcrate/source/.omp/skills/ui-ux-pro-max/data/phosphor-icons-upstream.json` - 230,228 tokens (2.7%)
3. `.evcrate/source/.pi/agent/skills/ui-ux-pro-max/data/phosphor-icons-upstream.json` - 230,228 tokens (2.7%)
4. `.evcrate/source/.copilot/skills/evcrate-ui-ux-pro-max/data/google-fonts.csv` - 199,578 tokens (2.3%)
5. `.evcrate/source/.omp/skills/ui-ux-pro-max/data/google-fonts.csv` - 199,578 tokens (2.3%)

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

### TypeScript/npm control-plane files
- `src/cli/{evcrate,main,arguments,dispatch,output,health,process-runner,request-file,compatibility-distribution,types}.ts` - CommonJS CLI, bounded dispatch, output, diagnostics, and Python bridge
- `src/context/{invocation-context,path-resolution,target-registry}.ts` - immutable context and schema-2 manifest/path resolution
- `src/protocol/{json,validation,resource-control,advisor-settings,diagnostic}.ts` - bounded versioned contracts
- `src/errors/control-plane-error.ts` - stable error serialization and exit mapping
- `src/index.ts` - side-effect-free public exports
- `tests/cli/*.test.mjs` and `tests/context/*.test.mjs` - CLI/context contract and package smoke coverage
- `tests/protocol/contracts.test.mjs` and `tests/fixtures/control-plane-v1/` - protocol fixtures and boundaries
- `tests/advisor-controller/diagnostic.test.cjs` - CommonJS qualification compatibility
- `.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs` - unchanged counsel owner and diagnostic runtime

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

**Package baseline**: v1.0.0; Phase 3 CLI changes remain Unreleased
**License**: MIT
**Author**: Duy Nguyen
**Repository**: https://github.com/NEBULEA-M/evcrate

## Unresolved Questions

No documentation blockers identified. Phase 4+ boundaries are explicitly
listed above.
