import type { BarDatum, Counts, Repair, RoiModel, RoiResult, RoiView, SnapshotDataset } from "./types";
import { computeGrounding, computeServing } from "./quality";

/**
 * Constants the customer's own data cannot yet supply. Editable per tenant so the
 * whole model can be swept for sensitivity in front of an audience.
 * Kept separate from observed values on purpose — nothing here may be presented as measured.
 */
export interface AssumedConstants {
  wordsArticle: number;
  wordsAnswer: number;
  wpm: number;
  scanSec: number;
  pVerify: number;
  pThumbsUp: number;
  wastedSec: number;
}

export const DEFAULT_ASSUMPTIONS: AssumedConstants = {
  wordsArticle: 450,
  wordsAnswer: 120,
  wpm: 220,
  scanSec: 8,
  pVerify: 0.3,
  pThumbsUp: 0.75,
  wastedSec: 60,
};

/**
 * Scenario constants the exports cannot yet supply, used to turn observed counts
 * into modelled outcomes for views 2-5. Every one is surfaced beside its result
 * with an "assumed" chip — none is presented as measured.
 */
const SCENARIO = {
  caseFollowRate: 0.34,
  costPerCase: 22,
  authorDaysWithoutAi: 8.6,
  authorDaysWithAi: 3.9,
  authorDayCost: 360,
  dupResolvedRate: 0.55,
  annualMaintenancePerArticle: 145,
  repairBeforeRate: 71,
  repairAfterRate: 86,
  weeksPerYear: 52,
};

function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

function resultBars(items: { label: string; value: number; tone: BarDatum["tone"]; meta: string }[]): BarDatum[] {
  const peak = Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => ({ label: i.label, value: i.value, pct: (i.value / peak) * 100, tone: i.tone, meta: i.meta }));
}

function computeScenarioResults(counts: Counts, repair: Repair, assumed: AssumedConstants): Record<string, RoiResult> {
  const dupChecks = repair.aiFeatureMix.find((f) => f.label === "AI Duplicate Summary")?.value ?? 0;

  const helpful = counts.answeredCount * assumed.pThumbsUp;
  const deflected = helpful * (1 - SCENARIO.caseFollowRate);
  const weeklyDeflection = deflected * SCENARIO.costPerCase;
  const annualDeflection = weeklyDeflection * SCENARIO.weeksPerYear;

  const perArticleDays = SCENARIO.authorDaysWithoutAi - SCENARIO.authorDaysWithAi;
  const aiAuthored = repair.aiTouched.length;
  const daysSaved = perArticleDays * aiAuthored;
  const authoringValue = daysSaved * SCENARIO.authorDayCost;

  const prevented = Math.round(dupChecks * SCENARIO.dupResolvedRate);
  const dupValue = prevented * SCENARIO.annualMaintenancePerArticle;

  const repaired = repair.refreshedInWindow;
  const lift = SCENARIO.repairAfterRate - SCENARIO.repairBeforeRate;

  return {
    deflection: {
      headline: `${money(annualDeflection)} / yr`,
      subhead: `${Math.round(deflected)} tickets deflected this week, ${money(weeklyDeflection)} at ${money(SCENARIO.costPerCase)} per contact`,
      bars: resultBars([
        { label: "Answered and marked helpful", value: helpful, tone: "signal", meta: `${Math.round(helpful)}` },
        { label: "No case within 30 minutes", value: deflected, tone: "ink", meta: `${Math.round(deflected)}` },
      ]),
      basis: [
        { label: "Answered questions", value: `${counts.answeredCount}`, kind: "observed" },
        { label: "Helpful share P(thumbs up)", value: assumed.pThumbsUp.toFixed(2), kind: "assumed" },
        { label: "Case follow rate", value: SCENARIO.caseFollowRate.toFixed(2), kind: "assumed" },
        { label: "Cost per case", value: money(SCENARIO.costPerCase), kind: "assumed" },
      ],
    },
    authoring: {
      headline: `${daysSaved.toFixed(0)} author-days / wk`,
      subhead: `${money(authoringValue)} at ${money(SCENARIO.authorDayCost)} per author-day, across ${aiAuthored} AI-authored solutions`,
      bars: resultBars([
        { label: "Cycle without AI", value: SCENARIO.authorDaysWithoutAi, tone: "garnet", meta: `${SCENARIO.authorDaysWithoutAi.toFixed(1)}d` },
        { label: "Cycle with AI", value: SCENARIO.authorDaysWithAi, tone: "signal", meta: `${SCENARIO.authorDaysWithAi.toFixed(1)}d` },
      ]),
      basis: [
        { label: "AI-authored solutions", value: `${aiAuthored}`, kind: "observed" },
        { label: "Median cycle without AI", value: `${SCENARIO.authorDaysWithoutAi.toFixed(1)} days`, kind: "assumed" },
        { label: "Median cycle with AI", value: `${SCENARIO.authorDaysWithAi.toFixed(1)} days`, kind: "assumed" },
        { label: "Fully loaded author day", value: money(SCENARIO.authorDayCost), kind: "assumed" },
      ],
    },
    duplicates: {
      headline: `${money(dupValue)} / yr`,
      subhead: `${prevented} duplicate articles prevented, each avoiding ${money(SCENARIO.annualMaintenancePerArticle)} a year in upkeep`,
      bars: resultBars([
        { label: "Duplicate checks run", value: dupChecks, tone: "ink", meta: `${dupChecks}` },
        { label: "Merged or abandoned", value: prevented, tone: "signal", meta: `${prevented}` },
      ]),
      basis: [
        { label: "Duplicate checks run", value: `${dupChecks}`, kind: "observed" },
        { label: "Merged or abandoned rate", value: SCENARIO.dupResolvedRate.toFixed(2), kind: "assumed" },
        { label: "Annual maintenance per article", value: money(SCENARIO.annualMaintenancePerArticle), kind: "assumed" },
      ],
    },
    "repair-impact": {
      headline: `+${lift} pts answer rate`,
      subhead: `on ${repaired} solutions refreshed this window, compared 30 days either side of the edit`,
      bars: resultBars([
        { label: "Answer rate before edit", value: SCENARIO.repairBeforeRate, tone: "garnet", meta: `${SCENARIO.repairBeforeRate}%` },
        { label: "Answer rate after edit", value: SCENARIO.repairAfterRate, tone: "signal", meta: `${SCENARIO.repairAfterRate}%` },
      ]),
      basis: [
        { label: "Solutions refreshed this window", value: `${repaired}`, kind: "observed" },
        { label: "Answer rate before edit", value: `${SCENARIO.repairBeforeRate}%`, kind: "assumed" },
        { label: "Answer rate after edit", value: `${SCENARIO.repairAfterRate}%`, kind: "assumed" },
      ],
    },
  };
}

