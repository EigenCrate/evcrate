# Phase 04 — Host Qualification Ledger

- **Date:** 2026-10-06
- **OS / Platform:** Linux x64 (kernel `7.1.10-200.fc44.x86_64`, Fedora 44)
- **Node / npm:** Node v24.16.0, npm 12.0.2
- **Harness:** OMP 18.6.1 (`/home/loidinh/.bun/bin/omp`)
- **Active Harness Model:** `google-antigravity/gemini-3.8-flash:high` (canonical `@smol`), `openai-codex/gpt-6.1-sol`
- **Provider Access:** Read-only `PI_CODING_AGENT_DIR=/home/loidinh/.omp/agent` (no live user HOME writes, no policy mutations, no unapproved provider setup/cost on other hosts)
- **Scope Restriction:** Linux x64 focus only; Windows and macOS are explicitly excluded per user contract (not failed blockers or qualified outcomes).

---

## 1. Executive Summary & Host Availability Ground Truth

Parent inspection verified exact host binary availability and versions on the current Linux workstation PATH:
- **`omp`**: 18.6.1 (`/home/loidinh/.bun/bin/omp`)
- **`claude`**: 2.1.288 (Claude Code at `/home/loidinh/.local/bin/claude`)
- **`codex`**: codex-cli 0.160.0 (`/home/loidinh/.local/bin/codex`)
- **`gemini`**: 0.47.0 (`/home/loidinh/.nvm/versions/node/v24.16.0/bin/gemini`)
- **`pi`**: 0.85.1 (`/home/loidinh/.nvm/versions/node/v24.16.0/bin/pi`)
- **`copilot`**: GitHub Copilot CLI 1.0.83 (`/home/loidinh/.local/bin/copilot`)
- **`code` (VS Code)**: 1.140.0 x64 commit `07f806f999227108933c2e30515b26eecc1fda74` (`/usr/bin/code`)
- **`antigravity`**: Absent on PATH (active as model route in OMP harness)

**Host Qualification Status:**
These host binaries are **AVAILABLE on host PATH but NOT model-qualified** on external vendor CLI loops in this activation plan. Only the existing approved ordinary OMP authorization route (`PI_CODING_AGENT_DIR=/home/loidinh/.omp/agent`) is approved; no new provider setup or unapproved cost is incurred on other hosts. Local published resource closures and Pi API integration tests qualify the **fixture tier**, not full native vendor host loops.

**Transport Architecture Separation:**
1. **Native-User Slash Command Discovery (`createCommand` in `activation.ts`):**
   - Enforces interactive CLI user invocation (`source: "native-user"`, `handoff: null`).
   - Validates `off` and `explicit` modes only; returns prompt prepended with `evcrate_omp_command_context` header.
   - Fail-closed gate: missing helper or missing neutral workflow halts before prompt admission in ~1.2s with 0 LLM turns.
   - Does NOT receive or pass model-child handoffs.
2. **Child Prompt Transport (Inherited Router-to-Child & Same-Run):**
   - Implemented via synchronous extension transport forwarding structured handoff into genuine generated `code.md` prompts (reusing the Phase 02 pattern).
   - Allows router (`cook.md`) to execute child (`code.md`) synchronously with direct caller handoff context, asserting zero synthetic `--advice` flag.
   - For invalid same-run, executes model command receiving handoff context via extension without falsely claiming native slash passes handoffs it cannot receive.

---

## 2. Host Qualification Ledger Table

