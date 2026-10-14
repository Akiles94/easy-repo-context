#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildPlan } from "./plan.js";
import { renderPlan } from "./render.js";

const HELP = `ctxmap — lean, always-current AI context for a repository

Usage:
  ctxmap init [path] --dry-run   Inventory the repo and show what init would write (no LLM, no writes)
  ctxmap plan [path]             Same as init --dry-run

Options:
  --json             Machine-readable output
  --pointers         Also create CLAUDE.md / GEMINI.md pointers when they don't exist
  --flows <n>        Number of flows to propose (default 6)
  --context-dir <d>  Output folder (default .context)
  -h, --help         Show this help
`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      pointers: { type: "boolean" },
      flows: { type: "string" },
      "context-dir": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const [command, target] = positionals;
  if (values.help || !command) {
    process.stdout.write(HELP);
    return command || values.help ? 0 : 1;
  }

  if (command === "plan" || command === "init") {
    if (command === "init" && !values["dry-run"]) {
      process.stderr.write("ctxmap init: generation is not implemented yet; run with --dry-run to see the plan.\n");
      return 2;
    }
    const flows = values.flows ? Number.parseInt(values.flows, 10) : undefined;
    if (flows !== undefined && (!Number.isFinite(flows) || flows < 0)) {
      process.stderr.write("--flows must be a non-negative integer\n");
      return 1;
    }
    const plan = buildPlan(resolve(target ?? "."), {
      contextDir: values["context-dir"],
      createPointers: values.pointers,
      flows,
    });
    process.stdout.write(values.json ? `${JSON.stringify(plan, null, 2)}\n` : `${renderPlan(plan)}\n`);
    return 0;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
