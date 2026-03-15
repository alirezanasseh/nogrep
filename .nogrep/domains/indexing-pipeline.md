---
id: indexing-pipeline
title: Indexing Pipeline
category: domain
tags:
  domain:
    - indexing
  layer:
    - data
    - infrastructure
  tech:
    - glob
    - gray-matter
    - js-yaml
  concern:
    - validation
  type:
    - module
relates_to:
  - id: analysis-engine
    reason: trim produces concise source for index generation; query reads the built index
  - id: plugin-interface
    reason: init and update commands orchestrate the indexing pipeline
inverse_relations: []
src_paths:
  - scripts/signals.ts
  - scripts/write.ts
  - scripts/validate.ts
  - scripts/types.ts
keywords:
  - signals
  - write
  - validate
  - index
  - registry
  - context-node
  - frontmatter
  - SHA256
  - hash
  - freshness
  - stale
  - gray-matter
  - yaml
  - markdown
  - directory-tree
  - manifest
  - git-churn
  - entry-point
last_synced:
  commit: ""
  timestamp: "2026-03-15T00:00:00Z"
  src_hash: sha256:1ac67bde5e77
---

## Purpose
Collects project metadata (directory tree, manifests, git churn, file extensions), writes context node markdown files with YAML frontmatter, builds reverse indexes, and validates index freshness by comparing source file SHA256 hashes.

## Public Surface

```
collectSignals(root: string, options?): Promise<SignalResult>
writeContextNodes(nodes, outputDir): Promise<void>
buildIndex(nodes, stack): IndexJson
buildRegistry(nodes): RegistryJson
checkFreshness(nodeFile, projectRoot): Promise<StaleResult>
validateAll(projectRoot): Promise<{total, fresh, stale}>
```

## Does Not Own
- source trimming → analysis-engine
- query resolution → analysis-engine
- user-facing commands → plugin-interface

## Gotchas
- All CLI scripts output JSON to stdout and errors as JSON to stderr
- The ## Manual Notes section in context nodes is preserved across updates
- validate.ts computes SHA256 of concatenated source file contents — file order matters (sorted)
- write.ts populates inverseRelations automatically from relatesTo
- tsconfig uses noUncheckedIndexedAccess — all indexed access needs null checks

## Manual Notes
_Human annotations. Never overwritten by nogrep update._
