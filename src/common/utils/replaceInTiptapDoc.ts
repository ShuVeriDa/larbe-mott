/**
 * Replaces the character range [startOffset, endOffset] in the flat text representation
 * of a TipTap document (same order as extractTextFromTiptap) with newText.
 * Returns a new document; does not mutate the input.
 */
export function replaceInTiptapDoc(
  doc: unknown,
  startOffset: number,
  endOffset: number,
  newText: string,
): unknown {
  if (!doc || typeof doc !== "object") return doc;

  let newTextUsed = 0;

  function visit(node: Record<string, unknown>, pos: { current: number }): unknown {
    if (typeof node.text === "string") {
      const start = pos.current;
      const end = start + node.text.length;
      pos.current = end;

      if (end <= startOffset || start >= endOffset) {
        return { ...node };
      }

      const localStart = Math.max(0, startOffset - start);
      const localEnd = Math.min(node.text.length, endOffset - start);
      const take = Math.min(localEnd - localStart, newText.length - newTextUsed);
      const replacement = newText.slice(newTextUsed, newTextUsed + take);
      newTextUsed += take;

      const newStr =
        node.text.slice(0, localStart) + replacement + node.text.slice(localEnd);
      return { ...node, text: newStr };
    }

    const out: Record<string, unknown> = { ...node };

    // Match extractTextFromTiptap: block node emits its newline(s) first, then content
    let blockLen = 0;
    switch (node.type) {
      case "paragraph":
      case "listItem":
      case "hardBreak":
      case "blockquote":
        blockLen = 1;
        break;
      case "heading":
      case "codeBlock":
        blockLen = 2;
        break;
      default:
        break;
    }
    if (blockLen > 0) {
      pos.current += blockLen;
    }

    if (Array.isArray(node.content)) {
      out.content = node.content.map((child: unknown) =>
        visit(child as Record<string, unknown>, pos),
      );
    }

    return out;
  }

  const pos = { current: 0 };
  return visit(doc as Record<string, unknown>, pos);
}
