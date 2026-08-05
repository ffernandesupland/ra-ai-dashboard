import { ReportType } from "@/generated/prisma/enums";
import { REPORTS } from "@/lib/reports/definitions";
import { computeDemand, computeRepairQueue, computeTrend } from "./demand";
import { computeDecay, computeRepair } from "./health";
import {
  computeCounts,
  computeGrounding,
  computeRanking,
  computeSearchTypes,
  computeServing,
  computeTtfaByPortalGroup,
} from "./quality";
import { staticNarratives } from "@/lib/narrative/static";
import { DEFAULT_ASSUMPTIONS, computeRoi, type AssumedConstants } from "./roi";
import { DEFAULT_THEMES, type ThemeDefinition } from "./themes";
import { METRICS_VERSION, type DashboardData, type Kpi, type LoopStage, type SnapshotDataset } from "./types";

export * from "./types";
export { DEFAULT_ASSUMPTIONS } from "./roi";
export { DEFAULT_THEMES } from "./themes";

export interface BuildOptions {
  assumptions?: AssumedConstants;
  themes?: ThemeDefinition[];
}

export function buildDashboardData(
  data: SnapshotDataset,
  options: BuildOptions = {},
): DashboardData {
  const themes = options.themes ?? DEFAULT_THEMES;
  const assumptions = options.assumptions ?? DEFAULT_ASSUMPTIONS;

  const counts = computeCounts(data);
  const grounding = computeGrounding(data);
  const serving = computeServing(data);
  const decay = computeDecay(data);
  const repair = computeRepair(data, data.aggregates[ReportType.AI_USAGE_BY_USER] ?? []);
  const demand = computeDemand(data, themes);

  const base = {
    metricsVersion: METRICS_VERSION,
    window: {
      start: iso(data.windowStart),
      end: iso(data.windowEnd),
      days: data.windowDays,
      label: `${formatDay(data.windowStart)} – ${formatDay(data.windowEnd)}`,
    },
    counts,
    kpis: buildKpis(counts, serving.p50, repair.loopClosure),
    loop: buildLoop(data, counts, grounding, decay),
    demand,
    retrieval: { ranking: computeRanking(data), searchTypes: computeSearchTypes(data) },
    grounding,
    serving,
    ttfaByPortalGroup: computeTtfaByPortalGroup(data),
    decay,
    repair,
    trend: computeTrend(data),
    repairQueue: computeRepairQueue(data, themes),
    roi: computeRoi(data, assumptions),
    coverage: REPORTS.map((r) => ({
      reportType: r.type,
      present: isPresent(data, r.type),
    })),
  };

  // Deterministic copy always ships with the payload. generateNarratives() may
  // later overwrite it, but this keeps buildDashboardData pure and offline.
  return { ...base, narratives: staticNarratives(base) };
}

function isPresent(data: SnapshotDataset, type: ReportType): boolean {
  switch (type) {
    case ReportType.GEN_SEARCH_GAP_ANALYSIS:
      return data.gapAnalysis.length > 0;
    case ReportType.GEN_USAGE_BY_SOLUTION:
      return data.solutionUsage.length > 0;
    case ReportType.AIKA_USAGE_BY_SOLUTION:
      return data.aiKaSolutions.length > 0;
    case ReportType.GEN_SUMMARY_BY_DAY:
      return data.dailySummary.length > 0;
    case ReportType.GEN_TTFA_BY_QUERY:
      return data.ttfaQueries.length > 0;
    default:
      return (data.aggregates[type]?.length ?? 0) > 0;
  }
}

function buildKpis(
  counts: ReturnType<typeof computeCounts>,
  p50: number,
  loopClosure: number,
): Kpi[] {
  return [
    { value: String(counts.questionsAsked), label: "Questions asked at the portal", tone: "ink" },
    { value: formatPct(counts.answerRate), label: "Answered by Gen Answers", tone: "ink" },
    { value: p50.toFixed(1), unit: "s", label: "Median time to first answer", tone: "signal" },
    { value: String(counts.solutionsCited), label: "Solutions cited in answers", tone: "ink" },
    {
      value: formatPct(loopClosure),
      label: "Loop closure — cited solutions refreshed",
      tone: "garnet",
    },
  ];
}

/**
 * Six stages, clockwise from the top. Repair renders visibly broken —
 * that gap is the entire argument of the artifact.
 */
function buildLoop(
  data: SnapshotDataset,
  counts: ReturnType<typeof computeCounts>,
  grounding: ReturnType<typeof computeGrounding>,
  decay: ReturnType<typeof computeDecay>,
): LoopStage[] {
  const overYear = decay.bands.find((b) => b.label === "Over 1 year")?.solutions ?? 0;
  const refreshed = data.solutionUsage.filter(
    (r) => r.daysSinceModified !== null && r.daysSinceModified <= data.windowDays,
  ).length;
  const withContext = data.gapAnalysis.filter((r) => r.contextSet.length > 0).length;
  return [
    { stage: "Ask", value: `${counts.questionsAsked} questions`, tone: "signal", broken: false },
    { stage: "Retrieve", value: `${withContext} contexts`, tone: "signal", broken: false },
    { stage: "Ground", value: `${counts.answeredCount} answers`, tone: "ochre", broken: false },
    { stage: "Serve", value: `${counts.solutionsCited} solutions`, tone: "ochre", broken: false },
    { stage: "Decay", value: `${overYear} over 1 yr`, tone: "garnet", broken: false },
    { stage: "Repair", value: `${refreshed} refreshed`, tone: "garnet", broken: true },
  ];
}

/** Below 10 keeps one decimal; above it a decimal implies precision the sample lacks. */
export function formatPct(value: number): string {
  return value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
