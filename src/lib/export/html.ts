import type { BarDatum, DashboardData, LoopStage, MrrScore } from "@/lib/metrics/types";
import { MRR_SCALE } from "@/lib/metrics/types";
import { EXPORT_CSS, EXPORT_LOGO } from "./styles";

/**
 * Renders the dashboard as one self-contained HTML file: no build step,
 * no chart library, no CDN beyond an optional font request with a system fallback.
 * Opens from a local path and works on a projector with unreliable wifi.
 */
export function renderStandaloneHtml(data: DashboardData, workspaceName: string): string {
  const panels = [
    { id: "overview", label: "Overview", body: overviewPanel(data) },
    { id: "demand", label: "Demand", body: demandPanel(data) },
    { id: "quality", label: "Answer quality", body: qualityPanel(data) },
    { id: "health", label: "Knowledge health", body: healthPanel(data) },
    { id: "roi", label: "ROI", body: roiPanel(data, workspaceName) },
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The knowledge loop — ${esc(data.window.start)} to ${esc(data.window.end)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<main class="shell">
  <div class="brandbar">${EXPORT_LOGO}</div>
  <header class="masthead">
    <div>
      <div class="eyebrow">AI knowledge operations</div>
      <h1>The knowledge loop</h1>
    </div>
    <div class="meta">
      WINDOW <b>${esc(data.window.start)} → ${esc(data.window.end)}</b><br>
      SOURCES <b>${data.coverage.filter((c) => c.present).length} of ${data.coverage.length} reports</b><br>
      PORTAL GROUPS <b>${data.counts.portalGroups}</b><br>
      COLLECTIONS <b>${data.counts.collections}</b>
    </div>
  </header>

  <div class="tabbar" role="tablist" aria-label="Dashboard sections">
    ${panels
      .map(
        (panel, index) =>
          `<button role="tab" id="tab-${panel.id}" aria-controls="panel-${panel.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${esc(panel.label)}</button>`,
      )
      .join("")}
  </div>

  ${panels
    .map(
      (panel, index) =>
        `<div role="tabpanel" id="panel-${panel.id}" aria-labelledby="tab-${panel.id}"${index === 0 ? "" : " hidden"}>${panel.body}</div>`,
    )
    .join("\n")}
</main>

<script>
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fill(panel) {
    var bars = panel.querySelectorAll('.bar-fill');
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      bar.style.width = '0%';
      (function (node) {
        var apply = function () { node.style.width = node.getAttribute('data-w') + '%'; };
        reduce ? apply() : requestAnimationFrame(function () { requestAnimationFrame(apply); });
      })(bar);
    }
  }

  function select(index) {
    tabs.forEach(function (tab, i) {
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      var on = i === index;
      tab.setAttribute('aria-selected', on);
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
      if (on) fill(panel);
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { select(index); });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      var next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(next);
      tabs[next].focus();
    });
  });

  select(0);
})();
</script>
</body>
</html>`;
}

/* ---------------------------------- panels --------------------------------- */

function overviewPanel(data: DashboardData): string {
  return `
<section class="kpis">
  ${data.kpis
    .map(
      (kpi) => `<div class="kpi">
      <div class="kpi-value ${kpi.tone === "signal" ? "v-signal" : kpi.tone === "garnet" ? "v-garnet" : ""}">${esc(kpi.value)}${kpi.unit ? `<span>${esc(kpi.unit)}</span>` : ""}</div>
      <div class="kpi-label">${esc(kpi.label)}</div>
    </div>`,
    )
    .join("")}
</section>
<section class="hero">
  ${loopSvg(data.loop, pct(data.counts.answerRate), data.window.label)}
  <div>
    <div class="eyebrow">The argument</div>
    <h2>${esc(data.narratives.thesis)}</h2>
    <p>Gen Answers serves answers from solutions. Those solutions age. Solution Manager repairs solutions. When the two never meet, the knowledge base decays under live load while authoring effort lands somewhere else.</p>
    <div class="callout">${esc(data.narratives.loopVerdict)}</div>
  </div>
</section>`;
}

function demandPanel(data: DashboardData): string {
  const peak = Math.max(1, ...data.demand.themes.map((t) => t.questions));
  return `
