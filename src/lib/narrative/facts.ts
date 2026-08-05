import type { DashboardData } from "@/lib/metrics/types";

export type MetricsForNarrative = Omit<DashboardData, "narratives">;

/**
 * The only figures the model gets to see, and therefore the only figures it is
 * allowed to print. Kept small on purpose: a compact sheet is cheaper, and it
 * narrows what a hallucination could plausibly latch onto.
 */
export function buildFacts(data: MetricsForNarrative) {
  const { counts, repair, decay, grounding, demand, retrieval, serving } = data;

  return {
    window: { label: data.window.label, days: data.window.days },
    volume: {
      questionsAsked: counts.questionsAsked,
      distinctQuestions: counts.distinctQuestions,
      answeredCount: counts.answeredCount,
      unansweredCount: counts.unansweredCount,
      answerRatePct: round(counts.answerRate),
      portalUsers: counts.portalUsers,
      portalGroups: counts.portalGroups,
      collections: counts.collections,
    },
    serving: {
      solutionsCited: counts.solutionsCited,
      totalCitations: counts.totalCitations,
      medianTimeToAnswerSec: serving.p50,
      p90TimeToAnswerSec: serving.p90,
    },
    grounding: {
      unansweredQuestions: grounding.unanswered,
      failuresThatHadCandidatesRetrieved: grounding.failuresWithContext,
      failuresWithNothingRetrieved: grounding.failuresWithoutContext,
      avgCandidatesRetrieved: round(grounding.avgContextSize),
      avgSolutionsCitedPerAnswer: round(grounding.avgCitedPerAnswer),
    },
    ranking: {
      questionsThatReturnedSomethingToRank: retrieval.ranking.ranked,
      questionsWithNoUsableHit: retrieval.ranking.noUsableHit,
      positions: retrieval.ranking.positions.map((p) => ({
        position: p.label,
        questions: p.count,
        pctOfRankedQuestions: round(p.pctOfRanked),
      })),
      foundAtRankOnePct: round(retrieval.ranking.top1Pct),
      foundWithinTopThreePct: round(retrieval.ranking.top3Pct),
      meanReciprocalRank: round(retrieval.ranking.mrr.value, 2),
      meanReciprocalRankBand: retrieval.ranking.mrr.bandLabel,
    },
    searchModes: retrieval.searchTypes.map((t) => ({
      mode: t.type,
      questions: t.questions,
      answerRatePct: round(t.answerRate),
      meanReciprocalRank: t.meanMrr === null ? null : round(t.meanMrr, 2),
      foundWithinTopThreePct: t.top3Pct === null ? null : round(t.top3Pct),
    })),
    repeatedQuestions: demand.consistency.map((r) => ({
      question: r.query,
      timesAsked: r.asks,
      timesAnswered: r.answered,
      answerRatePct: round(r.answerRate),
    })),
    demandThemes: demand.themes.map((t) => ({
      theme: t.theme,
      questions: t.questions,
      answerRatePct: round(t.answerRate),
      isSmokeTestTraffic: t.qaNoise,
    })),
    decay: {
      bands: decay.bands.map((b) => ({ ageBand: b.label, solutions: b.solutions, citations: b.citations })),
      medianAgeOfCitedSolutionDays: decay.medianAgeDays,
      pctOfCitationsFromSolutionsOverOneYearOld: round(decay.pctCitationsOverYear),
    },
    repair: {
      windowDays: repair.windowDays,
      citedSolutions: repair.denominator,
      editedDuringWindow: repair.refreshedInWindow,
      editedWithin30Days: repair.refreshedIn30Days,
      untouchedOverOneYear: repair.untouchedOverYear,
      loopClosurePct: round(repair.loopClosure),
      loopClosureCitationWeightedPct: round(repair.loopClosureWeighted),
      aiAssistedRepairs: repair.aiAssistedCount,
      aiShareOfRepairPct: round(repair.aiShareOfRepair),
      aiTouchedSolutions: repair.aiTouched.length,
      aiTouchedNeverPublished: repair.aiNotPublished,
    },
  };
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Every number the model may legitimately print, harvested from the fact sheet
 * itself so the two can never drift apart. Rounded forms are admitted because
 * "42%" is a fair rendering of 42.0, but nothing outside this set is.
 */
export function allowedNumbers(facts: unknown): Set<number> {
  const allowed = new Set<number>();
  for (const match of JSON.stringify(facts).matchAll(/-?\d+(?:\.\d+)?/g)) {
    const value = Number(match[0]);
    if (!Number.isFinite(value)) continue;
    allowed.add(value);
    allowed.add(Math.round(value));
    allowed.add(Math.round(value * 10) / 10);
  }
  return allowed;
}
