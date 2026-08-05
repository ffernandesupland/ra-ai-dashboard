import { formatPct } from "@/lib/format";
import type { MetricsForNarrative } from "./facts";
import type { Narratives } from "./types";

/**
 * The copy that ships when there is no API key, when the call fails, or when a
 * generated passage fails verification. It is data driven rather than fixed,
 * because the old hardcoded lines asserted things a future week could falsify:
 * "neural outperforms keyword" was true of the reference tenant and nothing else.
 */
export function staticNarratives(data: MetricsForNarrative): Narratives {
  const { counts, repair, decay, grounding, demand, retrieval } = data;

  const inconsistent = demand.consistency.filter((r) => r.answerRate > 0 && r.answerRate < 100).length;
  const groundedShare = grounding.unanswered ? (grounding.failuresWithContext / grounding.unanswered) * 100 : 0;

  return {
    source: "static",

    thesis:
      repair.loopClosure < 25
        ? "Consumption and curation are running on separate content sets."
        : "Consumption and curation are starting to converge on the same content.",

    loopVerdict:
      repair.loopClosure < 25
        ? `The loop is open. Gen Answers cited ${counts.solutionsCited} solutions this week. ${repair.refreshedInWindow} of them were edited by anyone, by any method. The content doing the answering is not the content getting maintained.`
        : `The loop is closing. Gen Answers cited ${counts.solutionsCited} solutions this week and ${repair.refreshedInWindow} of them were edited, so the content doing the answering is also the content getting maintained.`,

    consistency: inconsistent
      ? "The same question, asked repeatedly, answered inconsistently. This is not a coverage gap, because the knowledge base holds articles on these topics. It is a content quality gap."
      : "Repeated questions are answered consistently, so the articles behind them are holding up under load.",

    searchMode: !retrieval.ranking.ranked
      ? "Nothing ranked this week, so there is no ordering to judge."
      : `When retrieval returns anything at all it ranks it well, with ${formatPct(retrieval.ranking.top3Pct)} of those questions answered inside the top three and an MRR of ${retrieval.ranking.mrr.value.toFixed(2)}. The catch is that only ${retrieval.ranking.ranked} of ${retrieval.ranking.scored} questions returned anything to rank. The ordering is not the problem, the coverage is.`,

    grounding:
      groundedShare >= 90
        ? `${grounding.failuresWithContext} of ${grounding.unanswered} unanswered questions had candidate solutions retrieved. Search worked. Generation refused to ground on what it got. That isolates the failure to content quality rather than retrieval tuning.`
        : `${grounding.failuresWithContext} of ${grounding.unanswered} unanswered questions had candidate solutions retrieved. The rest returned nothing at all, so retrieval and content are both in scope.`,

    decay:
      decay.medianAgeDays === null
        ? "No modified dates were present, so staleness could not be measured this week."
        : `Median age of a cited solution is ${decay.medianAgeDays} days, and ${formatPct(decay.pctCitationsOverYear)} of citations come from articles over a year old. The citation weighted reading is the one that matters, because an old article nobody reads is not a problem.`,

    aiPublishing: !repair.aiTouched.length
      ? "No solutions were touched by AI in this window, so there is no authoring effort to trace through to publication."
      : repair.aiNotPublished === 0
        ? `All ${repair.aiTouched.length} AI-touched solutions reached published state, so the authoring effort is reaching customers rather than stalling in review.`
        : `${repair.aiNotPublished} of ${repair.aiTouched.length} AI-touched solutions never left draft or review, so they could not be cited at all.`,
  };
}