<section class="stage">
  ${stageHead("01 / Ask", "Demand", `${data.counts.questionsAsked} questions · ${data.counts.distinctQuestions} distinct · ${data.counts.portalUsers} users`)}
  <div class="grid grid-2">
    <div class="card">
      <h3 class="card-title">Demand concentration</h3>
      ${data.demand.themes
        .map((theme) =>
          bar({
            label: theme.qaNoise ? `${theme.theme} · QA noise` : theme.theme,
            value: theme.questions,
            pct: (theme.questions / peak) * 100,
            meta: pct(theme.answerRate),
            tone: heat(theme.answerRate),
          }),
        )
        .join("")}
      <p>Bar colour encodes answer rate, length encodes volume. Rows flagged QA noise are smoke-test traffic, surfaced rather than hidden.</p>
    </div>
    <div class="card">
      <h3 class="card-title">Answer consistency</h3>
      ${data.demand.consistency
        .map((row) =>
          bar(
            { label: row.query, value: row.answerRate, pct: row.answerRate, meta: `${row.asks} asks`, tone: heat(row.answerRate) },
            pct(row.answerRate),
          ),
        )
        .join("")}
      <div class="callout">${esc(data.narratives.consistency)}</div>
    </div>
  </div>
</section>`;
}

function mrrScale(score: MrrScore, caption: string): string {
  const bands = MRR_SCALE.map(
    (b) => `<div class="scale-band sb-${b.band}" style="width:${(b.to - b.from) * 100}%"></div>`,
  ).join("");
  const legend = MRR_SCALE.map(
    (b) => `<div class="scale-seg${b.band === score.band ? " is-on" : ""}" style="width:${(b.to - b.from) * 100}%">
      <span class="scale-seg-label">${esc(b.label)}</span><span class="scale-seg-range">${b.from.toFixed(1)}–${b.to.toFixed(1)}</span>
    </div>`,
  ).join("");
  const left = Math.min(100, Math.max(0, score.value * 100));
  return `
<div class="scale">
  <div class="scale-head"><span class="scale-value">${score.value.toFixed(2)}</span>${chip(
    score.band === "needs-improvement" ? "hot" : score.band === "moderate" ? "warm" : "ok",
    score.bandLabel,
  )}</div>
  <div class="scale-track">${bands}<div class="scale-mark" style="left:${left}%"></div></div>
  <div class="scale-legend">${legend}</div>
  <p class="scale-cap">${esc(caption)}</p>
</div>`;
}

function qualityPanel(data: DashboardData): string {
  const { ranking } = data.retrieval;
  const rankPeak = Math.max(1, ...ranking.positions.map((p) => p.count));
  const gPct = data.grounding.unanswered
    ? (data.grounding.failuresWithContext / data.grounding.unanswered) * 100
    : 0;
  return `
<section class="stage">
  ${stageHead("02 / Retrieve", "Ranking and mode", `${data.counts.questionsAsked} questions`)}
  <div class="grid grid-2">
    <div class="card"><h3 class="card-title">Where the answer ranked</h3>
      ${ranking.positions
        .map((p) =>
          bar({
            label: p.label,
            value: p.count,
            pct: (p.count / rankPeak) * 100,
            meta: `${pct(p.pctOfRanked)} · ${pct(p.cumulativePct)} cumulative`,
            tone: p.tone,
          }),
        )
        .join("")}
      <p>Positions cover the ${ranking.ranked} questions that returned something to rank. ${ranking.noUsableHit} of ${ranking.scored} returned no usable hit at all and sit outside this chart.</p>
    </div>
    <div class="card"><h3 class="card-title">Ranking quality (MRR)</h3>
      ${mrrScale(ranking.mrr, `Across the ${ranking.ranked} questions where retrieval returned something. Questions that returned nothing are a coverage problem, not a ranking one, so they are left out rather than scored as zero.`)}
      <p>${esc(data.narratives.searchMode)}</p>
    </div>
  </div>
  <div class="grid grid-2">
    <div class="card"><h3 class="card-title">Search mode efficacy</h3>
      ${data.retrieval.searchTypes
        .map((t) =>
          bar(
            {
              label: t.type,
              value: t.answerRate,
              pct: t.answerRate,
              meta: `${t.questions} asks · MRR ${t.meanMrr?.toFixed(2) ?? "—"} · top 3 ${t.top3Pct === null ? "—" : pct(t.top3Pct)}`,
              tone: heat(t.answerRate),
            },
            pct(t.answerRate),
          ),
        )
        .join("")}
      <p>Bar length is answer rate. MRR and top-3 sit in the meta line because a mode can rank well on the few questions it lands and still answer almost nothing.</p>
    </div>
    <div class="card"><h3 class="card-title">Answer rate by day</h3>
      ${lineSvg(data.trend)}
      <p>Only days present in the export are plotted. A gap in the window stays a gap.</p>
    </div>
  </div>
