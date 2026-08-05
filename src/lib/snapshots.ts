import { ReportType, SnapshotStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/json";
import { readAssumptions } from "@/lib/ingest/commit";
import { METRICS_VERSION, buildDashboardData, type DashboardData, type SnapshotDataset } from "@/lib/metrics";
import { generateNarratives } from "@/lib/narrative";

export const DEFAULT_WORKSPACE_SLUG = "default";

/** The workspace an unattended ingest lands in when the caller names none. */
export async function getDefaultWorkspace() {
  return prisma.workspace.upsert({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    update: {},
    create: { slug: DEFAULT_WORKSPACE_SLUG, name: "RightAnswers" },
  });
}

export async function listSnapshots(workspaceId: string) {
  return prisma.snapshot.findMany({
    where: { workspaceId, status: SnapshotStatus.COMMITTED },
    orderBy: { windowEnd: "desc" },
    include: {
      metrics: true,
      _count: { select: { sourceFiles: true } },
    },
  });
}

export async function getLatestSnapshotId(workspaceId: string): Promise<string | null> {
  const latest = await prisma.snapshot.findFirst({
    where: { workspaceId, status: SnapshotStatus.COMMITTED },
    orderBy: { windowEnd: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

/** Reads the persisted `D` object, recomputing transparently when a formula has changed. */
export async function getDashboardData(snapshotId: string): Promise<DashboardData | null> {
  const metrics = await prisma.metricSnapshot.findUnique({ where: { snapshotId } });
  if (metrics && metrics.metricsVersion === METRICS_VERSION) {
    return metrics.data as unknown as DashboardData;
  }
  return recomputeMetrics(snapshotId);
}

export async function loadDataset(snapshotId: string): Promise<SnapshotDataset | null> {
  const snapshot = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
    include: {
      gapAnalysisRows: { orderBy: { ordinal: "asc" } },
      solutionUsageRows: true,
      aiKaSolutionRows: true,
      dailySummaryRows: { orderBy: { date: "asc" } },
      ttfaQueryRows: { orderBy: { ordinal: "asc" } },
      aggregateRows: { orderBy: { ordinal: "asc" } },
    },
  });
  if (!snapshot) return null;

  const aggregates: SnapshotDataset["aggregates"] = {};
  for (const row of snapshot.aggregateRows) {
    const bucket = (aggregates[row.reportType as ReportType] ??= []);
    bucket.push(row.payload as Record<string, unknown>);
  }

  return {
    windowStart: snapshot.windowStart,
    windowEnd: snapshot.windowEnd,
    windowDays: snapshot.windowDays,
    gapAnalysis: snapshot.gapAnalysisRows.map((r) => ({
      ordinal: r.ordinal,
      askedOn: r.askedOn,
      username: r.username,
      firstName: r.firstName,
      lastName: r.lastName,
      portalGroup: r.portalGroup,
      query: r.query,
      queryNorm: r.queryNorm,
      searchType: r.searchType,
      answered: r.answered,
      referenceSolutions: r.referenceSolutions,
      contextSet: r.contextSet,
      mrr: r.mrr,
    })),
    solutionUsage: snapshot.solutionUsageRows.map((r) => ({
      solutionId: r.solutionId,
      title: r.title,
      citations: r.citations,
      pctOfTotal: r.pctOfTotal,
      daysSinceModified: r.daysSinceModified,
      collections: r.collections,
    })),
    aiKaSolutions: snapshot.aiKaSolutionRows.map((r) => ({
      solutionId: r.solutionId,
      title: r.title,
      status: r.status,
      lastModifiedAt: r.lastModifiedAt,
      collections: r.collections,
      aiActions: r.aiActions,
    })),
    dailySummary: snapshot.dailySummaryRows.map((r) => ({
      date: r.date,
      questions: r.questions,
      answered: r.answered,
      unanswered: r.unanswered,
      pctAnswered: r.pctAnswered,
      referenceSolutionView: r.referenceSolutionView,
    })),
    ttfaQueries: snapshot.ttfaQueryRows.map((r) => ({
      ordinal: r.ordinal,
      askedAt: r.askedAt,
      answeredAt: r.answeredAt,
      username: r.username,
      sessionId: r.sessionId,
      searchText: r.searchText,
      ttfaSec: r.ttfaSec,
    })),
    aggregates,
  };
}

export async function recomputeMetrics(snapshotId: string): Promise<DashboardData | null> {
  const snapshot = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
    include: { workspace: true, metrics: true },
  });
  if (!snapshot) return null;

  const dataset = await loadDataset(snapshotId);
  if (!dataset) return null;

  const dashboard = buildDashboardData(dataset, {
    assumptions: readAssumptions(snapshot.workspace.settings),
  });

  // Recomputing is a formula change, not new evidence, so previously generated
  // copy is carried across rather than re-billed. refreshNarratives() is the
  // only thing that calls the model.
  const previous = (snapshot.metrics?.data as unknown as DashboardData | undefined)?.narratives;
  if (previous?.source === "model") dashboard.narratives = previous;

  await persist(snapshotId, dashboard);
  return dashboard;
}

/** Rewrites the interpretive copy against the current figures. Costs an API call. */
export async function refreshNarratives(snapshotId: string): Promise<DashboardData | null> {
  const metrics = await prisma.metricSnapshot.findUnique({ where: { snapshotId } });
  const dashboard =
    metrics && metrics.metricsVersion === METRICS_VERSION
      ? (metrics.data as unknown as DashboardData)
      : await recomputeMetrics(snapshotId);
  if (!dashboard) return null;

  dashboard.narratives = await generateNarratives(dashboard);
  await persist(snapshotId, dashboard);
  return dashboard;
}

async function persist(snapshotId: string, dashboard: DashboardData) {
  const promoted = {
    metricsVersion: dashboard.metricsVersion,
    data: toJson(dashboard),
    questionsAsked: dashboard.counts.questionsAsked,
    answerRate: dashboard.counts.answerRate,
    solutionsCited: dashboard.counts.solutionsCited,
    totalCitations: dashboard.counts.totalCitations,
    loopClosure: dashboard.repair.loopClosure,
    loopClosureWtd: dashboard.repair.loopClosureWeighted,
    aiShareOfRepair: dashboard.repair.aiShareOfRepair,
    medianTtfaSec: dashboard.serving.p50,
  };

  await prisma.metricSnapshot.upsert({
    where: { snapshotId },
    create: { snapshotId, ...promoted },
    update: promoted,
  });
}

/** Called after an assumptions change; every snapshot's ROI model shifts together. */
export async function recomputeAll(workspaceId: string) {
  const snapshots = await prisma.snapshot.findMany({
    where: { workspaceId, status: SnapshotStatus.COMMITTED },
    select: { id: true },
  });
  for (const snapshot of snapshots) await recomputeMetrics(snapshot.id);
  return snapshots.length;
}
