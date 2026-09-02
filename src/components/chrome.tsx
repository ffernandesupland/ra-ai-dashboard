import Link from "next/link";
import { Logo } from "./logo";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { embedContext, withEmbedToken } from "@/lib/embed";

export interface NavWorkspace {
  slug: string;
  name: string;
  options: { slug: string; name: string }[];
}

export async function Nav({
  active,
  workspace,
}: {
  active: "dashboard" | "trends" | "upload" | "snapshots" | "settings";
  workspace: NavWorkspace;
}) {
  const { embedded, token } = await embedContext();
  const base = `/w/${workspace.slug}`;
  const links = [
    { id: "dashboard", href: base, label: "Dashboard" },
    { id: "trends", href: `${base}/trends`, label: "Trends" },
    { id: "upload", href: `${base}/upload`, label: "Upload" },
    { id: "snapshots", href: `${base}/snapshots`, label: "Snapshots" },
    { id: "settings", href: `${base}/settings`, label: "Settings" },
    // Both are blocked for embed sessions, so offering them would only 403.
  ].filter((link) => !embedded || (link.id !== "upload" && link.id !== "settings"));

  return (
    <nav className="navlinks">
      {/* Hook for the embed stylesheet: the host portal owns the page canvas. */}
      {embedded ? <span className="embed-marker" hidden /> : null}
      {embedded ? (
        <span className="brand">
          <Logo height={26} />
        </span>
      ) : (
        <Link href="/" aria-label="All workspaces" className="brand">
          <Logo height={26} />
        </Link>
      )}
      {embedded ? null : (
        <WorkspaceSwitcher current={workspace.slug} options={workspace.options} />
      )}
      {links.map((link) => (
        <Link
          key={link.id}
          href={withEmbedToken(link.href, token)}
          data-active={active === link.id}
        >
          {link.label}
        </Link>
      ))}
      {embedded ? null : (
        <form action="/api/auth/logout" method="post" style={{ marginLeft: "auto" }}>
          <button type="submit" className="signout">
            Sign out
          </button>
        </form>
      )}
    </nav>
  );
}

export function Masthead({
  title,
  meta,
}: {
  title: string;
  meta: { label: string; value: string }[];
}) {
  return (
    <header className="masthead">
      <div>
        <div className="eyebrow">AI knowledge operations</div>
        <h1>{title}</h1>
      </div>
      <dl className="masthead-meta">
        {meta.map((item) => (
          <div key={item.label} style={{ display: "contents" }}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
