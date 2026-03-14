import { readFile } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import { parseArgs } from 'node:util'
import type { IndexJson, RankedResult, Taxonomy } from './types.js'
import { NogrepError } from './types.js'

// --- Term extraction ---

export function extractTerms(
  question: string,
  taxonomy: Taxonomy,
): { tags: string[]; keywords: string[] } {
  const words = question
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)

  const tags: string[] = []
  const keywords: string[] = []

  // Collect all taxonomy values for matching
  const tagLookup = new Map<string, string>()

  for (const val of taxonomy.static.layer) {
    tagLookup.set(val.toLowerCase(), `layer:${val}`)
  }
  for (const val of taxonomy.static.concern) {
    tagLookup.set(val.toLowerCase(), `concern:${val}`)
  }
  for (const val of taxonomy.static.type) {
    tagLookup.set(val.toLowerCase(), `type:${val}`)
  }
  for (const val of taxonomy.dynamic.domain) {
    tagLookup.set(val.toLowerCase(), `domain:${val}`)
  }
  for (const val of taxonomy.dynamic.tech) {
    tagLookup.set(val.toLowerCase(), `tech:${val}`)
  }
  for (const [cat, values] of Object.entries(taxonomy.custom)) {
    for (const val of values) {
      tagLookup.set(val.toLowerCase(), `${cat}:${val}`)
    }
  }

  // Stop words to skip as keywords
  const stopWords = new Set([
    'the', 'is', 'at', 'in', 'of', 'on', 'to', 'a', 'an', 'and', 'or',
    'for', 'it', 'do', 'does', 'how', 'what', 'where', 'which', 'when',
    'who', 'why', 'this', 'that', 'with', 'from', 'by', 'be', 'as',
    'are', 'was', 'were', 'been', 'has', 'have', 'had', 'not', 'but',
    'if', 'my', 'our', 'its', 'can', 'will', 'should', 'would', 'could',
    'about', 'after', 'work', 'works', 'use', 'uses', 'used',
  ])

  for (const word of words) {
    const tag = tagLookup.get(word)
    if (tag && !tags.includes(tag)) {
      tags.push(tag)
    }

    // Also check hyphenated compound matches (e.g. "error-handling")
    if (!tag && !stopWords.has(word)) {
      keywords.push(word)
    }
  }

  // Check for multi-word tag matches (e.g. "error handling" → "error-handling")
  const questionLower = question.toLowerCase()
  for (const [val, tag] of tagLookup.entries()) {
    if (val.includes('-')) {
      const spacedVersion = val.replace(/-/g, ' ')
      if (questionLower.includes(spacedVersion) && !tags.includes(tag)) {
        tags.push(tag)
      }
      if (questionLower.includes(val) && !tags.includes(tag)) {
        tags.push(tag)
      }
    }
  }

  return { tags, keywords }
}

// --- Resolution ---

export function resolveQuery(
  terms: { tags: string[]; keywords: string[] },
  index: IndexJson,
  limit = 5,
): RankedResult[] {
  const scoreMap = new Map<string, { score: number; matchedOn: string[] }>()

  function addMatch(contextFile: string, score: number, matchLabel: string): void {
    const existing = scoreMap.get(contextFile)
    if (existing) {
      existing.score += score
      existing.matchedOn.push(matchLabel)
    } else {
      scoreMap.set(contextFile, { score, matchedOn: [matchLabel] })
    }
  }

  // Tag matching: +2 per match
  for (const tag of terms.tags) {
    const files = index.tags[tag]
    if (files) {
      for (const file of files) {
        addMatch(file, 2, `tag:${tag}`)
      }
    }
  }

  // Keyword matching: +1 per match
  for (const kw of terms.keywords) {
    const kwLower = kw.toLowerCase()

    // Direct keyword lookup
    const files = index.keywords[kwLower]
    if (files) {
      for (const file of files) {
        addMatch(file, 1, `keyword:${kwLower}`)
      }
    }

    // Also search all index keywords for partial matches
    for (const [indexKw, kwFiles] of Object.entries(index.keywords)) {
      if (indexKw === kwLower) continue // Already handled
      if (indexKw.includes(kwLower) || kwLower.includes(indexKw)) {
        for (const file of kwFiles) {
          addMatch(file, 1, `keyword:${indexKw}`)
        }
      }
    }
  }

  // Sort by score descending, then alphabetically for ties
  const results: RankedResult[] = [...scoreMap.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([contextFile, { score, matchedOn }]) => ({
      contextFile,
      score,
      matchedOn: [...new Set(matchedOn)],
      summary: `Matched: ${[...new Set(matchedOn)].join(', ')}`,
    }))

  return results
}

