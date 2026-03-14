# nogrep — Implementation Tasks

> Work through these tasks in order. Each task is independently testable before moving on.
> Read docs/CLAUDE.md, docs/SPEC.md, docs/ARCHITECTURE.md, and docs/CONVENTIONS.md before starting.

---

## Task 1 — Project Scaffold

**Goal:** Buildable TypeScript project with plugin manifest.

- [x] Create `package.json` with dependencies: `glob`, `gray-matter`, `js-yaml`
- [x] Create `package.json` devDependencies: `typescript`, `tsup`, `vitest`, `@types/node`
- [x] Create `tsconfig.json` (see docs/CONVENTIONS.md)
- [x] Create `tsup.config.ts` — builds `scripts/` → `dist/`, ESM, declaration files
- [x] Create `scripts/types.ts` — all types from docs/ARCHITECTURE.md key types section
- [x] Create `plugin.json` — CC plugin manifest with hook declarations
- [x] Verify: `npm run build` compiles successfully

---

## Task 2 — Settings

**Goal:** Read/write nogrep settings from `.claude/settings.json` and `.claude/settings.local.json`.

- [x] Create `scripts/settings.ts`
  - `readSettings(projectRoot)` — reads both files, local takes precedence over shared
  - `writeSettings(projectRoot, settings, local?)` — writes to shared or local file
  - Creates `.claude/` dir if it doesn't exist
  - CLI interface: `node settings.js --set enabled=true [--local]` / `node settings.js --get`
- [x] Create `commands/on.md` slash command
  - Runs `node "${CLAUDE_PLUGIN_ROOT}/dist/settings.js" --set enabled=true`
  - Checks if `.nogrep/_index.json` exists
  - If missing: suggests running `/nogrep:init`
- [x] Create `commands/off.md` slash command
  - Runs `node "${CLAUDE_PLUGIN_ROOT}/dist/settings.js" --set enabled=false`
- [x] Write `tests/settings.test.ts` — test merge logic, local precedence, file creation
- [x] Verify: `/nogrep:on` and `/nogrep:off` work in CC

---

## Task 3 — Phase 1: Universal Signals

**Goal:** Collect language-agnostic signals from any project directory.

- [ ] Create `scripts/signals.ts`
  - `collectSignals(root, options)` → `SignalResult`
  - Walk directory tree (depth 4, skip: node_modules, dist, build, .git, coverage)
  - Group files by extension → `extensionMap`
  - Find dependency manifests: `package.json`, `requirements.txt`, `pom.xml`, `go.mod`, `Podfile`, `Cargo.toml`, `pubspec.yaml`, `composer.json`
  - Find entry points: files named `main.*`, `index.*`, `app.*`, `server.*` at root or src/ level
  - Run `git log --stat --oneline -50` → parse top 20 most changed files
  - Find top 20 largest files (excluding node_modules etc)
  - Find `.env*` files and `config/` directories
  - Find test files matching `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`
  - CLI interface: `node signals.js [--root <path>] [--exclude <globs>]` → JSON stdout
- [ ] Create `tests/fixtures/nestjs-project/` — minimal NestJS project (5-10 files)
- [ ] Create `tests/fixtures/django-project/` — minimal Django project
- [ ] Create `tests/fixtures/react-project/` — minimal React project
- [ ] Write `tests/signals.test.ts` — run against all 3 fixtures, assert signal shape
- [ ] Verify: signals correctly identifies NestJS vs Django vs React

---

## Task 4 — Source Trimming

**Goal:** Reduce source files to signatures only, language-agnostic.

- [ ] Create `scripts/trim.ts`
  - `trimCluster(paths: string[], projectRoot: string)` → `string`
  - For each file in the cluster's src_paths:
    - Read file content
    - Remove function/method bodies (keep signature line + opening brace only)
    - Keep: file header comments, imports, class/interface declarations, decorators/annotations, exported symbols, type definitions
    - Strip: function bodies, private method bodies, inline HTML/template strings
    - Max 300 lines total across all files — truncate least important files first
  - Strategy: regex-based (simple, universal — not perfect but good enough)
  - CLI interface: `node trim.js <path1> <path2> ...` → trimmed output to stdout
- [ ] Write `tests/trim.test.ts` — test against TypeScript, Python, Java snippet fixtures
- [ ] Verify: trimmed output is ~30-50% of original size, signatures intact

---

## Task 5 — Writers

**Goal:** Write all `.nogrep/` files from structured input.

- [ ] Create `scripts/write.ts`
  - Accepts JSON via stdin or `--input <file>` with NodeResult[] + StackResult
  - `writeContextNodes(nodes, outputDir)` — generates markdown with frontmatter (YAML)
    - Creates subdirectories: `domains/`, `architecture/`, `flows/`, `entities/`
    - Appends empty `## Manual Notes` section at end
    - Existing files: extract Manual Notes, regenerate, re-inject Manual Notes
  - `buildIndex(nodes, stack)` → writes `_index.json`
    - Builds reverse maps: tags → [files], keywords → [files], paths → entry
    - Populates `inverse_relations` by scanning all `relates_to` across nodes
  - `buildRegistry(nodes)` → writes `_registry.json`
  - `patchClaudeMd(projectRoot)` — appends navigation instructions
    - Checks for `<!-- nogrep -->` marker to avoid duplicate patching
