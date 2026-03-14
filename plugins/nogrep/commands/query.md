---
allowed-tools: Bash(node *), Read
---

Answer the user's question using the nogrep codebase index. Follow these steps exactly:

## Step 1 — Query the index

```bash
node "$(dirname "${CLAUDE_PLUGIN_ROOT}")/dist/query.js" --question "$ARGUMENTS" --format summary --limit 5 2>/dev/null || node "${CLAUDE_PLUGIN_ROOT}/dist/query.js" --question "$ARGUMENTS" --format summary --limit 5
```

If no results are found, tell the user and suggest `/nogrep:init` if the index hasn't been created yet. Stop here.

## Step 2 — Read the matched context files

For each context file listed in the results, use the Read tool to read the full file contents. These are `.nogrep/domains/*.md` or `.nogrep/flows/*.md` files in the project root.

## Step 3 — Answer the question

Using the information from the context files (which contain file paths, public API surfaces, relationships, gotchas, and domain descriptions), answer the user's original question directly.

Do NOT launch Explore agents or do broad file searches. The context files already contain the curated knowledge needed to answer navigation and architecture questions. If the user needs to see actual source code, point them to the specific file paths listed in the context files.
