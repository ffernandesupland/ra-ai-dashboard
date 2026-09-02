import { NARRATIVE_SLOTS, SLOT_BRIEFS, type NarrativeSlot } from "./types";

const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/**
 * Style rules are stated as prohibitions because that is what survives contact
 * with a model. The dash rule is repeated in the schema description too: it is
 * the one the model reaches for hardest and the one the house style forbids.
 */
const SYSTEM_PROMPT = `You write the interpretive copy for an executive dashboard about a support knowledge base that answers customer questions. An engineer has computed this week's figures; your job is to say what they mean.

Every passage must:
- Read as natural, plainly spoken English, in short declarative sentences.
- Run 1 to 3 sentences and 20 to 50 words. Be concise. The reader is an executive skimming a wall of charts.
- Say what the numbers mean, not what they are. The chart beside the passage already shows the values, so do not simply narrate it.
- Use ONLY figures that appear in the FACTS block. Never invent, estimate, extrapolate, or restate a number at a different precision. If you are not certain of a figure, write the sentence without any figure at all.
- Follow the evidence wherever it goes. If the figures are healthy, say so plainly. Never force a negative reading onto good numbers, and never soften bad ones.

Never use:
- Em dashes or en dashes. This is the most important rule of all. Where you would reach for one, use a full stop, a comma, a colon, or the words "and", "but", "so", "because". Write natural connected prose instead.
- Markdown of any kind: no asterisks, no bold, no bullet points, no headings, no backticks, no line breaks.
- Hedging such as "appears to", "may suggest", "it seems". Hype such as "dramatically", "game changing", "unlock". Filler such as "it is worth noting that", "in conclusion".
- The second person. Do not address the reader as "you".
- Rhetorical questions.

Spelling is British: "colour", "behaviour", "prioritise".

Here are passages from a previous edition, to fix the register. Match this voice and this length:
"Loop closure is measured only against the solutions that were due for review, not every cited article. Most of those due were refreshed this week, so the content under live load is also the content getting maintained."
"The same question, asked repeatedly, answered inconsistently. This is not a coverage gap, because the knowledge base holds a VPN guide. It is a content quality gap."
"116 of 116 unanswered questions had candidate solutions retrieved. Search worked. Generation refused to ground on what it got. That isolates the failure to content quality rather than retrieval tuning."`;

export interface GeneratedPassages {
  passages: Record<NarrativeSlot, string>;
  model: string;
}

export function isConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generatePassages(facts: unknown, signal?: AbortSignal): Promise<GeneratedPassages> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const baseUrl = process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;

  const briefs = NARRATIVE_SLOTS.map((slot) => `${slot}: ${SLOT_BRIEFS[slot]}`).join("\n\n");

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: signal ?? AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model,
      instructions: SYSTEM_PROMPT,
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
      input: [
        {
          role: "user",
          content: `FACTS for the reporting window. These are the only numbers that exist.\n\n${JSON.stringify(facts, null, 2)}\n\nWrite one passage for each of the following slots.\n\n${briefs}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "dashboard_narratives",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: Object.fromEntries(
              NARRATIVE_SLOTS.map((slot) => [
                slot,
                {
                  type: "string",
                  description: `${SLOT_BRIEFS[slot]} Plain prose. No em dashes, no en dashes, no markdown, no line breaks.`,
                },
              ]),
            ),
            required: [...NARRATIVE_SLOTS],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 400)}`);
  }

  const payload = (await response.json()) as OpenAiResponse;
  const text = extractText(payload);
  if (!text) throw new Error("OpenAI returned no output text");

  const parsed = JSON.parse(text) as Record<string, unknown>;
  const passages = {} as Record<NarrativeSlot, string>;
  for (const slot of NARRATIVE_SLOTS) {
    passages[slot] = typeof parsed[slot] === "string" ? (parsed[slot] as string).trim() : "";
  }

  return { passages, model: payload.model ?? model };
}

interface OpenAiResponse {
  model?: string;
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  output?: { type: string; content?: { type: string; text?: string }[] }[];
}

/** The Responses payload nests text under output[].content[]; reasoning items carry none. */
function extractText(payload: OpenAiResponse): string {
  if (typeof payload.output_text === "string" && payload.output_text) return payload.output_text;

  const chunks: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) chunks.push(part.text);
    }
  }

  if (!chunks.length && payload.status === "incomplete") {
    throw new Error(`OpenAI response incomplete: ${payload.incomplete_details?.reason ?? "unknown"}`);
  }
  return chunks.join("");
}
