import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { commitBatch } from "../src/lib/ingest/commit";
import { prepareBatch, type UploadInput } from "../src/lib/ingest/prepare";
import { getDefaultWorkspace } from "../src/lib/snapshots";

/** Loads the reference exports sitting at the repository root. */
const SOURCE_DIR = process.env.SEED_DIR ?? path.resolve(import.meta.dirname, "../..");

function loadCsvs(dir: string): UploadInput[] {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => ({ name, content: readFileSync(path.join(dir, name), "utf8") }));
}

async function main() {
  const inputs = loadCsvs(SOURCE_DIR);
  if (inputs.length === 0) {
    console.error(`No CSV exports found in ${SOURCE_DIR}`);
    process.exit(1);
  }

  const batch = prepareBatch(inputs);
  if (batch.errors.length > 0) {
    for (const error of batch.errors) console.error(`  ✗ ${error.file}: ${error.message}`);
    process.exit(1);
  }

  const workspace = await getDefaultWorkspace();
  const snapshot = await commitBatch(batch, {
    workspaceId: workspace.id,
    uploadedBy: "seed",
    label: "Reference QA data",
    notes: "Seeded from the exports at the repository root.",
    replaceExisting: true,
  });

  console.log(
    `Seeded snapshot ${snapshot.id} — ${batch.files.length} reports, ${batch.totalRows} rows, ` +
      `${batch.windowStart!.toISOString().slice(0, 10)} → ${batch.windowEnd!.toISOString().slice(0, 10)}`,
  );
  for (const file of batch.files) {
    const warned = file.warnings.length ? ` (${file.warnings.length} warning(s))` : "";
    console.log(`  · ${file.label}: ${file.rowCount} rows${warned}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
