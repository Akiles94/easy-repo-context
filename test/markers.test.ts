import { describe, expect, it } from "vitest";
import { BEGIN, END, readManagedBlock, spliceManagedBlock } from "../src/markers.js";

describe("spliceManagedBlock", () => {
  it("creates a block in an empty file", () => {
    expect(spliceManagedBlock("", "hello")).toBe(`${BEGIN}\nhello\n${END}\n`);
  });

  it("appends without touching user content", () => {
    const user = "# My rules\n\nDon't touch prod.\n";
    const out = spliceManagedBlock(user, "index");
    expect(out.startsWith(user.trimEnd())).toBe(true);
    expect(readManagedBlock(out)).toBe("index");
  });

  it("replaces only the block and is idempotent", () => {
    const before = `top\n${BEGIN}\nold\n${END}\nbottom\n`;
    const once = spliceManagedBlock(before, "new");
    expect(once).toBe(`top\n${BEGIN}\nnew\n${END}\nbottom\n`);
    expect(spliceManagedBlock(once, "new")).toBe(once);
  });

  it("can prepend", () => {
    expect(spliceManagedBlock("user\n", "ptr", "top")).toBe(`${BEGIN}\nptr\n${END}\n\nuser\n`);
  });
});

describe("Windows line endings", () => {
  it("keeps CRLF files in CRLF and reads blocks without stray \\r", () => {
    const user = "# Rules\r\nkeep\r\n";
    const out = spliceManagedBlock(user, "line one\nline two");
    expect(out).toBe(`# Rules\r\nkeep\r\n\r\n${BEGIN}\r\nline one\r\nline two\r\n${END}\r\n`);
    expect(readManagedBlock(out)).toBe("line one\nline two");
    expect(spliceManagedBlock(out, "line one\nline two")).toBe(out);
  });
});
