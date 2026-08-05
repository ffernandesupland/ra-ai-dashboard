import { isAuthenticated } from "@/lib/auth";
import { getDashboardData } from "@/lib/snapshots";
import type { DashboardData } from "@/lib/metrics/types";

/**
 * Guards against CSV injection: a cell starting with one of these is interpreted
 * as a formula by Excel and Sheets, so it gets a leading apostrophe.
 */
function cell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rows(data: DashboardData): (string | number)[][] {
  const out: (string | number)[][] = [["section", "metric", "value", "detail"]];
  const push = (section: string, metric: string, value: unknown, detail = "") =>
    out.push([section, metric, String(value ?? ""), detail]);

  push("window", "start", data.window.start);
  push("window", "end", data.window.end);
  push("window", "days", data.window.days);

  for (const [key, value] of Object.entries(data.counts)) push("counts", key, value);
  for (const kpi of data.kpis) push("kpi", kpi.label, `${kpi.value}${kpi.unit ?? ""}`);
  for (const position of data.retrieval.ranking.positions) push("rank", position.label, position.count);
  push("rank", "No usable hit", data.retrieval.ranking.noUsableHit);
  push("mrr", "Mean reciprocal rank, ranked questions", data.retrieval.ranking.mrr.value);
  for (const type of data.retrieval.searchTypes)
    push("search type", type.type, type.questions, `answer rate ${type.answerRate.toFixed(1)}%, mean MRR ${type.meanMrr ?? ""}`);
  for (const [key, value] of Object.entries(data.grounding)) push("grounding", key, value);

  push("serving", "p50 seconds", data.serving.p50);
  push("serving", "p90 seconds", data.serving.p90);
  push("serving", "max seconds", data.serving.max);
  push("serving", "sample size", data.serving.sampleSize);
  for (const band of data.serving.citationSpread) push("citation spread", band.label, band.value);
  for (const group of data.ttfaByPortalGroup) push("ttfa by portal group", group.label, group.value);

  for (const band of data.decay.bands) push("decay band", band.label, band.solutions, `${band.citations} citations`);
  push("decay", "median age days", data.decay.medianAgeDays ?? "");
  push("decay", "pct citations over 1 year", data.decay.pctCitationsOverYear.toFixed(1));
  for (const item of data.decay.worklist)
    push("worklist", item.title, item.citations, `${item.days}d old, solution ${item.solutionId}`);

  for (const [key, value] of Object.entries(data.repair)) {
    if (typeof value === "number") push("repair", key, value);
  }
  for (const feature of data.repair.aiFeatureMix) push("ai feature", feature.label, feature.value);
  for (const touched of data.repair.aiTouched)
    push("ai touched", touched.title, touched.aiActions, `${touched.status}, solution ${touched.solutionId}`);

  for (const theme of data.demand.themes)
    push("demand theme", theme.theme, theme.questions, `answer rate ${theme.answerRate.toFixed(1)}%${theme.qaNoise ? ", QA noise" : ""}`);
  for (const row of data.demand.consistency)
    push("consistency", row.query, row.asks, `${row.answered} answered, ${row.answerRate.toFixed(1)}%`);
  for (const point of data.trend) push("trend", point.date, point.answerRate.toFixed(1), `${point.questions} questions`);
  for (const item of data.repairQueue) push("repair queue", item.candidate, item.status, item.signal);

  for (const [key, value] of Object.entries(data.roi.observed)) push("roi observed", key, value);
  for (const [key, value] of Object.entries(data.roi.assumed)) push("roi assumed", key, value);
  for (const step of data.roi.waterfall) push("roi waterfall", step.label, step.value.toFixed(2), "seconds");
  push("roi", "net minutes per answered question", data.roi.netMinutes.toFixed(2));
  for (const view of data.roi.views) {
    push("roi view", view.title, view.state, view.formula.replace(/\s+/g, " "));
    for (const input of view.inputs) push("roi input", `${view.title} — ${input.field}`, input.status, input.source);
  }

  for (const report of data.coverage) push("coverage", report.reportType, report.present ? "present" : "missing");
  return out;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  if (!(await isAuthenticated())) return new Response("Unauthorised", { status: 401 });

  const { snapshotId } = await params;
  const data = await getDashboardData(snapshotId);
  if (!data) return new Response("Not found", { status: 404 });

  const csv = rows(data)
    .map((row) => row.map(cell).join(","))
    .join("\r\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="knowledge-loop-${data.window.start}-to-${data.window.end}.csv"`,
      "cache-control": "no-store",
    },
  });
}
