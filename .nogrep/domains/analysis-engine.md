---
id: analysis-engine
title: Analysis Engine
category: domain
tags:
  domain:
    - analysis
  layer:
    - business
  tech: []
  concern:
    - performance
  type:
    - module
relates_to:
  - id: indexing-pipeline
    reason: trim output feeds index generation; query reads _index.json and _taxonomy.json
inverse_relations: []
src_paths:
  - scripts/trim.ts
  - scripts/query.ts
keywords:
  - trim
  - query
  - search
  - score
  - tag
  - keyword
  - taxonomy
  - signature
  - function-body
  - partial-match
  - ranked-result
  - extract-terms
  - stop-words
last_synced:
  commit: ""
  timestamp: "2026-03-15T00:00:00Z"
  src_hash: sha256:508272afb380
---

## Purpose
Provides language-aware source trimming that strips function bodies while keeping signatures/imports/types, and a query engine that extracts tags and keywords from natural language questions to score and rank context files.

## Public Surface

```
trimCluster(paths: string[], projectRoot: string): Promise<string>
extractTerms(question: string, taxonomy: Taxonomy): {tags, keywords}
resolveQuery(terms, index, limit?): RankedResult[]
```

## Does Not Own
- context file writing → indexing-pipeline
- signal collection → indexing-pipeline

## Gotchas
- trim.ts supports TS/JS, Python, Java/Kotlin/Go/Rust/C#/Swift/Dart — each has a dedicated trimmer function
- MAX_CLUSTER_LINES = 300 — trimmed output is capped per cluster
- Query scoring: tags get +2, keywords get +1 with partial matching
- query.ts reads _taxonomy.json to know valid tag values for extraction
- extractTerms filters common stop words and checks multi-word tag matches (e.g. 'error handling' → 'error-handling')

## Manual Notes
_Human annotations. Never overwritten by nogrep update._
