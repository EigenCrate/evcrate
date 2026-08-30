# Project Overview & Product Development Requirements (PDR)

**Project Name**: EVCrate
**Version**: 1.8.0
**Last Updated**: 2026-08-26
**Status**: Active Development
**Repository**: https://github.com/NEBULEA-M/evcrate

## Executive Summary

EVCrate is a comprehensive boilerplate template that integrates AI-powered CLI coding agents (Claude Code and Open Code) into the development workflow. It provides a complete orchestration framework where specialized AI agents collaborate to handle planning, implementation, testing, code review, documentation, and project management.

## Project Purpose

### Vision
Enable developers to build professional software projects faster and with higher quality by leveraging AI agent orchestration, automated workflows, and intelligent project management.

### Mission
Provide a production-ready template that:
- Accelerates development velocity through AI-powered agent collaboration
- Enforces best practices and coding standards automatically
- Maintains comprehensive documentation that evolves with code
- Ensures code quality through automated testing and review
- Streamlines git workflows with professional commit standards

### Value Proposition
- **10x Faster Planning**: Parallel researcher agents explore solutions simultaneously
- **Consistent Quality**: Automated code review and testing on every change
- **Zero Documentation Debt**: Docs update automatically with code changes
- **Professional Git History**: Clean, conventional commits without AI attribution
- **Reduced Context Switching**: Specialized agents handle specific concerns

## Target Users

### Primary Users
1. **Solo Developers**: Building projects faster with AI assistance
2. **Small Development Teams**: Standardizing workflows and practices
3. **Open Source Maintainers**: Managing contributions and documentation
4. **Startups**: Rapid prototyping and MVP development
5. **Enterprise Teams**: Enforcing architectural standards

### User Personas

**Persona 1: Solo Full-Stack Developer**
- **Needs**: Fast iteration, quality code, minimal documentation overhead
- **Pain Points**: Context switching, documentation maintenance, testing gaps
- **Solution**: AI agents handle planning, testing, docs while dev focuses on features

**Persona 2: Technical Lead**
- **Needs**: Enforce standards, review code, maintain architecture docs
- **Pain Points**: Code review bottleneck, inconsistent patterns, outdated docs
- **Solution**: Automated reviews, standardized workflows, living documentation

**Persona 3: Open Source Maintainer**
- **Needs**: Scale contributions, maintain quality, clear documentation
- **Pain Points**: Limited time, varying contribution quality, doc rot
- **Solution**: Consistent review process, automated standards enforcement

## Key Features & Capabilities

### 1. Multi-Agent Orchestration System

**Agent Types**:
- **Planning Agents**: Research, architecture, technical decisions
- **Implementation Agents**: Code generation, feature development
- **Quality Agents**: Testing, code review, security analysis
- **Documentation Agents**: Auto-updating docs, API references
- **Management Agents**: Project tracking, progress monitoring, git operations

**Orchestration Patterns**:
- **Sequential Chaining**: Planning → Implementation → Testing → Review → Deploy
- **Parallel Execution**: Multiple researchers exploring different approaches
- **Query Fan-Out**: Simultaneous investigation of technical solutions

**Performance Optimization**:
- **Scout Block Hook**: Cross-platform hook system blocking heavy directories
  - Automatic platform detection (Windows/Unix/WSL)
  - Zero-configuration setup
  - Blocks: node_modules, __pycache__, .git/, dist/, build/
  - Improves AI agent response time and token efficiency
- **Config Hardening**: Shared hook config is authored under `.evcrate/source/.claude/` and generated under `.evcrate/source/.codex/`, while logical target names remain `.claude` and `.codex` for HOME bindings. Codex bridges stay pinned to `EVCRATE_CONFIG_DIR=.codex`; runtime resolves from the discovered project root, privacy blocking uses only the selected local config, and Python-managed global sync preserves user-owned `~/.codex/.evcrate.json` unless full sync is explicitly requested

### 2. Comprehensive Slash Commands (50+)

