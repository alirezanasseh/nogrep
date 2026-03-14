# nogrep — Coding Conventions

## Language & Runtime

- TypeScript strict mode — `"strict": true` in tsconfig
- Node.js 20+
- ESM modules (`"type": "module"` in package.json)
- No `any` — use `unknown` and narrow

---

## Naming

```typescript
// Files: kebab-case
signals.ts
index-builder.ts
pre-tool-use.sh

// Types/Interfaces: PascalCase
interface StackResult { ... }
interface NodeResult { ... }

// Functions: camelCase, verb-first
collectSignals()
buildIndex()
resolveQuery()
extractTerms()
checkFreshness()

// Constants: UPPER_SNAKE_CASE
const MAX_CLUSTER_LINES = 300
```

---

## Functions

- Small and focused — one responsibility
- Pure functions where possible (especially in scripts)
- Prefer named parameters for 3+ args:

```typescript
// ✅
writeContextFiles({ nodes, outputDir, preserveManualNotes })

// ❌
writeContextFiles(nodes, outputDir, true)
```

- Always type return values explicitly on exported functions
- Async/await everywhere — no raw Promise chains

---

## Error Handling

Always use `NogrepError` with a code for expected failures:

```typescript
// ✅
throw new NogrepError('No .nogrep/_index.json found. Run /nogrep:init first.', 'NO_INDEX')

// ❌
throw new Error('not found')
```

Scripts catch `NogrepError` and output JSON errors to stderr.
Hooks fail silently (exit 0) — never block the CC session.

---

## File I/O

- All file paths are absolute — resolve early, pass around as absolute
- Use `fs/promises` — no sync fs calls
- Writer functions take `outputDir` as explicit parameter — never hardcode `.nogrep/`

---

## Script Output

Scripts communicate via stdout (JSON for data, plain text for human-readable).

```
# ✅ Good
{ "nodes": 17, "stale": 1 }

# ❌ Too chatty
🚀 Starting signal collection...
📁 Found 42 files...
```

Verbose output only when `NOGREP_DEBUG=1`, and goes to stderr.

---

## Package Structure

```json
{
  "type": "module",
  "files": ["dist/", "commands/", "hooks/", "templates/", "plugin.json"]
}
```

---

## Dependencies

Keep dependencies minimal. Approved list:

| Package | Purpose |
|---------|---------|
| `glob` | file glob matching |
| `gray-matter` | frontmatter parsing |
| `js-yaml` | YAML serialization |
| `vitest` | testing (dev) |
| `tsup` | build (dev) |
| `typescript` | type checking (dev) |
| `@types/node` | Node type defs (dev) |

Do not add new dependencies without a strong reason.

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "./dist",
    "rootDir": "./scripts",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["scripts/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## Tests

- Test files in `tests/` directory
- Use `describe` + `it` — not `test`
- Each test file is independent — no shared state between files
- Use `vitest`'s `vi.mock` sparingly — prefer dependency injection

```typescript
// ✅ injectable
const result = collectSignals('/path/to/fixture', { exclude: [] })

// ❌ global mock
vi.mock('fs/promises')
```
