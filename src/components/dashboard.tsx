"use client";

import { useCallback, useRef, useState } from "react";
import { BarRow, Chip, LineChart, MrrScale, SplitBar, heat } from "@/components/charts";
import { formatPct } from "@/lib/format";
import { LoopDiagram } from "@/components/loop-diagram";
import type { BarDatum, DashboardData } from "@/lib/metrics/types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "demand", label: "Demand" },
  { id: "quality", label: "Answer quality" },
  { id: "health", label: "Knowledge health" },
  { id: "roi", label: "ROI" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Dashboard({ data }: { data: DashboardData }) {
  const [active, setActive] = useState<TabId>("overview");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + delta + TABS.length) % TABS.length;
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  }, []);

  return (
    <>
      <div className="tabbar" role="tablist" aria-label="Dashboard sections">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
        >
          {/* Remounting on activation re-triggers the bar fill animations. */}
          {active === tab.id ? <Panel id={tab.id} data={data} /> : null}
        </div>
      ))}
    </>
  );
}

function Panel({ id, data }: { id: TabId; data: DashboardData }) {
  switch (id) {
    case "overview":
      return <Overview data={data} />;
    case "demand":
      return <Demand data={data} />;
    case "quality":
      return <Quality data={data} />;
    case "health":
      return <Health data={data} />;
    case "roi":
      return <Roi data={data} />;
  }
}

function StageHead({ num, title, sub }: { num: string; title: string; sub: string }) {
  return (
    <div className="stage-head">
      <span className="stage-num">{num}</span>
      <h2>{title}</h2>
      <span className="stage-sub">{sub}</span>
    </div>
  );
}

/* ---------------------------------- Overview --------------------------------- */

function Overview({ data }: { data: DashboardData }) {
  const { counts } = data;
  return (
    <>
      <section className="kpis">
        {data.kpis.map((kpi) => (
          <div className="kpi" key={kpi.label}>
            <div className={`kpi-value ${kpi.tone === "signal" ? "v-signal" : kpi.tone === "garnet" ? "v-garnet" : ""}`}>
              {kpi.value}
              {kpi.unit ? <span>{kpi.unit}</span> : null}
            </div>
            <div className="kpi-label">{kpi.label}</div>
          </div>
        ))}
      </section>

      <section className="hero">
        <LoopDiagram
          stages={data.loop}
          answerRate={formatPct(counts.answerRate)}
          windowLabel={data.window.label}
        />
        <div>
          <div className="eyebrow">The argument</div>
          <h2>{data.narratives.thesis}</h2>
          <p>
            Gen Answers serves answers from solutions. Those solutions age. Solution Manager repairs
            solutions. When the two never meet, the knowledge base decays under live load while
            authoring effort lands somewhere else. Every stage below is a real figure from this
            week&apos;s exports.
          </p>
          <div className="callout">{data.narratives.loopVerdict}</div>
        </div>
      </section>
    </>
  );
}

/* ----------------------------------- Demand ---------------------------------- */

