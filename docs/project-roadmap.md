# EVCrate - Project Roadmap

**Last Updated:** 2026-09-01 17:18:40 +0700
**Current Version:** 1.14.8
**Repository:** https://github.com/NEBULEA-M/evcrate

## Executive Summary

EVCrate (formerly ClaudeKit Engineer) is an AI-powered development orchestration framework enabling developers to build professional software faster through intelligent agent collaboration, automated workflows, and comprehensive quality management. The project has successfully completed core foundation phases and is advancing cross-platform compatibility and advanced features.

---

## Phase Overview

### Phase 1: Foundation (COMPLETE)
**Status:** ✅ Complete | **Completion:** v1.8.0
**Progress:** 100%

Established core agent orchestration framework, slash command system, automated releases, and foundational skills library.

**Key Achievements:**
- Multi-agent orchestration engine
- 50+ slash commands (plan, cook, test, ask, bootstrap, debug, fix:*)
- Semantic versioning & automated releases
- 20+ skills library (auth, cloud, databases, design, etc.)
- Documentation system with repomix integration
- Scout Block Hook for cross-platform performance optimization
- Git workflows with conventional commits enforcement

---

### Phase 2: Cross-Platform Enhancement (IN PROGRESS)
**Status:** 🔄 In Progress | **Completion Target:** Dec 2025
**Progress:** 55%

Expanding platform support and improving developer experience across Windows, macOS, and Linux environments.

#### Sub-Task: Windows Statusline Support
**Status:** ✅ COMPLETE
**Completed:** 2025-11-11
**Priority:** Medium

Enabled Windows users to use Claude Code statusline functionality through multiple cross-platform script implementations.

**Deliverables Completed:**
- `statusline.ps1` - PowerShell native implementation for Windows
- `statusline.js` - Node.js universal fallback implementation
- `docs/statusline-windows-support.md` - Comprehensive user guide (4 setup options)
- `docs/statusline-architecture.md` - Technical architecture & implementation details
- All 5 implementation phases complete:
  - Phase 1: Research & Analysis
  - Phase 2: PowerShell Implementation
  - Phase 3: Node.js Fallback
  - Phase 4: Platform Detection & Wrapper
  - Phase 5: Testing & Documentation

**Features:**
- ✅ PowerShell 5.1+ & PowerShell Core 7+ support
- ✅ Node.js 16+ universal fallback
- ✅ Git Bash integration
- ✅ WSL full compatibility
- ✅ Feature parity: colors, git branch, models, sessions, costs, tokens, progress bars
- ✅ ANSI color support with NO_COLOR environment variable
- ✅ ccusage integration for session metrics
- ✅ UTF-8 encoding & emoji support

**Performance:**
- PowerShell 5.1: ~250ms cold, ~150ms warm
- PowerShell 7+: ~150ms cold, ~100ms warm
- Node.js: ~100ms cold, ~50ms warm
- With ccusage: ~300ms typical

**Documentation Quality:**
- User setup guide with 4 configuration options
- Troubleshooting section (9 common issues)
- Performance benchmarks
- Platform compatibility matrix
- Migration guide between implementations
- Advanced configuration examples
- 380+ lines of comprehensive guidance

#### Sub-Task: Refactor Distribute Script to Python and HOME Publication
**Status:** ✅ COMPLETE | **Completed:** 2026-08-08
**Progress:** 100%

Refactor the legacy bash distribution script to a cross-platform Python script (`distribute.py`) to run natively on Windows, macOS, and Linux.

**Deliverables Completed:**
- `distribute.py` - Core distribution engine with standard libraries only
- `distribute_utils.py` - Path resolution and cross-platform utility helpers
- `distribute_sync.py` - Asset tree synchronization and cleanups
- `distribute_hooks.py` - Pre-tool javascript wrapper generations and settings.json hook adaptation
- Command-to-Skill converter implementation to migrate legacy slash commands to Antigravity skills
- All implementation phases complete:
  - Phase 1: Refactor Script to Python (COMPLETE - 2026-06-29)
  - Phase 2: NPM & Release Integration (COMPLETE - 2026-08-08)
  - Phase 3: Testing & Validation (COMPLETE - 2026-08-08)
  - Nested agent source and verified HOME publication (COMPLETE - 2026-08-08)

