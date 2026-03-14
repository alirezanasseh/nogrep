import { readdir, stat, readFile } from 'fs/promises'
import { join, extname, relative, resolve } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SignalResult, DirectoryNode, ManifestFile, ChurnEntry, FileSize } from './types.js'

const execFileAsync = promisify(execFile)

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', 'coverage',
  '.next', '.nuxt', '__pycache__', '.venv', 'venv',
  '.idea', '.vscode', '.nogrep',
])

const MANIFEST_NAMES: Record<string, string> = {
  'package.json': 'npm',
  'requirements.txt': 'pip',
  'pom.xml': 'maven',
  'go.mod': 'go',
  'Podfile': 'cocoapods',
  'Cargo.toml': 'cargo',
  'pubspec.yaml': 'flutter',
  'composer.json': 'composer',
}

const ENTRY_NAMES = new Set(['main', 'index', 'app', 'server'])

const TEST_PATTERNS = [
  /\.test\.\w+$/,
  /\.spec\.\w+$/,
  /_test\.\w+$/,
  /^test_.*\.py$/,
]

interface CollectOptions {
  exclude?: string[]
  maxDepth?: number
}

export async function collectSignals(
  root: string,
  options: CollectOptions = {},
): Promise<SignalResult> {
  const absRoot = resolve(root)
  const maxDepth = options.maxDepth ?? 4
  const extraSkip = new Set(options.exclude ?? [])

  const allFiles: { path: string; bytes: number }[] = []
  const extensionMap: Record<string, number> = {}
  const manifests: ManifestFile[] = []
  const entryPoints: string[] = []
  const envFiles: string[] = []
  const testFiles: string[] = []

  const directoryTree = await walkDirectory(absRoot, absRoot, 0, maxDepth, extraSkip, {
    allFiles,
    extensionMap,
    manifests,
    entryPoints,
    envFiles,
    testFiles,
  })

  const gitChurn = await collectGitChurn(absRoot)

  const largeFiles = allFiles
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 20)
    .map(f => ({ path: f.path, bytes: f.bytes }))

  return {
    directoryTree,
    extensionMap,
    manifests,
    entryPoints,
    gitChurn,
    largeFiles,
    envFiles,
    testFiles,
  }
}

interface Collectors {
  allFiles: { path: string; bytes: number }[]
  extensionMap: Record<string, number>
  manifests: ManifestFile[]
  entryPoints: string[]
  envFiles: string[]
  testFiles: string[]
}

async function walkDirectory(
  dir: string,
  root: string,
  depth: number,
  maxDepth: number,
  extraSkip: Set<string>,
  collectors: Collectors,
): Promise<DirectoryNode[]> {
  if (depth > maxDepth) return []

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: DirectoryNode[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(root, fullPath)

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || extraSkip.has(entry.name)) continue

      const children = await walkDirectory(fullPath, root, depth + 1, maxDepth, extraSkip, collectors)
      nodes.push({ name: entry.name, path: relPath, type: 'directory', children })
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: relPath, type: 'file' })

      let fileBytes = 0
      try {
        const s = await stat(fullPath)
        fileBytes = s.size
      } catch {
        // skip
      }

      collectors.allFiles.push({ path: relPath, bytes: fileBytes })

      const ext = extname(entry.name)
      if (ext) {
        collectors.extensionMap[ext] = (collectors.extensionMap[ext] ?? 0) + 1
      }

      // Manifest check
      if (entry.name in MANIFEST_NAMES) {
        collectors.manifests.push({
          path: relPath,
          type: MANIFEST_NAMES[entry.name]!,
          depth,
        })
      }

      // Entry point check — root or src/ level
      if (depth <= 1 || (depth === 2 && dir.endsWith('/src'))) {
        const nameWithoutExt = entry.name.replace(/\.\w+$/, '')
        if (ENTRY_NAMES.has(nameWithoutExt)) {
          collectors.entryPoints.push(relPath)
        }
      }

      // Env files
      if (entry.name.startsWith('.env')) {
        collectors.envFiles.push(relPath)
      }

      // Config directories are handled at directory level
      // But we also detect config files at root
      if (depth === 0 && entry.name.match(/^config\./)) {
        collectors.envFiles.push(relPath)
      }

      // Test files
      const fileName = entry.name
      if (TEST_PATTERNS.some(p => p.test(fileName))) {
        collectors.testFiles.push(relPath)
      }
    }
  }

  // Check if this directory is a config directory
  const dirName = dir.split('/').pop()
  if (dirName === 'config' && depth <= 2) {
    collectors.envFiles.push(relative(root, dir))
  }

  return nodes
}

async function collectGitChurn(root: string): Promise<ChurnEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--stat', '--oneline', '-50', '--pretty=format:'],
      { cwd: root, maxBuffer: 1024 * 1024 },
    )

    const changeCounts: Record<string, number> = {}

    for (const line of stdout.split('\n')) {
      // Match lines like: src/billing/service.ts | 42 +++---
      const match = line.match(/^\s+(.+?)\s+\|\s+(\d+)/)
      if (match) {
        const filePath = match[1]!.trim()
        const changes = parseInt(match[2]!, 10)
        changeCounts[filePath] = (changeCounts[filePath] ?? 0) + changes
      }
    }

    return Object.entries(changeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([path, changes]) => ({ path, changes }))
  } catch {
    // No git or git log fails — return empty
    return []
  }
}

// --- CLI interface ---

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  let root = '.'
  const exclude: string[] = []

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1]!
      i++
    } else if (args[i] === '--exclude' && args[i + 1]) {
      exclude.push(...args[i + 1]!.split(','))
      i++
    }
  }

  const result = await collectSignals(root, { exclude })
  process.stdout.write(JSON.stringify(result, null, 2))
}

main().catch(err => {
  process.stderr.write(JSON.stringify({ error: String(err) }))
  process.exit(1)
})
