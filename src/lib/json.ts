import type { Prisma } from "@/generated/prisma/client";

/**
 * Prisma's InputJsonValue only accepts types with an index signature, which excludes
 * every named `interface`. Our metric payloads are structurally JSON-safe by
 * construction, so this is the one place where that guarantee is asserted.
 */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
