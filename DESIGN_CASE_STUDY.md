# Your Canvas, Your Machine: Designing nodepad

*A local-first spatial research tool where AI augments your thinking — not replaces it.*

---

## Overview

nodepad is a spatial research environment for building up ideas. You add notes, the AI annotates and connects them, and the canvas becomes a map of your thinking in real time. There are no prompts to write, no chat to scroll through, no account to log into. Your research lives entirely on your machine.

This document covers the design decisions behind the product — the philosophy, the systems, the visual language, and the tradeoffs made along the way.

---

## Design Philosophy

### Thinking first, prompting second

Most AI tools are built around a question-and-answer loop. You ask, it responds. The interaction is linear and the AI occupies the centre.

nodepad inverts that relationship. The user adds raw material — fragments, links, quotes, half-formed questions — and the AI works quietly on that material in the background. There is no chat interface. There is no input addressed to the AI. The AI reads what you add and responds with structure, not conversation.

The premise is that thinking doesn't start with a well-formed question. It starts with things you already know, things you've read, hunches you can't yet justify. The tool should accommodate that messiness and help it cohere over time — not demand a prompt before it will engage.

### Spatial over sequential

Notes in a list lose their relationships. The tenth item doesn't visually relate to the third even if they belong to the same argument. Spatial arrangement is an active choice: you can see the whole canvas, reorganise by proximity, and let the layout itself carry meaning.

nodepad offers three views of the same data: a spatial mosaic (tiling), a type-grouped board (kanban), and a relationship graph. Each reveals something different about the same research. Switching between them costs nothing.

### Restraint as a feature

The interface is deliberately minimal. There is one input bar. There are no toolbars, no formatting options, no nested menus. The less you can configure, the faster you can think. Decisions about visual treatment are made by the system, not the user — which means a tile looks like a claim tile everywhere, consistently, without effort.

---

## Local-First Architecture

nodepad stores everything in the browser's `localStorage`. There is no account system, no database, no server that receives your notes. When you add a note, it writes to your machine. When you close the tab, it persists. When you reopen the app weeks later, it's exactly where you left it.

`screenshot-local-first-diagram.png`
*Diagram: data flow showing notes written to localStorage, API calls going only to OpenRouter (AI), no server storage.*

### What "local-first" means in practice

- **No signup.** The app opens immediately. There is nothing to authenticate against.
- **No sync.** Notes do not leave the machine unless you export them. The AI enrichment API call receives your note text and returns annotations — nothing is stored server-side.
- **Offline-capable (partial).** The canvas, navigation, and all editing work without a connection. AI enrichment requires network access, but the core research workflow does not.
- **Your API key, your usage.** The only credential the app holds is the user's own OpenRouter key, stored in localStorage under `nodepad-ai-settings`. It is forwarded to the AI route via a request header and never logged.

### Persistence model

Three localStorage keys handle primary data:

| Key | Purpose |
|---|---|
| `nodepad-projects` | All projects and blocks — the primary source of truth |
| `nodepad-backup` | Silent rolling backup written on every state change |
| `nodepad-active-project` | Which project is currently open |

If the primary key is ever missing on load — corrupted, cleared, or missing after a browser update — the backup is automatically restored. The user never sees this happen.

### The .nodepad file format

`screenshot-export-nodepad-file.png`
*The export menu showing both .nodepad and .md export options.*

nodepad has its own portable file format: a versioned JSON file that preserves everything — blocks, annotations, connections, synthesis history, categories, confidence scores. You can download it, share it, and reimport it into any instance of the app. This is the handoff format for teams, or the archive format for long-running research.

The format strips transient UI state (loading indicators, error flags) and assigns a fresh project ID on import to prevent collisions. Names are deduplicated automatically: importing a project called "Research" into a space that already has one produces "Research (2)".

---

## The Input Model

`screenshot-input-bar.png`
*The input bar at the bottom of the canvas with a note being typed.*

