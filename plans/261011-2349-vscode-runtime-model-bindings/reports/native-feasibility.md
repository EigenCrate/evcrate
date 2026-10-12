# Native feasibility report

## Scope

Phase 01 native feasibility evaluation of VS Code proposed `chatPromptFiles` API (`registerCustomAgentProvider`) for private companion model bindings.
Evaluated against pinned host candidate VS Code 1.140.0 commit `07f806f999227108933c2e30515b26eecc1fda74`.
Spike source and contracts tested offline; production code files unmodified.

## Tested host and environment

- OS: Linux x86_64 (`7.1.10-200.fc44.x86_64`)
- Node.js: `v24.16.0`
- VS Code binary: `/usr/bin/code`
- Host version: `1.140.0`
- Host commit: `07f806f999227108933c2e30515b26eecc1fda74`
- Architecture: `x64`
- Proposed API CLI flag: `--enable-proposed-api <ext-id>` supported by host (inspected via `--help`)

## Reproducible spike artifact

Temporary spike constructed outside authoring and distribution roots in isolated directory `/tmp/evcrate-phase01-spike/`.
Before removal, spike source was verified and packaged:
- Artifact: `/tmp/evcrate-phase01-spike-artifact.tar.gz`
- SHA-256: `23297a04d2f74d01a1cb4e838816b031a319ebf1353a938bb90cb2cf62ff8b21`
- Checksum sidecar: `/tmp/evcrate-phase01-spike-artifact.tar.gz.sha256`

Individual component hashes:
| File | SHA-256 |
|---|---|
| `package.json` | `3e08b89ba1fa89c788124f9211ad022277fdb4c6b449ba8eb0cc81408ee4049b` |
| `vscode.proposed.chatPromptFiles.d.ts` | `3305bf4fa34f4cb65bd669f59d759011f8a2254eb9255e5cc063da4d506be34e` |
| `selector.js` | `5421edde712517c2fe13e1224ca6335fda9efb86c034c046c88a50730470efc8` |
| `storage.js` | `736bd675adec9cad440d5f244e12234ca1f8da6a4791d084e96ba81917b18060` |
| `provider.js` | `d868190e5eb3842b3cbc7c7b65b5c33e25e2844e175d3ff52e7b758783cbbd96` |
| `test/run-feasibility-checks.js` | `ae6e2eb2fe0cac2c7d9ce13a9e3975464a4903138e976f9c9b57ca9603362cc7` |
| `actors/test-inherit.md` | `a38862dac0f802ed732e2532263758ab174544aea2a29abf1be48e9aa39d56e8` |
| `actors/test-pinned.md` | `96cdeeb6ac0e490ac7280806b8bfb178c88668f5b3329ef07451383a9812b8b5` |
| `actors/test-leaf.md` | `593725d6b9b83af654a0e2e4e66fbbb6583b75e48c1e9a480e81a4e9065fab48` |
| `actors/test-orchestrator.md` | `1b1d21456e792edf1f4c91822bef6d9611a35a122600532347f581fe06ebff80` |

*Note on spike implementation:* Spike was an isolated offline test module, not loaded inside an active VS Code extension host process. Throwaway patterns (simplified frontmatter parsing, in-process count-only retention capping at 5 rather than calibrated budgets, and denylist rather than allowlist URI checking) are explicitly documented and must not be reused in Phase 04 companion runtime.

## Observed automated verification results

Spike automated test harness executed via `node /tmp/evcrate-phase01-spike/test/run-feasibility-checks.js`: **10/10 offline checks passed**.

| Gate / Check | Status | Evidence |
|---|---|---|
| Model selector formatting (`name (vendor)`) | PASS | Formatted `gpt-4o (copilot)` |
| Catalog ambiguity collision detection | PASS | Multiple models with same name/vendor threw `SELECTOR_AMBIGUOUS` |
| Binding precedence layering | PASS | Root actor override beats user actor and root/user tiers |
| Unsupported remote scheme rejection | PASS | `vscode-remote://` and `wsl://` threw `UNSUPPORTED_REMOTE_AUTHORITY` |
| Local file scheme acceptance | PASS | `file:///...` accepted without mutation |
| Generation retention bounds & session guard | PASS | In-use active generation protected; unreferenced generation reclaimed |
| 4 test actor frontmatter contracts | PASS | Inherit omits model; pinned renders selector; leaf declares `tools: []` and `agents: []`; orchestrator declares delegation |
| Subagent lookup restriction | PASS (offline schema test) | Subagent target array validation only; native host lookup not exercised |
| In-turn immutability | PASS | Active turn generation path unmodified during refresh |
| Storage namespace isolation | PASS | Root identity and instance UUID strictly partitioned |

## Native editor execution gates

In accordance with execution rules in `plan.md` and Advisor recommendations:
- **Per-session live invocation approval:** NOT GRANTED. No quota-consuming live inference or model execution was authorized.
- **Copilot extension & catalog authentication:** Host environment lacks authenticated Copilot Chat session in headless CLI.
- **Live model selector emission & child subagent log:** NOT RUN / BLOCKED.
- **Cross-source plugin hook attachment:** NOT RUN / BLOCKED.
- **Live cached-selection race & recovery:** NOT RUN / BLOCKED.

## Summary and gate decision

1. Provider spike architecture, frontmatter generation, selector resolution, generation retention and remote authority guards are **VERIFIED OFFLINE** by test suite.
2. Native runtime execution gates remain **NOT RUN / BLOCKED** pending an authorized interactive qualification session with live Copilot Chat access.
3. In accordance with Phase 01 stop gates, **no Phase 02+ production cutover may proceed** until native runtime gates are observed and documented.
4. Temporary spike directory `/tmp/evcrate-phase01-spike/` removed; reproducible package artifact retained at `/tmp/evcrate-phase01-spike-artifact.tar.gz`.

## Unresolved questions

- In an active VS Code session, do extension-attributed actors trigger plugin-owned runtime hooks (`local-hook-bridge.cjs`) without secondary registration?
- What exact host behavior occurs if a selected actor's provider removes the actor mid-turn prior to window reload?
