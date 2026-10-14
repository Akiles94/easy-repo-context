import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPrompt, renderAgentsBlock, writeIndex } from "../src/agents-index.js";
import { BEGIN, END, readManagedBlock } from "../src/markers.js";
import { fixture, write } from "./helpers/fixture.js";

const repo = () =>
  fixture({
    "package.json": JSON.stringify({ scripts: { test: "vitest", "test:watch": "vitest", lint: "biome check ." } }),
    "CLAUDE.md": "# House rules\nNever push to main.\n",
    "docs/arch.md": "# Arch\n",
    "test/fixtures/README.md": "fixture\n",
    ".context/overview.md": "# Overview\nPurpose: billing service for invoices.\n",
    ".context/gotchas.md": "- money is cents\n",
    ".context/flows/charge.md": "# Flow: charge-invoice\nSummary: POST /charge → PSP → ledger\n",
  });

describe("index", () => {
  it("renders an index derived from real files", () => {
    const block = renderAgentsBlock(repo());
    expect(block).toContain("billing service for invoices.");
    expect(block).toContain("- test: `npm test` (package.json#scripts.test)");
    expect(block).not.toContain("test:watch");
    expect(block).toContain("charge-invoice: POST /charge → PSP → ledger → `.context/flows/charge.md`");
    expect(block).toContain("`docs/arch.md`");
    expect(block).not.toContain("test/fixtures");
    expect(block.split("\n").length).toBeLessThanOrEqual(60);
  });

  it("writes only managed blocks, keeps user text, and is idempotent", () => {
    const root = repo();
    write(root, "AGENTS.md", "# Mine\nkeep me\n");
    const first = writeIndex(root);
    expect(first.written.sort()).toEqual([".context/presentation.md", "AGENTS.md", "CLAUDE.md"]);
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(agents.startsWith("# Mine\nkeep me\n")).toBe(true);
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe(`# House rules\nNever push to main.\n\n${BEGIN}\nRepo index for AI agents (flows, gotchas, where things live): @AGENTS.md\n${END}\n`);
    expect(writeIndex(root).written).toEqual([]);
  });

  it("does not create tool pointers that don't exist, nor overwrite presentation.md", () => {
    const root = repo();
    write(root, ".context/presentation.md", "custom\n");
    const result = writeIndex(root);
    expect(result.written).not.toContain("GEMINI.md");
    expect(readFileSync(join(root, ".context/presentation.md"), "utf8")).toBe("custom\n");
    expect(writeIndex(root, { pointers: true }).written).toContain("GEMINI.md");
    expect(readManagedBlock(readFileSync(join(root, "GEMINI.md"), "utf8"))).toContain("@AGENTS.md");
  });
});

it("fills prompt variables", () => {
  const text = loadPrompt("init", { FLOW_COUNT: "3", CHOOSE_MODE: "Pick yourself." });
  expect(text).toContain("(3 by default)");
  expect(text).toContain("Pick yourself.");
  expect(text).not.toMatch(/\{\{\w+\}\}/);
});
