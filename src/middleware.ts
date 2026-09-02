import { NextResponse, type NextRequest } from "next/server";
import { verifyToken, verifyEmbedToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // The automation ingest route carries its own bearer-token check.
  if (pathname === "/api/ingest") {
    return NextResponse.next();
  }

  if (verifyToken(request.cookies.get("kl_session")?.value)) {
    return NextResponse.next();
  }

  // Allow iframe embeds via a signed long-lived token passed as a query param.
  // Browsers don't send SameSite=lax cookies in cross-site iframes, so the
  // token is the only viable auth mechanism in that context.
  if (verifyEmbedToken(request.nextUrl.searchParams.get("embed_token") ?? undefined)) {
    return NextResponse.next();
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // node:crypto is used for HMAC verification, so this must not run on the edge runtime.
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
