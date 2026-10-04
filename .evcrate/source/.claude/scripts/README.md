# Claude Code Scripts

Centralized utility scripts for Claude Code skills.

## Installation

Install required dependencies:

```bash
pip install -r requirements.txt
```

## resolve_env.py

Centralized environment variable resolver that follows Claude Code's hierarchy.

### Priority Order (Highest to Lowest)

1. **process.env** - Runtime environment variables (HIGHEST)
2. **PROJECT/.claude/skills/\<skill\>/.env** - Project skill-specific
3. **PROJECT/.claude/skills/.env** - Project shared across skills
4. **PROJECT/.claude/.env** - Project global defaults
5. **~/.claude/skills/\<skill\>/.env** - User skill-specific
6. **~/.claude/skills/.env** - User shared across skills
7. **~/.claude/.env** - User global defaults (LOWEST)

### CLI Usage

```bash
# Resolve a variable for a specific skill
python ~/.claude/scripts/resolve_env.py GEMINI_API_KEY --skill ai-multimodal

# With verbose output
python ~/.claude/scripts/resolve_env.py GEMINI_API_KEY --skill ai-multimodal --verbose

# Find all locations where variable is defined
python ~/.claude/scripts/resolve_env.py GEMINI_API_KEY --find-all

# Show hierarchy for a skill
python ~/.claude/scripts/resolve_env.py --show-hierarchy --skill ai-multimodal

# Export format for shell sourcing
eval $(python ~/.claude/scripts/resolve_env.py GEMINI_API_KEY --export)
```

### Python API Usage

```python
# Add to sys.path if needed
import sys
from pathlib import Path
sys.path.insert(0, str(Path.home() / '.claude' / 'scripts'))

from resolve_env import resolve_env, find_all, show_hierarchy

# Simple resolution
api_key = resolve_env('GEMINI_API_KEY', skill='ai-multimodal')

# With default value
api_key = resolve_env('GEMINI_API_KEY', skill='ai-multimodal', default='fallback-key')

# With verbose output
api_key = resolve_env('GEMINI_API_KEY', skill='ai-multimodal', verbose=True)

# Find all locations
locations = find_all('GEMINI_API_KEY', skill='ai-multimodal')
for description, value, path in locations:
    print(f"{description}: {value}")

# Show hierarchy
show_hierarchy(skill='ai-multimodal')
```

### Integration Pattern

Skills should use this script instead of implementing their own resolution logic:

```python
#!/usr/bin/env python3
import sys
from pathlib import Path

# Import centralized resolver
sys.path.insert(0, str(Path.home() / '.claude' / 'scripts'))
from resolve_env import resolve_env

# Resolve API key
api_key = resolve_env('GEMINI_API_KEY', skill='ai-multimodal')

if not api_key:
    print("Error: GEMINI_API_KEY not found")
    print("Run: python ~/.claude/scripts/resolve_env.py --show-hierarchy --skill ai-multimodal")
    sys.exit(1)

# Use api_key...
```

### Benefits

- **Consistent**: All skills use the same resolution logic
- **Maintainable**: Single source of truth for hierarchy
- **Debuggable**: Built-in verbose mode and find-all functionality
- **Flexible**: Supports both project-local and user-global configs
- **Clear**: Shows exactly where each value comes from

### Testing

```bash
# Test without any config files
python ~/.claude/scripts/resolve_env.py TEST_VAR --verbose

# Test with environment variable
export TEST_VAR=from-runtime
python ~/.claude/scripts/resolve_env.py TEST_VAR --verbose

# Test with skill context
python ~/.claude/scripts/resolve_env.py GEMINI_API_KEY --skill ai-multimodal --find-all
```

## Catalog Scanners & Generators

A suite of strict, fail-closed utilities for scanning commands and skills, validating catalog metadata, and producing target-native YAML catalogs.

### Core Scripts

- `scan_commands.py`: Scans command definitions and produces adjacent `commands_data.yaml`.
- `scan_skills.py`: Scans skill directories and produces adjacent `skills_data.yaml`.
- `generate_catalogs.py`: Validates data files, checks freshness, and generates structured command and skill catalogs.

### Core Principles & Contracts

1. **CWD Independence**:
   - All scanner defaults resolve paths relative to `__file__`, never CWD (`Path(__file__).resolve().parent`).
   - Scripts can be executed from any working directory using absolute or relative paths:
     ```bash
     ( cd /tmp && python3 /path/to/.claude/scripts/scan_commands.py )
     ```
   - Target scanners refresh their adjacent target-native data from adapter-managed resources only.

