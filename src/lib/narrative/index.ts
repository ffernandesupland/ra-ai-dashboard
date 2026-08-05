import { allowedNumbers, buildFacts, type MetricsForNarrative } from "./facts";
import { generatePassages, isConfigured } from "./openai";
import { staticNarratives } from "./static";
import { NARRATIVE_SLOTS, type NarrativeSlot, type Narratives } from "./types";
import { rejectionReason } from "./verify";

export * from "./types";
export { staticNarratives } from "./static";
export { isConfigured as isNarrativeConfigured } from "./openai";

/**
 * Model copy where it earns its place, deterministic copy everywhere else.
 * Verification is per passage rather than all or nothing: one bad figure in the
 * decay line should not cost us five good passages.
 */
export async function generateNarratives(data: MetricsForNarrative): Promise<Narratives> {
  const fallback = staticNarratives(data);
  if (!isConfigured()) return fallback;

  const facts = buildFacts(data);
  const allowed = allowedNumbers(facts);

  let result: Awaited<ReturnType<typeof generatePassages>>;
  try {
    result = await generatePassages(facts);
  } catch (error) {
    console.error("[narrative] generation failed, keeping deterministic copy:", error);
    return { ...fallback, error: describeFailure(error) };
  }

  const narratives: Narratives = { ...fallback, source: "model", model: result.model, generatedAt: new Date().toISOString() };
  const rejected: { slot: NarrativeSlot; reason: string }[] = [];

  for (const slot of NARRATIVE_SLOTS) {
    const candidate = result.passages[slot];
    const reason = rejectionReason(candidate ?? "", allowed);
    if (reason) {
      rejected.push({ slot, reason });
      console.warn(`[narrative] rejected ${slot}: ${reason}`);
      continue;
    }
    narratives[slot] = candidate.trim();
  }

  if (rejected.length) narratives.rejected = rejected;
  if (rejected.length === NARRATIVE_SLOTS.length) {
    return { ...fallback, error: "Every passage failed verification, usually because the model cited a figure that is not in the data." };
  }

  return narratives;
}

/**
 * Node's fetch buries the useful part in `cause`. Certificate errors in particular
 * mean a proxy is intercepting TLS, which is a local environment fix, not an app bug.
 */
function describeFailure(error: unknown): string {
  const code = (error as { cause?: { code?: string } })?.cause?.code;
  if (code && /CERT|ISSUER|SELF_SIGNED/i.test(code)) {
    return `The OpenAI request failed TLS verification (${code}). A proxy is intercepting HTTPS, so Node needs to trust the system certificate store. Start the server with NODE_OPTIONS=--use-system-ca.`;
  }
  if (code) return `The OpenAI request failed (${code}).`;
  return error instanceof Error ? error.message : String(error);
}
