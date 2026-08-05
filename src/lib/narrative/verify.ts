import { allowedNumbers } from "./facts";

const DASHES = /[\u2014\u2013]/;
const MARKDOWN = /\*\*|^#{1,6}\s|^\s*[-*]\s|`/m;

/**
 * A dashboard that invents a figure is worse than one that says nothing, so
 * generated copy is checked against the fact sheet before it is allowed to ship.
 * Any passage that fails falls back to the deterministic text.
 */
export function rejectionReason(text: string, allowed: Set<number>): string | null {
  const trimmed = text.trim();

  if (!trimmed) return "empty";
  if (trimmed.length > 420) return "too long";
  if (trimmed.length < 25) return "too short";
  if (DASHES.test(trimmed)) return "contains an em or en dash";
  if (MARKDOWN.test(trimmed)) return "contains markdown";
  if (/\n/.test(trimmed)) return "contains a line break";

  for (const match of trimmed.matchAll(/\d+(?:\.\d+)?/g)) {
    const value = Number(match[0]);
    if (!allowed.has(value)) return `cites ${match[0]}, which is not in the data`;
  }

  return null;
}

export { allowedNumbers };
