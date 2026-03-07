export function extractTextFromTiptap(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const n = node as Record<string, any>;
  let text = "";

  // inline text
  if (typeof n.text === "string") {
    text += n.text;
  }

  // children
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      text += extractTextFromTiptap(child);
    }
  }

  // block separators
  if (n.type === "paragraph") {
    text += "\n";
  }

  if (n.type === "heading") {
    text += "\n\n";
  }

  if (n.type === "listItem") {
    text += "\n";
  }

  return text;
}
