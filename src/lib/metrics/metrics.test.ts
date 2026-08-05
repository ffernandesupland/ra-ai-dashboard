import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/lib/metrics";
import { prepareBatch, type UploadInput } from "@/lib/ingest/prepare";

/**
 * Regression suite from Part 7 of the build spec, run against the reference
 * QA-tenant exports at the repository root.
 */
const FIXTURE_DIR = path.resolve(__dirname, "../../../..");

function loadFixtures(): UploadInput[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => ({
      name,
      content: readFileSync(path.join(FIXTURE_DIR, name), "utf8"),
    }));
}

const batch = prepareBatch(loadFixtures());
const data = batch.dataset ? buildDashboardData(batch.dataset) : null;

describe("ingest", () => {
  it("parses every export without a fatal error", () => {
    expect(batch.errors).toEqual([]);
  });

  it("recognises all 15 reports", () => {
    expect(batch.files).toHaveLength(15);
    expect(batch.missing).toEqual([]);
  });

  it("reads the window from line 2 rather than assuming 7 days", () => {
    expect(batch.windowStart?.toISOString().slice(0, 10)).toBe("2026-07-21");
    expect(batch.windowEnd?.toISOString().slice(0, 10)).toBe("2026-07-28");
    expect(batch.windowDays).toBe(7);
  });

  it("keeps 15-digit solution IDs as exact strings", () => {
    const ids = batch.dataset!.solutionUsage.map((r) => r.solutionId);
    expect(ids).toContain("022410913403630");
    expect(ids.every((id) => typeof id === "string")).toBe(true);
  });
});

describe("core counts", () => {
  it("matches the reference dataset", () => {
    expect(data!.counts.questionsAsked).toBe(200);
    // The spec quotes 56, which is lowercase+trim WITHOUT stripping the trailing "?".
    // Its own stated rule strips it, and its consistency table ("How to connect to VPN — 30 asks")
    // only holds when it is stripped. Following the rule gives 53.
    expect(data!.counts.distinctQuestions).toBe(53);
    expect(data!.counts.answerRate).toBeCloseTo(42.0, 1);
    expect(data!.counts.portalUsers).toBe(9);
    expect(data!.counts.portalGroups).toBe(7);
    expect(data!.counts.solutionsCited).toBe(77);
    expect(data!.counts.totalCitations).toBe(172);
    expect(data!.counts.collections).toBe(23);
  });
});

describe("retrieval", () => {
  it("recovers absolute rank positions from the reciprocal rank", () => {
    const { ranking } = data!.retrieval;
    const counts = Object.fromEntries(ranking.positions.map((p) => [p.label, p.count]));
    expect(counts["Rank 1"]).toBe(55);
    expect(counts["Rank 2"]).toBe(10);
    expect(counts["Rank 3"]).toBe(4);
    expect(counts["Rank 4 and beyond"]).toBe(16);
    expect(ranking.ranked).toBe(85);
    expect(ranking.noUsableHit).toBe(115);
    expect(ranking.scored).toBe(200);
  });

  it("reports cumulative reach over ranked questions only", () => {
    const { ranking } = data!.retrieval;
    expect(ranking.top1Pct).toBeCloseTo(64.7, 1);
    expect(ranking.top3Pct).toBeCloseTo(81.2, 1);
    expect(ranking.positions.at(-1)!.cumulativePct).toBeCloseTo(100, 5);
  });

  it("scores MRR over ranked questions only", () => {
    const { ranking } = data!.retrieval;
    expect(ranking.mrr.value).toBeCloseTo(0.753, 2);
    expect(ranking.mrr.band).toBe("good");
  });

  it("shows neural outperforming keyword", () => {
    const byType = Object.fromEntries(data!.retrieval.searchTypes.map((s) => [s.type, s]));
    expect(byType.keyword.questions).toBe(174);
    expect(byType.neural.questions).toBe(21);
    expect(byType.hybrid.questions).toBe(5);
    expect(byType.neural.answerRate).toBeCloseTo(52.4, 1);
    expect(byType.keyword.answerRate).toBeCloseTo(41.4, 1);
    expect(byType.neural.meanMrr!).toBeGreaterThan(byType.keyword.meanMrr!);
  });
});

