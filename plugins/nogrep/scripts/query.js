import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import {
  NogrepError
} from "./chunk-3Z23YQWP.js";
import "./chunk-I2R4CRUX.js";

// scripts/query.ts
import { readFile } from "fs/promises";
import { join, resolve as resolvePath } from "path";
import { parseArgs } from "util";
function extractTerms(question, taxonomy) {
  const words = question.toLowerCase().replace(/[^\w\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  const tags = [];
  const keywords = [];
  const tagLookup = /* @__PURE__ */ new Map();
  for (const val of taxonomy.static.layer) {
    tagLookup.set(val.toLowerCase(), `layer:${val}`);
  }
  for (const val of taxonomy.static.concern) {
    tagLookup.set(val.toLowerCase(), `concern:${val}`);
  }
  for (const val of taxonomy.static.type) {
    tagLookup.set(val.toLowerCase(), `type:${val}`);
  }
  for (const val of taxonomy.dynamic.domain) {
    tagLookup.set(val.toLowerCase(), `domain:${val}`);
  }
  for (const val of taxonomy.dynamic.tech) {
    tagLookup.set(val.toLowerCase(), `tech:${val}`);
  }
  for (const [cat, values] of Object.entries(taxonomy.custom)) {
    for (const val of values) {
      tagLookup.set(val.toLowerCase(), `${cat}:${val}`);
    }
  }
  const stopWords = /* @__PURE__ */ new Set([
    "the",
    "is",
    "at",
    "in",
    "of",
    "on",
    "to",
    "a",
    "an",
    "and",
    "or",
    "for",
    "it",
    "do",
    "does",
    "how",
    "what",
    "where",
    "which",
    "when",
    "who",
    "why",
    "this",
    "that",
    "with",
    "from",
    "by",
    "be",
    "as",
    "are",
    "was",
    "were",
    "been",
    "has",
    "have",
    "had",
    "not",
    "but",
    "if",
    "my",
    "our",
    "its",
    "can",
    "will",
    "should",
    "would",
    "could",
    "about",
    "after",
    "work",
    "works",
    "use",
    "uses",
    "used"
  ]);
  for (const word of words) {
    const tag = tagLookup.get(word);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
    if (!tag && !stopWords.has(word)) {
      keywords.push(word);
    }
  }
  const questionLower = question.toLowerCase();
  for (const [val, tag] of tagLookup.entries()) {
    if (val.includes("-")) {
      const spacedVersion = val.replace(/-/g, " ");
      if (questionLower.includes(spacedVersion) && !tags.includes(tag)) {
        tags.push(tag);
      }
      if (questionLower.includes(val) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }
  return { tags, keywords };
}
function resolveQuery(terms, index, limit = 5) {
  const scoreMap = /* @__PURE__ */ new Map();
  function addMatch(contextFile, score, matchLabel) {
    const existing = scoreMap.get(contextFile);
    if (existing) {
      existing.score += score;
      existing.matchedOn.push(matchLabel);
    } else {
      scoreMap.set(contextFile, { score, matchedOn: [matchLabel] });
    }
  }
  for (const tag of terms.tags) {
    const files = index.tags[tag];
    if (files) {
      for (const file of files) {
        addMatch(file, 2, `tag:${tag}`);
      }
    }
  }
  for (const kw of terms.keywords) {
    const kwLower = kw.toLowerCase();
    const files = index.keywords[kwLower];
    if (files) {
      for (const file of files) {
        addMatch(file, 1, `keyword:${kwLower}`);
      }
    }
    for (const [indexKw, kwFiles] of Object.entries(index.keywords)) {
      if (indexKw === kwLower) continue;
      if (indexKw.includes(kwLower) || kwLower.includes(indexKw)) {
        for (const file of kwFiles) {
          addMatch(file, 1, `keyword:${indexKw}`);
        }
      }
    }
  }
  const results = [...scoreMap.entries()].sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0])).slice(0, limit).map(([contextFile, { score, matchedOn }]) => ({
    contextFile,
    score,
    matchedOn: [...new Set(matchedOn)],
    summary: `Matched: ${[...new Set(matchedOn)].join(", ")}`
  }));
  return results;
}
async function loadIndex(projectRoot) {
  const indexPath = join(projectRoot, ".nogrep", "_index.json");
  try {
    const content = await readFile(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    throw new NogrepError(
      "No .nogrep/_index.json found. Run /nogrep:init first.",
      "NO_INDEX"
    );
  }
}
async function loadTaxonomy(projectRoot) {
  const taxonomyPath = join(projectRoot, ".nogrep", "_taxonomy.json");
  try {
    const content = await readFile(taxonomyPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      static: {
        layer: ["presentation", "business", "data", "infrastructure", "cross-cutting"],
        concern: ["security", "performance", "caching", "validation", "error-handling", "idempotency", "observability"],
        type: ["module", "flow", "entity", "integration", "config", "ui", "test"]
      },
      dynamic: { domain: [], tech: [] },
      custom: {}
    };
  }
}
function buildTaxonomyFromIndex(index, baseTaxonomy) {
  const domains = new Set(baseTaxonomy.dynamic.domain);
  const techs = new Set(baseTaxonomy.dynamic.tech);
  for (const tagKey of Object.keys(index.tags)) {
    const [category, value] = tagKey.split(":");
    if (!category || !value) continue;
    if (category === "domain") domains.add(value);
    if (category === "tech") techs.add(value);
  }
  return {
    ...baseTaxonomy,
    dynamic: {
      domain: [...domains],
      tech: [...techs]
    }
  };
}
function formatPaths(results) {
  return results.map((r) => r.contextFile).join("\n");
}
function formatJson(results) {
  return JSON.stringify(results, null, 2);
}
function formatSummary(results) {
  if (results.length === 0) return "No matching context files found.";
  return results.map((r) => `- ${r.contextFile} (score: ${r.score}) \u2014 ${r.summary}`).join("\n");
}
async function main() {
  const { values } = parseArgs({
    options: {
      tags: { type: "string" },
      keywords: { type: "string" },
      question: { type: "string" },
      format: { type: "string", default: "json" },
      limit: { type: "string", default: "5" },
      root: { type: "string", default: process.cwd() }
    },
    strict: true
  });
  const root = resolvePath(values.root ?? process.cwd());
  const limit = parseInt(values.limit ?? "5", 10);
  const format = values.format ?? "json";
  const index = await loadIndex(root);
  const baseTaxonomy = await loadTaxonomy(root);
  const taxonomy = buildTaxonomyFromIndex(index, baseTaxonomy);
  let terms;
  if (values.question) {
    terms = extractTerms(values.question, taxonomy);
  } else if (values.tags || values.keywords) {
    const tags = values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const keywords = values.keywords ? values.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [];
    terms = { tags, keywords };
  } else {
    process.stderr.write(
      JSON.stringify({ error: "Usage: node query.js --tags <tags> | --keywords <words> | --question <text> [--format paths|json|summary] [--limit N]" }) + "\n"
    );
    process.exitCode = 1;
    return;
  }
  const results = resolveQuery(terms, index, limit);
  switch (format) {
    case "paths":
      process.stdout.write(formatPaths(results) + "\n");
      break;
    case "summary":
      process.stdout.write(formatSummary(results) + "\n");
      break;
    case "json":
    default:
      process.stdout.write(formatJson(results) + "\n");
      break;
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    if (err instanceof NogrepError) {
      process.stderr.write(JSON.stringify({ error: err.message, code: err.code }) + "\n");
    } else {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(JSON.stringify({ error: message }) + "\n");
    }
    process.exitCode = 1;
  });
}
export {
  extractTerms,
  resolveQuery
};
//# sourceMappingURL=query.js.map