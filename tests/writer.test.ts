import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import matter from 'gray-matter'
import { writeContextNodes, buildIndex, buildRegistry, patchClaudeMd } from '../scripts/write.js'
import type { NodeResult, StackResult } from '../scripts/types.js'

function makeNode(overrides: Partial<NodeResult> = {}): NodeResult {
  return {
    id: 'billing',
    title: 'Billing & Payments',
    category: 'domain',
    tags: {
      domain: ['billing'],
      layer: ['business', 'data'],
      tech: ['stripe', 'postgres'],
      concern: ['error-handling', 'idempotency'],
      type: ['module'],
    },
    relatesTo: [{ id: 'notifications', reason: 'triggers invoice emails' }],
    inverseRelations: [],
    srcPaths: ['src/billing/**'],
    keywords: ['stripe', 'webhook', 'invoice', 'retry'],
    lastSynced: {
      commit: 'abc1234',
      timestamp: '2025-03-13T10:00:00Z',
      srcHash: 'sha256:ef9a3c',
    },
    purpose: 'Handles all payment processing and subscription management via Stripe.',
    publicSurface: [
      'POST /billing/webhook',
      'BillingService.createSubscription(userId, planId)',
    ],
    doesNotOwn: ['Email delivery → notifications', 'User identity → auth'],
    externalDeps: [{ name: 'stripe', usage: 'payment processing' }],
    gotchas: [
      'Webhook handler must be idempotent — check event.id before processing',
      'All monetary values in cents (integer), never floats',
    ],
    ...overrides,
  }
}

const testStack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'> = {
  primaryLanguage: 'typescript',
  frameworks: ['nestjs'],
  architecture: 'monolith',
}

describe('writeContextNodes', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nogrep-writer-'))
  })

  it('should write a domain node to domains/ subdirectory', async () => {
    const node = makeNode()
    await writeContextNodes([node], tmpDir)

    const filePath = join(tmpDir, 'domains', 'billing.md')
    const content = await readFile(filePath, 'utf-8')
    const parsed = matter(content)

    expect(parsed.data.id).toBe('billing')
    expect(parsed.data.title).toBe('Billing & Payments')
    expect(parsed.data.category).toBe('domain')
    expect(parsed.data.tags.domain).toEqual(['billing'])
    expect(parsed.data.tags.tech).toEqual(['stripe', 'postgres'])
    expect(parsed.data.src_paths).toEqual(['src/billing/**'])
    expect(parsed.data.keywords).toEqual(['stripe', 'webhook', 'invoice', 'retry'])
    expect(parsed.data.relates_to).toEqual([{ id: 'notifications', reason: 'triggers invoice emails' }])
    expect(parsed.data.last_synced.commit).toBe('abc1234')
    expect(parsed.data.last_synced.src_hash).toBe('sha256:ef9a3c')
  })

  it('should write correct markdown body sections', async () => {
    const node = makeNode()
    await writeContextNodes([node], tmpDir)

    const content = await readFile(join(tmpDir, 'domains', 'billing.md'), 'utf-8')

    expect(content).toContain('## Purpose')
    expect(content).toContain('Handles all payment processing')
    expect(content).toContain('## Public Surface')
    expect(content).toContain('POST /billing/webhook')
    expect(content).toContain('## Does Not Own')
    expect(content).toContain('- Email delivery → notifications')
    expect(content).toContain('## Gotchas')
    expect(content).toContain('- Webhook handler must be idempotent')
    expect(content).toContain('## Manual Notes')
    expect(content).toContain('Never overwritten by nogrep update')
  })

  it('should write architecture nodes to architecture/ subdirectory', async () => {
    const node = makeNode({ id: 'database', category: 'architecture', title: 'Database' })
    await writeContextNodes([node], tmpDir)

    const content = await readFile(join(tmpDir, 'architecture', 'database.md'), 'utf-8')
    const parsed = matter(content)
    expect(parsed.data.id).toBe('database')
    expect(parsed.data.category).toBe('architecture')
  })

  it('should write flow nodes to flows/ subdirectory', async () => {
    const node = makeNode({ id: 'checkout', category: 'flow', title: 'Checkout Flow' })
    await writeContextNodes([node], tmpDir)

    const content = await readFile(join(tmpDir, 'flows', 'checkout.md'), 'utf-8')
    const parsed = matter(content)
    expect(parsed.data.id).toBe('checkout')
    expect(parsed.data.category).toBe('flow')
  })

  it('should write entity nodes to entities/ subdirectory', async () => {
    const node = makeNode({ id: 'user', category: 'entity', title: 'User' })
    await writeContextNodes([node], tmpDir)

    const content = await readFile(join(tmpDir, 'entities', 'user.md'), 'utf-8')
    const parsed = matter(content)
    expect(parsed.data.id).toBe('user')
  })

  it('should preserve existing Manual Notes on re-write', async () => {
    const node = makeNode()

    // Write once
    await writeContextNodes([node], tmpDir)

    // Add manual notes to the file
    const filePath = join(tmpDir, 'domains', 'billing.md')
    let content = await readFile(filePath, 'utf-8')
    content = content.replace(
      '_Human annotations. Never overwritten by nogrep update._',
      'This module was refactored in Q2 2025 by @alice.',
    )
    await writeFile(filePath, content, 'utf-8')

    // Re-write with updated node
    const updatedNode = makeNode({ purpose: 'Updated purpose statement.' })
    await writeContextNodes([updatedNode], tmpDir)

    const updatedContent = await readFile(filePath, 'utf-8')
    expect(updatedContent).toContain('Updated purpose statement.')
    expect(updatedContent).toContain('This module was refactored in Q2 2025 by @alice.')
  })

  it('should handle nodes with empty arrays gracefully', async () => {
    const node = makeNode({
      publicSurface: [],
      doesNotOwn: [],
      gotchas: [],
      relatesTo: [],
    })
    await writeContextNodes([node], tmpDir)

    const content = await readFile(join(tmpDir, 'domains', 'billing.md'), 'utf-8')
    expect(content).toContain('## Purpose')
    expect(content).toContain('## Manual Notes')
    // Empty sections should not be present
    expect(content).not.toContain('## Public Surface')
    expect(content).not.toContain('## Does Not Own')
    expect(content).not.toContain('## Gotchas')
  })
})