The entire interface has one input: a text field fixed at the bottom of the viewport. You type a note and press Enter. That's it.

There is no "new note" button. No type selector before you submit. No title field. The note goes in as text and the system figures out what it is.

### The #type shorthand

If you already know what type a note is, you can declare it inline: `#claim Caffeine improves short-term recall by ~15%`. The prefix is stripped and the block is created with that type locked. Any of the 14 type names work as prefixes.

This is an expert shortcut, not a requirement. Most users never use it.

### The command palette — ⌘K

`screenshot-command-palette.png`
*The ⌘K command grid showing Views, Navigate, and Actions sections.*

Pressing ⌘K opens a full-screen command grid. Commands are grouped into three sections: Views (switch between tiling, kanban, graph), Navigate (jump to panels, open settings), and Actions (export, copy, undo). The palette is keyboard-navigable and closes on Escape or action execution.

This keeps the visual interface clean. There is no action bar, no floating toolbar. Everything that isn't immediately essential lives in the palette.

---

## Content Type System

`screenshot-type-system-overview.png`
*The 14 content types shown as a grid with their accent colours and icons.*

Every note has a content type. There are fourteen: `entity`, `claim`, `question`, `task`, `idea`, `reference`, `quote`, `definition`, `opinion`, `reflection`, `narrative`, `comparison`, `thesis`, and `general`.

Types are not user-assigned categories. They are inferred — first by a heuristic classifier that runs instantly on submit, then confirmed or corrected by the AI enrichment call. The heuristic covers obvious cases (a sentence ending in `?` is a question; a URL is a reference; text in quotation marks attributed to someone is a quote) without waiting for the network. The AI handles ambiguous cases and can override the initial guess.

### Color language

Each type has a dedicated accent color defined as an `oklch` value. The oklch color space was chosen deliberately: it allows perceptually uniform brightness across all types, so no single type appears to "shout" louder than another despite having different hues.

`screenshot-type-colors.png`
*Tiling view showing a populated canvas with multiple types visible — accent bars, labels, and tile borders in their respective colors.*

The colors appear in three places on each tile: the thin left accent bar, the type label text, and the colored top border strip. The `thesis` type is the exception — it has a gradient treatment, signaling that synthesis output is structurally different from research input.

### Type detection flow

```
User submits text
      ↓
Heuristic classification runs instantly (no network)
      ↓
Block appears on canvas with provisional type
      ↓
AI enrichment call fires in background
      ↓
Type confirmed or corrected, annotation added
```

This two-step approach means the interface is always responsive. Notes appear immediately; the AI layer settles on top of them within a second or two.

---

## Three Views

### Tiling — ⌘1

`screenshot-tiling-populated.png`
*A fully populated tiling canvas with multiple notes across a BSP grid.*

The default view. Notes are laid out in a BSP (Binary Space Partitioning) tree — a recursive spatial algorithm that splits the canvas alternately horizontally and vertically to fit all tiles. Notes are chunked into pages of seven and each page fills the viewport height. Pages scroll vertically.

The result is a mosaic that adapts to the number of notes without leaving gaps or requiring manual arrangement. Pinned notes float to the front of the BSP tree so they always occupy prominent positions.

Task blocks are separated from the grid and rendered as a persistent strip at the top of the view, since tasks have a different interaction model (subtasks, checkboxes) that doesn't fit the mosaic.

A minimap appears in the bottom-right corner when the canvas has more than one page. It shows a vertical stack of page thumbnails with hover tooltips indicating which note is on each page.

`screenshot-tiling-minimap.png`
*The tiling minimap in the bottom-right, showing three page thumbnails.*

### Kanban — ⌘2

`screenshot-kanban-populated.png`
*The kanban view with columns for each type, showing notes grouped by their classification.*

The kanban view groups all notes by content type into columns. Column priority: task → thesis → everything else. Columns scroll horizontally and each column scrolls independently. The layout reveals type distribution at a glance — if you have no definitions, you'll see that. If you have seven opinions and one claim, you'll see that too.