**Core Development**:
- `/plan [task]` - Research and create implementation plans
- `/cook [tasks]` - Implement features with full workflow
- `/test` - Run comprehensive test suites
- `/ask [question]` - Expert technical consultation
- `/bootstrap` - Initialize new projects end-to-end
- `/brainstorm [question]` - Solution ideation and evaluation

**Debugging & Fixing**:
- `/debug [issues]` - Deep issue analysis
- `/fix:fast [issues]` - Quick bug fixes
- `/fix:hard [issues]` - Complex problem solving with subagents
- `/fix:ci [url]` - GitHub Actions log analysis
- `/fix:test [issues]` - Test suite debugging
- `/fix:types` - Type error resolution
- `/fix:logs [issue]` - Log analysis and fixes
- `/fix:ui [issue]` - UI/UX problem solving

**Design & Content**:
- `/design:fast [tasks]` - Quick design creation
- `/design:good [tasks]` - Immersive design development
- `/design:3d [tasks]` - Interactive 3D designs with Three.js
- `/design:screenshot [image]` - Design from screenshots
- `/design:video [video]` - Design from video references
- `/content:fast [request]` - Quick copywriting
- `/content:good [request]` - High-quality content creation
- `/content:enhance [issues]` - Copy improvement
- `/content:cro [issues]` - Conversion optimization

**Documentation**:
- `/docs:init` - Create initial documentation
- `/docs:update` - Update existing documentation
- `/docs:summarize` - Generate codebase summaries

**Git Operations**:
- `/git:cm` - Stage and commit changes
- `/git:cp` - Stage, commit, and push
- `/git:pr [branch]` - Create pull requests

**Project Management**:
- `/watzup` - Review recent changes and status
- `/journal` - Development journal entries
- `/scout [prompt] [scale]` - Parallel codebase exploration

### 3. Extensive Skills Library (20+ Skills)

**Categories**:
- **Authentication**: better-auth integration
- **Cloud**: Cloudflare (Workers, R2, Browser Rendering), Google Cloud
- **Databases**: MongoDB, PostgreSQL
- **Design**: Canvas-based design generation
- **Debugging**: Systematic debugging, root-cause tracing, defense-in-depth
- **Development**: Next.js, Turborepo, EVCrate workflows
- **Documentation**: Repomix, docs-seeker
- **Documents**: PDF, DOCX, PPTX, XLSX processing
- **Infrastructure**: Docker containerization
- **Media**: FFmpeg, ImageMagick
- **MCP**: Model Context Protocol server building
- **Problem Solving**: Meta-pattern recognition, collision-zone thinking
- **UI**: shadcn/ui, Tailwind CSS, Remix Icon
- **Ecommerce**: Shopify integrations

### 4. Automated Release Management

**Features**:
- Semantic versioning (MAJOR.MINOR.PATCH)
- Conventional commit enforcement
- Automated changelog generation
- GitHub releases with assets
- Optional NPM publishing
- Git hooks for commit validation

**Commit Types**:
- `feat:` → Minor version bump
- `fix:` → Patch version bump
- `BREAKING CHANGE:` → Major version bump
- `docs:`, `refactor:`, `test:`, `ci:` → Patch bump

### 5. Development Workflow Automation

**Pre-Commit**:
- Commit message linting (conventional commits)
- Optional test execution

**Pre-Push**:
- Linting validation
- Test suite execution
- Build verification

**CI/CD**:
- GitHub Actions integration
- Automated releases on main branch
- Test automation
- Build validation

## Technical Requirements

### Functional Requirements

**FR1: Agent Orchestration**
- Support sequential and parallel agent execution
- Enable agent-to-agent communication via file system
- Maintain context across agent handoffs
- Track agent task completion

**FR2: Command System**
- Parse slash commands with arguments
- Route to appropriate agent workflows
- Support nested commands (e.g., `/fix:ci`)
- Provide command discovery and help

