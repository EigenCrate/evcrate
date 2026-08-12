# Native Pi migration

## Ownership and build

EVCrate authors commands, agents, workflows, hooks, scripts, and skills in `.evcrate/source/.claude/`. The Pi-specific extension overlay in `.evcrate/targets/pi/files/` is applied during an isolated build; the build then generates `.evcrate/source/.pi/` from the canonical source and overlay. Generated files are not hand-edited: change the canonical source or overlay, then rebuild.

Regenerate and verify Pi parity without touching live configuration:

```bash
python3 distribute.py --build --target pi
python3 distribute.py --check --target pi
```

`--check` regenerates isolated staging and byte-compares the local generated artifact. Publication consumes only a current verified build and publishes `EVCRATE_HOME/.pi` to `EVCRATE_HOME/.pi`. `PI_CODING_AGENT_DIR` is runtime-only and never changes the publisher destination. Native Windows validation remains pending.

## Runtime model

- Commands are registered recursively: `commands/fix/fast.md` becomes `/fix:fast`.
- `evcrate_command` performs bounded nested command expansion; static workflows remain Markdown documents, not executable JavaScript workflows.
- Generated agents retain semantic roles (`strong`, `standard`, `fast`, `parent`) rather than model IDs. For `openai-codex`, implicit routes are Sol/high, Terra/high, and Luna/low respectively. Unknown providers inherit the parent model; EVCrate never guesses a cross-provider route.
- `evcrate_subagent` uses the structured `pi-subagents` transport. A terminal response proves execution completed, not that the parent accepted the result. The parent must still inspect artifacts and run requested tests or review gates.
- The extension is the sole Pi lifecycle/tool-hook owner. Session starts map Pi `startup`, `new`, `resume`, `fork`, and `reload` reasons to canonical SessionStart context. Manual compaction maps to `manual`; threshold and overflow compaction map to `auto`; post-compaction reapplies compact SessionStart context. Shutdown runs canonical cleanup only—Pi has no `clear` shutdown reason, so EVCrate never fabricates Claude's `SessionEnd: clear` hook. Prompt submission, tool pre/post events, and child delegation are derived from the generated hook map.

## Managed packages and settings

Publication entry-merges exactly these pinned package identities into `~/.pi/agent/settings.json`:

- `npm:pi-subagents@0.44.0`
- `npm:@juicesharp/rpiv-ask-user-question@2.4.0`
- `npm:@juicesharp/rpiv-todo@2.4.0`

It does not own provider credentials, defaults, themes, sessions, UI configuration, custom packages, user hooks, or `evcrate.modelRoles`. Package upgrades require contract-test review.

The publisher rejects malformed or symlinked settings and aborts promotion if the Pi HOME tree changes concurrently. No-op, dry-run, and rollback preserve settings bytes. `pi-code` (including versioned/object forms) is a hard conflict: remove it manually before a non-dry publish. EVCrate never removes it automatically.

### Optional model-role overrides

User-owned routes belong under `evcrate.modelRoles.providers`; EVCrate reads them but never writes them. A route must name a model available from the same active provider. Invalid or unavailable routes warn once and inherit the parent model.

```json
{
  "evcrate": {
    "modelRoles": {
      "providers": {
        "provider-id": {
          "strong": {"model": "provider-id/model", "thinking": "high"},
          "standard": {"model": "provider-id/model"},
          "fast": {"model": "provider-id/model", "thinking": "low"}
        }
      }
    }
  }
}
```

`parent` intentionally has no implicit route. Explicit per-delegation model or thinking overrides remain authoritative when valid.

## Skills and launch isolation

Pi discovers both `.pi` and `.agents` skills. Same-name Pi skills normally win with Pi's collision warning. To use only EVCrate's Pi skills:

```bash
pi --no-skills --skill "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills"
```

Pi settings cannot portably exclude only `.agents` skills while retaining automatic `.pi` skill discovery.

## Troubleshooting

- **Pi extension root:** at startup and hook adaptation, a non-empty `PI_CODING_AGENT_DIR` wins. Otherwise Node's `os.homedir()` resolves the platform profile (`USERPROFILE` on native Windows, home directory on POSIX), then existing normalization and containment checks apply. The required-root error remains unchanged when no usable root exists. Rebuild to regenerate all derived copies.
- **Missing command:** rebuild with `python3 distribute.py --build`, then run `--check`; nested Markdown paths register as `/dir:file`.
- **`pi-code` conflict:** remove that package manually, exit Pi, and review a dry-run. Publication will not remove it for you.
- **Role warning or inherited child model:** verify the selected provider has the configured route/model and that the route uses the schema above; unknown providers intentionally inherit.
- **Safety hook blocks a tool:** inspect the hook diagnostic and canonical policy. Privacy/scout failures fail closed by design.
- **Skill collision warning:** launch with the isolated-skill command above; `.agents` cannot be selectively excluded through settings.

## Safe cutover and rollback

1. Run all build/check and temporary-HOME validation gates.
2. Remove `npm:pi-code` manually and exit every Pi process that could write sessions, packages, or settings.
3. Review `python3 distribute.py --publish --dry-run --json`.
4. Publish only while Pi remains quiescent, then start Pi with the isolated-skill command above.
5. If startup fails, use `python3 distribute.py --recover` and restore the previously removed package entry manually if needed. Do not auto-reinstall `pi-code`.

Live cutover remains user-controlled and requires explicit approval after isolated validation evidence is reviewed.
