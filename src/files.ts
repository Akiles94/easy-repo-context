import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "out", ".next", "coverage", "vendor", "target", ".venv", "venv", "__pycache__"]);

/** Repo files as POSIX paths relative to root. Uses git (respects .gitignore) when available. */
export function listFiles(root: string): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\0").filter(Boolean).sort();
  } catch {
    return walk(root, root).sort();
  }
}

function walk(root: string, dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...walk(root, join(dir, entry.name)));
    } else if (entry.isFile()) {
      files.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
    }
  }
  return files;
}

/** Normalize Windows line endings so parsing and hashing behave the same on every OS. */
export const toLf = (text: string): string => text.replace(/\r\n?/g, "\n");

export function readText(root: string, path: string): string {
  return toLf(readFileSync(join(root, path), "utf8"));
}

export function fileSize(root: string, path: string): number {
  try {
    return statSync(join(root, path)).size;
  } catch {
    return 0;
  }
}

/** Rough token estimate (~4 chars per token for English text and code). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}
