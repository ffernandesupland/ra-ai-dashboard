"use client";

import { useRouter } from "next/navigation";

/**
 * Switching customer keeps you on the same kind of page where that is meaningful,
 * but snapshot ids do not survive the jump, so anything deeper lands on the
 * target workspace's own dashboard.
 */
export function WorkspaceSwitcher({
  current,
  options,
}: {
  current: string;
  options: { slug: string; name: string }[];
}) {
  const router = useRouter();

  return (
    <label className="wsw">
      <span className="sr-only">Workspace</span>
      <select
        value={current}
        onChange={(event) => {
          const slug = event.target.value;
          router.push(slug === "__all" ? "/" : `/w/${slug}`);
        }}
      >
        {options.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.name}
          </option>
        ))}
        <option value="__all">All workspaces…</option>
      </select>
    </label>
  );
}
