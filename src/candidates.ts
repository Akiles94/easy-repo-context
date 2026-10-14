import { readText } from "./files.js";
import { listFiles } from "./files.js";
import { buildImportGraph, closure, detectAliases, isTestFile, moduleMap, sourceFiles } from "./graph.js";
import { type EntryKind, findEntryPoints } from "./entries.js";
import { churn, type Commit, isFixCommit, readHistory } from "./history.js";

export interface FlowCandidate {
  file: string;
  kind: EntryKind;
  triggers: string[];
  triggerCount: number;
  /** Modules reached through imports (excluding the entry's own). */
  modules: string[];
  /** Commits touching the entry or its direct imports in the churn window. */
  churn: number;
  score: number;
}

export interface FixHotspot {
  file: string;
  fixes: number;
  examples: { hash: string; subject: string }[];
}

export interface CommentSignal {
  file: string;
  line: number;
  text: string;
  /** Churn of the file; higher means the warning guards code that keeps changing. */
  churn: number;
}

export interface Candidates {
  stats: { sourceFiles: number; modules: number; entryFiles: number; commits: number; shallow: boolean };
  flows: FlowCandidate[];
  fixHotspots: FixHotspot[];
  comments: CommentSignal[];
  decisionRecords: string[];
}

export interface CandidateOptions {
  limit?: number;
  maxCommits?: number;
}

export function findCandidates(root: string, options: CandidateOptions = {}): Candidates {
  const limit = options.limit ?? 10;
  const files = listFiles(root);
  const sources = sourceFiles(files);
  const sourceSet = new Set(sources);
  const modules = moduleMap(sources);
  const graph = buildImportGraph(root, sources, { aliases: detectAliases(root, files) });
  const history = readHistory(root, options.maxCommits ?? 1000);
  const fileChurn = churn(history);

  const flows: FlowCandidate[] = [];
  for (const entry of findEntryPoints(root, sources, { bins: binFiles(root) })) {
    const own = modules.get(entry.file);
    // Depth 3 keeps "what this entry orchestrates" without pulling in the whole model layer.
    const reach = closure(graph, entry.file, 3, 300);
    const reached = [...new Set(reach.map((f) => modules.get(f)).filter((m): m is string => !!m && m !== own))].sort();
    const direct = [entry.file, ...(graph.edges.get(entry.file) ?? [])];
    const c = direct.reduce((n, f) => n + (fileChurn.get(f) ?? 0), 0);
    const score = Math.round((reached.length + 1) * Math.log2(2 + c) * Math.log2(1 + Math.min(entry.count, 20)) * 10) / 10;
    flows.push({ file: entry.file, kind: entry.kind, triggers: entry.triggers, triggerCount: entry.count, modules: reached, churn: c, score });
  }
  flows.sort((a, b) => b.score - a.score);

  const fixes = new Map<string, Commit[]>();
  for (const commit of history.commits.filter(isFixCommit)) {
    for (const f of commit.files) {
      if (!sourceSet.has(f)) continue;
      fixes.set(f, [...(fixes.get(f) ?? []), commit]);
    }
  }
  const fixHotspots = [...fixes]
    .filter(([, list]) => list.length >= 2)
    .map(([file, list]) => ({ file, fixes: list.length, examples: list.slice(0, 3).map((c) => ({ hash: c.hash, subject: c.subject })) }))
    .sort((a, b) => b.fixes - a.fixes)
    .slice(0, limit * 2);

  const comments = commentSignals(root, sources, fileChurn).slice(0, limit * 3);
  const decisionRecords = files.filter(
    (f) => /\.(md|mdx|rst|txt)$/i.test(f) && /(^|\/)(adrs?|decisions?|rfcs?|design-docs?|advances)\//i.test(f) && !isTestFile(f),
  );

  return {
    stats: { sourceFiles: sources.length, modules: new Set(modules.values()).size, entryFiles: new Set(flows.map((f) => f.file)).size, commits: history.commits.length, shallow: history.shallow },
    flows: dedupeByFile(flows).slice(0, limit),
    fixHotspots,
    comments,
    decisionRecords,
  };
}

function dedupeByFile(flows: FlowCandidate[]): FlowCandidate[] {
  const seen = new Set<string>();
  return flows.filter((f) => !seen.has(f.file) && seen.add(f.file));
}

function binFiles(root: string): string[] {
  try {
    const pkg = JSON.parse(readText(root, "package.json")) as { bin?: string | Record<string, string> };
    const bins = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin ?? {});
    return bins.map((b) => b.replace(/^\.\//, "").replace(/^dist\//, "src/").replace(/\.js$/, ".ts"));
  } catch {
    return [];
  }
}

const SLASH_COMMENT = /^\s*(?:\/\/|\*|\/\*)\s?(.*)$/;
const HASH_COMMENT = /^\s*(?:#(?!!)|""")\s?(.*)$/;
const STRONG = /\b(NEVER|MUST|DO NOT|DON'T|IMPORTANT|WARNING|CAREFUL|INVARIANT|HACK|XXX)\b|\b(never|must not|must be|must only|do not|don't|deliberately|on purpose|order matters|not thread[- ]safe|invariant|always (?:call|use|go|run|keep)|otherwise .{0,40}(?:break|lose|corrupt|leak))\b/;

function commentSignals(root: string, sources: string[], fileChurn: Map<string, number>): CommentSignal[] {
  const out: CommentSignal[] = [];
  for (const file of sources) {
    let text: string;
    try {
      text = readText(root, file);
    } catch {
      continue;
    }
    const lines = text.split("\n");
    const COMMENT_LINE = /\.(py|rb|sh)$/.test(file) ? HASH_COMMENT : SLASH_COMMENT;
    for (let i = 0; i < lines.length; i++) {
      const m = COMMENT_LINE.exec(lines[i] ?? "");
      const body = m?.[1]?.trim();
      if (!body || body.length < 25 || !STRONG.test(body) || /eslint|ts-ignore|ts-expect|prettier|biome-ignore|@deprecated/i.test(body)) continue;
      out.push({ file, line: i + 1, text: body.slice(0, 200), churn: fileChurn.get(file) ?? 0 });
    }
  }
  return out.sort((a, b) => b.churn - a.churn);
}