2. **Atomic & Fail-Closed Behavior**:
   - Command frontmatter/TOML parsing fails closed: missing `description`, malformed syntax, invalid types, and invalid command-skill names (when present) raise `ScanError` and exit non-zero. Skill scanners reject malformed frontmatter; when a skill has no description, they derive its first body paragraph.
   - Output writing uses `atomic_write_yaml`: writes first to a temporary file in the destination directory, closes it, then atomically renames (`Path.replace`) over the target path.
   - Pre-existing files (sentinels) are untouched if scanning or validation fails.

3. **Source Normalization**:
   - Command descriptions and fallback skill paragraphs trim surrounding whitespace.
   - Missing optional fields (for example `argument-hint`) normalize to empty strings.

4. **Managed-Only Scanning**:
   - Target scanners discover resources using `scanner-layout.json` configuration (`format`, `root`, `output`, `authority`).
   - Scanners scan only EVCrate-managed resources bound by adapter maps and inventories. Unrelated user commands or skills sharing a target root are ignored.
   - Template skills (`template-skill`) are excluded.

5. **Tool Independence & Non-Integration**:
   - Scanners and catalog generators are decoupled from `ev-help.py`.
   - There is no `ev-help.py` integration, no shared generated-data runtime dependency, no search flags, and no general-skill or query UI.

### Data Schemas

#### `commands_data.yaml`
List of command records. Every record contains exactly these keys (strict; no `power_level` or extras):
```yaml
- source: string        # Path relative to canonical commands root (e.g., core/advise.md)
  name: string          # Target-native command name (e.g., /evcrate:advise or /evcrate-cmd-advise)
  path: string          # Path relative to target commands root
  description: string   # Non-empty description
  argument_hint: string # Argument hint string (empty string if none)
  category: string      # One of: core, bootstrap, code, content, cook, design, docs, fix, git, integrate, plan, review, scout, skill, test
```

#### `skills_data.yaml`
List of skill records. Every record contains exactly these keys (strict):
```yaml
- source: string        # Path relative to canonical skills root (e.g., ai-multimodal/SKILL.md)
  name: string          # Target-native skill name (e.g., ai-multimodal)
  path: string          # Path relative to target skills root
  description: string   # Non-empty description
  category: string      # One of: ai-ml, frontend, backend, infrastructure, database, dev-tools, multimedia, frameworks, utilities, other
  has_scripts: boolean  # True if skill directory contains a scripts/ subdirectory
  has_references: boolean  # True if skill directory contains a references/ subdirectory
```

### Target Projections Matrix

| Target | Script Root | Command Format | Authority / Mapping |
|---|---|---|---|
| Claude | `.evcrate/source/.claude/scripts` | Markdown | `commands_data.yaml` |
| Gemini | `.evcrate/source/.gemini/scripts` | TOML | `gemini-command-map.json` |
| Pi | `.evcrate/source/.pi/agent/evcrate/scripts` | archived Markdown | `commands_data.yaml` |
| OMP | `.evcrate/source/.omp/evcrate/scripts` | flattened mapped Markdown | `command-name-map.json` |
| Codex | `.evcrate/source/.codex/scripts` | command-skill | `commands_data.yaml` |
| Antigravity | `.evcrate/source/.antigravity/scripts` | command-skill | `commands_data.yaml` |
| Copilot | `.evcrate/source/.copilot/evcrate/scripts` | prefixed command-skill | `copilot-command-map.json` |

### Invocations

#### 1. Scanner Invocations (from any working directory)
```bash
# Canonical Claude
python3 .evcrate/source/.claude/scripts/scan_commands.py
python3 .evcrate/source/.claude/scripts/scan_skills.py

# Gemini
python3 .evcrate/source/.gemini/scripts/scan_commands.py
python3 .evcrate/source/.gemini/scripts/scan_skills.py

# Pi
python3 .evcrate/source/.pi/agent/evcrate/scripts/scan_commands.py
python3 .evcrate/source/.pi/agent/evcrate/scripts/scan_skills.py

# OMP
python3 .evcrate/source/.omp/evcrate/scripts/scan_commands.py
python3 .evcrate/source/.omp/evcrate/scripts/scan_skills.py

# Codex
python3 .evcrate/source/.codex/scripts/scan_commands.py
python3 .evcrate/source/.codex/scripts/scan_skills.py

# Antigravity
python3 .evcrate/source/.antigravity/scripts/scan_commands.py
python3 .evcrate/source/.antigravity/scripts/scan_skills.py

# Copilot
python3 .evcrate/source/.copilot/evcrate/scripts/scan_commands.py
python3 .evcrate/source/.copilot/evcrate/scripts/scan_skills.py
```

