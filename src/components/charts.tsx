"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
import { MRR_SCALE } from "@/lib/metrics/types";
import type { BarDatum, MrrBand, MrrScore, Tone } from "@/lib/metrics/types";

export function toneClass(tone: Tone = "ink") {
  return `t-${tone}`;
}

/** Answer-rate colouring. Colour never carries meaning alone — every bar has a numeric label. */
export function heat(pct: number): Tone {
  return pct >= 65 ? "signal" : pct >= 40 ? "ochre" : "garnet";
}

/** Fills animate from 0 on mount and re-animate when a tab is revealed. */
export function BarRow({
  datum,
  valueLabel,
  animate = true,
}: {
  datum: BarDatum;
  valueLabel?: string;
  animate?: boolean;
}) {
  const [animated, setAnimated] = useState(0);
  // Non-zero values keep a minimum visible width so a 0.5% bar is still a bar.
  const target = datum.value === 0 ? datum.pct : Math.max(1.5, datum.pct);
  const width = animate ? animated : target;

  useEffect(() => {
    if (!animate) return;
    const frame = requestAnimationFrame(() => setAnimated(target));
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);

  return (
    <div className="bar">
      <div className="bar-head">
        <span className="bar-name">{datum.label}</span>
        {datum.meta ? <span className="bar-meta">{datum.meta}</span> : null}
      </div>
      <div className="bar-body">
        <div className="bar-track">
          <div className={`bar-fill ${toneClass(datum.tone)}`} style={{ width: `${width}%` }} />
        </div>
        <span className="bar-value">{valueLabel ?? formatNumber(datum.value)}</span>
      </div>
    </div>
  );
}

export function bandChip(band: MrrBand): "ok" | "warm" | "hot" {
  return band === "needs-improvement" ? "hot" : band === "moderate" ? "warm" : "ok";
}

/**
 * The MRR interpretation scale. Segments are sized by their numeric range, not evenly,
 * so a value always sits over the band it actually belongs to.
 */
export function MrrScale({ score, caption }: { score: MrrScore; caption: string }) {
  return (
    <div className="scale">
      <div className="scale-head">
        <span className="scale-value">{score.value.toFixed(2)}</span>
        <Chip kind={bandChip(score.band)}>{score.bandLabel}</Chip>
      </div>
      <div className="scale-track">
        {MRR_SCALE.map((band) => (
          <div
            key={band.band}
            className={`scale-band sb-${band.band}`}
            style={{ width: `${(band.to - band.from) * 100}%` }}
          />
        ))}
        <div
          className="scale-mark"
          style={{ left: `${Math.min(100, Math.max(0, score.value * 100))}%` }}
        />
      </div>
      <div className="scale-legend">
        {MRR_SCALE.map((band) => (
          <div
            key={band.band}
            className={`scale-seg${band.band === score.band ? " is-on" : ""}`}
            style={{ width: `${(band.to - band.from) * 100}%` }}
          >
            <span className="scale-seg-label">{band.label}</span>
            <span className="scale-seg-range">
              {band.from.toFixed(1)}–{band.to.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <p className="scale-cap">{caption}</p>
    </div>
  );
}

export function SplitBar({ segments }: { segments: { pct: number; tone: Tone; title: string }[] }) {
  return (
    <div className="split">
      {segments.map((segment, index) => (
        <div
          key={index}
          className={toneClass(segment.tone)}
          style={{ width: `${segment.pct}%` }}
          title={segment.title}
        />
      ))}
    </div>
  );
}

export function Chip({ kind, children }: { kind: "ok" | "warm" | "hot" | "neutral"; children: React.ReactNode }) {
  return <span className={`chip chip-${kind}`}>{children}</span>;
}

/**
 * Answer rate by day. Plots only the dates present — the reference window is
 * missing 25 July, and interpolating across it would invent data.
 */
export function LineChart({ points }: { points: { date: string; answerRate: number }[] }) {
  const width = 320;
  const height = 150;
  const pad = { top: 12, right: 8, bottom: 22, left: 26 };
  const maxY = 70;

  if (points.length === 0) return <p>No daily summary in this snapshot.</p>;

  const x = (i: number) =>
    pad.left +
    (points.length === 1
      ? (width - pad.left - pad.right) / 2
      : (i / (points.length - 1)) * (width - pad.left - pad.right));
  const y = (value: number) =>
    pad.top + (1 - Math.min(value, maxY) / maxY) * (height - pad.top - pad.bottom);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.answerRate)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Answer rate by day, ${points.length} days plotted, ranging from ${Math.min(
        ...points.map((p) => p.answerRate),
      ).toFixed(0)}% to ${Math.max(...points.map((p) => p.answerRate)).toFixed(0)}%`}
      style={{ width: "100%", height: "auto" }}
    >
      {[0, maxY / 2, maxY].map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--hair)" strokeWidth="1" />
          <text x={pad.left - 5} y={y(tick) + 3} textAnchor="end" fontSize="8" fontFamily="var(--mono)" fill="var(--slate)">
            {tick}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      {points.map((point, i) => (
        <g key={point.date}>
          <circle cx={x(i)} cy={y(point.answerRate)} r="3" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.6" />
          <text x={x(i)} y={height - 6} textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill="var(--slate)">
            {point.date.slice(8)}
          </text>
        </g>
      ))}
    </svg>
  );
}
