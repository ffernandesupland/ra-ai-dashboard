import { isAuthenticated } from "@/lib/auth";
import { renderStandaloneHtml } from "@/lib/export/html";
import { prisma } from "@/lib/db";
import { getDashboardData } from "@/lib/snapshots";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  if (!(await isAuthenticated())) return new Response("Unauthorised", { status: 401 });

  const { snapshotId } = await params;
  const snapshot = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
    include: { workspace: true },
  });
  if (!snapshot) return new Response("Not found", { status: 404 });

  const data = await getDashboardData(snapshotId);
  if (!data) return new Response("Not found", { status: 404 });

  const html = renderStandaloneHtml(data, snapshot.workspace.name);
  const filename = `${snapshot.workspace.slug}-knowledge-loop-${data.window.start}-to-${data.window.end}.html`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