**Features:**
- ✅ Platform-independent python implementation
- ✅ Path safety using pathlib for backslash/forward-slash compatibility
- ✅ Dynamic environment configuration (EVCRATE_HOME, global mode, sync mode)
- ✅ Hook script execution and settings.json translation
- ✅ Converting slash commands to Antigravity skills

---

### Phase 3: Advanced Features (PLANNED)
**Status:** 📋 Planned | **Target Start:** Jan 2026
**Progress:** 0%

Future enhancements for AI-assisted development capabilities.

**Planned Items:**
- Visual workflow builder UI
- Custom agent creator UI
- Enhanced caching mechanisms
- Real-time collaboration features
- Analytics & insights dashboard
- Performance telemetry

---

### Phase 4: Enterprise (FUTURE)
**Status:** 📋 Future | **Target Start:** Q2 2026
**Progress:** 0%

Enterprise-grade features and deployment options.

**Planned Items:**
- Self-hosted deployment options
- Advanced security features
- Compliance automation
- Custom enterprise integrations
- Dedicated enterprise support

---

## Native Pi Migration Status

### Phase 01: Pi target and distribution contract — COMPLETE
**Completed:** 260809

- Registered the manifest-backed `.pi` target with one `EVCRATE_HOME/.pi` binding.
- Added contained staging, adapter/helper hashing, deterministic minimal output, shared-settings planning, preservation, conflict detection, rollback, and concurrent-change abort behavior.
- Managed package pins are `npm:pi-subagents@0.44.0`, `npm:@juicesharp/rpiv-ask-user-question@2.4.0`, and `npm:@juicesharp/rpiv-todo@2.4.0`.
- Pi settings remain shared user data; EVCrate owns only those package identities. Manual Pi quiescence is required for live publication.
- No live cutover has occurred. `pi-code` removal remains a manual user action.

### Phase 02: Deterministic Resource Migration — COMPLETE
**Completed:** 260809

- Delivered deterministic native Pi resource migration, including inventory validation, semantic compatibility translation, agent model-role conversion, hook/script dependency closure, and idempotence coverage.

### Phase 03: Native Commands, Structured Delegation, and Model Roles — COMPLETE
**Completed:** 260809

- Delivered the native command/delegation/model-role runtime scope.
- XML closing-tag handling and bounded POSIX process-group termination have regression coverage.

### Phase 04: Native Hooks and Managed Settings — COMPLETE

- The EVCrate extension is the single owner for generated canonical lifecycle/tool hooks, including fail-closed safety hooks and scoped session environment handling.

### Phases 05–06: ISOLATED VALIDATION AND USER CUTOVER PENDING

Build/check, packed-tarball, native Pi discovery, and temporary-HOME validation must be reviewed before a user-approved, manually quiescent live Pi cutover. The user must manually remove `pi-code` before a live dry-run and publication; no automation changes live provider settings. Deferred follow-up work includes the Codex-owned `.agents` refactor and explicit model-role routes for providers validated after OpenAI Codex. See [Native Pi migration](./pi-native-migration.md).

See [Native Pi migration](./pi-native-migration.md) for the implemented boundary.

## Current Development Focus

### Advisor Supervision and Interview Workflows
- ✅ Phase 02 canonical one-shot `--advice` supervision implementation and review complete (2026-08-23 22:27:03 +0700); user approved. Its two approved non-blocking follow-ups closed (2026-08-23 23:00:08 +0700): duplicate `fix/test.md` step numbering corrected, and the Codex distribution assertion now generates Gemini output in a fresh temporary root before checking generated commands. Reviewer-reported validation: focused 50/50; `npm test`: 146 Python + 46 Node.
- ✅ Phase 03 `/advise` interview and Claude relay, Phase 04 generated-target rollout, and Phase 05 migration documentation/release gates complete. Codex, Pi, Gemini, and Antigravity now receive generated capability-accurate checkpoint/inline advisory surfaces with explicit relay rejection; generated-help warnings were fixed and target checks passed. Full validation and review passed; release/publish/commit remains separately user-authorized.
- ✅ Central Advisor CLI Supervisor — the shared `~/.evcrate/bin/evcrate-advisor` controller now owns one required global target, direct ten-key checkpoints, bounded isolated execution, one terminal envelope, schema-2 controller hashes, atomic `.evcrate/bin` publication, and qualified OMP plus disabled Antigravity candidates. Generated harnesses contain no per-harness controller runtime. Real vendor-CLI qualification and live HOME cutover remain user-operated follow-up work.

