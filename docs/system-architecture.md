# System Architecture

**Last Updated**: 2026-08-09
**Version**: 1.9.0
**Project**: EVCrate

## Overview

EVCrate implements a multi-agent AI orchestration architecture where specialized agents collaborate through a file-based communication protocol. The system enables developers to leverage AI assistance throughout the entire software development lifecycle - from planning and implementation to testing, review, and deployment.

## Architectural Pattern

### Pattern Classification
**Primary Pattern**: Microservices-inspired Agent Architecture
**Secondary Patterns**:
- Command Pattern (slash commands)
- Observer Pattern (agent communication)
- Strategy Pattern (workflow selection)
- Template Method Pattern (agent workflows)

### Design Philosophy
- **Decoupled Agents**: Each agent is independent and specialized
- **File-Based Communication**: Agents communicate via markdown reports
- **Workflow Orchestration**: Coordinated agent execution (sequential/parallel)
- **Configuration-Driven**: Agents and commands defined in markdown
- **AI-First Development**: Leverage AI at every stage of SDLC

## System Components

### 1. Core Layer

#### 1.1 CLI Interface
**Location**: Claude Code / Open Code CLI / Pi Coding Agent
**Responsibility**: User interaction and command routing
**Key Functions**:
- Parse slash commands
- Route to appropriate agent workflows
- Display results to users
- Manage conversation context

**Technology**: Anthropic Claude Code CLI / OpenCode AI CLI / Pi Coding Agent

#### 1.2 Command Parser
**Location**: Built into CLI
**Responsibility**: Command interpretation and argument extraction
**Input**: Slash command with arguments (`/command arg1 arg2`)
**Output**: Parsed command and argument values
**Argument Variables**:
- `$ARGUMENTS` - All arguments as single string
- `$1, $2, $3...` - Individual positional arguments

#### 1.3 Configuration Manager
**Location**: `.evcrate/source/` for canonical authoring and generated `.claude/`, `.pi/`, `.agents/`, `.codex/`, `.gemini/`, `.antigravity/`, and `.opencode/` trees. The nested physical root prevents project-local CLI discovery; logical target names remain unchanged for HOME publication.
**Responsibility**: Load agent and command definitions
**File Types**:
- Agent definitions (`.md` with YAML frontmatter)
- Command definitions (`.md` with embedded agent calls)
- Skill modules (knowledge bases)
- Workflow templates
- Product-scoped EVCrate config (`.evcrate.json`)

- **EVCrate Config Resolution**:
- Runtime discovers the project root first, then resolves config from that root rather than the current working directory.
- Claude hooks default to `DEFAULT_CONFIG`, then global `~/.claude/.evcrate.json`, then local `.evcrate/source/.claude/.evcrate.json`; local values win.
- Codex bridge hooks use a fixed logical `EVCRATE_CONFIG_DIR=.codex`, so shared hook logic merges `DEFAULT_CONFIG`, global `~/.codex/.evcrate.json`, then the nested local `.evcrate/source/.codex/.evcrate.json`; local values win.
- The internal selector accepts only `.claude` and `.codex`; invalid values fall back to `.claude`.
- Privacy blocking is stricter: the disable switch reads only the selected local `.evcrate.json`, so global config cannot disable secret-file blocking.
- The Python-managed global sync preserves user-owned `~/.codex/.evcrate.json` by default; a full sync must be requested explicitly to replace it.
- No legacy `.ck.json` fallback is used.
- `EVCRATE_HOME` overrides the HOME root used by distribution publish and verification; when unset, the runtime uses the platform HOME directory.
- `.evcrate/source/.claude/` is the canonical authoring source; target manifests/overlays under `.evcrate/targets/` describe distribution metadata. The manifest-driven local build regenerates `.evcrate/source/.pi/`, `.evcrate/source/.agents/`, `.evcrate/source/.codex/`, `.evcrate/source/.gemini/`, and `.evcrate/source/.antigravity/` projections. Generated targets are not hand-edited.
- The native Pi target owns `.pi`. The existing Codex adapter continues to own `.codex` plus the shared `.agents` skill projection during the first migration slice; Pi consumes `~/.agents/skills` through its native Agent Skills discovery. Splitting `.agents` into an independent target is deferred until Codex command-skill compatibility can be changed without regression.
- Pi publication merges only EVCrate-owned package and hook entries into `~/.pi/agent/settings.json`. User model/provider defaults, credentials, sessions, custom packages, and unrelated settings remain user-owned. Shared-file publication records EVCrate ownership at entry level so removing the target never deletes the user's settings file.
- EVCrate's generated local Pi package contains recursive command registration, static workflow resources, hook payload adapters, and runtime model-role resolution. Third-party Pi packages are pinned in the managed settings fragment and remain independently auditable/updateable.
- After `.evcrate/source/.claude/` changes, run `python3 distribute.py --all`, or run `python3 distribute.py --build` followed by `python3 distribute.py --publish`. `--publish` consumes only a current verified build, never runs migrators, and publishes the complete nested `.evcrate/source/.claude` artifact to `~/.claude` after excluding regular files directly under `.claude/skills/` (installation/readme/notices/archives); skill package directories and nested resources remain.
- The generated `.evcrate/source/.agents/skills/` projection is also Pi-compatible: HOME publication places it at `~/.agents/skills/`, one of Pi's global skill locations, without modifying `~/.pi/agent/settings.json`. Its authored and generated `SKILL.md` files require YAML frontmatter with a lower-kebab-case `name` and non-empty `description`; generated command skills use `cmd_*` directories, lower-kebab-case frontmatter names, and descriptions capped at 1,024 characters.
- Runtime compatibility remains at the existing `CK_*`, `/tmp/ck`, `ck-session-*`, and external `ck` CLI boundaries.

