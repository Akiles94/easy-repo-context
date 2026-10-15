import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

const EDIT_MATCHER = "Edit|Write|MultiEdit|NotebookEdit";

/**
 * How hooks should invoke the tool: through the project's own install when it is a dependency
 * (pinned version, no network), otherwise the global command. Never a bare `npx` download on every edit.
 */
export function toolCommand(root: string, env: NodeJS.ProcessEnv = process.env): string {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    if (pkg.devDependencies?.["easy-repo-context"] || pkg.dependencies?.["easy-repo-context"]) return "npx --no-install easy-repo-context";
  } catch {
    // not a Node project
  }
  return "easy-repo-context";
}

export function isOnPath(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  // On Windows, npm installs `<name>.cmd` / `.ps1` shims; PATHEXT lists the extensions to try.
  const exts = process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";"), ".ps1"] : [""];
  return (env.PATH ?? env.Path ?? "").split(delimiter).some((dir) => dir && exts.some((ext) => existsSync(join(dir, command + ext.toLowerCase())) || existsSync(join(dir, command + ext))));
}

const gitHook = (cmd: string) => `#!/bin/sh
# easy-repo-context: fail the commit when a context doc references a file or symbol that no longer exists.
${cmd} check || {
  echo "easy-repo-context: fix the broken refs above, or run 'easy-repo-context stamp' after updating the docs." >&2
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
  if (pre.some((group) => group.hooks?.some((h) => h.command?.includes("easy-repo-context hook")))) {
    return { path, result: "already-present" };
  }
  pre.push({ matcher: EDIT_MATCHER, hooks: [{ type: "command", command: `${toolCommand(root)} hook claude`, timeout: 10 } as { command: string }] });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return { path, result: "installed" };
}

/** Install a git pre-commit hook running `easy-repo-context check`; never overwrites an existing hook. */
export function installGitHook(root: string): InstallOutcome {
  const path = join(root, ".git", "hooks", "pre-commit");
  if (!existsSync(join(root, ".git"))) return { path, result: "skipped", note: "not a git repository" };
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (current.includes("easy-repo-context check")) return { path, result: "already-present" };
    return { path, result: "skipped", note: `a pre-commit hook already exists; add \`${toolCommand(root)} check\` to it (or to husky/lefthook)` };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, gitHook(toolCommand(root)));
  chmodSync(path, 0o755);
  return { path, result: "installed" };
}

/** Copy the bundled skill into a project (`.claude/skills/`) or the user's Claude Code config. */
export function installSkill(skillSource: string, target: string): InstallOutcome {
  const path = join(target, "easy-repo-context", "SKILL.md");
  const next = readFileSync(skillSource, "utf8");
  if (existsSync(path) && readFileSync(path, "utf8") === next) return { path, result: "already-present" };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return { path, result: "installed" };
}
