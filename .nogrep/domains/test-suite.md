---
id: test-suite
title: Test Suite
category: domain
tags:
  domain:
    - testing
  layer:
    - cross-cutting
  tech:
    - vitest
  concern:
    - validation
  type:
    - test
relates_to:
  - id: indexing-pipeline
    reason: tests for signals, writer, and validate modules
  - id: analysis-engine
    reason: tests for trim and query modules
inverse_relations: []
src_paths:
  - tests/**
keywords:
  - test
  - vitest
  - fixture
  - integration
  - init-pipeline
  - django-project
  - nestjs-project
  - react-project
last_synced:
  commit: ""
  timestamp: "2026-03-15T00:00:00Z"
  src_hash: ""
---

## Purpose
Comprehensive test coverage using vitest with test fixtures for Django, NestJS, and React projects. Includes unit tests for each script module and an integration test for the full init pipeline.

## Gotchas
- Test fixtures in tests/fixtures/ simulate real project structures (Django, NestJS, React)
- init.test.ts is an integration test that simulates the full pipeline with hand-crafted analysis results
- Tests use temp directories (mkdtemp) — cleanup via afterAll/afterEach

## Manual Notes
_Human annotations. Never overwritten by nogrep update._