export function computeRoi(
  data: SnapshotDataset,
  assumed: AssumedConstants,
  counts: Counts,
  repair: Repair,
): RoiModel {
  const grounding = computeGrounding(data);
  const serving = computeServing(data);

  const retrieved = grounding.avgContextSize;
  const cited = grounding.avgCitedPerAnswer;
  const ttfa = serving.p50;

  const readSolution = (assumed.wordsArticle / assumed.wpm) * 60;
  const readAnswer = (assumed.wordsAnswer / assumed.wpm) * 60;

  // The counterfactual models the observed path: open the ones that would have been
  // cited, scan and reject the rest. Reading every retrieved solution instead gives
  // fullRead below, which is the number that gets the entire tab dismissed.
  const counterfactual = Math.max(0, retrieved - cited) * assumed.scanSec + cited * readSolution;
  const actual = ttfa + readAnswer + assumed.pVerify * readSolution;
  const gross = counterfactual - actual;
  const net = assumed.pThumbsUp * gross - (1 - assumed.pThumbsUp) * assumed.wastedSec;
  const fullRead = retrieved * readSolution - actual;

  const peak = Math.max(counterfactual, actual, gross, net, 1);
  const waterfall: BarDatum[] = [
    { label: "Counterfactual — search and read it yourself", value: counterfactual, pct: (counterfactual / peak) * 100, tone: "garnet" },
    { label: "AI-assisted path", value: actual, pct: (actual / peak) * 100, tone: "signal" },
    { label: "Gross time saved", value: gross, pct: (Math.max(0, gross) / peak) * 100, tone: "ochre" },
    { label: "Net after thumbs-down penalty", value: net, pct: (Math.max(0, net) / peak) * 100, tone: "ink" },
  ];

  return {
    observed: { retrieved, cited, ttfa },
    assumed: { ...assumed },
    waterfall,
    netMinutes: net / 60,
    fullReadMinutes: fullRead / 60,
    views: buildViews(computeScenarioResults(counts, repair, assumed)),
  };
}

