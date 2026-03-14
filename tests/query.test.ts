import { describe, it, expect } from 'vitest'
import { extractTerms, resolveQuery } from '../scripts/query.js'
import type { IndexJson, Taxonomy } from '../scripts/types.js'

const testTaxonomy: Taxonomy = {
  static: {
    layer: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
    concern: ['security', 'performance', 'caching', 'validation', 'error-handling', 'idempotency', 'observability'],
    type: ['module', 'flow', 'entity', 'integration', 'config', 'ui', 'test'],
  },
  dynamic: {
    domain: ['billing', 'auth', 'users'],
    tech: ['stripe', 'redis', 'postgres'],
  },
  custom: {},
}

const testIndex: IndexJson = {
  version: '1.0',
  generatedAt: '2025-03-13T10:00:00Z',
  commit: 'abc1234',
  stack: {
    primaryLanguage: 'typescript',
    frameworks: ['nestjs'],
    architecture: 'monolith',
  },
  tags: {
    'domain:billing': [
      '.nogrep/domains/billing.md',
      '.nogrep/flows/checkout.md',
    ],
    'domain:auth': ['.nogrep/domains/auth.md'],
    'tech:stripe': ['.nogrep/domains/billing.md'],
    'tech:redis': ['.nogrep/domains/auth.md'],
    'concern:security': ['.nogrep/domains/auth.md'],
    'concern:error-handling': [
      '.nogrep/domains/billing.md',
      '.nogrep/architecture/api-design.md',
    ],
    'concern:idempotency': ['.nogrep/domains/billing.md'],
    'layer:business': [
      '.nogrep/domains/billing.md',
      '.nogrep/domains/auth.md',
    ],
  },
  keywords: {
    webhook: ['.nogrep/domains/billing.md'],
    invoice: ['.nogrep/domains/billing.md'],
    retry: [
      '.nogrep/domains/billing.md',
      '.nogrep/architecture/api-design.md',
    ],
    jwt: ['.nogrep/domains/auth.md'],
    token: ['.nogrep/domains/auth.md'],
    payment: ['.nogrep/domains/billing.md', '.nogrep/flows/checkout.md'],
    checkout: ['.nogrep/flows/checkout.md'],
  },
  paths: {
    'src/billing/**': {
      context: '.nogrep/domains/billing.md',
      tags: ['domain:billing', 'tech:stripe', 'layer:business'],
    },
    'src/auth/**': {
      context: '.nogrep/domains/auth.md',
      tags: ['domain:auth', 'concern:security', 'tech:redis'],
    },
  },
}

describe('extractTerms', () => {
  it('should extract domain tags from question', () => {
    const result = extractTerms('how does billing work?', testTaxonomy)
    expect(result.tags).toContain('domain:billing')
  })

  it('should extract tech tags from question', () => {
    const result = extractTerms('how does stripe handle webhooks?', testTaxonomy)
    expect(result.tags).toContain('tech:stripe')
    expect(result.keywords).toContain('webhooks')
  })

  it('should extract concern tags from question', () => {
    const result = extractTerms('where is the security middleware?', testTaxonomy)
    expect(result.tags).toContain('concern:security')
  })

  it('should extract hyphenated concern tags', () => {
    const result = extractTerms('how does error handling work?', testTaxonomy)
    expect(result.tags).toContain('concern:error-handling')
  })

  it('should filter stop words from keywords', () => {
    const result = extractTerms('how does the payment work?', testTaxonomy)
    expect(result.keywords).not.toContain('how')
    expect(result.keywords).not.toContain('does')
    expect(result.keywords).not.toContain('the')
    expect(result.keywords).toContain('payment')
  })

  it('should extract multiple tags and keywords', () => {
    const result = extractTerms(
      'how does stripe billing handle webhook retry?',
      testTaxonomy,
    )
    expect(result.tags).toContain('tech:stripe')
    expect(result.tags).toContain('domain:billing')
    expect(result.keywords).toContain('webhook')
    expect(result.keywords).toContain('retry')
  })

  it('should handle empty question', () => {
    const result = extractTerms('', testTaxonomy)
    expect(result.tags).toEqual([])
    expect(result.keywords).toEqual([])
  })

  it('should handle question with only stop words', () => {
    const result = extractTerms('how does it work?', testTaxonomy)
    expect(result.tags).toEqual([])
    expect(result.keywords).toEqual([])
  })

  it('should not duplicate tags', () => {
    const result = extractTerms('billing billing billing', testTaxonomy)
    const billingTags = result.tags.filter(t => t === 'domain:billing')
    expect(billingTags).toHaveLength(1)
  })
})

