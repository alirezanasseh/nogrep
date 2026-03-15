import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import "./chunk-I2R4CRUX.js";

// scripts/signals.ts
import { readdir, stat } from "fs/promises";
import { join, extname, relative, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".next",
  ".nuxt",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".nogrep"
]);
var MANIFEST_NAMES = {
  "package.json": "npm",
  "requirements.txt": "pip",
  "pom.xml": "maven",
  "go.mod": "go",
  "Podfile": "cocoapods",
  "Cargo.toml": "cargo",
  "pubspec.yaml": "flutter",
  "composer.json": "composer"
};
var ENTRY_NAMES = /* @__PURE__ */ new Set(["main", "index", "app", "server"]);
var TEST_PATTERNS = [
  /\.test\.\w+$/,
  /\.spec\.\w+$/,
  /_test\.\w+$/,
  /^test_.*\.py$/
];
async function collectSignals(root, options = {}) {
  const absRoot = resolve(root);
  const maxDepth = options.maxDepth ?? 4;
  const extraSkip = new Set(options.exclude ?? []);
  const allFiles = [];
  const extensionMap = {};
  const manifests = [];
  const entryPoints = [];
  const envFiles = [];
  const testFiles = [];
  const directoryTree = await walkDirectory(absRoot, absRoot, 0, maxDepth, extraSkip, {
    allFiles,
    extensionMap,
    manifests,
    entryPoints,
    envFiles,
    testFiles
  });
  const gitChurn = await collectGitChurn(absRoot);
  const largeFiles = allFiles.sort((a, b) => b.bytes - a.bytes).slice(0, 20).map((f) => ({ path: f.path, bytes: f.bytes }));
  return {
    directoryTree,
    extensionMap,
    manifests,
    entryPoints,
    gitChurn,
    largeFiles,
    envFiles,
    testFiles
  };
}
async function walkDirectory(dir, root, depth, maxDepth, extraSkip, collectors) {
  if (depth > maxDepth) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || extraSkip.has(entry.name)) continue;
      const children = await walkDirectory(fullPath, root, depth + 1, maxDepth, extraSkip, collectors);
      nodes.push({ name: entry.name, path: relPath, type: "directory", children });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
      let fileBytes = 0;
      try {
        const s = await stat(fullPath);
        fileBytes = s.size;
      } catch {
      }
      collectors.allFiles.push({ path: relPath, bytes: fileBytes });
      const ext = extname(entry.name);
      if (ext) {
        collectors.extensionMap[ext] = (collectors.extensionMap[ext] ?? 0) + 1;
      }
      if (entry.name in MANIFEST_NAMES) {
        collectors.manifests.push({
          path: relPath,
          type: MANIFEST_NAMES[entry.name],
          depth
        });
      }
      if (depth <= 1 || depth === 2 && dir.endsWith("/src")) {
        const nameWithoutExt = entry.name.replace(/\.\w+$/, "");
        if (ENTRY_NAMES.has(nameWithoutExt)) {
          collectors.entryPoints.push(relPath);
        }
      }
      if (entry.name.startsWith(".env")) {
        collectors.envFiles.push(relPath);
      }
      if (depth === 0 && entry.name.match(/^config\./)) {
        collectors.envFiles.push(relPath);
      }
      const fileName = entry.name;
      if (TEST_PATTERNS.some((p) => p.test(fileName))) {
        collectors.testFiles.push(relPath);
      }
    }
  }
  const dirName = dir.split("/").pop();
  if (dirName === "config" && depth <= 2) {
    collectors.envFiles.push(relative(root, dir));
  }
  return nodes;
}
async function collectGitChurn(root) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--stat", "--oneline", "-50", "--pretty=format:"],
      { cwd: root, maxBuffer: 1024 * 1024 }
    );
    const changeCounts = {};
    for (const line of stdout.split("\n")) {
      const match = line.match(/^\s+(.+?)\s+\|\s+(\d+)/);
      if (match) {
        const filePath = match[1].trim();
        const changes = parseInt(match[2], 10);
        changeCounts[filePath] = (changeCounts[filePath] ?? 0) + changes;
      }
    }
    return Object.entries(changeCounts).sort(([, a], [, b]) => b - a).slice(0, 20).map(([path, changes]) => ({ path, changes }));
  } catch {
    return [];
  }
}
async function main() {
  const args = process.argv.slice(2);
  let root = ".";
  const exclude = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = args[i + 1];
      i++;
    } else if (args[i] === "--exclude" && args[i + 1]) {
      exclude.push(...args[i + 1].split(","));
      i++;
    }
  }
  const result = await collectSignals(root, { exclude });
  process.stdout.write(JSON.stringify(result, null, 2));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(JSON.stringify({ error: String(err) }));
    process.exit(1);
  });
}
export {
  collectSignals
};
//# sourceMappingURL=signals.js.map