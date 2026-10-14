import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { runCheck, stampDocs } from "../src/check.js";
import { contextForFile, runClaudeHook } from "../src/hook.js";
import { installClaudeHook, installGitHook } from "../src/install.js";
import { BEGIN, END } from "../src/markers.js";
import { fixture, write } from "./helpers/fixture.js";

const repo = () =>
  fixture({
    "src/session.ts": "export class Sessions {\n  write() {}\n}\n",
    "src/save.ts": "export function save() {}\n",
    "AGENTS.md": `# Mine\nnot ours: \`src/nope.ts\`\n${BEGIN}\n- flows: \`.context/flows/save.md\`\n${END}\n`,
    ".context/flows/save.md": "# Flow: save\n1. `src/save.ts:save()` → `session.ts:Sessions.write()`\nRelated: `flows/other.md`\n",
    ".context/flows/other.md": "# Flow: other\n`src/save.ts`\n",
    ".context/gotchas.md": "- Every mutation goes through `src/session.ts:Sessions.write()`.\n  It bumps the lineage.\n- Unrelated: `src/save.ts`.\n",
    "docs/guide.md": "See `src/removed/old.ts` and `vault.json`.\n",
  });

describe("check and stamp", () => {
  it("only reads the managed block of AGENTS.md and reports unstamped docs", () => {
    const report = runCheck(repo());
    expect(report.docs.map((d) => [d.doc, d.status])).toEqual([
      [".context/flows/other.md", "unstamped"],
      [".context/flows/save.md", "unstamped"],
      [".context/gotchas.md", "unstamped"],
      ["AGENTS.md", "unstamped"],
    ]);
  });

  it("records code sources, not links to other docs", () => {
    const root = repo();
    stampDocs(root);
    expect(runCheck(root).docs.every((d) => d.status === "fresh")).toBe(true);
    const manifest = parse(readFileSync(join(root, ".context/manifest.yaml"), "utf8"));
    expect(Object.keys(manifest.docs[".context/flows/save.md"].sources)).toEqual(["src/save.ts", "src/session.ts"]);
  });

  it("marks docs changed when a source changes, broken when a symbol disappears", () => {
    const root = repo();
    stampDocs(root);
    write(root, "src/save.ts", "export function save() { return 1; }\n");
    expect(runCheck(root).docs.find((d) => d.doc === ".context/flows/save.md")).toMatchObject({ status: "changed", changed: ["src/save.ts"] });

    write(root, "src/session.ts", "export class Sessions {}\n");
    const save = runCheck(root).docs.find((d) => d.doc === ".context/flows/save.md");
    expect(save?.status).toBe("broken");
    expect(save?.broken.map((b) => b.ref.raw)).toEqual(["session.ts:Sessions.write()"]);
  });

  it("refuses to stamp a doc with broken refs unless forced", () => {
    const root = repo();
    write(root, ".context/flows/bad.md", "`src/gone.ts:x()`\n");
    const result = stampDocs(root);
    expect(result.refused.map((r) => r.doc)).toEqual([".context/flows/bad.md"]);
    expect(stampDocs(root, { force: true }).refused).toEqual([]);
  });

  it("reports broken refs in existing docs only on request", () => {
    const root = repo();
    expect(runCheck(root).external).toEqual([]);
    const external = runCheck(root, { external: true }).external;
    expect(external.map((d) => [d.doc, d.broken.map((b) => b.ref.raw)])).toEqual([["docs/guide.md", ["src/removed/old.ts"]]]);
  });
});

describe("edit hook", () => {
  it("returns covering docs and only the gotchas that reference the file", () => {
    const root = repo();
    stampDocs(root);
    const ctx = contextForFile(root, "src/session.ts");
    expect(ctx.docs).toEqual([".context/flows/save.md"]);
    expect(ctx.gotchas).toEqual(["Every mutation goes through `src/session.ts:Sessions.write()`. It bumps the lineage."]);
  });

  it("speaks once per file per session and stays silent for uncovered files", () => {
    const root = repo();
    stampDocs(root);
    const input = (file: string) => JSON.stringify({ session_id: `t-${Date.now()}-${Math.random()}`.replace(".", ""), cwd: root, tool_input: { file_path: join(root, file) } });
    const first = input("src/session.ts");
    const out = runClaudeHook(first, {});
    expect(JSON.parse(out ?? "{}").hookSpecificOutput.additionalContext).toContain("Sessions.write()");
    expect(runClaudeHook(first, {})).toBeUndefined();
    expect(runClaudeHook(input("README.md"), {})).toBeUndefined();
    expect(runClaudeHook("not json", {})).toBeUndefined();
  });
});

describe("hooks install", () => {
  it("merges into existing Claude settings without dropping hooks, and is idempotent", () => {
    const existing = { permissions: { allow: ["Bash(npm test)"] }, hooks: { PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "guard.sh" }] }] } };
    const root = fixture({ ".claude/settings.json": JSON.stringify(existing) });
    expect(installClaudeHook(root).result).toBe("installed");
    expect(installClaudeHook(root).result).toBe("already-present");
    const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
    expect(settings.permissions).toEqual(existing.permissions);
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("guard.sh");
  });

  it("never overwrites an existing git hook", () => {
    const root = fixture({ ".git/hooks/pre-commit": "#!/bin/sh\nlint\n" });
    expect(installGitHook(root).result).toBe("skipped");
    expect(readFileSync(join(root, ".git/hooks/pre-commit"), "utf8")).toBe("#!/bin/sh\nlint\n");
    const fresh = fixture({ ".git/HEAD": "ref: refs/heads/main\n" });
    expect(installGitHook(fresh).result).toBe("installed");
    expect(existsSync(join(fresh, ".git/hooks/pre-commit"))).toBe(true);
  });
});
