import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectCommands, type RepoCommand } from "./commands.js";
import { estimateTokens, fileSize, listFiles, readText } from "./files.js";
import { alwaysLoaded, type DocEntry, inventory } from "./inventory.js";
import { hasManagedBlock } from "./markers.js";

export interface PlanOptions {
  contextDir?: string;
  /** Create CLAUDE.md / GEMINI.md pointers even when those files don't exist. */
  createPointers?: boolean;
  /** How many flows init will propose by default. */
  flows?: number;
}

export type ActionKind = "create" | "append-block" | "update-block" | "skip";

export interface Action {
  path: string;
  kind: ActionKind;
  why: string;
}

export interface Plan {
  root: string;
  stats: { files: number; sourceFiles: number; sourceTokens: number; languages: Record<string, number> };
  docs: DocEntry[];
  commands: RepoCommand[];
  alwaysLoadedTokens: { before: number; after: number };
  actions: Action[];
  estimate: { inputTokens: number; outputTokens: number; calls: number; notes: string[] };
}

const LANGS: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP",
  cs: "C#", swift: "Swift", c: "C", h: "C", cpp: "C++", hpp: "C++", scala: "Scala", ex: "Elixir", exs: "Elixir",
  vue: "Vue", svelte: "Svelte", dart: "Dart",
};

export function languageOf(path: string): string | undefined {
  if (/(^|\/)(node_modules|vendor|dist|build)\//.test(path) || /\.d\.ts$|\.min\.js$/.test(path)) return undefined;
  return LANGS[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
}

/** Budget of the root managed block: ≤ ~60 lines. */
const AGENTS_BLOCK_TOKENS = 800;
/** Bounded LLM input per generated doc: only the files on the flow's path, never the whole repo. */
const FLOW_INPUT_CAP = 20_000;
const FLOW_OUTPUT = 500;

export function buildPlan(root: string, options: PlanOptions = {}): Plan {
  const contextDir = options.contextDir ?? ".context";
  const flowCount = options.flows ?? 6;
  const files = listFiles(root);
  const docs = inventory(root, files, contextDir);
  const commands = detectCommands(root, files);

  const languages: Record<string, number> = {};
  let sourceFiles = 0;
  let sourceBytes = 0;
  for (const f of files) {
    const lang = languageOf(f);
    if (!lang) continue;
    languages[lang] = (languages[lang] ?? 0) + 1;
    sourceFiles++;
    sourceBytes += fileSize(root, f);
  }

  const actions: Action[] = [];
  const exists = (p: string) => existsSync(join(root, p));
  const blockAction = (path: string, why: string): Action => {
    if (!exists(path)) return { path, kind: "create", why };
    return hasManagedBlock(readText(root, path))
      ? { path, kind: "update-block", why: `${why}; text outside the managed block is untouched` }
      : { path, kind: "append-block", why: `${why}; existing content kept as-is` };
  };

  actions.push(blockAction("AGENTS.md", "root index read by every AI tool"));
  for (const [file, tool] of [["CLAUDE.md", "Claude Code"], ["GEMINI.md", "Gemini CLI"]] as const) {
    if (exists(file) || options.createPointers) {
      actions.push(blockAction(file, `short pointer to AGENTS.md for ${tool}`));
    } else {
      actions.push({ path: file, kind: "skip", why: "does not exist (use --pointers to create it)" });
    }
  }
  for (const [name, why] of [
    ["overview.md", "architecture in one screen: components, boundaries, data stores"],
    ["gotchas.md", "non-obvious traps, invariants, rationale"],
    ["presentation.md", "how the agent presents answers to the user"],
    ["manifest.yaml", "doc → source hashes, used by `easy-repo-context check`"],
  ] as const) {
    const path = `${contextDir}/${name}`;
    actions.push({ path, kind: exists(path) ? "update-block" : "create", why });
  }
  actions.push({ path: `${contextDir}/flows/*.md`, kind: "create", why: `~${flowCount} flows, chosen by you from the proposed list` });

  const before = alwaysLoaded(docs).reduce((n, d) => n + d.tokens, 0);
  const agents = docs.find((d) => d.path === "AGENTS.md");
  const after = before - (agents?.managed ? agents.tokens : 0) + AGENTS_BLOCK_TOKENS + (exists("CLAUDE.md") ? 30 : 0) + (exists("GEMINI.md") ? 30 : 0);

  const sourceTokens = estimateTokens(sourceBytes);
  const docsTokens = docs.filter((d) => d.kind === "human-docs").reduce((n, d) => n + d.tokens, 0);
  const overviewInput = Math.min(docsTokens, 15_000) + 3_000;
  const gotchasInput = Math.min(before + docsTokens, 15_000) + 3_000;
  const flowInput = Math.min(FLOW_INPUT_CAP, Math.max(2_000, Math.round(sourceTokens / 10))) * flowCount;

  return {
    root,
    stats: { files: files.length, sourceFiles, sourceTokens, languages },
    docs,
    commands,
    alwaysLoadedTokens: { before, after },
    actions,
    estimate: {
      inputTokens: overviewInput + gotchasInput + flowInput,
      outputTokens: 600 + 600 + FLOW_OUTPUT * flowCount + AGENTS_BLOCK_TOKENS,
      calls: 3 + flowCount,
      notes: [
        `flow inputs are capped at ${FLOW_INPUT_CAP / 1000}k tokens each (only files on the flow's path)`,
        "skill mode: these tokens are spent by your own agent session, no API key needed",
      ],
    },
  };
}
