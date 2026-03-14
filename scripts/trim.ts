import { readFile } from 'fs/promises'
import { resolve, extname, basename } from 'path'

const MAX_CLUSTER_LINES = 300

interface TrimOptions {
  maxLines?: number
}

// Language-agnostic regex patterns for stripping function/method bodies
// Strategy: find opening braces after signatures, track depth, remove body content

function trimTypeScript(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let braceDepth = 0
  let inBody = false
  let bodyStartDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Always keep: empty lines at top level, imports, type/interface, decorators, exports of types
    if (braceDepth === 0 || !inBody) {
      if (
        trimmed === '' ||
        trimmed.startsWith('import ') ||
        trimmed.startsWith('export type ') ||
        trimmed.startsWith('export interface ') ||
        trimmed.startsWith('export enum ') ||
        trimmed.startsWith('export const ') ||
        trimmed.startsWith('type ') ||
        trimmed.startsWith('interface ') ||
        trimmed.startsWith('enum ') ||
        trimmed.startsWith('@') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('declare ')
      ) {
        result.push(line)
        // Count braces even in kept lines
        braceDepth += countChar(trimmed, '{') - countChar(trimmed, '}')
        continue
      }
    }

    const openBraces = countChar(trimmed, '{')
    const closeBraces = countChar(trimmed, '}')

    if (!inBody) {
      // Detect function/method signature — line with opening brace
      if (isSignatureLine(trimmed) && openBraces > closeBraces) {
        result.push(line)
        braceDepth += openBraces - closeBraces
        inBody = true
        bodyStartDepth = braceDepth
        continue
      }

      // Class/interface declaration — keep but don't treat as body
      if (isClassOrInterfaceLine(trimmed)) {
        result.push(line)
        braceDepth += openBraces - closeBraces
        continue
      }

      // Keep the line (top-level statement, property declaration, etc.)
      result.push(line)
      braceDepth += openBraces - closeBraces
    } else {
      // Inside a function body — skip lines
      braceDepth += openBraces - closeBraces

      // Check if we've closed back to where the body started
      if (braceDepth < bodyStartDepth) {
        // Add closing brace
        result.push(line)
        inBody = false
      }
    }
  }

  return result.join('\n')
}

function trimPython(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let skipIndent = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()
    const indent = line.length - line.trimStart().length

    // If we're skipping a body and this line is still indented deeper, skip it
    if (skipIndent >= 0) {
      if (trimmed === '' || indent > skipIndent) {
        continue
      }
      // We've exited the body
      skipIndent = -1
    }

    // Always keep: comments, imports, class defs, decorators, type hints, module-level assignments
    if (
      trimmed === '' ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('from ') ||
      trimmed.startsWith('@') ||
      trimmed.startsWith('class ') ||
      /^[A-Z_][A-Z_0-9]*\s*=/.test(trimmed)
    ) {
      result.push(line)
      continue
    }

    // Function/method definition — keep signature, skip body
    if (trimmed.startsWith('def ') || trimmed.startsWith('async def ')) {
      result.push(line)
      // If the next non-empty line has docstring, keep it
      const docIdx = findDocstring(lines, i + 1, indent)
      if (docIdx > i) {
        for (let j = i + 1; j <= docIdx; j++) {
          result.push(lines[j]!)
        }
      }
      skipIndent = indent
      continue
    }

    // Keep everything else at module/class level
    result.push(line)
  }

  return result.join('\n')
}

function trimJava(content: string): string {
  // Java/Kotlin — very similar to TypeScript brace-matching
  const lines = content.split('\n')
  const result: string[] = []
  let braceDepth = 0
  let inBody = false
  let bodyStartDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    if (braceDepth === 0 || !inBody) {
      if (
        trimmed === '' ||
        trimmed.startsWith('import ') ||
        trimmed.startsWith('package ') ||
        trimmed.startsWith('@') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('public interface ') ||
        trimmed.startsWith('interface ') ||
        trimmed.startsWith('public enum ') ||
        trimmed.startsWith('enum ')
      ) {
        result.push(line)
        braceDepth += countChar(trimmed, '{') - countChar(trimmed, '}')
        continue
      }
    }

    const openBraces = countChar(trimmed, '{')
    const closeBraces = countChar(trimmed, '}')

    if (!inBody) {
      if (isJavaMethodSignature(trimmed) && openBraces > closeBraces) {
        result.push(line)
        braceDepth += openBraces - closeBraces
        inBody = true
        bodyStartDepth = braceDepth
        continue
      }

      if (isJavaClassLine(trimmed)) {
        result.push(line)
        braceDepth += openBraces - closeBraces
        continue
      }

      result.push(line)
      braceDepth += openBraces - closeBraces
    } else {
      braceDepth += openBraces - closeBraces
      if (braceDepth < bodyStartDepth) {
        result.push(line)
        inBody = false
      }
    }
  }

  return result.join('\n')
}

