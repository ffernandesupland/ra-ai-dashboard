import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { esc, renderStandaloneHtml } from "@/lib/export/html";
import { buildDashboardData } from "@/lib/metrics";
import { prepareBatch, type UploadInput } from "@/lib/ingest/prepare";

const FIXTURE_DIR = path.resolve(__dirname, "../../../..");

function loadFixtures(): UploadInput[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => ({ name, content: readFileSync(path.join(FIXTURE_DIR, name), "utf8") }));
}

const batch = prepareBatch(loadFixtures());
const data = buildDashboardData(batch.dataset!);
const html = renderStandaloneHtml(data, "Reference QA workspace");

describe("standalone HTML export", () => {
  it("emits a complete, self-contained document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    // No build step and no runtime dependency other than the optional font request.
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain("<style>");
  });

  it("renders all five tabs with matching panels", () => {
    const tabs = html.match(/<button role="tab"/g) ?? [];
    const panels = html.match(/<div role="tabpanel"/g) ?? [];
    expect(tabs).toHaveLength(5);
    expect(panels).toHaveLength(5);
    for (const id of ["overview", "demand", "quality", "health", "roi"]) {
      expect(html).toContain(`id="panel-${id}"`);
      expect(html).toContain(`aria-controls="panel-${id}"`);
    }
  });

  it("carries the headline figures from the computed metrics", () => {
    expect(html).toContain(`${data.window.start} → ${data.window.end}`);
    expect(html).toContain(String(data.counts.solutionsCited));
    expect(html).toContain(String(data.counts.questionsAsked));
  });

  it("draws the repair arc as broken", () => {
    expect(html).toContain('stroke-dasharray="5 7"');
  });

  it("escapes every interpolated value", () => {
    expect(esc(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    // Only our own markup may open a tag; no fixture text should have leaked one.
    const scriptTags = html.match(/<script/g) ?? [];
    expect(scriptTags).toHaveLength(1);
  });
});
