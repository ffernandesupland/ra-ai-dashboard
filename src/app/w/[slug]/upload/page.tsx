import { Masthead, Nav } from "@/components/chrome";
import { EXPECTED_REPORT_COUNT } from "@/lib/reports/definitions";
import { requireWorkspace } from "../workspace";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function UploadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, nav } = await requireWorkspace(slug);

  return (
    <main className="shell">
      <Nav active="upload" workspace={nav} />
      <Masthead
        title="Upload exports"
        meta={[
          { label: "Workspace", value: workspace.name },
          { label: "Expected", value: `${EXPECTED_REPORT_COUNT} reports` },
          { label: "Cadence", value: "Weekly" },
        ]}
      />
      <p style={{ maxWidth: 640, color: "var(--slate)" }}>
        Nothing is written until you commit. The preview shows the parsed window, which reports
        were recognised, row counts and any coercion warnings. This upload lands in{" "}
        <strong>{workspace.name}</strong> and nowhere else.
      </p>
      <UploadForm expectedReports={EXPECTED_REPORT_COUNT} slug={slug} />
    </main>
  );
}
