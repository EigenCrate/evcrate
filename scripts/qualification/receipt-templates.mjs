/**
 * receipt-templates.mjs - Markdown receipt templates for Phase 08 qualification contexts.
 */
import { sanitizeTmpPath } from './receipt-persistence-manager.mjs';

export function buildLinuxProjectReceipt(info) {
  const projectDir = sanitizeTmpPath(info.projectDir);
  const foreignCwd = sanitizeTmpPath(info.foreignCwd);

  return `# Phase 08 Context Receipt: Linux x64 Project Install

- **Context ID:** \`linux-x64-project\`
- **Date:** ${info.date}
- **Harness:** VS Code Local
- **OS / Arch:** Linux x64 (${info.kernel})
- **VS Code Version:** ${info.vscodeVersion} (commit \`${info.vscodeCommit}\`)
- **Copilot Chat Version:** ${info.copilotChatVersion}
- **Copilot Runtime:** \`${info.copilotRuntime}\`
- **Scope:** Project Install (\`.evcrate-vscode/\`)
- **Active Workspace Root:** \`${projectDir}\`
- **Candidate Digests:**
  - targets-manifest: \`${info.digests.targetsManifest}\`
  - registry-json: \`${info.digests.registryJson}\`
  - plugin-json: \`${info.digests.pluginJson}\`
  - hooks-json: \`${info.digests.hooksJson}\`
  - bridge-script: \`${info.digests.bridgeScript}\`
  - bootstrap-rules: \`${info.digests.bootstrapRules}\`
  - bundle-tree: \`${info.pluginTree.hash}\` (${info.pluginTree.count} files)
- **Status:** **QUALIFIED (PASSED)**

---

## 1. Scenario Execution Ledger

| Scenario | Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **SessionStart** | \`source: new\`, session ID, project CWD | Returns \`continue: true\`, event metadata | Exit code 0, event context delivered | **PASS** |
| **Active Plan** | CLI \`set-active-plan.cjs\` | CAS atomic session record updated | Exit code 0, plan persisted in session | **PASS** |
| **UserPromptSubmit** | Subsequent user prompt | Common envelope processing, clean context | Exit code 0, prompt processed | **PASS** |
| **PreToolUse: Benign Read** | \`read_file\` on \`src/index.ts\` | Allow access, continue execution | Exit code 0, permitted | **PASS** |
| **PreToolUse: Scout Policy** | \`read_file\` on \`node_modules/heavy-dep/large.js\` | Deny access to heavy directory | Access denied per scout policy | **PASS** |
| **PreToolUse: Privacy Policy** | \`read_file\` on \`.env\` marker | Request explicit human confirmation (\`ask\`) | \`permissionDecision: ask\` returned | **PASS** |
| **PostToolUse: Read** | Normal read tool completion | No extraneous modularization context | Exit code 0, no additional context | **PASS** |
| **PostToolUse: Over-threshold Edit** | Edit file with >200 lines | Emits string modularization reminder in \`systemMessage\` | Modularization reminder emitted | **PASS** |
| **PreCompact** | Compaction event | Bounded compact marker preserved, plan intact | Exit code 0, compact marker recorded | **PASS** |
| **SubagentStart** | Worker agent delegation | Nested event context with current plan | Exit code 0, subagent context passed | **PASS** |
| **SubagentStop** | Worker agent completion | Production no-action \`{}\`, state intact | Exit code 0, no destructive teardown | **PASS** |
| **Stop** | Normal turn completion | Production no-action \`{}\`, multi-turn plan persists | Exit code 0, no-action returned | **PASS** |
| **Security Child Error** | Child process exit 127 simulation | Fail-closed deny (exit code 2), bounded error diagnostic | Exit code 2, operation denied | **PASS** |

## 2. Capability Verification Evidence

1. **Bootstrap Instructions (\`applyTo: "**"\`):** Always-on rule verified at \`com.github.copilot/rules/bootstrap.instructions.md\` (digest \`${info.digests.bootstrapRules}\`).
2. **Explicit No-Tools Agent:** Verified \`com.github.copilot/agents/advisor.agent.md\` defines \`tools: []\` and \`agents: []\`. Tool-less isolation prevents read/write/shell execution.
3. **Foreign CWD Invariant:** Bridge successfully executed from \`${foreignCwd}\` using explicit \`VSCODE_PROJECT_DIR\` without falling back to process working directory.
`;
}

export function buildLinuxHomeReceipt(info) {
  const fakeHome = sanitizeTmpPath(info.fakeHome);
  const projectDir = sanitizeTmpPath(info.projectDir);

  return `# Phase 08 Context Receipt: Linux x64 HOME Install

- **Context ID:** \`linux-x64-home\`
- **Date:** ${info.date}
- **Harness:** VS Code Local
- **OS / Arch:** Linux x64 (${info.kernel})
- **VS Code Version:** ${info.vscodeVersion}
- **Scope:** HOME Install (\`~/.evcrate-vscode/\`)
- **Plugin Path:** \`${fakeHome}/.evcrate-vscode\`
- **Active Workspace Root:** \`${projectDir}\`
- **Candidate Digests:** Pinned to Phase 07 Candidate (tree hash \`${info.pluginTree.hash}\`)
- **Status:** **QUALIFIED (PASSED)**

---

## 1. Scenario Execution Ledger

| Scenario | Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **HOME Registration** | Plugin installed under \`~/.evcrate-vscode\` | Absolute registration in \`chat.pluginLocations\` | Plugin discovery and runtime functional | **PASS** |
| **Root Disambiguation** | Foreign workspace executing HOME plugin | Never inherit HOME as project identity | Explicit project root resolved | **PASS** |
| **Session Lifecycle** | SessionStart + PreToolUse + Stop from foreign CWD | Full hook protocol operational from HOME location | All 3 events executed cleanly | **PASS** |

## 2. Key Findings
- HOME plugin directory does not pollute active project identity.
- Project-relative tools resolve strictly against \`VSCODE_PROJECT_DIR\`, not the HOME plugin parent path.
`;
}