This view is most useful mid-research, as a diagnostic tool. The structure of the board tells you something about the shape of your thinking before you've consciously assessed it.

Each column header shows its type icon, name, and note count. The column width is 384px — wide enough to read full note text without scrolling horizontally within a card.

### Graph — ⌘3

`screenshot-graph-populated.png`
*The force-directed graph with nodes at varying sizes, connections drawn between related notes.*

The graph view uses a D3 force-directed layout with a centrality-radial arrangement: notes with more connections are drawn toward the center; isolated notes settle at the periphery. This means the visual structure of the graph reflects the actual structure of the research — hub concepts appear at the center without any manual arrangement.

Only real AI-inferred connections are drawn as edges. There are no artificial spokes. If a note has no detected relationships, it floats alone at the edge.

Clicking any node opens a detail panel that slides in from the right, showing the full note text, annotation, connected notes, confidence score, and sources. Everything editable in the tiles is editable here.

`screenshot-graph-detail-panel.png`
*The graph with a node selected and the detail panel open on the right.*

The synthesis note, when present, connects to all nodes and naturally gravitates to the center.

---

## The Tile Card

`screenshot-tile-card-anatomy.png`
*A single tile card with callouts to each UI region: accent bar, type label, connection dot, body text, annotation, confidence bar, sources, subtask list.*

The tile card is the core unit of the interface. Its anatomy:

**Header row** — type label (small caps, accent color), category badge (AI-assigned topic cluster), connection dot (appears only when the note has inferred relationships), pin indicator, delete button.

**Body** — the note text. Double-click to edit in place. Arabic and Hebrew text is detected automatically and the font and direction switch accordingly (RTL layout, Vazirmatn typeface).

**Annotation** — two to four sentences generated by the AI. Appears in a slightly muted style below the body. Editable inline with a single click on the annotation area.

**Confidence bar** — shown only on `claim` type notes. A horizontal progress bar from 0–100% with a percentage label. Colored using the claim accent.

**Sources** — shown when web grounding is active and the AI returned citations. Rendered as a list of linked site names with favicons.

**Subtask list** — shown on `task` type notes. Checkbox items with individual delete controls. New subtasks can be added inline.

---

## AI Enrichment

`screenshot-enriching-state.png`
*A tile in the enriching state — shimmer animation on the type label, muted opacity on the body.*

After each note is added or edited, an enrichment request fires to `/api/enrich` via OpenRouter. The request includes the note text, the last 15 notes as context (wrapped in XML delimiters to prevent prompt injection), and optionally a URL fetch result if the note is a reference type.

### Enriching state

While the AI call is in flight, the tile enters an enriching state: the type label shows a shimmer animation, the tile has slightly reduced opacity. This is subtle by design — enrichment happens in the background and shouldn't interrupt reading or adding new notes.

### What the AI returns

- **contentType** — confirmed or corrected type
- **category** — a short topic label for grouping (e.g., "Memory Science", "Workplace Policy")
- **annotation** — 2–4 sentences expanding on the note
- **confidence** — 0–100 for claim-type notes only
- **influencedByIndices** — indices of related notes in the context window
- **isUnrelated** — whether the note belongs to a different research thread
- **mergeWithIndex** — whether the new note should merge into an existing one

### Web grounding

When enabled, the model appended with `:online` will pull live sources when annotating truth-dependent types (claims, questions, references). Sources are returned as structured citations and rendered as linked site names on the tile.

For reference-type notes that are URLs, the server fetches the page before calling the AI (6-second timeout). The AI receives the actual page title, description, and body excerpt — not a guess from the URL string.

### Language isolation

The enrichment system supports multilingual input. Unicode range detection identifies Arabic, Hebrew, CJK, Cyrillic, and Devanagari scripts. For Latin script, an English stopword frequency threshold distinguishes English from other Latin languages. A language directive is injected into the AI prompt immediately before the note text so the model responds in the note's language regardless of what language the surrounding context notes are in.

