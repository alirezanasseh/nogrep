# nogrep — Technical Specification

> A Claude Code plugin + CLI that generates a navigable index for any codebase so AI agents stop doing blind grep/find exploration.

---

## Table of Contents

1. [Problem](#1-problem)
2. [The One Thing](#2-the-one-thing)
3. [Output Structure](#3-output-structure)
4. [File Schemas](#4-file-schemas)
5. [CLI Interface](#5-cli-interface)
6. [Init Pipeline](#6-init-pipeline)
7. [Update Pipeline](#7-update-pipeline)
8. [Query System](#8-query-system)
9. [Tag Taxonomy](#9-tag-taxonomy)
10. [CC Plugin](#10-cc-plugin)
11. [Settings](#11-settings)
12. [CI Integration](#12-ci-integration)
13. [AI Prompts](#13-ai-prompts)

---

## 1. Problem

Claude Code has no navigational index. Every query triggers a full codebase scan:

```
find . -name "*.ts"     → discovery
grep -r "keyword" src/  → content scan  
read file → wrong file  → repeat
```

This is a full table scan on every query — slow, token-expensive, and imprecise.

A senior developer doesn't grep. They have a mental map:
> "Payment issue → src/billing/ → StripeService → webhook idempotency gotcha there"

`nogrep` encodes that mental map into a machine-queryable index.

---

## 2. The One Thing

**nogrep does one thing: give AI agents a navigable index so they stop full-scanning codebases.**

It is NOT:
- A documentation generator (that's GSD, Compodoc, JSDoc)
- A code search engine (that's Sourcegraph, ctags)
- A runtime service (no servers, no databases)
- Comprehensive docs — nodes are intentionally minimal

It IS:
- A navigation layer
- A reverse index
- A thin context node per domain
- A CC plugin that intercepts grep at the tool-call level

---

## 3. Output Structure

Generated inside the target project:

```
.nogrep/
├── _index.json          # master reverse index — primary lookup file
├── _registry.json       # source path glob → context file mapping (for CI/update)
├── _taxonomy.json       # allowed tags for this project
├── domains/             # one file per business domain
│   ├── billing.md
│   └── auth.md
├── architecture/        # cross-domain architectural concerns
│   ├── database.md
│   └── api-design.md
├── flows/               # multi-domain business flows
│   └── checkout.md
└── entities/            # data models (if applicable)
    └── user.md
```

Also patched in the target project:
```
CLAUDE.md                # navigation instructions appended
.claude/settings.json    # nogrep.enabled flag
```

---

## 4. File Schemas

### 4.1 Context Node (e.g. `.nogrep/domains/billing.md`)

```markdown
---
id: billing
title: Billing & Payments
category: domain
tags:
  domain: [billing]
  layer: [business, data, infrastructure]
  tech: [stripe, postgres]
  concern: [error-handling, idempotency]
  type: [module]
relates_to:
  - id: notifications
    reason: "triggers invoice emails after payment events"
inverse_relations:
  - id: checkout-flow
    reason: "orchestrates billing as primary step"
src_paths:
  - src/billing/**
keywords:
  - stripe
  - webhook
  - invoice
  - retry
  - idempotent
last_synced:
  commit: abc1234
  timestamp: 2025-03-13T10:00:00Z
  src_hash: sha256:ef9a3c...
---

## Purpose
_2-3 sentences of business intent. What this domain exists to do, not how._

## Public Surface
_What other domains call. Exported functions, routes, events._

```
POST /billing/webhook
BillingService.createSubscription(userId, planId)
event: billing.invoice.created
```

## Does Not Own
- Email delivery → notifications
- User identity → auth

## Gotchas
- Webhook handler must be idempotent — check event.id before processing
- All monetary values in cents (integer), never floats

## Manual Notes
_Human annotations. Never overwritten by nogrep update._
```

**Node design principles:**
- Purpose: max 3 sentences
- Gotchas: max 5 bullets
- If a node is getting long, it's doing too much
- Nodes answer "should CC look here?" — not "how does this work?"

---

### 4.2 `_index.json`

```json
{
  "version": "1.0",
  "generated_at": "2025-03-13T10:00:00Z",
  "commit": "abc1234",
  "stack": {
    "primary_language": "typescript",
    "frameworks": ["nestjs", "react"],
    "architecture": "monolith"
  },
  "tags": {
    "tech:stripe": [
      ".nogrep/domains/billing.md",
      ".nogrep/flows/checkout.md"
    ],
    "tech:redis": [
      ".nogrep/domains/auth.md",
      ".nogrep/architecture/caching.md"
    ],
    "domain:billing": [
      ".nogrep/domains/billing.md",
      ".nogrep/flows/checkout.md"
    ],
    "concern:security": [
      ".nogrep/domains/auth.md",
      ".nogrep/architecture/api-design.md"
    ]
  },
  "keywords": {
    "webhook": [".nogrep/domains/billing.md"],
    "jwt": [".nogrep/domains/auth.md"],
    "retry": [".nogrep/domains/billing.md", ".nogrep/architecture/event-system.md"]
  },
  "paths": {
    "src/billing/**": {
      "context": ".nogrep/domains/billing.md",
      "tags": ["domain:billing", "tech:stripe", "layer:business"]
    },
    "src/auth/**": {
      "context": ".nogrep/domains/auth.md",
      "tags": ["domain:auth", "concern:security", "tech:redis"]
    }
  }
}
```

---

### 4.3 `_registry.json`

```json
{
  "mappings": [
    {
      "glob": "src/billing/**",
      "context_file": ".nogrep/domains/billing.md",
      "watch": true
    },
    {
      "glob": "prisma/schema.prisma",
      "context_file": ".nogrep/architecture/database.md",
      "watch": true
    }
  ]
}
```

---

### 4.4 `_taxonomy.json`

```json
{
  "static": {
    "layer": ["presentation", "business", "data", "infrastructure", "cross-cutting"],
    "concern": ["security", "performance", "caching", "validation", "error-handling", "idempotency", "observability"],
    "type": ["module", "flow", "entity", "integration", "config", "ui", "test"]
  },
  "dynamic": {
    "domain": [],
    "tech": []
  },
  "custom": {}
}
```

`dynamic` values are detected per project during init.
`custom` is user-editable, never overwritten.

---

### 4.5 `.claude/settings.json` (team-shared)

```json
{
  "nogrep": {
    "enabled": true
  }
}
```

### 4.6 `.claude/settings.local.json` (personal, gitignored)

```json
{
  "nogrep": {
    "enabled": false
  }
}
```

`settings.local.json` takes precedence over `settings.json` for the `enabled` flag.

---

## 5. Plugin Commands

All user interaction happens through CC slash commands. No standalone CLI.

### Commands

```
/nogrep:init        # full init — Claude analyzes project, generates .nogrep/
/nogrep:update      # diff-based update of stale nodes
/nogrep:query       # index lookup
/nogrep:validate    # staleness check
/nogrep:status      # coverage + freshness summary
/nogrep:on          # enable in settings, check index
/nogrep:off         # disable in settings
```

Hooks call a thin internal script (`nogrep-run`) for mechanical operations (query lookup, validation). This is not user-facing.

---

## 6. Init Pipeline

```
Phase 1          Phase 2              Phase 3             Phase 4
Universal    →   Stack Detection  →   Deep Analysis   →   Write
Signals          (Claude analyzes     (Claude analyzes     .nogrep/
(script)          signals)             1 per cluster)      _index.json
```

Claude orchestrates the entire pipeline during `/nogrep:init`. Phase 1 runs a script to collect signals. Phases 2-3 are Claude's own analysis. Phase 4 uses writer scripts for structured output.

### Phase 1 — Universal Signals (No AI)

Collect language-agnostic signals:

| Signal | Method |
|--------|--------|
| Directory tree | `walk(root, depth=4)`, exclude node_modules/dist/build |
| File extensions | group files by extension |
| Dependency manifests | find `package.json`, `requirements.txt`, `pom.xml`, `go.mod`, `Podfile`, `Cargo.toml`, `pubspec.yaml` — note depth (root vs subfolder) |
| Entry points | find `main.*`, `index.*`, `app.*`, `server.*` |
| Git churn | `git log --stat` — top 20 most changed files |
| File size | top 20 largest files |
| Env files | find `.env*`, `config/**` |
| Test files | group test files — `*.test.*`, `*.spec.*` |

Output: `signals.json` object passed to Phase 2.

---

### Phase 2 — Stack Detection (Claude)

Input: `signals.json`
Output: `stack.json`

```typescript
interface StackResult {
  primary_language: string
  frameworks: string[]
  architecture: 'monolith' | 'monorepo' | 'multi-repo' | 'microservice' | 'library'
  domain_clusters: Array<{
    name: string
    path: string
    confidence: number
  }>
  conventions: {
    entry_pattern: string
    test_pattern: string
    config_location: string
  }
  stack_hints: string        // reading hints for Phase 3 prompt
  dynamic_taxonomy: {
    domain: string[]
    tech: string[]
  }
}
```

**Architecture detection heuristics:**
- `monolith` — single dependency manifest at root, one primary framework
- `monorepo` — multiple dependency manifests with shared tooling (nx, turborepo, lerna, workspaces)
- `multi-repo` — multiple dependency manifests at depth 1, no shared tooling, separate stacks per subfolder (e.g. backend/, frontend/, mobile/)
- `microservice` — multiple independently deployable services, often with Docker/K8s config
- `library` — single package, exports API surface, no application entry points

See Section 13 for the prompt structure (embedded in `/nogrep:init` slash command).

---

### Phase 3 — Deep Analysis (Claude, Per Cluster)

For each `domain_cluster` from Phase 2:

**Source preparation (language-agnostic trimming):**
- Keep: file headers, function/method signatures, class/interface declarations, decorators/annotations, exported symbols, inline comments
- Strip: function bodies, implementation details
- Target: 100–300 lines per cluster

**Output per cluster:** a `ContextNode` object (see types). See Section 13 for the prompt structure.

---

### Phase 3b — Flow Detection

A cluster qualifies as a cross-domain **flow** when:
- Its import graph touches 3+ distinct domain clusters, OR
- It is named with flow keywords: `checkout`, `onboarding`, `signup`, `pipeline`, `workflow`, `process`

Flows get nodes in `.nogrep/flows/`.

---

### Phase 4 — Write

1. Write all `.md` context node files (with frontmatter + AI content + empty Manual Notes)
2. Populate `inverse_relations` by scanning all `relates_to` references across nodes
3. Build `_index.json` aggregating all frontmatter
4. Build `_registry.json` from `src_paths` in each node
5. Write `_taxonomy.json` with static + dynamic values
6. Compute `src_hash` per node (SHA256 of all files matching `src_paths`)
7. Append navigation instructions to target project `CLAUDE.md`
8. Write `nogrep.enabled: true` to `.claude/settings.json`

---

## 7. Update Pipeline

```
git diff origin/main --name-only
    ↓
Map changed files → affected nodes (via _registry.json globs)
    ↓
For each affected node:
  1. Re-run Phase 1 signals for that cluster only
  2. Re-run Phase 3 deep analysis
  3. Extract and preserve ## Manual Notes
  4. Update src_hash and last_synced
    ↓
Rebuild _index.json
    ↓
(CI: commit .nogrep/ changes)
```

### Manual Notes Preservation

```typescript
function extractManualNotes(content: string): string {
  const match = content.match(
    /## Manual Notes\n([\s\S]*?)(?=\n## |\n---|\s*$)/
  )
  return match ? match[1].trim() : ''
}
// re-inject after AI regeneration
```

---

## 8. Query System

### Resolution Order

```
1. Keyword match  → _index.json .keywords
2. Tag match      → _index.json .tags
3. Path match     → _index.json .paths
4. NL question    → extract keywords/tags → repeat 1-3
```

No AI needed for query. Pure index lookup.

### Natural Language Extraction

For `--question` input:

```
Question: "how does payment retry work after a failed webhook?"

Extracted keywords: [payment, retry, webhook, failed]
Extracted tags:     [domain:billing, concern:error-handling]

Lookup: union of all nodes matching any keyword or tag
Rank:   by match count (most relevant first)
```

Extraction is keyword-based (no AI) — match words in question against taxonomy values and keywords in `_index.json`.

---

## 9. Tag Taxonomy

### Static (universal)

**`layer`**
| Value | Maps to |
|-------|---------|
| `presentation` | controllers, views, routes, screens |
| `business` | services, use-cases, view-models |
| `data` | repositories, DAOs, stores |
| `infrastructure` | config, adapters, external clients |
| `cross-cutting` | middleware, guards, interceptors, hooks |

**`concern`**
`security` · `performance` · `caching` · `validation` · `error-handling` · `idempotency` · `observability`

**`type`**
`module` · `flow` · `entity` · `integration` · `config` · `ui` · `test`

### Dynamic (per project)

**`domain`** — detected from directory structure in Phase 2
**`tech`** — detected from dependency manifests in Phase 2

---

## 10. CC Plugin

This is the **only** interface. Everything runs inside Claude Code.

### Plugin Structure

```
nogrep/
├── plugin.json
├── commands/
│   ├── init.md          # orchestrates full init pipeline
│   ├── on.md
│   ├── off.md
│   ├── update.md
│   ├── status.md
│   └── query.md
├── hooks/
│   ├── pre-tool-use.sh
│   ├── session-start.sh
│   └── prompt-submit.sh
└── scripts/
    ├── signals.ts       # Phase 1 signal collection
    ├── query.ts         # index lookup (called by hooks)
    ├── validate.ts      # staleness check (called by hooks)
    ├── write.ts         # structured file writer
    └── settings.ts      # read/write .claude/settings.json
```

### `plugin.json`

```json
{
  "name": "nogrep",
  "version": "1.0.0",
  "description": "Navigable codebase index for Claude Code — stop grepping, start navigating",
  "scope": "project",
  "hooks": {
    "PreToolUse": {
      "matcher": "Bash",
      "command": "hooks/pre-tool-use.sh"
    },
    "SessionStart": {
      "command": "hooks/session-start.sh"
    },
    "UserPromptSubmit": {
      "command": "hooks/prompt-submit.sh"
    }
  }
}
```

---

### Hook: `pre-tool-use.sh`

Intercepts grep/find/rg/ag bash commands and injects nogrep results as `additionalContext` before CC proceeds.

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept search commands
if ! echo "$COMMAND" | grep -qE '^\s*(grep|find|rg|ag|fd)\s'; then
  exit 0
fi

# Check nogrep is enabled
ENABLED=$(cat .claude/settings.json 2>/dev/null | jq -r '.nogrep.enabled // false')
LOCAL_ENABLED=$(cat .claude/settings.local.json 2>/dev/null | jq -r '.nogrep.enabled // empty')
[ -n "$LOCAL_ENABLED" ] && ENABLED="$LOCAL_ENABLED"
[ "$ENABLED" != "true" ] && exit 0

# Check index exists
[ ! -f ".nogrep/_index.json" ] && exit 0

# Extract keywords from the grep command
KEYWORDS=$(echo "$COMMAND" \
  | sed -E 's/(grep|rg|ag|find)\s+(-[a-zA-Z]+\s+)*//' \
  | tr -d '"'"'" \
  | awk '{print $1}')

[ -z "$KEYWORDS" ] && exit 0

# Query nogrep
SCRIPT_DIR="$(dirname "$0")/../scripts"
RESULT=$(node "$SCRIPT_DIR/query.js" --keywords "$KEYWORDS" --format summary --limit 3 2>/dev/null)

if [ -n "$RESULT" ]; then
  jq -n \
    --arg ctx "⚡ nogrep — read these context files before searching:\n\n$RESULT\n\nThese files tell you exactly where to look. Only proceed with the grep if they don't answer your question." \
    '{ additionalContext: $ctx }'
fi

exit 0
```

---

### Hook: `session-start.sh`

Checks index freshness at session start and warns CC.

```bash
#!/bin/bash
ENABLED=$(cat .claude/settings.json 2>/dev/null | jq -r '.nogrep.enabled // false')
LOCAL_ENABLED=$(cat .claude/settings.local.json 2>/dev/null | jq -r '.nogrep.enabled // empty')
[ -n "$LOCAL_ENABLED" ] && ENABLED="$LOCAL_ENABLED"
[ "$ENABLED" != "true" ] && exit 0

if [ ! -f ".nogrep/_index.json" ]; then
  jq -n '{ additionalContext: "⚠️ nogrep is enabled but no index found. Run `/nogrep:init` to generate the codebase index before starting work." }'
  exit 0
fi

SCRIPT_DIR="$(dirname "$0")/../scripts"
STALE=$(node "$SCRIPT_DIR/validate.js" --format json 2>/dev/null | jq -r '.stale[]?.file' | head -3)

if [ -n "$STALE" ]; then
  jq -n \
    --arg s "$STALE" \
    '{ additionalContext: ("⚠️ nogrep index may be stale. Consider running `/nogrep:update` before starting.\nStale nodes:\n" + $s) }'
fi

exit 0
```

---

### Hook: `prompt-submit.sh`

Injects relevant context nodes at the moment a user submits a prompt.

```bash
#!/bin/bash
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

ENABLED=$(cat .claude/settings.json 2>/dev/null | jq -r '.nogrep.enabled // false')
LOCAL_ENABLED=$(cat .claude/settings.local.json 2>/dev/null | jq -r '.nogrep.enabled // empty')
[ -n "$LOCAL_ENABLED" ] && ENABLED="$LOCAL_ENABLED"
[ "$ENABLED" != "true" ] && exit 0
[ ! -f ".nogrep/_index.json" ] && exit 0
[ -z "$PROMPT" ] && exit 0

# Only inject for prompts that seem to be about code navigation
if ! echo "$PROMPT" | grep -qiE '(where|how|which|what|find|look|show|implement|fix|add|change|update|refactor)'; then
  exit 0
fi

SCRIPT_DIR="$(dirname "$0")/../scripts"
RESULT=$(node "$SCRIPT_DIR/query.js" --question "$PROMPT" --format summary --limit 3 2>/dev/null)

if [ -n "$RESULT" ]; then
  jq -n \
    --arg ctx "📍 nogrep context for your question:\n\n$RESULT\n\nRead these files first before exploring source." \
    '{ additionalContext: $ctx }'
fi

exit 0
```

---

### Slash Commands

Each command file in `commands/` is a markdown prompt that guides Claude through the operation. Unlike simple shell wrappers, these are rich prompts — Claude does the AI work directly.

**`commands/init.md`** — The most important command. Contains:
- Instructions to run `scripts/signals.js` to collect Phase 1 data
- The Phase 2 prompt (stack detection) — Claude analyzes signals directly
- The Phase 3 prompt (cluster analysis) — Claude analyzes each cluster
- Instructions to run `scripts/write.js` to generate structured output
- Instructions to patch CLAUDE.md and write settings

**`commands/update.md`** — Guides Claude through:
- Running `git diff origin/main --name-only` to find changed files
- Mapping changed files to affected nodes via `_registry.json`
- Re-analyzing affected clusters
- Running `scripts/write.js` to update nodes (preserving Manual Notes)

**`commands/on.md`** — Enable nogrep:
- Run `scripts/settings.js --set enabled=true`
- Check if `.nogrep/_index.json` exists
- If missing, suggest running `/nogrep:init`

**`commands/off.md`** — Disable nogrep:
- Run `scripts/settings.js --set enabled=false`

**`commands/status.md`** — Show index health:
- Run `scripts/validate.js --format text`
- Show node counts by category, freshness summary

**`commands/query.md`** — Manual index lookup:
- Run `scripts/query.js --question "$ARGUMENTS"`

---

## 11. Settings

### Resolution Order

```
1. .claude/settings.local.json   (personal, gitignored, highest priority)
2. .claude/settings.json         (team, committed to repo)
3. default: enabled = false
```

### Settings Script

`scripts/settings.ts` handles read/write of settings JSON:

```typescript
// read: merges both files, local takes precedence
readSettings(projectRoot: string): { enabled: boolean }

// write: writes to settings.json by default, settings.local.json with --local flag
writeSettings(projectRoot: string, settings: { enabled?: boolean }, local?: boolean): void
```

---

## 12. CI Integration

Out of scope for v1. The index is maintained via `/nogrep:update` during CC sessions. CI support (validation, auto-update) is a future concern.

---

## 13. Prompts (Embedded in Slash Commands)

These prompts are embedded in `commands/init.md` and `commands/update.md`. Claude executes them directly — no separate API calls.

### Phase 2 — Stack Detection Prompt

```
Analyze this project's signals and return JSON only. No prose, no markdown fences.

## Directory tree:
{directory_tree}

## Dependency manifests:
{manifests}

## File extension distribution:
{extension_map}

## Entry point candidates:
{entry_points}

Return this exact shape:
{
  "primary_language": "typescript",
  "frameworks": ["nestjs", "react"],
  "architecture": "monolith",  // or "monorepo", "multi-repo", "microservice", "library"
  "domain_clusters": [
    { "name": "billing", "path": "src/billing/", "confidence": 0.95 }
  ],
  "conventions": {
    "entry_pattern": "*.module.ts",
    "test_pattern": "*.spec.ts",
    "config_location": "src/config/"
  },
  "stack_hints": "NestJS: *.module.ts = module boundary, *.service.ts = business logic, *.controller.ts = HTTP handlers",
  "dynamic_taxonomy": {
    "domain": ["billing", "auth", "users"],
    "tech": ["stripe", "redis", "postgres"]
  }
}
```

---

### Phase 3 — Context Node Generation Prompt

```
You are generating a navigation node for an AI coding agent.
Nodes must be MINIMAL — the agent uses them to decide WHERE to look, not to understand everything.

## Project stack:
{stack_json}

## Stack reading hints:
{stack_hints}

## Source files (trimmed to signatures only):
{trimmed_source}

## Allowed tags (use ONLY these exact values — never invent new ones):
{taxonomy_json}

Generate a context node. Return JSON only, no prose, no markdown fences.

{
  "purpose": "2-3 sentences MAX. Business intent, not technical description.",
  "public_surface": ["list of exported functions/routes/events other domains use"],
  "does_not_own": ["what this module delegates elsewhere, with → target domain"],
  "external_deps": [{"name": "stripe", "usage": "payment processing"}],
  "tags": {
    "domain": [],
    "layer": [],
    "tech": [],
    "concern": [],
    "type": []
  },
  "keywords": ["terms a developer would search to find this domain"],
  "gotchas": ["max 5 non-obvious behaviors, footguns, or constraints"]
}

Rules:
- purpose: max 3 sentences
- gotchas: max 5 items
- keywords: 5-15 items, think about what words someone would grep for
- tags: use taxonomy values only, never invent new tag values
- does_not_own: include explicit redirections ("email delivery → notifications")
```
