# Baseline analysis

Planning only; 2026-10-11. Input: [brainstorm](../../reports/brainstorm-261008-1239-vscode-runtime-model-bindings.md).

**Historical baseline:** The [Validation Summary](../plan.md#validation-summary) supersedes remote-support and strict cached-selection stop conditions below. The deliverable now requires local project/HOME, multi-root and profiles only; cached selections may execute an unintended model until explicit reselection/reload. Native race/recovery testing and correctness for refreshed selections, trust, restrictions and hooks remain required. Original observations are retained, not new acceptance evidence; native checks remain NOT RUN.

## Decisions retained

- Private companion extension using proposed `chatPromptFiles`; no Marketplace compatibility promise.
- Immutable VS Code templates/intent + extension-owned resolved agents; runtime bindings without republish.
- User-controlled catalog selection, actor overrides, deliberate inheritance.
- Consented installation after committed publication; installation, proposal enablement and native activation are distinct.
- Standalone MCP evaluator repair and other-target model policy remain out of scope.

## Current repository facts

| Evidence | Current fact | Planning consequence |
|---|---|---|
| `README.md`, `package.json`, `docs/system-architecture.md` | EVCrate 2.11.0; Node >=22.19.0; seven targets; harness-only control plane | No eighth adapter, controller closure or daemon |
| `docs/system-architecture.md:14-25` | Advisor subsystem retired | No advisor actor/controller revival; requested review uses host Advisor tool |
| `.evcrate/source/.claude/agents/*.md` | 17 `evc-*` actors: 2 opus, 5 sonnet, 9 haiku, 1 inherit | Discover inventory from source; never hardcode historic 18 actors |
| `src/adapters/vscode/models.ts:1-74` | Historical `claude-3-*` IDs in resolver and model-map audit | Remove version mapping on cutover; build records intent, runtime records selected selector |
| `src/adapters/vscode/agents.ts:90-123` | Emitted model is source alias, recorded target is mapped old ID | Separate build intent from actual derived frontmatter diagnostics |
| `src/adapters/vscode/agents.ts:67-111` | Visibility, tools/agents, skills, non-bypass permission fields projected | Preserve semantics; do not reinterpret metadata as native enforcement |
| `docs/system-architecture.md:118-144` | Plugin `evc`; skills `cmd-*`; `/evc:cmd-*` host qualifier | Preserve current naming/reference convention |
| `package.json:43-57`, `docs/codebase-summary.md:65-85` | Atomic aggregate + seven per-target manifests; strict release/package contracts | Include VSIX in target output, not an eighth core release asset |
| `docs/code-standards.md:9` | `npm run lint` is echo-only | Never cite it as quality proof |

## Report corrections, not scope changes

The October 8 report references an advisor agent and Gemini projection that no longer exist. Historical source/host evidence remains historical. Neither old native qualification nor a source matcher smoke establishes current provider qualification. The plan uses current `evc-*` names and plugin `evc` throughout.

## Planning process evidence

- Loaded published `planning` skill and `evc-cmd-plan-x-hard` command; applied hard-plan workflow directly (no command-dispatch tool exposed).
- Read primary, development, orchestration and documentation workflows, maintained architecture/PDR/standards/summary/roadmap.
- Current branch observed `main`; clean working tree observed before plan creation.
- Published `set-active-plan.cjs` ran: `EVCRATE_SESSION_ID` absent; helper reported state will not persist. This plan path is explicit, not claimed as a persisted active session.
- `docs-seeker` detection/fetch ran; Context7 returned documentation unavailable. Pinned primary upstream research is the fallback.
- Planning does not install extensions, modify editor settings, enable proposals, run inference, rebuild projections or qualify native surfaces.

## Required stop conditions

1. Provider resources cannot preserve hook attribution, relative references or native tools/delegation restrictions.
2. Native direct or custom-subagent selection does not choose the intended catalog identity.
3. Duplicate static/provider registrations remain or selected-resource removal silently changes tier.
4. Project/HOME, multi-root or remote attribution cannot be established without guessing.
5. Proposed-API permission unavailable under selected editor/policy.

A failed gate produces evidence and a user decision on redesign/support; never silently substitutes stable file discovery or reduces scope.

## Unresolved questions

Native feasibility, exact supported editor/profile/remote combinations, and stale-agent fallback behavior require Phase 01 evidence. No user policy question blocks writing this plan.
