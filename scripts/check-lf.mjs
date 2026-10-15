// Refuse to publish executables with CRLF line endings: `#!/usr/bin/env node\r` fails on macOS and Linux.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["dist/cli.js", "packages/erctx/cli.js"];
const bad = files.filter((f) => readFileSync(join(root, f), "utf8").includes("\r"));
if (bad.length > 0) {
  console.error(`CRLF line endings in ${bad.join(", ")}. Run: git add --renormalize . && git checkout -- . && npm run build`);
  process.exit(1);
}
console.log("line endings ok");
