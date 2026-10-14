import { estimateTokens, fileSize, readText } from "./files.js";
import { hasManagedBlock } from "./markers.js";

export type DocKind =
  | "agent-instructions" // always loaded by some AI tool
  | "agent-config" // agents, skills, commands, hooks: loaded on demand or by the harness
  | "human-docs"; // README, docs/, ADRs, CONTRIBUTING...

export interface DocEntry {
  path: string;
  kind: DocKind;
  /** Which tool reads it, when it is tool-specific. */
  tool?: string;
  tokens: number;
  managed: boolean;
}

interface Rule {
  test: (path: string) => boolean;
  kind: DocKind;
  tool?: string;
}

const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const under = (dir: string) => (p: string) => p.startsWith(`${dir}/`) || p.includes(`/${dir}/`);
const md = (p: string) => /\.mdx?$/i.test(p);

const RULES: Rule[] = [
  { test: (p) => base(p) === "AGENTS.md", kind: "agent-instructions", tool: "any (AGENTS.md)" },
  { test: (p) => base(p) === "CLAUDE.md" || base(p) === "CLAUDE.local.md", kind: "agent-instructions", tool: "Claude Code" },
  { test: (p) => base(p) === "GEMINI.md", kind: "agent-instructions", tool: "Gemini CLI" },
  { test: (p) => p === ".cursorrules" || p.startsWith(".cursor/rules/"), kind: "agent-instructions", tool: "Cursor" },
  { test: (p) => p === ".github/copilot-instructions.md" || p.startsWith(".github/instructions/"), kind: "agent-instructions", tool: "Copilot" },
  { test: (p) => p === ".windsurfrules" || p.startsWith(".windsurf/rules/"), kind: "agent-instructions", tool: "Windsurf" },
  { test: (p) => p === ".clinerules" || p.startsWith(".clinerules/"), kind: "agent-instructions", tool: "Cline" },
  { test: (p) => p === "llms.txt" || p === "llms-full.txt", kind: "agent-instructions", tool: "llms.txt" },
  { test: (p) => p.startsWith(".claude/") && !p.startsWith(".claude/settings"), kind: "agent-config", tool: "Claude Code" },
  { test: (p) => p.startsWith(".claude/settings"), kind: "agent-config", tool: "Claude Code" },
  { test: (p) => p.startsWith(".codex/"), kind: "agent-config", tool: "Codex" },
  { test: (p) => p.startsWith(".gemini/"), kind: "agent-config", tool: "Gemini CLI" },
  { test: (p) => base(p) === "SKILL.md", kind: "agent-config", tool: "skill" },
  { test: (p) => /^readme(\.[a-z]+)?$/i.test(base(p)), kind: "human-docs" },
  { test: (p) => /^(contributing|architecture|design|security|development|hacking)(\.[a-z]+)?$/i.test(base(p)), kind: "human-docs" },
  { test: (p) => md(p) && (under("adr")(p) || under("adrs")(p) || under("decisions")(p)), kind: "human-docs" },
  { test: (p) => md(p) && (p.startsWith("docs/") || p.startsWith("doc/")), kind: "human-docs" },
];

const IGNORED = /(^|\/)(node_modules|vendor|dist|build|\.git)\//;
/** The tool's own output is not "existing docs". */
const OWN = (dir: string) => (p: string) => p.startsWith(`${dir}/`);

export function inventory(root: string, files: string[], contextDir = ".context"): DocEntry[] {
  const own = OWN(contextDir);
  const entries: DocEntry[] = [];
  for (const path of files) {
    if (IGNORED.test(path) || own(path)) continue;
    const rule = RULES.find((r) => r.test(path));
    if (!rule) continue;
    const textLike = !/\.(png|jpe?g|gif|svg|ico|pdf|zip)$/i.test(path);
    const content = textLike ? safeRead(root, path) : "";
    entries.push({
      path,
      kind: rule.kind,
      tool: rule.tool,
      tokens: estimateTokens(textLike ? content.length : fileSize(root, path)),
      managed: hasManagedBlock(content),
    });
  }
  return entries;
}

function safeRead(root: string, path: string): string {
  try {
    return readText(root, path);
  } catch {
    return "";
  }
}

/**
 * Files some AI tool loads into every session automatically (root-level instructions).
 * Nested AGENTS.md/CLAUDE.md load only when the agent works in that directory.
 */
export function alwaysLoaded(entries: DocEntry[]): DocEntry[] {
  return entries.filter(
    (e) =>
      e.kind === "agent-instructions" &&
      e.tool !== "llms.txt" &&
      (!e.path.includes("/") || e.path.startsWith(".cursor/rules/") || e.path === ".github/copilot-instructions.md"),
  );
}
