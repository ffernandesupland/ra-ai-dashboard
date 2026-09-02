import { SnapshotStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/json";
import { buildDashboardData } from "@/lib/metrics";
import { DEFAULT_ASSUMPTIONS, type AssumedConstants } from "@/lib/metrics/roi";
import { DEFAULT_REVIEW_THRESHOLD_DAYS } from "@/lib/metrics/types";
import type { PreparedBatch } from "./prepare";

export interface CommitOptions {
  workspaceId: string;
  uploadedBy: string;
  label?: string;
  notes?: string;
  /** Marks any existing snapshot for the same window as SUPERSEDED. */
  replaceExisting?: boolean;
}

export class IngestConflictError extends Error {
  constructor(
    message: string,
    readonly existingSnapshotId: string,
  ) {
    super(message);
    this.name = "IngestConflictError";
  }
}

export async function commitBatch(batch: PreparedBatch, options: CommitOptions) {
  if (!batch.dataset || !batch.windowStart || !batch.windowEnd) {
    throw new Error("Batch cannot be committed: no parseable window.");
  }
  if (batch.errors.length > 0) {
    throw new Error(`Batch has ${batch.errors.length} unresolved error(s).`);
  }

  const existing = await prisma.snapshot.findFirst({
    where: {
      workspaceId: options.workspaceId,
      windowStart: batch.windowStart,
      windowEnd: batch.windowEnd,
      status: SnapshotStatus.COMMITTED,
    },
  });

  if (existing && !options.replaceExisting) {
    throw new IngestConflictError(
      `A snapshot already exists for ${batch.windowStart.toISOString().slice(0, 10)} → ${batch.windowEnd
        .toISOString()
        .slice(0, 10)}.`,
      existing.id,
    );
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: options.workspaceId } });
  const assumptions = readAssumptions(workspace.settings);
  const dashboard = buildDashboardData(batch.dataset, {
    assumptions,
    reviewThresholdDays: readReviewThreshold(workspace.settings),
  });

  return prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.snapshot.update({
        where: { id: existing.id },
        data: { status: SnapshotStatus.SUPERSEDED },
      });
    }

    const snapshot = await tx.snapshot.create({
      data: {
        workspaceId: options.workspaceId,
        windowStart: batch.windowStart!,
        windowEnd: batch.windowEnd!,
        windowDays: batch.windowDays,
        status: SnapshotStatus.COMMITTED,
        committedAt: new Date(),
        label: options.label,
        notes: options.notes,
        uploadedBy: options.uploadedBy,
      },
    });

    await tx.sourceFile.createMany({
      data: batch.files.map((file) => ({
        snapshotId: snapshot.id,
        reportType: file.reportType,
        originalName: file.originalName,
        checksum: file.checksum,
        byteSize: file.byteSize,
        rowCount: file.rowCount,
        titleLine: file.titleLine,
        filterLine: file.filterLine,
        warnings: toJson(file.warnings),
      })),
    });

    for (const file of batch.files) {
      switch (file.mapped.kind) {
        case "gapAnalysis":
          await tx.gapAnalysisRow.createMany({
            data: file.mapped.rows.map((r) => ({ ...r, snapshotId: snapshot.id })),
          });
          break;
        case "solutionUsage":
          await tx.solutionUsageRow.createMany({
            data: file.mapped.rows.map((r) => ({ ...r, snapshotId: snapshot.id })),
          });
          break;
        case "aiKaSolution":
          await tx.aiKaSolutionRow.createMany({
            data: file.mapped.rows.map((r) => ({ ...r, snapshotId: snapshot.id })),
          });
          break;
        case "dailySummary":
          await tx.dailySummaryRow.createMany({
            data: file.mapped.rows.map((r) => ({ ...r, snapshotId: snapshot.id })),
          });
          break;
        case "ttfaQuery":
          await tx.ttfaQueryRow.createMany({
            data: file.mapped.rows.map((r) => ({ ...r, snapshotId: snapshot.id })),
          });
          break;
        case "aggregate":
          await tx.aggregateRow.createMany({
            data: file.mapped.rows.map((payload, ordinal) => ({
              snapshotId: snapshot.id,
              reportType: file.reportType,
              ordinal,
              payload: toJson(payload),
            })),
          });
          break;
      }
    }

    await tx.metricSnapshot.create({
      data: {
        snapshotId: snapshot.id,
        metricsVersion: dashboard.metricsVersion,
        data: toJson(dashboard),
        questionsAsked: dashboard.counts.questionsAsked,
        answerRate: dashboard.counts.answerRate,
        solutionsCited: dashboard.counts.solutionsCited,
        totalCitations: dashboard.counts.totalCitations,
        // The promoted columns carry the headline metric so /trends and the index
        // can query it without deserialising: that headline is now review-adjusted closure.
        loopClosure: dashboard.repair.reviewClosure,
        loopClosureWtd: dashboard.repair.reviewClosureWeighted,
        aiShareOfRepair: dashboard.repair.aiShareOfRepair,
        medianTtfaSec: dashboard.serving.p50,
      },
    });

    return snapshot;
  });
}

export function readAssumptions(settings: unknown): AssumedConstants {
  const stored = (settings as { assumptions?: Partial<AssumedConstants> })?.assumptions ?? {};
  return { ...DEFAULT_ASSUMPTIONS, ...stored };
}

/** Review cadence in days from workspace settings, clamped to a sane range. */
export function readReviewThreshold(settings: unknown): number {
  const raw = (settings as { reviewThresholdDays?: unknown })?.reviewThresholdDays;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_REVIEW_THRESHOLD_DAYS;
  return Math.round(value);
}