**FR3: Documentation Management**
- Auto-generate codebase summaries with repomix
- Keep docs synchronized with code changes
- Maintain project roadmap and changelog
- Update API documentation automatically

**FR4: Quality Assurance**
- Run tests before commits
- Perform code review automatically
- Check type safety and compilation
- Validate security best practices

**FR5: Git Workflow**
- Enforce conventional commits
- Scan for secrets before commits
- Generate professional commit messages
- Create clean PR descriptions

**FR6: Project Bootstrapping**
- Initialize git repository
- Gather requirements through questions
- Research tech stacks
- Generate project structure
- Create initial documentation
- Set up CI/CD

**FR7: Verified Distribution Publication**
- Provide `--publish`, `--publish --dry-run [--json]`, and `--recover` operations.
- Publish only artifacts authorized by a complete, current `.evcrate/build-manifest.json`.
- Apply target HOME policies atomically while preserving declared and unmanaged user files.
- Persist owner-only release state, reject concurrent publishers, and recover interrupted promotions.
- Include verified build metadata and generated assets in release CI without mutating developer HOME.
- Distribute the canonical `advisor-strategy` skill, brief contract, and normal
  high-tier `advisor` subagent through verified target artifact paths.
- Add one non-invoking strategy pointer to every generated command skill. Scoped
  implementation commands recognize final standalone `--advice`, preserve
  ordinary `@advisor` work input, and retain deterministic stuck escalation.
- Publish one shared checkpoint controller at `$HOME/.evcrate/bin/evcrate-advisor`.
  All generated harnesses send the same direct checkpoint object; no harness
  owns a controller copy or selects a backend.
- Resolve one required global policy at
  `$HOME/.evcrate/advisor-routing.json`. Version 1 has exactly `version` and
  `advisor` at the top level, and exactly `backend`, `model`, `effort`, and
  `timeout_ms` in `advisor`. `timeout_ms` is an integer in 60000..900000.
- A missing policy fails `ROUTE_POLICY_REQUIRED`. A top-level legacy `hosts`
  policy fails `ROUTE_SCHEMA_MIGRATION_REQUIRED` with an actionable migration
  message. Malformed, oversized, duplicate-key, credential-bearing, unsafe,
  extra-field, and invalid policies fail closed without defaults or merging.
- Candidate backends are exactly `claude`, `codex`, `antigravity`, `pi`, and
  `omp`; Claude, Codex, Pi, and OMP are enabled. Antigravity remains a disabled
  candidate slot returning `CLI_CAPABILITY_UNSUPPORTED` before model execution.
  Gemini is not a candidate and returns `ADAPTER_UNSUPPORTED`.
- The controller uses one UUID, one ordered preflight, one selected adapter,
  one final model-process attempt, and one normalized result. It has no native
  callback, backend switch, model substitution, effort downgrade, retry,
  fallback, arbitrary launcher, broker, direct provider API, or credential
  store.
- The direct `evcrate-advisor-checkpoint/v1` request has exactly ten fields:
  `protocol`, `version`, `checkpoint`, `question`, `kind`, `task_or_phase`,
  `evidence`, `changed_paths`, `prior_counsel`, and `owner_disposition`.
  Requests are bounded at 32 KiB with bounded question/task/terminal evidence,
  four evidence files, and sixteen changed paths. Safe normalized POSIX paths,
  duplicate keys, invalid UTF-8, control characters, credentials, and metadata
  paths are rejected.
- The controller emits one frozen `evcrate-advisor-controller/v1` envelope.
  Success adds normalized `evcrate-advisor-result/v1`; failure adds only
  `code`, `category`, `action`, and `message`. Receipt fields are fixed and
  include backend, model, effort, controller version, adapter diagnostic
  version, and elapsed milliseconds. Stdout has one line and stderr is empty.
- The shared runner uses fixed argv, `shell:false`, allowlisted environment,
  stdin-only evidence, detached POSIX process groups, bounded streams, TERM to
  KILL cancellation, child reaping, and an empty owner-only temporary
  workspace. Probe and final time share the policy deadline.
