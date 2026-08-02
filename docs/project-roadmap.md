# Devkit - Project Roadmap

**Last Updated:** 2026-08-02 13:22:03 +0700
**Current Version:** 1.14.8
**Repository:** https://github.com/NEBULEA-M/devkit

## Executive Summary

Devkit (formerly ClaudeKit Engineer) is an AI-powered development orchestration framework enabling developers to build professional software faster through intelligent agent collaboration, automated workflows, and comprehensive quality management. The project has successfully completed core foundation phases and is advancing cross-platform compatibility and advanced features.

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

#### Sub-Task: Refactor Distribute Script to Python
**Status:** 🔄 In Progress | **Completion Target:** Jul 2026
**Progress:** 60%

Refactor the legacy bash distribution script to a cross-platform Python script (`distribute.py`) to run natively on Windows, macOS, and Linux.

**Deliverables Completed:**
- `distribute.py` - Core distribution engine with standard libraries only
- `distribute_utils.py` - Path resolution and cross-platform utility helpers
- `distribute_sync.py` - Asset tree synchronization and cleanups
- `distribute_hooks.py` - Pre-tool javascript wrapper generations and settings.json hook adaptation
- Command-to-Skill converter implementation to migrate legacy slash commands to Antigravity skills
- 1 of 3 implementation phases complete:
  - Phase 1: Refactor Script to Python (COMPLETE - 2026-06-29)
  - Phase 2: NPM & Release Integration (Pending)
  - Phase 3: Testing & Validation (Pending)

**Features:**
- ✅ Platform-independent python implementation
- ✅ Path safety using pathlib for backslash/forward-slash compatibility
- ✅ Dynamic environment configuration (DEVKIT_DIR, global mode, sync mode)
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

## Current Development Focus

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
| Repository Adaptation to Devkit | ✅ Complete | 2026-06-28 | 100% |
| Refactor Distribute Script to Python (Phase 1) | ✅ Complete | 2026-06-29 | 100% |

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
- ✅ Two-Gate Distribution and Enforced Advisor — Phase 4 (DONE, 2026-08-02): declared Codex advisor runtime staging/build, shared model registry injection, artifact-integrity verification, distinct advisor policy, bounded `advisor_consult` MCP contract, contained/redacted evidence, fail-closed outcomes, and owner-only JSONL audit logging. Validation: distribution regression suite plus advisor-broker TypeScript/Vitest suite passed.

### Recent Additions (2026-07-18)
- ✅ Refactor DevKit Config and Enable Codex Coding Levels Phase 3 (COMPLETE): user-facing config references, help output, TOML-aware discovery, and generated asset tracking updated to `.devkit.json`; phase 4 remains pending.

### Recent Additions (2026-07-11)
- ✅ Simple Web Testing Demo Phase 05 (COMPLETE): Evidence report generated, README updated with test evidence, CSP meta tag added, k6 Windows install docs provided. Validation: npm test 4/4✓, npm test:e2e 5/5✓, npm test:lighthouse✓, npm test:web-gate 5/5 Playwright+Lighthouse✓. Code review 10/10, no issues. Full release gate workflow validated and skill dogfooding complete.

### Recent Additions (2026-07-10)
- ✅ Simple Web Testing Demo Phase 04: Applied web release gate with Playwright axe accessibility tests, visual snapshots, direct Lighthouse budget runner, required k6 smoke script with install guidance, README docs; 0 vulnerabilities audit, 5/5 test pass, 9.2/10 code review; Phase 04 marked complete.
- ✅ Simple Web Testing Demo Phase 03: Added core Vitest and Playwright tooling for the demo release-gate workflow; Phase 03 marked complete in implementation plan.

### Recent Additions (2026-06-29)
- ✅ Refactor Distribute Script to Python (Phase 1): Ported legacy bash distribution logic to Python, created utility helpers, sync logic, hook conversions, and command-to-skill parser.
- ✅ Repository Adaptation to Devkit: Renamed the project, synced package metadata, updated release zip compilation structure, and ran migration cleanups.
- ✅ Windows statusline support (PowerShell, Node.js)
- ✅ Cross-platform statusline documentation
- ✅ Advanced configuration guides

### In Development
- ✅ Two-Gate Distribution and Enforced Advisor — Phases 1–4 complete; final rollout remains adapter/configuration dependent.
- 🔄 Refactor Distribute Script to Python (Phase 2 & 3): Integration with NPM package.json scripts and validation.
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
- **Runtime:** Node.js >= 18.0.0, Bash, PowerShell, Cross-platform hooks
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
- Requires Node.js >= 18.0.0
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
- [Release Process](./RELEASE.md)

### Feature Documentation
- [Windows Statusline Support Guide](./statusline-windows-support.md)
- [Statusline Architecture](./statusline-architecture.md)

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
- Ready for integration testing with Claude Code CLI
- All 5 phases of implementation complete with comprehensive documentation

### Next Steps (Not Yet Scheduled)
1. Integration testing with Claude Code CLI production
2. Performance validation on target Windows platforms
3. User feedback collection from Windows developer community
4. Consideration of additional Windows ecosystem enhancements

---

**Maintained By:** Devkit Team
**Last Review:** 2026-06-29
**Next Review Target:** 2026-07-29
