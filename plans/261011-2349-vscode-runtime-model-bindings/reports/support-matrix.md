# Support matrix report

## Scope and bounds

Evaluation of host platform, workspace configurations, authority contexts, and profile isolation for VS Code runtime model bindings companion.
Reconciled with confirmed Validation Summary: qualification and support apply strictly to local contexts; remote authorities are excluded from this deliverable and must fail closed.
Local rows below reflect Phase 09 integrated contract tests, isolated Windows x64 VS Code `1.140.0` CLI installation, and isolated Windows x64 VS Code `1.140.0` extension-host execution ([integrated-qualification.md](./integrated-qualification.md), [native-qualification.md](./native-qualification.md)); interactive GUI picker and live authenticated Copilot Chat inference rows remain **BLOCKED** pending an interactive user GUI session.

## Host and platform matrix

| Platform / Host Tuple | Version / Commit | Tested Status | Disposition |
|---|---|---|---|
| Linux x86_64 | VS Code 1.140.0 (`07f806f999227108933c2e30515b26eecc1fda74`) | Verified CLI & Declarations (Phase 01); Archive & Closure Verified (Phase 09) | Supported Candidate (Interactive GUI session BLOCKED) |
| Windows x64 | VS Code 1.140.0 (`07f806f999227108933c2e30515b26eecc1fda74`) | Isolated CLI VSIX Install & Isolated Extension-Host Activation/Commands PASS (Phase 09) | Supported Candidate (Interactive Copilot Chat inference BLOCKED) |
| macOS (darwin-arm64 / x64) | Not tested in this session | Untested | Excluded from current deliverable |

## Workspace and authority matrix

| Context | Scheme / Authority | Support Status | Observed Gate Behavior |
|---|---|---|---|
| Local single-folder project | `file://` | Design Target | PASS (Automated + Isolated Extension Host `N-02`; Interactive Chat UI BLOCKED) |
| Local HOME installation | `file://` | Design Target | PASS (Automated + Candidate Root Resolution; Interactive Chat UI BLOCKED) |
| Local multi-root workspace | `file://` | Design Target | PASS (Automated `MULTI_ROOT_SELECTION_REQUIRED` + Root Switching; Interactive Chat UI BLOCKED) |
| Local profile isolation | `file://` (partitioned instance UUID) | Design Target | PASS (Isolated `--user-data-dir`/`--extensions-dir` CLI `N-01` & Extension Host `N-02`) |
| Remote SSH | `vscode-remote://ssh-remote` | Unsupported | PASS: Runtime & CLI guards fail closed (`UNSUPPORTED_REMOTE_AUTHORITY` / exit `5`) |
| Remote Dev Container | `vscode-remote://dev-container` | Unsupported | PASS: Runtime & CLI guards fail closed (`UNSUPPORTED_REMOTE_AUTHORITY` / exit `5`) |
| Remote WSL | `vscode-remote://wsl` / `wsl://` | Unsupported | PASS: Runtime & CLI guards fail closed (`UNSUPPORTED_REMOTE_AUTHORITY` / exit `5`) |

## Proposed API and runtime feature matrix

| Feature / Gate | Pinned API Declaration | Offline Spike Status | Native Editor Runtime Status |
|---|---|---|---|
| `chat.registerCustomAgentProvider` | Pinned proposed API declarations | PASS | PASS in isolated VS Code 1.140.0 Extension Host (`N-02`); interactive picker UI BLOCKED |
| `onDidChangeCustomAgents` | Event emitter in provider | PASS | PASS in isolated VS Code 1.140.0 Extension Host (`N-02`); interactive picker UI BLOCKED |
| Model selector formatting | `LanguageModelChat` (`name (vendor)`) | PASS (Exact string match) | PASS in Extension Host (`N-02`); live Copilot inference (`hostObservedModel`) BLOCKED |
| Ambiguous selector guard | Throw on duplicate name per vendor | PASS (Throws `SELECTOR_AMBIGUOUS`) | PASS (Client-side guard verified in runtime & integration suites) |
| Empty-tool restriction (`tools: []`) | YAML frontmatter `tools: []` | PASS | Preserved in rendered `.agent.md`; live Copilot Chat turn enforcement BLOCKED |
| Leaf delegation restriction (`agents: []`) | YAML frontmatter `agents: []` | PASS | Preserved in rendered `.agent.md`; live Copilot Chat turn enforcement BLOCKED |
| Generation storage retention | Capped at 32 active generations / 64 MiB instance / 256 MiB authority | PASS (On-disk accounting & lock verified) | PASS in isolated Extension Host `workspaceStorage`; live multi-window restore BLOCKED |
| Proposal-disabled fallback | `--enable-proposed-api` omitted | PASS (`tryRegister` catches proposal throw) | PASS (`setupOrInvalidationReason: chatPromptFiles API proposal is not available`) |

## Summary

1. Local project/HOME coexistence, multi-root workspace, cross-scope binding precedence (`root.actor > user.actor > canonical.inherit > root.tier > user.tier`), and isolated local profile CLI install (`N-01`) + Extension Host command execution (`N-02`) pass on Windows x64 VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`).
2. Remote authorities (SSH, Dev Container, WSL) and UNC/device paths fail closed in both extension runtime (`readHostRemoteAuthority` + `validateLocalRootUri` + `fsPathToLocalRootUri`) and CLI postpublish installer (`exit 5` when requested) without fallback to local HOME.
3. Interactive Copilot Chat UI picker and live authenticated model inference (`hostObservedModel`, cached-selection race in active chat UI, and live host tool/delegation enforcement) remain **BLOCKED** pending an interactive user GUI session with authenticated GitHub Copilot.
