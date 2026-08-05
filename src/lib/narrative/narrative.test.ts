import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareBatch, type UploadInput } from "@/lib/ingest/prepare";
import { buildDashboardData } from "@/lib/metrics";
import { generateNarratives } from "@/lib/narrative";
import { allowedNumbers, buildFacts } from "@/lib/narrative/facts";
import { NARRATIVE_SLOTS, type NarrativeSlot } from "@/lib/narrative/types";
import { rejectionReason } from "@/lib/narrative/verify";

const FIXTURE_DIR = path.resolve(__dirname, "../../../..");

function loadFixtures(): UploadInput[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => ({ name, content: readFileSync(path.join(FIXTURE_DIR, name), "utf8") }));
}

const batch = prepareBatch(loadFixtures());
const data = batch.dataset ? buildDashboardData(batch.dataset) : null;

describe("static narratives", () => {
  it("fills every slot without calling the model", () => {
    expect(data).not.toBeNull();
    for (const slot of NARRATIVE_SLOTS) {
      expect(data!.narratives[slot].length).toBeGreaterThan(24);
    }
    expect(data!.narratives.source).toBe("static");
  });

  it("uses no em or en dashes, matching the house style asked of the model", () => {
    for (const slot of NARRATIVE_SLOTS) {
      expect(data!.narratives[slot]).not.toMatch(/[\u2014\u2013]/);
    }
  });

  it("passes its own verifier", () => {
    const allowed = allowedNumbers(buildFacts(data!));
    for (const slot of NARRATIVE_SLOTS) {
      expect([slot, rejectionReason(data!.narratives[slot], allowed)]).toEqual([slot, null]);
    }
  });

  it("reports the loop as open while closure is under a quarter", () => {
    expect(data!.repair.loopClosure).toBeLessThan(25);
    expect(data!.narratives.loopVerdict).toContain("The loop is open");
    expect(data!.narratives.thesis).toContain("separate content sets");
  });
});

describe("narrative verifier", () => {
  const allowed = new Set([3, 77, 116, 42, 42.0]);
  const good = "The loop is open. Gen Answers cited 77 solutions this week and 3 of them were edited by anyone.";

  it("accepts prose whose figures all come from the data", () => {
    expect(rejectionReason(good, allowed)).toBeNull();
  });

  it("rejects a figure that does not appear in the data", () => {
    expect(rejectionReason("Gen Answers cited 91 solutions this week, which is a lot.", allowed)).toMatch(/91/);
  });

  it("rejects em dashes, because the house style forbids them", () => {
    expect(rejectionReason("The loop is open \u2014 only 3 of 77 were edited this week.", allowed)).toMatch(/dash/);
  });

  it("rejects markdown, which would render as literal asterisks", () => {
    expect(rejectionReason("**The loop is open.** Only 3 of 77 solutions were edited.", allowed)).toMatch(/markdown/);
  });

  it("rejects empty and runaway passages", () => {
    expect(rejectionReason("", allowed)).toBe("empty");
    expect(rejectionReason(`The loop is open. ${"Repair lags badly. ".repeat(40)}`, allowed)).toBe("too long");
  });
});

describe("model integration", () => {
  const passages = (overrides: Partial<Record<NarrativeSlot, string>> = {}) => {
    const base = Object.fromEntries(
      NARRATIVE_SLOTS.map((slot) => [slot, "Curation is not keeping pace with the questions arriving at the portal this week."]),
    ) as Record<NarrativeSlot, string>;
    return { ...base, ...overrides };
  };

  function stubOpenAi(body: Record<NarrativeSlot, string>) {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: "gpt-5.6-terra",
          output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(body) }] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks the documented model for a strict JSON object and forbids dashes", async () => {
    const fetchMock = stubOpenAi(passages());
    await generateNarratives(data!);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const sent = JSON.parse(String(init.body));
    expect(sent.model).toBe("gpt-5.6-terra");
    expect(sent.text.format.type).toBe("json_schema");
    expect(sent.text.format.strict).toBe(true);
    expect(sent.text.format.schema.required).toEqual([...NARRATIVE_SLOTS]);
    expect(sent.instructions).toMatch(/Em dashes or en dashes/);
    expect(String(init.body)).toContain("questionsAsked");
  });

  it("uses the generated copy when it verifies", async () => {
    stubOpenAi(passages({ thesis: "Curation and consumption have drifted onto different content this week." }));
    const result = await generateNarratives(data!);

    expect(result.source).toBe("model");
    expect(result.thesis).toBe("Curation and consumption have drifted onto different content this week.");
  });

  it("falls back per slot when the model invents a figure", async () => {
    stubOpenAi(passages({ decay: "Roughly 900 solutions are stale, which is most of the knowledge base by now." }));
    const result = await generateNarratives(data!);

    expect(result.decay).toBe(data!.narratives.decay);
    expect(result.rejected).toEqual([{ slot: "decay", reason: "cites 900, which is not in the data" }]);
    expect(result.thesis).not.toBe(data!.narratives.thesis);
  });

  it("keeps the deterministic copy when the call fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream exploded", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await generateNarratives(data!);
    expect(result.source).toBe("static");
    expect(result.loopVerdict).toBe(data!.narratives.loopVerdict);
  });
});
