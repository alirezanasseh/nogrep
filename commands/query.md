---
allowed-tools: Bash(node *)
---

Run the nogrep query system to find relevant context files for the given question.

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/query.js" --question "$ARGUMENTS" --format summary --limit 5
```

If results are returned, read the top context files to understand the relevant parts of the codebase before exploring source code directly.

If no results are found, let the user know and suggest they run `/nogrep:init` if the index hasn't been created yet.