### TypeScript/npm Control-Plane CLI
- ✅ Phase 5 target projection adapters complete (2026-09-01; [Phase 5 plan](../plans/260827-2218-typescript-control-plane-cli/phase-05-adapters.md)): Claude, Gemini, Antigravity, Codex, Pi, OMP, and Copilot are registered in the confirmed parity order, with 2,033 exact Python parity delta records.
- Validation is staging-only and target-isolated: adapters write only declared roots, reject unsafe or mutated outputs, and exclude advisor-controller copies. `npm run test:phase5` passed with a clean build and **12/12** tests.
- Python remains authoritative for generation, build/check, HOME publication, and recovery until target-specific cutover. Phase 6 does not claim publication, live cutover, HOME support, Python-free completion, deployment behavior, or `main` merge.
- ✅ Phase 6 registry/imports complete (2026-09-01; [Phase 6 plan](../plans/260827-2218-typescript-control-plane-cli/phase-06-registry-and-imports.md)): manifest-derived canonical resource roots, deterministic schema-v1 registry, explicit provenance/capability-gated imports, and source/registry CAS; controller, policy, generated, target-manifest, and HOME artifacts remain outside registry ownership.
- Focused evidence: `npm run build` exited 0; `npm run test:phase6` **23/23**, `npm run test:protocol` **19/19**, `npm run test:phase4` **31/31**, and `npm run test:phase5` **12/12**; aggregate **85/85**. Review residuals are limited to the documented low same-UID/path-race window and Linux-first security scope.
- ✅ Phase 7 scopes, advisor settings, and CAS complete (2026-09-01; [Phase 7 plan](../plans/260827-2218-typescript-control-plane-cli/phase-07-scopes-and-cas.md)): package-local `.evcrate/scopes/global.json` and project scope files keyed by the SHA-256 hash of canonical absolute project-root bytes; global/project inheritance and explicit disablement are deterministic.
- Scope mutations use `{registryRevision,globalScopeRevision,projectScopeRevision|null}`. Typed preview/apply tokens bind selected targets, canonical/registry/manifest/adapter hashes, independent output-root hashes, expiry, and replay/recovery boundaries.
- Advisor settings uses the separate `advisor-settings.lock` and frozen v1 complete-document request-file coordinator with opaque byte/identity/mode revisions, single-use tokens, whole-document apply, and dedicated journal/recovery. Mutable command/workflow/resource model bindings remain deferred.
- Focused evidence: all builds passed; Phase 7 **16/16**, protocol **20/20**, CLI **31/31**, Phase 6 **23/23**, Phase 4 **31/31**, and Phase 5 **12/12**; aggregate **133/133**. Review approved with no findings. Feature-worktree evidence only; no publication, live cutover, Python-free distribution, or `main` merge is claimed.
 

### OMP Command Namespace Prefix
- 🔄 Phase 01 map/translate complete (**100%**); parent plan **43%** overall. Review **9.5/10** approved, focused validation and build/check passed.
- 📋 Phase 02 regeneration/documentation and Phase 03 contract verification pending. No HOME publication.

### 1. Windows Ecosystem Support
- ✅ Statusline cross-platform support
- 🔄 Refactor Distribute Script to Python (Phase 1 complete)
- 📋 Windows terminal integration optimization
- 📋 PowerShell Core expansion
- 📋 WSL2 performance optimization

### 2. Additional Cloud Skills
- 📋 Google Cloud Platform (GCP) integration
- 📋 Amazon Web Services (AWS) integration
- 📋 Microsoft Azure integration

### 3. Enhanced Documentation
- ✅ Updated Windows support guides
- 📋 API reference automation
- 📋 Architecture guide expansion
- 📋 Tutorial library

### 4. Performance Optimization
- ✅ Scout Block Hook for agent performance
- 📋 Caching strategies for common operations
- 📋 Token optimization
- 📋 Parallel execution enhancements

---

## Milestone Tracking

### Q4 2025 Milestones
| Milestone | Status | Due Date | Progress |
|-----------|--------|----------|----------|
| Windows Statusline Support | ✅ Complete | 2025-11-11 | 100% |
| Additional Skills Library Expansion | 📋 Pending | 2025-12-15 | 0% |
| Enhanced Error Handling | 📋 Pending | 2025-12-31 | 0% |