- Build manifests use schema 2 and `controller_hashes`. The only authored
  controller source is `.evcrate/source/.evcrate/bin`; publication atomically
  replaces `$HOME/.evcrate/bin`, preserves the policy file, and recovers the
  complete prior directory from its release marker.
- The first-release controller claim is Linux-only. Fake-CLI contracts are
  deterministic tests; authenticated installed-CLI qualification is an operator
  check repeated after CLI upgrades.

**Checkpoint compatibility boundary**
- `advisor-strategy` remains static, non-binding guidance. The workflow calls
  the central controller only at named review, repeated-blocker, or decision
  checkpoints after prerequisite evidence exists.
- Final standalone `--advice` is explicit and `@advisor` remains ordinary task
  text. Only outer `ADVICE_READY` completes supervision; all failures leave the
  checkpoint incomplete.
- `/advise` is a separate inline-first interview feature. It is not an
  alternate execution path for `--advice`.
- Generated target trees are derived artifacts. Build/check and the focused
  controller/distribution tests are the evidence; projections are not hand-edited.

**FR8: Native Pi Phase 01 Distribution Contract**
- Register `.pi` as one manifest-owned target rooted at `.evcrate/source/.pi` with one `EVCRATE_HOME/.pi` HOME binding.
- Run the staging-only Pi adapter only with a contained empty `PI_OUTPUT_DIR`; reject direct/global output modes, path escapes, symlinked inputs, and unsafe adapter helpers.
- Hash the Pi adapter and declared helper source during both build and publication verification.
- Merge only `npm:pi-subagents@0.44.0`, `npm:@juicesharp/rpiv-ask-user-question@2.4.0`, and `npm:@juicesharp/rpiv-todo@2.4.0` into the shared `agent/settings.json` package key.
- Preserve user-owned settings, package entries, provider/model values, and sessions; keep the shared settings file outside file-level managed ownership.
- Detect `pi-code` conflicts without removing them. Require manual Pi quiescence and abort on concurrent HOME changes before promotion.
- Limit Phase 01 to deterministic target/build/publish contracts. Later runtime delivery does not authorize a live cutover.

**FR9: Native Pi Phase 03 Runtime (implemented; live cutover user-controlled)**
- Register native Markdown commands recursively and preserve provider-neutral command/workflow content.
- Bound model-initiated nested command dispatch by depth, invocation count, and cycle detection; reject dispatcher calls mixed with sibling tool calls.
- Enforce command `allowed-tools` with an authoritative `tool_call` policy gate and restore the active tool set after settlement or shutdown.
- Resolve `strong`, `standard`, `fast`, and `parent` roles against the active provider and Pi model registry only at delegation time; never silently cross provider boundaries.
- Delegate only through the structured `pi-subagents` transport, preserving its public `workflowScript` tool, and invoke the child-start seam before each request.
- Keep the Node.js baseline at `>=22.19.0` and the managed package identities pinned exactly to `npm:pi-subagents@0.44.0`, `npm:@juicesharp/rpiv-ask-user-question@2.4.0`, and `npm:@juicesharp/rpiv-todo@2.4.0`.
- Regression coverage includes the XML closing-tag marker corruption and shell
  descendant timeout/process-tree defects. Deterministic build/check and
  publication-hash gates are complete; live Pi cutover remains separately
  user-controlled and requires manual quiescence.

**Advisor compatibility boundary**
- `advisor-strategy` remains static decision guidance. The workflow sends one
  direct ten-field checkpoint to `$HOME/.evcrate/bin/evcrate-advisor` only at a
  named review, repeated-blocker, or decision checkpoint.
- The required global policy has one `advisor` target with backend, model,
  effort, and an inclusive 60000..900000 `timeout_ms`. Missing or legacy-host
  policy fails closed; no defaults, inheritance, substitution, retry, backend
  switch, callback, or local fallback exists.