**Canonical Help Command**:
- `/evcrate-help` is the canonical command for command discovery and usage guidance. The legacy `ck-help` command/path is not a first-party interface.

**Codex Model Migration**:
- `migrate_claude_to_codex.py` is the Codex model-policy source of truth; `distribute.py` runs it and synchronizes the generated `.evcrate/source/.codex/` and shared `.evcrate/source/.agents/` artifacts. Native Pi consumes the shared Agent Skills projection but does not use Codex's model policy.
- The parent session and `opus` roles use `gpt-5.6-sol`; parent reasoning is `medium`, while delegated `opus` reasoning is `high`.
- `sonnet` roles use `gpt-5.6-terra` with `high` reasoning, `haiku` roles use `gpt-5.6-luna` with `low` reasoning, and inherited roles use `gpt-5.6-terra` with `medium` reasoning.
- Agents with no source model use `gpt-5.6-sol` with `high` reasoning. Preview-only models are not selected as default tiers.

**Pi Runtime Model Migration**:
- Canonical Claude agent models are converted to semantic Pi roles, not provider IDs embedded in commands or workflows: `opus → strong`, `sonnet → standard`, `haiku → fast`, `inherit → parent`; an unspecified model defaults to `standard` unless an agent policy says otherwise.
- The managed Pi extension resolves semantic roles on `session_start` and `model_select` against the active provider and Pi model registry. For `openai-codex`, `strong → gpt-5.6-sol:high`, `standard → gpt-5.6-terra:high`, and `fast → gpt-5.6-luna:low`.
- Provider routes are explicit and user-extensible. If the active provider has no configured route, generated agents omit the model pin and inherit the parent model while emitting a setup warning. Pi must never silently switch to a different provider.
- Commands and static workflow documents remain provider-neutral. Only effective generated agent definitions contain concrete provider/model IDs, and they are rematerialized when the active provider changes.

**Advisor Guidance**:
- `advisor-strategy` is a static, portable skill distributed from `.evcrate/source/.claude/skills` to the managed skill roots.
- It helps an executor decide whether independent review is useful, form a minimal evidence brief, and evaluate advice already available in the current session.
- It does not start a nested model session, expose MCP tools, execute commands, access credentials, enforce quotas, or claim isolation. Normal host approvals and sandbox policy remain authoritative.
- Generated `.evcrate/source/.agents/skills/cmd_*` command guides include a short pointer to this advisory rubric for high-impact architecture, security, debugging, and review decisions. The pointer does not invoke it automatically or add a tool/model capability.

### 2. Agent Layer

#### 2.1 Agent Types

**Planning Agents**:
- `planner` - Technical planning and architecture
- `researcher` - Research and analysis
- `planner-researcher` - Combined planning and research (Opus model)
- `brainstormer` - Solution ideation

