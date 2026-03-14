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

SCRIPT_DIR="$(cd "$(dirname "$0")/../dist" && pwd)"
RESULT=$(node "$SCRIPT_DIR/query.js" --question "$PROMPT" --format summary --limit 3 2>/dev/null)

if [ -n "$RESULT" ]; then
  jq -n \
    --arg ctx "IMPORTANT — nogrep codebase index matched these context files for your question:\n\n$RESULT\n\nYou MUST read these .nogrep/ context files FIRST using the Read tool before doing any exploration, searching, or grepping. These files contain curated domain maps with file paths, public API surfaces, and relationships that directly answer navigation questions. Do NOT use the Explore/Agent tool or broad file searches when nogrep context files are available — read them and use the paths listed inside." \
    '{ additionalContext: $ctx }'
fi

exit 0
