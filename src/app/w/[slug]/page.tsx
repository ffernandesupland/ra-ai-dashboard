import { redirect } from "next/navigation";
import { getLatestSnapshotId } from "@/lib/snapshots";
import { requireWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const snapshotId = await getLatestSnapshotId(workspace.id);
  redirect(snapshotId ? `/w/${slug}/dashboard/${snapshotId}` : `/w/${slug}/upload`);
}