### Q1 2026 Milestones
| Milestone | Status | Due Date | Progress |
|-----------|--------|----------|----------|
| Visual Workflow Builder | 📋 Planned | 2026-03-31 | 0% |
| Custom Agent Creator UI | 📋 Planned | 2026-03-31 | 0% |
| Cloud Platform Integrations (GCP, AWS, Azure) | 📋 Planned | 2026-03-31 | 0% |

### Q2 2026 Milestones
| Milestone | Status | Due Date | Progress |
|-----------|--------|----------|----------|
| Repository Adaptation to EVCrate | ✅ Complete | 2026-06-28 | 100% |
| Refactor Distribute Script to Python (Phase 1) | ✅ Complete | 2026-06-29 | 100% |

### Q3 2026 Milestones
| Milestone | Status | Due Date | Progress |
|-----------|--------|----------|----------|
| TypeScript CLI foundation (Phase 3) | ✅ Complete | 2026-08-31 | 100% |
| TypeScript CLI distribution safety (Phase 4) | ✅ Complete | 2026-08-31 | 100% |
| TypeScript CLI target adapters (Phase 5) | ✅ Complete | 2026-09-01 | 100% |
| TypeScript CLI registry/imports (Phase 6) | ✅ Complete | 2026-09-01 | 100% |
| TypeScript CLI scopes/advisor-settings/CAS (Phase 7) | ✅ Complete | 2026-09-01 | 100% |

---

## Success Metrics

### Adoption
- GitHub stars: Tracking (public launch pending)
- NPM downloads: Tracking
- Active users & installations: Tracking
- Community engagement: In development

### Performance Targets
- Bootstrap time: < 10 minutes
- Planning to implementation cycle: 50% reduction
- Documentation coverage: > 90%
- Test coverage: > 80%
- Code review time: 75% reduction

### Quality Standards
- Conventional commit compliance: 100%
- Zero secrets in commits: 100%
- Automated test pass rate: > 95%
- Documentation freshness: < 24 hours lag

### Developer Experience
- Time to first commit: < 5 minutes
- Onboarding time: 50% reduction vs baseline
- Context switching overhead: 60% reduction
- Satisfaction score target: > 4.5/5.0

---

## Feature Inventory

### Core Features (COMPLETE)
- ✅ Multi-agent orchestration system
- ✅ 50+ slash commands
- ✅ Comprehensive skills library (20+)
- ✅ Automated release management
- ✅ Development workflow automation
- ✅ Documentation system with repomix
- ✅ Cross-platform performance optimization
- ✅ Git workflow automation
- ✅ Comprehensive error handling

### Recent Additions (2026-07-19)
- ✅ Codex Model Migration (COMPLETE): migrated parent and subagent role tiers to GPT-5.6 equivalents, preserved reasoning efforts, regenerated Codex outputs, and passed tester/code-review gates (9/10 review). Distribution diff review retained only pre-existing scout whitespace and migration-matrix timestamp drift.

### Recent Additions (2026-08-02)
- ✅ Two-Gate Distribution and Enforced Advisor — Phase 1 (DONE): explicit build/check/publish/all CLI contracts, immutable distribution context, staged project-doc generation, fatal subprocess handling, guarded direct-global migrator modes, atomic promotion safeguards, and 17/17 CLI regression tests. `pytest` unavailable; validation used `python3 -m unittest tests/test_distribution_cli.py`.
- ✅ Two-Gate Distribution and Enforced Advisor — Phase 2 (DONE, 2026-08-02 12:37 +0700): deterministic staged targets, declared overlays, parser-backed exact patches, collision/traversal/symlink validation, hashed build manifests, atomic recovery/locking, and byte-level drift checks. Validation: 40/40 unittest cases; `pytest` unavailable.
- ✅ Two-Gate Distribution and Enforced Advisor — Phase 3 (DONE, 2026-08-02): manifest-verified non-destructive HOME publish with dry-run JSON/text, owner-only locking/markers and recovery; Gate 1 Antigravity artifact to `.gemini/config`; fail-closed release build/check and verified-output archive. Validation: full 50/50, `npm test` 46/46, build/check/lint passed.
- ⚠️ Two-Gate Distribution and Enforced Advisor — Phase 4 (superseded, 2026-08-02): the former Codex advisor runtime/MCP broker design was replaced after isolation revalidation; its broker/admission artifacts are removed by the skill-only replacement.
- ✅ Skill-Only Advisor Replacement — Phase 1 (DONE, 2026-08-02 20:09 +0700): retained the portable `advisor-strategy` skill, added one explicit non-invoking pointer to generated command skills, removed target-owned broker/MCP/admission artifacts, and preserved user-owned configuration.
- ✅ Skill-Only Advisor Replacement — Phase 2 (DONE, 2026-08-02 21:30 +0700): static packaging, pointer, runtime-absence, idempotence, preservation, and compatibility documentation complete. Validation: 52/52 tests passed via `npm test`; code review 10/10 approved. Removed `advisor_consult` callers must use explicit `$advisor-strategy`; no provider/model, App Server, MCP, or app invocation.