| Target | Generated Resource Closure | HOME/Project Fixture Lookup | Installed Helper Smoke | Raw Input Observed | Pre-Run Handoff Observed | Same-Run Handoff Observed | Off-Path No-Mentoring Trace | Native OS / Version | Result / Limitation |
|---|---|---|---|---|---|---|---|---|---|
| **Claude** | Verified via `publishApply`: `.claude/commands/`, workflows, skills | Verified: resolves `$HOME/.evcrate/bin/evcrate-advice-mode` | Verified: exit 0, JSON `MODE_READY` via `spawnSync` | Qualified in fixture: raw args interpolated verbatim | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | Linux x64 (Fedora 44, Node v24.16.0) | **AVAILABLE ON PATH (Claude Code 2.1.288)**; fixture tier and installed helper smoke qualified; live vendor provider execution unapproved mid-flight. |
| **Codex (+.agents)** | Verified via `publishApply`: `.codex/`, companion `.agents/`, `AGENTS.md` | Verified: resolves `$HOME/.evcrate/bin/evcrate-advice-mode` | Verified: exit 0, JSON `MODE_READY` via `spawnSync` | Qualified in fixture: arguments preserved across companion boundaries | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | Linux x64 (Fedora 44, Node v24.16.0) | **AVAILABLE ON PATH (codex-cli 0.160.0)**; fixture tier and installed helper smoke qualified; companion `.agents` verified; live vendor provider execution unapproved mid-flight. |
| **Gemini** | Verified via `publishApply`: `.gemini/` output root, overlay templates, `GEMINI.md` | Verified: resolves `$HOME/.evcrate/bin/evcrate-advice-mode` | Verified: exit 0, JSON `MODE_READY` via `spawnSync` | Qualified in fixture: template substitution preserves quotes and Unicode | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | Linux x64 (Fedora 44, Node v24.16.0) | **AVAILABLE ON PATH (gemini 0.47.0)**; fixture tier and installed helper smoke qualified; live vendor CLI loop unapproved mid-flight. |
| **Antigravity** | Verified via `publishApply`: `.antigravity/` output root, `.gemini/config` binding | Verified: resolves `$HOME/.evcrate/bin/evcrate-advice-mode` | Verified: exit 0, JSON `MODE_READY` via `spawnSync` | Qualified in fixture: argument verbatim preservation | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | Linux x64 (Fedora 44, Node v24.16.0) | **ABSENT ON PATH**; active as model route in OMP harness; standalone desktop runtime unexercised. |
| **OMP** | Verified via `publishApply`: `.omp/commands/cmd-code/index.ts`, `omp-command-runtime.ts`, neutral workflows | Verified: resolves `$HOME/.evcrate/bin/evcrate-advice-mode` strictly from HOME; rejects project helper | Verified: exit 0, JSON `MODE_READY`; fail-closed in 1.2s on missing helper | Qualified in native execution: rawArgs string required; preserves quotes, tabs, CRLF, Unicode | QUALIFIED NATIVE: s03 actual cook router -> delegate_code -> child pre-run handoff observed with exit 0 | QUALIFIED NATIVE: s05 stale revision rejection observed with exit 0; state hash invariant | QUALIFIED NATIVE: s01 clean off & s07 completed auto no-op observed with 0 mentoring reads | Linux x64 (Fedora 44, Node v24.16.0, OMP 18.6.1) | **QUALIFIED (NATIVE & FIXTURE)**: Full registered native slash command dispatch (/cmd-code, /cmd-code__auto, /cmd-cook), fail-closed pre-prompt gate, and 6 mandatory actual classes verified. |
| **Pi (User Command)** | Verified via `publishApply`: `.pi/agent/extensions/evcrate/commands.js`, `findManagedCommand`, `expandManagedCommand` | Verified: extension root derived from loaded URL; neutral workflows loaded from installed extension | Verified: helper executed via child process; valid mode returned | Qualified in fixture: raw arguments passed into expansion | NOT RUN ON NATIVE HOST (fixture expansion verified; live Pi CLI loop unapproved) | NOT RUN ON NATIVE HOST (fixture expansion verified; live Pi CLI loop unapproved) | Qualified in fixture: off-path expansion omits mentoring content | Linux x64 (Fedora 44, Node v24.16.0, Pi 0.85.1) | **AVAILABLE ON PATH (Pi 0.85.1)**; Pi node runtime integration tests passing; extension package bundles TypeBox; native Pi CLI present locally but unapproved mid-flight. |
| **Pi (Model Command Tool)** | Verified via `publishApply`: `.pi/agent/extensions/evcrate/command-tool.js`, `dispatchManagedCommand` | Verified: resolves extension root; constructs `evcrate-pi-command-context` header (`source: 'model-tool'`) | Verified: validates helper output; validates handoff schema | Qualified in fixture: raw arguments preserved in context header | Qualified in fixture: pre-run handoff preserved in header | Qualified in fixture: same-run handoff preserved; invalid handoff rejected | Qualified in fixture: model tool dispatches only authorized scope | Linux x64 (Fedora 44, Node v24.16.0, Pi 0.85.1) | **AVAILABLE ON PATH (Pi 0.85.1)**; Native RPC and model tool dispatch tests passing; strict schema validation on handoff parameter; live provider loop unapproved mid-flight. |
| **Copilot (CLI)** | Verified via `publishApply`: `.copilot/` projection, `settings.json` managed keys, SKILL.md navigation | Verified: resolves `$HOME/.evcrate/bin/evcrate-advice-mode` | Verified: exit 0, JSON `MODE_READY` via `spawnSync` | Qualified in fixture: literal quotes and UTF-8 Unicode (`tiếng Việt 日本`) preserved | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | Linux x64 (Fedora 44, Node v24.16.0) | **AVAILABLE ON PATH (Copilot CLI 1.0.83)**; fixture tier and installed helper smoke qualified; vendor network calls unapproved mid-flight. |
| **VS Code (Local)** | Verified via `publishApply`: `.evcrate-vscode/` projection, `.evcrate.json` config preservation | Verified: resolves `$HOME/.evcrate/bin/evcrate-advice-mode` | Verified: exit 0, JSON `MODE_READY` via `spawnSync` | Qualified in fixture: preserves raw parameters in command launch | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | NOT RUN ON NATIVE HOST (fixture contract only; live host loop unapproved) | Linux x64 (Fedora 44, Node v24.16.0, Code 1.140.0) | **AVAILABLE ON PATH (VS Code 1.140.0)**; Local VS Code runtime integration suite passing; GUI interaction unexercised. |
---

