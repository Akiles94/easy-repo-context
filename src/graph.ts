import { posix } from "node:path";
import { readText } from "./files.js";
import { languageOf } from "./plan.js";

export const isTestFile = (p: string) =>
  /(^|\/)(__tests__|__mocks__|tests?|spec|fixtures?|__fixtures__|e2e|testing)\//.test(p) || /\.(test|spec|stories)\.[a-z]+$/.test(p) || /(^|\/)test_[^/]+\.py$|_test\.(py|go)$/.test(p);

/** Source files worth analysing: known language, not tests, not generated. */
export function sourceFiles(files: string[]): string[] {
  return files.filter(
    (f) => languageOf(f) !== undefined && !isTestFile(f) && !/(^|\/)(generated|__generated__|migrations?)\//.test(f) && !/(^|\/)\./.test(f),
  );
}

const JS_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
const JS_IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;(=,])import\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const PY_IMPORT = /^\s*from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)|^\s*import\s+([\w.]+)/gm;

export interface ImportGraph {
  /** file → files it imports (resolved, in-repo only). */
  edges: Map<string, string[]>;
}

export interface GraphOptions {
  /** Bare-specifier prefix → repo directory (tsconfig `paths`, workspace packages). */
  aliases?: Map<string, string>;
}

export function buildImportGraph(root: string, files: string[], options: GraphOptions = {}): ImportGraph {
  const all = new Set(files);
  const aliases = options.aliases ?? new Map<string, string>();
  const edges = new Map<string, string[]>();
  for (const file of files) {
    let text: string;
    try {
      text = readText(root, file);
    } catch {
      continue;
    }
    const targets = new Set<string>();
    if (/\.py$/.test(file)) {
      for (const m of text.matchAll(PY_IMPORT)) {
        for (const t of resolvePython(file, m, all)) targets.add(t);
      }
    } else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|svelte)$/.test(file)) {
      for (const m of text.matchAll(JS_IMPORT)) {
        const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
        const resolved = spec ? resolveJs(file, spec, all, aliases) : undefined;
        if (resolved && resolved !== file) targets.add(resolved);
      }
    }
    edges.set(file, [...targets]);
  }
  return { edges };
}

function resolveJs(from: string, spec: string, files: Set<string>, aliases: Map<string, string>): string | undefined {
  let base: string | undefined;
  if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), spec));
  else {
    for (const [prefix, dir] of aliases) {
      if (spec === prefix || spec.startsWith(`${prefix}/`)) {
        base = posix.normalize(posix.join(dir, spec.slice(prefix.length)));
        break;
      }
    }
  }
  if (base === undefined) return undefined;
  const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  for (const candidate of [base, stripped]) {
    for (const ext of JS_EXT) if (files.has(candidate + ext)) return candidate + ext;
  }
  return undefined;
}