- [ ] Create `templates/claude-md-patch.md`:
  ```markdown
  <!-- nogrep -->
  ## Code Navigation

  This project uses [nogrep](https://github.com/techtulp/nogrep).
  Context files in `.nogrep/` are a navigable index of this codebase.
  When you see nogrep results injected into your context, trust them —
  read those files before exploring source.
  <!-- /nogrep -->
  ```
- [ ] Write `tests/writer.test.ts` — write to temp dirs, verify file contents and frontmatter
- [ ] Verify: running writers on fixture data produces valid markdown with parseable frontmatter

---

## Task 6 — Init Slash Command

**Goal:** `/nogrep:init` orchestrates the full pipeline with Claude doing the AI work.

- [ ] Create `commands/init.md`
  - Step 1: Run `node "${CLAUDE_PLUGIN_ROOT}/dist/signals.js" --root .` → collect signals
  - Step 2: Embed Phase 2 prompt — Claude analyzes signals, produces StackResult JSON
  - Step 3: For each domain cluster, embed Phase 3 prompt — Claude reads trimmed source (via `node "${CLAUDE_PLUGIN_ROOT}/dist/trim.js"`), produces NodeResult JSON
  - Step 4: Claude detects flows (clusters touching 3+ domains or named with flow keywords)
  - Step 5: Run `node "${CLAUDE_PLUGIN_ROOT}/dist/write.js"` with all results piped as JSON stdin
  - Step 6: Run `node "${CLAUDE_PLUGIN_ROOT}/dist/settings.js" --set enabled=true`
  - See docs/SPEC.md Section 13 for prompt templates
- [ ] Test: run `/nogrep:init` in CC on a fixture project, inspect `.nogrep/` output

---

## Task 7 — Query System

**Goal:** Fast index lookup without AI.

- [ ] Create `scripts/query.ts`
  - `extractTerms(question, taxonomy)` → `{ tags, keywords }`
    - Split question into words, lowercase
    - Match against taxonomy domain/tech values → tags
    - Match against any word → keywords (pass through)
    - No AI — pure string matching
  - `resolve(terms, index)` → `RankedResult[]`
    - Union lookup: find all nodes matching any tag or keyword
    - Score: +2 per tag match, +1 per keyword match
    - Sort by score descending, return top N (default 5)
  - CLI interface: `node query.js --tags <tags> | --keywords <words> | --question <text> [--format paths|json|summary] [--limit N]`
  - Throws `NogrepError('NO_INDEX')` if `_index.json` missing
- [ ] Create `commands/query.md` slash command — runs `node "${CLAUDE_PLUGIN_ROOT}/dist/query.js" --question "$ARGUMENTS"`
- [ ] Write `tests/query.test.ts` — test extraction and resolution
- [ ] Verify: `node dist/query.js --question "how does stripe work"` returns billing context file

---

## Task 8 — Validator + Update + Status

**Goal:** Staleness detection and incremental updates.

- [ ] Create `scripts/validate.ts`
  - `checkFreshness(node, projectRoot)` → `StaleResult`
  - Glob all files matching node's `src_paths`
  - Compute SHA256 of all file contents concatenated
  - Compare to `last_synced.src_hash` in frontmatter
  - CLI interface: `node validate.js [--format text|json]` → staleness report
- [ ] Create `commands/update.md` slash command
  - Guides Claude through: git diff → map to affected nodes → re-analyze → write updates
  - Preserves `## Manual Notes` section
- [ ] Create `commands/status.md` slash command
  - Runs `node "${CLAUDE_PLUGIN_ROOT}/dist/validate.js"` and shows node counts, freshness summary
- [ ] Write `tests/validate.test.ts` — test staleness detection

---

## Task 9 — Hooks

**Goal:** Automatic context injection via CC hooks.

- [ ] Create `hooks/pre-tool-use.sh` (see docs/SPEC.md Section 10)
  - Intercepts grep/find/rg/ag commands
  - Calls `node "${CLAUDE_PLUGIN_ROOT}/dist/query.js"` with extracted keywords
  - Injects results as `additionalContext`
- [ ] Create `hooks/session-start.sh` (see docs/SPEC.md Section 10)
  - Checks index existence and freshness on session start
  - Calls `node "${CLAUDE_PLUGIN_ROOT}/dist/validate.js"`
- [ ] Create `hooks/prompt-submit.sh` (see docs/SPEC.md Section 10)
  - Injects relevant context for code navigation prompts
  - Calls `node "${CLAUDE_PLUGIN_ROOT}/dist/query.js"`
- [ ] Make all `.sh` scripts executable (`chmod +x`)
- [ ] Test: install plugin locally in CC, verify hooks fire

---

## Task 10 — README + Distribution

**Goal:** Ready for npm publish as CC plugin.

- [ ] Write `README.md`:
  - What it does (one paragraph)
  - Install as CC plugin
  - Quick start (3 steps)
  - How it works (brief pipeline overview)
  - Available commands
  - FAQ
- [ ] Add `files` field to `package.json` — ship `dist/`, `commands/`, `hooks/`, `templates/`, `plugin.json`
- [ ] Verify `npm pack` produces correct bundle
- [ ] Add `prepublish` script: `npm run build && npm test`

---

## Definition of Done

All tasks complete when:
- `/nogrep:init` runs successfully in CC on a real project and produces valid `.nogrep/`
- `/nogrep:query` returns correct context files
- CC hooks intercept grep commands and inject nogrep context
- All unit tests pass: `npm test`
- README is clear enough for a stranger to get started in 2 minutes
