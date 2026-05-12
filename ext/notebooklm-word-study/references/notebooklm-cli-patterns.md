# NotebookLM CLI Patterns

Reference: [notebooklm-py](https://github.com/teng-lin/notebooklm-py)

## Session & Auth

```bash
notebooklm login                    # browser-based Google login
notebooklm auth check               # validate local auth
notebooklm auth check --test        # + network validation
notebooklm status                   # show active notebook/conversation
notebooklm status --json
notebooklm clear                    # clear active notebook context
```

## Notebook Management

```bash
notebooklm list --json              # list all notebooks
notebooklm create "Word Study"      # create notebook, returns id
notebooklm use <id>                 # set active notebook (supports partial id)
notebooklm rename "New Title"       # rename active notebook
notebooklm delete -n <id> -y        # delete notebook (skip confirm)
notebooklm summary                  # AI summary of active notebook
```

## Research

```bash
# Start research (blocking, waits for completion)
notebooklm source add-research "<query>"
notebooklm source add-research "<query>" --mode deep        # thorough search
notebooklm source add-research "<query>" --import-all       # auto-import all results

# Start async then import
notebooklm source add-research "<query>" --mode deep --no-wait
notebooklm research status --json                           # check progress
notebooklm research wait --import-all --json                # block until done + import

# JSON output format from research wait --json:
# { "status": "completed", "query": "...", "sources_found": N, "sources": [...], "imported": N }
```

## Source Management

```bash
notebooklm source list --json                    # list all sources (id, title, url, status)
notebooklm source get <id>                       # get source details (partial id ok)
notebooklm source delete <id> -y                 # delete without confirm
notebooklm source rename <id> "New Title"
notebooklm source guide <id> --json              # AI summary + keywords for source
notebooklm source fulltext <id> -o content.txt   # export full indexed text
notebooklm source wait <id> --json               # wait for source to finish processing
```

## Chat / Extraction

```bash
notebooklm ask "<question>"                     # ask, continues last conversation
notebooklm ask "<question>" --json              # structured output with references
notebooklm ask "<question>" --save-as-note      # save answer as note
notebooklm configure --mode learning-guide      # set chat mode
notebooklm history --json                       # show conversation history
```

## Useful JSON Fields

**source list** item: `id`, `title`, `type`, `url`, `status`, `created_at`

**ask --json** response: `answer`, `references` (list of source ids), `conversation_id`

**research wait --json**: `status`, `sources` (list with `title`, `url`), `imported`