### Recent Additions (2026-08-12)
- ✅ Native Windows Pi Extension Loading — Phases 01–03 (DONE): canonical runtime-root resolution, explicit `PI_CODING_AGENT_DIR` precedence, Node platform-home fallback, generated/build parity, hook-adapter parity, focused regression coverage, and isolated published-artifact smoke completed. Phase 03 validation: focused Pi **13/13**, targeted distribution tests **46/46**, syntax **4/4**, build/check/publish pass, canonical/generated byte parity. Code review **9/10**, user approved. Plan progress: **75%** (3/4 phases); Phase 04 remains Pending. Full Pi **45/46** retains the known missing `subagents-doctor` baseline failure; native Windows not validated.

### Recent Additions (2026-09-01)
- ✅ TypeScript/npm control-plane CLI — Phase 6 registry/imports complete (2026-09-01; [Phase 6 plan](../plans/260827-2218-typescript-control-plane-cli/phase-06-registry-and-imports.md)): manifest-derived canonical resource roots, deterministic schema-v1 registry, explicit provenance/capability-gated imports, hash-bound previews, and atomic canonical-source plus registry CAS.
- Focused evidence: `npm run build` exited 0; `npm run test:phase6` **23/23**, `npm run test:protocol` **19/19**, `npm run test:phase4` **31/31**, and `npm run test:phase5` **12/12**; aggregate **85/85**.
- Feature-worktree evidence only; no publication, live cutover, HOME support, Python-free completion, or deployment behavior is claimed. Review residuals are limited to the documented low same-UID/path-race window and Linux-first security scope.
- ✅ TypeScript/npm control-plane CLI — Phase 7 scopes/advisor-settings/CAS complete (2026-09-01; [Phase 7 plan](../plans/260827-2218-typescript-control-plane-cli/phase-07-scopes-and-cas.md)): package-local scope files, explicit inheritance/disablement, revision-vector CAS, typed preview hashes/tokens, and a separate advisor-settings lock/journal/recovery boundary.
- Validation and review: all builds passed; Phase 7 **16/16**, protocol **20/20**, CLI **31/31**, Phase 6 **23/23**, Phase 4 **31/31**, and Phase 5 **12/12**; aggregate **133/133**; approved with no findings. No publication, live cutover, Python-free distribution, or `main` merge is claimed.


### Recent Additions (2026-08-31)
- ✅ TypeScript CLI foundation — Phase 3 complete ([implementation plan](../plans/260831-phase-03-cli-foundation/plan.md), completed 2026-08-31 14:41:04 +0700): delivered a one-shot CommonJS Node CLI, context/target registry, typed output/errors, diagnostic-only health bridge, Python-backed compatibility dispatch with exact `EVCRATE_STATE_DIR` handoff, package bins/exports, release build gate, and regression coverage.
- ✅ TypeScript control-plane CLI — Phase 4 distribution-safety continuation complete (2026-08-31): schema-2 manifest/build authorization, controller closure/hash verification, Python-compatible canonical hashing, owner/symlink/containment boundaries, TS/Python lock interoperability with stale quarantine, staged promotion/recovery, advisor policy-file CAS/recovery primitives, and Python authority preservation.
- Independent validation passed **110/110**: Phase 4 **29/29**, protocol **18/18**, CLI **28/28**, and Python authority **35/35**.
- Linux-first and same-UID race residuals remain documented. Live qualification and cutover remain deferred; no Python-free distribution parity or Windows security-equivalence claim is made.
- Advisor settings remain a typed, dedicated, fail-closed boundary: `get|preview|apply` return validated `CAPABILITY_UNSUPPORTED` without policy reads/writes; functional policy transactions are explicitly deferred to Phases 7–8.
- Request-file symlink protection is Linux-first (`O_NOFOLLOW` where available); Windows security equivalence and Python-free distribution parity are not claimed. Focused evidence: `npm run build` PASS, CLI **28/28**, protocol **16/16**, packed install/version/context smoke PASS; release CI gate is wired for build, protocol/CLI, legacy, distribution, Pi, and package checks. Final review **9.0/10**, zero critical/high findings.

