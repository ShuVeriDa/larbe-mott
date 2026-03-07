export function extractTextFromTiptap(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";

  const result: string[] = [];
  const stack: any[] = [doc];

  while (stack.length) {
    const node = stack.pop();

    if (!node || typeof node !== "object") continue;

    if (typeof node.text === "string") {
      result.push(node.text);
    }

    if (Array.isArray(node.content)) {
      for (let i = node.content.length - 1; i >= 0; i--) {
        stack.push(node.content[i]);
      }
    }

    switch (node.type) {
      case "paragraph":
        result.push("\n");
        break;

      case "heading":
        result.push("\n\n");
        break;

      case "listItem":
        result.push("\n");
        break;

      case "hardBreak":
        result.push("\n");
        break;

      case "blockquote":
        result.push("\n");
        break;

      case "codeBlock":
        result.push("\n\n");
        break;
    }
  }

  return result
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
