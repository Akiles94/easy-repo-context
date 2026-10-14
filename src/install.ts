import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const HOOK_COMMAND = "npx --no-install ctxmap hook claude";
const EDIT_MATCHER = "Edit|Write|MultiEdit|NotebookEdit";

const GIT_HOOK = `#!/bin/sh
# ctxmap: fail the commit when a context doc references a file or symbol that no longer exists.
npx --no-install ctxmap check || {
  echo "ctxmap: fix the broken refs above, or run 'ctxmap stamp' after updating the docs." >&2
  exit 1
}
`;

export type InstallOutcome = { path: string; result: "installed" | "already-present" | "skipped"; note?: string };

/** Merge a PreToolUse hook into .claude/settings.json, keeping every existing setting and hook. */
export function installClaudeHook(root: string): InstallOutcome {
  const path = join(root, ".claude", "settings.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      return { path, result: "skipped", note: "settings.json is not valid JSON; not touching it" };
    }
  }
  const hooks = (settings.hooks ??= {}) as Record<string, unknown[]>;
  const pre = (hooks.PreToolUse ??= []) as { matcher?: string; hooks?: { command?: string }[] }[];
  if (pre.some((group) => group.hooks?.some((h) => h.command?.includes("ctxmap hook")))) {
    return { path, result: "already-present" };
  }
  pre.push({ matcher: EDIT_MATCHER, hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 10 } as { command: string }] });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return { path, result: "installed" };
}

/** Install a git pre-commit hook running `ctxmap check`; never overwrites an existing hook. */
export function installGitHook(root: string): InstallOutcome {
  const path = join(root, ".git", "hooks", "pre-commit");
  if (!existsSync(join(root, ".git"))) return { path, result: "skipped", note: "not a git repository" };
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (current.includes("ctxmap check")) return { path, result: "already-present" };
    return { path, result: "skipped", note: "a pre-commit hook already exists; add `npx --no-install ctxmap check` to it (or to husky/lefthook)" };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, GIT_HOOK);
  chmodSync(path, 0o755);
  return { path, result: "installed" };
}
