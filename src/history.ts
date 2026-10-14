import { execFileSync } from "node:child_process";

export interface Commit {
  hash: string;
  date: string;
  subject: string;
  files: string[];
}

export interface History {
  commits: Commit[];
  /** True when the clone is shallow and history may be truncated. */
  shallow: boolean;
}

/** Last `maxCommits` non-merge commits, with the files each touched. Empty outside git. */
export function readHistory(root: string, maxCommits = 1000): History {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  let raw: string;
  try {
    raw = git(["log", "--no-merges", `-n${maxCommits}`, "--format=%x1e%h%x1f%as%x1f%s", "--name-only"]);
  } catch {
    return { commits: [], shallow: false };
  }
  let shallow = false;
  try {
    shallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  } catch {
    // older git
  }
  const commits: Commit[] = [];
  for (const block of raw.split("\x1e")) {
    const [header, ...rest] = block.split("\n");
    if (!header) continue;
    const [hash, date, subject] = header.split("\x1f");
    if (!hash || !date) continue;
    commits.push({ hash, date, subject: subject ?? "", files: rest.map((l) => l.trim()).filter(Boolean) });
  }
  return { commits, shallow };
}

export function churn(history: History, sinceDays = 180): Map<string, number> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const recent = history.commits.filter((c) => c.date >= since);
  // A quiet repo still has a shape: fall back to the latest commits we have.
  const window = recent.length >= 20 ? recent : history.commits.slice(0, 300);
  const counts = new Map<string, number>();
  for (const c of window) {
    // Sweeping commits (formatting, renames, dependency bumps) say nothing about where work happens.
    if (c.files.length > 50) continue;
    for (const f of c.files) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return counts;
}

const FIX = /\b(fix(es|ed|ing)?|bug|revert|regression|hotfix|race|deadlock|leak|crash(es|ed)?|broke(n)?|corrupt(ion|ed)?|data loss|incorrect(ly)?|wrong)\b/i;
const NOISE = /\b(typo|lint|format(ting)?|prettier|readme|docs?|ci|deps?|bump|dependabot|renovate|changelog|translation|i18n|copy|storybook|flaky test)\b/i;

export function isFixCommit(c: Commit): boolean {
  return FIX.test(c.subject) && !NOISE.test(c.subject) && c.files.length > 0 && c.files.length <= 30;
}