#### 2. Generator Invocations
```bash
# Generate skills catalog to stdout
python3 .evcrate/source/.claude/scripts/generate_catalogs.py --skills

# Generate commands catalog to stdout
python3 .evcrate/source/.claude/scripts/generate_catalogs.py --commands

# Generate both catalogs to stdout
python3 .evcrate/source/.claude/scripts/generate_catalogs.py

# Write to file
python3 .evcrate/source/.claude/scripts/generate_catalogs.py --commands --output /tmp/commands.yaml
python3 .evcrate/source/.claude/scripts/generate_catalogs.py --skills --output /tmp/skills.yaml

# Verify freshness of committed data files against live scans
python3 .evcrate/source/.claude/scripts/generate_catalogs.py --freshness
```

### Regeneration and release gates

`commands_data.yaml`, `skills_data.yaml`, `scanner-layout.json`, projected target
resources, and the nine schema-2 build manifests (aggregate plus eight targets)
are generated outputs. Change canonical resources or adapter mappings, then run
`npm run distribute:build`; never hand-edit a projection, catalog, sidecar, or
manifest. The adapter projection must read target-native metadata so a scanner
run is byte-stable with the generated catalog.

Run the release sequence in this order:

```bash
# Canonical parser/help gates
python3 .evcrate/source/.claude/scripts/test-scan-catalogs.py
python3 .evcrate/source/.claude/scripts/test-evcrate-help.py

# TypeScript build and adapter/parity/manifest gates
npm run build
node --test tests/adapters/contracts.test.mjs tests/adapters/python-parity.test.mjs
node --test tests/manifests/distribution-manifests.test.mjs \
  tests/distribution/publication-parity.test.mjs

# Regenerate all target projections and manifests
npm run distribute:build

# From an unrelated temporary CWD, run both scanners and both generator modes
# for every target script root listed above. Compare data bytes, native names
# and paths, authority maps/inventories, and managed regular files before/after.
python3 "$SCRIPT_ROOT/scan_commands.py"
python3 "$SCRIPT_ROOT/scan_skills.py"
python3 "$SCRIPT_ROOT/generate_catalogs.py" --commands --output "$TMP/commands.yaml"
python3 "$SCRIPT_ROOT/generate_catalogs.py" --skills --output "$TMP/skills.yaml"

# Final manifest/resource closure gate
npm run distribute:check
```

The foreign-CWD smoke must prove unrelated user resources are excluded and
scanner execution does not dirty generated catalogs or manifest hashes. A
failed parse, unsafe authority entry, missing managed resource, stale catalog,
or failed write leaves the prior adjacent data file unchanged. These gates
cover catalog/projection integrity only; `ev-help.py` remains independent, and
live vendor qualification, Windows validation, npm publication, rollout, and
deployment remain separate operator/release gates.

## VS Code Local Runtime Scripts & Session Context

The VS Code Local projection (`vscode`) includes dedicated runtime support scripts projected into `.evcrate-vscode/evcrate/scripts/`:

- `vscode-session-context.cjs`: Runtime closure providing explicit root resolution, session state access, and bounded lifecycle management.
- `set-active-plan.cjs`: CLI helper to inspect or set the active plan path for a specific project/session.

### Session Lifecycle and State Contracts

1. **Explicit Root Resolution**: Resolves the installed plugin root independently of the active workspace. Does not fall back to plugin `process.cwd()` or an arbitrary first root.
2. **Stateless Fallback**: When session context is absent or expired, operations fall back to stateless behavior without throwing unhandled exceptions.
3. **Atomic CAS State**: Session state uses versioned CAS (Compare-And-Swap) updates, preventing concurrent write collisions.
4. **Bounded Retention & Capacity**:
   - TTL: 7 days.
   - Max sessions per project: 256.
   - Max sessions per user across projects: 1024.
5. **Session Management Utilities**:
   - `inspect`: Read current active session plan, turns, and timestamps.
   - `forget`: Remove a specific session.
   - `sweep`: Clean up expired sessions past the 7-day TTL.
