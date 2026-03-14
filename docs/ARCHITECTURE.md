# nogrep — Internal Architecture

## Module Boundaries

```
┌──────────────────────────────────────────────────────┐
│              CC Plugin (slash commands)                │
│  /init · /update · /query · /status · /on · /off      │
│  Claude orchestrates — AI work happens here            │
└────────────────────────┬─────────────────────────────┘
                         │ calls scripts via Bash
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌──────────────┐
│  Signals    │  │    Query    │  │   Settings   │
│  (collect)  │  │  (lookup)   │  │  (r/w JSON)  │
└─────────────┘  └──────┬──────┘  └──────────────┘
                        │
┌─────────────┐  ┌──────┴──────┐
│   Writer    │  │  Validator  │
│ (file I/O)  │  │ (freshness) │
└─────────────┘  └─────────────┘
```

No AI client module — Claude IS the AI. The slash commands contain the analysis prompts, and Claude executes them directly during the session.

---

## Module Responsibilities

### `commands/` (slash commands)
Markdown prompts that guide Claude through each operation. `init.md` is the most complex — it orchestrates the full pipeline. Claude reads script output, performs analysis, and writes results.

### `scripts/signals.ts`
Collects language-agnostic signals from the filesystem. Pure data collection — no AI, no writes to `.nogrep/`.

```typescript
collectSignals(root, options) → SignalResult
```

### `scripts/write.ts`
All file I/O for the `.nogrep/` directory. Takes structured JSON input (from Claude's analysis), writes files.

```typescript
writeContextFiles(nodes: NodeResult[], outputDir: string) → void
buildIndex(nodes: NodeResult[]) → IndexJson
buildRegistry(nodes: NodeResult[]) → RegistryJson
patchClaudeMd(projectRoot: string) → void
```

### `scripts/query.ts`
Pure lookup logic. Reads `_index.json`, matches tags/keywords, ranks results. No AI, no file writes. Called by hooks and `/nogrep:query`.

```typescript
extractTerms(question: string, taxonomy: Taxonomy) → { tags, keywords }
resolve(terms, index) → RankedResult[]
```

### `scripts/validate.ts`
Computes SHA256 of `src_paths` contents, compares to stored `src_hash` in node frontmatter.

```typescript
checkFreshness(node: ContextNode, projectRoot: string) → StaleResult
```

### `scripts/settings.ts`
Read/write `.claude/settings.json` and `.claude/settings.local.json`. Handles merge logic (local takes precedence).

---

## Data Flow: `/nogrep:init`

> `$PLUGIN` = `${CLAUDE_PLUGIN_ROOT}` — the absolute path to the installed plugin directory.

```
Slash command: init.md (Claude orchestrates)
  │
  ├─→ Bash: node $PLUGIN/dist/signals.js    → SignalResult (JSON stdout)
  │
  ├─→ Claude analyzes signals           → StackResult
  │
  ├─→ For each cluster:
  │     Claude reads trimmed source      → NodeResult
  │
  ├─→ Claude detects flows              → FlowResult[]
  │
  └─→ Bash: node $PLUGIN/dist/write.js      (receives JSON stdin)
        writes .nogrep/domains/*.md etc
        writes .nogrep/_index.json
        writes .nogrep/_registry.json
        patches CLAUDE.md
        writes .claude/settings.json
```

---

## Data Flow: Hooks

```
User types prompt
  │
  └─→ prompt-submit.sh
        node $PLUGIN/dist/query.js --question "$PROMPT"
        → injects additionalContext

CC decides to run grep
  │
  └─→ pre-tool-use.sh (PreToolUse hook)
        extracts keywords from grep command
        node $PLUGIN/dist/query.js --keywords "$KEYWORDS"
        → injects additionalContext

CC starts session
  │
  └─→ session-start.sh (SessionStart hook)
        node $PLUGIN/dist/validate.js
        → injects staleness warning if needed
```

---

## Key Types (`scripts/types.ts`)

```typescript
export interface SignalResult {
  directoryTree: DirectoryNode[]
  extensionMap: Record<string, number>
  manifests: ManifestFile[]
  entryPoints: string[]
  gitChurn: ChurnEntry[]
  largeFiles: FileSize[]
  envFiles: string[]
  testFiles: string[]
}

export interface StackResult {
  primaryLanguage: string
  frameworks: string[]
  architecture: 'monolith' | 'monorepo' | 'multi-repo' | 'microservice' | 'library'
  domainClusters: DomainCluster[]
  conventions: StackConventions
  stackHints: string
  dynamicTaxonomy: { domain: string[]; tech: string[] }
}

export interface DomainCluster {
  name: string
  path: string
  confidence: number
}

export interface NodeResult {
  id: string
  title: string
  category: 'domain' | 'architecture' | 'flow' | 'entity'
  tags: TagSet
  relatesTo: Relation[]
  inverseRelations: Relation[]
  srcPaths: string[]
  keywords: string[]
  lastSynced: SyncMeta
  // content fields
  purpose: string
  publicSurface: string[]
  doesNotOwn: string[]
  externalDeps: ExternalDep[]
  gotchas: string[]
}

export interface TagSet {
  domain: string[]
  layer: string[]
  tech: string[]
  concern: string[]
  type: string[]
}

export interface IndexJson {
  version: string
  generatedAt: string
  commit: string
  stack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'>
  tags: Record<string, string[]>
  keywords: Record<string, string[]>
  paths: Record<string, PathEntry>
}

export interface RankedResult {
  contextFile: string
  score: number
  matchedOn: string[]
  summary: string
}

export interface StaleResult {
  file: string
  isStale: boolean
  reason?: string
}
```

---

## Error Handling Strategy

- Scripts: throw typed errors (`NogrepError` with `code` field), exit 1 with JSON error on stderr
- Hooks: fail silently (exit 0) — never block CC session
- Never swallow errors silently in scripts

```typescript
export class NogrepError extends Error {
  constructor(
    message: string,
    public code: 'NO_INDEX' | 'NO_GIT' | 'IO_ERROR' | 'STALE'
  ) {
    super(message)
  }
}
```

---

## Testing Strategy

### Unit tests (no filesystem)
- `query/extractor.test.ts` — NL extraction logic
- `query/resolver.test.ts` — index lookup ranking
- `validator/staleness.test.ts` — hash comparison logic
- `settings/index.test.ts` — merge logic

### Integration tests (real filesystem)
- `signals.test.ts` — run against fixture projects
- `writer/*.test.ts` — write to temp dir, verify file contents

### Fixture projects (`tests/fixtures/`)
Minimal 5-10 file projects, enough for signal detection:
- `nestjs-project/` — NestJS with billing + auth modules
- `django-project/` — Django with users + payments apps
- `react-project/` — React app with auth + dashboard features
