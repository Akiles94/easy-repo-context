import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { runCheck, stampDocs } from "../src/check.js";
import { planUpdate } from "../src/update.js";
import { fixture, write } from "./helpers/fixture.js";

const BODY = ["export function write() {}", "export function other() {}", ...Array.from({ length: 12 }, (_, i) => `export const c${i} = ${i};`)].join("\n") + "\n";

function repo() {
  const root = fixture({
    "src/session.ts": BODY,
    "src/routes.ts": `import { write } from "./session";\nrouter.post("docs.create", h);\nrouter.post("docs.update", h);\n`,
    ".context/flows/save.md": "# Flow: save\n1. `src/session.ts:write()` — writes\n",
  });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "init");
  stampDocs(root);
  return { root, git };
}

describe("update", () => {
  it("rewrites refs to renamed files and carries the hash to the new path", () => {
    const { root, git } = repo();
    git("mv", "src/session.ts", "src/vault-session.ts");
    git("commit", "-qm", "rename");
    expect(runCheck(root).docs[0]?.status).toBe("broken");

    const plan = planUpdate(root);
    expect(plan.renamed).toEqual([{ doc: ".context/flows/save.md", from: "src/session.ts", to: "src/vault-session.ts" }]);
    expect(readFileSync(join(root, ".context/flows/save.md"), "utf8")).toContain("`src/vault-session.ts:write()`");
    expect(plan.stale).toEqual([]);
    const manifest = parse(readFileSync(join(root, ".context/manifest.yaml"), "utf8"));
    expect(Object.keys(manifest.docs[".context/flows/save.md"].sources)).toEqual(["src/vault-session.ts"]);
  });

  it("still reports a renamed file that was also edited", () => {
    const { root, git } = repo();
    git("mv", "src/session.ts", "src/vault-session.ts");
    write(root, "src/vault-session.ts", BODY.replace("write() {}", "write() { return 1; }"));
    git("commit", "-qam", "rename and edit");
    const plan = planUpdate(root);
    expect(plan.stale.map((d) => [d.doc, d.status, d.changed.map((c) => c.file)])).toEqual([[".context/flows/save.md", "changed", ["src/vault-session.ts"]]]);
  });

  it("lists changed docs with the commit to diff from and line counts", () => {
    const { root, git } = repo();
    const since = git("rev-parse", "--short=12", "HEAD").trim();
    write(root, "src/session.ts", `${BODY.replace("write() {}", "write() { audit(); }")}export function audit() {}\n`);
    git("commit", "-qam", "audit writes");
    const [doc] = planUpdate(root).stale;
    expect(doc).toMatchObject({ doc: ".context/flows/save.md", status: "changed", since, changed: [{ file: "src/session.ts", added: 2, removed: 1 }] });
  });

  it("dry run writes nothing", () => {
    const { root, git } = repo();
    git("mv", "src/session.ts", "src/vault-session.ts");
    git("commit", "-qm", "rename");
    const before = readFileSync(join(root, ".context/flows/save.md"), "utf8");
    expect(planUpdate(root, { write: false }).renamed).toHaveLength(1);
    expect(readFileSync(join(root, ".context/flows/save.md"), "utf8")).toBe(before);
  });

  it("reports entry points no flow covers", () => {
    const { root } = repo();
    expect(planUpdate(root).uncovered.map((u) => u.file)).toEqual(["src/routes.ts"]);
  });
});
