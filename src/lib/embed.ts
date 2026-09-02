import { headers } from "next/headers";

/**
 * Embed state for the current request, set by proxy.ts when it authenticated the
 * request with an embed token. Reading it from headers rather than props means any
 * server component can ask without every page threading the flag down.
 */
export async function embedContext(): Promise<{ embedded: boolean }> {
  const store = await headers();
  return { embedded: store.get("x-embed") === "1" };
}
