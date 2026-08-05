import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Chip } from "@/components/charts";
import { formatPct } from "@/lib/format";
import { Masthead, Nav } from "@/components/chrome";
import { prisma } from "@/lib/db";
import { listSnapshots, recomputeMetrics, refreshNarratives } from "@/lib/snapshots";
import { isNarrativeConfigured } from "@/lib/narrative";
import { requireWorkspace } from "../workspace";

export const dynamic = "force-dynamic";

export default async function SnapshotsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, nav } = await requireWorkspace(slug);
  const snapshots = await listSnapshots(workspace.id);
  const narrativeEnabled = isNarrativeConfigured();

  async function recompute(formData: FormData) {
    "use server";
    await recomputeMetrics(String(formData.get("snapshotId")));
    revalidatePath(`/w/${slug}/snapshots`);
  }

  async function rewrite(formData: FormData) {
    "use server";
    await refreshNarratives(String(formData.get("snapshotId")));
    revalidatePath("/", "layout");
  }

  async function remove(formData: FormData) {
    "use server";
    // Scoped by workspace so a stale form from another tab cannot delete another
    // customer's snapshot.
    await prisma.snapshot.deleteMany({
      where: { id: String(formData.get("snapshotId")), workspaceId: workspace.id },
    });
    revalidatePath("/", "layout");
    redirect(`/w/${slug}/snapshots`);
  }

  return (
    <main className="shell">
      <Nav active="snapshots" workspace={nav} />
      <Masthead
        title="Snapshots"
        meta={[
          { label: "Workspace", value: workspace.name },
          { label: "Committed", value: String(snapshots.length) },
          {
            label: "Latest window",
            value: snapshots[0]
              ? snapshots[0].windowEnd.toISOString().slice(0, 10)
              : "none",
          },
        ]}
      />

      {snapshots.length === 0 ? (
        <p style={{ marginTop: 24 }}>
          No snapshots yet. <Link href={`/w/${slug}/upload`}>Upload the first set of exports</Link>.
        </p>
      ) : (
        <div className="card" style={{ marginTop: 24 }}>
          <table>
            <thead>
              <tr>
                <th>Window</th>
                <th>Label</th>
                <th className="num">Reports</th>
                <th className="num">Questions</th>
                <th className="num">Answer rate</th>
                <th className="num">Loop closure</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/w/${slug}/dashboard/${snapshot.id}`}>
                      {snapshot.windowStart.toISOString().slice(0, 10)} →{" "}
                      {snapshot.windowEnd.toISOString().slice(0, 10)}
                    </Link>
                  </td>
                  <td>{snapshot.label ?? "—"}</td>
                  <td className="num">
                    {snapshot._count.sourceFiles < 15 ? (
                      <Chip kind="warm">{snapshot._count.sourceFiles}</Chip>
                    ) : (
                      snapshot._count.sourceFiles
                    )}
                  </td>
                  <td className="num">{snapshot.metrics?.questionsAsked ?? "—"}</td>
                  <td className="num">
                    {snapshot.metrics ? formatPct(snapshot.metrics.answerRate) : "—"}
                  </td>
                  <td className="num">
                    {snapshot.metrics ? formatPct(snapshot.metrics.loopClosure) : "—"}
                  </td>
                  <td className="num">
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <form action={recompute}>
                        <input type="hidden" name="snapshotId" value={snapshot.id} />
                        <button className="btn btn-ghost" style={{ padding: "5px 9px" }} type="submit">
                          Recompute
                        </button>
                      </form>
                      <form action={rewrite}>
                        <input type="hidden" name="snapshotId" value={snapshot.id} />
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "5px 9px" }}
                          type="submit"
                          disabled={!narrativeEnabled}
                          title={
                            narrativeEnabled
                              ? "Rewrite the interpretive copy against these figures"
                              : "Set OPENAI_API_KEY to enable"
                          }
                        >
                          Rewrite
                        </button>
                      </form>
                      <form action={remove}>
                        <input type="hidden" name="snapshotId" value={snapshot.id} />
                        <button className="btn btn-danger" style={{ padding: "5px 9px" }} type="submit">
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