**Implementation Agents**:
- Main agent (user interaction) - Implements code
- `scout` - Parallel codebase exploration
- `ui-ux-designer` - Design creation
- `ui-ux-developer` - Design implementation
- `database-admin` - Database operations

**Quality Assurance Agents**:
- `code-reviewer` - Code quality assessment
- `tester` - Test creation and execution
- `debugger` - Issue analysis and debugging

**Documentation Agents**:
- `docs-manager` - Documentation maintenance
- `copywriter` - Content creation
- `journal-writer` - Development journaling

**Operations Agents**:
- `git-manager` - Version control operations
- `project-manager` - Progress tracking and oversight

#### 2.2 Agent Definition Structure

```yaml
---
name: agent-name
description: Agent purpose and use cases
mode: subagent | all
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
---

# Agent instructions in markdown
## Core Responsibilities
## Workflow Process
## Output Requirements
## Quality Standards
```

**Agent Modes**:
- `subagent`: Spawned by other agents, runs independently
- `all`: Can be invoked as main or sub agent

**Model Selection**:
- `claude-sonnet-4-20250514` - Fast, efficient (most agents)
- `claude-opus-4-1-20250805` - Advanced reasoning (planner-researcher)
- `google/gemini-2.5-flash` - Cost-effective (docs-manager)
- `grok-code` - Specialized (git-manager)

#### 2.3 Agent Communication Protocol

**Communication Medium**: File system (markdown files)
**Report Location**: `./plans/<plan-name>/reports/`
**Naming Convention**: `YYMMDD-from-[source]-to-[dest]-[task]-report.md`

**Report Structure**:
```markdown
# Task Report: [Task Name]

**From**: [Source Agent]
**To**: [Destination Agent]
**Date**: YYYY-MM-DD
**Status**: [Complete|In Progress|Blocked]

## Summary
Brief overview of findings/results

## Details
Comprehensive information

## Recommendations
Actionable next steps

## Concerns
Issues, blockers, or questions
```

**Communication Patterns**:
1. **Request-Response**: Agent A requests, Agent B responds
2. **Broadcast**: Agent publishes report for multiple consumers
3. **Chain**: Sequential handoffs (A → B → C)
4. **Fan-Out**: Parallel execution (A spawns B, C, D)
5. **Fan-In**: Collect results from parallel agents

### 3. Command Layer

#### 3.1 Command Categories

**Core Development**:
- `/plan` - Research and planning
- `/cook` - Feature implementation
- `/test` - Test execution
- `/ask` - Technical consultation
- `/bootstrap` - Project initialization
- `/brainstorm` - Solution ideation

**Debugging & Fixing**:
- `/debug` - Deep analysis
- `/fix:fast` - Quick fixes
- `/fix:hard` - Complex problems
- `/fix:ci` - CI/CD debugging
- `/fix:test` - Test debugging
- `/fix:types` - Type error resolution
- `/fix:logs` - Log analysis
- `/fix:ui` - UI issue fixing

**Design & Content**:
- `/design:*` - Design creation variants
- `/content:*` - Content creation variants

**Documentation**:
- `/docs:init` - Initial docs
- `/docs:update` - Update docs
- `/docs:summarize` - Generate summaries

**Git Operations**:
- `/git:cm` - Commit
- `/git:cp` - Commit and push
- `/git:pr` - Create PR

**Project Management**:
- `/watzup` - Status review
- `/journal` - Journaling
- `/scout` - Codebase exploration
- `/scout:ext` - Codebase exploration (using external tools)

#### 3.2 Command Workflow Pattern

```
User Input: /command [args]
    ↓
Command Parser
    ↓
Load Command Definition
    ↓
Substitute Arguments
    ↓
Execute Agent Workflow
    ↓
Sequential or Parallel Execution
    ↓
Collect Results
    ↓
Present to User
```

### 4. Workflow Layer

#### 4.1 Orchestration Patterns

**Sequential Chaining**:
```
Planner → Researcher → Planner → Main Agent → Tester → Code Reviewer → Docs Manager → Git Manager
```
Use when tasks have dependencies

