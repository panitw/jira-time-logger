/**
 * Minimal Atlassian Document Format (ADF) helpers.
 *
 * Jira Cloud REST API v3 worklog `comment` is ADF (an object), not a plain
 * string. These helpers cover the only ADF shape this app needs: a single
 * paragraph of plain text. They never throw — `adfToText` is best-effort and
 * returns '' on anything unexpected. Do NOT pull in a full ADF library.
 */

export type AdfDoc = {
  type: 'doc';
  version: 1;
  content: Array<{
    type: 'paragraph';
    content: Array<{ type: 'text'; text: string }>;
  }>;
};

/** Wrap a plain string in a minimal single-paragraph ADF doc. */
export function textToAdf(text: string): AdfDoc {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/**
 * Best-effort extraction of plain text from an ADF comment. Reads the text
 * nodes of the first paragraph. Returns '' on anything unexpected; never throws.
 */
export function adfToText(comment: unknown): string {
  try {
    if (typeof comment !== 'object' || comment === null) return '';
    const content = (comment as { content?: unknown }).content;
    if (!Array.isArray(content)) return '';
    const firstParagraph = content.find(
      (node) =>
        typeof node === 'object' &&
        node !== null &&
        (node as { type?: unknown }).type === 'paragraph',
    );
    if (!firstParagraph) return '';
    const inner = (firstParagraph as { content?: unknown }).content;
    if (!Array.isArray(inner)) return '';
    return inner
      .filter(
        (node): node is { type: 'text'; text: string } =>
          typeof node === 'object' &&
          node !== null &&
          (node as { type?: unknown }).type === 'text' &&
          typeof (node as { text?: unknown }).text === 'string',
      )
      .map((node) => node.text)
      .join('');
  } catch {
    return '';
  }
}
