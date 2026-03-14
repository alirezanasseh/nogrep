import { readFile } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { glob } from 'glob'
import matter from 'gray-matter'
import type { StaleResult } from './types.js'
import { NogrepError } from './types.js'

// --- Freshness check ---

export async function checkFreshness(
  nodeFile: string,
  projectRoot: string,
): Promise<StaleResult> {
  let content: string
  try {
    content = await readFile(join(projectRoot, nodeFile), 'utf-8')
  } catch {
    return { file: nodeFile, isStale: true, reason: 'context file not found' }
  }

  const parsed = matter(content)
  const srcPaths: string[] = parsed.data.src_paths ?? []
  const lastSynced = parsed.data.last_synced as
    | { src_hash?: string; commit?: string; timestamp?: string }
    | undefined

  if (!lastSynced?.src_hash) {
    return { file: nodeFile, isStale: true, reason: 'no src_hash in frontmatter' }
  }

  if (srcPaths.length === 0) {
    return { file: nodeFile, isStale: false }
  }

  // Glob all matching source files
  const allFiles: string[] = []
  for (const pattern of srcPaths) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      nodir: true,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**'],
    })
    allFiles.push(...matches)
  }

  allFiles.sort()

  if (allFiles.length === 0) {
    return { file: nodeFile, isStale: true, reason: 'no source files match src_paths' }
  }

  // Compute SHA256 of all file contents concatenated
  const hash = createHash('sha256')
  for (const file of allFiles) {
    try {
      const fileContent = await readFile(join(projectRoot, file))
      hash.update(fileContent)
    } catch {
      // File unreadable — skip
    }
  }
  const currentHash = `sha256:${hash.digest('hex').slice(0, 12)}`

  if (currentHash !== lastSynced.src_hash) {
    return {
      file: nodeFile,
      isStale: true,
      reason: `hash mismatch: expected ${lastSynced.src_hash}, got ${currentHash}`,
    }
  }

  return { file: nodeFile, isStale: false }
}

// --- Discover all context nodes ---

async function discoverNodes(projectRoot: string): Promise<string[]> {
  const nogrepDir = join(projectRoot, '.nogrep')
  const patterns = [
    'domains/*.md',
    'architecture/*.md',
    'flows/*.md',
    'entities/*.md',
  ]

  const files: string[] = []
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd: nogrepDir, nodir: true })
    files.push(...matches.map(m => `.nogrep/${m}`))
  }

  return files.sort()
}

// --- Validate all nodes ---

export async function validateAll(
  projectRoot: string,
): Promise<{ total: number; fresh: StaleResult[]; stale: StaleResult[] }> {
  const indexPath = join(projectRoot, '.nogrep', '_index.json')
  try {
    await readFile(indexPath, 'utf-8')
  } catch {
    throw new NogrepError(
      'No .nogrep/_index.json found. Run /nogrep:init first.',
      'NO_INDEX',
    )
  }

  const nodeFiles = await discoverNodes(projectRoot)
  const results = await Promise.all(
    nodeFiles.map(f => checkFreshness(f, projectRoot)),
  )

  const fresh = results.filter(r => !r.isStale)
  const stale = results.filter(r => r.isStale)

  return { total: results.length, fresh, stale }
}

// --- Formatting ---

function formatText(result: { total: number; fresh: StaleResult[]; stale: StaleResult[] }): string {
  const lines: string[] = []
  lines.push(`nogrep index: ${result.total} nodes`)
  lines.push(`  Fresh: ${result.fresh.length}`)
  lines.push(`  Stale: ${result.stale.length}`)

  if (result.stale.length > 0) {
    lines.push('')
    lines.push('Stale nodes:')
    for (const s of result.stale) {
      lines.push(`  - ${s.file}: ${s.reason}`)
    }
  }

  return lines.join('\n')
}

function formatJson(result: { total: number; fresh: StaleResult[]; stale: StaleResult[] }): string {
  return JSON.stringify(result, null, 2)
}

// --- CLI ---

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      format: { type: 'string', default: 'text' },
      root: { type: 'string', default: process.cwd() },
    },
    strict: true,
  })

  const root = resolvePath(values.root ?? process.cwd())
  const format = values.format ?? 'text'

  const result = await validateAll(root)

  switch (format) {
    case 'json':
      process.stdout.write(formatJson(result) + '\n')
      break
    case 'text':
    default:
      process.stdout.write(formatText(result) + '\n')
      break
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    if (err instanceof NogrepError) {
      process.stderr.write(JSON.stringify({ error: err.message, code: err.code }) + '\n')
    } else {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(JSON.stringify({ error: message }) + '\n')
    }
    process.exitCode = 1
  })
}
