import { SignalResult } from './types.js';

interface CollectOptions {
    exclude?: string[];
    maxDepth?: number;
}
declare function collectSignals(root: string, options?: CollectOptions): Promise<SignalResult>;

export { collectSignals };