function resolvePython(from: string, m: RegExpMatchArray, files: Set<string>): string[] {
  const toFile = (dotted: string): string | undefined => {
    const path = dotted.replace(/\./g, "/");
    for (const c of [`${path}.py`, `${path}/__init__.py`, `src/${path}.py`, `src/${path}/__init__.py`]) if (files.has(c)) return c;
    return undefined;
  };
  if (m[3]) return [toFile(m[3])].filter((x): x is string => !!x);
  const mod = m[1] ?? "";
  const dots = /^\.*/.exec(mod)?.[0].length ?? 0;
  let dotted = mod.slice(dots);
  if (dots > 0) {
    let dir = posix.dirname(from);
    for (let i = 1; i < dots; i++) dir = posix.dirname(dir);
    dotted = [dir.replace(/\//g, "."), dotted].filter(Boolean).join(".");
  }
  const out = [toFile(dotted)];
  // `from pkg import module` imports a submodule, not just a name.
  for (const name of (m[2] ?? "").replace(/[()]/g, "").split(",").map((s) => s.trim().split(/\s+/)[0] ?? "")) {
    if (name && name !== "*") out.push(toFile(`${dotted}.${name}`));
  }
  return out.filter((x): x is string => !!x);
}

/** Aliases from tsconfig `compilerOptions.paths` (`@x/*` → dir) and workspace package names. */
export function detectAliases(root: string, files: string[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const tsconfig of files.filter((f) => /(^|\/)tsconfig[\w.]*\.json$/.test(f))) {
    try {
      const json = JSON.parse(stripJsonComments(readText(root, tsconfig))) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
      const dir = posix.dirname(tsconfig);
      const baseUrl = posix.join(dir, json.compilerOptions?.baseUrl ?? ".");
      for (const [key, targets] of Object.entries(json.compilerOptions?.paths ?? {})) {
        const target = targets[0];
        if (!target) continue;
        aliases.set(key.replace(/\/\*$/, ""), posix.normalize(posix.join(baseUrl, target.replace(/\/\*$/, ""))));
      }
      // baseUrl-relative bare imports (`import x from "server/models"`)
      if (json.compilerOptions?.baseUrl !== undefined) {
        for (const top of new Set(files.map((f) => f.split("/")[0] ?? ""))) {
          if (top && !top.startsWith(".") && !aliases.has(top) && files.some((f) => f.startsWith(`${posix.join(baseUrl, top)}/`))) {
            aliases.set(top, posix.normalize(posix.join(baseUrl, top)));
          }
        }
      }
    } catch {
      // unparsable tsconfig: no aliases from it
    }
  }
  for (const pkg of files.filter((f) => f.endsWith("package.json") && f !== "package.json" && !f.includes("node_modules"))) {
    try {
      const name = (JSON.parse(readText(root, pkg)) as { name?: string }).name;
      if (name) aliases.set(name, posix.dirname(pkg));
    } catch {
      // ignore
    }
  }
  return new Map([...aliases].sort((a, b) => b[0].length - a[0].length));
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
}

const LAYERS = new Set(["domain", "application", "infra", "infrastructure", "adapters", "ports", "core", "use-cases", "usecases", "entities", "services", "utils", "lib", "common", "types"]);
const WRAPPERS = new Set(["src", "lib", "source", "pkg", "internal"]);

/**
 * Map files to coarse modules. Wrapper dirs (`src/`) are skipped; a top-level dir holding more
 * than a quarter of the code is split into its subdirs unless those are architecture layers.
 */
export function moduleMap(files: string[]): Map<string, string> {
  const strip = (f: string) => {
    const parts = f.split("/");
    while (parts.length > 1 && WRAPPERS.has(parts[0] ?? "")) parts.shift();
    return parts;
  };
  const top = (f: string) => {
    const parts = strip(f);
    return parts.length > 1 ? (parts[0] as string) : "(root)";
  };
  const counts = new Map<string, number>();
  for (const f of files) counts.set(top(f), (counts.get(top(f)) ?? 0) + 1);
  const split = new Set<string>();
  for (const [mod, n] of counts) {
    if (n <= files.length / 4) continue;
    const subdirs = new Set(files.filter((f) => top(f) === mod).map((f) => strip(f)[1]).filter((s, _, a) => s && a.length > 0));
    // Layered architectures (domain/application/infra) keep the module whole; a few `utils/` don't count.
    const layers = [...subdirs].filter((s) => s && LAYERS.has(s)).length;
    const layered = layers >= 2 && layers >= subdirs.size / 2;
    if (!layered && subdirs.size > 1) split.add(mod);
  }
  const map = new Map<string, string>();
  for (const f of files) {
    const parts = strip(f);
    const mod = top(f);
    map.set(f, split.has(mod) && parts.length > 2 ? `${mod}/${parts[1]}` : mod);
  }
  return map;
}

/** Files reachable from `start` following imports (bounded). */
export function closure(graph: ImportGraph, start: string, maxDepth = 6, maxFiles = 500): string[] {
  const seen = new Set([start]);
  let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length > 0 && seen.size < maxFiles; depth++) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const t of graph.edges.get(f) ?? []) {
        if (!seen.has(t)) {
          seen.add(t);
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}
