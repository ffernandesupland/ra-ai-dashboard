import { revalidatePath } from "next/cache";
import { Masthead, Nav } from "@/components/chrome";
import { prisma } from "@/lib/db";
import { readAssumptions, readReviewThreshold } from "@/lib/ingest/commit";
import { toJson } from "@/lib/json";
import { DEFAULT_ASSUMPTIONS, type AssumedConstants } from "@/lib/metrics/roi";
import { DEFAULT_REVIEW_THRESHOLD_DAYS } from "@/lib/metrics/types";
import { recomputeAll } from "@/lib/snapshots";
import { requireWorkspace } from "../workspace";

export const dynamic = "force-dynamic";

const FIELDS: { key: keyof AssumedConstants; label: string; hint: string; step: string }[] = [
  { key: "wordsArticle", label: "Words per solution", hint: "Assumed body length of a knowledge article.", step: "1" },
  { key: "wordsAnswer", label: "Words per AI answer", hint: "Log at generation to replace this with a measurement.", step: "1" },
  { key: "wpm", label: "Reading speed (wpm)", hint: "Derivable per customer once word count and dwell are logged together.", step: "1" },
  { key: "scanSec", label: "Seconds to scan and reject", hint: "Per retrieved-but-not-cited solution.", step: "1" },
  { key: "pVerify", label: "P(verify)", hint: "Share of answers where the user opens a cited solution anyway.", step: "0.05" },
  { key: "pThumbsUp", label: "P(thumbs up)", hint: "Placeholder until the feedback feed lands.", step: "0.05" },
  { key: "wastedSec", label: "Wasted seconds on a bad answer", hint: "Penalty applied to the thumbs-down share.", step: "5" },
];

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, nav } = await requireWorkspace(slug);
  const assumptions = readAssumptions(workspace.settings);
  const reviewThresholdDays = readReviewThreshold(workspace.settings);

  async function save(formData: FormData) {
    "use server";
    const next = { ...DEFAULT_ASSUMPTIONS };
    for (const field of FIELDS) {
      const raw = Number(formData.get(field.key));
      // Reject anything non-finite or negative rather than silently storing NaN.
      next[field.key] = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_ASSUMPTIONS[field.key];
    }
    const rawThreshold = Number(formData.get("reviewThresholdDays"));
    const nextThreshold =
      Number.isFinite(rawThreshold) && rawThreshold >= 1
        ? Math.round(rawThreshold)
        : DEFAULT_REVIEW_THRESHOLD_DAYS;
    await writeAssumptions(workspace.id, next, nextThreshold);
  }

  async function reset() {
    "use server";
    await writeAssumptions(workspace.id, DEFAULT_ASSUMPTIONS, DEFAULT_REVIEW_THRESHOLD_DAYS);
  }

  return (
    <main className="shell">
      <Nav active="settings" workspace={nav} />
      <Masthead title="ROI assumptions" meta={[{ label: "Workspace", value: workspace.name }]} />

      <p style={{ maxWidth: 640, color: "var(--slate)" }}>
        These are the constants the customer&apos;s telemetry cannot yet supply. They are kept
        separate from observed values so nothing here can be presented as measured. Changing a
        value recomputes every snapshot in <strong>{workspace.name}</strong>, which makes the whole
        model sweepable live. Other workspaces keep their own numbers.
      </p>

      <form action={save} className="card" style={{ marginTop: 18 }}>
        <div className="grid grid-2">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={field.key}>{field.label}</label>
              <input
                id={field.key}
                name={field.key}
                type="number"
                step={field.step}
                min="0"
                defaultValue={assumptions[field.key]}
              />
              <p style={{ fontSize: 12, marginTop: 4 }}>{field.hint}</p>
            </div>
          ))}
          <div>
            <label htmlFor="reviewThresholdDays">Review cadence (days)</label>
            <input
              id="reviewThresholdDays"
              name="reviewThresholdDays"
              type="number"
              step="1"
              min="1"
              defaultValue={reviewThresholdDays}
            />
            <p style={{ fontSize: 12, marginTop: 4 }}>
              A cited solution older than this is due for review. Anything fresher is within
              cadence and excluded from loop closure, so healthy content is not counted as debt.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn" type="submit">
            Save and recompute
          </button>
          <button className="btn btn-ghost" type="submit" formAction={reset}>
            Reset to defaults
          </button>
        </div>
      </form>
    </main>
  );
}

/** Re-reads settings inside the action so a concurrent edit is not clobbered wholesale. */
async function writeAssumptions(
  workspaceId: string,
  assumptions: AssumedConstants,
  reviewThresholdDays: number,
) {
  const current = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      settings: toJson({ ...(current.settings as object), assumptions, reviewThresholdDays }),
    },
  });
  await recomputeAll(workspaceId);
  revalidatePath("/", "layout");
}
