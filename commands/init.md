Initialize nogrep for this project. Follow these steps exactly in order.

---

## Step 1 — Collect Signals

Run the signal collection script to gather project metadata:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/signals.js" --root .
```

Save the JSON output — you will use it in Step 2.

---

## Step 2 — Detect Stack

Analyze the signals from Step 1. Look at the directory tree, dependency manifests, file extension distribution, and entry point candidates.

Produce a JSON object with this exact shape (no prose, no markdown fences in your output — just the raw JSON):

```
{
  "primary_language": "typescript",
  "frameworks": ["nestjs", "react"],
  "architecture": "monolith",
  "domain_clusters": [
    { "name": "billing", "path": "src/billing/", "confidence": 0.95 }
  ],
  "conventions": {
    "entry_pattern": "*.module.ts",
    "test_pattern": "*.spec.ts",
    "config_location": "src/config/"
  },
  "stack_hints": "NestJS: *.module.ts = module boundary, *.service.ts = business logic",
  "dynamic_taxonomy": {
    "domain": ["billing", "auth", "users"],
    "tech": ["stripe", "redis", "postgres"]
  }
}
```

**Architecture detection rules:**
- `monolith` — single dependency manifest at root, one primary framework
- `monorepo` — multiple dependency manifests with shared tooling (nx, turborepo, lerna, workspaces)
- `multi-repo` — multiple dependency manifests at depth 1, no shared tooling, separate stacks per subfolder
- `microservice` — multiple independently deployable services, often with Docker/K8s config
- `library` — single package, exports API surface, no application entry points

**Domain cluster detection:**
- Look at top-level directories under `src/`, `app/`, `lib/`, `packages/`
- Each cluster is a cohesive area of business logic (e.g., `billing`, `auth`, `users`)
- Set confidence 0.0–1.0 based on how clearly defined the boundary is
- Include at least the `path` glob pattern (e.g., `src/billing/**`)

Save this result — you will use it in Steps 3 and 5.

---

## Step 3 — Analyze Each Domain Cluster

For **each** domain cluster identified in Step 2, do the following:

### 3a. Trim the source files

Run the trim script to get signatures-only view of the cluster's source files. Pass all source files in the cluster's path as arguments:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/trim.js" <file1> <file2> ...
```

To find the files in the cluster, use the cluster's `path` from Step 2 to list source files:

```bash
find <cluster_path> -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.java" -o -name "*.go" -o -name "*.rs" -o -name "*.rb" -o -name "*.swift" -o -name "*.dart" -o -name "*.kt" -o -name "*.cs" -o -name "*.tsx" -o -name "*.jsx" \) | head -30
```

Then pass those files to the trim script.

### 3b. Generate a context node

Using the trimmed source from 3a and the stack info from Step 2, generate a context node.

For each cluster, produce a JSON object with this shape:

```
{
  "id": "billing",
  "title": "Billing & Payments",
  "category": "domain",
  "purpose": "2-3 sentences MAX. Business intent, not technical description.",
  "public_surface": ["BillingService.createSubscription(userId, planId)", "POST /billing/webhook"],
  "does_not_own": ["email delivery → notifications", "user identity → auth"],
  "external_deps": [{"name": "stripe", "usage": "payment processing"}],
  "tags": {
    "domain": ["billing"],
    "layer": ["business", "data"],
    "tech": ["stripe", "postgres"],
    "concern": ["error-handling", "idempotency"],
    "type": ["module"]
  },
  "relates_to": [
    {"id": "notifications", "reason": "triggers invoice emails after payment events"}
  ],
  "src_paths": ["src/billing/**"],
  "keywords": ["stripe", "webhook", "invoice", "retry", "idempotent"],
  "gotchas": ["Webhook handler must be idempotent — check event.id before processing"]
}
```

**Allowed tag values (use ONLY these — never invent new ones):**
- `layer`: presentation, business, data, infrastructure, cross-cutting
- `concern`: security, performance, caching, validation, error-handling, idempotency, observability
- `type`: module, flow, entity, integration, config, ui, test
- `domain`: use values from Step 2's `dynamic_taxonomy.domain`
- `tech`: use values from Step 2's `dynamic_taxonomy.tech`

**Rules:**
- `purpose`: max 3 sentences — what the domain exists to do, not how
- `gotchas`: max 5 items — non-obvious behaviors, footguns, constraints
- `keywords`: 5–15 items — terms a developer would grep for to find this domain
- `does_not_own`: include explicit redirections ("email delivery → notifications")
- `id`: kebab-case, matches the cluster name

Collect all node results — you will use them in Step 5.

---

## Step 4 — Detect Flows

Review all the nodes from Step 3. A cluster qualifies as a cross-domain **flow** when:
- Its import graph or `relates_to` touches 3+ distinct domain clusters, OR
- It is named with flow keywords: `checkout`, `onboarding`, `signup`, `pipeline`, `workflow`, `process`

For each detected flow, generate a node with `"category": "flow"` using the same schema as Step 3b. Flow nodes go in `.nogrep/flows/`.

Add any flow nodes to your collection from Step 3.

---

## Step 5 — Write Everything

Now assemble the final input for the writer script. Create a JSON object combining all nodes and the stack info:

```json
{
  "nodes": [
    {
      "id": "billing",
      "title": "Billing & Payments",
      "category": "domain",
      "tags": { "domain": ["billing"], "layer": ["business"], "tech": ["stripe"], "concern": [], "type": ["module"] },
      "relatesTo": [{"id": "notifications", "reason": "triggers emails"}],
      "inverseRelations": [],
      "srcPaths": ["src/billing/**"],
      "keywords": ["stripe", "webhook"],
      "lastSynced": { "commit": "", "timestamp": "2025-03-13T10:00:00Z", "srcHash": "" },
      "purpose": "Handles all payment processing...",
      "publicSurface": ["BillingService.createSubscription()"],
      "doesNotOwn": ["email delivery → notifications"],
      "externalDeps": [{"name": "stripe", "usage": "payment processing"}],
      "gotchas": ["Webhook must be idempotent"]
    }
  ],
  "stack": {
    "primaryLanguage": "typescript",
    "frameworks": ["nestjs"],
    "architecture": "monolith"
  }
}
```

**Important:** When converting from Step 3's output format to the writer's input format:
- `relates_to` → `relatesTo`
- `src_paths` → `srcPaths`
- `does_not_own` → `doesNotOwn`
- `public_surface` → `publicSurface`
- `external_deps` → `externalDeps`
- Add `inverseRelations: []` (the writer populates these automatically)
- Add `lastSynced` with empty `commit`, current ISO timestamp, and empty `srcHash`

Pipe the JSON to the writer script:

```bash
echo '<YOUR_JSON>' | node "${CLAUDE_PLUGIN_ROOT}/dist/write.js" --root .
```

This will:
- Create `.nogrep/` directory with all context node files
- Build `_index.json` (reverse index)
- Build `_registry.json` (source path → context file mapping)
- Patch `CLAUDE.md` with navigation instructions

---

## Step 6 — Write Taxonomy

Write `_taxonomy.json` to `.nogrep/` with the detected taxonomy. Use the `dynamic_taxonomy` from Step 2:

```bash
cat > .nogrep/_taxonomy.json << 'TAXONOMY_EOF'
{
  "static": {
    "layer": ["presentation", "business", "data", "infrastructure", "cross-cutting"],
    "concern": ["security", "performance", "caching", "validation", "error-handling", "idempotency", "observability"],
    "type": ["module", "flow", "entity", "integration", "config", "ui", "test"]
  },
  "dynamic": {
    "domain": <DOMAIN_VALUES_FROM_STEP_2>,
    "tech": <TECH_VALUES_FROM_STEP_2>
  },
  "custom": {}
}
TAXONOMY_EOF
```

---

## Step 7 — Enable nogrep

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/settings.js" --set enabled=true
```

---

## Done

Tell the user:

> nogrep initialized successfully. The `.nogrep/` directory contains your codebase index.
>
> - **Context nodes:** one per domain/flow in `.nogrep/domains/` and `.nogrep/flows/`
> - **Index:** `.nogrep/_index.json` — reverse lookup by tags, keywords, and paths
> - **Registry:** `.nogrep/_registry.json` — maps source paths to context files
>
> nogrep is now enabled. Hooks will automatically inject context when you search.
>
> To update after code changes: `/nogrep:update`
> To check index health: `/nogrep:status`
