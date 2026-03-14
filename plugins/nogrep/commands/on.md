Enable nogrep for this project.

Run this command to enable nogrep:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/settings.js" --set enabled=true
```

Then check if the nogrep index exists:

```bash
test -f .nogrep/_index.json && echo "INDEX_EXISTS" || echo "INDEX_MISSING"
```

If the index is missing, tell the user:

> nogrep is now enabled, but no index exists yet. Run `/nogrep:init` to generate the codebase index.

If the index exists, tell the user:

> nogrep is now enabled. Context will be injected automatically.
