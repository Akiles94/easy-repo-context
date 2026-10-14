import { existsSync } from "node:fs";
import { join } from "node:path";
import { readText } from "./files.js";

export type CommandRole = "install" | "build" | "test" | "lint" | "format" | "typecheck" | "run" | "other";

export interface RepoCommand {
  role: CommandRole;
  command: string;
  /** Where the command comes from, e.g. `package.json#scripts.test`. Every command must have one. */
  source: string;
}

const ROLE_PATTERNS: [CommandRole, RegExp][] = [
  ["typecheck", /^(typecheck|type-check|tsc|check-types|types)$/],
  ["test", /^test(s)?$|^test:/],
  ["lint", /^lint$|^lint:|^check$/],
  ["format", /^(format|fmt|prettier)$|^format:/],
  ["build", /^build$|^compile$|^build:/],
  ["run", /^(start|dev|serve|run)$/],
];

export function roleOf(name: string): CommandRole {
  // watch/interactive scripts never finish; an agent must not run them
  if (/(^|:)watch$|:ui$/.test(name)) return "other";
  return ROLE_PATTERNS.find(([, re]) => re.test(name))?.[0] ?? "other";
}

export function detectPackageManager(root: string): "npm" | "pnpm" | "yarn" | "bun" {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  return "npm";
}

export function detectCommands(root: string, files: string[]): RepoCommand[] {
  const set = new Set(files);
  const commands: RepoCommand[] = [];

  if (set.has("package.json")) {
    const pm = detectPackageManager(root);
    const lock = { npm: "package-lock.json", pnpm: "pnpm-lock.yaml", yarn: "yarn.lock", bun: "bun.lock" }[pm];
    commands.push({ role: "install", command: pm === "npm" && set.has(lock) ? "npm ci" : `${pm} install`, source: set.has(lock) ? lock : "package.json" });
    try {
      const pkg = JSON.parse(readText(root, "package.json")) as { scripts?: Record<string, string> };
      for (const name of Object.keys(pkg.scripts ?? {})) {
        if (/^(pre|post)/.test(name) && pkg.scripts?.[name.replace(/^(pre|post)/, "")]) continue;
        commands.push({ role: roleOf(name), command: name === "test" ? `${pm} test` : `${pm} run ${name}`, source: `package.json#scripts.${name}` });
      }
    } catch {
      // unreadable package.json: report nothing rather than guess
    }
  }

  for (const makefile of ["Makefile", "makefile", "GNUmakefile"]) {
    if (!set.has(makefile)) continue;
    for (const target of makeTargets(readText(root, makefile))) {
      commands.push({ role: roleOf(target), command: `make ${target}`, source: `${makefile}:${target}` });
    }
  }

  for (const justfile of ["justfile", "Justfile", ".justfile"]) {
    if (!set.has(justfile)) continue;
    for (const recipe of justRecipes(readText(root, justfile))) {
      commands.push({ role: roleOf(recipe), command: `just ${recipe}`, source: `${justfile}:${recipe}` });
    }
  }

  return commands;
}

export function makeTargets(text: string): string[] {
  const targets = new Set<string>();
  for (const line of text.split("\n")) {
    const m = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?!=)/.exec(line);
    if (m?.[1] && !m[1].startsWith(".")) targets.add(m[1]);
  }
  return [...targets];
}

export function justRecipes(text: string): string[] {
  const recipes = new Set<string>();
  for (const line of text.split("\n")) {
    const m = /^@?([A-Za-z0-9_-]+)(\s+[^:]*)?:(?!=)/.exec(line);
    if (m?.[1] && !["set", "export", "import", "mod", "alias"].includes(m[1])) recipes.add(m[1]);
  }
  return [...recipes];
}
