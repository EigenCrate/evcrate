# Planning brief — VS Code Local advisor

Status: user-authorized planning only, 2026-10-13. Native `/evc-cmd-plan-x-hard` handler executed through its published command entrypoint; returned `plan/hard` command context and expanded workflow. No implementation permitted.

## User decisions

- Independent extension under `extensions/vscode-advisor/` in this EVCrate repository, separate from `extensions/vscode-model-bindings/`.
- Private installable VSIX for initial local evaluation; no public release or automatic EVCrate installer integration assumed.
- Existing VS Code built-in Local Agent chat remains executor.
- Advisor uses a user-selected Copilot-accessible model, without external provider credentials.
- Native language-model tool is the equivalent of OMP `xd://ask_advisor`; literal URI adapter and running OMP are unnecessary.
- Startup guidance at a new session is sufficient. First version provides advisory invocation guidance and explicit tool use; enforced gates are explicitly deferred by user.
- Pi-advisor context policy/options/defaults should be reused where host-independent.
- User approved explicit executor context handoff instead of automatic transcript scraping.
- User approved secret redaction ON as an intentional deviation from Pi's OFF default.
- Follow-up scope interview: Linux x64 **and Windows x64** local single-folder support required.
- Text-only, explicit file attachments approved; no image/history cache or prior-review permit mechanism in this version.
- Rules mapping approved: root `AGENTS.md`, optional user-chosen global rules, optional `.vscode/advisor-preferences.md`; no silent Pi HOME reads.

## Evidence and boundaries

Prior research: [brainstorm](../reports/brainstorm-261013-0944-copilot-local-advisor.md). Copilot Local tool API and LM API are public; actual model availability, authorization during tool execution, and startup hook integration need real-host qualification.

Local Pi sources: `/home/loidinh/WS/pi-advisor/src/config/state.ts`, `src/config/types.ts`, `src/tools/prompts.ts`, `src/git.ts`, `src/tools/register-ask-advisor.ts`, `docs/privacy.md`.

EVCrate inspected surfaces:
- `extensions/vscode-model-bindings/`: independent extension package precedent; proposed `chatPromptFiles`, not a runtime dependency for new advisor.
- `src/adapters/vscode/hooks.ts`, `hook-protocol.ts`, `runtime-sources.ts`, `runtime-lifecycle-source.ts`: existing Local Agent Plugin hooks, ownership, startup context.
- `scripts/build-vscode-companion.mjs`: deterministic packaging precedent; hardcoded to companion, do not import its runtime or casually generalize.
- `scripts/build-typescript.mjs`: existing compiler driver.
- `package.json`: Node test conventions, explicit build scripts, seven-asset core release contract.
- `docs/system-architecture.md`, `docs/code-standards.md`, `docs/codebase-summary.md`, `docs/project-overview-pdr.md`: ownership, generated output, runtime and qualification boundaries.

## Plan requirements

Create canonical `plan.md` with YAML `status: pending`, <=80-line overview, ordered phases with dependencies, exact existing/new file touchpoints, numbered steps, unchecked todos, test cases, success criteria, security, risk, and next gate. Supporting design/defaults/native validation documents must make it executable without this conversation.

Core contracts must cover model consent and selection, bounded explicit context and Pi defaults, path/disclosure policy, error/cancellation handling, immutable tool description and startup guidance, configuration scopes, installation/ownership/disable/recovery, packaging, documentation, and real authenticated Local acceptance.

No fake transcript parity, speculative system prompt API, runtime dependency on Pi/OMP, proposed-API dependency for advisor, hidden model fallback, claimed free quota, forced continuation gate, automatic external proxy, or resurrection of retired root advisor subsystem.

Runtime qualification is future work in phase 01 and final acceptance, not a claim of this planning session. Pin versions there; do not inherit prior companion receipts as proof.

## Open design choices for synthesis

Determine simplest reliable startup guidance delivery owned by this independent extension, with no duplicate EVCrate hooks/instructions or unmanaged overwrites. Account for hook processes lacking extension-host APIs. Keep any bridge local file configuration only if required; do not add network daemon.

Pick conservative support boundary explicitly and require approval to widen it. User's first-version choice does not authorize nonfunctional stubs; delivered supported paths must work end-to-end.

## Session activation evidence

The published `set-active-plan.cjs` helper was run with this plan directory. It reported `EVCRATE_SESSION_ID` unset, so active-plan state was **not persisted**. Agents receive this directory explicitly; no session ID was invented.

## Local prerequisites observed during planning

`code --version`: VS Code 1.140.0, commit `07f806f999227108933c2e30515b26eecc1fda74`, x64. Node `v24.16.0`, npm `12.0.2`. `code --list-extensions --show-versions` returned no entries for the CLI's default environment; this does not prove other profiles are empty or establish Copilot availability. No authentication, installation, hook mutation or model inference performed.

## Settled design authority

See [design-contracts.md](design-contracts.md). The research documents are supporting evidence, not authority over the final contract. Private VSIX/manual install is the conservative distribution choice; existing EVCrate publish/install workflows and seven release assets remain untouched.