</section>
<section class="stage">
  ${stageHead("03 / Ground", "Grounding", `${data.grounding.failuresWithContext} of ${data.grounding.unanswered} failures had candidates`)}
  <div class="card">
    <div class="split"><div class="t-garnet" style="width:${gPct.toFixed(2)}%"></div><div class="t-slate" style="width:${(100 - gPct).toFixed(2)}%"></div></div>
    <p>${esc(data.narratives.grounding)}</p>
  </div>
</section>
<section class="stage">
  ${stageHead("04 / Serve", "Speed and spread", `p50 ${data.serving.p50}s · p90 ${data.serving.p90}s · n=${data.serving.sampleSize}`)}
  <div class="grid grid-2">
    <div class="card"><h3 class="card-title">Time to first answer by portal group</h3>
      ${data.ttfaByPortalGroup.map((b) => bar(b, `${b.value}s`)).join("")}
      <p>${esc(data.narratives.serveSpeed)}</p>
    </div>
    <div class="card"><h3 class="card-title">Citation spread</h3>
      ${data.serving.citationSpread.map((b) => bar(b)).join("")}
      <p>${data.counts.totalCitations} citations over ${data.counts.solutionsCited} solutions.</p>
      <p>${esc(data.narratives.citationSpread)}</p>
    </div>
  </div>
</section>`;
}

function healthPanel(data: DashboardData): string {
  const { decay, repair } = data;
  const solutionPeak = Math.max(1, ...decay.bands.map((b) => b.solutions));
  const aiShare = repair.refreshedInWindow ? (repair.aiAssistedCount / repair.refreshedInWindow) * 100 : 0;
  return `
<section class="stage">
  ${stageHead("05 / Decay", "Knowledge decay under load", `${pct(decay.pctCitationsOverYear)} of citations from articles over 1 year old`)}
  <div class="grid grid-2">
    <div class="card"><h3 class="card-title">Staleness of cited solutions</h3>
      ${decay.bands
        .map((b) => bar({ label: b.label, value: b.solutions, pct: (b.solutions / solutionPeak) * 100, meta: `${b.citations} citations`, tone: b.tone }))
        .join("")}
      <p>${esc(data.narratives.decay)}</p>
    </div>
    <div class="card"><h3 class="card-title">Repair worklist — citations × log staleness</h3>
      ${table(
        ["Solution", "Cites", "Age"],
        decay.worklist.map((w) => [esc(w.title), String(w.citations), chip(w.chip, `${w.days}d`)]),
        [false, true, true],
      )}
      <p>${esc(data.narratives.worklistPriority)}</p>
    </div>
  </div>
