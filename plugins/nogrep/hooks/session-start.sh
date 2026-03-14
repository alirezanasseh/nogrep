#!/bin/bash
ENABLED=$(cat .claude/settings.json 2>/dev/null | jq -r '.nogrep.enabled // false')
LOCAL_ENABLED=$(cat .claude/settings.local.json 2>/dev/null | jq -r '.nogrep.enabled // empty')
[ -n "$LOCAL_ENABLED" ] && ENABLED="$LOCAL_ENABLED"
[ "$ENABLED" != "true" ] && exit 0

if [ ! -f ".nogrep/_index.json" ]; then
  jq -n '{ additionalContext: "nogrep is enabled but no index found. Run `/nogrep:init` to generate the codebase index before starting work." }'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")/../dist" && pwd)"
STALE=$(node "$SCRIPT_DIR/validate.js" --format json 2>/dev/null | jq -r '.stale[]?.file' | head -3)

if [ -n "$STALE" ]; then
  jq -n \
    --arg s "$STALE" \
    '{ additionalContext: ("nogrep index may be stale. Consider running `/nogrep:update` before starting.\nStale nodes:\n" + $s) }'
fi

exit 0