function Demand({ data }: { data: DashboardData }) {
  const { demand, counts } = data;
  const peak = Math.max(1, ...demand.themes.map((t) => t.questions));

  return (
    <section className="stage">
      <StageHead
        num="01 / Ask"
        title="Demand"
        sub={`${counts.questionsAsked} questions · ${counts.distinctQuestions} distinct · ${counts.portalUsers} users`}
      />
      <div className="grid grid-2">
        <div className="card">
          <h3 className="card-title">Demand concentration</h3>
          {demand.themes.map((theme) => (
            <BarRow
              key={theme.theme}
              datum={{
                label: theme.qaNoise ? `${theme.theme} · QA noise` : theme.theme,
                value: theme.questions,
                pct: (theme.questions / peak) * 100,
                meta: formatPct(theme.answerRate),
                tone: heat(theme.answerRate),
              }}
            />
          ))}
          <p>
            Bar colour encodes answer rate, length encodes volume. Rows flagged{" "}
            <em>QA noise</em> are smoke-test traffic — surfaced rather than hidden, because
            silently dropping them would overstate the answer rate.
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">Answer consistency</h3>
          {demand.consistency.map((row) => (
            <BarRow
              key={row.query}
              datum={{
                label: row.query,
                value: row.answerRate,
                pct: row.answerRate,
                meta: `${row.asks} asks`,
                tone: heat(row.answerRate),
              }}
              valueLabel={formatPct(row.answerRate)}
            />
          ))}
          <div className="callout">{data.narratives.consistency}</div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Answer quality ------------------------------ */

function Quality({ data }: { data: DashboardData }) {
  const { retrieval, grounding, serving, counts } = data;
  const { ranking } = retrieval;
  const rankPeak = Math.max(1, ...ranking.positions.map((p) => p.count));
  const groundingPct = grounding.unanswered
    ? (grounding.failuresWithContext / grounding.unanswered) * 100
    : 0;

  return (
    <>
      <section className="stage">
        <StageHead
          num="02 / Retrieve"
          title="Ranking and mode"
          sub={`${counts.questionsAsked} questions · ${retrieval.searchTypes.length} search modes`}
        />
        <div className="grid grid-2">
          <div className="card">
            <h3 className="card-title">Where the answer ranked</h3>
            {ranking.positions.map((position) => (
              <BarRow
                key={position.label}
                datum={{
                  label: position.label,
                  value: position.count,
                  pct: (position.count / rankPeak) * 100,
                  meta: `${formatPct(position.pctOfRanked)} · ${formatPct(position.cumulativePct)} cumulative`,
                  tone: position.tone,
                }}
              />
            ))}
            <p>
              Positions cover the {ranking.ranked} questions that returned something to rank.{" "}
              {ranking.noUsableHit} of {ranking.scored} returned no usable hit at all and sit
              outside this chart.
            </p>
          </div>

          <div className="card">
            <h3 className="card-title">Ranking quality (MRR)</h3>
            <MrrScale
              score={ranking.mrr}
              caption={`Across the ${ranking.ranked} questions where retrieval returned something. Questions that returned nothing are a coverage problem, not a ranking one, so they are left out rather than scored as zero.`}
            />
            <p>{data.narratives.searchMode}</p>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <h3 className="card-title">Search mode efficacy</h3>
            {retrieval.searchTypes.map((type) => (
              <BarRow
                key={type.type}
                datum={{
                  label: type.type,
                  value: type.answerRate,
                  pct: type.answerRate,
                  meta: `${type.questions} asks · MRR ${type.meanMrr?.toFixed(2) ?? "—"} · top 3 ${
                    type.top3Pct === null ? "—" : formatPct(type.top3Pct)
                  }`,
                  tone: heat(type.answerRate),
                }}
                valueLabel={formatPct(type.answerRate)}
              />
            ))}
            <p>
              Bar length is answer rate. MRR and top-3 sit in the meta line because a mode can
              rank well on the few questions it lands and still answer almost nothing.
            </p>
          </div>

          <div className="card">
            <h3 className="card-title">Answer rate by day</h3>
            <LineChart points={data.trend} />
            <p>Only days present in the export are plotted. A gap in the window stays a gap.</p>
          </div>
        </div>
      </section>

      <section className="stage">
        <StageHead
          num="03 / Ground"
          title="Grounding"
          sub={`${grounding.failuresWithContext} of ${grounding.unanswered} failures had candidates`}
        />
        <div className="card">
          <SplitBar
            segments={[
              { pct: groundingPct, tone: "garnet", title: "Failed with a context set returned" },
              { pct: 100 - groundingPct, tone: "slate", title: "Failed with nothing retrieved" },
            ]}
          />
          <p>{data.narratives.grounding}</p>
        </div>
      </section>

      <section className="stage">
        <StageHead
          num="04 / Serve"
          title="Speed and spread"
          sub={`p50 ${serving.p50}s · p90 ${serving.p90}s · n=${serving.sampleSize}`}
        />
        <div className="grid grid-2">
          <div className="card">
            <h3 className="card-title">Time to first answer by portal group</h3>
            {data.ttfaByPortalGroup.map((bar) => (
              <BarRow key={bar.label} datum={bar} valueLabel={`${bar.value}s`} />
            ))}
            <p>{data.narratives.serveSpeed}</p>
          </div>
          <div className="card">
            <h3 className="card-title">Citation spread</h3>
            {serving.citationSpread.map((bar) => (
              <BarRow key={bar.label} datum={bar} />
            ))}
            <p>
              {counts.totalCitations} citations spread over {counts.solutionsCited} solutions.
            </p>
            <p>{data.narratives.citationSpread}</p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------ Knowledge health ----------------------------- */

function Health({ data }: { data: DashboardData }) {
  const { decay, repair, counts } = data;
  const solutionPeak = Math.max(1, ...decay.bands.map((b) => b.solutions));

  const closureBars: BarDatum[] = [
    {
      label: `Refreshed in window (${repair.windowDays}d)`,
      value: repair.refreshedInWindow,
      pct: (repair.refreshedInWindow / repair.denominator) * 100,
      tone: "signal",
    },
    {
      label: "Refreshed in 30 days",
      value: repair.refreshedIn30Days,
      pct: (repair.refreshedIn30Days / repair.denominator) * 100,
      tone: "ochre",
    },
    {
      label: "Untouched over 1 year",
      value: repair.untouchedOverYear,
      pct: (repair.untouchedOverYear / repair.denominator) * 100,
      tone: "garnet",
    },
  ];

  const aiSharePct = repair.refreshedInWindow ? (repair.aiAssistedCount / repair.refreshedInWindow) * 100 : 0;

  return (
    <>
      <section className="stage">
        <StageHead
          num="05 / Decay"
          title="Knowledge decay under load"
          sub={`${formatPct(decay.pctCitationsOverYear)} of citations from articles over 1 year old`}
        />
        <div className="grid grid-2">
          <div className="card">
            <h3 className="card-title">Staleness of cited solutions</h3>
            {decay.bands.map((band) => (
              <BarRow
                key={band.label}
                datum={{
                  label: band.label,
                  value: band.solutions,
                  pct: (band.solutions / solutionPeak) * 100,
                  meta: `${band.citations} citations`,
                  tone: band.tone,
                }}
              />
            ))}
            <p>{data.narratives.decay}</p>
          </div>

          <div className="card">
            <h3 className="card-title">Repair worklist — citations × log staleness</h3>
            <table>
              <thead>
                <tr>
                  <th>Solution</th>
                  <th className="num">Cites</th>
                  <th className="num">Age</th>
                </tr>
              </thead>
              <tbody>
                {decay.worklist.map((item) => (
                  <tr key={item.solutionId}>
                    <td>{item.title}</td>
                    <td className="num">{item.citations}</td>
                    <td className="num">
                      <Chip kind={item.chip}>{item.days}d</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>{data.narratives.worklistPriority}</p>
          </div>
        </div>
      </section>

      <section className="stage">
        <StageHead
          num="06 / Repair"
          title="Loop closure"
          sub={`${formatPct(repair.reviewClosure)} of ${repair.dueForReview} solutions due for review were refreshed · ${formatPct(
            repair.reviewClosureWeighted,
          )} citation-weighted · ${repair.reviewThresholdDays}-day cadence`}
        />
        <div className="grid grid-3">
          <div className="card">
            <h3 className="card-title">Loop closure</h3>
            {closureBars.map((bar) => (
              <BarRow key={bar.label} datum={bar} />
            ))}
            <p>
              Closure is scored only against the {repair.dueForReview} solutions that needed
              attention — the {repair.overdueForReview} overdue past the {repair.reviewThresholdDays}-day
              cadence plus the {repair.refreshedInWindow} refreshed in-window. The {repair.onCadence}{" "}
              still within cadence are accurate and healthy, so KCS treats them as done rather than as
              pending debt.
            </p>
            <p>
              Any edit counts, by any method. A human rewriting a stale article closes the loop as
              effectively as AI does — a metric that only counts AI repair is feature usage wearing
              an outcome metric&apos;s clothes.
            </p>
          </div>

          <div className="card">
            <h3 className="card-title">AI-assisted share of repair</h3>
            <SplitBar
              segments={[
                { pct: aiSharePct, tone: "signal", title: "AI-assisted" },
                { pct: 100 - aiSharePct, tone: "slate", title: "Not AI-assisted" },
              ]}
            />
            <p>
              <strong>
                {repair.aiAssistedCount} of {repair.refreshedInWindow}
              </strong>{" "}
              repairs were AI-assisted. This sits underneath loop closure, never above it — it is
              the number that should climb quarter over quarter.
            </p>
            <h3 className="card-title" style={{ marginTop: 18 }}>
              AI feature mix
            </h3>
            {repair.aiFeatureMix.map((bar) => (
              <BarRow key={bar.label} datum={bar} />
            ))}
          </div>

          <div className="card">
            <h3 className="card-title">Where AI effort went</h3>
            <table>
              <thead>
                <tr>
                  <th>Solution</th>
                  <th className="num">Actions</th>
                  <th className="num">Status</th>
                </tr>
              </thead>
              <tbody>
                {repair.aiTouched.map((item) => (
                  <tr key={item.solutionId}>
                    <td>{item.title}</td>
                    <td className="num">{item.aiActions}</td>
                    <td className="num">
                      <Chip kind={item.chip}>{item.status}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>{data.narratives.aiPublishing}</p>
          </div>
        </div>
      </section>

      <section className="stage">
        <div className="card">
          <h3 className="card-title">The repair queue</h3>
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Signal</th>
                <th className="num">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.repairQueue.map((item) => (
                <tr key={item.candidate}>
                  <td>{item.candidate}</td>
                  <td>{item.signal}</td>
                  <td className="num">
                    <Chip kind={item.chip}>{item.status}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Derived by joining failed demand to the content that should have answered it.{" "}
            <em>No coverage</em> means nothing exists; <em>stale</em> means it exists but is aged;{" "}
            <em>weak grounding</em> means a reasonably fresh solution exists and generation still
            failed. {counts.solutionsCited} solutions cited, {counts.totalCitations} citations.
          </p>
          <p>{data.narratives.repairQueue}</p>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------ ROI ------------------------------------ */

function Roi({ data }: { data: DashboardData }) {
  const { roi, counts } = data;
  const chipFor = (status: string) => (status === "live" ? "ok" : status === "partial" ? "warm" : "hot");
  const live = roi.views.filter((v) => v.state === "modelled").length;

  return (
    <section className="stage">
      <StageHead
        num="ROI"
        title="Modelled, not measured"
        sub={`${live} of ${roi.views.length} views computable today`}
      />

      <div className="card">
        <div className="eyebrow">Modelled, not measured</div>
        <h2 style={{ fontFamily: "var(--cond)", fontSize: 28, margin: "8px 0 10px" }}>
          {roi.views.length} ROI views. {live} {live === 1 ? "is" : "are"} computable,{" "}
          {roi.views.length - live} {roi.views.length - live === 1 ? "is" : "are"} waiting on data.
        </h2>
        <p>
          Every figure below derives from a stated formula. Observed inputs come straight from the
          exports; the remaining inputs are named assumptions, shown beside each result and editable,
          never presented as measured.
        </p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="card-title">View 1 — Time saved reading</h3>
        {roi.waterfall.map((bar) => (
          <BarRow
            key={bar.label}
            datum={bar}
            valueLabel={`${(bar.value / 60).toFixed(1)}m`}
          />
        ))}
        <p>
          Net <strong>{roi.netMinutes.toFixed(1)} minutes</strong> saved per answered question.
          The counterfactual models the observed path — open the ones that would have been cited,
          scan and reject the rest. Modelling a full read of everything retrieved produces{" "}
          {roi.fullReadMinutes.toFixed(1)} minutes per question and gets the whole tab dismissed.
        </p>
        <div className="grid grid-2" style={{ marginTop: 14 }}>
          <div>
            <h3 className="card-title">Observed</h3>
            <ul className="inputlist">
              {Object.entries(roi.observed).map(([key, value]) => (
                <li key={key}>
                  <Chip kind="ok">live</Chip>
                  <strong>{key}</strong>
                  <span className="src num">{value.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="card-title">Assumed — editable in settings</h3>
            <ul className="inputlist">
              {Object.entries(roi.assumed).map(([key, value]) => (
                <li key={key}>
                  <Chip kind="warm">assumed</Chip>
                  <strong>{key}</strong>
                  <span className="src num">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {roi.views.map((view, index) => (
        <div className="card" style={{ marginTop: 18 }} key={view.id}>
          <h3 className="card-title">
            View {index + 1} — {view.title}
          </h3>
          {view.result && (
            <div style={{ margin: "6px 0 14px" }}>
              <div style={{ fontFamily: "var(--cond)", fontSize: 26, lineHeight: 1.1 }}>
                {view.result.headline}
              </div>
              <p style={{ margin: "4px 0 12px", color: "var(--muted)" }}>{view.result.subhead}</p>
              {view.result.bars.map((bar) => (
                <BarRow key={bar.label} datum={bar} valueLabel={bar.meta} />
              ))}
              <ul className="inputlist" style={{ marginTop: 12 }}>
                {view.result.basis.map((b) => (
                  <li key={b.label}>
                    <Chip kind={b.kind === "observed" ? "ok" : "warm"}>{b.kind}</Chip>
                    <strong>{b.label}</strong>
                    <span className="src num">{b.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <pre className="formula">{view.formula}</pre>
          <ul className="inputlist">
            {view.inputs.map((input) => (
              <li key={input.field}>
                <Chip kind={chipFor(input.status)}>{input.status}</Chip>
                <strong>{input.field}</strong>
                <span className="src">{input.source}</span>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 12 }}>{view.note}</p>
        </div>
      ))}

      <div className="footer">
        <div className="footer-grid">
          <div>
            <h3>Deflection</h3>
            <p>
              {counts.referenceSolutionViews === 0
                ? "Reference solution views logged 0 for every day in the window."
                : `Reference solution views logged ${counts.referenceSolutionViews.toLocaleString("en-GB")} in the window, but with no click-through or session-exit signal they cannot be tied to an avoided ticket.`}
            </p>
          </div>
          <div>
            <h3>Answer feedback</h3>
            <p>No thumbs signal. The answer rate is a system verdict, not a customer one.</p>
          </div>
          <div>
            <h3>Ticket linkage</h3>
            <p>No join from a session to a case. The only credible route to a dollar figure.</p>
          </div>
          <div>
            <h3>Author time saved</h3>
            <p>AI actions are counted, not timed. Draft-to-publish duration is cheap to capture.</p>
          </div>
        </div>
        <p className="disclaimer">
          Window {data.window.start} → {data.window.end} ({data.window.days} days).{" "}
          {data.coverage.filter((c) => c.present).length} of {data.coverage.length} reports present.
          Figures derive from the exports named on each view. Where the source tenant carries QA
          traffic, certain figures are inflated and are flagged as such on the Demand tab.
        </p>
      </div>
    </section>
  );
}