**Parallel Execution**:
```
            ┌─→ Researcher (Auth) ─┐
Planner ────┼─→ Researcher (DB) ───┼─→ Planner (Synthesize)
            └─→ Researcher (UI) ───┘
```
Use for independent research tasks

**Query Fan-Out**:
```
Main Agent → Planner → [Multiple Researchers in Parallel] → Planner → Main Agent
```
Explore different approaches simultaneously

#### 4.2 Standard Workflows

**Feature Development Workflow**:
1. User: `/cook "add user authentication"`
2. Planner: Create implementation plan
3. Researchers: Explore auth solutions (parallel)
4. Planner: Synthesize research, create detailed plan
5. Main Agent: Implement code
6. Main Agent: Run type checking/compilation
7. Tester: Write and run tests
8. (If tests fail): Debugger analyzes, loop to step 5
9. Code Reviewer: Review implementation
10. Docs Manager: Update documentation
11. Git Manager: Commit with conventional message

**Bug Fix Workflow**:
1. User: `/debug "API timeout errors"`
2. Debugger: Analyze logs and system
3. Debugger: Identify root cause
4. Planner: Create fix plan
5. Main Agent: Implement solution
6. Tester: Validate fix
7. Code Reviewer: Review changes
8. Git Manager: Commit fix

**Documentation Update Workflow**:
1. User: `/docs:update`
2. Docs Manager: Check doc freshness
3. (If >1 day old): Run `repomix` for codebase summary
4. Docs Manager: Analyze codebase changes
5. Docs Manager: Update affected documentation
6. Docs Manager: Validate naming conventions
7. Docs Manager: Create update report

### 5. Skills Layer

#### 5.1 Skill Architecture

**Purpose**: Reusable knowledge modules for specific technologies

**Structure**:
```
.evcrate/source/.claude/skills/
└── [skill-name]/
    ├── SKILL.md           # Main skill definition
    ├── references/        # Supporting documentation
    │   ├── api-ref.md
    │   └── examples.md
    └── scripts/           # Utility scripts (if applicable)
```

**Skill Categories**:
- **Authentication**: better-auth
- **Cloud Platforms**: Cloudflare, Google Cloud
- **Databases**: MongoDB, PostgreSQL
- **Design**: Canvas design generation
- **Debugging**: Systematic approaches
- **Development**: Next.js, Turborepo
- **Documentation**: Repomix, docs-seeker
- **Document Processing**: PDF, DOCX, PPTX, XLSX
- **Infrastructure**: Docker
- **Media**: FFmpeg, ImageMagick
- **MCP**: Server building
- **Problem Solving**: Meta-patterns, thinking frameworks
- **UI Frameworks**: shadcn/ui, Tailwind CSS
- **Ecommerce**: Shopify

#### 5.2 Skill Invocation

**Invocation**: `Skill` tool in CLI
**Usage**: Agents invoke skills to access specialized knowledge
**Example**:
```
Planner needs Next.js expertise
  ↓
Invokes "nextjs" skill
  ↓
Skill provides implementation guidance
  ↓
Planner incorporates into plan
```

### 6. Integration Layer

#### 6.1 Hook System

**Purpose**: Intercept and control Claude Code operations for performance and security

**Scout Block Hook** (Cross-Platform):
- **Architecture**: Node.js entry point with shared pattern matching
- **Configuration**: `.evcrate/source/.claude/.evcrateignore`, using gitignore-style patterns
- **Runtime**: Identical behavior across supported platforms via Node.js

**Functionality**:
- Blocks access to heavy directories (node_modules, __pycache__, .git/, dist/, build/)
- Input validation (JSON structure, command presence)
- Error handling with exit codes (0 = allow, 2 = block/error)
- Security features: sanitized error messages, input validation

**Requirements**:
- Node.js >= 18.0.0 (already required by project)
- No additional dependencies

**Testing**:
- Node.js test suites under `.evcrate/source/.claude/hooks/scout-block/tests/`
- End-to-end hook checks in `.evcrate/source/.claude/hooks/tests/test-scout-block.js` and `test-evcrateignore.js`
- Comprehensive test coverage (11+ test cases)
- Validates blocked/allowed patterns, error handling, edge cases
- `examples/simple-web-testing-demo/` validates the web-testing release gate with:
  - Vitest unit checks (helper validation tests)
  - Playwright browser flow tests (5 tests; modal interactions, focus, keyboard navigation, validation)
  - Axe accessibility scanning (WCAG page & modal-open states; no critical/serious issues)
  - Visual regression snapshots (deterministic, frozen viewport)
  - Lighthouse budget gate (local reports; no external upload)
    - k6 smoke tests as part of the demo web gate (install guidance if no usable binary is found; Windows install-path fallback supported)
  - npm audit --audit-level=high: 0 vulnerabilities

