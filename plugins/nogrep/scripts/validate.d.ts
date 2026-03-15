import { StaleResult } from './types.js';

declare function checkFreshness(nodeFile: string, projectRoot: string): Promise<StaleResult>;
declare function validateAll(projectRoot: string): Promise<{
    total: number;
    fresh: StaleResult[];
    stale: StaleResult[];
}>;

export { checkFreshness, validateAll };
