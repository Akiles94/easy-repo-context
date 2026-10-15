export const BEGIN = "<!-- easy-repo-context:begin -->";
export const END = "<!-- easy-repo-context:end -->";

export function hasManagedBlock(text: string): boolean {
  return text.includes(BEGIN) && text.indexOf(END) > text.indexOf(BEGIN);
}

export function readManagedBlock(raw: string): string | undefined {
  const text = raw.replace(/\r\n?/g, "\n");
  if (!hasManagedBlock(text)) return undefined;
  const start = text.indexOf(BEGIN) + BEGIN.length;
  return text.slice(start, text.indexOf(END, start)).replace(/^\n/, "").replace(/\n$/, "");
}

/**
 * Write `body` inside the managed block, leaving everything outside it byte-identical.
 * With no block present, the block is appended (or prepended with `position: "top"`).
 */
export function spliceManagedBlock(raw: string, body: string, position: "top" | "bottom" = "bottom"): string {
  // Work in LF and write back in the file's own line endings, so CRLF files don't end up mixed.
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const result = spliceLf(raw.replace(/\r\n?/g, "\n"), body.replace(/\r\n?/g, "\n"), position);
  return eol === "\n" ? result : result.replace(/\n/g, "\r\n");
}

function spliceLf(text: string, body: string, position: "top" | "bottom"): string {
  const block = `${BEGIN}\n${body.replace(/\n+$/, "")}\n${END}`;
  if (hasManagedBlock(text)) {
    const start = text.indexOf(BEGIN);
    const end = text.indexOf(END, start) + END.length;
    return text.slice(0, start) + block + text.slice(end);
  }
  if (text.trim() === "") return `${block}\n`;
  if (position === "top") return `${block}\n\n${text}`;
  return `${text.replace(/\n*$/, "")}\n\n${block}\n`;
}
