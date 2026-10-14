import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ctxmap-"));
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  return root;
}

export function write(root: string, path: string, content: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
}
