import Link from "next/link";
import { Masthead, Nav } from "@/components/chrome";
import { formatPct } from "@/lib/format";
import { listSnapshots } from "@/lib/snapshots";
import { requireWorkspace } from "../workspace";

export const dynamic = "force-dynamic";

interface Series {
  key: string;
  label: string;
  values: number[];
  suffix: string;
  /** Whether a rising line is the good direction. Drives the delta colour. */
  higherIsBetter: boolean;
}

export default async function TrendsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, nav } = await requireWorkspace(slug);
  const snapshots = (await listSnapshots(workspace.id)).filter((s) => s.metrics).reverse();

  if (snapshots.length < 2) {
    return (
      <main className="shell">
        <Nav active="trends" workspace={nav} />
        <Masthead title="Trends" meta={[{ label: "Snapshots", value: String(snapshots.length) }]} />
        <div className="notice" style={{ marginTop: 24 }}>
          Trends need at least two committed windows. Upload next week&apos;s exports and this page
          starts working — <Link href={`/w/${slug}/upload`}>upload now</Link>.
        </div>
        <p style={{ maxWidth: 640, color: "var(--slate)" }}>
          Loop closure moving from 3.9% to 8% over a quarter is a far stronger artifact than any
          single week, because it shows the loop closing rather than merely being open.
        </p>
      </main>
    );
  }

  const labels = snapshots.map((s) => s.windowEnd.toISOString().slice(5, 10));
  const series: Series[] = [
    { key: "loopClosure", label: "Loop closure", values: snapshots.map((s) => s.metrics!.loopClosure), suffix: "%", higherIsBetter: true },
    { key: "loopClosureWtd", label: "Loop closure, citation-weighted", values: snapshots.map((s) => s.metrics!.loopClosureWtd), suffix: "%", higherIsBetter: true },
    { key: "aiShareOfRepair", label: "AI-assisted share of repair", values: snapshots.map((s) => s.metrics!.aiShareOfRepair), suffix: "%", higherIsBetter: true },
    { key: "answerRate", label: "Answer rate", values: snapshots.map((s) => s.metrics!.answerRate), suffix: "%", higherIsBetter: true },
    { key: "medianTtfaSec", label: "Median time to first answer", values: snapshots.map((s) => s.metrics!.medianTtfaSec), suffix: "s", higherIsBetter: false },
    { key: "solutionsCited", label: "Solutions cited", values: snapshots.map((s) => s.metrics!.solutionsCited), suffix: "", higherIsBetter: true },
  ];

  return (
    <main className="shell">
      <Nav active="trends" workspace={nav} />
      <Masthead
        title="Trends"
        meta={[
          { label: "Windows", value: String(snapshots.length) },
          { label: "From", value: snapshots[0].windowStart.toISOString().slice(0, 10) },
          { label: "To", value: snapshots.at(-1)!.windowEnd.toISOString().slice(0, 10) },
        ]}
      />

      <div className="grid grid-2" style={{ marginTop: 24 }}>
        {series.map((item) => (
          <div className="card" key={item.key}>
            <h3 className="card-title">{item.label}</h3>
            <Sparkline values={item.values} labels={labels} suffix={item.suffix} higherIsBetter={item.higherIsBetter} />
          </div>
        ))}
      </div>
    </main>
  );
}

function Sparkline({
  values,
  labels,
  suffix,
  higherIsBetter,
}: {
  values: number[];
  labels: string[];
  suffix: string;
  higherIsBetter: boolean;
}) {
  const width = 320;
  const height = 120;
  const pad = { top: 10, right: 8, bottom: 20, left: 34 };
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i: number) =>
    pad.left + (values.length === 1 ? 0 : (i / (values.length - 1)) * (width - pad.left - pad.right));
  const y = (v: number) => pad.top + (1 - (v - min) / span) * (height - pad.top - pad.bottom);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  const delta = values.at(-1)! - values[0];
  const good = higherIsBetter ? delta >= 0 : delta <= 0;
  const stroke = delta === 0 ? "var(--slate)" : good ? "var(--signal)" : "var(--garnet)";

  return (
    <>
      <div className="mono" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>
        {format(values.at(-1)!, suffix)}
        <span
          style={{ fontSize: 12, marginLeft: 10, color: delta === 0 ? "var(--slate)" : good ? "var(--signal)" : "var(--garnet)" }}
        >
          {delta >= 0 ? "+" : ""}
          {format(delta, suffix)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${labels.join(", ")}: ${values.map((v) => format(v, suffix)).join(", ")}`}
        style={{ width: "100%", height: "auto", marginTop: 8 }}
      >
        <line x1={pad.left} x2={width - pad.right} y1={y(min)} y2={y(min)} stroke="var(--hair)" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="1.8" />
        {values.map((value, i) => (
          <g key={labels[i] + i}>
            <circle cx={x(i)} cy={y(value)} r="3" fill="var(--surface)" stroke={stroke} strokeWidth="1.6" />
            <text x={x(i)} y={height - 5} textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill="var(--slate)">
              {labels[i]}
            </text>
          </g>
        ))}
      </svg>
    </>
  );
}

function format(value: number, suffix: string): string {
  if (suffix === "%") return formatPct(value);
  if (suffix === "s") return `${value.toFixed(1)}s`;
  return String(Math.round(value));
}
