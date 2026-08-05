import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { formatPct } from "@/lib/format";
import { createWorkspace, listWorkspaces } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function Home() {
  const workspaces = await listWorkspaces();

  async function create(formData: FormData) {
    "use server";
    const workspace = await createWorkspace(String(formData.get("name") ?? ""));
    revalidatePath("/", "layout");
    redirect(`/w/${workspace.slug}/upload`);
  }

  return (
    <main className="shell">
      <nav className="navlinks">
        <Link href="/" aria-label="All workspaces" className="brand">
          <Logo height={26} />
        </Link>
        <form action="/api/auth/logout" method="post" style={{ marginLeft: "auto" }}>
          <button type="submit" className="signout">
            Sign out
          </button>
        </form>
      </nav>

      <header className="masthead">
        <div>
          <div className="eyebrow">AI knowledge operations</div>
          <h1>Workspaces</h1>
        </div>
        <dl className="masthead-meta">
          <div style={{ display: "contents" }}>
            <dt>Workspaces</dt>
            <dd>{workspaces.length}</dd>
          </div>
        </dl>
      </header>

      <p style={{ maxWidth: 640, color: "var(--slate)" }}>
        One workspace per customer. Uploads, snapshots and ROI assumptions all belong to the
        workspace they were made in, so figures from two customers can never be mixed into one
        dashboard.
      </p>

      {workspaces.length === 0 ? (
        <div className="notice" style={{ marginTop: 24 }}>
          No workspaces yet. Create one below, then upload that customer&apos;s exports into it.
        </div>
      ) : (
        <div className="grid grid-3" style={{ marginTop: 24 }}>
          {workspaces.map((workspace) => (
            <Link key={workspace.id} href={`/w/${workspace.slug}`} className="card ws-card">
              <h3 className="card-title">{workspace.slug}</h3>
              <div className="ws-name">{workspace.name}</div>
              {workspace.latestSnapshotId ? (
                <dl className="ws-figures">
                  <div>
                    <dt>Latest window</dt>
                    <dd>{workspace.windowEnd!.toISOString().slice(0, 10)}</dd>
                  </div>
                  <div>
                    <dt>Questions</dt>
                    <dd>{workspace.questionsAsked?.toLocaleString("en-GB") ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Answer rate</dt>
                    <dd>{workspace.answerRate === null ? "—" : formatPct(workspace.answerRate)}</dd>
                  </div>
                  <div>
                    <dt>Loop closure</dt>
                    <dd>{workspace.loopClosure === null ? "—" : formatPct(workspace.loopClosure)}</dd>
                  </div>
                </dl>
              ) : (
                <p style={{ marginBottom: 0 }}>No data yet. Open it to upload the first exports.</p>
              )}
              <div className="ws-foot">
                {workspace.snapshotCount} {workspace.snapshotCount === 1 ? "snapshot" : "snapshots"}
              </div>
            </Link>
          ))}
        </div>
      )}

      <form action={create} className="card" style={{ marginTop: 22, maxWidth: 480 }}>
        <h3 className="card-title">New workspace</h3>
        <label htmlFor="name">Customer name</label>
        <input id="name" name="name" required maxLength={80} placeholder="Northwind Traders" />
        <p style={{ fontSize: 12, marginTop: 4 }}>
          The URL slug is derived from this name. Renaming later does not change it, so the link
          you share stays valid.
        </p>
        <button className="btn" type="submit" style={{ marginTop: 12 }}>
          Create workspace
        </button>
      </form>
    </main>
  );
}