describe("grounding", () => {
  it("shows every unanswered question had a context set", () => {
    expect(data!.grounding.unanswered).toBe(116);
    expect(data!.grounding.failuresWithContext).toBe(116);
    expect(data!.grounding.failuresWithoutContext).toBe(0);
  });

  it("derives the ROI observed constants", () => {
    expect(data!.grounding.avgContextSize).toBeCloseTo(6.92, 2);
    expect(data!.grounding.avgCitedPerAnswer).toBeCloseTo(2.02, 2);
  });
});

describe("serving", () => {
  it("matches time-to-first-answer percentiles", () => {
    expect(data!.serving.sampleSize).toBe(85);
    expect(data!.serving.p50).toBe(4);
    expect(data!.serving.p90).toBe(6);
    expect(data!.serving.max).toBe(9);
  });
});

describe("decay", () => {
  it("weights staleness by citations", () => {
    const bands = Object.fromEntries(data!.decay.bands.map((b) => [b.label, b]));
    expect(bands["Over 1 year"].solutions).toBe(46);
    const totalSolutions = data!.decay.bands.reduce((sum, b) => sum + b.solutions, 0);
    const totalCitations = data!.decay.bands.reduce((sum, b) => sum + b.citations, 0);
    expect(totalSolutions).toBe(77);
    expect(totalCitations).toBe(172);
  });

  it("reports the headline decay figures", () => {
    expect(data!.decay.pctCitationsOverYear).toBeCloseTo(53, 0);
    expect(data!.decay.medianAgeDays).toBe(494);
  });

  it("ranks the worklist by citations × log staleness", () => {
    expect(data!.decay.worklist).toHaveLength(9);
    const top = data!.decay.worklist[0];
    expect(top.citations).toBeGreaterThan(1);
    const scores = data!.decay.worklist.map((w) => w.damage);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("repair and loop closure", () => {
  it("counts any edit within the parsed window", () => {
    expect(data!.repair.refreshedInWindow).toBe(3);
    expect(data!.repair.denominator).toBe(77);
    expect(data!.repair.loopClosure).toBeCloseTo(3.9, 1);
    expect(data!.repair.loopClosureWeighted).toBeCloseTo(2.3, 1);
  });

  it("keeps AI share as a segment of repair, not the headline", () => {
    expect(data!.repair.aiShareOfRepair).toBe(0);
    expect(data!.repair.refreshedIn30Days).toBe(7);
    expect(data!.repair.untouchedOverYear).toBe(46);
  });

  it("surfaces AI work that never left draft", () => {
    expect(data!.repair.aiTouched).toHaveLength(5);
    expect(data!.repair.aiNotPublished).toBe(3);
  });

  it("filters all-zero rows before the AI feature mix", () => {
    const mix = Object.fromEntries(data!.repair.aiFeatureMix.map((f) => [f.label, f.value]));
    expect(mix["AI Duplicate Summary"]).toBe(13);
    expect(mix["AI Knowledge Creation"]).toBe(11);
    expect(mix["Title"]).toBe(3);
    expect(mix["Summary"]).toBe(2);
    expect(mix["AI Solution Review"]).toBe(0);
    expect(mix["Keyword"]).toBe(0);
  });
});

describe("trend", () => {
  it("plots only the dates present, leaving the 25 July gap alone", () => {
    const dates = data!.trend.map((p) => p.date);
    expect(dates).toEqual([
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
    expect(data!.trend[0].answerRate).toBeCloseTo(32.81, 1);
    expect(data!.trend.at(-1)!.answerRate).toBeCloseTo(58.82, 1);
  });
});

describe("demand", () => {
  it("clusters the flagship consistency cases", () => {
    const byQuery = Object.fromEntries(
      data!.demand.consistency.map((c) => [c.query.toLowerCase(), c]),
    );
    expect(byQuery["how to connect to vpn"].asks).toBe(30);
    expect(byQuery["how to connect to vpn"].answerRate).toBeCloseTo(46.7, 1);
  });

  it("flags QA noise rather than hiding it", () => {
    const noise = data!.demand.themes.find((t) => t.qaNoise);
    expect(noise).toBeDefined();
  });
});