describe('resolve', () => {
  it('should return results scored by tag matches (+2 each)', () => {
    const results = resolveQuery(
      { tags: ['domain:billing'], keywords: [] },
      testIndex,
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.contextFile).toBe('.nogrep/domains/billing.md')
    expect(results[0]!.score).toBe(2)
  })

  it('should return results scored by keyword matches (+1 each)', () => {
    const results = resolveQuery(
      { tags: [], keywords: ['webhook'] },
      testIndex,
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.contextFile).toBe('.nogrep/domains/billing.md')
    expect(results[0]!.score).toBe(1)
  })

  it('should combine tag and keyword scores', () => {
    const results = resolveQuery(
      { tags: ['domain:billing'], keywords: ['webhook'] },
      testIndex,
    )
    const billing = results.find(r => r.contextFile === '.nogrep/domains/billing.md')
    expect(billing).toBeDefined()
    // +2 for tag match + +1 for keyword match = 3
    expect(billing!.score).toBe(3)
  })

  it('should rank by score descending', () => {
    const results = resolveQuery(
      { tags: ['domain:billing', 'concern:error-handling'], keywords: ['retry'] },
      testIndex,
    )
    expect(results.length).toBeGreaterThan(1)
    // billing.md should have highest score: 2 (domain:billing) + 2 (concern:error-handling) + 1 (retry)
    expect(results[0]!.contextFile).toBe('.nogrep/domains/billing.md')
    expect(results[0]!.score).toBe(5)
  })

  it('should respect the limit parameter', () => {
    const results = resolveQuery(
      { tags: ['layer:business'], keywords: ['payment'] },
      testIndex,
      1,
    )
    expect(results).toHaveLength(1)
  })

  it('should return empty array when no matches', () => {
    const results = resolveQuery(
      { tags: ['domain:unknown'], keywords: ['nonexistent'] },
      testIndex,
    )
    expect(results).toEqual([])
  })

  it('should include matchedOn information', () => {
    const results = resolveQuery(
      { tags: ['tech:stripe'], keywords: ['webhook'] },
      testIndex,
    )
    const billing = results.find(r => r.contextFile === '.nogrep/domains/billing.md')
    expect(billing).toBeDefined()
    expect(billing!.matchedOn).toContain('tag:tech:stripe')
    expect(billing!.matchedOn).toContain('keyword:webhook')
  })

  it('should handle partial keyword matches', () => {
    const results = resolveQuery(
      { tags: [], keywords: ['pay'] },
      testIndex,
    )
    // "pay" is a substring of "payment" — should still match
    expect(results.length).toBeGreaterThan(0)
  })

  it('should produce a summary string', () => {
    const results = resolveQuery(
      { tags: ['domain:billing'], keywords: [] },
      testIndex,
    )
    expect(results[0]!.summary).toBeTruthy()
    expect(results[0]!.summary).toContain('Matched:')
  })
})

describe('extractTerms + resolve integration', () => {
  it('should find billing context for "how does stripe work"', () => {
    const terms = extractTerms('how does stripe work', testTaxonomy)
    const results = resolveQuery(terms, testIndex)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.contextFile).toBe('.nogrep/domains/billing.md')
  })

  it('should find auth context for "jwt token security"', () => {
    const terms = extractTerms('jwt token security', testTaxonomy)
    const results = resolveQuery(terms, testIndex)
    const authResult = results.find(r => r.contextFile === '.nogrep/domains/auth.md')
    expect(authResult).toBeDefined()
  })

  it('should find billing for "payment retry after failed webhook"', () => {
    const terms = extractTerms(
      'how does payment retry work after a failed webhook?',
      testTaxonomy,
    )
    const results = resolveQuery(terms, testIndex)
    expect(results[0]!.contextFile).toBe('.nogrep/domains/billing.md')
  })

  it('should find checkout flow for "checkout payment"', () => {
    const terms = extractTerms('checkout payment flow', testTaxonomy)
    const results = resolveQuery(terms, testIndex)
    const checkoutResult = results.find(r => r.contextFile === '.nogrep/flows/checkout.md')
    expect(checkoutResult).toBeDefined()
  })
})