### Recent Additions (2026-08-30)
- ✅ OMP Command Namespace Prefix — Phase 01 (Map and Translate) complete: OMP-only `cmd-<flattened>` map targets, centralized command/path/slash rendering, map-aware static help/scanner/catalog translation, and fail-closed lookup are implemented without changing canonical Claude or non-OMP projections. Validation: `py_compile`, migration **4/4**, focused migration/advisor/distribution suite **25/25**, and `distribute.py --build && --check` passed. Code review **9.5/10**, approved with no Critical or High release blocker. Phase 02 regeneration/documentation and Phase 03 contract verification remain pending.

### Recent Additions (2026-08-17)
- ✅ Unified External Scout CLI Strategies (COMPLETE): canonical read-only `agy` strategy, deterministic Codex/Gemini renderers, exact Gemini fallback ordering, strict marker validation, regenerated Codex/Gemini/Pi projections, and release-gate parity. Validation: focused migration tests **38/38**, full Python unittest **136/136**, `distribute.py --check`, `git diff --check`, and Python compilation passed. Unrelated Gemini `scout.md` generated drift and live CLI availability remain deferred risks.

### Recent Additions (2026-08-03)
- ✅ Claude HOME Distribution (COMPLETE): complete `.evcrate/source/.claude` tree is source-backed, verified through build/check, and published through the generic HOME distribution pipeline with unmanaged HOME preservation. Validation: targeted tests 63/63, `npm test` 69/69, `distribute.py --build` and `--check` passed; temporary HOME dry-run included 855 Claude entries without mutating `HOME/.claude`; code review 9/10 with no critical issues.

### Recent Additions (2026-07-18)
- ✅ Refactor EVCrate Config and Enable Codex Coding Levels Phase 3 (COMPLETE): user-facing config references, help output, TOML-aware discovery, and generated asset tracking updated to `.evcrate.json`; phase 4 remains pending.

### Recent Additions (2026-07-11)
- ✅ Simple Web Testing Demo Phase 05 (COMPLETE): Evidence report generated, README updated with test evidence, CSP meta tag added, k6 Windows install docs provided. Validation: npm test 4/4✓, npm test:e2e 5/5✓, npm test:lighthouse✓, npm test:web-gate 5/5 Playwright+Lighthouse✓. Code review 10/10, no issues. Full release gate workflow validated and skill dogfooding complete.

### Recent Additions (2026-07-10)
- ✅ Simple Web Testing Demo Phase 04: Applied web release gate with Playwright axe accessibility tests, visual snapshots, direct Lighthouse budget runner, required k6 smoke script with install guidance, README docs; 0 vulnerabilities audit, 5/5 test pass, 9.2/10 code review; Phase 04 marked complete.
- ✅ Simple Web Testing Demo Phase 03: Added core Vitest and Playwright tooling for the demo release-gate workflow; Phase 03 marked complete in implementation plan.

### Recent Additions (2026-06-29)
- ✅ Refactor Distribute Script to Python (Phase 1): Ported legacy bash distribution logic to Python, created utility helpers, sync logic, hook conversions, and command-to-skill parser.
- ✅ Repository Adaptation to EVCrate: Renamed the project, synced package metadata, updated release zip compilation structure, and ran migration cleanups.
- ✅ Windows statusline support (PowerShell, Node.js)
- ✅ Cross-platform statusline documentation
- ✅ Advanced configuration guides

### In Development
- ✅ Skill-Only Advisor Replacement — Phase 2 validation/review complete (52/52 tests, 10/10 review). This supersedes the former Codex advisor broker runtime design.
- ✅ Refactor Distribute Script and Nested HOME Publication: npm integration, root-clean agent source layout, build/check verification, and HOME publication complete.
- 🔄 Additional cloud platform integrations
- 🔄 UI/UX improvements
- 🔄 Enhanced error handling patterns
- 🔄 Performance optimization phase 2

