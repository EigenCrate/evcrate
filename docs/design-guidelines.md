# EVCrate Advisor UI/UX Design Guidelines

**Status:** Living Design System Specification  
**Authority:** `viewer/src/` (embedded Advisor plugin UI)  
**Target Environments:** DamHopper IDE right-dock (180px–260px), floating terminal panel (360px–480px), and expanded viewports (768px–1280px+)  
**Accessibility Level:** WCAG 2.1 AA Compliance  

---

## 1. Visual Foundation & Design Tokens

### 1.1 Color Palette
The Advisor interface uses an intentional dark OLED/slate palette engineered for long technical sessions and maximum contrast in embedded IDE sidebars.

| Token | CSS Variable | Hex Value | Usage / Semantic Role |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `--bg-primary` | `#0f172a` | App container background (Slate 900) |
| **Surface Background** | `--bg-surface` | `#1e293b` | Cards, panels, toolbars, drawers (Slate 800) |
| **Card Background** | `--bg-card` | `#243248` | Nested metric tiles, code blocks, table rows (Slate 750) |
| **Card Hover** | `--bg-card-hover` | `#2d3e58` | Interactive row/tile hover state |
| **Border Primary** | `--border-color` | `#334155` | Dividers, card boundaries, input borders (Slate 700) |
| **Border Subtle** | `--border-subtle` | `#1e293b` | Nested list item dividers |
| **Text Primary** | `--text-primary` | `#f8fafc` | Headings, active values, high-contrast labels (Slate 50) |
| **Text Secondary** | `--text-secondary`| `#94a3b8` | Metric subtitles, secondary labels, metadata (Slate 400) |
| **Text Muted** | `--text-muted` | `#64748b` | Footnotes, captions, disabled cues (Slate 500) |
| **Accent Primary** | `--accent-primary` | `#38bdf8` | Active tabs, focus rings, primary action buttons (Sky 400) |
| **Accent Hover** | `--accent-hover` | `#0284c7` | Primary action button hover (Sky 600) |
| **Status Success** | `--color-success` | `#22c55e` | Resolved outcomes, fresh scans, high rates (Green 500) |
| **Status Warning** | `--color-warning` | `#eab308` | Stale data, unresolved outcomes, warnings (Yellow 500) |
| **Status Danger** | `--color-danger` | `#ef4444` | Errors, failed executions, regressions (Red 500) |
| **Status Info** | `--color-info` | `#3b82f6` | Informational badges, neutral state indicators (Blue 500) |

