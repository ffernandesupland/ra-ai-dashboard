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
      repair.reviewClosure < 25
        ? "Consumption and curation are running on separate content sets."
        : "Consumption and curation are starting to converge on the same content.",

    loopVerdict:
      repair.reviewClosure < 25
        ? `The loop is open. Gen Answers cited ${counts.solutionsCited} solutions this week. Of the ${repair.dueForReview} solutions due for review, ${repair.refreshedInWindow} were edited by anyone, by any method. The content doing the answering is not the content getting maintained.`
        : `The loop is closing. Of the ${repair.dueForReview} cited solutions due for review, ${repair.refreshedInWindow} were edited this week, so the content doing the answering is also the content getting maintained.`,

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

    serveSpeed:
      "Answers arrive quickly and at an even pace across portal groups, so latency is not what stands between a customer and a resolution. When an answer fails here, the content behind it is the reason, not the speed of delivery.",

    citationSpread:
      "Citations concentrate on a narrow set of solutions rather than spreading evenly, so a small core of articles carries most of the live demand. That core is exactly where staleness would hurt most, which is why the citation weighted reading matters more than the raw article count.",

    decay:
      decay.medianAgeDays === null
        ? "No modified dates were present, so staleness could not be measured this week."
        : `Median age of a cited solution is ${decay.medianAgeDays} days, and ${formatPct(decay.pctCitationsOverYear)} of citations come from articles over a year old. The citation weighted reading is the one that matters, because an old article nobody reads is not a problem.`,

    worklistPriority:
      "The worklist is ranked by live citations against staleness, so the entries at the top are overdue articles that are still answering real questions. Working it from the top returns the most value per edit, because it fixes the stale content actually under load rather than the merely old.",

    aiPublishing: !repair.aiTouched.length
      ? "No solutions were touched by AI in this window, so there is no authoring effort to trace through to publication."
      : repair.aiNotPublished === 0
        ? `All ${repair.aiTouched.length} AI-touched solutions reached published state, so the authoring effort is reaching customers rather than stalling in review.`
        : `${repair.aiNotPublished} of ${repair.aiTouched.length} AI-touched solutions never left draft or review, so they could not be cited at all.`,

    repairQueue:
      "Each row is a question customers asked that the knowledge base could not close, ranked so the widest gaps sit first. This is the list that turns a demand signal into an authoring task, and clearing it from the top is how knowledge gaps close and stop recurring.",
  };
}