**Hook Configuration** (`.evcrate/source/.claude/settings.json`):
```json
{
  "hooks": {
    "BeforeBash": [{
      "type": "command",
      "command": "node ${CLAUDE_PROJECT_DIR}/.claude/hooks/scout-block.cjs"
    }]
  }
}
```

**Native Pi Hook Migration**:
- The Pi target uses the pinned `@hsingjui/pi-hooks` package for Claude-compatible command hook events that have a direct Pi lifecycle seam: `SessionStart`, `SessionEnd`, `PreCompact`, `PostCompact`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, and `Stop`.
- Generated wrapper commands translate Pi's lowercase tool names and `path` fields to the payload contract expected by canonical Claude hook scripts, then normalize Claude hook output back to the package contract.
- `SubagentStart` has no package event. The managed EVCrate Pi extension injects equivalent child context when it detects a `pi-subagents` child session.
- Hook execution remains fail-closed for explicit safety denials and fail-open for missing optional context hooks. Package and wrapper versions are pinned and covered by payload-contract tests.

**Codex & Gemini Hook Migration Bridges**:
To ensure that safety/privacy hooks are consistently enforced when migrating from Claude Code to Codex CLI or Gemini/Antigravity platforms, the migration process automatically generates wrapper scripts.
- **Codex Wrappers**: Generated under `.evcrate/source/.codex/hooks/pretool-scout-block.cjs` and `.evcrate/source/.codex/hooks/pretool-privacy-block.cjs`.
- **Gemini/Antigravity Wrappers**: Generated under `.evcrate/source/.gemini/hooks/before-tool-scout-block.cjs` and `.evcrate/source/.gemini/hooks/before-tool-privacy-block.cjs`.
- **Design Pattern**:
  - **Dynamic Root Resolution**: Traverses parent directories to locate local workspace hooks, with a fallback lookup to global hook directories in the user's home directory.
  - **Fail-Open Policy**: If no local or global hook is found, the wrapper fails-open to prevent disabling the terminal environment (returns allowed status).
  - **Strict Fail-Closed Policy**: Blocks tool-use if the underlying hook process crashes, errors out, or exits with a non-zero code.
  - **Payload/Key Adaptation**: Automatically maps parameter keys from Antigravity/Codex formats (e.g. `AbsolutePath`, `CommandLine`) to those expected by legacy Claude Code hooks (e.g. `path`, `command`).

#### 6.2 MCP (Model Context Protocol) Integration

**Available MCP Servers**:

**docs-seeker** skill (Documentation):
- Read latest docs for packages/plugins
- Access up-to-date technical information

**sequential-thinking** skill (Problem Solving):
- Structured thinking process
- Break down complex problems
- Reflective analysis

**ai-multimodal** skill (Visual Analysis):
- Describe images, videos, documents
- UI/UX analysis from screenshots

**ai-multimodal & imagemagick skills** (Generation & Processing):
- Generate images, videos, and documents via ai-multimodal skills
- Perform design asset creation and edits with imagemagick skill workflows

**brain** (Advanced Reasoning):
- Sequential thinking
- Code analysis
- Debugging assistance

#### 6.3 External Service Integration

**GitHub**:
- Actions (CI/CD automation)
- Releases (semantic versioning)
- Issues and PRs (project management)

**Discord**:
- Webhook notifications
- Project updates
- Team communication

**NPM** (Optional):
- Package publishing
- Version management

### 7. Data Layer

#### 7.1 File-Based Storage

**Configuration Data**:
- `.evcrate/source/.claude/` - Claude Code config source
- `.evcrate/source/.opencode/` - OpenCode config source
- `.evcrate/source/.pi/`, `.evcrate/source/.codex/`, `.evcrate/source/.agents/`, `.evcrate/source/.gemini/` - generated artifacts
- `.gitignore` - Git exclusions
- `package.json` - Node.js config
- `.releaserc.json` - Release config

