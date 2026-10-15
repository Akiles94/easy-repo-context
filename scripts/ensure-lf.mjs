// Published executables must use LF: `#!/usr/bin/env node\r` fails on macOS and Linux.
// A Windows checkout can have CRLF sources no matter what .gitattributes says, so normalize after building.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ...readdirSync(join(root, "dist")).filter((f) => f.endsWith(".js")).map((f) => join(root, "dist", f)),
  join(root, "packages", "erctx", "cli.js"),
];
let fixed = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!text.includes("\r")) continue;
  writeFileSync(file, text.replace(/\r\n?/g, "\n"));
  fixed++;
}
console.log(fixed > 0 ? `converted ${fixed} file(s) to LF line endings` : "line endings ok");
