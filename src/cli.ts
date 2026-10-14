#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { type CheckReport, runCheck, stampDocs } from "./check.js";
import { loadPrompt, writeIndex } from "./agents-index.js";
import { type Candidates, findCandidates } from "./candidates.js";
import { runClaudeHook } from "./hook.js";
import { installClaudeHook, installGitHook } from "./install.js";
import { buildPlan } from "./plan.js";
import { renderPlan } from "./render.js";
import { planUpdate, type UpdatePlan } from "./update.js";

const HELP = `ctxmap — lean, always-current AI context for a repository

Usage:
  ctxmap plan [path]               Inventory the repo and show what init would write (no LLM, no writes)
  ctxmap init [path] --dry-run     Same as plan
  ctxmap check [path]              Validate refs in context docs and report stale ones (no LLM, no network)
  ctxmap stamp [path] [doc...]     Mark docs as verified now: record source hashes in the manifest
  ctxmap candidates [path]         Rank flow candidates and gotcha evidence from code + git history (no LLM)
  ctxmap update [path]             Fix refs to renamed files; list stale docs and uncovered entry points (no LLM)
  ctxmap prompt init [--auto]      Print the generation prompt for your AI agent (skill mode)
  ctxmap prompt update             Print the update prompt: the agent patches stale docs from the git diff
  ctxmap index [path]              Write the AGENTS.md block, CLAUDE.md/GEMINI.md pointers and presentation.md
  ctxmap hooks install [path]      Install the git pre-commit check and the Claude Code edit hook
  ctxmap hook claude               (internal) Claude Code PreToolUse hook; reads hook JSON on stdin

Options:
  --json             Machine-readable output
  --strict           check: also fail on changed or unstamped docs (default: only broken refs fail)
  --external         check: also report broken file refs in existing docs (README, docs/, CLAUDE.md...)
  --force            stamp: stamp docs even if they have broken refs
  --limit <n>        candidates: how many flows to list (default 10)
  --auto             prompt: the agent picks flows itself instead of asking you first
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
      limit: { type: "string" },
      auto: { type: "boolean" },
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
        process.stderr.write(
          "ctxmap init generates docs with your AI agent (skill mode): ask it to run `ctxmap prompt init` and follow it.\n" +
            "Direct API mode is not available yet. Showing the plan:\n\n",
        );
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

    case "candidates": {
      const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;
      const result = findCandidates(resolve(rest[0] ?? "."), { limit });
      process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : renderCandidates(result));
      return 0;
    }

    case "update": {
      const plan = planUpdate(resolve(rest[0] ?? "."), { contextDir, write: !values["dry-run"] });
      process.stdout.write(values.json ? `${JSON.stringify(plan, null, 2)}\n` : renderUpdate(plan));
      return 0;
    }

    case "prompt": {
      if (rest[0] === "update") {
        process.stdout.write(loadPrompt("update", {}));
        return 0;
      }
      if (rest[0] !== "init") break;
      const flows = values.flows ?? "5";
      const choose = values.auto
        ? "Do not ask: choose the flows yourself and state the choice and reasons in your final report."
        : "Before writing anything, present the chosen flows as a short list (name — trigger — why) and ask the user to confirm or edit it.";
      process.stdout.write(loadPrompt("init", { FLOW_COUNT: flows, CHOOSE_MODE: choose }));
      return 0;
    }

    case "index": {
      const result = writeIndex(resolve(rest[0] ?? "."), { contextDir, pointers: values.pointers });
      for (const p of result.written) process.stdout.write(`written    ${p}\n`);
      for (const p of result.unchanged) process.stdout.write(`unchanged  ${p}\n`);
      return 0;
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

function renderCandidates(c: Candidates): string {
  const s = c.stats;
  const out = [
    `Analysed ${s.sourceFiles} source files in ${s.modules} modules, ${s.entryFiles} entry files, ${s.commits} commits${s.shallow ? " (shallow clone: history truncated)" : ""}.`,
    "",
    "Flow candidates (entry points ranked by modules reached × recent churn × triggers):",
  ];
  c.flows.forEach((f, i) => {
    const more = f.triggerCount > f.triggers.length ? ` +${f.triggerCount - f.triggers.length}` : "";
    out.push(`${String(i + 1).padStart(3)}. ${f.file}  [${f.kind}] ${f.triggers.slice(0, 3).join(", ")}${more}`);
    out.push(`     reaches ${f.modules.length} modules${f.modules.length ? ` (${f.modules.slice(0, 5).join(", ")}${f.modules.length > 5 ? ", …" : ""})` : ""}; ${f.churn} recent commits`);
  });
  if (c.flows.length === 0) out.push("  (no entry points detected)");
  out.push("", "Gotcha evidence — files that keep needing fixes:");
  for (const h of c.fixHotspots.slice(0, 10)) out.push(`  ${String(h.fixes).padStart(3)} fixes  ${h.file}  e.g. ${h.examples[0]?.hash} "${h.examples[0]?.subject}"`);
  if (c.fixHotspots.length === 0) out.push("  (none: no repeated fix commits in the history read)");
  out.push("", "Gotcha evidence — warning comments in frequently changed code:");
  for (const m of c.comments.slice(0, 12)) out.push(`  ${m.file}:${m.line}  ${m.text}`);
  if (c.comments.length === 0) out.push("  (none)");
  if (c.decisionRecords.length > 0) out.push("", `Decision records (rationale source): ${c.decisionRecords.length} files, e.g. ${c.decisionRecords.slice(0, 3).join(", ")}`);
  out.push("", "These are candidates for init to choose from; nothing was written.");
  return `${out.join("\n")}\n`;
}

function renderUpdate(plan: UpdatePlan): string {
  const out: string[] = [];
  for (const r of plan.renamed) out.push(`renamed ref  ${r.doc}: ${r.from} → ${r.to}`);
  if (plan.stale.length === 0) out.push("All docs are fresh. Nothing to update.");
  for (const d of plan.stale) {
    out.push(`${d.status.padEnd(8)} ${d.doc}${d.since ? ` (verified at ${d.since})` : ""}`);
    for (const c of d.changed) out.push(`           changed ${c.file} (+${c.added} −${c.removed})`);
    for (const b of d.broken) out.push(`           broken  ${b.ref}: ${b.detail}`);
  }
  if (plan.uncovered.length > 0) {
    out.push("", "Entry points no flow covers (consider documenting the important ones):");
    for (const u of plan.uncovered) out.push(`  ${u.file}  ${u.triggers.join(", ")}`);
  }
  if (plan.stale.length > 0) out.push("", "Next: ask your AI agent to run `ctxmap prompt update` and follow it (a cheap model is enough).");
  return `${out.join("\n")}\n`;
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
  if (counts.changed + counts.unstamped > 0) out.push("Review changed/unstamped docs, run `ctxmap update` (an agent patches them from the git diff) or `ctxmap stamp` if they're still accurate.");
  if (report.external.length > 0) {
    out.push("", "Broken file refs in existing docs (not owned by ctxmap, informational):");
    for (const d of report.external) for (const b of d.broken) out.push(`  ${d.doc}: ${b.ref.raw}`);
  }
  return `${out.join("\n")}\n`;
}

process.exitCode = main(process.argv.slice(2));