- Candidate backends are Claude, Codex, Pi, Antigravity, and OMP. Claude,
  Codex, Pi, and OMP are enabled; Antigravity is disabled with
  `CLI_CAPABILITY_UNSUPPORTED`; Gemini is unsupported rather than registered.
- Requests are strict and bounded; the controller creates the correlation UUID,
  validates input, qualifies one adapter, uses one empty owner-only workspace,
  runs one final process, and normalizes one result.
- The outer controller envelope is frozen and exposes only the fixed receipt
  plus sanitized typed failure fields. Only `ADVICE_READY` completes the
  checkpoint; a failed or nonzero invocation remains incomplete.
- Build/check and publication use schema-2 controller hashes for the sole
  `.evcrate/source/.evcrate/bin` source and atomic `$HOME/.evcrate/bin`
  promotion. The first-release claim is Linux-only. Deterministic fake-CLI
  tests do not replace operator qualification of installed CLIs after upgrades.
- `/advise` remains a separate inline-first interview and is not a checkpoint
  controller execution path. Generated projections remain derived artifacts and
  are never hand-edited.

### Non-Functional Requirements

**NFR1: Performance**
- Command execution < 5 seconds for simple operations
- Parallel agent spawning for independent tasks
- Efficient file system operations
- Optimized context loading

**NFR2: Reliability**
- Handle agent failures gracefully
- Provide rollback mechanisms
- Validate agent outputs
- Error recovery and retry logic

**NFR3: Usability**
- Clear command syntax and documentation
- Helpful error messages
- Progress indicators for long operations
- Comprehensive command help

**NFR4: Maintainability**
- Modular agent definitions
- Reusable workflow templates
- Clear separation of concerns
- Self-documenting code and configs

**NFR5: Security**
- Secret detection before commits
- No AI attribution in public commits
- Secure handling of credentials
- Security best practice enforcement

**NFR6: Scalability**
- Support projects of any size
- Handle large codebases efficiently
- Scale agent parallelization
- Manage complex dependency graphs

## Success Metrics

### Adoption Metrics
- GitHub stars and forks
- NPM package downloads
- Active users and installations
- Community engagement (issues, discussions, PRs)

### Performance Metrics
- Average time to bootstrap new project: < 10 minutes
- Planning to implementation cycle time: 50% reduction
- Documentation coverage: > 90%
- Test coverage: > 80%
- Code review time: 75% reduction

### Quality Metrics
- Conventional commit compliance: 100%
- Zero secrets in commits: 100%
- Automated test pass rate: > 95%
- Documentation freshness: < 24 hours lag

### Developer Experience Metrics
- Time to first commit: < 5 minutes
- Developer onboarding time: 50% reduction
- Context switching overhead: 60% reduction
- Satisfaction score: > 4.5/5.0

## Technical Architecture

### Core Components

**1. Agent Framework**
- Agent definition files (Markdown with frontmatter)
- Agent orchestration engine
- Context management system
- Communication protocol (file-based reports)

**2. Command System**
- Command parser and router
- Argument handling ($ARGUMENTS, $1, $2, etc.)
- Command composition and nesting
- Help and discovery system

**3. Workflow Engine**
- Sequential execution support
- Parallel task scheduling
- Dependency resolution
- Error handling and recovery

**4. Documentation System**
- Repomix integration for codebase compaction
- Template-based doc generation
- Auto-update triggers
- Version tracking

**5. Quality System**
- Test runner integration
- Code review automation
- Type checking and linting
- Security scanning

**6. Release System**
- Semantic versioning engine
- Changelog generation
- GitHub release creation
- Asset packaging

### Technology Stack

**Runtime**:
- Node.js >= 22.19.0
- Bash scripting (Unix hooks)
- PowerShell scripting (Windows hooks)
- Cross-platform hook dispatcher (Node.js)

**AI Platforms**:
- Anthropic Claude (Sonnet 4, Opus 4)
- OpenRouter integration
- Google Gemini (for docs-manager)
- Grok Code (for git-manager)

