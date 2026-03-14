import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readSettings, writeSettings } from '../scripts/settings.js'

describe('settings', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nogrep-settings-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  describe('readSettings', () => {
    it('returns defaults when no files exist', async () => {
      const settings = await readSettings(root)
      expect(settings).toEqual({ enabled: false })
    })

    it('reads from shared settings', async () => {
      await mkdir(join(root, '.claude'), { recursive: true })
      await writeFile(
        join(root, '.claude/settings.json'),
        JSON.stringify({ nogrep: { enabled: true } }),
      )

      const settings = await readSettings(root)
      expect(settings.enabled).toBe(true)
    })

    it('local settings take precedence over shared', async () => {
      await mkdir(join(root, '.claude'), { recursive: true })
      await writeFile(
        join(root, '.claude/settings.json'),
        JSON.stringify({ nogrep: { enabled: true } }),
      )
      await writeFile(
        join(root, '.claude/settings.local.json'),
        JSON.stringify({ nogrep: { enabled: false } }),
      )

      const settings = await readSettings(root)
      expect(settings.enabled).toBe(false)
    })

    it('falls back to shared when local has no nogrep key', async () => {
      await mkdir(join(root, '.claude'), { recursive: true })
      await writeFile(
        join(root, '.claude/settings.json'),
        JSON.stringify({ nogrep: { enabled: true } }),
      )
      await writeFile(
        join(root, '.claude/settings.local.json'),
        JSON.stringify({ other: 'value' }),
      )

      const settings = await readSettings(root)
      expect(settings.enabled).toBe(true)
    })
  })

  describe('writeSettings', () => {
    it('creates .claude dir and writes shared settings', async () => {
      await writeSettings(root, { enabled: true })

      const content = await readFile(
        join(root, '.claude/settings.json'),
        'utf-8',
      )
      const parsed = JSON.parse(content)
      expect(parsed.nogrep.enabled).toBe(true)
    })

    it('writes to local settings with local flag', async () => {
      await writeSettings(root, { enabled: false }, true)

      const content = await readFile(
        join(root, '.claude/settings.local.json'),
        'utf-8',
      )
      const parsed = JSON.parse(content)
      expect(parsed.nogrep.enabled).toBe(false)
    })

    it('preserves existing keys in settings file', async () => {
      await mkdir(join(root, '.claude'), { recursive: true })
      await writeFile(
        join(root, '.claude/settings.json'),
        JSON.stringify({ other: 'value', nogrep: { enabled: false } }),
      )

      await writeSettings(root, { enabled: true })

      const content = await readFile(
        join(root, '.claude/settings.json'),
        'utf-8',
      )
      const parsed = JSON.parse(content)
      expect(parsed.other).toBe('value')
      expect(parsed.nogrep.enabled).toBe(true)
    })

    it('creates .claude dir if it does not exist', async () => {
      await writeSettings(root, { enabled: true })

      const content = await readFile(
        join(root, '.claude/settings.json'),
        'utf-8',
      )
      expect(JSON.parse(content).nogrep.enabled).toBe(true)
    })
  })
})
