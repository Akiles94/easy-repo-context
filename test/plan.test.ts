import { readdirSync, readFileSync } from "node:fs";

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BEGIN, END } from "../src/markers.js";
import { buildPlan } from "../src/plan.js";
import { fixture } from "./helpers/fixture.js";

function snapshot(root: string, dir = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, snapshot(root, p));
    else out[p] = readFileSync(join(root, p), "utf8");
  }
  return out;
}

describe("buildPlan", () => {
  const root = fixture({
    "package.json": JSON.stringify({ scripts: { test: "vitest", lint: "biome check ." } }),
    "pnpm-lock.yaml": "",
    "CLAUDE.md": "# rules\n",
    "AGENTS.md": `mine\n${BEGIN}\nold\n${END}\n`,
    ".cursor/rules/style.mdc": "x",
    "docs/arch.md": "# arch",
    "src/a.ts": "export const a = 1;\n",
    "node_modules/x/README.md": "ignored",
    ".context/overview.md": "ours, not existing docs",
  });

  it("inventories existing context and ignores its own output", () => {
    const paths = buildPlan(root).docs.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["CLAUDE.md", "AGENTS.md", ".cursor/rules/style.mdc", "docs/arch.md"]));
    expect(paths).not.toContain(".context/overview.md");
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
  });

  it("sources commands from real files with the right package manager", () => {
    const cmds = buildPlan(root).commands;
    expect(cmds).toContainEqual({ role: "test", command: "pnpm test", source: "package.json#scripts.test" });
    expect(cmds).toContainEqual({ role: "lint", command: "pnpm run lint", source: "package.json#scripts.lint" });
  });

  it("plans block-only writes and skips pointers for missing files", () => {
    const actions = Object.fromEntries(buildPlan(root).actions.map((a) => [a.path, a.kind]));
    expect(actions["AGENTS.md"]).toBe("update-block");
    expect(actions["CLAUDE.md"]).toBe("append-block");
    expect(actions["GEMINI.md"]).toBe("skip");
    expect(buildPlan(root, { createPointers: true }).actions.find((a) => a.path === "GEMINI.md")?.kind).toBe("create");
  });

  it("writes nothing", () => {
    const before = snapshot(root);
    buildPlan(root);
    expect(snapshot(root)).toEqual(before);
  });
});