**Development Tools**:
- Semantic Release
- Commitlint
- Husky (git hooks)
- Repomix (codebase compaction)
- Scout Block Hook (performance optimization)

**CI/CD**:
- GitHub Actions
- Conventional Commits
- Automated versioning

### Integration Points

**MCP Tools**:
- **context7**: Read latest documentation
- **sequential-thinking**: Structured problem solving
- **SearchAPI**: Google and YouTube search
- **review-website**: Web content extraction
- **VidCap**: Video transcript analysis

**External Services**:
- GitHub (Actions, Releases, PRs)
- Discord (notifications)
- NPM (optional package publishing)

## Use Cases

### UC1: Bootstrap New Project
**Actor**: Developer
**Goal**: Create new project from scratch
**Flow**:
1. Run `/bootstrap` command
2. Answer requirement questions
3. AI researches tech stacks
4. Review and approve recommendations
5. AI generates project structure
6. AI implements initial features
7. AI creates tests and documentation
8. Project ready for development

**Outcome**: Fully functional project with tests, docs, CI/CD in < 10 minutes

### UC2: Implement New Feature
**Actor**: Developer
**Goal**: Add feature with full workflow
**Flow**:
1. Run `/cook "add user authentication"`
2. Planner creates implementation plan
3. Researcher agents explore auth solutions
4. Developer reviews and approves plan
5. AI implements code
6. AI writes comprehensive tests
7. AI performs code review
8. AI updates documentation
9. AI commits with conventional message

**Outcome**: Feature complete with tests, docs, and clean git history

### UC3: Debug Production Issue
**Actor**: Developer
**Goal**: Identify and fix production bug
**Flow**:
1. Run `/fix:logs "API timeout errors"`
2. Debugger agent analyzes logs
3. Root cause identified
4. Fix plan created
5. AI implements solution
6. Tests validate fix
7. Code review confirms quality
8. Commit and deploy

**Outcome**: Bug fixed with comprehensive testing and documentation

### UC4: Create Pull Request
**Actor**: Developer
**Goal**: Submit code for review
**Flow**:
1. Run `/git:pr feature/new-auth main`
2. AI analyzes all commits in branch
3. AI generates comprehensive PR description
4. PR created with proper context
5. Links to related issues added

**Outcome**: Professional PR ready for review

### UC5: Update Documentation
**Actor**: Project Manager
**Goal**: Ensure docs are current
**Flow**:
1. Run `/docs:update`
2. Docs manager scans codebase
3. Generates fresh summary with repomix
4. Identifies outdated sections
5. Updates API docs, guides, architecture
6. Validates naming conventions
7. Creates update report

**Outcome**: Documentation synchronized with code

## Constraints & Limitations

### Technical Constraints
- Requires Node.js >= 22.19.0
- Depends on Claude Code or Open Code CLI
- File-based communication has I/O overhead
- Token limits on AI model context windows

### Operational Constraints
- Requires API keys for AI platforms
- GitHub Actions minutes for CI/CD
- Internet connection for MCP tools
- Storage for repomix output files

### Design Constraints
- Agent definitions must be Markdown with frontmatter
- Commands follow slash syntax
- Reports use specific naming conventions
- Conventional commits required

## Risks & Mitigation

### Risk 1: AI Model API Failures
**Impact**: High
**Likelihood**: Medium
**Mitigation**: Retry logic, fallback models, graceful degradation

### Risk 2: Context Window Limits
**Impact**: Medium
**Likelihood**: High
**Mitigation**: Repomix for code compaction, selective context loading, chunking

### Risk 3: Agent Coordination Failures
**Impact**: High
**Likelihood**: Low
**Mitigation**: Validation checks, error recovery, rollback mechanisms

### Risk 4: Secret Exposure
**Impact**: Critical
**Likelihood**: Low
**Mitigation**: Pre-commit scanning, .gitignore enforcement, security reviews

