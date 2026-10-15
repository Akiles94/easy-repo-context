import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { findCandidates } from "../src/candidates.js";
import { findEntryPoints } from "../src/entries.js";
import { listFiles } from "../src/files.js";
import { buildImportGraph, closure, detectAliases, moduleMap, sourceFiles } from "../src/graph.js";
import { isFixCommit } from "../src/history.js";
import { fixture, write } from "./helpers/fixture.js";

describe("import graph", () => {
  const root = fixture({
    "tsconfig.json": `{ "compilerOptions": { /* c */ "baseUrl": ".", "paths": { "@server/*": ["./server/*"] }, } }`,
    "server/routes/docs.ts": `import { create } from "@server/commands/create";\nimport x from "./helpers.js";\nconst y = require("../models/doc");\n`,
    "server/routes/helpers.ts": "export default 1;\n",
    "server/commands/create.ts": `import { Doc } from "../models/doc";\n`,
    "server/models/doc.ts": "export class Doc {}\n",
    "server/models/doc.test.ts": "import '../models/doc';\n",
    "py/app/api.py": "from .services import billing\nfrom app.models import User\nimport app.util\n",
    "py/app/services/billing.py": "",
    "py/app/models.py": "",
    "py/app/util.py": "",
  });
  const files = listFiles(root);
  const graph = buildImportGraph(root, sourceFiles(files), { aliases: detectAliases(root, files) });

  it("resolves relative, NodeNext .js, require and tsconfig path imports", () => {
    expect(graph.edges.get("server/routes/docs.ts")?.sort()).toEqual(["server/commands/create.ts", "server/models/doc.ts", "server/routes/helpers.ts"]);
    expect(closure(graph, "server/routes/docs.ts")).toContain("server/models/doc.ts");
  });

  it("excludes tests from sources", () => {
    expect(graph.edges.has("server/models/doc.test.ts")).toBe(false);
  });

  it("resolves python relative and submodule imports", () => {
    // rooted at py/: dotted names resolve relative to the repo root, so only the relative import resolves here
    expect(graph.edges.get("py/app/api.py")).toContain("py/app/services/billing.py");
  });
});

describe("moduleMap", () => {
  it("skips src/, splits a dominant feature folder, keeps layered modules whole", () => {
    const files = [
      ...Array.from({ length: 10 }, (_, i) => `src/server/routes/r${i}.ts`),
      ...Array.from({ length: 10 }, (_, i) => `src/server/models/m${i}.ts`),
      "src/server/utils/u.ts",
      "src/vault/domain/a.ts",
      "src/vault/application/b.ts",
      "src/vault/infra/c.ts",
      "src/shared/x.ts",
    ];
    const m = moduleMap(files);
    expect(m.get("src/server/routes/r1.ts")).toBe("server/routes");
    expect(m.get("src/server/models/m1.ts")).toBe("server/models");
    expect(m.get("src/vault/infra/c.ts")).toBe("vault");
  });
});

describe("entry points", () => {
  it("finds routes, tools, commands, queues and path-convention routes", () => {
    const root = fixture({
      "server/api.ts": `router.post("documents.create", auth(), async (ctx) => {});\nrouter.post("documents.list", h);\n`,
      "mcp.ts": `server.registerTool(\n  "save_context",\n  {}, h);\n`,
      "cli.ts": `program.command("init").action(x);\n`,
      "queue.ts": `queue.process("emails", h);\n`,
      "app/api/users/route.ts": "export async function GET() {}\n",
      "api.py": `@app.get("/items/{id}")\ndef read(id): ...\n`,
    });
    const found = findEntryPoints(root, ["server/api.ts", "mcp.ts", "cli.ts", "queue.ts", "app/api/users/route.ts", "api.py"]);
    const by = Object.fromEntries(found.map((e) => [e.file, [e.kind, e.triggers, e.count]]));
    expect(by["server/api.ts"]).toEqual(["http", ["documents.create", "documents.list"], 2]);
    expect(by["mcp.ts"]).toEqual(["rpc", ["save_context"], 1]);
    expect(by["cli.ts"]).toEqual(["cli", ["init"], 1]);
    expect(by["queue.ts"]?.[0]).toBe("queue");
    expect(by["app/api/users/route.ts"]).toEqual(["http", ["/api/users"], 1]);
    expect(by["api.py"]).toEqual(["http", ["/items/{id}"], 1]);
  });
});

it("classifies fix commits and ignores noise", () => {
  const c = (subject: string, files = ["a.ts"]) => ({ hash: "h", date: "2026-01-01", subject, files });
  expect(isFixCommit(c("fix: race when saving twice"))).toBe(true);
  expect(isFixCommit(c("Revert \"add cache\""))).toBe(true);
  expect(isFixCommit(c("fix typo in docs"))).toBe(false);
  expect(isFixCommit(c("chore(deps): bump fix-path"))).toBe(false);
  expect(isFixCommit(c("feat: add export"))).toBe(false);
});

describe("findCandidates", () => {
  it("ranks flows and mines fix hotspots and warning comments from git", () => {
    const root = fixture({
      "src/routes/docs.ts": `import { save } from "../store/save";\nimport { audit } from "../audit/log";\nrouter.post("docs.create", h);\nrouter.post("docs.update", h);\n`,
      "src/routes/health.ts": `router.get("/health", h);\n`,
      "src/store/save.ts": "// Every write MUST go through save() or the audit trail is lost.\nexport function save() {}\n",
      "src/audit/log.ts": "export function audit() {}\n",
    });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
    git("init", "-q");
    git("add", ".");
    git("commit", "-qm", "init");
    for (const n of [1, 2]) {
      write(root, "src/store/save.ts", `// Every write MUST go through save() or the audit trail is lost.\nexport function save() { return ${n}; }\n`);
      git("commit", "-qam", `fix: lost write ${n}`);
    }
    const c = findCandidates(root);
    expect(c.flows[0]).toMatchObject({ file: "src/routes/docs.ts", kind: "http", triggers: ["docs.create", "docs.update"] });
    expect(c.flows[0]?.modules).toEqual(["audit", "store"]);
    expect(c.fixHotspots).toEqual([{ file: "src/store/save.ts", fixes: 2, examples: expect.any(Array) }]);
    expect(c.comments[0]).toMatchObject({ file: "src/store/save.ts", line: 1 });
  });
});
