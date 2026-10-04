# Phase 01 Documentation Status: Linear URI Restoration

Date: 2026-10-05  
Status: Implementation complete, verified, and documented  
Authority: Feature-local report for Phase 01 (`plans/261004-2101-build-generation-performance/`)  
Target File: `plans/261004-2101-build-generation-performance/reports/phase-01-documentation-status.md`

---

## 1. Executive Summary

Phase 01 eliminates quadratic whole-document string rescanning during URI and protected token restoration across all target projection adapters. Previously, adapters iterated through arrays of saved URIs using sequential `text.replaceAll(token, original)` calls. On large files (such as XML schemas containing >5,000 URIs), this resulted in thousands of complete document copies and string allocations, consuming hundreds of milliseconds per file.

The optimization introduces `restoreIndexedTokens`, an internal linear-time utility executing a single-pass regex replacement with an index lookup callback ($O(N)$ with text size and token count). Across 8 adapter implementations (11 distinct callsites), legacy sequential loops are replaced while strictly maintaining byte-for-byte parity and preserving legacy semantics for edge cases involving replacement templates (`$$`, `$&`) and token collisions.

---

## 2. Shared Helper: `restoreIndexedTokens`

- **Implementation**: `src/adapters/uri-restoration.ts`
- **Re-exports**:
  - `src/adapters/projection-utils.ts`
  - `src/adapters/index.ts`

### Function Signature

```typescript
export function restoreIndexedTokens(
  text: string,
  tokenPrefix: string,
  saved: readonly string[] | readonly (readonly [string, string])[]
): string;
```

### Parameters
- `text`: Input string containing indexed placeholder tokens.
- `tokenPrefix`: Namespace prefix for tokens (e.g. `'__EVCRATE_VSCODE_URI_'`, `'__OMP_URI_'`).
- `saved`: Lookup table storing original strings. Accepts either:
  - `readonly string[]`: Token format is `${tokenPrefix}${index}__`.
  - `readonly (readonly [string, string])[]`: Tuple pairs `[token, original]`.

### Mechanics & Algorithmic Strategy