### Risk 5: Documentation Drift
**Impact**: Medium
**Likelihood**: Medium
**Mitigation**: Automated triggers, freshness checks, validation workflows

## Future Roadmap

### Phase 1: Foundation (Complete - v1.0-1.8)
- ✅ Core agent framework
- ✅ Slash command system
- ✅ Automated releases
- ✅ Skills library
- ✅ Documentation system

### Phase 2: Enhancement (Current)
- ✅ Repository adaptation to EVCrate (renaming, configurations, scripts integration)
- ✅ EVCrate hook config hardening (`.evcrate.json` resolution, fixed Codex selector, and local-only privacy toggle)
- 🔄 Additional skills (GCP, AWS, Azure)
- 🔄 UI/UX improvements
- 🔄 Performance optimization
- 🔄 Enhanced error handling

### Phase 3: Advanced Features (Planned)
- 📋 Visual workflow builder
- 📋 Custom agent creator UI
- 📋 Team collaboration features
- 📋 Analytics and insights dashboard
- 📋 Multi-language support

### Phase 4: Enterprise (Future)
- 📋 Self-hosted deployment
- 📋 Advanced security features
- 📋 Compliance automation
- 📋 Custom integrations
- 📋 Enterprise support

## Dependencies & Integration

### Required Dependencies
- Node.js runtime environment
- Git version control
- Claude Code or Open Code CLI
- API keys for AI platforms

### Optional Dependencies
- Discord webhook for notifications
- GitHub repository for CI/CD
- NPM account for publishing

### Integrations
- GitHub Actions
- Semantic Release
- Commitlint
- Husky
- Repomix
- Various MCP servers

## Compliance & Standards

### Coding Standards
- YANGI (You Aren't Gonna Need It)
- KISS (Keep It Simple, Stupid)
- DRY (Don't Repeat Yourself)
- Files < 500 lines
- Comprehensive error handling
- Security-first development

### Git Standards
- Conventional Commits
- Clean commit history
- No AI attribution
- No secrets in commits
- Professional PR descriptions

### Documentation Standards
- Markdown format
- Up-to-date (< 24 hours)
- Comprehensive coverage
- Clear examples
- Proper versioning

### Testing Standards
- Unit test coverage > 80%
- Integration tests for workflows
- Error scenario coverage
- Performance validation
- Security testing

## Glossary

- **Agent**: Specialized AI assistant with specific expertise and responsibilities
- **Slash Command**: Shortcut that triggers agent workflows (e.g., `/plan`)
- **Skill**: Reusable knowledge module for specific technologies or patterns
- **MCP**: Model Context Protocol for AI tool integration
- **Repomix**: Tool for compacting codebases into AI-friendly format
- **Sequential Chaining**: Running agents one after another with dependencies
- **Parallel Execution**: Running multiple agents simultaneously
- **Query Fan-Out**: Spawning multiple researchers to explore different approaches
- **Conventional Commits**: Structured commit message format (type(scope): description)

## Appendix

### Related Documentation
- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)
- [System Architecture](./system-architecture.md)
- [Commands Reference](../guide/COMMANDS.md)

### External Resources
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code/overview)
- [Open Code Documentation](https://opencode.ai/docs)
- [Conventional Commits](https://conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

### Support & Community
- GitHub Issues: https://github.com/NEBULEA-M/evcrate/issues
- Discussions: https://github.com/NEBULEA-M/evcrate/discussions
- Repository: https://github.com/NEBULEA-M/evcrate

## Unresolved Questions

1. **Performance Benchmarks**: Need to establish baseline metrics for agent execution times
2. **Multi-Repository Support**: How to handle projects spanning multiple repositories?
3. **Custom AI Model Support**: Should we support other AI platforms beyond Claude and OpenRouter?
4. **Agent Marketplace**: Community-contributed agents and skills distribution mechanism?
5. **Real-Time Collaboration**: How to handle multiple developers using agents simultaneously?
