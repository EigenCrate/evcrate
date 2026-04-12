# Word Study Workflow

## Step 1: Gather Input

Ask user for:
- Word(s) to study
- Topic(s)/domain(s) — auto-generate 5-6 angles if omitted (e.g., for "resilience": psychology, leadership, neuroscience, ecology, sports, business)
- Target language (default: English)
- Filter mode: `auto` or `semi-auto`

## Step 2: Notebook Setup

```bash
notebooklm list --json   # show existing notebooks
```

Ask user: create new or reuse existing? Then:

```bash
# New:
notebooklm create "Word Study: {word} - {date}"
notebooklm use <new_id>

# Existing:
notebooklm use <existing_id>
```

## Step 3: Research Loop (per word+topic)

For each `(word, topic)` combination, run 5-6 rounds with varied query angles:

**Query angle examples for "resilience / psychology":**
1. `"resilience psychology definition research"`
2. `"resilience mental health studies"`
3. `"resilience coping stress academic papers"`
4. `"resilience psychology examples case studies"`
5. `"resilience personality traits psychology"`

**Per round:**

```bash
# Run research (blocking)
notebooklm source add-research "{query}" --mode fast
# Returns list of sources with title + url
```

**Filter step:**

- **Auto mode**: Score each source — keep if title/URL contains word or topic keywords; remove if clearly off-topic (news aggregators, generic sites, ads)
- **Semi-auto mode**: Present ranked list via AskUserQuestion, user picks keep/remove

```bash
# Import accepted sources
notebooklm source add-research "{query}" --import-all

# Or remove unwanted sources after import
notebooklm source delete <id> -y
```

**Rate limiting**: Wait 5s between rounds to avoid throttling.

**Stop early** if source count reaches 20+ quality sources (`notebooklm source list --json` → check `count`).

## Step 4: Output Extraction

After all research rounds:

```bash
# Extract usage examples
notebooklm ask "Find all sentences containing '{word}' in the sources. For each, give the exact sentence and the source title." --json

# Extract definition
notebooklm ask "Based on the sources, define '{word}' and note any related forms or collocations." --json
```

Parse JSON responses → format into markdown (see [output-format.md](./output-format.md)).

## Step 5: Save Output

Write markdown to `./word-study-{date}.md` (or user-specified path). Append sections for each word+topic.

## Source Quality Scoring (Auto Mode)

**Keep** if title/URL contains:
- The word itself
- Topic keywords
- Known quality domains: `.edu`, `.gov`, academic journals, reputable newspapers

**Remove** if:
- Title is generic ("10 tips", "click here", etc.)
- URL is ad-heavy aggregator
- Clearly unrelated topic
