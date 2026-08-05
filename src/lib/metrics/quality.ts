import { ReportType } from "@/generated/prisma/enums";
import type {
  Counts,
  Grounding,
  MrrScore,
  Ranking,
  RankPosition,
  SearchTypeEfficacy,
  Serving,
  SnapshotDataset,
  BarDatum,
  Tone,
} from "./types";
import { MRR_SCALE } from "./types";

export function computeCounts(data: SnapshotDataset): Counts {
  const gap = data.gapAnalysis;
  const answeredCount = gap.filter((r) => r.answered).length;
  return {
    questionsAsked: gap.length,
    distinctQuestions: new Set(gap.map((r) => r.queryNorm)).size,
    answerRate: gap.length ? (answeredCount / gap.length) * 100 : 0,
    answeredCount,
    unansweredCount: gap.length - answeredCount,
    portalUsers: new Set(gap.map((r) => r.username)).size,
    portalGroups: new Set(gap.map((r) => r.portalGroup).filter(Boolean)).size,
    solutionsCited: data.solutionUsage.length,
    totalCitations: data.solutionUsage.reduce((sum, r) => sum + r.citations, 0),
    referenceSolutionViews: data.dailySummary.reduce((sum, r) => sum + (r.referenceSolutionView ?? 0), 0),
    collections: data.aggregates[ReportType.GEN_USAGE_BY_COLLECTION]?.length ?? 0,
  };
}

function scoreMrr(values: number[]): MrrScore {
  const value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const hit = MRR_SCALE.find((b) => value < b.to) ?? MRR_SCALE[MRR_SCALE.length - 1];
  return { value, band: hit.band, bandLabel: hit.label };
}

/** Reciprocal rank is 1/position, so the stored figure inverts back to the position. */
function positionOf(mrr: number): number {
  return Math.round(1 / mrr);
}

/**
 * Absolute rank positions. "The answer was third" is actionable in a way that
 * "the reciprocal rank fell between 0.25 and 0.5" never is.
 */
export function computeRanking(data: SnapshotDataset): Ranking {
  const values = data.gapAnalysis.map((r) => r.mrr).filter((v): v is number => v !== null);
  const hits = values.filter((v) => v > 0);
  const positions = hits.map(positionOf);
  const at = (n: number) => positions.filter((p) => p === n).length;

  const buckets: { label: string; count: number; tone: Tone }[] = [
    { label: "Rank 1", count: at(1), tone: "signal" },
    { label: "Rank 2", count: at(2), tone: "signal" },
    { label: "Rank 3", count: at(3), tone: "ochre" },
    { label: "Rank 4 and beyond", count: positions.filter((p) => p > 3).length, tone: "garnet" },
  ];

  let running = 0;
  const rows: RankPosition[] = buckets.map((b) => {
    running += b.count;
    return {
      ...b,
      pctOfRanked: hits.length ? (b.count / hits.length) * 100 : 0,
      cumulativePct: hits.length ? (running / hits.length) * 100 : 0,
    };
  });

  return {
    positions: rows,
    scored: values.length,
    ranked: hits.length,
    noUsableHit: values.length - hits.length,
    top1Pct: rows[0].pctOfRanked,
    top3Pct: rows[2].cumulativePct,
    mrr: scoreMrr(hits),
  };
}

export function computeSearchTypes(data: SnapshotDataset): SearchTypeEfficacy[] {
  const groups = new Map<string, { questions: number; answered: number; mrr: number[] }>();
  for (const row of data.gapAnalysis) {
    const key = row.searchType.toLowerCase();
    const group = groups.get(key) ?? { questions: 0, answered: 0, mrr: [] };
    group.questions += 1;
    if (row.answered) group.answered += 1;
    if (row.mrr !== null) group.mrr.push(row.mrr);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([type, g]) => {
      const hits = g.mrr.filter((v) => v > 0);
      return {
        type,
        questions: g.questions,
        answerRate: (g.answered / g.questions) * 100,
        meanMrr: g.mrr.length ? scoreMrr(g.mrr).value : null,
        band: g.mrr.length ? scoreMrr(g.mrr).band : null,
        top3Pct: hits.length
          ? (hits.filter((v) => positionOf(v) <= 3).length / hits.length) * 100
          : null,
        noUsableHit: g.mrr.length - hits.length,
      };
    })
    .sort((a, b) => b.questions - a.questions);
}

/**
 * Grounding failure: generation refused to answer even though retrieval returned
 * candidates. Reported as a ratio — "100%" reads as a rendering bug.
 */
export function computeGrounding(data: SnapshotDataset): Grounding {
  const gap = data.gapAnalysis;
  const unansweredRows = gap.filter((r) => !r.answered);
  const withContext = unansweredRows.filter((r) => r.contextSet.length > 0).length;
  const answeredRows = gap.filter((r) => r.answered);
  const contextTotal = gap.reduce((sum, r) => sum + r.contextSet.length, 0);
  const citedTotal = answeredRows.reduce((sum, r) => sum + r.referenceSolutions.length, 0);
  return {
    unanswered: unansweredRows.length,
    failuresWithContext: withContext,
    failuresWithoutContext: unansweredRows.length - withContext,
    avgContextSize: gap.length ? contextTotal / gap.length : 0,
    avgCitedPerAnswer: answeredRows.length ? citedTotal / answeredRows.length : 0,
  };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const CITATION_BANDS: { label: string; min: number; max: number }[] = [
  { label: "Cited once", min: 1, max: 1 },
  { label: "2–3 times", min: 2, max: 3 },
  { label: "4–6 times", min: 4, max: 6 },
  { label: "7+ times", min: 7, max: Number.POSITIVE_INFINITY },
];

export function computeServing(data: SnapshotDataset): Serving {
  const ttfa = data.ttfaQueries.map((r) => r.ttfaSec).sort((a, b) => a - b);
  const counts = data.solutionUsage.map((r) => r.citations);
  const bands = CITATION_BANDS.map((band) => ({
    label: band.label,
    value: counts.filter((c) => c >= band.min && c <= band.max).length,
  }));
  const peak = Math.max(1, ...bands.map((b) => b.value));
  const citationSpread: BarDatum[] = bands.map((b) => ({
    label: b.label,
    value: b.value,
    pct: (b.value / peak) * 100,
    tone: "ink",
  }));
  return {
    p50: percentile(ttfa, 50),
    p90: percentile(ttfa, 90),
    max: ttfa.length ? ttfa[ttfa.length - 1] : 0,
    sampleSize: ttfa.length,
    citationSpread,
  };
}

/** ≤3s reads as fast, ≤5s acceptable, above that the wait is visible to the user. */
export function ttfaTone(seconds: number): "signal" | "ochre" | "garnet" {
  return seconds <= 3 ? "signal" : seconds <= 5 ? "ochre" : "garnet";
}

export function computeTtfaByPortalGroup(data: SnapshotDataset): BarDatum[] {
  const rows = data.aggregates[ReportType.GEN_TTFA_BY_PORTAL_GROUP] ?? [];
  const parsed = rows
    .map((row) => ({
      label: String(row.portalGroup ?? ""),
      value: Number(row.avgTtfaSec ?? 0),
      answered: Number(row.answeredQuestions ?? 0),
    }))
    .filter((r) => r.label);
  const peak = Math.max(1, ...parsed.map((r) => r.value));
  return parsed
    .sort((a, b) => a.value - b.value)
    .map((r) => ({
      label: r.label,
      value: r.value,
      pct: (r.value / peak) * 100,
      meta: `${r.answered} answered`,
      tone: ttfaTone(r.value),
    }));
}
