# NotebookLM Word Study

Automates vocabulary research via [notebooklm-py](https://github.com/teng-lin/notebooklm-py) CLI.

## Setup

### 1. Install notebooklm-py

```bash
pip install notebooklm-py

# Or from source
git clone https://github.com/teng-lin/notebooklm-py
cd notebooklm-py
pip install -e .
```

Requires Python 3.10+. For browser-based login:

```bash
pip install "notebooklm[browser]"
playwright install chromium
```

### 2. Authenticate

```bash
notebooklm login
# Opens browser → complete Google login → press ENTER
```

Verify auth:

```bash
notebooklm auth check
notebooklm auth check --test   # also validates network access
```

### 3. Register skill

Add to your `.claude/CLAUDE.md` or skills config:

```
skills:
  - path: ext/notebooklm-word-study
```

Or copy the skill directory into `.claude/skills/notebooklm-word-study/`.

## Usage

Once authenticated, ask Claude:

- "Study the word *resilience* using NotebookLM"
- "Research *ephemeral* and *transient* in a psychology context"
- "Build a word list for these vocabulary words: ..."

Claude will:
1. Create/select a notebook
2. Run iterative web research (5-6 rounds per word)
3. Filter sources by quality
4. Extract definitions and example sentences
5. Output a structured markdown word list

## Output Example

```markdown
## resilience — psychology

**Definition**: The capacity to recover quickly from difficulties...

### Examples
1. "Resilience is not a trait that people either have or do not have." — *Source: APA.org*
2. "Building resilience involves behaviors, thoughts and actions..." — *Source: Harvard Health*
```

## Troubleshooting

| Issue | Fix |
|---|---|
| `notebooklm: command not found` | Ensure pip install succeeded and PATH includes pip bin |
| Auth expired | Re-run `notebooklm login` |
| Rate limiting | Skill adds 5s delay between research rounds automatically |
| No sources found | Try broader query or `--mode deep` |
