import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findCandidates } from "./candidates.js";
import { type DocReport, runCheck } from "./check.js";
import { loadManifest, saveManifest } from "./manifest.js";

export interface StaleDoc {
  doc: string;
  status: DocReport["status"];
  /** Commit the doc was stamped at; the agent diffs from here. */
  since?: string;
  changed: { file: string; added: number; removed: number }[];
  broken: { ref: string; detail: string }[];
}

export interface UpdatePlan {
  renamed: { doc: string; from: string; to: string }[];
  stale: StaleDoc[];
  /** High-ranked entry points no flow doc covers: candidates for `add-flow`, never generated automatically. */
  uncovered: { file: string; triggers: string[] }[];
}

const git = (root: string, args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

/** old path → new path for files git sees as renamed since `commit` (working tree included). */
export function renamesSince(root: string, commit: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    for (const line of git(root, ["diff", "--name-status", "-M", commit]).split("\n")) {
      const [status, from, to] = line.split("\t");
      if (status?.startsWith("R") && from && to) map.set(from, to);
    }
  } catch {
    // unknown commit (shallow clone, rewritten history): no rename info
  }
  return map;
}

function numstat(root: string, commit: string, file: string): { added: number; removed: number } {
  try {
    const [added, removed] = git(root, ["diff", "--numstat", commit, "--", file]).trim().split("\t");
    return { added: Number(added) || 0, removed: Number(removed) || 0 };
  } catch {
    return { added: 0, removed: 0 };
  }
}

/**
 * Deterministic part of `update`: rewrite refs to renamed files, then list what still needs an
 * agent (stale or broken docs, with the commit to diff from) and which entry points no flow covers.
 */
export function planUpdate(root: string, options: { contextDir?: string; write?: boolean } = {}): UpdatePlan {
  const contextDir = options.contextDir ?? ".context";
  const manifest = loadManifest(root, contextDir);
  const renamed: UpdatePlan["renamed"] = [];

  for (const doc of runCheck(root, { contextDir }).docs) {
    const since = manifest.docs[doc.doc]?.commit;
    const missing = doc.broken.filter((b) => b.status === "missing-file");
    if (!since || missing.length === 0) continue;
    const renames = renamesSince(root, since);
    let text = readFileSync(join(root, doc.doc), "utf8");
    for (const b of missing) {
      const from = [...renames.keys()].find((old) => old === b.ref.path || old.endsWith(`/${b.ref.path}`));
      const to = from ? renames.get(from) : undefined;
      if (!from || !to) continue;
      text = text.split(`\`${b.ref.raw}\``).join(`\`${b.ref.raw.replace(b.ref.path, to)}\``);
      renamed.push({ doc: doc.doc, from: b.ref.path, to });
    }
    if (options.write !== false && renamed.some((r) => r.doc === doc.doc)) writeFileSync(join(root, doc.doc), text);
  }
  if (options.write !== false && renamed.length > 0) {
    // Carry the stamped hash over to the new path, so a rename that also edited the file still shows as changed.
    for (const { doc, from, to } of renamed) {
      const sources = manifest.docs[doc]?.sources;
      const key = sources && Object.keys(sources).find((k) => k === from || k.endsWith(`/${from}`));
      if (sources && key && sources[key]) {
        sources[to] = sources[key];
        delete sources[key];
      }
    }
    saveManifest(root, contextDir, manifest);
  }

  const report = runCheck(root, { contextDir });
  const stale: StaleDoc[] = report.docs
    .filter((d) => d.status === "changed" || d.status === "broken")
    .map((d) => {
      const since = manifest.docs[d.doc]?.commit;
      return {
        doc: d.doc,
        status: d.status,
        ...(since ? { since } : {}),
        changed: d.changed.map((file) => ({ file, ...(since ? numstat(root, since, file) : { added: 0, removed: 0 }) })),
        broken: d.broken.map((b) => ({ ref: b.ref.raw, detail: "detail" in b ? b.detail : "" })),
      };
    });

  const covered = new Set(Object.entries(manifest.docs).filter(([doc]) => doc.includes("/flows/")).flatMap(([, e]) => Object.keys(e.sources)));
  const uncovered = findCandidates(root, { limit: 8 })
    .flows.filter((f) => !covered.has(f.file))
    .map((f) => ({ file: f.file, triggers: f.triggers.slice(0, 3) }));

  return { renamed, stale, uncovered };
}
