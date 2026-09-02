import { headers } from "next/headers";

/**
 * Embed state for the current request, set by proxy.ts when it authenticated the
 * request with an embed token. Reading it from headers rather than props means any
 * server component can ask without every page threading the flag down.
 */
export async function embedContext(): Promise<{ embedded: boolean; token?: string }> {
  const store = await headers();
  return {
    embedded: store.get("x-embed") === "1",
    token: store.get("x-embed-token") ?? undefined,
  };
}

/** Appends the embed token to an internal href so navigation survives blocked third-party cookies. */
export function withEmbedToken(href: string, token: string | undefined): string {
  if (!token) return href;
  return `${href}${href.includes("?") ? "&" : "?"}embed_token=${encodeURIComponent(token)}`;
}
