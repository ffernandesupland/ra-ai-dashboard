import { DEFAULT_REVIEW_THRESHOLD_DAYS } from "./types";
import type { BarDatum, Decay, DecayBand, Repair, SnapshotDataset, WorklistItem } from "./types";

const STALENESS_BANDS: { label: string; min: number; max: number; tone: DecayBand["tone"] }[] = [
  { label: "Under 30 days", min: 0, max: 29, tone: "signal" },
  { label: "30–90 days", min: 30, max: 89, tone: "signal" },
  { label: "90–180 days", min: 90, max: 179, tone: "ochre" },
  { label: "180–365 days", min: 180, max: 365, tone: "ochre" },
  { label: "Over 1 year", min: 366, max: Number.POSITIVE_INFINITY, tone: "garnet" },
];

export const WORKLIST_SIZE = 9;

/**
 * Ranking for the repair worklist.
 * The log dampens extreme staleness so a 1,145-day article with 1 citation
 * cannot outrank a 500-day article with 6.
 */
export function damageScore(citations: number, days: number): number {
  return citations * Math.log(1 + days);
}

export function ageChip(days: number): WorklistItem["chip"] {
  return days > 700 ? "hot" : days > 365 ? "warm" : "ok";
}

export function computeDecay(data: SnapshotDataset, reviewThresholdDays: number = DEFAULT_REVIEW_THRESHOLD_DAYS): Decay {
  const rows = data.solutionUsage.filter((r) => r.daysSinceModified !== null);
  const totalCitations = data.solutionUsage.reduce((sum, r) => sum + r.citations, 0);

  const bands: DecayBand[] = STALENESS_BANDS.map((band) => {
    const inBand = rows.filter(
      (r) => r.daysSinceModified! >= band.min && r.daysSinceModified! <= band.max,
    );
    return {
      label: band.label,
      solutions: inBand.length,
      citations: inBand.reduce((sum, r) => sum + r.citations, 0),
      tone: band.tone,
    };
  });

  const ages = rows.map((r) => r.daysSinceModified!).sort((a, b) => a - b);
  const medianAgeDays = ages.length
    ? ages.length % 2
      ? ages[(ages.length - 1) / 2]
      : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2
    : null;

  const overYearCitations = rows
    .filter((r) => r.daysSinceModified! > 365)
    .reduce((sum, r) => sum + r.citations, 0);

  // Only solutions overdue for review belong on the worklist: an article still
  // within its review cadence is healthy, not a pending edit.
  const worklist: WorklistItem[] = rows
    .filter((r) => r.daysSinceModified! > reviewThresholdDays)
    .map((r) => ({
      solutionId: r.solutionId,
      title: r.title,
      citations: r.citations,
      days: r.daysSinceModified!,
      damage: damageScore(r.citations, r.daysSinceModified!),
      chip: ageChip(r.daysSinceModified!),
    }))
    .sort((a, b) => b.damage - a.damage)
    .slice(0, WORKLIST_SIZE);

  return {
    bands,
    medianAgeDays,
    pctCitationsOverYear: totalCitations ? (overYearCitations / totalCitations) * 100 : 0,
    worklist,
  };
}

const AI_FEATURES: { key: string; label: string }[] = [
  { key: "aiDuplicateSummary", label: "AI Duplicate Summary" },
  { key: "aiKnowledgeCreation", label: "AI Knowledge Creation" },
  { key: "title", label: "Title" },
  { key: "summary", label: "Summary" },
  { key: "aiSolutionReview", label: "AI Solution Review" },
  { key: "keyword", label: "Keyword" },
];

/**
 * Loop closure, KCS-adjusted. The denominator is not every cited solution — an accurate
 * article within its review cadence is healthy, not a pending edit. It is the solutions that
 * actually needed attention: those overdue for review (older than the threshold) plus those
 * refreshed inside the window. Any edit counts, whoever or whatever made it. AI-assisted share
 * sits underneath.
 */