### 1.2 Typography & Scale
Typography prioritizes crisp technical legibility in dense viewports. System fonts avoid network latency, with full Latin and Vietnamese diacritical character support (`ă, â, đ, ê, ô, ơ, ư`). Tabular figures are enforced for numerical metrics.

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "Cascadia Code", "Fira Code", Menlo, Monaco, Consolas, monospace;
```

| Level | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Title 1** | 18px / 1.125rem | 700 (Bold) | 1.25 | App title, primary modal/drawer title |
| **Title 2** | 15px / 0.9375rem| 600 (Semibold)| 1.3 | View section headers, drawer section labels |
| **Body / Default** | 13px / 0.8125rem| 400 (Regular) | 1.5 | Standard text, table rows, descriptions |
| **Body Strong** | 13px / 0.8125rem| 500 / 600 | 1.4 | Key labels, card headings, active tabs |
| **Caption / Meta** | 11px / 0.6875rem| 500 (Medium) | 1.35 | Badges, timestamps, stat labels, helper text |
| **Metric Value** | 24px–28px | 700 (Bold) | 1.1 | Key rate ratios (`font-feature-settings: "tnum"`) |
| **Code / Digest** | 11px–12px | 400 (Regular) | 1.4 | Checkpoint digests, IDs, route models (`var(--font-mono)`) |

### 1.3 Spacing Grid
Built on a 4px modular scale:
- `xxs`: 2px | `xs`: 4px | `sm`: 8px | `md`: 12px | `lg`: 16px | `xl`: 20px | `2xl`: 24px.
- Internal component padding never drops below 6px to preserve touch/pointer ergonomics.

---

## 2. Compact Panel Principles

### 2.1 Composition Over Reduction
- **Never drop data fields or metrics** to achieve a compact layout.
- Compactness is achieved by **composition**: vertical stacking, fluid wrapping, high-density key-value pairs (`<dl>` grids), and progressive disclosure (e.g. Inspect detail drawer).
- Text sizes must NEVER shrink below readable thresholds (minimum 11px for metadata, 13px for interactive/body text).

### 2.2 Strict Zero-Horizontal-Overflow Guarantee
Docked sidebars can be resized from **180px** up to full desktop width. Page-level horizontal scrollbars are strictly forbidden.
- Always apply `min-width: 0` on flex children and grid cells to allow text truncation or wrapping.
- All identifiers, digests, and route paths must specify `word-break: break-all` or `overflow-wrap: anywhere`.
- Avoid fixed-width elements (e.g., table cells with rigid min-widths) without fallback card layouts at narrow widths.

### 2.3 Container Breakpoints
Layout changes adapt cleanly across dock dimensions:
- **Extra Compact (< 260px):** Single-column stacked metric cards, card-based history entries (replacing wide table), stacked button groups, compact source headers.
- **Compact (260px – 480px):** Single-to-two-column metric cards, card-based history entries, side-by-side or wrapped filter selectors, full-width detail drawer.
- **Medium (480px – 768px):** Two-column metric cards, responsive history table with horizontal scroll wrapper or cards, split-pane history drawer when height permits.
- **Expanded (>= 768px):** Multi-column metric grid (3 columns), standard history data table, side-by-side drawer layout (table + 380px drawer).

---

## 3. Accessible Component Specifications

### 3.1 Four-View Accessible Tabs (`HashTabs`)
Complies strictly with WAI-ARIA 1.2 Tabs Design Pattern.

- **Structure:**
  - `<nav className="hash-tabs-nav" aria-label="Explorer views">`
  - Container element with `role="tablist"` and `aria-label="Explorer views"`.
  - Individual tab interactive elements with `role="tab"`, `id="tab-{view}"`, `aria-selected="true|false"`, `aria-controls="panel-{view}"`.
- **Roving `tabIndex`:**
  - Active tab receives `tabIndex={0}`.
  - Inactive tabs receive `tabIndex={-1}`.
- **Keyboard Navigation:**
  - `ArrowRight` / `ArrowDown`: Moves focus and activates the next tab (wraps from last to first).
  - `ArrowLeft` / `ArrowUp`: Moves focus and activates the previous tab (wraps from first to last).
  - `Home`: Moves focus and activates the first tab (`overview`).
  - `End`: Moves focus and activates the last tab (`evaluations`).
  - Active tab element is automatically scrolled into view (`scrollIntoView({ block: 'nearest', inline: 'nearest' })`) within the scrollable tab row.
- **Escape Key Invariant:**
  - Tabs MUST NOT capture, preventDefault, or stop propagation of `Escape`. `Escape` must bubble up to the host environment for panel dismissal or close handlers.
- **Overflow Handling:**
  - Tablist allows horizontal scrolling with hidden or subtle scrollbars on viewports down to 180px without clipping keyboard focus indicators.

### 3.2 Activity Scope Control (`ActivityScopeControl`)
Segmented selection control representing the current activity scope:
- **Buttons:** "Workspace Project" and "All History".
- **Semantic Grouping:** `role="group"` with `aria-label="History activity scope"`, buttons have `aria-pressed="true|false"`.
- **Honest Disabled States & Notices:**
  - When no project is selected in the workspace host: "Workspace Project" and "All History" explain: *"Please select a project in Workspace to inspect advisor consultations."*
  - When history authority is restricted (e.g. non-root): "All History" button is disabled with tooltip/notice: *"All History requires root history authority"*.
  - When provider is disconnected/unavailable: clear explanation provided.
- **Responsive Layout:**
  - At widths < 260px, buttons stack vertically or wrap cleanly without text clipping.

### 3.3 Data Controls Header (`DataControls`)
- Compact layout containing `Refresh History` primary action and `Cancel` button (when scan is active).
- Source label displays provenance (e.g., `workspace:proj-1234`) with full wrapping and tooltip for long path/identifier names.
- Touch target minimum 32px height in compact mode (36px default).

### 3.4 Status Banner (`StatusBanner`)
Distinct visual representations for all system states:
- `unsupported`: Error banner explaining bridge requirement.
- `revoked`: Error banner indicating session/authority termination.
- `idle`: Informational banner indicating waiting for workspace connection.
- `selecting`: Informational banner indicating connection in progress.
- `scanning`: Active spinner/progress banner for parsing/validation.
- `fresh`: Success banner displaying scan count, timestamp, and diagnostic count.
- `stale`: Warning banner clearly indicating retained prior snapshot with reason.
- Provenance badge: "Plugin Isolation" tag ensuring users know data never leaves local container.

### 3.5 Overview Metrics View (`OverviewView`)
- **Metric Cards (6 Rates):**
  1. Delivery Rate
  2. Outcome Coverage
  3. Known Outcome Resolution
  4. Resolution Rate
  5. Backup Model Use
  6. Retry Use
- Zero Metric Loss: All 6 metrics, numerator/denominator/percentage, and descriptions must always be present.
- **Receipt Latency Quantiles:** p50, p95, Mean, Min/Max range, Sample count, and Excluded count.
- **Outcome & Missingness Breakdown:** Resolved, Unresolved, Regressed, Unknown/Missing, Invalid records.
- **Methodological Limitations:** Observational caveats code tags and disclaimer footnote.
- Stale Data: Displays clear stale indicator badge and notice when current data is not fresh.
- Empty State: Clean empty state card with guidance when no records are available.

### 3.6 History Records View (`HistoryView`)
- **Dual Representation (Responsive Card / Table):**
  - **Narrow Viewport (< 600px):** Renders individual History Cards. Each card displays:
    - Status badge (`ADVICE_READY`, `FAILED`, `started`).
    - Timestamp (localized short format).
    - Project label or short ID.
    - Route (`route.backend / route.model`).
    - Outcome badge or outcome state.
    - Latency/Elapsed duration.
    - Consultation ID (shortened).
    - Accessible `Inspect` action button.
  - **Wide Viewport (>= 600px):** Renders full structured data table with sticky headers and horizontal scroll safety.
- **Filtering Bar:**
  - Status select (`ADVICE_READY`, `FAILED`, `started`).
  - Outcome select (`resolved`, `unresolved`, `regressed`, `unknown`).
  - Clear Filters button (resets status and outcome filters only, never resetting scope or selected project).
- **Pagination:**
  - Cursor-based paging for server (DamHopper) and index-based for local fallback. Stable ordering preserved.

### 3.7 History Detail Drawer (`HistoryDetail`)
- Can be rendered side-by-side on wide viewports (>= 900px) or stacked/overlay on narrow viewports (< 900px).
- Prominent `&times; Close` or `&larr; Back to list` button at top of drawer.
- Structured `<dl className="detail-dl">` with `min-width: 0` and `word-break: break-all` for all digests, run IDs, prompt identities, and build IDs.
- Sub-sections: Execution Summary, Advisor Route, Outcome, Model Execution Attempts table, Checkpoint Request (Goal + Question), Advisor Response (Recommendation, Rationale, Must Fix items, Cautions, Success Checks), and Sanitized Error block.
- Explicit drawer states: `loading`, `changed`, `missing`, `error`, `ready`.

---

## 4. Accessibility & Interaction Invariants

1. **Keyboard Operability:** All interactive components must be fully navigable via keyboard (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Arrow` keys).
2. **Focus Rings:** Visible focus ring via `:focus-visible` using `var(--accent-primary)` (2px offset, 2px solid).
3. **Screen Readers:** All icon-only or shortened buttons must provide informative `aria-label`s. Dynamic updates use `aria-live="polite"`.
4. **Contrast Ratios:** Text colors against their respective backgrounds must meet or exceed WCAG 2.1 AA 4.5:1 ratio (large text >= 3:1).
5. **Escape Key Handling:** Never prevent default or stop propagation on `Escape` key events at the tab or button level.