</section>
<section class="stage">
  ${stageHead("06 / Repair", "Loop closure", `${pct(repair.reviewClosure)} of ${repair.dueForReview} solutions due for review were refreshed · ${pct(repair.reviewClosureWeighted)} citation-weighted · ${repair.reviewThresholdDays}-day cadence`)}
  <div class="grid grid-3">
    <div class="card"><h3 class="card-title">Loop closure</h3>
      ${bar({ label: `Refreshed in window (${repair.windowDays}d)`, value: repair.refreshedInWindow, pct: (repair.refreshedInWindow / repair.denominator) * 100, tone: "signal" })}
      ${bar({ label: "Refreshed in 30 days", value: repair.refreshedIn30Days, pct: (repair.refreshedIn30Days / repair.denominator) * 100, tone: "ochre" })}
      ${bar({ label: "Untouched over 1 year", value: repair.untouchedOverYear, pct: (repair.untouchedOverYear / repair.denominator) * 100, tone: "garnet" })}
      <p>Closure is scored only against the ${repair.dueForReview} solutions that needed attention — ${repair.overdueForReview} overdue past the ${repair.reviewThresholdDays}-day cadence plus ${repair.refreshedInWindow} refreshed in-window. The ${repair.onCadence} still within cadence are healthy, so KCS treats them as done, not debt. Any edit counts, by any method.</p>
    </div>
    <div class="card"><h3 class="card-title">AI-assisted share of repair</h3>
      <div class="split"><div class="t-signal" style="width:${aiShare.toFixed(2)}%"></div><div class="t-slate" style="width:${(100 - aiShare).toFixed(2)}%"></div></div>
      <p><strong>${repair.aiAssistedCount} of ${repair.refreshedInWindow}</strong> repairs were AI-assisted. This sits underneath loop closure, never above it.</p>
      <h3 class="card-title" style="margin-top:18px">AI feature mix</h3>
      ${repair.aiFeatureMix.map((b) => bar(b)).join("")}
    </div>
    <div class="card"><h3 class="card-title">Where AI effort went</h3>
      ${table(
        ["Solution", "Actions", "Status"],
        repair.aiTouched.map((r) => [esc(r.title), String(r.aiActions), chip(r.chip, r.status)]),
        [false, true, true],
      )}
      <p>${esc(data.narratives.aiPublishing)}</p>
    </div>
  </div>
</section>
<section class="stage">
  <div class="card"><h3 class="card-title">The repair queue</h3>
    ${table(
      ["Candidate", "Signal", "Status"],
      data.repairQueue.map((q) => [esc(q.candidate), esc(q.signal), chip(q.chip, q.status)]),
      [false, false, true],
    )}
    <p>${esc(data.narratives.repairQueue)}</p>
  </div>
</section>`;
}

function roiPanel(data: DashboardData, workspaceName: string): string {
  const { roi } = data;
  const chipFor = (status: string) => (status === "live" ? "ok" : status === "partial" ? "warm" : "hot");
  const live = roi.views.filter((v) => v.state === "modelled").length;
  return `
<section class="stage">
  ${stageHead("ROI", "Modelled, not measured", `${live} of ${roi.views.length} views computable today`)}
  <div class="card">
    <div class="eyebrow">Modelled, not measured</div>
    <h2 style="font-family:var(--cond);font-size:28px;margin:8px 0 10px">${roi.views.length} ROI views. ${live} ${live === 1 ? "is" : "are"} computable, ${roi.views.length - live} ${roi.views.length - live === 1 ? "is" : "are"} waiting on data.</h2>
    <p>Every figure derives from a stated formula. Observed inputs come straight from the exports; the remaining inputs are named assumptions, shown beside each result and editable, never presented as measured.</p>
  </div>
  <div class="card" style="margin-top:18px">
    <h3 class="card-title">View 1 — Time saved reading</h3>
    ${roi.waterfall.map((b) => bar(b, `${(b.value / 60).toFixed(1)}m`)).join("")}
    <p>Net <strong>${roi.netMinutes.toFixed(1)} minutes</strong> saved per answered question. The counterfactual models the observed path — open the ones that would have been cited, scan and reject the rest.</p>
    <div class="grid grid-2" style="margin-top:14px">
      <div><h3 class="card-title">Observed</h3><ul class="inputlist">
        ${Object.entries(roi.observed).map(([k, v]) => `<li>${chip("ok", "live")}<strong>${esc(k)}</strong><span class="src">${v.toFixed(2)}</span></li>`).join("")}
      </ul></div>
      <div><h3 class="card-title">Assumed</h3><ul class="inputlist">
        ${Object.entries(roi.assumed).map(([k, v]) => `<li>${chip("warm", "assumed")}<strong>${esc(k)}</strong><span class="src">${v}</span></li>`).join("")}
      </ul></div>
    </div>
  </div>
  ${roi.views
    .map(
      (view, index) => `<div class="card" style="margin-top:18px">
    <h3 class="card-title">View ${index + 1} — ${esc(view.title)}</h3>
    ${
      view.result
        ? `<div style="margin:6px 0 14px">
      <div style="font-family:var(--cond);font-size:26px;line-height:1.1">${esc(view.result.headline)}</div>
      <p style="margin:4px 0 12px;color:var(--muted)">${esc(view.result.subhead)}</p>
      ${view.result.bars.map((b) => bar(b, b.meta ?? "")).join("")}
      <ul class="inputlist" style="margin-top:12px">
        ${view.result.basis.map((b) => `<li>${chip(b.kind === "observed" ? "ok" : "warm", b.kind)}<strong>${esc(b.label)}</strong><span class="src">${esc(b.value)}</span></li>`).join("")}
      </ul>
    </div>`
        : ""
    }
    <pre class="formula">${esc(view.formula)}</pre>
    <ul class="inputlist">
      ${view.inputs.map((input) => `<li>${chip(chipFor(input.status), input.status)}<strong>${esc(input.field)}</strong><span class="src">${esc(input.source)}</span></li>`).join("")}
    </ul>
    <p style="margin-top:12px">${esc(view.note)}</p>
  </div>`,
    )
    .join("")}
  <div class="footer">
    <div class="footer-grid">
      <div><h3>Deflection</h3><p>${
        data.counts.referenceSolutionViews === 0
          ? "Reference solution views logged 0 for every day in the window."
          : `Reference solution views logged ${data.counts.referenceSolutionViews.toLocaleString("en-GB")} in the window, but with no click-through or session-exit signal they cannot be tied to an avoided ticket.`
      }</p></div>
      <div><h3>Answer feedback</h3><p>No thumbs signal. The answer rate is a system verdict, not a customer one.</p></div>
      <div><h3>Ticket linkage</h3><p>No join from a session to a case. The only credible route to a dollar figure.</p></div>
      <div><h3>Author time saved</h3><p>AI actions are counted, not timed.</p></div>
    </div>
    <p class="disclaimer">Workspace ${esc(workspaceName)} · window ${esc(data.window.start)} → ${esc(data.window.end)} (${data.window.days} days) · ${data.coverage.filter((c) => c.present).length} of ${data.coverage.length} reports present. Where the source data carries QA traffic, certain figures are inflated and are flagged on the Demand tab. Exported ${new Date().toISOString().slice(0, 10)}.</p>
  </div>