**Runtime Data**:
- `plans/` - Implementation plans
- `plans/<plan-name>/reports/` - Agent communication
- `plans/<plan-name>/research/` - Research reports
- `docs/` - Project documentation
- `repomix-output.xml` - Codebase compaction

**Version Control**:
- `.git/` - Git repository
- `CHANGELOG.md` - Version history
- Git tags - Release versions

#### 7.2 Data Flow

```
User Input
    ↓
Command Parsing
    ↓
Agent Execution
    ↓
File System (Reports/Plans)
    ↓
Agent Reading
    ↓
Processing
    ↓
File System (Updated Docs/Code)
    ↓
Version Control (Git)
    ↓
Remote Repository (GitHub)
```

## Component Interactions

### Typical Interaction Flow: Feature Implementation

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │ /cook "add auth"
       ↓
┌─────────────────────┐
│   Command Parser    │
└──────┬──────────────┘
       │ Parse command + args
       ↓
┌─────────────────────┐
│  Planner Agent      │
└──────┬──────────────┘
       │ Spawn researchers
       ↓
┌──────────────────────────────────┐
│  Researchers (Parallel)          │
│  - Auth strategies               │
│  - Security best practices       │
│  - Integration patterns          │
└──────┬───────────────────────────┘
       │ Reports to planner
       ↓
┌─────────────────────┐
│  Planner Agent      │
└──────┬──────────────┘
       │ Create plan
       │ Save to ./plans/
       ↓
┌─────────────────────┐
│   Main Agent        │
└──────┬──────────────┘
       │ Read plan
       │ Implement code
       ↓
┌─────────────────────┐
│  Tester Agent       │
└──────┬──────────────┘
       │ Write & run tests
       ↓
┌─────────────────────┐
│ Code Reviewer Agent │
└──────┬──────────────┘
       │ Review quality
       ↓
┌─────────────────────┐
│ Docs Manager Agent  │
└──────┬──────────────┘
       │ Update docs
       ↓
┌─────────────────────┐
│  Git Manager Agent  │
└──────┬──────────────┘
       │ Commit & push
       ↓
┌─────────────────────┐
│   User (Result)     │
└─────────────────────┘
```

### Agent Communication Example

```
plans/<plan-name>/reports/251026-from-planner-to-main-auth-plan-report.md
    ↓
Main Agent reads plan
    ↓
Implements features
    ↓
plans/<plan-name>/reports/251026-from-main-to-tester-auth-impl-report.md
    ↓
Tester reads implementation details
    ↓
Runs tests
    ↓
plans/<plan-name>/reports/251026-from-tester-to-main-test-results-report.md
```

## Technology Stack

### Core Technologies

**Runtime Environment**:
- Node.js >= 18.0.0
- Bash scripting (hooks)

**AI Platforms**:
- Anthropic Claude (Sonnet 4, Opus 4)
- Google Gemini 2.5 Flash
- OpenRouter (multi-model support)
- Grok Code

**Development Tools**:
- Semantic Release (versioning)
- Commitlint (commit standards)
- Husky (git hooks)
- Repomix (codebase compaction)

**CI/CD**:
- GitHub Actions
- Conventional Commits
- Semantic Versioning

### Agent Skills Ecosystem

**Sequential Thinking**: Problem decomposition
**brain**: Advanced reasoning
**docs-seeker**: Documentation access
**ai-multimodal**: Visual understanding
**ai-multimodal & imagemagick skills**: Content generation and processing

## Data Flow Diagrams

### Command Execution Flow

```
User → CLI → Parser → Command Def → Agent Workflow
                                         ↓
                        ┌────────────────┴────────────────┐
                        ↓                                 ↓
                Sequential Execution              Parallel Execution
                        ↓                                 ↓
                Agent A → Agent B → Agent C    Agent A + Agent B + Agent C
                        ↓                                 ↓
                        └─────────────┬───────────────────┘
                                      ↓
                              Collect Results
                                      ↓
                              Present to User
```

### File-Based Communication Flow

```
Agent A (Planner)
    ↓ Writes
./plans/<plan-name>/plan.md
    ↓ Reads
Main Agent
    ↓ Implements
Code Changes
    ↓ Writes
