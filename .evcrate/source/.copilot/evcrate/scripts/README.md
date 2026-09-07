# GitHub Copilot CLI Scripts

Centralized utility scripts for GitHub Copilot CLI skills.

## Installation

Install required dependencies:

```bash
pip install -r requirements.txt
```

## resolve_env.py

Centralized environment variable resolver that follows GitHub Copilot CLI's hierarchy.

### Priority Order (Highest to Lowest)

1. **process.env** - Runtime environment variables (HIGHEST)
2. **PROJECT/.copilot/skills/\<skill\>/.env** - Project skill-specific
3. **PROJECT/.copilot/skills/.env** - Project shared across skills
4. **PROJECT/.copilot/.env** - Project global defaults
5. **~/.copilot/skills/\<skill\>/.env** - User skill-specific
6. **~/.copilot/skills/.env** - User shared across skills
7. **~/.copilot/.env** - User global defaults (LOWEST)

### CLI Usage

```bash
# Resolve a variable for a specific skill
python ~/.copilot/evcrate/scripts/resolve_env.py GEMINI_API_KEY --skill ai-multimodal

# With verbose output
python ~/.copilot/evcrate/scripts/resolve_env.py GEMINI_API_KEY --skill ai-multimodal --verbose

# Find all locations where variable is defined
python ~/.copilot/evcrate/scripts/resolve_env.py GEMINI_API_KEY --find-all

# Show hierarchy for a skill
python ~/.copilot/evcrate/scripts/resolve_env.py --show-hierarchy --skill ai-multimodal

# Export format for shell sourcing
eval $(python ~/.copilot/evcrate/scripts/resolve_env.py GEMINI_API_KEY --export)
```

### Python API Usage

```python
# Add to sys.path if needed
import sys
from pathlib import Path
sys.path.insert(0, str(Path.home() / '.copilot' / 'scripts'))

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
sys.path.insert(0, str(Path.home() / '.copilot' / 'scripts'))
from resolve_env import resolve_env

# Resolve API key
api_key = resolve_env('GEMINI_API_KEY', skill='ai-multimodal')

if not api_key:
    print("Error: GEMINI_API_KEY not found")
    print("Run: python ~/.copilot/evcrate/scripts/resolve_env.py --show-hierarchy --skill ai-multimodal")
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
python ~/.copilot/evcrate/scripts/resolve_env.py TEST_VAR --verbose

# Test with environment variable
export TEST_VAR=from-runtime
python ~/.copilot/evcrate/scripts/resolve_env.py TEST_VAR --verbose

# Test with skill context
python ~/.copilot/evcrate/scripts/resolve_env.py GEMINI_API_KEY --skill ai-multimodal --find-all
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
     ( cd /tmp && python3 /path/to/.copilot/evcrate/scripts/scan_commands.py )
     ```
   - Target scanners refresh their adjacent target-native data from adapter-managed resources only.

2. **Atomic & Fail-Closed Behavior**:
   - Frontmatter and TOML parsing fail closed: missing required fields (`description`, `name` for command-skills), bad types, or malformed syntax immediately raise `ScanError` and exit non-zero.
   - Output writing uses `atomic_write_yaml`: writes first to a temporary file in the destination directory, flushes and syncs, then atomically renames (`os.replace`) over the target path.
   - Pre-existing files (sentinels) are untouched if scanning or validation fails.

3. **Source Normalization**:
   - Frontmatter strings and descriptions have surrounding whitespace trimmed.
   - Missing optional fields (e.g. `argument-hint`) normalize to empty strings.

4. **Managed-Only Scanning**:
   - Target scanners discover resources using `scanner-layout.json` configuration (`format`, `root`, `output`, `authority`).
   - Scanners scan only EVCrate-managed resources bound by adapter maps and inventories. Unrelated user commands or skills sharing a target root are ignored.
   - Template skills (`evcrate-template-skill`) are excluded.

5. **Tool Independence & Non-Integration**:
   - Scanners and catalog generators are decoupled from `ev-help.py`.
   - There is no `ev-help.py` integration, no shared generated-data runtime dependency, no search flags, and no general-skill or query UI.

### Data Schemas

#### `commands_data.yaml`
List of command records. Every record contains exactly these keys (strict; no `power_level` or extras):
```yaml
- source: string        # Path relative to canonical commands root (e.g., core/advise.md)
  name: string          # Target-native command name (e.g., /evcrate-cmd-advise or /evcrate-cmd-advise)
  path: string          # Path relative to target commands root
  description: string   # Non-empty description
  argument_hint: string # Argument hint string (empty string if none)
  category: string      # One of: core, development, documentation, quality, git, meta, review, system, tasks, testing, utilities
```

#### `skills_data.yaml`
List of skill records. Every record contains exactly these keys (strict):
```yaml
- source: string        # Path relative to canonical skills root (e.g., ai-multimodal/SKILL.md)
  name: string          # Target-native skill name (e.g., ai-multimodal)
  path: string          # Path relative to target skills root
  description: string   # Non-empty description
  category: string      # One of: design, utilities, development, audio, git, communication, review, documents
  has_scripts: boolean  # True if skill directory contains a scripts/ subdirectory
  has_references: bool  # True if skill directory contains a references/ subdirectory
```

### Target Projections Matrix

| Target | Script Root | Command Format | Authority / Mapping |
|---|---|---|---|
| Copilot | `.evcrate/source/.copilot/evcrate/scripts` | Markdown | `commands_data.yaml` |
| Gemini | `.evcrate/source/.gemini/scripts` | TOML | `gemini-command-map.json` |
| Pi | `.evcrate/source/.pi/agent/evcrate/scripts` | archived Markdown | `commands_data.yaml` |
| OMP | `.evcrate/source/.omp/evcrate/scripts` | flattened mapped Markdown | `command-name-map.json` |
| Codex | `.evcrate/source/.codex/scripts` | command-skill | `commands_data.yaml` |
| Antigravity | `.evcrate/source/.antigravity/scripts` | command-skill | `commands_data.yaml` |
| Copilot | `.evcrate/source/.copilot/evcrate/scripts` | prefixed command-skill | `copilot-command-map.json` |

### Invocations

#### 1. Scanner Invocations (from any working directory)
```bash
# Canonical Copilot
python3 .evcrate/source/.copilot/evcrate/scripts/scan_commands.py
python3 .evcrate/source/.copilot/evcrate/scripts/scan_skills.py

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
python3 .evcrate/source/.copilot/evcrate/scripts/generate_catalogs.py --skills

# Generate commands catalog to stdout
python3 .evcrate/source/.copilot/evcrate/scripts/generate_catalogs.py --commands

# Generate both catalogs to stdout
python3 .evcrate/source/.copilot/evcrate/scripts/generate_catalogs.py

# Write to file
python3 .evcrate/source/.copilot/evcrate/scripts/generate_catalogs.py --commands --output /tmp/commands.yaml
python3 .evcrate/source/.copilot/evcrate/scripts/generate_catalogs.py --skills --output /tmp/skills.yaml

# Verify freshness of committed data files against live scans
python3 .evcrate/source/.copilot/evcrate/scripts/generate_catalogs.py --freshness
```
