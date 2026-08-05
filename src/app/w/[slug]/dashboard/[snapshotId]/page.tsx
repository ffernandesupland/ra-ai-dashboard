import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Dashboard } from "@/components/dashboard";
import { Masthead, Nav } from "@/components/chrome";
import { prisma } from "@/lib/db";
import { getDashboardData, refreshNarratives } from "@/lib/snapshots";
import { isNarrativeConfigured } from "@/lib/narrative";
import type { Narratives } from "@/lib/narrative/types";
import { requireWorkspace } from "../../workspace";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string; snapshotId: string }>;
}) {
  const { slug, snapshotId } = await params;
  const { workspace, nav } = await requireWorkspace(slug);

  // Scoped to the workspace in the URL, so one customer's snapshot id cannot be
  // rendered under another customer's name.
  const snapshot = await prisma.snapshot.findFirst({
    where: { id: snapshotId, workspaceId: workspace.id },
    include: { _count: { select: { sourceFiles: true } } },
  });
  if (!snapshot) notFound();

  const data = await getDashboardData(snapshotId);
  if (!data) notFound();

  const narrativeEnabled = isNarrativeConfigured();

  async function rewrite() {
    "use server";
    await refreshNarratives(snapshotId);
    revalidatePath(`/w/${slug}/dashboard/${snapshotId}`);
  }

  // Server component rendered per request (force-dynamic), so reading the clock here
  // is intentional: staleness is relative to now, not to build time.
  // eslint-disable-next-line react-hooks/purity
  const staleDays = Math.floor((Date.now() - snapshot.windowEnd.getTime()) / 86_400_000);

  return (
    <main className="shell">
      <Nav active="dashboard" workspace={nav} />
      <Masthead
        title="The knowledge loop"
        meta={[
          { label: "Workspace", value: workspace.name },
          { label: "Window", value: `${data.window.start} → ${data.window.end}` },
          { label: "Sources", value: `${snapshot._count.sourceFiles} reports` },
          { label: "Portal groups", value: String(data.counts.portalGroups) },
          { label: "Collections", value: String(data.counts.collections) },
        ]}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <a className="btn btn-ghost" href={`/api/export/${snapshot.id}/html`}>
          Download standalone HTML
        </a>
        <a className="btn btn-ghost" href={`/api/export/${snapshot.id}/csv`}>
          Download CSV
        </a>
        <form action={rewrite}>
          <button className="btn btn-ghost" type="submit" disabled={!narrativeEnabled}>
            {data.narratives.source === "model" ? "Rewrite analysis" : "Write analysis with AI"}
          </button>
        </form>
        <span className="provenance">{describeNarratives(data.narratives, narrativeEnabled)}</span>
      </div>

      {staleDays > 8 ? (
        <div className="notice" style={{ marginTop: 16 }}>
          This snapshot&apos;s window closed {staleDays} days ago. A weekly refresh is due —{" "}
          <a href="/admin/upload">upload this week&apos;s exports</a>.
        </div>
      ) : null}

      {data.coverage.some((c) => !c.present) ? (
        <div className="notice" style={{ marginTop: 16 }}>
          {data.coverage.filter((c) => !c.present).length} report(s) missing from this snapshot.
          Affected panels render from what is present rather than substituting defaults.
        </div>
      ) : null}

      <Dashboard data={data} />
    </main>
  );
}

/** Says where the interpretive copy came from, so a reader never has to guess. */
function describeNarratives(narratives: Narratives, enabled: boolean): string {
  if (narratives.source !== "model") {
    if (narratives.error) return `Generation failed, so the deterministic copy stands. ${narratives.error}`;
    return enabled
      ? "Analysis is deterministic copy. Rewrite it against this week's figures whenever you like."
      : "Analysis is deterministic copy. Set OPENAI_API_KEY to let a model write it.";
  }
  const when = narratives.generatedAt
    ? new Date(narratives.generatedAt).toISOString().replace("T", " ").slice(0, 16)
    : "an earlier run";
  const rejected = narratives.rejected?.length
    ? ` ${narratives.rejected.length} passage(s) failed verification and kept the deterministic wording.`
    : "";
  return `Analysis written by ${narratives.model ?? "the model"} at ${when}.${rejected}`;
}
