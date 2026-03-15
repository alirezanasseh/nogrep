Update stale nogrep context nodes based on recent changes.

## Step 1: Check for stale nodes

Run the validation script to find stale nodes:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.js" --format json
```

If there are no stale nodes, tell the user:

> All nogrep context nodes are up to date. Nothing to update.

If the validation fails because no index exists, tell the user:

> No nogrep index found. Run `/nogrep:init` first.

## Step 2: Identify changed files

Run git diff to find recently changed files:

```bash
git diff origin/main --name-only 2>/dev/null || git diff HEAD~10 --name-only 2>/dev/null || echo "NO_GIT"
```

If no git is available, tell the user you'll re-analyze all stale nodes based on hash mismatch.

## Step 3: Map changes to affected nodes

Read `.nogrep/_registry.json` to map changed files to their context nodes.

For each stale node from Step 1:
1. Read the existing context file to extract `## Manual Notes` content
2. Read the source files listed in the node's `src_paths` frontmatter
3. Use the trimming script to get signatures:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/trim.js" <source_file_paths>
```

## Step 4: Re-analyze each affected cluster

For each stale node, analyze the trimmed source and generate an updated context node.

Read `.nogrep/_taxonomy.json` for allowed tag values.

Return JSON only, no prose, no markdown fences:

```
{
  "purpose": "2-3 sentences MAX. Business intent, not technical description.",
  "public_surface": ["list of exported functions/routes/events other domains use"],
  "does_not_own": ["what this module delegates elsewhere, with → target domain"],
  "external_deps": [{"name": "lib", "usage": "what it's used for"}],
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
```

Rules:
- purpose: max 3 sentences
- gotchas: max 5 items
- keywords: 5-15 items
- tags: use taxonomy values only, never invent new tag values
- does_not_own: include explicit redirections ("email delivery → notifications")

## Step 5: Write updates

Combine all updated node results with any unchanged nodes. Pipe the full set as JSON to the writer:

```bash
echo '<json_input>' | node "${CLAUDE_PLUGIN_ROOT}/scripts/write.js" --root .
```

The writer automatically preserves `## Manual Notes` sections from existing files.

## Step 6: Confirm

Tell the user which nodes were updated and suggest reviewing the changes:

> Updated N nogrep context nodes. Run `git diff .nogrep/` to review changes.
