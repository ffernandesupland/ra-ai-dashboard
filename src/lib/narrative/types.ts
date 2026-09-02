/**
 * Which copy on this dashboard is an *evaluation* and which is not.
 *
 * An evaluation is a claim about this week's figures that a different week could
 * falsify: "neural outperforms keyword" is only true while it is true. Those are
 * the slots below, and they are the only prose the model is allowed to write.
 *
 * Everything else stays hardcoded on purpose. Chart legends ("bar colour encodes
 * answer rate"), methodology notes ("any edit counts, by any method") and
 * disclosure of deliberate choices ("QA noise is surfaced rather than hidden")
 * are true of every dataset. Handing them to a model would add cost, latency and
 * drift for copy that never needed to change.
 */

export const NARRATIVE_SLOTS = [
  "thesis",
  "loopVerdict",
  "consistency",
  "searchMode",
  "grounding",
  "serveSpeed",
  "citationSpread",
  "decay",
  "worklistPriority",
  "aiPublishing",
  "repairQueue",
] as const;

export type NarrativeSlot = (typeof NARRATIVE_SLOTS)[number];

/** What each passage has to do. Sent to the model verbatim. */
export const SLOT_BRIEFS: Record<NarrativeSlot, string> = {
  thesis:
    "The headline argument of the whole dashboard, as a single sentence with no full stop needed beyond the end. It sits above the loop diagram. Say what the relationship between consumption and curation actually is this week.",
  loopVerdict:
    "The callout under the headline. Loop closure is scored only against the solutions that were due for review, not every cited solution, so read it that way. Say what share of the solutions due for review were refreshed and what that means for whether the content under live load is being maintained. Follow the figures: if most of what was due got refreshed, the loop is closing, so say so plainly.",
  consistency:
    "Sits under a chart of repeated questions and how often each got answered. If the same question gets inconsistent answers, name that as a content quality problem rather than a coverage gap, because the knowledge base does contain articles on these topics.",
  searchMode:
    "Sits beside a chart of the absolute position the answer ranked at and the MRR interpretation scale. The tension worth naming is that ranking can be strong on the questions retrieval lands while overall MRR stays weak because so many questions return nothing, so separate ranking quality from coverage rather than blurring the two into one verdict.",
  grounding:
    "Sits under a bar showing how many failed answers still had candidate solutions retrieved. Distinguish a retrieval failure from a grounding failure and say which one this is.",
  serveSpeed:
    "Sits under a chart of median time to first answer broken out by portal group. Say whether speed is even across audiences and whether latency is a real constraint here, so the reader knows whether the bottleneck is response time or the content behind the answer.",
  citationSpread:
    "Sits under a chart of how many solutions are cited once versus many times. The point worth naming is concentration: whether a small core of articles is carrying most of the live demand, which is where staleness would do the most damage.",
  decay:
    "Sits under a chart of how old the cited solutions are. The point is that staleness only matters where it is carrying live traffic, so lead with the citation weighted reading.",
  worklistPriority:
    "Sits under the repair worklist, which ranks solutions overdue for review by their live citations against staleness. Say why the order is the priority order, so a knowledge manager fixes the stale content actually under load first rather than the merely old.",
  aiPublishing:
    "Sits under a table of the solutions AI touched, showing how many never left draft or review. Say whether that authoring effort actually reached customers, because a solution that is not published cannot be cited by anyone.",
  repairQueue:
    "Sits under the repair queue, which joins failed demand to the content that should have answered it. Frame it as the actionable list for closing knowledge gaps: each row is a question the knowledge base could not close, and clearing the top rows is how the loop closes.",
};

export interface Narratives {
  thesis: string;
  loopVerdict: string;
  consistency: string;
  searchMode: string;
  grounding: string;
  serveSpeed: string;
  citationSpread: string;
  decay: string;
  worklistPriority: string;
  aiPublishing: string;
  repairQueue: string;
  /** "static" means the deterministic fallback wrote this, not the model. */
  source: "static" | "model";
  model?: string;
  generatedAt?: string;
  /** Slots the model returned but that failed verification, with the reason. */
  rejected?: { slot: NarrativeSlot; reason: string }[];
  /**
   * Why a requested generation fell back to deterministic copy. Kept because a
   * button that silently does nothing is worse than one that says what broke.
   */
  error?: string;
}
