# nogrep — Implementation Guide for Claude Code

## What You Are Building

`nogrep` is a Claude Code plugin that gives AI agents a navigable index of any codebase, so they stop doing blind grep/find exploration.

**The one thing it does:** Generate and maintain a structured `.nogrep/` directory with a reverse index (`_index.json`) and thin context nodes (markdown files), so CC can find the right files in 2 reads instead of 20.

**What it is NOT:** A documentation generator, a code search engine, a standalone CLI, or a replacement for GSD or Compodoc. It is a navigation layer — intentionally minimal, fully scoped to Claude Code.

---

## Before You Start

Read these files in order before writing any code:

1. `docs/SPEC.md` — full technical specification, schemas, pipeline details
2. `docs/ARCHITECTURE.md` — project structure and module boundaries
3. `docs/CONVENTIONS.md` — code style, naming, patterns to follow

---

## Project Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 20+
- **Package manager:** npm
- **Testing:** Vitest
- **Build:** `tsup`
- **Distribution:** CC plugin (npm package)

---

## Repository Structure to Create

```
nogrep/
├── scripts/
│   ├── signals.ts        # Phase 1: universal signal collection
│   ├── query.ts          # index lookup (called by hooks)
│   ├── validate.ts       # staleness check (called by hooks)
│   ├── write.ts          # structured file writer (context nodes, index, registry)
│   ├── settings.ts       # read/write .claude/settings.json
│   ├── trim.ts           # language-agnostic source trimming
│   └── types.ts          # all shared TypeScript types
├── commands/
│   ├── init.md           # orchestrates full init pipeline
│   ├── update.md         # diff-based update of stale nodes
│   ├── query.md          # manual index lookup
│   ├── status.md         # coverage + freshness summary
│   ├── on.md             # enable nogrep
│   └── off.md            # disable nogrep
├── hooks/
│   ├── pre-tool-use.sh   # intercepts grep/find/rg
│   ├── session-start.sh  # checks index freshness on session start
│   └── prompt-submit.sh  # injects context on every user prompt
├── templates/
│   └── claude-md-patch.md  # snippet appended to target project CLAUDE.md
├── tests/
│   ├── fixtures/           # sample mini-projects for testing
│   │   ├── nestjs-project/
│   │   ├── django-project/
│   │   └── react-project/
│   ├── signals.test.ts
│   ├── query.test.ts
│   └── writer.test.ts
├── docs/
│   ├── CLAUDE.md           # this file
│   ├── SPEC.md             # full technical spec
│   ├── ARCHITECTURE.md     # internal architecture doc
│   ├── CONVENTIONS.md      # coding conventions
│   └── TASKS.md            # implementation tasks
├── plugin.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## Implementation Order

Implement in this exact order — each step is testable before moving on:

### Step 1 — Scaffold
- `package.json`, `tsconfig.json`, `tsup.config.ts`
- `scripts/types.ts` — all types first
- `plugin.json` — CC plugin manifest

### Step 2 — Settings
- `scripts/settings.ts` — read/write `.claude/settings.json` and `.claude/settings.local.json`
- `commands/on.md` and `commands/off.md` slash commands

### Step 3 — Phase 1: Signals (no AI)
- `scripts/signals.ts` — universal signal collection
- Test against the fixtures in `tests/fixtures/`

### Step 4 — Source Trimming
- `scripts/trim.ts` — language-agnostic source trimming
- Test against TypeScript, Python, Java snippet fixtures

### Step 5 — Writers
- `scripts/write.ts` — context files, index builder, registry, CLAUDE.md patcher
- `templates/claude-md-patch.md`
- Test: write to temp dirs, verify file contents

### Step 6 — Init Slash Command
- `commands/init.md` — orchestrates the full pipeline
- Embeds Phase 2 + Phase 3 prompts (Claude does the AI work)
- Calls `dist/signals.js` for data, `dist/write.js` for output via `${CLAUDE_PLUGIN_ROOT}`

### Step 7 — Query System
- `scripts/query.ts` — extractor + resolver
- `commands/query.md` slash command

### Step 8 — Validate + Update + Status
- `scripts/validate.ts` — staleness detection
- `commands/update.md` — guided incremental update
- `commands/status.md` — index health summary

### Step 9 — Hooks
- `hooks/pre-tool-use.sh` — intercepts grep/find
- `hooks/session-start.sh` — freshness check
- `hooks/prompt-submit.sh` — context injection

### Step 10 — README + Distribution
- `README.md`
- Verify `npm pack` ships correct files

---

## Key Decisions Already Made

- **No standalone CLI.** Everything runs inside CC via slash commands and hooks.
- **No AI client / SDK.** Claude IS the AI — slash commands contain the analysis prompts, Claude executes them directly.
- **No database.** Everything is files. `.nogrep/` lives in the repo.
- **Scripts are mechanical.** They collect data, write files, query indexes — no AI work.
- **Nodes are intentionally thin** — 3 sentences of purpose, public surface, does-not-own, gotchas. Not comprehensive docs.
- **Manual Notes section** in each node is never overwritten by update.
- **Hooks intercept at tool-call level** — not just CLAUDE.md instructions, so CC cannot bypass.
- **Per-project settings** — `.claude/settings.json` (team, committed) or `.claude/settings.local.json` (personal, gitignored).
- **CI is out of scope for v1** — index maintained via `/nogrep:update` during CC sessions.

---

## Environment Variables

```bash
NOGREP_DEBUG         # optional, set to 1 for verbose script output
```

No `ANTHROPIC_API_KEY` needed — Claude does the AI work directly.

---

## Testing Approach

- Use **Vitest** for all tests
- Fixture projects in `tests/fixtures/` are minimal — 5-10 files each, enough to test detection
- No AI mocking needed — scripts are pure data/IO
- Run: `npm test`
