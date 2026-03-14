Show the current status of the nogrep index.

Run the validation script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/validate.js" --format text
```

If the command fails, tell the user:

> No nogrep index found. Run `/nogrep:init` to generate the codebase index.

If it succeeds, display the output to the user. If there are stale nodes, suggest:

> Run `/nogrep:update` to refresh stale nodes.
