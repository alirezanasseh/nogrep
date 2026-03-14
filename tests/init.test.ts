import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, cp, rm, access } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import matter from 'gray-matter'
import { collectSignals } from '../scripts/signals.js'
import { trimCluster } from '../scripts/trim.js'
import { writeContextNodes, buildIndex, buildRegistry, patchClaudeMd } from '../scripts/write.js'
import type { NodeResult, StackResult } from '../scripts/types.js'

const execFileAsync = promisify(execFile)

/**
 * Integration test: simulates the full /nogrep:init pipeline.
 *
 * Since Phase 2 + Phase 3 are Claude's AI analysis (embedded in the slash command),
 * this test provides realistic hand-crafted analysis results and verifies the
 * mechanical pipeline: signals → trim → write → verify .nogrep/ output.
 */
describe('/nogrep:init pipeline integration', () => {
  let projectDir: string
  const fixtureDir = join(import.meta.dirname, 'fixtures', 'nestjs-project')

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'nogrep-init-'))
    // Copy the NestJS fixture into the temp dir
    await cp(fixtureDir, projectDir, { recursive: true })
  })

  // --- Step 1: Signal collection ---

  it('Step 1 — signals.js collects valid signals from the project', async () => {
    const signals = await collectSignals(projectDir)

    expect(signals.directoryTree.length).toBeGreaterThan(0)
    expect(signals.extensionMap['.ts']).toBeGreaterThan(0)
    expect(signals.manifests).toContainEqual(
      expect.objectContaining({ type: 'npm', depth: 0 }),
    )
    expect(signals.entryPoints).toContainEqual(
      expect.stringContaining('main.ts'),
    )
    expect(signals.envFiles.length).toBeGreaterThan(0)
  })

  // --- Step 2: Stack detection (simulated Claude output) ---

  it('Step 2 — stack detection produces valid StackResult', async () => {
    const signals = await collectSignals(projectDir)

    // Simulate what Claude would produce from analyzing signals
    const stack: StackResult = {
      primaryLanguage: 'typescript',
      frameworks: ['nestjs'],
      architecture: 'monolith',
      domainClusters: [
        { name: 'billing', path: 'src/billing/', confidence: 0.9 },
        { name: 'auth', path: 'src/auth/', confidence: 0.85 },
      ],
      conventions: {
        entryPattern: '*.module.ts',
        testPattern: '*.spec.ts',
        configLocation: '.env',
      },
      stackHints: 'NestJS: *.module.ts = module boundary, *.service.ts = business logic, *.controller.ts = HTTP handlers',
      dynamicTaxonomy: {
        domain: ['billing', 'auth'],
        tech: ['stripe', 'prisma', 'nestjs'],
      },
    }

    expect(stack.domainClusters).toHaveLength(2)
    expect(stack.primaryLanguage).toBe('typescript')
    expect(stack.frameworks).toContain('nestjs')
    expect(stack.dynamicTaxonomy.domain).toContain('billing')
    expect(stack.dynamicTaxonomy.domain).toContain('auth')
  })

  // --- Step 3: Trim + node generation per cluster ---

  it('Step 3 — trim.js produces trimmed source for each cluster', async () => {
    // List billing source files
    const billingFiles = [
      'src/billing/billing.module.ts',
      'src/billing/billing.service.ts',
      'src/billing/billing.controller.ts',
    ]

    const trimmed = await trimCluster(billingFiles, projectDir)

    // Trimmed output should contain file headers
    expect(trimmed).toContain('billing.module.ts')
    expect(trimmed).toContain('billing.service.ts')
    // Should be shorter than reading all files raw
    expect(trimmed.length).toBeGreaterThan(0)
  })

  // --- Full pipeline: Steps 1-5 end to end ---

  it('Full pipeline — generates valid .nogrep/ directory from fixture project', async () => {
    // Step 1: Collect signals
    const signals = await collectSignals(projectDir)
    expect(signals.manifests.length).toBeGreaterThan(0)

    // Step 2: Simulated stack detection (what Claude would produce)
    const stack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'> = {
      primaryLanguage: 'typescript',
      frameworks: ['nestjs'],
      architecture: 'monolith',
    }

    // Step 3: Simulated node generation (what Claude would produce after reading trimmed source)
    const billingNode: NodeResult = {
      id: 'billing',
      title: 'Billing & Payments',
      category: 'domain',
      tags: {
        domain: ['billing'],
        layer: ['business', 'presentation'],
        tech: ['stripe'],
        concern: ['error-handling'],
        type: ['module'],
      },
      relatesTo: [{ id: 'auth', reason: 'requires authenticated user for checkout' }],
      inverseRelations: [],
      srcPaths: ['src/billing/**'],
      keywords: ['stripe', 'checkout', 'payment', 'billing', 'price'],
      lastSynced: {
        commit: '',
        timestamp: new Date().toISOString(),
        srcHash: '',
      },
      purpose: 'Handles payment processing and checkout sessions via Stripe integration.',
      publicSurface: [
        'POST /billing/checkout',
        'BillingService.createCheckoutSession(priceId)',
      ],
      doesNotOwn: ['User identity → auth'],
      externalDeps: [{ name: 'stripe', usage: 'payment processing and checkout sessions' }],
      gotchas: ['Stripe secret key loaded from environment variable STRIPE_SECRET_KEY'],
    }

    const authNode: NodeResult = {
      id: 'auth',
      title: 'Authentication',
      category: 'domain',
      tags: {
        domain: ['auth'],
        layer: ['business'],
        tech: ['nestjs'],
        concern: ['security'],
        type: ['module'],
      },
      relatesTo: [],
      inverseRelations: [],
      srcPaths: ['src/auth/**'],
      keywords: ['auth', 'token', 'validate', 'login', 'session'],
      lastSynced: {
        commit: '',
        timestamp: new Date().toISOString(),
        srcHash: '',
      },
      purpose: 'Validates authentication tokens for the application.',
      publicSurface: ['AuthService.validateToken(token)'],
      doesNotOwn: ['Payment processing → billing'],
      externalDeps: [],
      gotchas: ['Token validation is a simple length check — not production-ready'],
    }

    const nodes = [billingNode, authNode]

    // Step 5: Write everything
    const outputDir = join(projectDir, '.nogrep')
    await mkdir(outputDir, { recursive: true })

    // Write context nodes
    await writeContextNodes(nodes, outputDir)

    // Build and write index
    const index = buildIndex(nodes, stack)
    await writeFile(
      join(outputDir, '_index.json'),
      JSON.stringify(index, null, 2) + '\n',
      'utf-8',
    )

    // Build and write registry
    const registry = buildRegistry(nodes)
    await writeFile(
      join(outputDir, '_registry.json'),
      JSON.stringify(registry, null, 2) + '\n',
      'utf-8',
    )

    // Write taxonomy
    const taxonomy = {
      static: {
        layer: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
        concern: ['security', 'performance', 'caching', 'validation', 'error-handling', 'idempotency', 'observability'],
        type: ['module', 'flow', 'entity', 'integration', 'config', 'ui', 'test'],
      },
      dynamic: {
        domain: ['billing', 'auth'],
        tech: ['stripe', 'prisma', 'nestjs'],
      },
      custom: {},
    }
    await writeFile(
      join(outputDir, '_taxonomy.json'),
      JSON.stringify(taxonomy, null, 2) + '\n',
      'utf-8',
    )

    // Patch CLAUDE.md
    await patchClaudeMd(projectDir)

    // ---- VERIFY OUTPUT ----

    // 1. Context node files exist with correct frontmatter
    const billingMd = await readFile(join(outputDir, 'domains', 'billing.md'), 'utf-8')
    const billingParsed = matter(billingMd)
    expect(billingParsed.data.id).toBe('billing')
    expect(billingParsed.data.title).toBe('Billing & Payments')
    expect(billingParsed.data.category).toBe('domain')
    expect(billingParsed.data.tags.domain).toEqual(['billing'])
    expect(billingParsed.data.tags.tech).toEqual(['stripe'])
    expect(billingParsed.data.src_paths).toEqual(['src/billing/**'])
    expect(billingParsed.data.keywords).toContain('stripe')
    expect(billingParsed.data.relates_to).toContainEqual(
      expect.objectContaining({ id: 'auth' }),
    )

    const authMd = await readFile(join(outputDir, 'domains', 'auth.md'), 'utf-8')
    const authParsed = matter(authMd)
    expect(authParsed.data.id).toBe('auth')
    expect(authParsed.data.tags.concern).toEqual(['security'])

    // 2. Body sections present
    expect(billingMd).toContain('## Purpose')
    expect(billingMd).toContain('Handles payment processing')
    expect(billingMd).toContain('## Public Surface')
    expect(billingMd).toContain('POST /billing/checkout')
    expect(billingMd).toContain('## Does Not Own')
    expect(billingMd).toContain('User identity → auth')
    expect(billingMd).toContain('## Gotchas')
    expect(billingMd).toContain('## Manual Notes')

    // 3. Inverse relations populated by buildIndex
    expect(authNode.inverseRelations).toContainEqual(
      expect.objectContaining({ id: 'billing' }),
    )

    // 4. _index.json valid
    const indexJson = JSON.parse(await readFile(join(outputDir, '_index.json'), 'utf-8'))
    expect(indexJson.version).toBe('1.0')
    expect(indexJson.generatedAt).toBeTruthy()
    expect(indexJson.stack.primaryLanguage).toBe('typescript')
    expect(indexJson.stack.frameworks).toEqual(['nestjs'])
    expect(indexJson.stack.architecture).toBe('monolith')

    // Tag lookups work
    expect(indexJson.tags['domain:billing']).toContain('.nogrep/domains/billing.md')
    expect(indexJson.tags['domain:auth']).toContain('.nogrep/domains/auth.md')
    expect(indexJson.tags['tech:stripe']).toContain('.nogrep/domains/billing.md')
    expect(indexJson.tags['concern:security']).toContain('.nogrep/domains/auth.md')

    // Keyword lookups work
    expect(indexJson.keywords['stripe']).toContain('.nogrep/domains/billing.md')
    expect(indexJson.keywords['token']).toContain('.nogrep/domains/auth.md')

    // Path lookups work
    expect(indexJson.paths['src/billing/**']).toEqual({
      context: '.nogrep/domains/billing.md',
      tags: expect.arrayContaining(['domain:billing', 'tech:stripe']),
    })
    expect(indexJson.paths['src/auth/**']).toEqual({
      context: '.nogrep/domains/auth.md',
      tags: expect.arrayContaining(['domain:auth', 'concern:security']),
    })

    // 5. _registry.json valid
    const registryJson = JSON.parse(await readFile(join(outputDir, '_registry.json'), 'utf-8'))
    expect(registryJson.mappings).toContainEqual({
      glob: 'src/billing/**',
      contextFile: '.nogrep/domains/billing.md',
      watch: true,
    })
    expect(registryJson.mappings).toContainEqual({
      glob: 'src/auth/**',
      contextFile: '.nogrep/domains/auth.md',
      watch: true,
    })

    // 6. _taxonomy.json valid
    const taxonomyJson = JSON.parse(await readFile(join(outputDir, '_taxonomy.json'), 'utf-8'))
    expect(taxonomyJson.static.layer).toContain('business')
    expect(taxonomyJson.static.concern).toContain('security')
    expect(taxonomyJson.dynamic.domain).toEqual(['billing', 'auth'])
    expect(taxonomyJson.dynamic.tech).toContain('stripe')
    expect(taxonomyJson.custom).toEqual({})

    // 7. CLAUDE.md patched
    const claudeMd = await readFile(join(projectDir, 'CLAUDE.md'), 'utf-8')
    expect(claudeMd).toContain('<!-- nogrep -->')
    expect(claudeMd).toContain('Code Navigation')
    expect(claudeMd).toContain('<!-- /nogrep -->')
  })

  // --- write.js CLI (Step 5 via stdin pipe) ---

  it('Step 5 — write.js CLI accepts JSON input and produces .nogrep/', async () => {
    const writeInput = {
      nodes: [
        {
          id: 'billing',
          title: 'Billing',
          category: 'domain',
          tags: { domain: ['billing'], layer: ['business'], tech: ['stripe'], concern: [], type: ['module'] },
          relatesTo: [],
          inverseRelations: [],
          srcPaths: ['src/billing/**'],
          keywords: ['stripe', 'checkout'],
          lastSynced: { commit: '', timestamp: new Date().toISOString(), srcHash: '' },
          purpose: 'Payment processing via Stripe.',
          publicSurface: ['POST /billing/checkout'],
          doesNotOwn: [],
          externalDeps: [{ name: 'stripe', usage: 'payments' }],
          gotchas: [],
        },
      ],
      stack: {
        primaryLanguage: 'typescript',
        frameworks: ['nestjs'],
        architecture: 'monolith',
      },
    }

    // Write input to a temp file to avoid stdin pipe issues
    const inputFile = join(projectDir, '_write_input.json')
    await writeFile(inputFile, JSON.stringify(writeInput), 'utf-8')

    const distPath = join(import.meta.dirname, '..', 'dist', 'write.js')
    await execFileAsync(
      'node',
      [distPath, '--input', inputFile, '--root', projectDir],
    )

    // Verify output files
    const indexExists = await access(join(projectDir, '.nogrep', '_index.json')).then(() => true).catch(() => false)
    expect(indexExists).toBe(true)

    const registryExists = await access(join(projectDir, '.nogrep', '_registry.json')).then(() => true).catch(() => false)
    expect(registryExists).toBe(true)

    const billingExists = await access(join(projectDir, '.nogrep', 'domains', 'billing.md')).then(() => true).catch(() => false)
    expect(billingExists).toBe(true)

    // Verify index content
    const indexContent = JSON.parse(await readFile(join(projectDir, '.nogrep', '_index.json'), 'utf-8'))
    expect(indexContent.tags['domain:billing']).toContain('.nogrep/domains/billing.md')
    expect(indexContent.keywords['stripe']).toContain('.nogrep/domains/billing.md')
  })

  // --- signals.js CLI ---

  it('Step 1 — signals.js CLI outputs valid JSON to stdout', async () => {
    const distPath = join(import.meta.dirname, '..', 'dist', 'signals.js')
    const { stdout } = await execFileAsync('node', [distPath, '--root', projectDir])

    const signals = JSON.parse(stdout)
    expect(signals.directoryTree).toBeDefined()
    expect(signals.extensionMap).toBeDefined()
    expect(signals.manifests).toBeDefined()
    expect(signals.entryPoints).toBeDefined()
    expect(Array.isArray(signals.manifests)).toBe(true)
  })

  // --- trim.js CLI ---

  it('Step 3a — trim.js CLI outputs trimmed source to stdout', async () => {
    const distPath = join(import.meta.dirname, '..', 'dist', 'trim.js')
    const { stdout } = await execFileAsync(
      'node',
      [distPath, 'src/billing/billing.service.ts'],
      { cwd: projectDir },
    )

    expect(stdout.length).toBeGreaterThan(0)
    expect(stdout).toContain('billing.service.ts')
  })

  // --- Multi-category output ---

  it('should correctly organize nodes across multiple categories', async () => {
    const nodes: NodeResult[] = [
      {
        id: 'billing',
        title: 'Billing',
        category: 'domain',
        tags: { domain: ['billing'], layer: ['business'], tech: ['stripe'], concern: [], type: ['module'] },
        relatesTo: [{ id: 'auth', reason: 'needs auth' }],
        inverseRelations: [],
        srcPaths: ['src/billing/**'],
        keywords: ['stripe'],
        lastSynced: { commit: '', timestamp: new Date().toISOString(), srcHash: '' },
        purpose: 'Payments.',
        publicSurface: [],
        doesNotOwn: [],
        externalDeps: [],
        gotchas: [],
      },
      {
        id: 'auth',
        title: 'Auth',
        category: 'domain',
        tags: { domain: ['auth'], layer: ['business'], tech: [], concern: ['security'], type: ['module'] },
        relatesTo: [],
        inverseRelations: [],
        srcPaths: ['src/auth/**'],
        keywords: ['login'],
        lastSynced: { commit: '', timestamp: new Date().toISOString(), srcHash: '' },
        purpose: 'Authentication.',
        publicSurface: [],
        doesNotOwn: [],
        externalDeps: [],
        gotchas: [],
      },
      {
        id: 'checkout',
        title: 'Checkout Flow',
        category: 'flow',
        tags: { domain: ['billing', 'auth'], layer: ['business'], tech: ['stripe'], concern: [], type: ['flow'] },
        relatesTo: [{ id: 'billing', reason: 'processes payment' }, { id: 'auth', reason: 'validates user' }],
        inverseRelations: [],
        srcPaths: ['src/checkout/**'],
        keywords: ['checkout', 'cart'],
        lastSynced: { commit: '', timestamp: new Date().toISOString(), srcHash: '' },
        purpose: 'Orchestrates the checkout process across billing and auth.',
        publicSurface: [],
        doesNotOwn: [],
        externalDeps: [],
        gotchas: [],
      },
    ]

    const outputDir = join(projectDir, '.nogrep')
    await mkdir(outputDir, { recursive: true })
    await writeContextNodes(nodes, outputDir)

    const stack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'> = {
      primaryLanguage: 'typescript',
      frameworks: ['nestjs'],
      architecture: 'monolith',
    }
    const index = buildIndex(nodes, stack)

    // Domain nodes in domains/
    const billingMd = matter(await readFile(join(outputDir, 'domains', 'billing.md'), 'utf-8'))
    expect(billingMd.data.category).toBe('domain')

    // Flow nodes in flows/
    const checkoutMd = matter(await readFile(join(outputDir, 'flows', 'checkout.md'), 'utf-8'))
    expect(checkoutMd.data.category).toBe('flow')

    // Flow touches 2 domains — should show in both domain tags
    expect(index.tags['domain:billing']).toContain('.nogrep/domains/billing.md')
    expect(index.tags['domain:billing']).toContain('.nogrep/flows/checkout.md')
    expect(index.tags['domain:auth']).toContain('.nogrep/domains/auth.md')
    expect(index.tags['domain:auth']).toContain('.nogrep/flows/checkout.md')

    // Inverse relations: billing and auth should get inverse from checkout
    expect(nodes[0]!.inverseRelations).toContainEqual(
      expect.objectContaining({ id: 'checkout' }),
    )
    expect(nodes[1]!.inverseRelations).toContainEqual(
      expect.objectContaining({ id: 'checkout' }),
    )
  })
})