---

## The Connection System

`screenshot-connection-dimming.png`
*A tiling canvas with one note's connection dot hovered — unrelated notes are dimmed to near-invisible.*

When the AI determines that notes are related, it returns indices of connected notes in the enrichment response. These connections are stored in each block's `influencedBy` field. A small dot indicator appears in the tile header when a note has at least one connection.

Hovering the dot dims all unrelated tiles (opacity 15%, desaturated). Only the hovered note and its connected notes remain fully visible. This is a reading mode, not an edit mode — it lets you trace a thread of connected ideas through the canvas without rearranging anything.

In tiling view, a connection can be locked (click the dot to pin the dimming state) and released with Escape, a background canvas click, or automatically if the locked note loses its connections after a re-enrichment.

The same connection dimming logic works identically in kanban and graph views. In graph view, selected nodes also lock their connection state.

---

## Synthesis — The Ghost Panel

`screenshot-ghost-panel.png`
*The synthesis panel open on the right, showing a ghost note with Solidify and Dismiss actions.*

After enough notes accumulate (≥3 notes, with ≥3 new since the last synthesis, and ≥2 minutes elapsed), the app generates a ghost note — a 15–25 word emergent thesis that attempts to name what the collection of notes implies but doesn't say directly. It is not a summary. It is a provocation.

The synthesis panel opens from the sparkle icon in the status bar. It shows the current ghost note, a generation indicator when one is being written, and a history of previous synthesis notes (capped at five).

Two actions: **Solidify** converts the ghost note into a `thesis` tile on the canvas, connected to all existing blocks. **Dismiss** discards it. Another will appear when there's new material.

Previous synthesis texts are tracked (last 10) and passed to the model as a near-duplicate avoidance list — so synthesis doesn't loop on the same insight.

---

## Status Bar

`screenshot-status-bar.png`
*The full status bar: menu button, logo, project name, node count, type distribution, model label, clock, synthesis toggle, index toggle, about button.*

The status bar at the top of the viewport carries the app's ambient information layer:

- **Left**: menu button (opens sidebar), three-square logo, current project name, node count, enriching indicator (pulsing dot when AI calls are in flight), error count
- **Centre**: type distribution — top three types as colored labels with counts
- **Right**: model label (shown only when an API key is configured), live clock, synthesis panel toggle with badge, index panel toggle, about button

Nothing in the status bar requires interaction for the core workflow. It is ambient information that becomes useful once the canvas is populated.

---

## Sidebar — Settings and Projects

`screenshot-sidebar-settings.png`
*The sidebar open showing the project list and AI settings section below.*

The left sidebar holds two things: the project list and the AI settings panel. Projects can be renamed, deleted, and switched between. The settings panel contains the API key input, model selector, and web grounding toggle.

Available models: Claude Sonnet 4.5, GPT-4o (default), Gemini 2.5 Pro, DeepSeek V3, Mistral Small 3.2. The model selection persists in localStorage with the API key.

The `.nodepad` file import button lives at the bottom of the sidebar. Dragging in a file or selecting one via the button imports it as a new project.

---

## Index Panel — ⌘I

`screenshot-index-panel.png`
*The index panel open on the right, showing notes grouped by category with hover highlighting active.*

The index panel groups all notes by their AI-assigned category. In tiling and graph views, grouping is by category. In kanban view, grouping is by type.

Hovering a note in the index highlights the corresponding tile on the canvas (and the corresponding node in graph view). This is a navigation tool, not just a list — it lets you jump to any note without scrolling or searching.

---

## Export System

`screenshot-export-markdown.png`
*A portion of a generated markdown export showing YAML front matter, the type distribution table, and annotated notes.*

Two export formats:

**Markdown** — a structured document with YAML front matter (project name, date, stats), a type distribution table, a table of contents with anchor links, and all notes grouped by type. Claims appear as confidence tables. Tasks render as GFM task lists. Quotes render as blockquotes. Annotations render as quoted callouts. Sources are listed per note. The synthesis thesis appears at the top if one has been solidified.

