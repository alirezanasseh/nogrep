import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import "./chunk-I2R4CRUX.js";

// scripts/settings.ts
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { parseArgs } from "util";
var SETTINGS_FILE = ".claude/settings.json";
var SETTINGS_LOCAL_FILE = ".claude/settings.local.json";
async function readJsonFile(path) {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}
async function readSettings(projectRoot) {
  const sharedPath = join(projectRoot, SETTINGS_FILE);
  const localPath = join(projectRoot, SETTINGS_LOCAL_FILE);
  const shared = await readJsonFile(sharedPath);
  const local = await readJsonFile(localPath);
  const enabled = local.nogrep?.enabled ?? shared.nogrep?.enabled ?? false;
  return { enabled };
}
async function writeSettings(projectRoot, settings, local) {
  const filePath = join(
    projectRoot,
    local ? SETTINGS_LOCAL_FILE : SETTINGS_FILE
  );
  await ensureDir(join(projectRoot, ".claude"));
  const existing = await readJsonFile(filePath);
  existing.nogrep = { ...existing.nogrep, ...settings };
  await writeFile(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}
async function main() {
  const { values } = parseArgs({
    options: {
      set: { type: "string" },
      get: { type: "boolean", default: false },
      local: { type: "boolean", default: false },
      root: { type: "string", default: process.cwd() }
    },
    strict: true
  });
  const root = values.root ?? process.cwd();
  if (values.get) {
    const settings = await readSettings(root);
    process.stdout.write(JSON.stringify(settings, null, 2) + "\n");
    return;
  }
  if (values.set) {
    const [key, value] = values.set.split("=");
    if (key === "enabled") {
      const enabled = value === "true";
      await writeSettings(root, { enabled }, values.local);
    } else {
      process.stderr.write(JSON.stringify({ error: `Unknown setting: ${key}` }) + "\n");
      process.exitCode = 1;
    }
    return;
  }
  process.stderr.write(JSON.stringify({ error: "Usage: node settings.js --set enabled=true [--local] | --get" }) + "\n");
  process.exitCode = 1;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(JSON.stringify({ error: message }) + "\n");
    process.exitCode = 1;
  });
}
export {
  readSettings,
  writeSettings
};
//# sourceMappingURL=settings.js.map