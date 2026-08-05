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
  "decay",
  "aiPublishing",
] as const;

export type NarrativeSlot = (typeof NARRATIVE_SLOTS)[number];

/** What each passage has to do. Sent to the model verbatim. */
export const SLOT_BRIEFS: Record<NarrativeSlot, string> = {
  thesis:
    "The headline argument of the whole dashboard, as a single sentence with no full stop needed beyond the end. It sits above the loop diagram. Say what the relationship between consumption and curation actually is this week.",
  loopVerdict:
    "The callout under the headline. State how many solutions answered questions and how many of those were edited by anyone, then say what that gap means for whether the knowledge base is maintaining itself.",
  consistency:
    "Sits under a chart of repeated questions and how often each got answered. If the same question gets inconsistent answers, name that as a content quality problem rather than a coverage gap, because the knowledge base does contain articles on these topics.",
  searchMode:
    "Sits beside a chart of the absolute position the answer ranked at and the MRR interpretation scale. The tension worth naming is that ranking can be strong on the questions retrieval lands while overall MRR stays weak because so many questions return nothing, so separate ranking quality from coverage rather than blurring the two into one verdict.",
  grounding:
    "Sits under a bar showing how many failed answers still had candidate solutions retrieved. Distinguish a retrieval failure from a grounding failure and say which one this is.",
  decay:
    "Sits under a chart of how old the cited solutions are. The point is that staleness only matters where it is carrying live traffic, so lead with the citation weighted reading.",
  aiPublishing:
    "Sits under a table of the solutions AI touched, showing how many never left draft or review. Say whether that authoring effort actually reached customers, because a solution that is not published cannot be cited by anyone.",
};

export interface Narratives {
  thesis: string;
  loopVerdict: string;
  consistency: string;
  searchMode: string;
  grounding: string;
  decay: string;
  aiPublishing: string;
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
