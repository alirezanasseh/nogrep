import { NodeResult, StackResult, IndexJson, RegistryJson } from './types.js';

declare function writeContextNodes(nodes: NodeResult[], outputDir: string): Promise<void>;
declare function buildIndex(nodes: NodeResult[], stack: Pick<StackResult, 'primaryLanguage' | 'frameworks' | 'architecture'>): IndexJson;
declare function buildRegistry(nodes: NodeResult[]): RegistryJson;

export { buildIndex, buildRegistry, writeContextNodes };
