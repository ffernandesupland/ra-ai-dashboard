"use client";

import type { LoopStage } from "@/lib/metrics/types";

const SIZE = 420;
const CENTER = SIZE / 2;
const RADIUS = 142;
const GAP_DEG = 7;
const LABEL_RADIUS = RADIUS + 34;
// The 3 o'clock and 9 o'clock labels extend past the ring, so the viewBox is
// widened horizontally to keep them from clipping at the SVG edges.
const PAD_X = 96;

const TONE_STROKE: Record<string, string> = {
  signal: "var(--signal)",
  ochre: "var(--ochre)",
  garnet: "var(--garnet)",
  ink: "var(--ink)",
  slate: "var(--slate)",
  hair: "var(--hair)",
};

// Math.cos/Math.sin are implementation-defined to within an ulp, so Node and the
// browser can disagree in the last digit and React reports a hydration mismatch.
// Rounding to sub-pixel precision makes the two agree and costs nothing visually.
function round(n: number) {
  return Math.round(n * 100) / 100;
}

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: round(CENTER + radius * Math.cos(rad)), y: round(CENTER + radius * Math.sin(rad)) };
}

function arcPath(startDeg: number, endDeg: number) {
  const start = polar(startDeg, RADIUS);
  const end = polar(endDeg, RADIUS);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M${start.x},${start.y} A${RADIUS},${RADIUS} 0 ${largeArc} 1 ${end.x},${end.y}`;
}

/**
 * Six arcs, clockwise from the top. The Repair arc renders dashed, thinner and
 * faded with an X badge at its midpoint: the loop is drawn visibly broken,
 * which is the entire point of the artifact.
 */
export function LoopDiagram({
  stages,
  answerRate,
  windowLabel,
}: {
  stages: LoopStage[];
  answerRate: string;
  windowLabel: string;
}) {
  const span = 360 / stages.length;
  const description = stages.map((s) => `${s.stage}: ${s.value}`).join(", ");

  return (
    <svg
      viewBox={`${-PAD_X} 0 ${SIZE + PAD_X * 2} ${SIZE}`}
      role="img"
      aria-label={`The knowledge loop. ${description}. The repair stage is drawn broken.`}
      style={{ width: "100%", height: "auto", maxWidth: SIZE + PAD_X * 2 }}
    >
      {stages.map((stage, index) => {
        const start = index * span + GAP_DEG / 2;
        const end = (index + 1) * span - GAP_DEG / 2;
        const mid = (start + end) / 2;
        const label = polar(mid, LABEL_RADIUS);

        // Without an angle-dependent anchor, labels collide with the ring at top and bottom.
        const anchor = mid > 15 && mid < 165 ? "start" : mid > 195 && mid < 345 ? "end" : "middle";

        return (
          <g key={stage.stage}>
            <path
              d={arcPath(start, end)}
              fill="none"
              stroke={TONE_STROKE[stage.tone] ?? "var(--ink)"}
              strokeWidth={stage.broken ? 7 : 13}
              strokeLinecap="butt"
              strokeDasharray={stage.broken ? "5 7" : undefined}
              opacity={stage.broken ? 0.55 : 1}
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor={anchor}
              fontFamily="var(--mono)"
              fontSize="10"
              fontWeight="500"
              letterSpacing="0.1em"
              fill="var(--ink)"
            >
              {stage.stage.toUpperCase()}
            </text>
            <text
              x={label.x}
              y={label.y + 13}
              textAnchor={anchor}
              fontFamily="var(--mono)"
              fontSize="10.5"
              fill="var(--slate)"
            >
              {stage.value}
            </text>
            {stage.broken ? <BrokenBadge angle={mid} /> : null}
          </g>
        );
      })}

      <text
        x={CENTER}
        y={CENTER - 2}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="38"
        letterSpacing="-0.03em"
        fill="var(--ink)"
      >
        {answerRate}
      </text>
      <text
        x={CENTER}
        y={CENTER + 18}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="9"
        letterSpacing="0.16em"
        fill="var(--slate)"
      >
        ANSWER RATE
      </text>
      <text
        x={CENTER}
        y={CENTER + 36}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="10"
        fill="var(--slate)"
      >
        {windowLabel}
      </text>
    </svg>
  );
}

function BrokenBadge({ angle }: { angle: number }) {
  const point = polar(angle, RADIUS);
  return (
    <g>
      <circle cx={point.x} cy={point.y} r="13" fill="var(--garnet-soft)" stroke="var(--garnet)" strokeWidth="1" />
      <path
        d={`M${point.x - 5},${point.y - 5} L${point.x + 5},${point.y + 5} M${point.x + 5},${point.y - 5} L${point.x - 5},${point.y + 5}`}
        stroke="var(--garnet)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
  );
}
