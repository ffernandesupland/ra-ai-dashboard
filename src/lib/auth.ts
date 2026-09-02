import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "kl_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

// Embed tokens are long-lived URL tokens used when the dashboard is displayed
// inside a cross-site iframe (SameSite=lax cookies are not sent in that context).
// Expiry defaults to 7 days; override with EMBED_TOKEN_MAX_AGE_DAYS env var.
const EMBED_TOKEN_PURPOSE = "embed";
function embedMaxAgeMs(): number {
  const days = Number(process.env.EMBED_TOKEN_MAX_AGE_DAYS ?? 7);
  return (isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET must be set to at least 16 characters.");
  }
  return value;
}

/** Signed, expiring cookie value. The password itself is never stored client-side. */
export function issueToken(): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = String(expires);
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  return Number(payload) > Date.now();
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE)?.value);
}

export async function startSession() {
  const store = await cookies();
  store.set(COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

/**
 * Embed sessions get their own cookie rather than reusing kl_session: it has to be
 * SameSite=None to survive a cross-site iframe, and widening the real session cookie
 * that way would expose the whole app to cross-site requests.
 */
export const EMBED_COOKIE = "kl_embed";

export function issueEmbedToken(): string {
  const expires = Date.now() + embedMaxAgeMs();
  const payload = `${EMBED_TOKEN_PURPOSE}.${expires}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyEmbedToken(token: string | undefined): boolean {
  if (!token) return false;
  // format: "embed.<expires>.<signature>"
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [purpose, expiresStr, signature] = parts;
  if (purpose !== EMBED_TOKEN_PURPOSE) return false;
  const payload = `${purpose}.${expiresStr}`;
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(expiresStr) > Date.now();
}

/** Bearer-token guard for the automation ingest route. Disabled when no token is configured. */
export function checkIngestToken(header: string | null): boolean {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) return false;
  const provided = header?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
