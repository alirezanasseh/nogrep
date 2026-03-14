# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is nogrep

A Claude Code plugin that generates a structured `.nogrep/` index directory for any codebase, replacing blind grep/find exploration with navigable context nodes (markdown files with YAML frontmatter).

## Commands

```bash
npm run build          # Build scripts/ → plugins/nogrep/scripts/ via tsup (ESM)
npm test               # Run all tests (vitest)
npx vitest run tests/query.test.ts   # Run a single test file
```

## Architecture

The project has two layers:

**Scripts** (`scripts/`) — TypeScript modules that handle data collection and file I/O. Each script is both an importable module and a standalone CLI (guarded by `import.meta.url` check). Built by tsup into `plugins/nogrep/scripts/`.

- `signals.ts` — Walks the project directory tree, collects file extensions, manifests, entry points, git churn, large files, env/test files. Produces a `SignalResult`.
- `trim.ts` — Language-aware source trimmer that strips function bodies while keeping signatures, imports, types, and class structures. Supports TS/JS, Python, Java/Kotlin/Go/Rust/C#/etc. Used to produce concise source for Claude to analyze during index generation.
- `write.ts` — Writes context node markdown files, builds `_index.json` (reverse index: tags/keywords → context files), `_registry.json` (source path → context file mapping), and patches the project's CLAUDE.md with a nogrep section.
- `query.ts` — Extracts tags and keywords from natural language questions using the taxonomy, then scores context files (tags: +2, keywords: +1 with partial matching).
- `validate.ts` — Checks freshness of context nodes by comparing SHA256 hash of source files against `src_hash` in frontmatter.
- `settings.ts` — Reads/writes nogrep enabled state from `.claude/settings.json` (shared) and `.claude/settings.local.json` (personal).
- `types.ts` — All shared TypeScript interfaces and error types.

**Plugin** (`plugins/nogrep/`) — Claude Code plugin structure with command prompts (`commands/*.md`) that orchestrate the 4-phase init pipeline: collect signals → detect stack (Claude) → analyze clusters (Claude) → write index (scripts). Commands: `init`, `update`, `query`, `status`, `on`, `off`.

## Key patterns

- Context nodes use gray-matter for YAML frontmatter parsing. The `## Manual Notes` section in each node is preserved across updates.
- The taxonomy has static categories (layer, concern, type) and dynamic ones (domain, tech) populated per-project.
- All CLI scripts output JSON to stdout and errors as JSON to stderr, using `process.exitCode` instead of `process.exit()` where possible.
- `tsconfig.json` uses `noUncheckedIndexedAccess: true` — all indexed access requires null checks.