function trimGeneric(content: string): string {
  // For unknown languages, just return as-is (truncation handles size)
  return content
}

// --- Helpers ---

function countChar(s: string, ch: string): number {
  let count = 0
  let inString = false
  let stringChar = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (inString) {
      if (c === stringChar && s[i - 1] !== '\\') inString = false
    } else if (c === '"' || c === "'" || c === '`') {
      inString = true
      stringChar = c
    } else if (c === ch) {
      count++
    }
  }
  return count
}

function isSignatureLine(trimmed: string): boolean {
  return /^(export\s+)?(async\s+)?function\s/.test(trimmed) ||
    /^(public|private|protected|static|async|get|set|\*)\s/.test(trimmed) ||
    /^(readonly\s+)?[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/.test(trimmed) ||
    /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/.test(trimmed) ||
    /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/.test(trimmed) ||
    // Arrow function assigned at class level
    /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*(async\s+)?\(/.test(trimmed)
}

function isClassOrInterfaceLine(trimmed: string): boolean {
  return /^(export\s+)?(abstract\s+)?(class|interface|enum)\s/.test(trimmed) ||
    /^(export\s+)?namespace\s/.test(trimmed)
}

function isJavaMethodSignature(trimmed: string): boolean {
  return /^(public|private|protected|static|final|abstract|synchronized|native)\s/.test(trimmed) &&
    /\(/.test(trimmed)
}

function isJavaClassLine(trimmed: string): boolean {
  return /^(public|private|protected)?\s*(abstract\s+)?(class|interface|enum)\s/.test(trimmed)
}

function findDocstring(lines: string[], startIdx: number, defIndent: number): number {
  // Find Python docstring (triple-quoted) after a def
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      const quote = trimmed.slice(0, 3)
      // Single-line docstring
      if (trimmed.length > 3 && trimmed.endsWith(quote)) return i
      // Multi-line docstring — find closing
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]!.trim().endsWith(quote)) return j
      }
      return i
    }
    // First non-empty line after def is not a docstring
    return startIdx - 1
  }
  return startIdx - 1
}

function getTrimmer(filePath: string): (content: string) => string {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return trimTypeScript
    case '.py':
      return trimPython
    case '.java':
    case '.kt':
    case '.kts':
    case '.scala':
    case '.groovy':
      return trimJava
    case '.go':
    case '.rs':
    case '.c':
    case '.cpp':
    case '.h':
    case '.hpp':
    case '.cs':
    case '.swift':
    case '.dart':
      return trimJava // brace-based languages use same strategy
    default:
      return trimGeneric
  }
}

export async function trimCluster(paths: string[], projectRoot: string): Promise<string> {
  const results: Array<{ path: string; content: string; lines: number }> = []

  for (const filePath of paths) {
    const absPath = resolve(projectRoot, filePath)
    try {
      const raw = await readFile(absPath, 'utf-8')
      const trimmer = getTrimmer(filePath)
      const trimmed = trimmer(raw)
      results.push({
        path: filePath,
        content: trimmed,
        lines: trimmed.split('\n').length,
      })
    } catch {
      // Skip files that can't be read
      if (process.env['NOGREP_DEBUG'] === '1') {
        process.stderr.write(`[nogrep] Could not read: ${absPath}\n`)
      }
    }
  }

  // Sort by line count descending — truncate least important (largest) files first
  results.sort((a, b) => a.lines - b.lines)

  const output: string[] = []
  let totalLines = 0
  const maxLines = MAX_CLUSTER_LINES

  for (const file of results) {
    const header = `// === ${file.path} ===`
    const fileLines = file.content.split('\n')
    const available = maxLines - totalLines - 2 // header + separator

    if (available <= 0) break

    output.push(header)
    if (fileLines.length <= available) {
      output.push(file.content)
    } else {
      output.push(fileLines.slice(0, available).join('\n'))
      output.push(`// ... truncated (${fileLines.length - available} more lines)`)
    }
    output.push('')

    totalLines += Math.min(fileLines.length, available) + 2
  }

  return output.join('\n')
}

// --- CLI ---

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    process.stderr.write('Usage: node trim.js <path1> <path2> ...\n')
    process.exit(1)
  }

  const projectRoot = process.cwd()
  const result = await trimCluster(args, projectRoot)
  process.stdout.write(result)
}

const isDirectRun = process.argv[1]?.endsWith('trim.js') || process.argv[1]?.endsWith('trim.ts')
if (isDirectRun) {
  main().catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
