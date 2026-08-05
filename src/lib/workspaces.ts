import { SnapshotStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  snapshotCount: number;
  latestSnapshotId: string | null;
  windowEnd: Date | null;
  questionsAsked: number | null;
  answerRate: number | null;
  loopClosure: number | null;
}

/** Name and slug only. Enough to render the switcher without loading every workspace's metrics. */
export async function listWorkspaceOptions() {
  return prisma.workspace.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getWorkspace(slug: string) {
  return prisma.workspace.findUnique({ where: { slug } });
}

/**
 * The index needs each workspace's headline figures. One query with a nested take:1
 * rather than a query per workspace, because this page grows with the customer list.
 */
export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const workspaces = await prisma.workspace.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { snapshots: { where: { status: SnapshotStatus.COMMITTED } } } },
      snapshots: {
        where: { status: SnapshotStatus.COMMITTED },
        orderBy: { windowEnd: "desc" },
        take: 1,
        select: { id: true, windowEnd: true, metrics: true },
      },
    },
  });

  return workspaces.map((workspace) => {
    const latest = workspace.snapshots[0];
    return {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      snapshotCount: workspace._count.snapshots,
      latestSnapshotId: latest?.id ?? null,
      windowEnd: latest?.windowEnd ?? null,
      questionsAsked: latest?.metrics?.questionsAsked ?? null,
      answerRate: latest?.metrics?.answerRate ?? null,
      loopClosure: latest?.metrics?.loopClosure ?? null,
    };
  });
}

/**
 * Slugs are derived rather than typed, because they end up in URLs a customer may
 * see. A numeric suffix settles collisions so two customers can share a name.
 */
export async function createWorkspace(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A workspace needs a name.");

  const base = slugify(trimmed);
  if (!base) throw new Error("That name has no characters that can go in a URL. Add a letter or a number.");

  const taken = new Set(
    (await prisma.workspace.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map(
      (w) => w.slug,
    ),
  );

  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;

  return prisma.workspace.create({ data: { slug, name: trimmed } });
}

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
