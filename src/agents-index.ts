import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectCommands } from "./commands.js";
import { listFiles, readText } from "./files.js";
import { isTestFile } from "./graph.js";
import { inventory } from "./inventory.js";
import { spliceManagedBlock } from "./markers.js";

export const promptsDir = () => join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

interface FlowInfo {
  file: string;
  name: string;
  summary?: string;
}

function readFlows(root: string, contextDir: string): FlowInfo[] {
  const dir = join(root, contextDir, "flows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, f), "utf8");
      const name = /^#\s*Flow:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? f.replace(/\.md$/, "");
      const summary = /^Summary:\s*(.+)$/m.exec(text)?.[1]?.trim();
      return { file: `${contextDir}/flows/${f}`, name, ...(summary ? { summary } : {}) };
    });
}

/** The AGENTS.md managed block: an index only, ≤ ~60 lines, every line derived from real files. */
export function renderAgentsBlock(root: string, contextDir = ".context"): string {
  const files = listFiles(root);
  const has = (p: string) => existsSync(join(root, p));
  const overview = has(`${contextDir}/overview.md`) ? readText(root, `${contextDir}/overview.md`) : "";
  const purpose = /^Purpose:\s*(.+)$/m.exec(overview)?.[1]?.trim();

  const lines = ["# Repo context (ctxmap)"];
  if (purpose) lines.push(purpose);

  const commands = detectCommands(root, files).filter((c) => c.role !== "other");
  if (commands.length > 0) {
    lines.push("", "## Commands");
    for (const c of commands.slice(0, 8)) lines.push(`- ${c.role}: \`${c.command}\` (${c.source})`);
  }

  lines.push("", "## Where to look");
  if (overview) lines.push(`- Architecture, components, data stores: \`${contextDir}/overview.md\``);
  if (has(`${contextDir}/gotchas.md`)) lines.push(`- Invariants and traps (read before changing code): \`${contextDir}/gotchas.md\``);
  const flows = readFlows(root, contextDir);
  if (flows.length > 0) {
    lines.push("- Flows (read only the one matching the task):");
    for (const f of flows.slice(0, 15)) lines.push(`  - ${f.name}${f.summary ? `: ${f.summary}` : ""} → \`${f.file}\``);
  }

  const docs = inventory(root, files, contextDir);
  const human = docs.filter((d) => d.kind === "human-docs" && !isTestFile(d.path) && !/CODE_OF_CONDUCT|LICENSE|CHANGELOG/i.test(d.path)).slice(0, 8);
  if (human.length > 0) lines.push(`- Existing docs (authoritative, not duplicated): ${human.map((d) => `\`${d.path}\``).join(", ")}`);
  const instructions = docs.filter((d) => d.kind === "agent-instructions" && !["AGENTS.md", "CLAUDE.md", "GEMINI.md"].includes(d.path));
  if (has("CLAUDE.md")) lines.push("- Tool-specific instructions: `CLAUDE.md`");
  for (const d of instructions.slice(0, 4)) lines.push(`- ${d.tool ?? "Agent"} instructions: \`${d.path}\``);
  const configDirs = [...new Set(docs.filter((d) => d.kind === "agent-config" && !d.path.includes("settings")).map((d) => d.path.split("/").slice(0, 2).join("/")))];
  if (configDirs.length > 0) lines.push(`- Agents/skills/hooks: ${configDirs.slice(0, 6).map((d) => `\`${d}/\``).join(", ")}`);

  lines.push("- Before editing a module, read its flow doc if one exists.");
  lines.push(`- How to present answers: \`${contextDir}/presentation.md\``);
  return lines.join("\n");
}

export interface IndexResult {
  written: string[];
  unchanged: string[];
}

const POINTER = "Repo index for AI agents (flows, gotchas, where things live): @AGENTS.md";

/** Write the AGENTS.md block, CLAUDE.md/GEMINI.md pointers (only if those files exist) and presentation.md. */
export function writeIndex(root: string, options: { contextDir?: string; pointers?: boolean } = {}): IndexResult {
  const contextDir = options.contextDir ?? ".context";
  const result: IndexResult = { written: [], unchanged: [] };
  const put = (path: string, next: string) => {
    const full = join(root, path);
    const current = existsSync(full) ? readFileSync(full, "utf8") : undefined;
    if (current === next) {
      result.unchanged.push(path);
      return;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, next);
    result.written.push(path);
  };
  const read = (path: string) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "");

  const presentation = `${contextDir}/presentation.md`;
  if (!existsSync(join(root, presentation))) put(presentation, readFileSync(join(promptsDir(), "presentation.md"), "utf8"));
  put("AGENTS.md", spliceManagedBlock(read("AGENTS.md"), renderAgentsBlock(root, contextDir)));
  for (const file of ["CLAUDE.md", "GEMINI.md"]) {
    if (existsSync(join(root, file)) || options.pointers) put(file, spliceManagedBlock(read(file), POINTER));
  }
  return result;
}

export function loadPrompt(name: string, vars: Record<string, string>): string {
  const text = readFileSync(join(promptsDir(), `${name}.md`), "utf8");
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}
