import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { NogrepSettings } from './types.js'

const SETTINGS_FILE = '.claude/settings.json'
const SETTINGS_LOCAL_FILE = '.claude/settings.local.json'

interface HookEntry {
  type: string
  command: string
}

interface HookGroup {
  matcher?: string
  hooks: HookEntry[]
}

interface SettingsJson {
  nogrep?: Partial<NogrepSettings>
  hooks?: Record<string, HookGroup[]>
  [key: string]: unknown
}

async function readJsonFile(path: string): Promise<SettingsJson> {
  try {
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as SettingsJson
  } catch {
    return {}
  }
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function readSettings(projectRoot: string): Promise<NogrepSettings> {
  const sharedPath = join(projectRoot, SETTINGS_FILE)
  const localPath = join(projectRoot, SETTINGS_LOCAL_FILE)

  const shared = await readJsonFile(sharedPath)
  const local = await readJsonFile(localPath)

  const enabled =
    local.nogrep?.enabled ?? shared.nogrep?.enabled ?? false

  return { enabled }
}

function buildNogrepHooks(pluginRoot: string): Record<string, HookGroup[]> {
  return {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: `${pluginRoot}/hooks/pre-tool-use.sh` }],
      },
      {
        matcher: 'Grep',
        hooks: [{ type: 'command', command: `${pluginRoot}/hooks/pre-tool-use-grep.sh` }],
      },
      {
        matcher: 'Glob',
        hooks: [{ type: 'command', command: `${pluginRoot}/hooks/pre-tool-use-glob.sh` }],
      },
    ],
    SessionStart: [
      {
        hooks: [{ type: 'command', command: `${pluginRoot}/hooks/session-start.sh` }],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [{ type: 'command', command: `${pluginRoot}/hooks/prompt-submit.sh` }],
      },
    ],
  }
}

function isNogrepHook(hook: HookGroup): boolean {
  return hook.hooks.some((h) => h.command.includes('/nogrep/') || h.command.includes('nogrep'))
}

function mergeHooks(
  existing: Record<string, HookGroup[]>,
  nogrepHooks: Record<string, HookGroup[]>,
): Record<string, HookGroup[]> {
  const result = { ...existing }

  for (const [event, groups] of Object.entries(nogrepHooks)) {
    const existingGroups = result[event] ?? []
    // Remove any old nogrep hooks first
    const filtered = existingGroups.filter((g) => !isNogrepHook(g))
    result[event] = [...filtered, ...groups]
  }

  return result
}

function removeNogrepHooks(
  existing: Record<string, HookGroup[]>,
): Record<string, HookGroup[]> {
  const result: Record<string, HookGroup[]> = {}

  for (const [event, groups] of Object.entries(existing)) {
    const filtered = groups.filter((g) => !isNogrepHook(g))
    if (filtered.length > 0) {
      result[event] = filtered
    }
  }

  return result
}

export async function writeSettings(
  projectRoot: string,
  settings: Partial<NogrepSettings>,
  local?: boolean,
): Promise<void> {
  const filePath = join(
    projectRoot,
    local ? SETTINGS_LOCAL_FILE : SETTINGS_FILE,
  )

  await ensureDir(join(projectRoot, '.claude'))

  const existing = await readJsonFile(filePath)
  existing.nogrep = { ...existing.nogrep, ...settings }

  // Register/unregister hooks when enabling/disabling
  if (settings.enabled !== undefined) {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT
    if (settings.enabled && pluginRoot) {
      const nogrepHooks = buildNogrepHooks(pluginRoot)
      existing.hooks = mergeHooks(existing.hooks ?? {}, nogrepHooks)
    } else if (!settings.enabled) {
      if (existing.hooks) {
        existing.hooks = removeNogrepHooks(existing.hooks)
        if (Object.keys(existing.hooks).length === 0) {
          delete existing.hooks
        }
      }
    }
  }

  await writeFile(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8')
}

// CLI interface
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      set: { type: 'string' },
      get: { type: 'boolean', default: false },
      local: { type: 'boolean', default: false },
      root: { type: 'string', default: process.cwd() },
    },
    strict: true,
  })

  const root = values.root ?? process.cwd()

  if (values.get) {
    const settings = await readSettings(root)
    process.stdout.write(JSON.stringify(settings, null, 2) + '\n')
    return
  }

  if (values.set) {
    const [key, value] = values.set.split('=')
    if (key === 'enabled') {
      const enabled = value === 'true'
      await writeSettings(root, { enabled }, values.local)
    } else {
      process.stderr.write(JSON.stringify({ error: `Unknown setting: ${key}` }) + '\n')
      process.exitCode = 1
    }
    return
  }

  process.stderr.write(JSON.stringify({ error: 'Usage: node settings.js --set enabled=true [--local] | --get' }) + '\n')
  process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(JSON.stringify({ error: message }) + '\n')
    process.exitCode = 1
  })
}
