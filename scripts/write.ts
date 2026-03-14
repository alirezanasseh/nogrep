import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { glob } from 'glob'
import matter from 'gray-matter'
import yaml from 'js-yaml'
import type {
  NodeResult,
  StackResult,
  IndexJson,
  RegistryJson,
  PathEntry,
  NogrepError,
} from './types.js'

const execFileAsync = promisify(execFile)

// --- Manual Notes preservation ---

function extractManualNotes(content: string): string {
  const match = content.match(
    /## Manual Notes\n([\s\S]*?)(?=\n## |\n---|\s*$)/,
  )
  return match ? match[1]!.trim() : ''
}

// --- Context node markdown generation ---

function buildNodeFrontmatter(node: NodeResult): Record<string, unknown> {
  return {
    id: node.id,
    title: node.title,
    category: node.category,
    tags: {
      domain: node.tags.domain,
      layer: node.tags.layer,
      tech: node.tags.tech,
      concern: node.tags.concern,
      type: node.tags.type,
    },
    relates_to: node.relatesTo.map(r => ({ id: r.id, reason: r.reason })),
    inverse_relations: node.inverseRelations.map(r => ({ id: r.id, reason: r.reason })),
    src_paths: node.srcPaths,
    keywords: node.keywords,
    last_synced: {
      commit: node.lastSynced.commit,
      timestamp: node.lastSynced.timestamp,
      src_hash: node.lastSynced.srcHash,
    },
  }
}

function buildNodeMarkdown(node: NodeResult, manualNotes: string): string {
  const fm = buildNodeFrontmatter(node)
  const yamlStr = yaml.dump(fm, { lineWidth: -1, quotingType: '"', forceQuotes: false })

  const sections: string[] = []
  sections.push(`---\n${yamlStr.trimEnd()}\n---`)

  sections.push(`\n## Purpose\n${node.purpose}`)

  if (node.publicSurface.length > 0) {
    sections.push(`\n## Public Surface\n\n\`\`\`\n${node.publicSurface.join('\n')}\n\`\`\``)
  }

  if (node.doesNotOwn.length > 0) {
    sections.push(`\n## Does Not Own\n${node.doesNotOwn.map(d => `- ${d}`).join('\n')}`)
  }

  if (node.gotchas.length > 0) {
    sections.push(`\n## Gotchas\n${node.gotchas.map(g => `- ${g}`).join('\n')}`)
  }

  const notesContent = manualNotes || '_Human annotations. Never overwritten by nogrep update._'
  sections.push(`\n## Manual Notes\n${notesContent}`)

  return sections.join('\n') + '\n'
}

// --- Write context files ---

function categoryDir(category: NodeResult['category']): string {
  switch (category) {
    case 'domain': return 'domains'
    case 'architecture': return 'architecture'
    case 'flow': return 'flows'
    case 'entity': return 'entities'
  }
}

export async function writeContextNodes(
  nodes: NodeResult[],
  outputDir: string,
): Promise<void> {
  for (const node of nodes) {
    const dir = join(outputDir, categoryDir(node.category))
    await mkdir(dir, { recursive: true })

    const filePath = join(dir, `${node.id}.md`)

    // Preserve existing manual notes
    let manualNotes = ''
    try {
      const existing = await readFile(filePath, 'utf-8')
      manualNotes = extractManualNotes(existing)
    } catch {
      // File doesn't exist yet
    }

    const content = buildNodeMarkdown(node, manualNotes)
    await writeFile(filePath, content, 'utf-8')
  }
}

// --- Build index ---

