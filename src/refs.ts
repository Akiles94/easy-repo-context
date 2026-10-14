import { posix } from "node:path";

/** A code reference found inside a doc, e.g. `src/a.ts:Foo.bar()` or `package.json#scripts.test`. */
export interface Ref {
  raw: string;
  path: string;
  /** `Foo.bar` from `file.ts:Foo.bar()`; undefined for bare paths. */
  symbol?: string;
  /** `12` from `file.ts:12`. */
  line?: number;
  /** `scripts.test` from `package.json#scripts.test`. */
  jsonKey?: string;
}

export type ResolvedRef =
  | { ref: Ref; status: "ok"; file: string }
  | { ref: Ref; status: "missing-file" | "missing-symbol" | "ambiguous"; file?: string; detail: string };

const CODE_SPAN = /`([^`\n]+)`/g;
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|swift|c|h|cpp|hpp|scala|ex|exs|vue|svelte|dart|sh|sql)$/;
const PATH = /^(?:\.{0,2}\/)?[\w@$.-]+(?:\/[\w@$.-]+)*\.[A-Za-z0-9]{1,8}$/;

/** Code spans that look like file references. Placeholders (`<x>`, `*`, `NNN`) are not refs. */
export function extractRefs(markdown: string): Ref[] {
  const refs: Ref[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(CODE_SPAN)) {
    const raw = (match[1] ?? "").trim();
    // Placeholders and runtime paths (`$HOME/x`, `~/x`, `/api/route`) are not repo refs.
    if (seen.has(raw) || /[<>*\s]|NNN|^[$~/]/.test(raw)) continue;
    const ref = parseRef(raw);
    if (ref) {
      seen.add(raw);
      refs.push(ref);
    }
  }
  return refs;
}

export function parseRef(raw: string): Ref | undefined {
  const hash = raw.indexOf("#");
  if (hash > 0 && PATH.test(raw.slice(0, hash))) {
    return { raw, path: raw.slice(0, hash), jsonKey: raw.slice(hash + 1) };
  }
  const colon = raw.indexOf(":");
  const path = colon > 0 ? raw.slice(0, colon) : raw;
  if (!PATH.test(path)) return undefined;
  if (colon < 0) return { raw, path };
  const rest = raw.slice(colon + 1).replace(/\(\)$/, "");
  if (/^\d+(-\d+)?$/.test(rest)) return { raw, path, line: Number.parseInt(rest, 10) };
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(rest)) return { raw, path, symbol: rest };
  return undefined;
}

/**
 * Resolve a ref path against the repo: as written from the root, relative to the doc,
 * or as a unique path suffix (docs often drop a leading `src/`). A path without a slash
 * that matches nothing is treated as prose (e.g. a runtime file name), not as a ref.
 */
export function resolvePath(path: string, docPath: string, files: ReadonlySet<string>, suffixIndex: Map<string, string[]>): string[] | "not-a-ref" {
  const clean = path.replace(/^\.\//, "");
  if (files.has(clean)) return [clean];
  const relative = posix.normalize(posix.join(posix.dirname(docPath), clean));
  if (files.has(relative)) return [relative];
  if (!clean.includes("/")) {
    // A bare name is a ref only for source files (`003-lineage.ts`); `vault.json` or `state.json`
    // in prose usually names a runtime file, and must not latch onto a same-named fixture.
    if (!SOURCE_EXT.test(clean)) return "not-a-ref";
    const matches = suffixIndex.get(clean) ?? [];
    return matches.length === 0 ? "not-a-ref" : matches;
  }
  return suffixIndex.get(posix.basename(clean))?.filter((f) => f.endsWith(`/${clean}`)) ?? [];
}

export function buildSuffixIndex(files: Iterable<string>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const f of files) {
    const base = posix.basename(f);
    const list = index.get(base);
    if (list) list.push(f);
    else index.set(base, [f]);
  }
  return index;
}

const DEF_KEYWORDS = "(?:class|interface|type|enum|function|const|let|var|def|func|fn|struct|trait|module|record|object|namespace)";

/**
 * Cheap, language-agnostic definition check: every segment of `Foo.bar` must appear as a
 * definition (keyword + name) or as a method/property definition (`bar(`, `bar =`, `bar:`).
 */
export function hasSymbol(source: string, symbol: string): boolean {
  return symbol.split(".").every((name) => {
    const n = name.replace(/[$]/g, "\\$");
    const def = new RegExp(`(?:^|[^\\w$])${DEF_KEYWORDS}\\s+\\*?\\s*${n}(?![\\w$])`, "m");
    const member = new RegExp(`^[\\t ]*(?:(?:export|public|private|protected|static|readonly|async|override|abstract|default|get|set)\\s+)*\\*?${n}\\s*(?:<[^>\\n]*>)?\\s*(?:\\(|=|:|\\?:)`, "m");
    const goMethod = new RegExp(`^func\\s+\\([^)]*\\)\\s+${n}\\s*\\(`, "m");
    return def.test(source) || member.test(source) || goMethod.test(source);
  });
}

export function hasJsonKey(source: string, keyPath: string): boolean {
  try {
    let node: unknown = JSON.parse(source);
    for (const key of keyPath.split(".")) {
      if (node === null || typeof node !== "object" || !(key in node)) return false;
      node = (node as Record<string, unknown>)[key];
    }
    return true;
  } catch {
    return false;
  }
}
