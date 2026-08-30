# Token Management

Repomix automatically counts tokens for individual files, total repository, and per-format output.

## LLM Context Limits

| Model | Token Limit |
|---|---|
| Copilot Sonnet 4.5 | ~200K tokens |
| GPT-4 | ~128K tokens |
| GPT-3.5 | ~16K tokens |

## Token Count Tree

Visualize token distribution across your project:

```bash
repomix --token-count-tree

# Only show files/dirs with 1000+ tokens
repomix --token-count-tree 1000
```

Example output:
```
🔢 Token Count Tree:
────────────────────
└── src/ (70,925 tokens)
    ├── cli/ (12,714 tokens)
    │   ├── actions/ (7,546 tokens)
    │   └── reporters/ (990 tokens)
    └── core/ (41,600 tokens)
        ├── file/ (10,098 tokens)
        └── output/ (5,808 tokens)
```

## Optimization Strategies

- Identify token-heavy files with `--token-count-tree`
- Use `--include` to scope to relevant files only
- Use `--remove-comments` and `--no-line-numbers` to reduce size
- Target the largest contributors first when trimming