### Planned
- 📋 Visual workflow builder
- 📋 Custom agent creator
- 📋 Team collaboration features
- 📋 Analytics dashboard

---

## Technical Architecture

### Technology Stack
- **Runtime:** Node.js >= 22.19.0, Bash, PowerShell, Cross-platform hooks
- **AI Platforms:** Anthropic Claude, OpenRouter, Google Gemini, Grok Code
- **Development Tools:** Semantic Release, Commitlint, Husky, Repomix, Scout Block Hook
- **CI/CD:** GitHub Actions
- **Languages:** JavaScript, Bash, PowerShell, Markdown

### Integration Points
- MCP Tools: context7, sequential-thinking, SearchAPI, review-website, VidCap
- External Services: GitHub (Actions, Releases, PRs), Discord, NPM
- Platforms: Windows, macOS, Linux, WSL, Git Bash

---

## Known Constraints & Limitations

### Technical
- Requires Node.js >= 22.19.0
- Depends on Claude Code or Open Code CLI
- File-based communication has I/O overhead
- Token limits on AI model context windows

### Operational
- Requires API keys for AI platforms
- GitHub Actions minutes for CI/CD
- Internet connection for MCP tools
- Storage for repomix output files

### Design
- Agent definitions must be Markdown with frontmatter
- Commands follow slash syntax
- Reports use specific naming conventions
- Conventional commits required

---

## Risk Management

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| AI Model API Failures | High | Medium | Retry logic, fallback models, graceful degradation |
| Context Window Limits | Medium | High | Repomix for code compaction, selective loading, chunking |
| Agent Coordination Failures | High | Low | Validation checks, error recovery, rollback mechanisms |
| Secret Exposure | Critical | Low | Pre-commit scanning, .gitignore enforcement, security reviews |
| Documentation Drift | Medium | Medium | Automated triggers, freshness checks, validation workflows |

---

## Dependencies & External Requirements

### Required
- Node.js runtime environment
- Git version control
- Claude Code or Open Code CLI
- API keys for AI platforms

### Optional
- Discord webhook for notifications
- GitHub repository for CI/CD
- NPM account for publishing
- PowerShell 5.1+ (Windows statusline)

### Key External Tools
- Semantic Release
- Commitlint
- Husky
- Repomix
- Scout Block Hook
- Various MCP servers

---

## Compliance & Standards

### Code Standards
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

---

## Changelog
### Unreleased