</section>`;
}

/* --------------------------------- helpers --------------------------------- */

/**
 * Every interpolated string passes through here. The reference tenant contains
 * collection names made entirely of punctuation and titles with arbitrary characters.
 */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pct(value: number): string {
  return value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

function heat(value: number): BarDatum["tone"] {
  return value >= 65 ? "signal" : value >= 40 ? "ochre" : "garnet";
}

function bar(datum: BarDatum, valueLabel?: string): string {
  const width = datum.value === 0 ? datum.pct : Math.max(1.5, datum.pct);
  const label = valueLabel ?? (Number.isInteger(datum.value) ? String(datum.value) : datum.value.toFixed(1));
  return `<div class="bar">
  <div class="bar-head"><span class="bar-name">${esc(datum.label)}</span>${datum.meta ? `<span class="bar-meta">${esc(datum.meta)}</span>` : ""}</div>
  <div class="bar-body"><div class="bar-track"><div class="bar-fill t-${datum.tone ?? "ink"}" data-w="${width.toFixed(2)}"></div></div><span class="bar-value">${esc(label)}</span></div>
</div>`;
}

function chip(kind: string, text: string): string {
  return `<span class="chip chip-${esc(kind)}">${esc(text)}</span>`;
}

function stageHead(num: string, title: string, sub: string): string {
  return `<div class="stage-head"><span class="stage-num">${esc(num)}</span><h2>${esc(title)}</h2><span class="stage-sub">${esc(sub)}</span></div>`;
}

function table(headers: string[], rows: string[][], numeric: boolean[]): string {
  return `<table><thead><tr>${headers
    .map((h, i) => `<th${numeric[i] ? ' class="num"' : ""}>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell, i) => `<td${numeric[i] ? ' class="num"' : ""}>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function loopSvg(stages: LoopStage[], answerRate: string, windowLabel: string): string {
  const size = 420;
  const center = size / 2;
  const radius = 142;
  const gap = 7;
  const span = 360 / stages.length;
  const tone: Record<string, string> = {
    signal: "#599900",
    ochre: "#BB8000",
    garnet: "#E60C51",
    ink: "#252B31",
    slate: "#6B7786",
    hair: "#BFC6CE",
  };

  const polar = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
  };

  const arcs = stages
    .map((stage, index) => {
      const start = index * span + gap / 2;
      const end = (index + 1) * span - gap / 2;
      const mid = (start + end) / 2;
      const a = polar(start, radius);
      const b = polar(end, radius);
      const label = polar(mid, radius + 34);
      const anchor = mid > 15 && mid < 165 ? "start" : mid > 195 && mid < 345 ? "end" : "middle";
      const badge = stage.broken ? brokenBadge(polar(mid, radius)) : "";
      return `<path d="M${a.x.toFixed(1)},${a.y.toFixed(1)} A${radius},${radius} 0 0 1 ${b.x.toFixed(1)},${b.y.toFixed(1)}" fill="none" stroke="${tone[stage.tone] ?? "#252B31"}" stroke-width="${stage.broken ? 7 : 13}"${stage.broken ? ' stroke-dasharray="5 7" opacity="0.55"' : ""}/>
<text x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="${anchor}" font-family="var(--mono)" font-size="10" font-weight="600" letter-spacing="0.1em" fill="#252B31">${esc(stage.stage.toUpperCase())}</text>
<text x="${label.x.toFixed(1)}" y="${(label.y + 13).toFixed(1)}" text-anchor="${anchor}" font-family="var(--mono)" font-size="10.5" fill="#6B7786">${esc(stage.value)}</text>${badge}`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="The knowledge loop. ${esc(stages.map((s) => `${s.stage}: ${s.value}`).join(", "))}. The repair stage is drawn broken." style="width:100%;height:auto;max-width:${size}px">
${arcs}
<text x="${center}" y="${center - 2}" text-anchor="middle" font-family="var(--mono)" font-size="38" font-weight="600" letter-spacing="-0.03em" fill="#252B31">${esc(answerRate)}</text>
<text x="${center}" y="${center + 18}" text-anchor="middle" font-family="var(--mono)" font-size="9" font-weight="600" letter-spacing="0.16em" fill="#6B7786">ANSWER RATE</text>
<text x="${center}" y="${center + 36}" text-anchor="middle" font-family="var(--mono)" font-size="10" fill="#6B7786">${esc(windowLabel)}</text>
</svg>`;
}

function brokenBadge(point: { x: number; y: number }): string {
  return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="13" fill="#FFB7CE" stroke="#E60C51" stroke-width="1"/>
<path d="M${(point.x - 5).toFixed(1)},${(point.y - 5).toFixed(1)} L${(point.x + 5).toFixed(1)},${(point.y + 5).toFixed(1)} M${(point.x + 5).toFixed(1)},${(point.y - 5).toFixed(1)} L${(point.x - 5).toFixed(1)},${(point.y + 5).toFixed(1)}" stroke="#93002F" stroke-width="2" stroke-linecap="round"/>`;
}

function lineSvg(points: { date: string; answerRate: number }[]): string {
  if (points.length === 0) return "<p>No daily summary in this snapshot.</p>";
  const width = 320;
  const height = 150;
  const pad = { top: 12, right: 8, bottom: 22, left: 26 };
  const maxY = 70;
  const x = (i: number) =>
    pad.left + (points.length === 1 ? (width - pad.left - pad.right) / 2 : (i / (points.length - 1)) * (width - pad.left - pad.right));
  const y = (v: number) => pad.top + (1 - Math.min(v, maxY) / maxY) * (height - pad.top - pad.bottom);

  const grid = [0, maxY / 2, maxY]
    .map(
      (tick) =>
        `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" stroke="#BFC6CE"/><text x="${pad.left - 5}" y="${(y(tick) + 3).toFixed(1)}" text-anchor="end" font-size="8" font-family="var(--mono)" fill="#6B7786">${tick}</text>`,
    )
    .join("");
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.answerRate).toFixed(1)}`).join(" ");
  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(p.answerRate).toFixed(1)}" r="3" fill="#fff" stroke="#2574DB" stroke-width="1.6"/><text x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="8" font-family="var(--mono)" fill="#6B7786">${esc(p.date.slice(8))}</text>`,
    )
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Answer rate by day" style="width:100%;height:auto">${grid}<path d="${path}" fill="none" stroke="#2574DB" stroke-width="1.6"/>${dots}</svg>`;
}
