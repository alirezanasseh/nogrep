import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { checkFreshness, validateAll } from '../scripts/validate.js'

function computeHash(content: string): string {
  const hash = createHash('sha256')
  hash.update(content)
  return `sha256:${hash.digest('hex').slice(0, 12)}`
}

async function setupProject(tmpDir: string): Promise<void> {
  // Create .nogrep directory structure
  await mkdir(join(tmpDir, '.nogrep', 'domains'), { recursive: true })
  await mkdir(join(tmpDir, '.nogrep', 'architecture'), { recursive: true })

  // Create source files
  await mkdir(join(tmpDir, 'src', 'billing'), { recursive: true })
  await writeFile(
    join(tmpDir, 'src', 'billing', 'service.ts'),
    'export class BillingService { charge() {} }',
    'utf-8',
  )

  // Compute correct hash for the source file
  const srcContent = await readFile(join(tmpDir, 'src', 'billing', 'service.ts'))
  const hash = createHash('sha256')
  hash.update(srcContent)
  const srcHash = `sha256:${hash.digest('hex').slice(0, 12)}`

  // Create _index.json
  await writeFile(
    join(tmpDir, '.nogrep', '_index.json'),
    JSON.stringify({ version: '1.0', tags: {}, keywords: {}, paths: {} }),
    'utf-8',
  )

  // Create a fresh context node
  await writeFile(
    join(tmpDir, '.nogrep', 'domains', 'billing.md'),
    [
      '---',
      'id: billing',
      'title: Billing',
      'category: domain',
      'src_paths:',
      '  - src/billing/**',
      'last_synced:',
      `  src_hash: "${srcHash}"`,
      '  commit: abc1234',
      '  timestamp: "2025-03-13T10:00:00Z"',
      '---',
      '',
      '## Purpose',
      'Handles billing.',
      '',
      '## Manual Notes',
      'Some manual notes here.',
    ].join('\n'),
    'utf-8',
  )
}

describe('checkFreshness', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nogrep-validate-'))
    await setupProject(tmpDir)
  })

  it('should report fresh when hash matches', async () => {
    const result = await checkFreshness('.nogrep/domains/billing.md', tmpDir)
    expect(result.isStale).toBe(false)
    expect(result.file).toBe('.nogrep/domains/billing.md')
  })

  it('should report stale when source file changes', async () => {
    // Modify a source file
    await writeFile(
      join(tmpDir, 'src', 'billing', 'service.ts'),
      'export class BillingService { charge() {} refund() {} }',
      'utf-8',
    )

    const result = await checkFreshness('.nogrep/domains/billing.md', tmpDir)
    expect(result.isStale).toBe(true)
    expect(result.reason).toContain('hash mismatch')
  })

  it('should report stale when context file is missing', async () => {
    const result = await checkFreshness('.nogrep/domains/nonexistent.md', tmpDir)
    expect(result.isStale).toBe(true)
    expect(result.reason).toBe('context file not found')
  })

  it('should report stale when src_hash is missing from frontmatter', async () => {
    await writeFile(
      join(tmpDir, '.nogrep', 'domains', 'billing.md'),
      [
        '---',
        'id: billing',
        'src_paths:',
        '  - src/billing/**',
        'last_synced:',
        '  commit: abc1234',
        '---',
        '',
        '## Purpose',
        'Handles billing.',
      ].join('\n'),
      'utf-8',
    )

    const result = await checkFreshness('.nogrep/domains/billing.md', tmpDir)
    expect(result.isStale).toBe(true)
    expect(result.reason).toBe('no src_hash in frontmatter')
  })

  it('should report stale when no source files match', async () => {
    await writeFile(
      join(tmpDir, '.nogrep', 'domains', 'billing.md'),
      [
        '---',
        'id: billing',
        'src_paths:',
        '  - src/nonexistent/**',
        'last_synced:',
        '  src_hash: "sha256:abc123"',
        '---',
        '',
        '## Purpose',
        'Handles billing.',
      ].join('\n'),
      'utf-8',
    )

    const result = await checkFreshness('.nogrep/domains/billing.md', tmpDir)
    expect(result.isStale).toBe(true)
    expect(result.reason).toBe('no source files match src_paths')
  })

  it('should report fresh when src_paths is empty', async () => {
    await writeFile(
      join(tmpDir, '.nogrep', 'domains', 'billing.md'),
      [
        '---',
        'id: billing',
        'src_paths: []',
        'last_synced:',
        '  src_hash: "sha256:anything"',
        '---',
        '',
        '## Purpose',
        'Handles billing.',
      ].join('\n'),
      'utf-8',
    )

    const result = await checkFreshness('.nogrep/domains/billing.md', tmpDir)
    expect(result.isStale).toBe(false)
  })

  it('should handle multiple source files in hash computation', async () => {
    // Add a second source file
    await writeFile(
      join(tmpDir, 'src', 'billing', 'controller.ts'),
      'export class BillingController {}',
      'utf-8',
    )

    // The hash should now be different (includes both files)
    const result = await checkFreshness('.nogrep/domains/billing.md', tmpDir)
    expect(result.isStale).toBe(true)
    expect(result.reason).toContain('hash mismatch')
  })
})

describe('validateAll', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nogrep-validate-all-'))
    await setupProject(tmpDir)
  })

  it('should discover and validate all nodes', async () => {
    const result = await validateAll(tmpDir)
    expect(result.total).toBe(1)
    expect(result.fresh).toHaveLength(1)
    expect(result.stale).toHaveLength(0)
  })

  it('should separate fresh and stale nodes', async () => {
    // Add a stale architecture node
    await writeFile(
      join(tmpDir, '.nogrep', 'architecture', 'database.md'),
      [
        '---',
        'id: database',
        'src_paths:',
        '  - src/database/**',
        'last_synced:',
        '  src_hash: "sha256:oldoldhash"',
        '---',
        '',
        '## Purpose',
        'Database layer.',
      ].join('\n'),
      'utf-8',
    )

    const result = await validateAll(tmpDir)
    expect(result.total).toBe(2)
    expect(result.fresh).toHaveLength(1)
    expect(result.stale).toHaveLength(1)
    expect(result.stale[0]!.file).toBe('.nogrep/architecture/database.md')
  })

  it('should throw NO_INDEX when _index.json is missing', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'nogrep-empty-'))
    await mkdir(join(emptyDir, '.nogrep'), { recursive: true })

    await expect(validateAll(emptyDir)).rejects.toThrow('_index.json')
  })

  it('should return empty arrays when no nodes exist', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'nogrep-nonode-'))
    await mkdir(join(emptyDir, '.nogrep'), { recursive: true })
    await writeFile(
      join(emptyDir, '.nogrep', '_index.json'),
      '{}',
      'utf-8',
    )

    const result = await validateAll(emptyDir)
    expect(result.total).toBe(0)
    expect(result.fresh).toEqual([])
    expect(result.stale).toEqual([])
  })
})
