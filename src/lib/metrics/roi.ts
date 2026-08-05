import type { BarDatum, RoiModel, RoiView, SnapshotDataset } from "./types";
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

export function computeRoi(data: SnapshotDataset, assumed: AssumedConstants): RoiModel {
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
    views: buildViews(),
  };
}

function buildViews(): RoiView[] {
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
      state: "blocked",
      formula: [
        "deflected = sessions_answered_👍 − sessions_followed_by_case(≤ 30 min)",
        "value     = deflected × cost_per_case",
      ].join("\n"),
      note: "Without a control cohort this is correlation, not deflection. Cheapest control is the pre-deployment window on the same portal groups.",
      inputs: [
        { field: "Session → case linkage", status: "partial", source: "Solution linkage feed in progress" },
        { field: "Case created timestamp", status: "missing", source: "Connected ITSM or CRM" },
        { field: "Session end signal", status: "missing", source: "Exit, timeout, or re-query within window" },
        { field: "Control cohort or baseline", status: "missing", source: "Pre-deployment window, same portal groups" },
        { field: "Cost per case", status: "missing", source: "Customer-supplied constant" },
      ],
    },
    {
      id: "authoring",
      title: "Authoring cycle time",
      state: "blocked",
      formula: [
        "cycle     = published_at − draft_created_at",
        "delta     = median(cycle | no AI) − median(cycle | AI)",
        "retention = 1 − edit_distance(ai_draft, published) ÷ len(ai_draft)",
      ].join("\n"),
      note: "Three timestamps and a text snapshot. No typing-speed constant appears anywhere in this view — it is an observed before-and-after on the same authors.",
      inputs: [
        { field: "AI actions per solution", status: "live", source: "AI Knowledge Assistant usage by solution" },
        { field: "Status and last modified", status: "live", source: "Usage by solution report" },
        { field: "Draft created timestamp", status: "missing", source: "Lifecycle event per solution" },
        { field: "First published timestamp", status: "missing", source: "Lifecycle event, first publish only" },
        { field: "AI action timestamps", status: "missing", source: "Currently counts, no time dimension" },
        { field: "AI draft snapshot", status: "missing", source: "Store generated text for diff against published" },
      ],
    },
    {
      id: "duplicates",
      title: "Duplicate prevention",
      state: "blocked",
      formula: [
        "prevented = duplicate_checks where outcome ∈ {merged, abandoned}",
        "value     = prevented × annual_maintenance_cost_per_article",
      ].join("\n"),
      note: "One outcome field turns a usage counter into an avoided-cost figure, and unlike authoring time saved this one compounds every year the duplicate does not exist.",
      inputs: [
        { field: "Duplicate check volume", status: "live", source: "AI usage by user — most-used AI action" },
        { field: "Duplicate check outcome", status: "missing", source: "Merged, abandoned, or proceeded anyway" },
        { field: "Candidate duplicate IDs", status: "missing", source: "Which solutions the check surfaced" },
        { field: "Annual maintenance cost per article", status: "missing", source: "Customer-supplied constant" },
      ],
    },
    {
      id: "repair-impact",
      title: "Repair impact",
      state: "blocked",
      formula: "for each repaired solution:\n  answer_rate(30d after edit) − answer_rate(30d before edit)",
      note: "The only view that demonstrates cause rather than association, and it needs both halves of the loop to exist.",
      inputs: [
        { field: "Citations per solution", status: "live", source: "Usage by solution" },
        { field: "Answered outcome per query", status: "live", source: "Gap analysis, joinable on solution ID" },
        { field: "Days since last modified", status: "live", source: "Usage by solution" },
        { field: "Edit event timestamps", status: "missing", source: "Needed to split before/after windows" },
        { field: "Solution Manager modified-in-period", status: "missing", source: "Full population, not only cited solutions" },
      ],
    },
  ];
}
