"use server";

import { revalidatePath } from "next/cache";
import { commitBatch, IngestConflictError } from "@/lib/ingest/commit";
import { prepareBatch, type PreparedBatch, type UploadInput } from "@/lib/ingest/prepare";
import { refreshNarratives } from "@/lib/snapshots";
import { getWorkspace } from "@/lib/workspaces";

const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

export interface PreviewResult {
  ok: boolean;
  message?: string;
  /** Serialisable projection of the batch — the parsed rows stay on the server. */
  preview?: {
    windowStart: string;
    windowEnd: string;
    windowDays: number;
    totalRows: number;
    files: { label: string; originalName: string; rowCount: number; warnings: string[] }[];
    missing: { label: string; critical: boolean; feeds: string[] }[];
    errors: { file: string; message: string; detail?: string }[];
    conflictSnapshotId?: string;
  };
}

async function readUploads(formData: FormData): Promise<UploadInput[] | string> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return "Select at least one CSV export.";
  if (files.length > MAX_FILES) return `Too many files (${files.length}). Maximum is ${MAX_FILES}.`;

  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_BYTES) return "Upload exceeds the 60MB total limit.";

  const nonCsv = files.filter((f) => !f.name.toLowerCase().endsWith(".csv"));
  if (nonCsv.length > 0) return `Not a CSV: ${nonCsv.map((f) => f.name).join(", ")}`;

  return Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() })));
}

export async function previewUpload(formData: FormData): Promise<PreviewResult> {
  const uploads = await readUploads(formData);
  if (typeof uploads === "string") return { ok: false, message: uploads };

  const batch = prepareBatch(uploads);
  return { ok: batch.errors.length === 0 && batch.dataset !== null, preview: project(batch) };
}

// The browser still holds the files it previewed, so commit re-sends those rather
// than echoing the parsed text back down and up again. The server stays stateless
// between the two calls without pushing megabytes through the action boundary twice.
export async function commitUpload(
  formData: FormData,
  options: { slug: string; replaceExisting: boolean; label?: string; notes?: string },
): Promise<{ ok: boolean; snapshotId?: string; message?: string; conflictSnapshotId?: string }> {
  const uploads = await readUploads(formData);
  if (typeof uploads === "string") return { ok: false, message: uploads };

  const batch = prepareBatch(uploads);
  if (batch.errors.length > 0 || !batch.dataset) {
    return { ok: false, message: batch.errors[0]?.message ?? "Batch could not be parsed." };
  }

  // The slug arrives from the client, so it is resolved server side rather than
  // trusted as an id. A bad slug must fail, never fall back to some other customer.
  const workspace = await getWorkspace(options.slug);
  if (!workspace) return { ok: false, message: "That workspace no longer exists." };

  try {
    const snapshot = await commitBatch(batch, {
      workspaceId: workspace.id,
      uploadedBy: "dashboard",
      label: options.label,
      notes: options.notes,
      replaceExisting: options.replaceExisting,
    });

    // New evidence, so the interpretive copy is rewritten. Deliberately outside
    // the ingest transaction and non-fatal: a failed API call must not cost the
    // upload, it just leaves the deterministic copy in place.
    try {
      await refreshNarratives(snapshot.id);
    } catch (error) {
      console.error("[narrative] post-ingest refresh failed:", error);
    }

    revalidatePath("/", "layout");
    return { ok: true, snapshotId: snapshot.id };
  } catch (error) {
    if (error instanceof IngestConflictError) {
      return { ok: false, message: error.message, conflictSnapshotId: error.existingSnapshotId };
    }
    return { ok: false, message: (error as Error).message };
  }
}

function project(batch: PreparedBatch): PreviewResult["preview"] {
  return {
    windowStart: batch.windowStart?.toISOString().slice(0, 10) ?? "—",
    windowEnd: batch.windowEnd?.toISOString().slice(0, 10) ?? "—",
    windowDays: batch.windowDays,
    totalRows: batch.totalRows,
    files: batch.files.map((f) => ({
      label: f.label,
      originalName: f.originalName,
      rowCount: f.rowCount,
      warnings: f.warnings.map((w) => w.message),
    })),
    missing: batch.missing.map((m) => ({ label: m.label, critical: m.critical, feeds: m.feeds })),
    errors: batch.errors,
  };
}