**`.nodepad`** — the full project state as versioned JSON, including all annotations, connections, synthesis history, and categories. Importable into any nodepad instance.

Both formats are triggered from the ⌘K command palette: `export-md` downloads the markdown file, `copy-md` copies it to clipboard.

---

## RTL Language Support

`screenshot-rtl-arabic.png`
*A tile containing Arabic text, showing right-to-left layout, Vazirmatn typeface, and the RTL badge in the tile header.*

Arabic and Hebrew text is detected automatically on input using Unicode character range analysis. When detected, the Vazirmatn typeface is applied (loaded via `next/font/google`), the text direction switches to right-to-left, and an RTL indicator appears in the tile header.

No configuration required. The detection happens per-block, so a canvas can contain mixed-language notes without any manual setup.

---

## Mobile Experience

`screenshot-mobile-wall.png`
*The mobile wall overlay shown on narrow viewports: three-square logo and a directional message.*

nodepad is a desktop application. Spatial layout, the BSP mosaic, force-directed graphs, and the panel system all require a minimum viewport to function. Below the `md` breakpoint (768px), a fixed overlay replaces the canvas:

> *Spatial thinking needs space.*
> nodepad works on a desktop or laptop browser.

This is a deliberate design decision rather than a degraded mobile version. Attempting to reflow a spatial research tool into a narrow viewport would compromise the core interaction model. The message is direct and non-apologetic.

---

## Typography and Color

`screenshot-color-palette.png`
*The design system color palette showing background, surface, border, foreground, and all 14 type accent colors.*

**Typefaces**: Geist (interface, headings) and Geist Mono (labels, type tags, status indicators). Vazirmatn for RTL content. All loaded via `next/font/google`.

**Color space**: oklch throughout. Dark-first design — backgrounds from near-black (`#020202`, `#050505`) to surface (`bg-card`). Type accent colors are defined as `--type-{name}` CSS variables and used consistently across tile accents, kanban column headers, graph node rings, and index labels.

**Thesis gradient**: the thesis type uses `--thesis-gradient` — a multi-stop gradient — to signal that synthesis output is structurally distinct from research input. It is the only tile that uses a gradient treatment.

**Shimmer animation**: enriching tiles use a `shimmer-text` keyframe animation on the type label — a left-to-right lightness sweep. Subtle enough not to distract, visible enough to indicate that something is happening.

---

## Design Decisions Worth Noting

**No collapse in tiling view.** The BSP tree's parent-child structure means freed space only redistributes to immediate siblings. Collapsing a tile creates an orphaned gap rather than redistributing space evenly. Collapse is available in kanban (where columns are independent) but disabled in tiling.

**No formatting in notes.** There is no markdown input, no bold, no headings. Notes are plain text. This is a constraint, not an omission — the annotation and type system provide structure so the user doesn't have to manually apply it. Formatting decisions belong to the export layer, not the capture layer.

**Ghost notes are not summaries.** The synthesis output deliberately doesn't recap what's already on the canvas. The prompt instructs the model to surface what the notes imply but don't say — an emergent insight, not a digest. This distinction is what makes solidified thesis tiles useful as actual research outputs.

**Rate limiting lives in the proxy.** `/api/enrich` is limited to 60 requests/minute; `/api/ghost` to 10/minute. The origin check prevents third-party callers from using someone else's deployed instance as a free proxy to OpenRouter. Both limits are in-memory and sliding-window, which works well on persistent-process hosting and is best-effort on serverless.

---

## Summary

nodepad is built on the premise that thinking happens before prompting — and that the right tool makes space for that without asking anything in return. Local-first means your research stays private by default, not as a setting. Three views mean you can look at the same material through three different lenses without duplicating any work. The AI layer is invisible when you don't need it and legible when you do.

Everything is on your machine. Everything is yours.

---

*nodepad.space — A design experiment by Saleh Kayyali*
