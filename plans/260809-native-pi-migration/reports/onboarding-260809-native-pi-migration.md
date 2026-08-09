# Phase 01 Onboarding Summary

**Date:** 260809
**Status:** Complete

## Required setup

- No new API keys or credentials.
- No provider/model defaults are changed.
- Pi must be manually stopped before live HOME publication.
- `npm:pi-code` must be removed manually before actual Pi publication; EVCrate never removes it.

## Managed packages

- `npm:pi-subagents@0.44.0`
- `npm:@juicesharp/rpiv-ask-user-question@2.4.0`

Only these package identities are merged into `~/.pi/agent/settings.json`. User settings, packages, sessions, providers, models, and credentials remain unmanaged.

## Commands

```bash
python3 distribute.py --build
python3 distribute.py --check
EVCRATE_HOME=<isolated-home> EVCRATE_STATE_HOME=<isolated-state> python3 distribute.py --publish --dry-run --json
```

Use `PI_CODING_AGENT_DIR` only as a runtime Pi resource-root override; it is not a publication destination.

## Phase 02 update

- No new API keys, environment variables, or user configuration are required.
- Build now generates native Pi commands, workflows, agents, skills, hooks, scripts, inventory, semantic model roles, and the managed-settings fragment.
- Use `python3 distribute.py --build` followed by `python3 distribute.py --check`; do not run live Pi publication or manual cutover yet.

## Next steps

1. Continue with Phase 03 native runtime extension and provider-role resolution.
2. Keep live Pi cutover deferred until Phases 03–05 pass.
3. Before cutover, remove `pi-code`, quiesce Pi, review dry-run output, then publish with recovery available.