#### TypeScript/npm EVCrate Control-Plane CLI
- ✅ Phase 2 Protocol Contracts (canonical plan: `plans/260827-2218-typescript-control-plane-cli/phase-02-protocol-contracts.md`) complete and approved: resource control, complete advisor-settings, and qualification-only diagnostic contracts are frozen.
- Existing CommonJS counsel behavior remains unchanged; the authorized controller closure remains exactly 17 files. Persisted targets are exactly `claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, and `copilot`; `agy` is an input-only alias.
- Scoped validation: `npm run test:protocol` **16/16** (including TypeScript build), diagnostic **4/4**, advisor-controller **35/35**, and distribution build/CLI **22/22**; aggregate **77/77** tests pass.
- ✅ Phase 3 TypeScript CLI foundation is complete; see the [2026-08-31 roadmap entry](#recent-additions-2026-08-31) and [implementation plan](../plans/260831-phase-03-cli-foundation/plan.md) for validation, the Phase 3 completion-boundary deferrals for Phase 4+, the Linux-first request-file boundary, and remaining owner questions.
- ✅ TypeScript CLI Phase 4 distribution-safety continuation complete (2026-08-31); see the [2026-08-31 roadmap entry](#recent-additions-2026-08-31) for scope and evidence. Python remains authoritative; live qualification and cutover remain deferred.
- No canonical Phase 4 plan artifact is present at `plans/260827-2218-typescript-control-plane-cli/plan.md` in this checkout; the existing Phase 3 plan remains a completed Phase 3 record.
- ✅ TypeScript CLI Phase 6 registry/imports complete (2026-09-01); see the [2026-09-01 roadmap entry](#recent-additions-2026-09-01) and [Phase 6 plan](../plans/260827-2218-typescript-control-plane-cli/phase-06-registry-and-imports.md). Manifest-derived resource roots, deterministic schema-v1 registry, explicit capability-gated imports, hash-bound previews, and atomic canonical-source plus registry CAS preserve controller/policy/generated/HOME ownership boundaries.
- Focused evidence: `npm run build` exited 0; `npm run test:phase6` **23/23**, `npm run test:protocol` **19/19**, `npm run test:phase4` **31/31**, and `npm run test:phase5` **12/12**; aggregate **85/85**. Review residuals remain limited to the documented low same-UID/path-race window and Linux-first security scope.

- Phases 7–11 remain planned; the overall plan remains `in_progress`.

#### OMP Command Namespace Prefix
- Completed Phase 01 map/translate implementation with OMP-only `cmd-<flattened>` targets and centralized map-driven references.
- Validation passed: Python compilation, migration **4/4**, focused suite **25/25**, and `distribute.py --build && --check`.
- Code review **9.5/10** approved; Phase 02 regeneration/documentation and Phase 03 contract verification remain pending.

### Version 1.14.8 (Current - 2025-11-17)

#### Features Added
- **Skills Expansion:** Added `frontend-design`, `threejs`, `aesthetic`, `frontend-development`, `payment-integration` (with Polar & SePay), `mcp-management`, `backend-development`, and `mobile-development` skills.
- **MCP Integration:** Introduced `/use-mcp` command and the dedicated `mcp-manager` subagent.
- **Performance:** Optimized token efficiency across planner, researcher, debugger, and scout subagents.
- **Fast Commands:** Added `/cook:fast` and `/plan:fast` commands to bypass lengthy research phase.
- **Code Review:** Added `/review:codebase` to run codebase-wide reviews.

### Version 1.8.0 (2025-11-11)

#### Features Added
- **Windows Statusline Support:** Complete cross-platform statusline implementation
  - PowerShell native implementation (statusline.ps1)
  - Node.js universal fallback (statusline.js)
  - Support for Windows PowerShell 5.1+, PowerShell Core 7+
  - Git Bash and WSL full compatibility

#### Documentation Added
- Comprehensive Windows statusline user guide (statusline-windows-support.md)
- Technical architecture documentation (statusline-architecture.md)
- Setup guides for 4 different Windows environments
- Troubleshooting guide with 9 common issue solutions
- Performance benchmarks for all implementations

#### Quality Improvements
- Feature parity across bash, PowerShell, and Node.js
- Enhanced ANSI color support
- UTF-8 encoding verification
- Cross-platform path handling
- Silent degradation error handling

#### Implementation Details
- Phase 1: Research & analysis complete
- Phase 2: PowerShell implementation complete
- Phase 3: Node.js fallback complete
- Phase 4: Platform detection & wrapper complete
- Phase 5: Testing & documentation complete

---

## Document References

### Core Documentation
- [Project Overview & PDR](./project-overview-pdr.md)
- [Code Standards](./code-standards.md)
- [System Architecture](./system-architecture.md)
- [Codebase Summary](./codebase-summary.md)

### External Resources
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code/overview)
- [Open Code Documentation](https://opencode.ai/docs)
- [Conventional Commits](https://conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

---

## Questions & Notes

### Current Status
- Windows statusline support implementation fully delivered and documented
- Native Windows Pi extension root-resolution Phases 01–03 **DONE** (2026-08-12); focused validation 13/13, targeted Python 46/46, syntax 4/4, review 9/10 approved
- Native Windows Pi extension loading is 75% complete; Phase 04 review/docs handoff remains pending, and native Windows validation remains a follow-up gate
- Known residuals: full Pi 45/46 due to missing `subagents-doctor`; native `USERPROFILE`/Pi startup not validated
- Ready for Phase 04 review/docs handoff; do not claim full feature completion

### Next Steps (Not Yet Scheduled)
1. Complete Phase 04 review/docs handoff; retain the parent plan at 75% until that phase is finished
2. Run native Windows published-artifact startup validation with `HOME`/`PI_CODING_AGENT_DIR` absent and `USERPROFILE` available
3. Track the missing `subagents-doctor` baseline separately; do not mask it
4. Consider additional Windows ecosystem enhancements

---

**Maintained By:** EVCrate Team
**Last Review:** 2026-06-29
**Next Review Target:** 2026-07-29
