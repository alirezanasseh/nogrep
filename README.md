# nogrep

A Claude Code plugin that gives AI agents a navigable index of any codebase, so they stop doing blind `grep`/`find` exploration.

## What it does

`nogrep` generates a structured `.nogrep/` directory with a reverse index and thin context nodes (markdown files). When Claude Code needs to find something, it reads 2 files instead of running 20 grep commands.

## Install

```bash
claude plugin add github:alirezanasseh/nogrep
```

Or install from a local clone:

```bash
git clone https://github.com/alirezanasseh/nogrep.git
cd nogrep && npm install && npm run build
claude plugin add /path/to/nogrep
```

## Quick start

1. Open your project in Claude Code
2. Run `/nogrep:init` — Claude analyzes your codebase and generates the index
3. That's it. Hooks automatically inject context when Claude searches your code

## How it works

```
Phase 1: Collect signals    (scripts — file tree, deps, git churn, entry points)
Phase 2: Detect stack       (Claude — language, frameworks, domain clusters)
Phase 3: Analyze clusters   (Claude — per-domain context nodes from trimmed source)
Phase 4: Write index        (scripts — .nogrep/ files, _index.json, CLAUDE.md patch)
```

Scripts handle data collection and file I/O. Claude does all the analysis work directly during the session — no API keys needed.

## Commands

| Command | Description |
|---------|-------------|
| `/nogrep:init` | Generate the full codebase index |
| `/nogrep:update` | Incrementally update stale nodes |
| `/nogrep:query <question>` | Manual index lookup |
| `/nogrep:status` | Show index health and freshness |
| `/nogrep:on` | Enable nogrep |
| `/nogrep:off` | Disable nogrep |

## Hooks

nogrep installs three Claude Code hooks:

- **PreToolUse** — intercepts `grep`/`find`/`rg` commands and injects relevant context files
- **UserPromptSubmit** — injects context for code navigation prompts
- **SessionStart** — checks index freshness and warns if stale

## Output structure

```
.nogrep/
├── _index.json        # reverse index (tags → files, keywords → files, paths → context)
├── _registry.json     # source path → context file mapping
├── _taxonomy.json     # allowed tags for this project
├── domains/           # one file per business domain
├── architecture/      # cross-domain architectural concerns
├── flows/             # multi-domain business flows
└── entities/          # data models
```

Each context node is a thin markdown file with YAML frontmatter — purpose, public surface, gotchas, and tags. Nodes include a `## Manual Notes` section that is never overwritten by updates.

## Settings

nogrep stores its enabled state in your project's `.claude/` directory:

- `.claude/settings.json` — team settings (commit to repo)
- `.claude/settings.local.json` — personal overrides (gitignored)

## Requirements

- Node.js 20+
- Claude Code

## License

MIT
