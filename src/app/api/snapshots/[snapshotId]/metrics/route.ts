import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDashboardData } from "@/lib/snapshots";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const { snapshotId } = await params;
  const data = await getDashboardData(snapshotId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
