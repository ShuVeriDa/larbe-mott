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
  switch (n.type) {
    case "paragraph":
      text += "\n";
      break;

    case "heading":
      text += "\n\n";
      break;

    case "listItem":
      text += "\n";
      break;

    case "hardBreak":
      text += "\n";
      break;

    case "blockquote":
      text += "\n";
      break;

    case "codeBlock":
      text += "\n\n";
      break;
  }

  return text;
}