## 3. Platform & Host Availability Notes

### 3.1 Linux Workstation PATH Status
- Current workstation binaries:
  `omp 18.6.1`, `claude 2.1.288`, `codex-cli 0.160.0`, `gemini 0.47.0`, `pi 0.85.1`, `copilot 1.0.83`, `code 1.140.0`.
- All binaries exist on PATH, but only OMP is authorized for model-driven workflow execution via existing local auth cache (`PI_CODING_AGENT_DIR=/home/loidinh/.omp/agent`).
- Other target CLIs are not model-qualified in this phase; they are ledgered as **AVAILABLE ON PATH, NOT MODEL-QUALIFIED**.
- Non-OMP target testing relies on canonical fixture publishing (`publishApply`) and unit/integration contract suites.

### 3.2 Non-Linux Platforms
- **Windows (PowerShell / cmd.exe):** **EXCLUDED PER CURRENT USER CONTRACT.** Windows qualification scripts exist in repository (`tests/advisor-controller/native-windows-qualification.cjs`), but Windows execution is explicitly out of scope for this Linux qualification cycle. Not marked as passed or failed; excluded from this release boundary.
- **macOS (Darwin arm64/x64):** **UNSUPPORTED / EXCLUDED.** EVCrate V2 state and advisor architecture does not claim macOS qualification; excluded from this release boundary.

---

## 4. Evidence Tiers and Transport Boundaries

Evidence is strictly separated into four tiers:

1. **Tier 1 (CLI & Unit Regressions):**
   - Direct execution of `evcrate-advice-mode` with bounded stdin.
   - Schema validation, 64 KiB input limit, 256 KiB output limit, argument parsing.
2. **Tier 2 (Durable Controller State Regressions):**
   - Direct execution of `task-state.cjs` and `state-io.cjs` using Matrix helpers (`activation-qualification-helpers.cjs`).
   - Get-only locks, baseline digests, completion receipts, and state hash invariance.
3. **Tier 3 (Generated & Installed Fixture Probes):**
   - Execution of `publishApply` in disposable temporary roots (`/tmp/evcrate-installed-advice-*`).
   - Materializes authentic `.omp`, `.pi`, `.claude`, `.codex`, etc. projections without placeholder scaffolding.
4. **Tier 4 (Native Harness Traces):**
   - Execution of real host binary (`/home/loidinh/.bun/bin/omp`) with candidate resources.
   - Native-user slash commands (`/cmd-code`) qualify user discovery and fail-closed gates.
   - Synchronous extension transport qualifies router-to-child delegation and same-run handoff.
