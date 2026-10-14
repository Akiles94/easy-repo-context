#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { type CheckReport, runCheck, stampDocs } from "./check.js";
import { runClaudeHook } from "./hook.js";
import { installClaudeHook, installGitHook } from "./install.js";
import { buildPlan } from "./plan.js";
import { renderPlan } from "./render.js";

const HELP = `ctxmap — lean, always-current AI context for a repository

Usage:
  ctxmap plan [path]               Inventory the repo and show what init would write (no LLM, no writes)
  ctxmap init [path] --dry-run     Same as plan
  ctxmap check [path]              Validate refs in context docs and report stale ones (no LLM, no network)
  ctxmap stamp [path] [doc...]     Mark docs as verified now: record source hashes in the manifest
  ctxmap hooks install [path]      Install the git pre-commit check and the Claude Code edit hook
  ctxmap hook claude               (internal) Claude Code PreToolUse hook; reads hook JSON on stdin

Options:
  --json             Machine-readable output
  --strict           check: also fail on changed or unstamped docs (default: only broken refs fail)
  --external         check: also report broken file refs in existing docs (README, docs/, CLAUDE.md...)
  --force            stamp: stamp docs even if they have broken refs
  --git / --claude   hooks install: only that hook (default: both)
  --pointers         plan: also create CLAUDE.md / GEMINI.md pointers when they don't exist
  --flows <n>        plan: number of flows to propose (default 6)
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
      strict: { type: "boolean" },
      external: { type: "boolean" },
      force: { type: "boolean" },
      git: { type: "boolean" },
      claude: { type: "boolean" },
      pointers: { type: "boolean" },
      flows: { type: "string" },
      "context-dir": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const [command, ...rest] = positionals;
  const contextDir = values["context-dir"];
  if (values.help || !command) {
    process.stdout.write(HELP);
    return command || values.help ? 0 : 1;
  }

  switch (command) {
    case "plan":
    case "init": {
      if (command === "init" && !values["dry-run"]) {
        process.stderr.write("ctxmap init: generation is not implemented yet; run with --dry-run to see the plan.\n");
        return 2;
      }
      const flows = values.flows ? Number.parseInt(values.flows, 10) : undefined;
      if (flows !== undefined && (!Number.isFinite(flows) || flows < 0)) {
        process.stderr.write("--flows must be a non-negative integer\n");
        return 1;
      }
      const plan = buildPlan(resolve(rest[0] ?? "."), { contextDir, createPointers: values.pointers, flows });
      process.stdout.write(values.json ? `${JSON.stringify(plan, null, 2)}\n` : `${renderPlan(plan)}\n`);
      return 0;
    }

    case "check": {
      const report = runCheck(resolve(rest[0] ?? "."), { contextDir, external: values.external });
      process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : renderCheck(report));
      const failing = report.docs.filter((d) => d.status === "broken" || (values.strict && d.status !== "fresh"));
      return failing.length > 0 ? 1 : 0;
    }

    case "stamp": {
      const [path, ...docs] = rest;
      const result = stampDocs(resolve(path ?? "."), { contextDir, docs, force: values.force });
      for (const doc of result.stamped) process.stdout.write(`stamped  ${doc}\n`);
      for (const r of result.refused) {
        process.stdout.write(`refused  ${r.doc} (broken refs; fix them or use --force)\n`);
        for (const b of r.broken) process.stdout.write(`           ${b.ref.raw}: ${"detail" in b ? b.detail : ""}\n`);
      }
      return result.refused.length > 0 ? 1 : 0;
    }

    case "hooks": {
      if (rest[0] !== "install") break;
      const root = resolve(rest[1] ?? ".");
      const both = !values.git && !values.claude;
      const outcomes = [...(both || values.git ? [installGitHook(root)] : []), ...(both || values.claude ? [installClaudeHook(root)] : [])];
      for (const o of outcomes) process.stdout.write(`${o.result.padEnd(15)} ${o.path}${o.note ? ` — ${o.note}` : ""}\n`);
      return 0;
    }

    case "hook": {
      if (rest[0] !== "claude") break;
      try {
        const out = runClaudeHook(readFileSync(0, "utf8"));
        if (out) process.stdout.write(`${out}\n`);
      } catch {
        // a context hook must never block an edit
      }
      return 0;
    }
  }

  process.stderr.write(`Unknown command: ${positionals.join(" ")}\n\n${HELP}`);
  return 1;
}

function renderCheck(report: CheckReport): string {
  const out: string[] = [];
  const counts = { fresh: 0, changed: 0, unstamped: 0, broken: 0 };
  for (const d of report.docs) {
    counts[d.status]++;
    if (d.status === "fresh") continue;
    out.push(`${d.status.padEnd(9)} ${d.doc}`);
    for (const b of d.broken) out.push(`            ${b.ref.raw}: ${"detail" in b ? b.detail : ""}`);
    for (const c of d.changed) out.push(`            changed since stamp: ${c}`);
  }
  if (report.docs.length === 0) out.push("No ctxmap docs found.");
  else out.push(`${report.docs.length} docs: ${counts.fresh} fresh, ${counts.changed} changed, ${counts.unstamped} unstamped, ${counts.broken} broken`);
  if (counts.changed + counts.unstamped > 0) out.push("Review changed/unstamped docs, then run `ctxmap stamp` (or `ctxmap update` once available).");
  if (report.external.length > 0) {
    out.push("", "Broken file refs in existing docs (not owned by ctxmap, informational):");
    for (const d of report.external) for (const b of d.broken) out.push(`  ${d.doc}: ${b.ref.raw}`);
  }
  return `${out.join("\n")}\n`;
}

process.exitCode = main(process.argv.slice(2));