// --- Index + taxonomy loading ---

async function loadIndex(projectRoot: string): Promise<IndexJson> {
  const indexPath = join(projectRoot, '.nogrep', '_index.json')
  try {
    const content = await readFile(indexPath, 'utf-8')
    return JSON.parse(content) as IndexJson
  } catch {
    throw new NogrepError(
      'No .nogrep/_index.json found. Run /nogrep:init first.',
      'NO_INDEX',
    )
  }
}

async function loadTaxonomy(projectRoot: string): Promise<Taxonomy> {
  const taxonomyPath = join(projectRoot, '.nogrep', '_taxonomy.json')
  try {
    const content = await readFile(taxonomyPath, 'utf-8')
    return JSON.parse(content) as Taxonomy
  } catch {
    // Return default taxonomy if file doesn't exist
    return {
      static: {
        layer: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
        concern: ['security', 'performance', 'caching', 'validation', 'error-handling', 'idempotency', 'observability'],
        type: ['module', 'flow', 'entity', 'integration', 'config', 'ui', 'test'],
      },
      dynamic: { domain: [], tech: [] },
      custom: {},
    }
  }
}

function buildTaxonomyFromIndex(index: IndexJson, baseTaxonomy: Taxonomy): Taxonomy {
  // Extract dynamic domain and tech values from the index tags
  const domains = new Set<string>(baseTaxonomy.dynamic.domain)
  const techs = new Set<string>(baseTaxonomy.dynamic.tech)

  for (const tagKey of Object.keys(index.tags)) {
    const [category, value] = tagKey.split(':')
    if (!category || !value) continue
    if (category === 'domain') domains.add(value)
    if (category === 'tech') techs.add(value)
  }

  return {
    ...baseTaxonomy,
    dynamic: {
      domain: [...domains],
      tech: [...techs],
    },
  }
}

// --- Formatting ---

function formatPaths(results: RankedResult[]): string {
  return results.map(r => r.contextFile).join('\n')
}

function formatJson(results: RankedResult[]): string {
  return JSON.stringify(results, null, 2)
}

function formatSummary(results: RankedResult[]): string {
  if (results.length === 0) return 'No matching context files found.'
  return results
    .map(r => `- ${r.contextFile} (score: ${r.score}) — ${r.summary}`)
    .join('\n')
}

// --- CLI ---

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tags: { type: 'string' },
      keywords: { type: 'string' },
      question: { type: 'string' },
      format: { type: 'string', default: 'json' },
      limit: { type: 'string', default: '5' },
      root: { type: 'string', default: process.cwd() },
    },
    strict: true,
  })

  const root = resolvePath(values.root ?? process.cwd())
  const limit = parseInt(values.limit ?? '5', 10)
  const format = values.format ?? 'json'

  const index = await loadIndex(root)
  const baseTaxonomy = await loadTaxonomy(root)
  const taxonomy = buildTaxonomyFromIndex(index, baseTaxonomy)

  let terms: { tags: string[]; keywords: string[] }

  if (values.question) {
    terms = extractTerms(values.question, taxonomy)
  } else if (values.tags || values.keywords) {
    const tags = values.tags
      ? values.tags.split(',').map(t => t.trim()).filter(Boolean)
      : []
    const keywords = values.keywords
      ? values.keywords.split(',').map(k => k.trim()).filter(Boolean)
      : []
    terms = { tags, keywords }
  } else {
    process.stderr.write(
      JSON.stringify({ error: 'Usage: node query.js --tags <tags> | --keywords <words> | --question <text> [--format paths|json|summary] [--limit N]' }) + '\n',
    )
    process.exitCode = 1
    return
  }

  const results = resolveQuery(terms, index, limit)

  switch (format) {
    case 'paths':
      process.stdout.write(formatPaths(results) + '\n')
      break
    case 'summary':
      process.stdout.write(formatSummary(results) + '\n')
      break
    case 'json':
    default:
      process.stdout.write(formatJson(results) + '\n')
      break
  }
}

main().catch((err: unknown) => {
  if (err instanceof NogrepError) {
    process.stderr.write(JSON.stringify({ error: err.message, code: err.code }) + '\n')
  } else {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(JSON.stringify({ error: message }) + '\n')
  }
  process.exitCode = 1
})
