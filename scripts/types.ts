// --- Directory / File types ---

export interface DirectoryNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: DirectoryNode[]
}

export interface ManifestFile {
  path: string
  type: string
  depth: number
}

export interface ChurnEntry {
  path: string
  changes: number
}

export interface FileSize {
  path: string
  bytes: number
}

// --- Signal collection ---

export interface SignalResult {
  directoryTree: DirectoryNode[]
  extensionMap: Record<string, number>
  manifests: ManifestFile[]
  entryPoints: string[]
  gitChurn: ChurnEntry[]
  largeFiles: FileSize[]
  envFiles: string[]
  testFiles: string[]
}

// --- Stack detection ---

export interface StackConventions {
  entryPattern: string
  testPattern: string
  configLocation: string
}

export interface DomainCluster {
  name: string
  path: string
  confidence: number
}

export interface StackResult {
  primaryLanguage: string
  frameworks: string[]
  architecture: 'monolith' | 'monorepo' | 'multi-repo' | 'microservice' | 'library'
  domainClusters: DomainCluster[]
  conventions: StackConventions
  stackHints: string
  dynamicTaxonomy: { domain: string[]; tech: string[] }
}

// --- Tags ---

export interface TagSet {
  domain: string[]
  layer: string[]
  tech: string[]
  concern: string[]
  type: string[]
}

export interface Taxonomy {
  static: {
    layer: string[]
    concern: string[]
    type: string[]
  }
  dynamic: {
    domain: string[]
    tech: string[]
  }
  custom: Record<string, string[]>
}

// --- Relations ---

export interface Relation {
  id: string
  reason: string
}

export interface ExternalDep {
  name: string
  usage: string
}

export interface SyncMeta {
  commit: string
  timestamp: string
  srcHash: string
}

// --- Context nodes ---

export interface NodeResult {
  id: string
  title: string
  category: 'domain' | 'architecture' | 'flow' | 'entity'
  tags: TagSet
  relatesTo: Relation[]
  inverseRelations: Relation[]
  srcPaths: string[]
  keywords: string[]
  lastSynced: SyncMeta
  purpose: string
  publicSurface: string[]
  doesNotOwn: string[]
  externalDeps: ExternalDep[]
  gotchas: string[]
}

// --- Index ---

export interface PathEntry {
  context: string
  tags: string[]
}

export interface IndexJson {
  version: string
  generatedAt: string
  commit: string
  stack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'>
  tags: Record<string, string[]>
  keywords: Record<string, string[]>
  paths: Record<string, PathEntry>
}

// --- Registry ---

export interface RegistryMapping {
  glob: string
  contextFile: string
  watch: boolean
}

export interface RegistryJson {
  mappings: RegistryMapping[]
}

// --- Query ---

export interface RankedResult {
  contextFile: string
  score: number
  matchedOn: string[]
  summary: string
}

// --- Validation ---

export interface StaleResult {
  file: string
  isStale: boolean
  reason?: string
}

// --- Settings ---

export interface NogrepSettings {
  enabled: boolean
}

// --- Errors ---

export type NogrepErrorCode = 'NO_INDEX' | 'NO_GIT' | 'IO_ERROR' | 'STALE'

export class NogrepError extends Error {
  constructor(
    message: string,
    public code: NogrepErrorCode,
  ) {
    super(message)
  }
}