./plans/<plan-name>/reports/251026-from-main-to-tester-impl-report.md
    ↓ Reads
Tester Agent
    ↓ Executes
Tests
    ↓ Writes
./plans/<plan-name>/reports/251026-from-tester-to-main-results-report.md
    ↓ Reads
Main Agent (next steps)
```

### Documentation Update Flow

```
Code Changes
    ↓
Docs Manager Triggered
    ↓
Check Freshness (< 1 day?)
    ↓
┌─────────┴─────────┐
↓ No (outdated)     ↓ Yes (fresh)
Run Repomix         Read Existing
    ↓                   ↓
Generate Summary        │
    └────────┬──────────┘
             ↓
    Analyze Changes
             ↓
    Update Documentation
    - API docs
    - Code standards
    - Architecture
    - Codebase summary
             ↓
    Validate Naming
             ↓
    Create Report
             ↓
    Save to ./docs/
```

## Security Architecture

### Security Layers

**Layer 1: Pre-Commit Security**
- Secret scanning (git-manager agent)
- Credential detection
- .gitignore validation
- Environment file exclusion

**Layer 2: Code Security**
- Input validation enforcement
- SQL injection prevention
- XSS protection patterns
- OWASP Top 10 awareness

**Layer 3: Agent Security**
- No logging of sensitive data
- Sanitized error messages
- Secure credential handling
- API key protection

**Layer 4: Communication Security**
- File system permissions
- Report sanitization
- Context isolation
- Clean handoffs

### Secret Management

**Environment Variables**:
```
.env (local, gitignored)
.env.example (template, committed)
```

**API Keys**:
- Never hardcoded
- Environment variable injection
- Secure storage systems in production

**Credentials**:
- Password hashing (bcrypt, argon2)
- Token-based authentication
- Secure session management

## Scalability Considerations

### Horizontal Scalability

**Parallel Agent Execution**:
- Independent researchers run simultaneously
- No shared state between agents
- File-based coordination
- Scalable to N agents

**Workflow Parallelization**:
- Multiple feature branches
- Concurrent issue resolution
- Parallel test execution
- Independent documentation updates

### Vertical Scalability

**Context Management**:
- Repomix for code compaction
- Selective context loading
- Chunked file processing
- Efficient token usage

**Performance Optimization**:
- Lazy loading of skills
- Cached MCP responses
- Incremental documentation updates
- Optimized file I/O

## Deployment Architecture

### Development Environment

```
Developer Machine
├── Claude Code CLI / Open Code CLI
├── .evcrate/source/ (nested configuration and artifacts, including native `.pi`)
├── .evcrate/targets/ (logical target manifests)
├── Git repository
└── Node.js runtime
```

### CI/CD Pipeline

```
GitHub Repository
    ↓ Push to main
GitHub Actions
    ↓
Run Tests
    ↓
Semantic Release
    ├─→ Version Bump
    ├─→ Changelog Generation
    ├─→ GitHub Release
    └─→ (Optional) NPM Publish