export function buildIndex(
  nodes: NodeResult[],
  stack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'>,
): IndexJson {
  const tags: Record<string, string[]> = {}
  const keywords: Record<string, string[]> = {}
  const paths: Record<string, PathEntry> = {}

  // Populate inverse relations
  const inverseMap = new Map<string, Array<{ fromId: string; reason: string }>>()
  for (const node of nodes) {
    for (const rel of node.relatesTo) {
      const existing = inverseMap.get(rel.id) ?? []
      existing.push({ fromId: node.id, reason: rel.reason })
      inverseMap.set(rel.id, existing)
    }
  }

  for (const node of nodes) {
    const contextFile = `.nogrep/${categoryDir(node.category)}/${node.id}.md`

    // Merge inverse relations from the map
    const inverseEntries = inverseMap.get(node.id) ?? []
    for (const inv of inverseEntries) {
      if (!node.inverseRelations.some(r => r.id === inv.fromId)) {
        node.inverseRelations.push({ id: inv.fromId, reason: inv.reason })
      }
    }

    // Build tag index
    const tagCategories: Array<[string, string[]]> = [
      ['domain', node.tags.domain],
      ['layer', node.tags.layer],
      ['tech', node.tags.tech],
      ['concern', node.tags.concern],
      ['type', node.tags.type],
    ]

    const flatTags: string[] = []
    for (const [cat, values] of tagCategories) {
      for (const val of values) {
        const tagKey = `${cat}:${val}`
        flatTags.push(tagKey)
        const tagList = tags[tagKey] ?? []
        if (!tagList.includes(contextFile)) {
          tagList.push(contextFile)
        }
        tags[tagKey] = tagList
      }
    }

    // Build keyword index
    for (const kw of node.keywords) {
      const kwList = keywords[kw] ?? []
      if (!kwList.includes(contextFile)) {
        kwList.push(contextFile)
      }
      keywords[kw] = kwList
    }

    // Build path index
    for (const srcPath of node.srcPaths) {
      paths[srcPath] = { context: contextFile, tags: flatTags }
    }
  }

  let commit = ''
  try {
    // Sync exec not ideal but this is a one-time build step
    // We'll set it from the caller if available
  } catch {
    // no git
  }

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    commit,
    stack: {
      primaryLanguage: stack.primaryLanguage,
      frameworks: stack.frameworks,
      architecture: stack.architecture,
    },
    tags,
    keywords,
    paths,
  }
}

// --- Build registry ---

export function buildRegistry(nodes: NodeResult[]): RegistryJson {
  const mappings = nodes.flatMap(node =>
    node.srcPaths.map(srcPath => ({
      glob: srcPath,
      contextFile: `.nogrep/${categoryDir(node.category)}/${node.id}.md`,
      watch: true,
    })),
  )

  return { mappings }
}

// --- Patch CLAUDE.md ---

export async function patchClaudeMd(projectRoot: string): Promise<void> {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md')
  const patchPath = join(dirname(import.meta.url.replace('file://', '')), '..', 'templates', 'claude-md-patch.md')

  let patch: string
  try {
    patch = await readFile(patchPath, 'utf-8')
  } catch {
    // Fallback: inline the patch content
    patch = [
      '<!-- nogrep -->',
      '## Code Navigation',
      '',
      'This project uses [nogrep](https://github.com/techtulp/nogrep).',
      'Context files in `.nogrep/` are a navigable index of this codebase.',
      'When you see nogrep results injected into your context, trust them —',
      'read those files before exploring source.',
      '<!-- /nogrep -->',
    ].join('\n') + '\n'
  }

  let existing = ''
  try {
    existing = await readFile(claudeMdPath, 'utf-8')
  } catch {
    // File doesn't exist
  }

  // Check for existing nogrep marker
  if (existing.includes('<!-- nogrep -->')) {
    return
  }

  const newContent = existing
    ? existing.trimEnd() + '\n\n' + patch
    : patch

  await writeFile(claudeMdPath, newContent, 'utf-8')
}

// --- Write all outputs ---

interface WriteInput {
  nodes: NodeResult[]
  stack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'>
}

async function writeAll(input: WriteInput, projectRoot: string): Promise<void> {
  const outputDir = join(projectRoot, '.nogrep')
  await mkdir(outputDir, { recursive: true })

  // Write context node files
  await writeContextNodes(input.nodes, outputDir)

  // Build and write index
  const index = buildIndex(input.nodes, input.stack)

  // Try to get current git commit
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: projectRoot,
    })
    index.commit = stdout.trim()
  } catch {
    // no git
  }

  await writeFile(
    join(outputDir, '_index.json'),
    JSON.stringify(index, null, 2) + '\n',
    'utf-8',
  )

  // Build and write registry
  const registry = buildRegistry(input.nodes)
  await writeFile(
    join(outputDir, '_registry.json'),
    JSON.stringify(registry, null, 2) + '\n',
    'utf-8',
  )

  // Patch CLAUDE.md
  await patchClaudeMd(projectRoot)
}

// --- CLI interface ---

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  let inputFile: string | undefined
  let projectRoot = process.cwd()

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputFile = args[i + 1]!
      i++
    } else if (args[i] === '--root' && args[i + 1]) {
      projectRoot = resolve(args[i + 1]!)
      i++
    }
  }

  let rawInput: string
  if (inputFile) {
    rawInput = await readFile(resolve(inputFile), 'utf-8')
  } else {
    // Read from stdin
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    rawInput = Buffer.concat(chunks).toString('utf-8')
  }

  const input = JSON.parse(rawInput) as WriteInput
  await writeAll(input, projectRoot)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(JSON.stringify({ error: message }) + '\n')
  process.exitCode = 1
})
