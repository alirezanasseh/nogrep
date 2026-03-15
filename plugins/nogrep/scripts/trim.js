import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import "./chunk-I2R4CRUX.js";

// scripts/trim.ts
import { readFile } from "fs/promises";
import { resolve, extname } from "path";
var MAX_CLUSTER_LINES = 300;
function trimTypeScript(content) {
  const lines = content.split("\n");
  const result = [];
  let braceDepth = 0;
  let inBody = false;
  let bodyStartDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (braceDepth === 0 || !inBody) {
      if (trimmed === "" || trimmed.startsWith("import ") || trimmed.startsWith("export type ") || trimmed.startsWith("export interface ") || trimmed.startsWith("export enum ") || trimmed.startsWith("export const ") || trimmed.startsWith("type ") || trimmed.startsWith("interface ") || trimmed.startsWith("enum ") || trimmed.startsWith("@") || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("declare ")) {
        result.push(line);
        braceDepth += countChar(trimmed, "{") - countChar(trimmed, "}");
        continue;
      }
    }
    const openBraces = countChar(trimmed, "{");
    const closeBraces = countChar(trimmed, "}");
    if (!inBody) {
      if (isSignatureLine(trimmed) && openBraces > closeBraces) {
        result.push(line);
        braceDepth += openBraces - closeBraces;
        inBody = true;
        bodyStartDepth = braceDepth;
        continue;
      }
      if (isClassOrInterfaceLine(trimmed)) {
        result.push(line);
        braceDepth += openBraces - closeBraces;
        continue;
      }
      result.push(line);
      braceDepth += openBraces - closeBraces;
    } else {
      braceDepth += openBraces - closeBraces;
      if (braceDepth < bodyStartDepth) {
        result.push(line);
        inBody = false;
      }
    }
  }
  return result.join("\n");
}
function trimPython(content) {
  const lines = content.split("\n");
  const result = [];
  let skipIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (skipIndent >= 0) {
      if (trimmed === "" || indent > skipIndent) {
        continue;
      }
      skipIndent = -1;
    }
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("import ") || trimmed.startsWith("from ") || trimmed.startsWith("@") || trimmed.startsWith("class ") || /^[A-Z_][A-Z_0-9]*\s*=/.test(trimmed)) {
      result.push(line);
      continue;
    }
    if (trimmed.startsWith("def ") || trimmed.startsWith("async def ")) {
      result.push(line);
      const docIdx = findDocstring(lines, i + 1, indent);
      if (docIdx > i) {
        for (let j = i + 1; j <= docIdx; j++) {
          result.push(lines[j]);
        }
      }
      skipIndent = indent;
      continue;
    }
    result.push(line);
  }
  return result.join("\n");
}
function trimJava(content) {
  const lines = content.split("\n");
  const result = [];
  let braceDepth = 0;
  let inBody = false;
  let bodyStartDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (braceDepth === 0 || !inBody) {
      if (trimmed === "" || trimmed.startsWith("import ") || trimmed.startsWith("package ") || trimmed.startsWith("@") || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("public interface ") || trimmed.startsWith("interface ") || trimmed.startsWith("public enum ") || trimmed.startsWith("enum ")) {
        result.push(line);
        braceDepth += countChar(trimmed, "{") - countChar(trimmed, "}");
        continue;
      }
    }
    const openBraces = countChar(trimmed, "{");
    const closeBraces = countChar(trimmed, "}");
    if (!inBody) {
      if (isJavaMethodSignature(trimmed) && openBraces > closeBraces) {
        result.push(line);
        braceDepth += openBraces - closeBraces;
        inBody = true;
        bodyStartDepth = braceDepth;
        continue;
      }
      if (isJavaClassLine(trimmed)) {
        result.push(line);
        braceDepth += openBraces - closeBraces;
        continue;
      }
      result.push(line);
      braceDepth += openBraces - closeBraces;
    } else {
      braceDepth += openBraces - closeBraces;
      if (braceDepth < bodyStartDepth) {
        result.push(line);
        inBody = false;
      }
    }
  }
  return result.join("\n");
}
function trimGeneric(content) {
  return content;
}
function countChar(s, ch) {
  let count = 0;
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === stringChar && s[i - 1] !== "\\") inString = false;
    } else if (c === '"' || c === "'" || c === "`") {
      inString = true;
      stringChar = c;
    } else if (c === ch) {
      count++;
    }
  }
  return count;
}
function isSignatureLine(trimmed) {
  return /^(export\s+)?(async\s+)?function\s/.test(trimmed) || /^(public|private|protected|static|async|get|set|\*)\s/.test(trimmed) || /^(readonly\s+)?[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/.test(trimmed) || /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/.test(trimmed) || /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/.test(trimmed) || // Arrow function assigned at class level
  /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*(async\s+)?\(/.test(trimmed);
}
function isClassOrInterfaceLine(trimmed) {
  return /^(export\s+)?(abstract\s+)?(class|interface|enum)\s/.test(trimmed) || /^(export\s+)?namespace\s/.test(trimmed);
}
function isJavaMethodSignature(trimmed) {
  return /^(public|private|protected|static|final|abstract|synchronized|native)\s/.test(trimmed) && /\(/.test(trimmed);
}
function isJavaClassLine(trimmed) {
  return /^(public|private|protected)?\s*(abstract\s+)?(class|interface|enum)\s/.test(trimmed);
}
function findDocstring(lines, startIdx, defIndent) {
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      const quote = trimmed.slice(0, 3);
      if (trimmed.length > 3 && trimmed.endsWith(quote)) return i;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim().endsWith(quote)) return j;
      }
      return i;
    }
    return startIdx - 1;
  }
  return startIdx - 1;
}
function getTrimmer(filePath) {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return trimTypeScript;
    case ".py":
      return trimPython;
    case ".java":
    case ".kt":
    case ".kts":
    case ".scala":
    case ".groovy":
      return trimJava;
    case ".go":
    case ".rs":
    case ".c":
    case ".cpp":
    case ".h":
    case ".hpp":
    case ".cs":
    case ".swift":
    case ".dart":
      return trimJava;
    // brace-based languages use same strategy
    default:
      return trimGeneric;
  }
}
async function trimCluster(paths, projectRoot) {
  const results = [];
  for (const filePath of paths) {
    const absPath = resolve(projectRoot, filePath);
    try {
      const raw = await readFile(absPath, "utf-8");
      const trimmer = getTrimmer(filePath);
      const trimmed = trimmer(raw);
      results.push({
        path: filePath,
        content: trimmed,
        lines: trimmed.split("\n").length
      });
    } catch {
      if (process.env["NOGREP_DEBUG"] === "1") {
        process.stderr.write(`[nogrep] Could not read: ${absPath}
`);
      }
    }
  }
  results.sort((a, b) => a.lines - b.lines);
  const output = [];
  let totalLines = 0;
  const maxLines = MAX_CLUSTER_LINES;
  for (const file of results) {
    const header = `// === ${file.path} ===`;
    const fileLines = file.content.split("\n");
    const available = maxLines - totalLines - 2;
    if (available <= 0) break;
    output.push(header);
    if (fileLines.length <= available) {
      output.push(file.content);
    } else {
      output.push(fileLines.slice(0, available).join("\n"));
      output.push(`// ... truncated (${fileLines.length - available} more lines)`);
    }
    output.push("");
    totalLines += Math.min(fileLines.length, available) + 2;
  }
  return output.join("\n");
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write("Usage: node trim.js <path1> <path2> ...\n");
    process.exit(1);
  }
  const projectRoot = process.cwd();
  const result = await trimCluster(args, projectRoot);
  process.stdout.write(result);
}
var isDirectRun = process.argv[1]?.endsWith("trim.js") || process.argv[1]?.endsWith("trim.ts");
if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  });
}
export {
  trimCluster
};
//# sourceMappingURL=trim.js.map