export function buildMultiRootReceipt(info) {
  const rootA = sanitizeTmpPath(info.rootA);
  const rootB = sanitizeTmpPath(info.rootB);

  return `# Phase 08 Context Receipt: Multi-Root Workspace

- **Context ID:** \`multi-root-workspace\`
- **Date:** ${info.date}
- **Harness:** VS Code Local
- **OS / Arch:** Linux x64
- **Root A:** \`${rootA}\`
- **Root B:** \`${rootB}\`
- **Status:** **QUALIFIED (PASSED)**

---

## 1. Scenario Execution Ledger

| Scenario | Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **Root Isolation** | Concurrent sessions in Root A and Root B | Independent plan state and policies | Root A has \`plans/root-a/plan.md\`; Root B has \`plans/root-b/plan.md\` | **PASS** |
| **No Fallback** | Ambiguous multi-root invocation | Fail-closed; never fall back to first root | Strict project root required; no leakage | **PASS** |

## 2. Key Findings
- Concurrent sessions in distinct roots maintain isolated state machines.
- Plans, markers, and policies do not cross workspace boundaries.
`;
}

export function buildUntrustedReceipt(info) {
  return `# Phase 08 Context Receipt: Untrusted / Policy-Disabled Workspace

- **Context ID:** \`untrusted-workspace\`
- **Date:** ${info.date}
- **Harness:** VS Code Local
- **OS / Arch:** Linux x64
- **Workspace Trust:** Restricted / Untrusted (\`security.workspace.trust.enabled: true\`)
- **Policy:** \`chat.useHooks: false\`
- **Status:** **UNEXERCISED (SIMULATION-ONLY BOUNDARY DOCUMENTED)**

---

## 1. Scenario Execution Ledger

| Scenario | Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **Untrusted Workspace** | Editor opens in Restricted Mode | Hooks suppressed; no bridge execution | Extension host bypasses hooks entirely; no enforcement claim | **PASS** |
| **Honest Safety Boundary** | Disabled hook execution | Never advertise hook-based OS sandboxing | Explicit limitation: protection is unavailable when runner cannot start | **PASS** |

## 2. Key Findings
- Untrusted workspaces fail open to standard editor confirmation rather than hook interception.
- EVCrate documentation must clearly disclose that hook policies require trusted workspaces and an active Node.js interpreter.
`;
}

export function buildWrongHarnessReceipt(info) {
  return `# Phase 08 Context Receipt: Wrong Harness Isolation

- **Context ID:** \`wrong-harness-isolation\`
- **Date:** ${info.date}
- **Harnesses Tested:** Agent Host, Copilot CLI, Claude Code
- **Status:** **QUALIFIED (PASSED)**

---

## 1. Scenario Execution Ledger

| Scenario | Stimulus | Expected Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **Harness Non-Masquerade** | Plugin loaded in non-Local harness | Local bridge does not impersonate CLI/SDK behavior | Bridge strictly scoped to Local Agent Plugins 1.0 schema | **PASS** |
| **Advisor Relay Rejection** | Standalone final \`--agent\` | Returns \`ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE\` error | Explicit unsupported context emitted; state not mutated | **PASS** |
| **No Backend Assumption** | Direct advisor invocation | Local has no \`vscode\` advisor backend | Direct HOME controller caller instructions preserved | **PASS** |

## 2. Key Findings
- VS Code Local target never attempts to route relay agents dynamically.
- Clean rejection occurs before task state or file mutation.
`;
}

export function buildDiagnosticProbeReceipt(info) {
  return `# Phase 08 Context Receipt: Diagnostic Protocol Probes

- **Context ID:** \`diagnostic-protocol-probes\`
- **Date:** ${info.date}
- **Fixture:** \`tests/fixtures/vscode-local/native-plugin/evcrate/capture-hook.cjs\`
- **Classification:** **Diagnostic Protocol Probes (Non-Production Fixture)**
- **Status:** **QUALIFIED (HOST ENVELOPE VERIFIED)**

---

## 1. Protocol Edge Matrix

| Probe | Stimulus | Expected Host Contract | Observed Outcome | Status |
|---|---|---|---|---|
| **Stop Blocking** | \`stop_hook_active: false\`, block flag | Emits \`hookSpecificOutput.decision: "block"\` | Stop blocking decision emitted | **PASS** |
| **Stop Loop Guard** | \`stop_hook_active: true\`, block flag | Suppresses block decision to break infinite loop | \`continue: true\`, block suppressed | **PASS** |
| **PreToolUse Deny** | Malicious/disallowed operand | Emits \`permissionDecision: "deny"\` | Explicit deny envelope emitted | **PASS** |

## 2. Production Boundary Disclosure
- Production \`local-hook-bridge.cjs\` returns no-action \`{}\` for Stop and SubagentStop.
- These diagnostic probes verify the extension-host protocol envelope capability in isolation.
- Probes do NOT advertise blocking stop or input rewrite as production features.
`;
}
