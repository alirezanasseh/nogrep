interface DirectoryNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: DirectoryNode[];
}
interface ManifestFile {
    path: string;
    type: string;
    depth: number;
}
interface ChurnEntry {
    path: string;
    changes: number;
}
interface FileSize {
    path: string;
    bytes: number;
}
interface SignalResult {
    directoryTree: DirectoryNode[];
    extensionMap: Record<string, number>;
    manifests: ManifestFile[];
    entryPoints: string[];
    gitChurn: ChurnEntry[];
    largeFiles: FileSize[];
    envFiles: string[];
    testFiles: string[];
}
interface StackConventions {
    entryPattern: string;
    testPattern: string;
    configLocation: string;
}
interface DomainCluster {
    name: string;
    path: string;
    confidence: number;
}
interface StackResult {
    primaryLanguage: string;
    frameworks: string[];
    architecture: 'monolith' | 'monorepo' | 'multi-repo' | 'microservice' | 'library';
    domainClusters: DomainCluster[];
    conventions: StackConventions;
    stackHints: string;
    dynamicTaxonomy: {
        domain: string[];
        tech: string[];
    };
}
interface TagSet {
    domain: string[];
    layer: string[];
    tech: string[];
    concern: string[];
    type: string[];
}
interface Taxonomy {
    static: {
        layer: string[];
        concern: string[];
        type: string[];
    };
    dynamic: {
        domain: string[];
        tech: string[];
    };
    custom: Record<string, string[]>;
}
interface Relation {
    id: string;
    reason: string;
}
interface ExternalDep {
    name: string;
    usage: string;
}
interface SyncMeta {
    commit: string;
    timestamp: string;
    srcHash: string;
}
interface NodeResult {
    id: string;
    title: string;
    category: 'domain' | 'architecture' | 'flow' | 'entity';
    tags: TagSet;
    relatesTo: Relation[];
    inverseRelations: Relation[];
    srcPaths: string[];
    keywords: string[];
    lastSynced: SyncMeta;
    purpose: string;
    publicSurface: string[];
    doesNotOwn: string[];
    externalDeps: ExternalDep[];
    gotchas: string[];
}
interface PathEntry {
    context: string;
    tags: string[];
}
interface IndexJson {
    version: string;
    generatedAt: string;
    commit: string;
    stack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'>;
    tags: Record<string, string[]>;
    keywords: Record<string, string[]>;
    paths: Record<string, PathEntry>;
}
interface RegistryMapping {
    glob: string;
    contextFile: string;
    watch: boolean;
}
interface RegistryJson {
    mappings: RegistryMapping[];
}
interface RankedResult {
    contextFile: string;
    score: number;
    matchedOn: string[];
    summary: string;
}
interface StaleResult {
    file: string;
    isStale: boolean;
    reason?: string;
}
interface NogrepSettings {
    enabled: boolean;
}
type NogrepErrorCode = 'NO_INDEX' | 'NO_GIT' | 'IO_ERROR' | 'STALE';
declare class NogrepError extends Error {
    code: NogrepErrorCode;
    constructor(message: string, code: NogrepErrorCode);
}

export { type ChurnEntry, type DirectoryNode, type DomainCluster, type ExternalDep, type FileSize, type IndexJson, type ManifestFile, type NodeResult, NogrepError, type NogrepErrorCode, type NogrepSettings, type PathEntry, type RankedResult, type RegistryJson, type RegistryMapping, type Relation, type SignalResult, type StackConventions, type StackResult, type StaleResult, type SyncMeta, type TagSet, type Taxonomy };
