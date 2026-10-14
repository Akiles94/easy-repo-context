import type { Plan } from "./plan.js";

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`);

const VERB = { create: "create", "append-block": "append block", "update-block": "update block", skip: "skip" } as const;

export function renderPlan(plan: Plan): string {
  const out: string[] = [];
  const langs = Object.entries(plan.stats.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `${l} ${n}`)
    .join(", ");

  out.push(`easy-repo-context plan (dry run) — ${plan.root}`);
  out.push("");
  out.push(`Repo: ${plan.stats.files} files, ${plan.stats.sourceFiles} source (${langs || "none detected"}), ~${k(plan.stats.sourceTokens)} tokens of code`);

  out.push("");
  out.push("Existing context found (read-only, will be linked, never rewritten):");
  if (plan.docs.length === 0) out.push("  (none)");
  const groups = [
    ["agent-instructions", "Agent instructions"],
    ["agent-config", "Agent config (agents, skills, hooks)"],
    ["human-docs", "Human docs"],
  ] as const;
  for (const [kind, label] of groups) {
    const items = plan.docs.filter((d) => d.kind === kind);
    if (items.length === 0) continue;
    const total = items.reduce((n, d) => n + d.tokens, 0);
    out.push(`  ${label}: ${items.length} file(s), ~${k(total)} tokens`);
    if (kind === "agent-config" && items.length > 8) {
      // Skills and agents come as folders of files; one line per folder is enough to see what exists.
      const groups = new Map<string, { n: number; tokens: number; tool?: string }>();
      for (const d of items) {
        const key = d.path.split("/").slice(0, 3).join("/");
        const g = groups.get(key) ?? { n: 0, tokens: 0, tool: d.tool };
        g.n++;
        g.tokens += d.tokens;
        groups.set(key, g);
      }
      for (const [dir, g] of groups) out.push(`    ${dir}${g.n > 1 ? `/ (${g.n} files)` : ""}${g.tool ? ` [${g.tool}]` : ""} ~${k(g.tokens)}`);
      continue;
    }
    const shown = kind === "human-docs" ? items.slice(0, 12) : items;
    for (const d of shown) out.push(`    ${d.path}${d.tool && kind !== "human-docs" ? ` [${d.tool}]` : ""} ~${k(d.tokens)}${d.managed ? " (has easy-repo-context block)" : ""}`);
    if (shown.length < items.length) out.push(`    … ${items.length - shown.length} more`);
  }

  out.push("");
  out.push("Commands (each sourced from a real file):");
  const useful = plan.commands.filter((c) => c.role !== "other");
  if (useful.length === 0) out.push("  (none detected)");
  for (const c of useful) out.push(`  ${c.role.padEnd(9)} ${c.command.padEnd(24)} ← ${c.source}`);
  const others = plan.commands.length - useful.length;
  if (others > 0) out.push(`  + ${others} other script(s), listed only if relevant`);

  out.push("");
  out.push("Planned writes:");
  for (const a of plan.actions) out.push(`  ${VERB[a.kind].padEnd(12)} ${a.path.padEnd(24)} ${a.why}`);

  out.push("");
  const { before, after } = plan.alwaysLoadedTokens;
  out.push(`Always-loaded context: ~${k(before)} tokens today → ~${k(after)} after (AGENTS.md block ≤ ~60 lines)`);
  const e = plan.estimate;
  out.push(`LLM estimate for init: ${e.calls} calls, ~${k(e.inputTokens)} input + ~${k(e.outputTokens)} output tokens`);
  for (const n of e.notes) out.push(`  - ${n}`);

  out.push("");
  out.push("Nothing was written. Generation lands in a later milestone.");
  return out.join("\n");
}
