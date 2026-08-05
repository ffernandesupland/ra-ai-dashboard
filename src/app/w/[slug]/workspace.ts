import { notFound } from "next/navigation";
import { getWorkspace, listWorkspaceOptions } from "@/lib/workspaces";
import type { NavWorkspace } from "@/components/chrome";

/**
 * Every page under /w/[slug] needs the same three things: the workspace itself,
 * a 404 when the slug is wrong, and the list of workspaces for the switcher.
 */
export async function requireWorkspace(slug: string) {
  const workspace = await getWorkspace(slug);
  if (!workspace) notFound();

  const options = await listWorkspaceOptions();
  const nav: NavWorkspace = { slug: workspace.slug, name: workspace.name, options };
  return { workspace, nav };
}