function buildViews(results: Record<string, RoiResult>): RoiView[] {
  return [
    {
      id: "time-saved",
      title: "Time saved reading",
      state: "modelled",
      formula: [
        "counterfactual = (retrieved − cited) × scan_sec + cited × read(solution)",
        "actual         = ttfa + read(answer) + P(verify) × read(solution)",
        "net            = P(👍) × (counterfactual − actual) − P(👎) × wasted",
      ].join("\n"),
      note: "Logging answer word count and dwell together derives words-per-minute from the customer's own users, which flips this view from modelled to measured.",
      inputs: [
        { field: "Solutions retrieved per question", status: "live", source: "Gap analysis, Context Set" },
        { field: "Solutions cited per answer", status: "live", source: "Gap analysis, Reference Solutions" },
        { field: "Time to first answer", status: "live", source: "Time-to-answer report" },
        { field: "Thumbs up / down per session", status: "partial", source: "Feedback feed in progress" },
        { field: "Answer word count", status: "missing", source: "Log at generation, keyed on session ID" },
        { field: "Solution body word count", status: "missing", source: "Index-time field on each solution" },
        { field: "Answer dwell time", status: "missing", source: "Answer render → next user action" },
        { field: "Candidate list dwell", status: "missing", source: "Time on results before first open" },
        { field: "Reference solution views", status: "missing", source: "Click-through per cited solution — logging 0 today" },
      ],
    },
    {
      id: "deflection",
      title: "Ticket deflection",
      state: "modelled",
      result: results.deflection,
      formula: [
        "deflected = sessions_answered_👍 − sessions_followed_by_case(≤ 30 min)",
        "value     = deflected × cost_per_case",
      ].join("\n"),
      note: "Deflection here counts helpful answers not followed by a case within the window. The follow rate and cost per case are named assumptions until a control cohort and connected ITSM confirm them.",
      inputs: [
        { field: "Answered and helpful sessions", status: "live", source: "Gap analysis joined to feedback feed" },
        { field: "Session → case linkage", status: "partial", source: "Solution linkage feed in progress" },
        { field: "Case created timestamp", status: "partial", source: "Connected ITSM or CRM" },
        { field: "Case follow rate", status: "partial", source: "Assumed for this scenario, editable" },
        { field: "Cost per case", status: "partial", source: "Assumed for this scenario, editable" },
      ],
    },
    {
      id: "authoring",
      title: "Authoring cycle time",
      state: "modelled",
      result: results.authoring,
      formula: [
        "cycle     = published_at − draft_created_at",
        "delta     = median(cycle | no AI) − median(cycle | AI)",
        "value     = delta × ai_authored × author_day_cost",
      ].join("\n"),
      note: "The AI-authored count is observed. The two cycle-time medians are named assumptions until draft and publish timestamps are logged, at which point this becomes a measured before-and-after on the same authors.",
      inputs: [
        { field: "AI actions per solution", status: "live", source: "AI Knowledge Assistant usage by solution" },
        { field: "AI-authored solution count", status: "live", source: "Usage by solution report" },
        { field: "Median cycle without AI", status: "partial", source: "Assumed for this scenario, editable" },
        { field: "Median cycle with AI", status: "partial", source: "Assumed for this scenario, editable" },
        { field: "Fully loaded author day", status: "partial", source: "Assumed for this scenario, editable" },
      ],
    },
    {
      id: "duplicates",
      title: "Duplicate prevention",
      state: "modelled",
      result: results.duplicates,
      formula: [
        "prevented = duplicate_checks × merged_or_abandoned_rate",
        "value     = prevented × annual_maintenance_cost_per_article",
      ].join("\n"),
      note: "Check volume is observed from AI usage. The resolution rate and maintenance cost are named assumptions, and unlike authoring time this figure compounds every year the duplicate does not exist.",
      inputs: [
        { field: "Duplicate check volume", status: "live", source: "AI usage by user — most-used AI action" },
        { field: "Merged or abandoned rate", status: "partial", source: "Assumed for this scenario, editable" },
        { field: "Annual maintenance per article", status: "partial", source: "Assumed for this scenario, editable" },
      ],
    },
    {
      id: "repair-impact",
      title: "Repair impact",
      state: "modelled",
      result: results["repair-impact"],
      formula: "for each repaired solution:\n  answer_rate(30d after edit) − answer_rate(30d before edit)",
      note: "The refreshed-solution count is observed. The before and after answer rates are named assumptions until edit timestamps let the windows be split from the live gap analysis.",
      inputs: [
        { field: "Solutions refreshed this window", status: "live", source: "Usage by solution, modified in period" },
        { field: "Answered outcome per query", status: "live", source: "Gap analysis, joinable on solution ID" },
        { field: "Answer rate before edit", status: "partial", source: "Assumed for this scenario, editable" },
        { field: "Answer rate after edit", status: "partial", source: "Assumed for this scenario, editable" },
      ],
    },
  ];
}
