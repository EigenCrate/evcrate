# Claude to Gemini CLI Bridge

This tool allows you to use your existing Claude skills, agents, and commands in Gemini CLI by bridging them into the `.agents/skills` or `.gemini/skills` directories.

## How it works
1. **Skills:** Links existing skill directories from `.claude/skills` directly.
2. **Agents/Commands:** Converts single `.md` files (like `planner.md`) into a directory structure Gemini expects (`planner/SKILL.md`).
3. **Symlinks:** Uses symbolic links so that edits in your `.claude` folder are instantly reflected in Gemini CLI.

## Usage

### 1. Default (Current Project)
Run this inside your project to bridge `.claude` to `.agents/skills`:
```bash
python3 bridge/bridge-skills.py
```

### 2. Custom Paths
Bridge a global library to a specific project:
```bash
python3 bridge/bridge-skills.py -s ~/my-claude-lib -t ~/projects/my-app/.agents/skills
```

### 3. Gemini-Specific Folder
```bash
python3 bridge/bridge-skills.py -s .claude -t .gemini/skills
```

## Flags
- `-s, --source`: The folder containing `skills/`, `agents/`, and `commands/` (Default: `.claude`)
- `-t, --target`: The output directory for Gemini CLI (Default: `.agents/skills`)
- `--dry-run`: Preview changes without creating links.
