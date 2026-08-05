import { NextResponse } from "next/server";
import { checkIngestToken } from "@/lib/auth";
import { IngestConflictError, commitBatch } from "@/lib/ingest/commit";
import { prepareBatch, type UploadInput } from "@/lib/ingest/prepare";
import { getDefaultWorkspace } from "@/lib/snapshots";
import { getWorkspace } from "@/lib/workspaces";

const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/**
 * Automation hook for a scheduled export job. Guarded by INGEST_TOKEN, which is
 * separate from the dashboard password so a scraper credential cannot read the UI.
 */
export async function POST(request: Request) {
  if (!checkIngestToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 415 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files supplied" }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files (max ${MAX_FILES})` }, { status: 413 });
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "Upload too large" }, { status: 413 });
  }

  const uploads: UploadInput[] = await Promise.all(
    files.map(async (file) => ({ name: file.name, content: await file.text() })),
  );

  const batch = prepareBatch(uploads);
  if (batch.errors.length > 0 || !batch.dataset) {
    return NextResponse.json({ error: "Parse failed", details: batch.errors }, { status: 422 });
  }

  // A named workspace must exist. Silently falling back to the default would file
  // one customer's exports under another.
  const slug = formData.get("workspace");
  const workspace = typeof slug === "string" && slug ? await getWorkspace(slug) : await getDefaultWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: `No workspace with slug "${slug}"` }, { status: 404 });
  }

  try {
    const snapshot = await commitBatch(batch, {
      workspaceId: workspace.id,
      uploadedBy: "api",
      replaceExisting: formData.get("replaceExisting") === "true",
    });
    return NextResponse.json({
      snapshotId: snapshot.id,
      workspace: workspace.slug,
      windowStart: batch.windowStart,
      windowEnd: batch.windowEnd,
      reports: batch.files.length,
      rows: batch.totalRows,
      missing: batch.missing.map((m) => m.label),
    });
  } catch (error) {
    if (error instanceof IngestConflictError) {
      return NextResponse.json(
        { error: error.message, existingSnapshotId: error.existingSnapshotId },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
