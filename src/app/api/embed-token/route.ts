import { NextResponse } from "next/server";
import { isAuthenticated, issueEmbedToken } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ token: issueEmbedToken() });
}