describe('buildIndex', () => {
  it('should build tag index from nodes', () => {
    const billing = makeNode()
    const auth = makeNode({
      id: 'auth',
      title: 'Authentication',
      tags: {
        domain: ['auth'],
        layer: ['business'],
        tech: ['redis', 'jwt'],
        concern: ['security'],
        type: ['module'],
      },
      srcPaths: ['src/auth/**'],
      keywords: ['jwt', 'login', 'session'],
    })

    const index = buildIndex([billing, auth], testStack)

    expect(index.version).toBe('1.0')
    expect(index.stack.primaryLanguage).toBe('typescript')
    expect(index.stack.frameworks).toEqual(['nestjs'])

    // Tag index
    expect(index.tags['domain:billing']).toContain('.nogrep/domains/billing.md')
    expect(index.tags['domain:auth']).toContain('.nogrep/domains/auth.md')
    expect(index.tags['tech:stripe']).toContain('.nogrep/domains/billing.md')
    expect(index.tags['tech:redis']).toContain('.nogrep/domains/auth.md')

    // Keyword index
    expect(index.keywords['stripe']).toContain('.nogrep/domains/billing.md')
    expect(index.keywords['jwt']).toContain('.nogrep/domains/auth.md')

    // Path index
    expect(index.paths['src/billing/**']).toEqual({
      context: '.nogrep/domains/billing.md',
      tags: expect.arrayContaining(['domain:billing', 'tech:stripe']),
    })
  })

  it('should populate inverse relations', () => {
    const billing = makeNode({
      relatesTo: [{ id: 'notifications', reason: 'sends invoice emails' }],
    })
    const notifications = makeNode({
      id: 'notifications',
      title: 'Notifications',
      relatesTo: [],
      inverseRelations: [],
    })

    buildIndex([billing, notifications], testStack)

    // notifications should now have inverse relation from billing
    expect(notifications.inverseRelations).toContainEqual({
      id: 'billing',
      reason: 'sends invoice emails',
    })
  })

  it('should not duplicate inverse relations', () => {
    const billing = makeNode({
      relatesTo: [{ id: 'notifications', reason: 'sends emails' }],
    })
    const notifications = makeNode({
      id: 'notifications',
      inverseRelations: [{ id: 'billing', reason: 'sends emails' }],
    })

    buildIndex([billing, notifications], testStack)

    const billingInverse = notifications.inverseRelations.filter(r => r.id === 'billing')
    expect(billingInverse).toHaveLength(1)
  })

  it('should have generatedAt timestamp', () => {
    const index = buildIndex([makeNode()], testStack)
    expect(index.generatedAt).toBeTruthy()
    // Should be a valid ISO date
    expect(() => new Date(index.generatedAt)).not.toThrow()
  })
})

describe('buildRegistry', () => {
  it('should create mappings from node src_paths', () => {
    const billing = makeNode({ srcPaths: ['src/billing/**'] })
    const auth = makeNode({
      id: 'auth',
      category: 'domain',
      srcPaths: ['src/auth/**', 'src/guards/**'],
    })

    const registry = buildRegistry([billing, auth])

    expect(registry.mappings).toHaveLength(3)
    expect(registry.mappings).toContainEqual({
      glob: 'src/billing/**',
      contextFile: '.nogrep/domains/billing.md',
      watch: true,
    })
    expect(registry.mappings).toContainEqual({
      glob: 'src/auth/**',
      contextFile: '.nogrep/domains/auth.md',
      watch: true,
    })
    expect(registry.mappings).toContainEqual({
      glob: 'src/guards/**',
      contextFile: '.nogrep/domains/auth.md',
      watch: true,
    })
  })

  it('should use correct category directory for flows', () => {
    const flow = makeNode({ id: 'checkout', category: 'flow', srcPaths: ['src/checkout/**'] })
    const registry = buildRegistry([flow])

    expect(registry.mappings[0]!.contextFile).toBe('.nogrep/flows/checkout.md')
  })
})

describe('patchClaudeMd', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nogrep-claude-'))
  })

  it('should create CLAUDE.md if it does not exist', async () => {
    await patchClaudeMd(tmpDir)

    const content = await readFile(join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('<!-- nogrep -->')
    expect(content).toContain('## Code Navigation')
    expect(content).toContain('<!-- /nogrep -->')
  })

  it('should append to existing CLAUDE.md', async () => {
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# My Project\n\nSome content.\n', 'utf-8')

    await patchClaudeMd(tmpDir)

    const content = await readFile(join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('# My Project')
    expect(content).toContain('Some content.')
    expect(content).toContain('<!-- nogrep -->')
  })

  it('should not duplicate patch if marker already exists', async () => {
    await writeFile(
      join(tmpDir, 'CLAUDE.md'),
      '# Project\n\n<!-- nogrep -->\n## Code Navigation\n<!-- /nogrep -->\n',
      'utf-8',
    )

    await patchClaudeMd(tmpDir)

    const content = await readFile(join(tmpDir, 'CLAUDE.md'), 'utf-8')
    const markerCount = (content.match(/<!-- nogrep -->/g) ?? []).length
    expect(markerCount).toBe(1)
  })
})
