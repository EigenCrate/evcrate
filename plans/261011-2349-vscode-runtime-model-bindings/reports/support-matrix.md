# Support matrix report

## Scope and bounds

Evaluation of host platform, workspace configurations, authority contexts, and profile isolation for VS Code runtime model bindings companion.
Reconciled with confirmed Validation Summary: qualification and support apply strictly to local contexts; remote authorities are excluded from this deliverable and must fail closed.
All local rows below reflect offline contract and path-joining checks only; native editor execution remains **NOT RUN / BLOCKED**.

## Host and platform matrix

| Platform / Host Tuple | Version / Commit | Tested Status | Disposition |
|---|---|---|---|
| Linux x86_64 | VS Code 1.140.0 (`07f806f999227108933c2e30515b26eecc1fda74`) | Verified CLI & Declarations | Supported Candidate (Environment captured) |
| Windows x64 | Not tested in this session | Untested | Excluded from current session |
| macOS (darwin-arm64 / x64) | Not tested in this session | Untested | Excluded from current session |

## Workspace and authority matrix

| Context | Scheme / Authority | Support Status | Observed Gate Behavior |
|---|---|---|---|
| Local single-folder project | `file://` | Design Target | Offline path-joining check only, native NOT RUN |
| Local HOME installation | `file://` | Design Target | Offline path-joining check only, native NOT RUN |
| Local multi-root workspace | `file://` | Design Target | Offline path-joining check only, native NOT RUN |
| Local profile isolation | `file://` (partitioned instance UUID) | Design Target | Offline path-joining check only, native NOT RUN |
| Remote SSH | `vscode-remote://ssh-remote` | Unsupported | PASS: Offline guard threw `UNSUPPORTED_REMOTE_AUTHORITY` |
| Remote Dev Container | `vscode-remote://dev-container` | Unsupported | PASS: Offline guard threw `UNSUPPORTED_REMOTE_AUTHORITY` |
| Remote WSL | `vscode-remote://wsl` / `wsl://` | Unsupported | PASS: Offline guard threw `UNSUPPORTED_REMOTE_AUTHORITY` |

## Proposed API and runtime feature matrix

| Feature / Gate | Pinned API Declaration | Offline Spike Status | Native Editor Runtime Status |
|---|---|---|---|
| `chat.registerCustomAgentProvider` | Pinned proposed API declarations | Offline interface check only | BLOCKED (No interactive GUI session) |
| `onDidChangeCustomAgents` | Event emitter in provider | Offline emitter check | BLOCKED (Untested in live editor) |
| Model selector formatting | `LanguageModelChat` (`name (vendor)`) | PASS (Exact string match) | BLOCKED (No active Copilot login) |
| Ambiguous selector guard | Throw on duplicate name per vendor | PASS (Throws `SELECTOR_AMBIGUOUS`) | N/A (Client-side guard) |
| Empty-tool restriction (`tools: []`) | YAML frontmatter `tools: []` | Preserved in spike output | BLOCKED (Native tool denial unverified) |
| Leaf delegation restriction (`agents: []`) | YAML frontmatter `agents: []` | Preserved in spike output | BLOCKED (Native delegation denial unverified) |
| Generation storage retention | Capped at 5 generations (spike limit; Design §6 proposes 32) | In-process count check | BLOCKED (Live editor retention unmeasured) |
| Proposal-disabled fallback | `--enable-proposed-api` omitted | CLI flag presence checked via `--help` | BLOCKED (Native setup state vs static fallback unverified) |

## Summary

1. Local project/HOME coexistence, multi-root workspace, and local profile storage partitioning pass offline architectural checks; native editor qualification remains **NOT RUN**.
2. Remote authorities (SSH, Dev Container, WSL) throw fail-closed errors in offline guard without fallback to local HOME. Phase 04 implementation must enforce strict URI allowlisting (`file://` only).
3. Native editor runtime rows remain **BLOCKED / NOT RUN** pending an interactive live qualification session.