1. **Pre-scan Semantic Exception Check**:
   - Inspects the bounded `saved` collection for characters that alter replacement behavior.
   - Triggers:
     - `orig.includes('$')`: Detects potential replacement pattern expansions (`$$`, `$&`, `$'`, `` $` ``).
     - `orig.includes(tokenPrefix)`: Detects recursive or cascading token collisions where an original URI contains another token's prefix.
2. **Isolated Legacy Fallback Branch**:
   - If any exception pattern is detected, delegates directly to sequential `replaceAll` iteration.
   - Guarantees 100% bug-for-bug backward compatibility without guessing expansion intent.
3. **Linear Single-Pass Fast Path**:
   - Compiles prefix-specific global matcher: `new RegExp(`${escapedPrefix}(\\d+)__`, 'gu')`.
   - Evaluates match via callback: extracts numeric digits, checks canonical integer representation (`String(index) === indexStr`), and checks bounds (`0 <= index < saved.length`).
   - Replaces valid tokens with original text; leaves malformed, leading-zero, or out-of-bounds tokens untouched.

---

## 3. Projection Adapter Migrations (8 Adapters / 11 Callsites)

All 8 projection adapters migrated from isolated `replaceAll` loops to `restoreIndexedTokens`:

| Target / Adapter | File Path | Function / Callsite | Token Prefix | Table Shape |
|---|---|---|---|---|
| **VS Code** | `src/adapters/vscode/references.ts` | `restoreSegments` | `__EVCRATE_VSCODE_URI_` | `[token, original][]` (tuples) |
| **Copilot (Prompts)** | `src/adapters/copilot/prompts.ts` | `restore` | `__EVCRATE_COPILOT_URI_` | `[token, original][]` (tuples) |
| **Copilot (Text)** | `src/adapters/copilot/text.ts` | `renderHarness` | `__EVCRATE_HARNESS_URL_` | `string[]` (strings) |
| **OMP** | `src/adapters/omp/commands.ts` | `restoreUris` | `__OMP_URI_` | `string[]` (strings) |
| **Gemini (Harness)** | `src/adapters/gemini/replacements.ts` | `renderHarnessScriptReferences` | `__EVCRATE_HARNESS_URL_` | `string[]` (strings) |
| **Gemini (Protected)** | `src/adapters/gemini/replacements.ts` | `applyTargetReplacements` | `__GEMINI_PROTECTED_` | `string[]` (strings) |
| **Antigravity** | `src/adapters/antigravity.ts` | `renderHarness` | `__EVCRATE_HARNESS_URL_` | `string[]` (strings) |
| **Codex (Global)** | `src/adapters/codex/transforms.ts` | `applyReplacements` | `__EVCRATE_GLOBAL_URL_` | `string[]` (strings) |
| **Codex (Harness)** | `src/adapters/codex/transforms.ts` | `renderHarnessScriptReferences` | `__EVCRATE_HARNESS_URL_` | `string[]` (strings) |
| **Pi (Prompt)** | `src/adapters/pi/transforms.ts` | `translatePrompt` | `__PI_URL_` | `string[]` (strings) |
| **Pi (Harness)** | `src/adapters/pi/transforms.ts` | `renderHarnessScriptReferences` | `__EVCRATE_HARNESS_URL_` | `string[]` (strings) |

### Migration Pattern Details
- Eliminated redundant private `replaceAll` helper functions across adapter modules.
- Preserved each adapter's unique URI extraction regular expression and prefix namespace.
- Maintained exact order of transformations (protecting URIs before harness path rewriting, restoring URIs after rewriting).

---

## 4. Differential Parity Test Suite

- **Test Suite**: `tests/adapters/uri-restoration-differential.test.mjs`
- **Runner**: Node.js built-in test runner (`node:test`, `node:assert/strict`)

### Verification Matrix (13 Scenarios)

1. `empty saved array`: Returns input string unchanged when token list is empty.
2. `common-case single and multiple tokens`: Verifies parity between tuple-based legacy loop and linear callback.
3. `string-array table shape`: Verifies parity when passing 1D string array.
4. `duplicate token occurrences`: Verifies multiple appearances of the same token in document replace correctly.
5. `out-of-bounds / unmatched tokens`: Out-of-range index tokens (e.g. `__URI_99__` when length is 2) remain literal.
6. `leading zeros`: Non-canonical tokens (e.g. `__URI_01__`) remain untouched.
7. `replacement template $$`: Verifies fallback to `replaceAll` so `$$` evaluates to literal `$` per ECMAScript specification.
8. `replacement template $&`: Verifies matched token insertion preserved via fallback.
9. `replacement templates $\` and $\'`: Verifies preceding/following substring replacement preserved via fallback.
10. `cascading token collision`: Verifies sequential replacement order preserved when an original URI contains another token.
11. `adjacent URIs`: Confirms boundary matching handles contiguous tokens without whitespace.
12. `Unicode surrounding and within URIs`: Validates multi-byte UTF-8 preservation.
13. `scale parity on 5,000 synthetic URIs`: Generates 5,000 synthetic OpenXML namespace entries, verifying byte identity against legacy implementation.

### Test Execution Results
- Command: `npm run test:adapters`
- Suite count: 122 tests executed, 122 passed, 0 failed, 0 skipped.
- Execution duration: 21.52 s wall time.

---

## 5. Performance Benchmark Evidence

- **Script**: `scripts/benchmark-uri-restoration.mjs`
- **Workload**: Real-world schema `.evcrate/source/.claude/skills/document-skills/docx/ooxml/schemas/ISO-IEC29500-4_2016/sml.xsd`
  - File size: 242,277 bytes
  - Extracted URIs: 5,060 tokens

### Measured Results

| Metric | Legacy Sequential `replaceAll` | Linear `restoreIndexedTokens` | Variance / Delta |
|---|---:|---:|---:|
| **Execution Duration** | 880.82 ms – 883.03 ms | 1.61 ms – 1.88 ms | **~470× – 547× faster** |
| **Output Identity** | Baseline | Byte-for-byte identical | Verified (`true`) |
| **Wall Clock (Script)** | — | 0.92 s | Includes I/O and setup |

### Build Status
- Command: `npm run build`
- Result: **PASS** (4.14 s wall time)
- Output: Clean TypeScript compilation under NodeNext module target; prebuild generator and advisor-runtime succeeded with no warnings.

---

## 6. Shared Documentation Status

Per documentation governance rules (`plans/261004-2101-build-generation-performance/reports/documentation-delta-261004-build-generation-performance.md`):
- Updates to shared central documents (`docs/system-architecture.md`, `docs/code-standards.md`, `docs/codebase-summary.md`) remain **deferred** until Phase 05 completion and parent merge integration.
- This status document provides the complete technical record and evidence base required for Phase 01 handoff and future consolidation.

---

## 7. Unresolved Questions

1. **`$` fallback granularity**: Should future phases narrow exception checks to specific sequences (`$$`, `$&`, `$'`, `` $` ``) rather than any `$` character, avoiding legacy fallback for benign URI characters such as OData `$select`?
2. **Static regex pre-compilation**: Should high-traffic token prefixes be cached in a static `Map<string, RegExp>` within `src/adapters/uri-restoration.ts` to reduce garbage collector pressure during high-throughput CLI generation?
