import { Taxonomy, IndexJson, RankedResult } from './types.js';

declare function extractTerms(question: string, taxonomy: Taxonomy): {
    tags: string[];
    keywords: string[];
};
declare function resolveQuery(terms: {
    tags: string[];
    keywords: string[];
}, index: IndexJson, limit?: number): RankedResult[];

export { extractTerms, resolveQuery };
