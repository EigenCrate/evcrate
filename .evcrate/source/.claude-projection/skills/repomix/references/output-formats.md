# Output Formats & Advanced Options

## Output Formats

### XML (Default)
```bash
repomix --style xml
```
Structured AI consumption. Features: tags, hierarchy, metadata, AI-optimized separators.
Use for: LLMs, structured analysis, programmatic parsing.

### Markdown
```bash
repomix --style markdown
```
Human-readable with syntax highlighting. Features: syntax highlighting, headers, TOC.
Use for: documentation, code review, sharing.

### JSON
```bash
repomix --style json
```
Programmatic processing. Features: structured data, easy parsing, metadata.
Use for: API integration, custom tooling, data analysis.

### Plain Text
```bash
repomix --style plain
```
Simple concatenation. Features: no formatting, minimal overhead.
Use for: simple analysis, minimal processing.

## Advanced Options

```bash
# Verbose - show processing details
repomix --verbose

# Custom config file
repomix -c /path/to/custom-config.json

# Initialize config
repomix --init

# Disable line numbers - smaller output
repomix --no-line-numbers
```

## Performance

**Worker Threads:** Parallel processing handles large codebases (e.g., facebook/react: 29x faster, 123s → 4s)

**Optimization:**
```bash
# Exclude unnecessary files
repomix -i "node_modules/**,dist/**,*.min.js"

# Specific directories only
repomix --include "src/**/*.ts"

# Remove comments + disable line numbers
repomix --remove-comments --no-line-numbers
```
