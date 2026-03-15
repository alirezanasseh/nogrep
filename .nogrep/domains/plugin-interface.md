---
id: plugin-interface
title: Plugin Interface
category: domain
tags:
  domain:
    - plugin
  layer:
    - presentation
  tech: []
  concern: []
  type:
    - config
    - integration
relates_to:
  - id: indexing-pipeline
    reason: init/update/status commands invoke signals, write, and validate scripts
  - id: analysis-engine
    reason: query command invokes the query script; init/update use trim
inverse_relations: []
src_paths:
  - plugins/nogrep/commands/*.md
  - scripts/settings.ts
keywords:
  - plugin
  - command
  - init
  - update
  - query
  - status
  - "on"
  - "off"
  - settings
  - enabled
  - slash-command
  - settings-json
  - settings-local
last_synced:
  commit: ""
  timestamp: "2026-03-15T00:00:00Z"
  src_hash: sha256:c613affd9e33
---

## Purpose
Defines the Claude Code plugin structure with six slash commands (init, update, query, status, on, off) and manages the enabled/disabled state via .claude/settings.json files.

## Public Surface

```
/nogrep:init — 4-phase pipeline: signals → detect stack → analyze clusters → write index
/nogrep:update — refresh stale context nodes
/nogrep:query — answer questions using the index
/nogrep:status — validate index freshness
/nogrep:on — enable nogrep
/nogrep:off — disable nogrep
readSettings(projectRoot): Promise<NogrepSettings>
writeSettings(projectRoot, settings, local?): Promise<void>
```

## Does Not Own
- AI analysis (stack detection, cluster analysis) → performed by Claude inline
- index building → indexing-pipeline

## Gotchas
- Settings are split: .claude/settings.json (shared/committed) vs .claude/settings.local.json (personal/gitignored)
- Command prompts are markdown files with embedded bash — they orchestrate scripts, not implement logic
- The init command is a 7-step pipeline where Steps 2-4 are Claude AI analysis, not script execution

## Manual Notes
_Human annotations. Never overwritten by nogrep update._
