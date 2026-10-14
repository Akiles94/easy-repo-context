import { describe, expect, it } from "vitest";
import { buildSuffixIndex, extractRefs, hasJsonKey, hasSymbol, parseRef, resolvePath } from "../src/refs.js";

describe("parseRef", () => {
  it.each([
    ["src/a.ts", { path: "src/a.ts" }],
    ["src/a.ts:Foo.bar()", { path: "src/a.ts", symbol: "Foo.bar" }],
    ["src/a.ts:42", { path: "src/a.ts", line: 42 }],
    ["package.json#scripts.test", { path: "package.json", jsonKey: "scripts.test" }],
  ])("%s", (raw, expected) => expect(parseRef(raw)).toMatchObject(expected));

  it.each(["npm run test", "VAULT_LOCKED", "a → b", "Result<T>"])("ignores %s", (raw) => expect(parseRef(raw)).toBeUndefined());
});

it("skips placeholders and runtime paths", () => {
  const md = "`src/a.ts` `migrations/NNN-x.ts` `advances/<ADV>/plan.md` `$HOME/x.json` `~/.valija/vault.db` `src/*.ts`";
  expect(extractRefs(md).map((r) => r.raw)).toEqual(["src/a.ts"]);
});

describe("resolvePath", () => {
  const files = new Set(["src/context/infra/repo.ts", "src/a/x.ts", "src/b/x.ts", "test/fixtures/vault.json", "package.json", ".context/flows/b.md"]);
  const index = buildSuffixIndex(files);
  const r = (p: string, doc = ".context/flows/a.md") => resolvePath(p, doc, files, index);

  it("resolves exact, doc-relative and suffix paths", () => {
    expect(r("package.json")).toEqual(["package.json"]);
    expect(r("b.md")).toEqual([".context/flows/b.md"]);
    expect(r("context/infra/repo.ts")).toEqual(["src/context/infra/repo.ts"]);
    expect(r("repo.ts")).toEqual(["src/context/infra/repo.ts"]);
  });

  it("reports ambiguity and missing paths with a directory", () => {
    expect(r("x.ts")).toHaveLength(2);
    expect(r("src/gone.ts")).toEqual([]);
  });

  it("does not treat bare non-source names as refs", () => {
    expect(r("vault.json")).toBe("not-a-ref");
    expect(r("gone.ts")).toBe("not-a-ref");
  });
});

describe("hasSymbol", () => {
  const ts = `export class SaveContext {\n  constructor() {}\n  execute(input: X) {}\n  private parseInput<T>(x: T) {}\n}\nexport const helper = () => 1;\nexport function runWithSession() {}\n`;
  it.each(["SaveContext", "SaveContext.execute", "SaveContext.parseInput", "helper", "runWithSession"])("finds %s", (s) =>
    expect(hasSymbol(ts, s)).toBe(true),
  );
  it.each(["SaveContext.missing", "Gone", "input"])("rejects %s", (s) => expect(hasSymbol(ts, s)).toBe(false));
  it("handles python and go", () => {
    expect(hasSymbol("class A:\n    def run(self):\n        pass\n", "A.run")).toBe(true);
    expect(hasSymbol("func (s *Server) Start() error {\n}\n", "Start")).toBe(true);
  });
});

it("checks json key paths", () => {
  const pkg = JSON.stringify({ scripts: { test: "vitest", "test:watch": "vitest" } });
  expect(hasJsonKey(pkg, "scripts.test")).toBe(true);
  expect(hasJsonKey(pkg, "scripts.test:watch")).toBe(true);
  expect(hasJsonKey(pkg, "scripts.lint")).toBe(false);
});