```

### Production Usage

```
User Project
├── $HOME/.claude/ (published from EVCrate)
├── docs/ (generated)
├── plans/ (generated)
├── src/ (user code)
└── tests/ (user tests)
```

## Monitoring & Observability

### Agent Activity Tracking

**Logs**:
- Agent invocations
- Command executions
- Workflow progress
- Error occurrences

**Reports**:
- Agent communication files
- Implementation plans
- Research findings
- Test results

**Metrics**:
- Command execution time
- Agent success rates
- Test pass/fail ratios
- Documentation coverage

### Quality Metrics

**Code Quality**:
- Test coverage percentage
- Type safety compliance
- Linting pass rate
- Security scan results

**Process Metrics**:
- Planning to implementation time
- Code review turnaround
- Documentation freshness
- Commit message compliance

## Failure Handling

### Error Recovery Strategies

**Agent Failures**:
- Graceful degradation
- Error reporting to user
- Rollback mechanisms
- Retry logic for transient errors

**Workflow Failures**:
- Checkpoint saving
- Partial progress preservation
- Clear failure messages
- Recovery suggestions

**Communication Failures**:
- File write retries
- Report validation
- Missing report detection
- Timeout handling

## Extension Points

### Adding New Agents

1. Create agent definition file: `.evcrate/source/.claude/agents/my-agent.md`
2. Define YAML frontmatter (name, description, mode, model)
3. Write agent instructions and workflows
4. Reference in commands or other agents

### Adding New Commands

1. Create command file: `.evcrate/source/.claude/commands/my-command.md`
2. Define YAML frontmatter
3. Write command workflow with agent invocations
4. Use `$ARGUMENTS` or `$1, $2` for parameters

### Adding New Skills

1. Create skill directory: `.evcrate/source/.claude/skills/my-skill/`
2. Write `SKILL.md` with knowledge content
3. Add references and examples
4. Reference in agent definitions

### Custom Workflows

1. Define workflow in `.evcrate/source/.claude/workflows/`
2. Document orchestration patterns
3. Specify agent handoffs
4. Provide examples

## Performance Considerations

### Optimization Strategies

**Token Efficiency**:
- Repomix for codebase compaction
- Selective context inclusion
- Efficient prompt engineering
- Response caching where possible

**Execution Speed**:
- Parallel agent spawning
- Async file operations
- Lazy skill loading
- Minimal context switching

**Resource Usage**:
- File system efficiency
- Memory management for large files
- Cleanup of temporary files
- Optimized git operations

## Distribution Architecture (native Pi and skill-only advisor)

[Distribution and advisor guidance](./advisor-distribution-architecture.md) documents the static advisor boundary. Distribution verification covers generated artifacts and publication; no advisor service or consultation transport is installed:

- `.evcrate/source/.claude` is the only authored agent-config target. Build/check validate the complete source tree and deterministically generate `.pi`, `.agents`, `.codex`, `.gemini`, and `.antigravity` outputs before promotion.
- Generic manifest bindings preserve unmanaged files already present under HOME targets. The `.claude` binding removes stale managed copies absent from the current source and excludes regular files directly under its `skills/` root; skill package directories and nested resources remain. Publication rejects stale or incomplete build manifests, output drift, managed symlinks, and unsafe HOME symlink paths.
- Shared JSON files use entry-level ownership. The Pi publisher may upsert pinned EVCrate package/hook entries in `HOME/.pi/agent/settings.json`, but it must preserve unknown keys and entries, reject malformed or symlinked settings, and remove only entries previously recorded as EVCrate-owned.
- Native Pi commands are registered recursively from the managed local package using Claude-compatible names (`dir:file → /dir:file`) and argument substitution. Static workflow Markdown remains data referenced by commands; it is not silently converted into dynamic executable orchestration.
- Native Pi agents run through `pi-subagents`. Semantic model roles are resolved against the active provider at runtime; concrete models are never baked into command or workflow prose. Unknown providers inherit the parent model rather than crossing provider boundaries.
- The Codex and Pi outputs include the portable `advisor-strategy` skill and its brief contract. Migrated command guides may include one explicit, non-executing pointer to the skill.
- The skill reasons over evidence already available in the current session. It does not invoke providers, models, MCP, apps, commands, network or file operations, delegation, quotas, audits, or enforcement.
- The former `advisor_consult` broker contract is superseded; host permissions, sandboxing, and human review remain authoritative.

## Future Architecture Evolution

### Planned Enhancements

**Agent Improvements**:
- Visual workflow builder for agent orchestration
- Custom agent creator with UI
- Agent marketplace for community contributions
- Real-time agent communication (beyond files)

**Scalability Enhancements**:
- Distributed agent execution
- Cloud-based agent orchestration
- Multi-repository support
- Large-scale project handling

**Integration Expansions**:
- Additional AI platforms
- More MCP servers
- Custom integration framework
- Enterprise service connectors

## References

### Internal Documentation
- [Project Overview PDR](./project-overview-pdr.md)
- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)

### External Resources
- [Claude Code Documentation](https://docs.claude.com/)
- [Open Code Documentation](https://opencode.ai/docs)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Semantic Versioning](https://semver.org/)

## Unresolved Questions

1. **Real-Time Collaboration**: How to handle multiple developers using agents simultaneously on same codebase?
2. **Agent State Management**: Should agents maintain state between invocations beyond file system?
3. **Distributed Execution**: Architecture for running agents across multiple machines?
4. **Performance Benchmarking**: What are acceptable latency thresholds for different operation types?
