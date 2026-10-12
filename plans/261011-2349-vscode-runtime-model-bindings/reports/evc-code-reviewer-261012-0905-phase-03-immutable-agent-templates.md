# Code Review — Phase 03 Immutable agent templates

Score: 8/10. Verdict: PASS w/ warnings. No critical.

## Scope
- Files: src/adapters/vscode/{agents,names,inventory,adapter,metadata,index,configuration-activation-guide}.ts, deleted models.ts, src/adapters/projection-utils.ts, model-intent.ts (Phase 02, consumed), .evcrate/targets/vscode/manifest.json, tests/adapters/vscode-{configuration,resource-projection}.test.mjs, generated .evcrate/source/.evcrate-vscode/{evcrate/agent-intent.json,agent-templates/*,agent-tool-audit.json,projection-inventory.json,resource-name-map.json,examples/activation-guide.md}, build manifests.
- Plan: phase-03-immutable-agent-templates.md (todo list + plan.md still "Pending 0%" — NOT updated by me; Main owns).

## Validation
- `npm run build` OK.
- `node --test tests/adapters/vscode-*.test.mjs tests/adapters/contracts.test.mjs tests/vscode-companion/*.test.mjs`: 115/115 pass.
- `npm run test:adapters`: 231/231 pass.
- `npm run test:build-generation`: 75/75 pass.
- `npm run distribute:check`: status ok (generated outputs + build manifests consistent w/ current adapters).
- Independent script: 17 actors in intent == 17 audit entries; every `templateSha256` == sha256 of on-disk template bytes (0 mismatch); tiers haiku 9 / sonnet 5 / opus 2 / inherit 1 == canonical source model counts.
- Old vs new templates diff: only `model:` line removed (16 lines), nothing else changed (tools/agents/visibility/body identical). Inherit actor unchanged.
- grep stale refs `model-map|VSCODE_LOCAL_MODEL_MAP|resolveLocalModel|buildVscodeModelMap|LOCAL_MODEL_UNAVAILABLE` in src/docs/generated: none. `com.github.copilot/agents` gone from vscode output; plugin.json has no agents key.
- Other targets: only build-manifest hash churn (shared projection-utils.js hash); no other-target output diff.
- Not run: full `npm test`, native VS Code discovery (Phase 09 gate).

## Critical
None.

## Warnings
1. Activation guide (configuration-activation-guide.ts + generated activation-guide.md) advertises not-yet-existing things as instructions: `evcrate publish --apply --install-vscode-companion` (flag exists nowhere in src except guide), `.evcrate-vscode/evcrate/companion/` (no VSIX/descriptor in output until Phase 07), commands `evcrate.selectInstallation` etc. (extension has only contracts). Plan step 5 says guidance must not misrepresent availability. Either word as "planned/after Phase 07-08" or trim until those phases land; branch is already flagged not release-qualified, but never publish half-cutover.
2. No adapter-level negative test for step 7 "invalid intent fails". Only unit tests on `resolveCanonicalModelIntent`. Missing: canonical agent w/ `model: claude-3-opus` / non-string / wrong-case (`Opus`) makes `convertVscodeAgents`/build throw `VALIDATION_INVALID`; template keeps `skills`/`permissionMode`/`tools: []`+`agents: []` for leaf; intent/audit hash == emitted bytes. Behavior tightened (old code lowercased alias; new rejects `Opus`) — fine but untested.
3. Qualification scripts still read removed path `com.github.copilot/agents/evc-*.agent.md` for the real candidate: scripts/qualification/scenario-phase05-native-delegation.mjs:277 (N03 evc-scout), scenario-phase06-docs-workflow.mjs:412, :582 (readdir on removed dir -> ENOENT), receipt-templates.mjs:54 text. Fixture `contract-*` agents (own fixture plugin) fine. Must migrate in Phase 09 or earlier; else those scenarios break on new candidate.
4. Discovery of `evcrate/agent-templates/*.md` by host not evidenced: grep of Phase 01 reports finds no `agent-templates` proof. Plan Risk defers to Phase 09 native inventory — acceptable, but keep as hard gate; do not claim "not discoverable" in docs yet.
5. projection-utils.ts exempts whole `agent-intent.json` + `agent-tool-audit.json` from the `.claude` unsafe-text scan (because Phase 02 contract regex forces `sourcePath: .claude/agents/...`). Safe today (paths strictly regex-validated at write time), but file-wide exemption in a SHARED helper also invalidates all 6 other targets' adapter hashes. Narrower option: scan after stripping the validated `sourcePath`/`source` fields, or exempt only vscode via adapter-level option.
6. `inventory.ts` still imports `VscodeAgentAudit` via alias `export type { VscodeAgentAuditEntryV2 as VscodeAgentAudit }` in agents.ts. Plan says no aliases/shims; migrate inventory import to `VscodeAgentAuditEntryV2` and drop alias. (`agentAudits` param in buildVscodeInventory is unused — verify/remove.)
7. Inventory schema id stays `evcrate-vscode-projection-inventory-v1` though disposition `immutable-template` + `maps.intent` were added; plan step 5 says "disposition/version changes". Confirm no consumer enumerates dispositions (none found in src/scripts) or bump version.

## Suggestions
- agents.ts: redundant non-string guard before `resolveCanonicalModelIntent` (resolver already throws on non-string) — drop (DRY/KISS). `disableModelInvocation` computed with ternary then re-tested with same typeof check; collapse.
- agents.ts hardcodes `.claude/agents/` and `evcrate/agent-templates/` literals; derive template path from `entry.target` (single source of truth in names.ts) so path drift can't desync target vs templatePath.
- adapter.ts: stray blank line before closing `}` after removing model-map write.
- Audit and intent both carry templateSha256/tools/delegation (intentional per plan); add a single cross-check in validate() that audit and intent agree to prevent drift.
- Phase 03 todo + plan.md status should flip once warnings 1-3 resolved.

## Positives
- Clean cutover: models.ts + generated model-map.json + 17 static agents deleted, zero stale refs, no shims in index/metadata exports; explicit test asserts old exports undefined.
- Strict fail-closed model validation (reject concrete/unknown/non-string), no historical Claude IDs anywhere in output.
- Hash binds emitted bytes; verified equal. Deterministic ordering. Tool/delegation/visibility/skills/permission (non-bypass) semantics byte-identical to prior output — no privilege broadening.
- Intent/audit written only after schema validation (`validateAgentIntentManifest`/`validateAgentToolAuditV2`), reusing Phase 02 contracts.
- Tests assert observable behavior (key absence, tier in intent, no `com.github.copilot/agents` dir, no model-map).

## Security / performance
- No new network/FS/process surface. Perf: O(n) over 17 files, one extra sha256 each; negligible.
- Hashes assert coherence only; guide wording doesn't claim trust (ok).

## Unresolved questions
1. Is guide text allowed to precede Phase 07/08 delivery, or should it be gated until they land?
2. Should `projection-inventory` schema version bump for new disposition/`maps.intent`?
3. Who migrates qualification scenario scripts (phase05/06) — Phase 09 or now?
4. Is wrong-case alias (`Opus`) rejection intended (behavior change vs old lowercase tolerance)?
