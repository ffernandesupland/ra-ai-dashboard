import { NextResponse, type NextRequest } from "next/server";
import { verifyToken, verifyEmbedToken, SESSION_COOKIE, EMBED_COOKIE } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

/**
 * An embed session is read-only. Its cookie is SameSite=None so it survives the
 * cross-site iframe, which also means a third-party page could drive requests with
 * it, so anything that writes or ends the session stays out of reach.
 */
const EMBED_DENIED = /\/upload|\/settings|^\/api\/auth|^\/api\/ingest/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // The automation ingest route carries its own bearer-token check.
  if (pathname === "/api/ingest") {
    return NextResponse.next();
  }

  if (verifyToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // The token arrives in the iframe's src on first load, then from the cookie the
  // response below sets, so internal navigation no longer needs it in every URL.
  const fromUrl = request.nextUrl.searchParams.get("embed_token") ?? undefined;
  const fromCookie = request.cookies.get(EMBED_COOKIE)?.value;
  const embedToken = verifyEmbedToken(fromUrl)
    ? fromUrl
    : verifyEmbedToken(fromCookie)
      ? fromCookie
      : undefined;

  if (embedToken) {
    if (request.method !== "GET" || EMBED_DENIED.test(pathname)) {
      return new NextResponse("Not available in an embedded dashboard.", { status: 403 });
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-embed", "1");

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    // Partitioned keeps the cookie usable in browsers that drop third-party
    // cookies, which is every current one by default.
    response.cookies.set(EMBED_COOKIE, embedToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      partitioned: true,
      path: "/",
    });
    return response;
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