export function computeRepair(
  data: SnapshotDataset,
  aiUsageRows: Record<string, unknown>[],
  reviewThresholdDays: number = DEFAULT_REVIEW_THRESHOLD_DAYS,
): Repair {
  const solutions = data.solutionUsage;
  const dated = solutions.filter((r) => r.daysSinceModified !== null);
  const totalCitations = solutions.reduce((sum, r) => sum + r.citations, 0);

  const refreshed = dated.filter((r) => r.daysSinceModified! <= data.windowDays);
  const refreshed30 = dated.filter((r) => r.daysSinceModified! <= 30);
  const untouchedOverYear = dated.filter((r) => r.daysSinceModified! > 365);

  // Review cadence split. onCadence is healthy and deliberately left out of the denominator.
  const overdue = dated.filter((r) => r.daysSinceModified! > reviewThresholdDays);
  const onCadence = dated.filter((r) => r.daysSinceModified! <= reviewThresholdDays);
  const dueForReview = refreshed.length + overdue.length;
  const refreshedCitations = refreshed.reduce((sum, r) => sum + r.citations, 0);
  const overdueCitations = overdue.reduce((sum, r) => sum + r.citations, 0);
  const dueCitations = refreshedCitations + overdueCitations;

  const aiIds = new Set(data.aiKaSolutions.map((r) => r.solutionId));
  const aiAssisted = refreshed.filter((r) => aiIds.has(r.solutionId));


  // 1,368 of 1,375 rows are all-zero in the reference tenant; leaving them in
  // makes adoption read as 0.5% and means nothing.
  const activeAiUsers = aiUsageRows.filter((row) =>
    AI_FEATURES.some(({ key }) => Number(row[key] ?? 0) > 0),
  );
  const featureTotals = AI_FEATURES.map(({ key, label }) => ({
    label,
    value: activeAiUsers.reduce((sum, row) => sum + Number(row[key] ?? 0), 0),
  }));
  const peak = Math.max(1, ...featureTotals.map((f) => f.value));

  const aiFeatureMix: BarDatum[] = featureTotals
    .sort((a, b) => b.value - a.value)
    // Zeros are informative, so they render in the hairline colour rather than being omitted.
    .map((f) => ({
      label: f.label,
      value: f.value,
      pct: f.value === 0 ? 100 : (f.value / peak) * 100,
      tone: f.value === 0 ? "hair" : "signal",
    }));

  return {
    windowDays: data.windowDays,
    refreshedInWindow: refreshed.length,
    refreshedIn30Days: refreshed30.length,
    untouchedOverYear: untouchedOverYear.length,
    denominator: solutions.length,
    loopClosure: solutions.length ? (refreshed.length / solutions.length) * 100 : 0,
    loopClosureWeighted: totalCitations
      ? (refreshed.reduce((sum, r) => sum + r.citations, 0) / totalCitations) * 100
      : 0,
    reviewThresholdDays,
    overdueForReview: overdue.length,
    onCadence: onCadence.length,
    dueForReview,
    reviewClosure: dueForReview ? (refreshed.length / dueForReview) * 100 : 0,
    reviewClosureWeighted: dueCitations ? (refreshedCitations / dueCitations) * 100 : 0,
    aiAssistedCount: aiAssisted.length,
    aiShareOfRepair: refreshed.length ? (aiAssisted.length / refreshed.length) * 100 : 0,
    aiFeatureMix,
    aiTouched: data.aiKaSolutions
      .slice()
      .sort((a, b) => b.aiActions - a.aiActions)
      .map((r) => ({
        solutionId: r.solutionId,
        title: r.title,
        status: r.status,
        aiActions: r.aiActions,
        chip: /published/i.test(r.status) ? ("ok" as const) : ("warm" as const),
      })),
    aiNotPublished: data.aiKaSolutions.filter((r) => !/published/i.test(r.status)).length,
  };
}
