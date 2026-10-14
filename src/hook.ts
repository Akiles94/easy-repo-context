import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { indexRepo, ownedDocs, resolveDocRefs } from "./check.js";
import { readText } from "./files.js";
import { loadManifest } from "./manifest.js";

export interface EditContext {
  file: string;
  docs: string[];
  gotchas: string[];
}

/** Docs whose stamped sources include `file`, plus gotcha bullets that reference it. */
export function contextForFile(root: string, file: string, contextDir = ".context"): EditContext {
  const manifest = loadManifest(root, contextDir);
  const docs = Object.entries(manifest.docs)
    .filter(([doc, entry]) => file in entry.sources && !doc.endsWith("gotchas.md"))
    .map(([doc]) => doc)
    .sort();

  const gotchas: string[] = [];
  const repo = indexRepo(root, contextDir);
  const gotchaDocs = ownedDocs(root, contextDir, repo.files).filter((d) => d.endsWith("gotchas.md"));
  if (gotchaDocs.length > 0) {
    for (const doc of gotchaDocs) {
      for (const bullet of bullets(readText(root, doc))) {
        if (resolveDocRefs(repo, doc, bullet).some((r) => r.status === "ok" && r.file === file)) gotchas.push(bullet);
      }
    }
  }
  return { file, docs, gotchas };
}

/** Top-level list items, continuation lines folded in. */
function bullets(markdown: string): string[] {
  const items: string[] = [];
  for (const line of markdown.split("\n")) {
    if (/^[-*] /.test(line)) items.push(line.slice(2).trim());
    else if (/^\s+\S/.test(line) && items.length > 0) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

export function renderEditContext(ctx: EditContext): string | undefined {
  if (ctx.docs.length === 0 && ctx.gotchas.length === 0) return undefined;
  const lines = [`easy-repo-context: context for ${ctx.file}.`];
  if (ctx.docs.length > 0) lines.push(`Docs covering it (read before editing if you haven't): ${ctx.docs.join(", ")}`);
  if (ctx.gotchas.length > 0) lines.push("Gotchas for this file:", ...ctx.gotchas.map((g) => `- ${g}`));
  lines.push("If your change alters the behavior these docs describe, update them in the same change.");
  return lines.join("\n");
}

interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_input?: { file_path?: string; notebook_path?: string };
}

/**
 * Claude Code PreToolUse hook for Edit/Write/MultiEdit. Never blocks: on any problem it stays silent.
 * Reminds once per file per session, so repeated edits don't repeat the context.
 */
export function runClaudeHook(stdin: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  let input: HookInput;
  try {
    input = JSON.parse(stdin) as HookInput;
  } catch {
    return undefined;
  }
  const root = env.CLAUDE_PROJECT_DIR ?? input.cwd;
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!root || !target) return undefined;
  const file = relative(root, isAbsolute(target) ? target : join(root, target)).split(sep).join("/");
  if (file.startsWith("..")) return undefined;

  const seenPath = join(tmpdir(), `erc-hook-${(input.session_id ?? "nosession").replace(/[^\w-]/g, "")}.json`);
  const seen = new Set<string>(existsSync(seenPath) ? safeJson(readFileSync(seenPath, "utf8")) : []);
  if (seen.has(file)) return undefined;

  const text = renderEditContext(contextForFile(root, file, env.ERC_CONTEXT_DIR));
  if (!text) return undefined;
  seen.add(file);
  try {
    writeFileSync(seenPath, JSON.stringify([...seen]));
  } catch {
    // dedupe is best-effort
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: text } });
}

function safeJson(text: string): string[] {
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
