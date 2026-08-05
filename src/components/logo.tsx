/**
 * PLACEHOLDER LOCKUP — not the official RightAnswers artwork.
 *
 * The real mark lives in the Upland UI 2.0 Figma file under Logos (24 products x
 * 2 colors). Export the RightAnswers SVG and replace the contents of <Logo /> with
 * it; the sizing props and the `tone` switch below are the only contract the rest
 * of the app depends on.
 *
 * Colours are Upland aliases: Accent/accent-50 on light, Neutral/inverse-white on dark.
 */
export function Logo({ height = 28, tone = "light" }: { height?: number; tone?: "light" | "dark" }) {
  const mark = tone === "dark" ? "#FFFFFF" : "#2574DB";
  const word = tone === "dark" ? "#FFFFFF" : "#252B31";
  const soft = tone === "dark" ? "#7EB1F4" : "#6B7786";

  return (
    <svg
      viewBox="0 0 208 32"
      height={height}
      role="img"
      aria-label="RightAnswers"
      style={{ display: "block", width: "auto" }}
    >
      <rect x="0" y="0" width="32" height="32" rx="8" fill={mark} />
      {/* Speech tail plus a check: a question, answered. */}
      <path
        d="M9 10.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-6.4L12 24.5V21H9a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 9 10.5Z"
        fill="#FFFFFF"
        opacity={tone === "dark" ? 0.28 : 1}
      />
      <path
        d="m12.4 15.6 2.5 2.5 5-5"
        fill="none"
        stroke={tone === "dark" ? "#FFFFFF" : "#2574DB"}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="44"
        y="22"
        fontFamily="'Open Sans', -apple-system, sans-serif"
        fontSize="19"
        fontWeight="700"
        letterSpacing="-0.3"
        fill={word}
      >
        Right
        <tspan fontWeight="400" fill={soft}>
          Answers
        </tspan>
      </text>
    </svg>
  );
}
