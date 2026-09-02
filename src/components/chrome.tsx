import Link from "next/link";
import { Logo } from "./logo";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { embedContext } from "@/lib/embed";

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
  const { embedded } = await embedContext();

  // The host portal supplies its own branding and its own tab navigation, so an
  // embedded dashboard shows none of its own. The marker stays as the hook the
  // embed stylesheet keys off.
  if (embedded) return <span className="embed-marker" hidden />;

  const base = `/w/${workspace.slug}`;
  const links = [
    { id: "dashboard", href: base, label: "Dashboard" },
    { id: "trends", href: `${base}/trends`, label: "Trends" },
    { id: "upload", href: `${base}/upload`, label: "Upload" },
    { id: "snapshots", href: `${base}/snapshots`, label: "Snapshots" },
    { id: "settings", href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav className="navlinks">
      <Link href="/" aria-label="All workspaces" className="brand">
        <Logo height={26} />
      </Link>
      <WorkspaceSwitcher current={workspace.slug} options={workspace.options} />
      {links.map((link) => (
        <Link key={link.id} href={link.href} data-active={active === link.id}>
          {link.label}
        </Link>
      ))}
      <form action="/api/auth/logout" method="post" style={{ marginLeft: "auto" }}>
        <button type="submit" className="signout">
          Sign out
        </button>
      </form>
    </nav>
  );
}

export async function Masthead({
  title,
  meta,
}: {
  title: string;
  meta: { label: string; value: string }[];
}) {
  const { embedded } = await embedContext();

  return (
    <header className="masthead">
      <div>
        <div className="eyebrow">AI knowledge operations</div>
        <h1>{title}</h1>
      </div>
      {/* Window, source counts and the like are operator detail; a portal reader
          gets the figures themselves. */}
      {embedded ? null : (
        <dl className="masthead-meta">
          {meta.map((item) => (
            <div key={item.label} style={{ display: "contents" }}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
