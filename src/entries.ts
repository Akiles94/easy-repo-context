import { readText } from "./files.js";

export type EntryKind = "http" | "rpc" | "cli" | "queue" | "cron" | "event" | "ipc" | "main";

export interface EntryPoint {
  file: string;
  kind: EntryKind;
  /** Route, command, tool or job names found in the file (first few). */
  triggers: string[];
  count: number;
}

interface Pattern {
  kind: EntryKind;
  re: RegExp;
  langs: RegExp;
}

const JS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const PY = /\.py$/;
const GO = /\.go$/;

/** Group 1, when present, is the trigger name. */
const PATTERNS: Pattern[] = [
  { kind: "http", langs: JS, re: /\b(?:app|router|server|api|routes?|fastify|hono)\.(?:get|post|put|patch|delete|all|head)\(\s*['"`]([^'"`]+)['"`]/g },
  { kind: "http", langs: JS, re: /@(?:Get|Post|Put|Patch|Delete|All)\(\s*['"`]?([^'"`)]*)/g },
  { kind: "rpc", langs: JS, re: /\.(?:registerTool|tool|registerPrompt|procedure|mutation|query)\(\s*['"`]([\w./:-]+)['"`]/g },
  { kind: "cli", langs: JS, re: /\.command\(\s*['"`]([\w:-]+)/g },
  { kind: "queue", langs: JS, re: /\.process\(\s*['"`]?([\w:.-]*)|@Processor\(\s*['"`]?([\w:.-]*)|new\s+Worker\(\s*['"`]([\w:.-]+)/g },
  { kind: "cron", langs: JS, re: /cron\.schedule\(\s*['"`]([^'"`]+)|@Cron\(\s*['"`]?([^'"`)]*)/g },
  { kind: "ipc", langs: JS, re: /ipcMain\.(?:handle|on)\(\s*['"`]?([\w:.-]+)/g },
  { kind: "http", langs: PY, re: /@(?:app|router|bp|blueprint|api)\.(?:get|post|put|patch|delete|route|api_route)\(\s*['"]([^'"]+)/g },
  { kind: "cli", langs: PY, re: /@(?:click\.|app\.|cli\.)?command\(\s*(?:['"]([\w-]+)['"])?/g },
  { kind: "queue", langs: PY, re: /@(?:shared_task|celery_app\.task|app\.task|dramatiq\.actor)\b/g },
  { kind: "http", langs: GO, re: /\.(?:HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/g },
  { kind: "main", langs: GO, re: /^func main\(\)/gm },
  { kind: "main", langs: PY, re: /^if __name__ == ['"]__main__['"]/gm },
];

/** Framework conventions where the file path itself is the route. */
function pathConvention(file: string): EntryPoint | undefined {
  const next = /(?:^|\/)app\/(.*)\/route\.(ts|js)$/.exec(file) ?? /(?:^|\/)pages\/api\/(.*)\.(ts|js)$/.exec(file);
  if (next) return { file, kind: "http", triggers: [`/${next[1]}`], count: 1 };
  return undefined;
}

export function findEntryPoints(root: string, files: string[], extra: { bins?: string[] } = {}): EntryPoint[] {
  const out: EntryPoint[] = [];
  const bins = new Set(extra.bins ?? []);
  for (const file of files) {
    const conv = pathConvention(file);
    if (conv) {
      out.push(conv);
      continue;
    }
    const applicable = PATTERNS.filter((p) => p.langs.test(file));
    if (applicable.length === 0 && !bins.has(file)) continue;
    let text: string;
    try {
      text = readText(root, file);
    } catch {
      continue;
    }
    const byKind = new Map<EntryKind, string[]>();
    for (const p of applicable) {
      for (const m of text.matchAll(p.re)) {
        const name = (m.slice(1).find((g) => g !== undefined && g !== "") ?? "").trim();
        const list = byKind.get(p.kind) ?? [];
        list.push(name || "(anonymous)");
        byKind.set(p.kind, list);
      }
    }
    if (bins.has(file) && !byKind.size) byKind.set("main", [file]);
    for (const [kind, names] of byKind) {
      const unique = [...new Set(names)];
      out.push({ file, kind, triggers: unique.slice(0, 5), count: names.length });
    }
  }
  return out;
}
