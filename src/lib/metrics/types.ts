import type { ReportType } from "@/generated/prisma/enums";
import type { Narratives } from "@/lib/narrative/types";
import type {
  AiKaSolutionInput,
  DailySummaryInput,
  GapAnalysisInput,
  SolutionUsageInput,
  TtfaQueryInput,
} from "@/lib/reports/map";

/** Bump when any formula below changes; triggers a backfill of historic snapshots. */
export const METRICS_VERSION = 4;

/**
 * The full input to the metrics engine. Produced both by the ingest pipeline
 * (straight from parsed files) and by the DB loader, so metrics can be unit-tested
 * without a database.
 */
export interface SnapshotDataset {
  windowStart: Date;
  windowEnd: Date;
  windowDays: number;
  gapAnalysis: GapAnalysisInput[];
  solutionUsage: SolutionUsageInput[];
  aiKaSolutions: AiKaSolutionInput[];
  dailySummary: DailySummaryInput[];
  ttfaQueries: TtfaQueryInput[];
  aggregates: Partial<Record<ReportType, Record<string, unknown>[]>>;
}

export type Tone = "signal" | "ochre" | "garnet" | "ink" | "slate" | "hair";

export interface BarDatum {
  label: string;
  value: number;
  /** Bar length as a percentage of the track. */
  pct: number;
  meta?: string;
  tone?: Tone;
}

export interface Counts {
  questionsAsked: number;
  distinctQuestions: number;
  answerRate: number;
  answeredCount: number;
  unansweredCount: number;
  portalUsers: number;
  portalGroups: number;
  solutionsCited: number;
  totalCitations: number;
  referenceSolutionViews: number;
  collections: number;
}

export type MrrBand = "needs-improvement" | "moderate" | "good" | "excellent";

/**
 * The conventional MRR interpretation scale. Band widths differ, so anything drawing
 * this must size each segment by its range or the marker lands in the wrong band.
 */
export const MRR_SCALE: { band: MrrBand; label: string; from: number; to: number }[] = [
  { band: "needs-improvement", label: "Needs improvement", from: 0, to: 0.4 },
  { band: "moderate", label: "Moderate", from: 0.4, to: 0.6 },
  { band: "good", label: "Good", from: 0.6, to: 0.8 },
  { band: "excellent", label: "Excellent", from: 0.8, to: 1 },
];

export interface MrrScore {
  value: number;
  band: MrrBand;
  bandLabel: string;
}

export interface RankPosition {
  label: string;
  count: number;
  pctOfRanked: number;
  cumulativePct: number;
  tone: Tone;
}

/**
 * A per-query reciprocal rank is 1/position, so the source MRR column recovers the
 * absolute position the agent had to scroll to. That is the number people can act on.
 */
export interface Ranking {
  positions: RankPosition[];
  scored: number;
  ranked: number;
  noUsableHit: number;
  top1Pct: number;
  top3Pct: number;
  /** Averaged over questions that returned something. Misses are a coverage problem, not a ranking one. */
  mrr: MrrScore;
}

export interface SearchTypeEfficacy {
  type: string;
  questions: number;
  answerRate: number;
  meanMrr: number | null;
  band: MrrBand | null;
  top3Pct: number | null;
  noUsableHit: number;
}

export interface Grounding {
  unanswered: number;
  failuresWithContext: number;
  failuresWithoutContext: number;
  avgContextSize: number;
  avgCitedPerAnswer: number;
}

export interface Serving {
  p50: number;
  p90: number;
  max: number;
  sampleSize: number;
  citationSpread: BarDatum[];
}

export interface DecayBand {
  label: string;
  solutions: number;
  citations: number;
  tone: Tone;
}

export interface WorklistItem {
  solutionId: string;
  title: string;
  citations: number;
  days: number;
  damage: number;
  chip: "hot" | "warm" | "ok";
}

export interface Decay {
  bands: DecayBand[];
  medianAgeDays: number | null;
  pctCitationsOverYear: number;
  worklist: WorklistItem[];
}

export interface Repair {
  windowDays: number;
  refreshedInWindow: number;
  refreshedIn30Days: number;
  untouchedOverYear: number;
  denominator: number;
  loopClosure: number;
  loopClosureWeighted: number;
  aiAssistedCount: number;
  aiShareOfRepair: number;
  aiFeatureMix: BarDatum[];
  aiTouched: { solutionId: string; title: string; status: string; aiActions: number; chip: "ok" | "warm" }[];
  aiNotPublished: number;
}

export interface DemandTheme {
  theme: string;
  questions: number;
  answerRate: number;
  qaNoise: boolean;
}

export interface ConsistencyRow {
  query: string;
  asks: number;
  answered: number;
  answerRate: number;
}

export interface Demand {
  themes: DemandTheme[];
  consistency: ConsistencyRow[];
  themeCoverage: number;
}

export interface TrendPoint {
  date: string;
  answerRate: number;
  questions: number;
}

export type InputStatus = "live" | "partial" | "missing";

export interface RoiInput {
  field: string;
  status: InputStatus;
  source: string;
}

export interface RoiView {
  id: string;
  title: string;
  formula: string;
  state: "modelled" | "blocked";
  inputs: RoiInput[];
  note: string;
}

export interface RoiModel {
  observed: Record<string, number>;
  assumed: Record<string, number>;
  waterfall: BarDatum[];
  netMinutes: number;
  /** The rejected model: reading everything retrieved. Shown to justify the one used. */
  fullReadMinutes: number;
  views: RoiView[];
}

export interface LoopStage {
  stage: string;
  value: string;
  tone: Tone;
  broken: boolean;
}

export interface Kpi {
  value: string;
  unit?: string;
  label: string;
  tone: Tone;
}

/** The rendered dashboard payload. Persisted as MetricSnapshot.data. */
export interface DashboardData {
  metricsVersion: number;
  window: { start: string; end: string; days: number; label: string };
  counts: Counts;
  kpis: Kpi[];
  loop: LoopStage[];
  demand: Demand;
  retrieval: { ranking: Ranking; searchTypes: SearchTypeEfficacy[] };
  grounding: Grounding;
  serving: Serving;
  ttfaByPortalGroup: BarDatum[];
  decay: Decay;
  repair: Repair;
  trend: TrendPoint[];
  repairQueue: { candidate: string; signal: string; status: string; chip: "hot" | "warm" | "ok" }[];
  roi: RoiModel;
  coverage: { reportType: ReportType; present: boolean }[];
  narratives: Narratives;
}
