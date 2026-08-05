import { DEFAULT_THEMES, matchTheme, type ThemeDefinition } from "./themes";
import type { ConsistencyRow, Demand, DemandTheme, SnapshotDataset, TrendPoint } from "./types";

const CONSISTENCY_MIN_ASKS = 5;
const CONSISTENCY_SIZE = 5;

export function computeDemand(
  data: SnapshotDataset,
  themes: ThemeDefinition[] = DEFAULT_THEMES,
): Demand {
  const buckets = new Map<string, { questions: number; answered: number; qaNoise: boolean }>();
  let matched = 0;

  for (const row of data.gapAnalysis) {
    const theme = matchTheme(row.queryNorm, themes);
    if (!theme) continue;
    matched += 1;
    const bucket = buckets.get(theme.theme) ?? {
      questions: 0,
      answered: 0,
      qaNoise: theme.qaNoise ?? false,
    };
    bucket.questions += 1;
    if (row.answered) bucket.answered += 1;
    buckets.set(theme.theme, bucket);
  }

  const themeRows: DemandTheme[] = [...buckets.entries()]
    .map(([theme, b]) => ({
      theme,
      questions: b.questions,
      answerRate: (b.answered / b.questions) * 100,
      qaNoise: b.qaNoise,
    }))
    .sort((a, b) => b.questions - a.questions);

  return {
    themes: themeRows,
    consistency: computeConsistency(data),
    themeCoverage: data.gapAnalysis.length ? (matched / data.gapAnalysis.length) * 100 : 0,
  };
}

/**
 * Answer consistency: the same question asked repeatedly and answered inconsistently.
 * A high-volume query at 47% is not a coverage gap when the KB contains the guide —
 * it is a content quality gap.
 */
export function computeConsistency(data: SnapshotDataset): ConsistencyRow[] {
  const groups = new Map<string, { display: string; asks: number; answered: number }>();
  for (const row of data.gapAnalysis) {
    if (!row.queryNorm) continue;
    const group = groups.get(row.queryNorm) ?? { display: row.query.trim(), asks: 0, answered: 0 };
    group.asks += 1;
    if (row.answered) group.answered += 1;
    groups.set(row.queryNorm, group);
  }
  return [...groups.values()]
    .filter((g) => g.asks >= CONSISTENCY_MIN_ASKS)
    .sort((a, b) => b.asks - a.asks)
    .slice(0, CONSISTENCY_SIZE)
    .map((g) => ({
      query: g.display,
      asks: g.asks,
      answered: g.answered,
      answerRate: (g.answered / g.asks) * 100,
    }));
}

export function computeTrend(data: SnapshotDataset): TrendPoint[] {
  // Only dates present in the export are plotted. Gaps are gaps, not zeroes.
  return data.dailySummary
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      answerRate: row.pctAnswered ?? (row.questions ? (row.answered / row.questions) * 100 : 0),
      questions: row.questions,
    }));
}

export type QueueChip = "hot" | "warm" | "ok";

export interface RepairQueueItem {
  candidate: string;
  signal: string;
  status: string;
  chip: QueueChip;
}

const STALE_DAYS = 180;
const QUEUE_SIZE = 5;

/**
 * Joins failed demand to the content that should have answered it.
 *   no coverage    — no cited solution matches the theme at all
 *   stale          — a solution exists but is aged
 *   weak grounding — a reasonably fresh solution exists and generation still failed
 */
export function computeRepairQueue(
  data: SnapshotDataset,
  themes: ThemeDefinition[] = DEFAULT_THEMES,
): RepairQueueItem[] {
  const failures = new Map<string, { failed: number; total: number }>();
  for (const row of data.gapAnalysis) {
    const theme = matchTheme(row.queryNorm, themes);
    if (!theme || theme.qaNoise) continue;
    const entry = failures.get(theme.theme) ?? { failed: 0, total: 0 };
    entry.total += 1;
    if (!row.answered) entry.failed += 1;
    failures.set(theme.theme, entry);
  }

  const items: RepairQueueItem[] = [];
  for (const [themeName, counts] of failures) {
    if (counts.failed === 0) continue;
    const definition = themes.find((t) => t.theme === themeName);
    const hints = definition?.solutionHints ?? [];
    const candidates = data.solutionUsage
      .filter((s) => hints.some((hint) => s.title.toLowerCase().includes(hint)))
      .sort((a, b) => b.citations - a.citations);
    const best = candidates[0];

    if (!best) {
      items.push({
        candidate: themeName,
        signal: `${counts.total} asks, ${counts.total - counts.failed} answers`,
        status: "no coverage",
        chip: "hot",
      });
      continue;
    }

    const days = best.daysSinceModified ?? 0;
    const stale = days >= STALE_DAYS;
    items.push({
      candidate: best.title,
      signal: `${counts.failed} failed asks`,
      status: stale ? `${days}d stale` : "weak grounding",
      chip: stale ? (days > 700 ? "hot" : "warm") : "warm",
    });
  }

  return items.sort((a, b) => queueWeight(b) - queueWeight(a)).slice(0, QUEUE_SIZE);
}

function queueWeight(item: RepairQueueItem): number {
  return Number.parseInt(item.signal, 10) || 0;
}
