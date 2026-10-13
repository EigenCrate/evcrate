---
title: "Fix Windows wrapper path resolution in Linux CI"
description: "Normalize captured Windows wrapper operands without weakening safe editor launch checks."
status: completed
priority: P1
effort: 2h
branch: main
tags: [bugfix, cli, vscode, ci]
created: 2026-10-13
---

# Windows wrapper path resolution

## Root cause and scope

The supplied GitHub job showed the versioned Windows-wrapper coordinator test returning exit 5 where it expected success. The log excerpt did not include the captured notice reason. Local reproduction exposed the first failure: the test injected `runtime.platform: 'win32'` while using POSIX temporary paths. The coordinator passed that injected editor platform to `resolveVscodeSettingsPaths`, which selected `path.win32`; Linux then tried to `lstat` a Windows-form descriptor path before reaching editor resolution.

The resolver also had an independent defect: captured `%~dp0` fragments containing backslashes were passed unchanged to host-native `resolve()`. On POSIX, backslashes are ordinary filename characters. The versioned layout has no usable unversioned fallback, so the resolver failed after descriptor-path handling was corrected.

Implementation preserves `runtime.platform` for editor selection, uses `process.platform` for local artifact paths, and normalizes only the two captured wrapper operands. Existing containment, regular-file, and symlink checks remain unchanged.

## Target files

- `src/cli/vscode-editor-launcher.ts`: normalize captured wrapper operands before host-native resolution.
- `src/cli/vscode-companion-installation.ts`: resolve locally opened plugin artifacts using host filesystem semantics.
- `tests/cli/vscode-companion-installation.test.mjs`: cover coordinator and resolver behavior across host/editor platform separation, layouts, launch arguments, environment, and fail-closed paths.
- `docs/project-changelog.md`: document exact evidence and qualification limits.

## Completed implementation and validation

- [x] Reproduced the failing focused test after a clean build; it returned `5 !== undefined`. The captured notice from the subsequent local reproduction identified the earlier descriptor-path failure.
- [x] Normalized backslashes only in captured `%~dp0` executable and CLI fragments; kept fallback order, containment, symlink, regular-file, and failure behavior.
- [x] Kept coordinator Windows simulation on POSIX with host-native artifact lookup. Asserted every runner call uses the expected executable, `cli.js` prefix, `ELECTRON_RUN_AS_NODE=1`, and Electron opt-in; version probe has no profile; all extension list/install operations preserve the selected profile.
- [x] Added direct resolver coverage for backslash, forward-slash, and mixed separators; versioned/unversioned layouts; and fallback discovery.
- [x] Added coordinator coverage for existing traversal targets outside the install root and missing layouts. Each returns exit 5, a schema-valid failed notice with the resolver reason, and zero process-runner calls.
- [x] Fresh local validation on Linux x64 / Node 24.16.0: `npm run build` exit 0; focused companion test 20/20; `npm run test:cli` 88 passed, 1 Windows-only skipped, 0 failed.
- [x] Updated `docs/project-changelog.md` with observed verification and explicit boundaries.

## Validation commands

```sh
npm run build
node --test tests/cli/vscode-companion-installation.test.mjs
npm run test:cli
```

The earlier monolithic `npm test` attempt timed out after 600 seconds during `test:cutover`. Separate `test:validation-rollout` and `test:distribution:rollout` runs failed while ignored v2.11.0 release assets were present; no clean rerun established causal attribution, and the assets were left untouched. Full-suite completion and rollout success are not claimed.

## Risk boundary

Injected `win32` behavior is exercised against the host filesystem, not native Windows binaries. Native Windows execution and the external GitHub Actions run remain unverified. The targeted code and CLI tests pass; separate rollout-suite failures remain unresolved, and their relationship to this fix is unconfirmed.

## Unresolved questions

- Native Windows and remote CI qualification require those environments.
- The cause of the earlier separate rollout-suite failures remains unconfirmed; ignored `dist/release/` artifacts were not removed or changed.
