# EVCrate

EVCrate is a comprehensive boilerplate template for building professional software projects with **CLI Coding Agents** (**Claude Code**, **GitHub Copilot CLI**, **OpenCode**, and the native **Pi** target). It provides a complete development environment with AI-powered agent orchestration, automated workflows, and intelligent project management.

## What is Claude Code?

**Claude Code** is Anthropic's official CLI tool that brings AI-powered development assistance directly to your terminal. It enables natural language interaction with your codebase and provides intelligent automation for common development tasks.

- [Claude Code](https://claude.com/product/claude-code)
- [Docs](https://docs.claude.com/en/docs/claude-code/overview)

**Open Code CLI Coding Agents** extend Claude Code with specialized AI agents that handle specific aspects of software development - from planning and research to testing and documentation. This creates a collaborative AI development team that works alongside human developers.

- [Open Code](https://opencode.ai/)
- [Docs](https://opencode.ai/docs)

## GitHub Copilot CLI target

The personal GitHub Copilot CLI target is generated from the canonical
`.evcrate/source/.claude/` tree. It converts commands to user-invocable
`evcrate-cmd-*` skills, namespaces native skills and agents under `evcrate-*`,
bridges the production safety hooks, and keeps workflows under managed
`evcrate/` support paths.

- [GitHub Copilot CLI](https://github.com/github/copilot-cli)
- [GitHub Copilot CLI documentation](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)
- Build and publish it with `npm run distribute:copilot`.
- The generated local instructions are `.evcrate/source/.copilot/copilot-instructions.md`.
- The target publishes only to `$HOME/.copilot`; it does not add Copilot to the
  shared advisor-controller backend or route advisor requests through Copilot.
- Copilot-owned `includeCoAuthoredBy`, `effortLevel`, and `statusLine` settings
  are merged without replacing unrelated user settings or JSONC comments.


## Related Projects & Directories

The ClaudeKit repositories and CLI below are external compatibility dependencies; their names and commands remain unchanged.

- `claudekit` - Website of ClaudeKit
  - Directory: `../claudekit`
  - Repo: https://github.com/claudekit/claudekit
- `claudekit-marketing` - Marketing Kit repository
  - Directory: `../claudekit-marketing`
  - Repo: https://github.com/claudekit/claudekit-marketing
- `claudekit-cli` - CLI tool for quick project setup
  - Directory: `../claudekit-cli`
  - Repo: https://github.com/mrgoonie/claudekit-cli
- `claudekit-docs` - Public documentation repository: https://docs.evcrate.cloud
  - Directory: `../claudekit-docs`
  - Repo: https://github.com/claudekit/claudekit-docs

## Key Benefits

### 🚀 Accelerated Development
- **AI-Powered Planning**: Automated technical planning and architecture design
- **Intelligent Code Generation**: Context-aware code creation and modification
- **Automated Testing**: Comprehensive test generation and execution
- **Smart Documentation**: Synchronized docs that evolve with your code

### 🎯 Enhanced Quality
- **Multi-Agent Code Review**: Specialized agents for security, performance, and standards
- **Automated Quality Assurance**: Continuous testing and validation
- **Best Practices Enforcement**: Built-in adherence to coding standards
- **Security-First Development**: Proactive security analysis and recommendations

### 🏗️ Structured Workflow
- **Agent Orchestration**: Coordinated AI agents working in parallel and sequential workflows
- **Task Management**: Automated project tracking and progress monitoring
- **Documentation Sync**: Always up-to-date technical documentation
- **Clean Git Workflow**: Professional commit messages and branch management

## Documentation

### 📚 Core Documentation
- **[Project Overview & PDR](./docs/project-overview-pdr.md)** - Comprehensive project overview, goals, features, and product development requirements
- **[Codebase Summary](./docs/codebase-summary.md)** - High-level overview of project structure, technologies, and components
- **[Code Standards](./docs/code-standards.md)** - Coding standards, naming conventions, and best practices
- **[System Architecture](./docs/system-architecture.md)** - Detailed architecture documentation, component interactions, and data flow
- **[Advisor Distribution Architecture](./docs/advisor-distribution-architecture.md)** - Central checkpoint controller, policy, adapter qualification, and deterministic publication gates
- **[Advisor Supervision Migration](./docs/advisor-supervision-migration.md)** - Breaking `@advisor` to `--advice` migration, direct checkpoint contract, and validation guidance
- **[Commands Reference](./guide/COMMANDS.md)** - Complete guide to all available slash commands

### 📖 Additional Resources
- **[CLAUDE.md](./.evcrate/source/CLAUDE.md)** - Canonical development instructions and workflows for AI agents
- **[Copilot instructions](./.evcrate/source/.copilot/copilot-instructions.md)** - Generated personal GitHub Copilot CLI instructions
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and release notes
- **[Windows Statusline Support](./docs/statusline-windows-support.md)** - Cross-platform statusline guidance
- **[Statusline Architecture](./docs/statusline-architecture.md)** - Technical statusline architecture

## Quick Start

### Prerequisites
- [Claude Code](https://code.claude.com/docs/en/setup) or [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli) installed and configured
- Git for version control
- Node.js >=22.19.0
- Operating Systems: macOS 10.15+, Ubuntu 20.04+/Debian 10+, or Windows 10+ (with WSL 1, WSL 2, or Git for Windows)
- Hardware: 4GB+ RAM

### Quick Start via npm (Recommended)

1. **Install EVCrate globally** (or run on demand with `npx evcrate`):
   ```bash
   npm install -g evcrate
   ```

2. **Publish coding agent harnesses to your environment**:
   ```bash
   # Preview the publication operations
   evcrate publish --dry-run

   # Install coding agent harnesses (Claude, Copilot, OMP, Pi, Gemini, Codex) into $HOME
   evcrate publish --apply
   ```

3. **Verify setup & diagnostic health**:
   ```bash
   evcrate health
   ```

4. **Start development with your preferred agent**:
   ```bash
   # Begin with Claude Code
   claude

   # Or use the personal GitHub Copilot CLI target
   copilot

   # Or use OMP (OpenCode) or Pi
   omp
   pi

   # Slash commands are immediately available in your coding agent sessions:
   /plan "implement user authentication"
   /cook "add database integration"
   /test
   /review
   ```

### Control-Plane CLI Command Reference

| Command | Description |
|---|---|
| `evcrate publish --apply` | Publish pre-built coding agent harnesses into `$HOME` (`~/.claude`, `~/.copilot`, `~/.omp`, etc.) |
| `evcrate publish --dry-run` | Preview planned publication operations without modifying the filesystem |
| `evcrate health` | Run the qualification diagnostic (verifies controller closure and active backend) |
| `evcrate version` | Display current EVCrate version |
| `evcrate recover` | Rollback or recover from an interrupted publication transaction |
| `evcrate resources list` | List available skills, workflows, agents, hooks, and commands |
| `evcrate scopes list` | Inspect global and project-level resource scopes |
| `evcrate advisor settings get` | View current advisor routing policy |
| `evcrate advisor settings apply` | Atomically apply updated advisor configuration |

### Alternative: Set up with the external ClaudeKit CLI

1. **Install the external ClaudeKit CLI**:
   ```bash
   npm install -g claudekit-cli
   ```

2. **Create an EVCrate project with the external CLI**:
   ```bash
   ck new --dir my-project --kit engineer
   ```
   
   **Note:** The `ck new` and `ck update` commands belong to the external CLI. If you want to use the kit with an existing project:
   ```bash
   cd /path/to/project
   ck update --kit engineer
   ```

📖 **Learn more from our docs:** [https://docs.evcrate.cloud](https://docs.evcrate.cloud)

## Project Structure

```
├── .evcrate/source/         # Physical local config root (not project-discovered)
│   ├── .claude/            # Canonical Claude Code source
│   ├── .codex/             # Generated Codex artifact
│   ├── .agents/            # Codex-owned, Pi-compatible shared skill artifact
│   ├── .pi/                # Generated native Pi resources and extension
│   ├── .gemini/            # Generated Gemini artifact
│   ├── .antigravity/       # Generated Antigravity artifact
│   ├── .copilot/           # Generated personal GitHub Copilot CLI artifact
│   ├── .opencode/          # OpenCode compatibility source
│   ├── CLAUDE.md           # Canonical instructions
│   ├── AGENTS.md           # Generated Codex instructions
│   ├── GEMINI.md           # Generated Gemini instructions
│   └── .evcrate/bin/       # Central managed advisor controller source
├── .evcrate/targets/       # Logical target manifests and overlays
├── dist/                   # Compiled TypeScript control-plane CLI and adapters
├── src/                    # Control-plane CLI and projection adapter source code
├── docs/                   # Project documentation
├── plans/                  # Implementation plans and reports
├── README.md               # This file
└── package.json            # npm commands and release metadata
```

## The AI Agent Team

This boilerplate includes specialized AI agents that work together to deliver high-quality software:

### 🎯 Core Development Agents

#### **Planner Agent**
- Researches technical approaches and best practices
- Creates comprehensive implementation plans
- Analyzes architectural trade-offs
- Spawns multiple researcher agents for parallel investigation

#### **Researcher Agent**
- Investigates specific technologies and frameworks
- Analyzes existing solutions and patterns
- Provides technical recommendations
- Supports the planner with detailed findings

#### **Tester Agent**
- Generates comprehensive test suites
- Validates functionality and performance
- Ensures cross-platform compatibility
- Reports on test coverage and quality metrics

### 🔍 Quality Assurance Agents

#### **Code Reviewer Agent**
- Performs automated code quality analysis
- Enforces coding standards and conventions
- Identifies security vulnerabilities
- Provides improvement recommendations

#### **Debugger Agent**
- Analyzes application logs and error reports
- Diagnoses performance bottlenecks
- Investigates CI/CD pipeline issues
- Provides root cause analysis

### 📚 Documentation & Management Agents

#### **Docs Manager Agent**
- Maintains synchronized technical documentation
- Updates API documentation automatically
- Ensures documentation accuracy
- Manages codebase summaries

#### **Git Manager Agent**
- Creates clean, conventional commit messages
- Manages branching and merge strategies
- Handles version control workflows
- Ensures professional git history

#### **Project Manager Agent**
- Tracks development progress and milestones
- Updates project roadmaps and timelines
- Manages task completion verification
- Maintains project health metrics

## Agent Orchestration Patterns

### Sequential Chaining
Use when tasks have dependencies:
```bash
# Planning → Implementation → Testing → Review
/plan "implement user dashboard"
# Wait for plan completion, then:
/cook "follow the implementation plan"
# After implementation:
/test "validate dashboard functionality"
# Finally:
/review "ensure code quality standards"
```

### Parallel Execution
Use for independent tasks:
```bash
# Multiple researchers exploring different approaches
planner agent spawns:
- researcher (database options)
- researcher (authentication methods)
- researcher (UI frameworks)
# All report back to planner simultaneously
```

### Context Management
- Agents communicate through file system reports
- Context is preserved between agent handoffs
- Fresh context prevents conversation degradation
- Essential information is documented in markdown

## Development Workflow

### 1. Feature Development
```bash
# Start with planning
/plan "add real-time notifications"

# Research phase (automatic)
# Multiple researcher agents investigate approaches

# Implementation
/cook "implement notification system"

# Quality assurance
/test
/review

# Documentation update
/docs

# Project tracking
/watzup  # Check project status
```

### 2. Bug Fixing
```bash
# Analyze the issue
/debug "investigate login failures"

# Create fix plan
/plan "resolve authentication bug"

# Implement solution
/fix "authentication issue"

# Validate fix
/test
```

### 3. Documentation Management
```bash
# Update documentation
/docs

# Generate a repository compaction snapshot
repomix  # Regenerates the configured compaction output

# Review project status
/watzup
```

## Configuration Files

### `.evcrate/source/CLAUDE.md`
Canonical project-specific instructions for Claude Code. Edit this file, then run the distribution build to regenerate target artifacts under `.evcrate/source/`.

### `.evcrate/source/.opencode/agent/*.md`
Individual OpenCode agent configurations defining:
- Agent expertise and responsibilities
- Interaction patterns
- Output formats
- Quality standards

### plans/templates/*.md
Reusable templates for:
- Feature implementation plans
- Bug fix procedures
- Refactoring strategies
- Architecture decisions

### .evcrate.json
Documented project config filename for EVCrate settings. The runtime resolves the local project config from the discovered project root.

### Advisor controller policy

Checkpoint advice (`--advice`) uses one managed executable at
`~/.evcrate/bin/evcrate-advisor`. It reads one required user-owned policy from
the platform home directory: `<home>/.evcrate/advisor-routing.json`.

The exact version-1 policy shape is:

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

The top level contains exactly `version` and `advisor`; the advisor object
contains exactly `backend`, `model`, `effort`, and `timeout_ms`. The timeout is
an integer from 60000 through 900000 inclusive. Missing policy fails as
`ROUTE_POLICY_REQUIRED`. A legacy top-level `hosts` object fails as
`ROUTE_SCHEMA_MIGRATION_REQUIRED` with the action to replace it with one
`advisor` object. Duplicate keys, extra or missing fields, invalid UTF-8,
oversized documents, credentials, unsafe paths, and invalid values fail closed.
There is no default, merge, inheritance, substitution, retry, fallback, or
repository-local policy.

Candidate names are exactly `claude`, `codex`, `antigravity`, `pi`, and `omp`.
The enabled adapters are `claude`, `codex`, `pi`, and `omp`.
`antigravity` remains a disabled candidate slot and returns
`CLI_CAPABILITY_UNSUPPORTED` before any final model process. `gemini` is not a
candidate or registry member and returns `ADAPTER_UNSUPPORTED`. OMP policies
use an exact `provider/model` selector such as `openai-codex/gpt-5.6-sol`.

The executable accepts the checkpoint object directly, with exactly these ten
keys:

```json
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 1,
  "checkpoint": "review:implementation-step",
  "question": "What is the smallest safe next change?",
  "kind": "review",
  "task_or_phase": "Implementation",
  "evidence": {"terminal": "Bounded review evidence.", "files": []},
  "changed_paths": [],
  "prior_counsel": [],
  "owner_disposition": "Proceed after validation."
}
```

The request is bounded to 32 KiB, with 4 KiB question, 8 KiB task/phase, 16 KiB
terminal evidence, four evidence files, and sixteen changed paths. Paths are
safe normalized relative POSIX paths. Evidence is metadata only; the controller
does not read request paths.
Idle or partial stdin has a finite two-second pre-policy deadline; expiry emits
one `FAILED` envelope with `TIMEOUT`.

The controller selects one configured backend, qualifies it, creates one empty
owner-only workspace, runs one final process, and emits one controller-authored
terminal envelope. It never invokes a native callback, changes model or effort,
switches backend, retries, or uses a local fallback. Only outer
`ADVICE_READY` completes the checkpoint; failures and nonzero exit leave it
incomplete.

The outer envelope is `evcrate-advisor-controller/v1` with a controller-generated
UUID and a receipt containing exactly `backend`, `model`, `effort`,
`controller_version`, `adapter_version`, and `elapsed_ms`. Success adds the
normalized `evcrate-advisor-result/v1`; failure adds only sanitized
`code`, `category`, `action`, and `message`. Stdout contains one JSON line and
stderr is empty. Installed CLIs own authentication; EVCrate stores no
credentials.

The first controller release is Linux-only. Fake-CLI tests prove deterministic
contracts; each enabled installed CLI requires separate bounded qualification
and requalification after CLI upgrades. Build manifests use schema 2 and
`controller_hashes`; the central source is `.evcrate/source/.evcrate/bin` and
the publisher atomically owns `$HOME/.evcrate/bin` without replacing the
policy file.

## Gemini Skills Configuration

This project includes several Gemini-powered skills that require a Google Gemini API key:

- **gemini-audio** - Audio analysis and speech generation
- **gemini-video-understanding** - Video analysis and understanding
- **gemini-document-processing** - PDF document processing
- **gemini-image-gen** - AI image generation
- **gemini-vision** - Image analysis and vision capabilities

### API Key Setup

The Gemini skills check for `GEMINI_API_KEY` in the following order (priority from highest to lowest):

1. **Environment Variable** (Recommended for development)
   ```bash
   export GEMINI_API_KEY='your-api-key-here'
   ```

2. **Project Root `.env`** (Recommended for project-specific keys)
   ```bash
   # Create .env in project root
   echo 'GEMINI_API_KEY=your-api-key-here' > .env
   ```

3. **`.evcrate/source/.claude/.env`** (For Claude-specific configuration)
   ```bash
   # Copy example and edit
   cp .evcrate/source/.claude/.env.example .evcrate/source/.claude/.env
   # Then edit .evcrate/source/.claude/.env and set your API key
   ```

4. **`.evcrate/source/.claude/skills/.env`** (For shared skills configuration)
   ```bash
   # Copy example and edit
   cp .evcrate/source/.claude/skills/.env.example .evcrate/source/.claude/skills/.env
   # Then edit .evcrate/source/.claude/skills/.env and set your API key
   ```

5. **Individual Skill Directory `.env`** (For skill-specific keys)
   ```bash
   # Example for gemini-audio skill
   cp .evcrate/source/.claude/skills/gemini-audio/.env.example .evcrate/source/.claude/skills/gemini-audio/.env
   # Then edit and set your API key
   ```

### Getting Your API Key

Get your free Gemini API key at: https://aistudio.google.com/apikey

### Vertex AI Support

To use Vertex AI instead of Google AI Studio:

```bash
# Enable Vertex AI
export GEMINI_USE_VERTEX=true
export VERTEX_PROJECT_ID=your-gcp-project-id
export VERTEX_LOCATION=us-central1  # Optional, defaults to us-central1
```

Or in `.env` file:
```
GEMINI_USE_VERTEX=true
VERTEX_PROJECT_ID=your-gcp-project-id
VERTEX_LOCATION=us-central1
```

### Usage Examples

```bash
# Audio analysis
claude "Analyze this audio file and summarize the key points: audio.mp3"

# Video understanding
claude "Describe what happens in this video: video.mp4"

# Document processing
claude "Extract all tables from this PDF: document.pdf"

# Image generation
claude "Generate an image of a serene mountain landscape"

# Image analysis
claude "What objects are in this image: photo.jpg"
```

## Model Context Protocol (MCP)

✍️ Please read [my technical blog article about MCP here](https://faafospecialist.substack.com/p/claude-code-solution-to-use-mcp-servers).

### Pre-requisites

In EVCrate, configure MCP servers in `.evcrate/source/.claude/.mcp.json`.

Copy the example file:
```bash
mv .evcrate/source/.claude/.mcp.json.example .evcrate/source/.claude/.mcp.json
```

Then add your MCP servers, below are some examples:

### [Context7](https://github.com/upstash/context7)
```json
{
   "mcpServers": {
      "context7": {
         "command": "npx",
         "args": ["-y", "@upstash/context7-mcp", "--api-key", "YOUR_API_KEY"],
      }
   }
}
```

### [Human MCP](https://github.com/mrgoonie/human-mcp/)

```json
{
   "mcpServers": {
      "human": {
         "command": "npx",
         "args": ["@goonnguyen/human-mcp@latest"],
         "env": { "GOOGLE_GEMINI_API_KEY": "YOUR_API_KEY" }
      }
   }
}
```

### [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
```json
{
   "mcpServers": {
      "chrome-devtools": {
         "command": "npx",
         "args": ["-y", "chrome-devtools-mcp@latest"]
      }
   }
}
```

## Best Practices

### Development Principles
- **YANGI**: You Aren't Gonna Need It - avoid over-engineering
- **KISS**: Keep It Simple, Stupid - prefer simple solutions
- **DRY**: Don't Repeat Yourself - eliminate code duplication

### Configuration & Baseline Management
- **Canonical Authoring**: Shared Claude Code configuration, hooks, workflows, commands, and skills are authored in `.evcrate/source/.claude/`. Target manifests/overlays in `.evcrate/targets/` are distribution metadata; generated artifacts remain under `.evcrate/source/` so no agent CLI discovers them as project-local configuration.
- **Two Distribution Gates**: Run `python3 distribute.py --build` to regenerate nested local artifacts, `--check` to verify them without writes, and `--publish` to publish an existing verified build to HOME. After changing `.evcrate/source/.claude/`, use `python3 distribute.py --all` (or `--build` then `--publish`); `--publish` requires that verified build and never runs migrators.
- **Pi-only Distribution**: `npm run distribute:pi` runs `python3 distribute.py --all --target pi`: it builds, verifies, then publishes only native `.pi` to `$EVCRATE_HOME/.pi`. For an isolated HOME, use `EVCRATE_HOME="$(mktemp -d)" EVCRATE_STATE_HOME="$(mktemp -d)" npm run distribute:pi`. The no-selector commands above retain all-target behavior.
- **Copilot-only Distribution**: `npm run distribute:copilot` runs `python3 distribute.py --all --target copilot`: it stages the personal `.copilot` artifact, verifies its migration inventory, and publishes only `$EVCRATE_HOME/.copilot`. The adapter requires isolated staging and never supports direct/global output.
- **HOME Publication**: The nested `.evcrate/source/.claude` artifact remains complete, while HOME publication sanitizes `$HOME/.claude` by excluding regular files directly under `.claude/skills/` (installation/readme/notices/archives), retaining skill package directories and nested resources, and removing stale managed copies. The Pi-compatible `.evcrate/source/.agents/skills/` tree continues to publish to `$HOME/.agents/skills/`; unmanaged files remain preserved according to target policy.
- **Copilot settings and hooks**: The target converts every canonical command to an `evcrate-cmd-*` skill, namespaces native resources, bridges SessionStart/SubagentStart/tool/compact/end hooks, and merges only `includeCoAuthoredBy`, `effortLevel`, and `statusLine` into `$HOME/.copilot/settings.json`. Unknown settings and JSONC comments remain user-owned; `.mcp.json.example` is retained only as `mcp-config.example.json`.
- **Pi Skill Metadata**: Authored and generated Pi-distributed `SKILL.md` files require YAML frontmatter with a lower-kebab-case `name` and non-empty `description`. Generated command skills use `cmd_*` directories, lower-kebab-case frontmatter names, and descriptions no longer than 1,024 characters.
- **Pi runtime and settings**: The native extension registers commands, bounded nested dispatch, policy-gated tool restrictions, semantic provider roles, structured `pi-subagents` delegation, and the sole canonical lifecycle/tool-hook adapter. The target merges only the exact pins `npm:pi-subagents@0.44.0`, `npm:@juicesharp/rpiv-ask-user-question@2.4.0`, and `npm:@juicesharp/rpiv-todo@2.4.0` into `~/.pi/agent/settings.json`; unknown keys, packages, provider/model settings, and sessions remain user-owned. See [Native Pi migration](docs/pi-native-migration.md).
- **Pi publication safety**: Stop Pi manually before live publication. Concurrent HOME changes abort promotion; `pi-code` is never removed automatically and live cutover remains user-controlled after isolated validation.
- **Shared advisor controller**: `.evcrate/source/.evcrate/bin` is the sole authored controller closure. Build manifests record `controller_hashes`, and publication atomically installs one `$HOME/.evcrate/bin` while preserving `advisor-routing.json`; generated harnesses contain no controller copy.
- **Pi advisor caveat**: `--target pi` narrows local build/check and publication bindings to `.pi`; `PI_CODING_AGENT_DIR` changes the runtime resource root, not the HOME publication destination. Pi must be manually quiescent for any live HOME publication, which is a separate user-authorized operation.
- **No Direct Downstream Edits**: Do not edit `.evcrate/source/.gemini/`, `.evcrate/source/.agents/`, `.evcrate/source/.codex/`, `.evcrate/source/.pi/`, or `.evcrate/source/.copilot/` directly. They are generated automatically by the local build gate.
- **Emergency Global Migration Only**: Direct migrator `--global` modes are refused. For a documented recovery incident only, set `EVCRATE_ALLOW_DIRECT_GLOBAL=1`; it bypasses publication verification and emits a warning.
- **HOME Cleanup**: Managed publication uses manifest-scoped deletion and preservation while keeping unrelated user-owned HOME paths intact.
- **Track Downstream Assets**: Generated folders under `.evcrate/source/` must be committed and tracked in Git to monitor compiled changes and prevent configuration regressions, including the personal `.copilot` target.

### Code Quality
- All code changes go through automated review
- Comprehensive testing is mandatory
- Security considerations are built-in
- Performance optimization is continuous

### Documentation
- Documentation evolves with code changes
- API docs are automatically updated
- Architecture decisions are recorded
- Codebase summaries are regularly refreshed

### Git Workflow
- Clean, conventional commit messages
- Professional git history
- No AI attribution in commits
- Focused, atomic commits

## Usage Examples

### Starting a New Feature
```bash
# Research and plan
claude "I need to implement user authentication with OAuth2"
# Planner agent creates comprehensive plan

# Follow the plan
claude "Implement the authentication plan"
# Implementation follows the detailed plan

# Ensure quality
claude "Review and test the authentication system"
# Testing and code review agents validate the implementation
```

### Debugging Issues
```bash
# Investigate problem
claude "Debug the slow database queries"
# Debugger agent analyzes logs and performance

# Create solution
claude "Optimize the identified query performance issues"
# Implementation follows debugging recommendations

# Validate fix
claude "Test query performance improvements"
# Tester agent validates the optimization
```

### Project Maintenance
```bash
# Check project health
claude "What's the current project status?"
# Project manager provides comprehensive status

# Update documentation
claude "Sync documentation with recent changes"
# Docs manager updates all relevant documentation

# Plan next sprint
claude "Plan the next development phase"
# Planner creates detailed roadmap for upcoming work
```

## Advanced Features

### Multi-Project Support
- Manage multiple repositories simultaneously
- Shared agent configurations across projects
- Consistent development patterns

### Custom Agent Creation
- Define project-specific agents
- Extend existing agent capabilities
- Create domain-specific expertise

### Integration Capabilities
- Discord notifications for project updates
- GitHub Actions integration
- CI/CD pipeline enhancement

## Customization Guide

### 1. Project Setup
- Update `.evcrate/source/CLAUDE.md` with your project specifics
- Modify agent configurations in `.evcrate/source/.opencode/agent/`
- Customize plan templates in `plans/templates/`

### 2. Agent Specialization
- Add domain-specific knowledge to agents
- Create custom agents for unique requirements
- Configure agent interaction patterns

### 3. Workflow Optimization
- Define project-specific commands
- Create shortcuts for common tasks
- Establish team coding standards

## Contributing

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the agent orchestration workflow
4. Ensure all tests pass and documentation is updated
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Learn More

### Claude Code Resources
- [Claude Code Documentation](https://claude.ai/code)
- [Open Code CLI Documentation](https://docs.opencode.ai)
- [Agent Development Guide](https://docs.opencode.ai/agents)

### Community
- [Claude Code Community](https://discord.gg/claude-code)
- [Discussion Forum](https://github.com/anthropic/claude-code/discussions)
- [Example Projects](https://github.com/topics/claude-code)

### Support
- [Issue Tracker](https://github.com/anthropic/claude-code/issues)
- [Feature Requests](https://github.com/anthropic/claude-code/discussions/categories/ideas)
- [Documentation](https://docs.claude.ai/code)

---

**Start building with AI-powered development today!** This boilerplate provides everything you need to create professional software with intelligent agent assistance.
