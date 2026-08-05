import Link from "next/link";
import { Logo } from "./logo";
import { WorkspaceSwitcher } from "./workspace-switcher";

export interface NavWorkspace {
  slug: string;
  name: string;
  options: { slug: string; name: string }[];
}

export function Nav({
  active,
  workspace,
}: {
  active: "dashboard" | "trends" | "upload" | "snapshots" | "settings";
  workspace: NavWorkspace;
}) {
  const base = `/w/${workspace.slug}`;
  const links = [
    { id: "dashboard", href: base, label: "Dashboard" },
    { id: "trends", href: `${base}/trends`, label: "Trends" },
    { id: "upload", href: `${base}/upload`, label: "Upload" },
    { id: "snapshots", href: `${base}/snapshots`, label: "Snapshots" },
    { id: "settings", href: `${base}/settings`, label: "Settings" },
  ] as const;

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
