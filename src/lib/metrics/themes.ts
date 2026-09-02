/**
 * Theme mapping for demand clustering. Substring-matched against the normalised query,
 * first match wins — order matters, because "software testing" must be claimed before
 * the "test" QA-noise bucket swallows it.
 *
 * Kept as config so a new tenant is an edit here, not a code change.
 */
export interface ThemeDefinition {
  theme: string;
  patterns: (string | RegExp)[];
  /** Marks QA/smoke-test traffic. Flagged in the UI rather than hidden. */
  qaNoise?: boolean;
  /** Title fragments used to find the solution that should be answering this theme. */
  solutionHints?: string[];
}

export const DEFAULT_THEMES: ThemeDefinition[] = [
  // Insurance demand clusters (Allstate demo). Ordered claims-first so a query naming both
  // a claim and a policy lands under claims; kept ahead of the QA-noise bucket.
  {
    theme: "Auto claims",
    patterns: ["auto claim", "car accident", "collision", "fender bender", "file a claim", "accident claim"],
    solutionHints: ["auto claim", "claim", "accident"],
  },
  {
    theme: "Property claims",
    patterns: ["property claim", "home claim", "water damage", "roof", "storm damage", "homeowner claim"],
    solutionHints: ["property", "home", "damage"],
  },
  {
    theme: "Billing & payments",
    patterns: ["billing", "payment", "premium", "autopay", "refund", "invoice", "pay my bill"],
    solutionHints: ["billing", "payment", "premium"],
  },
  {
    theme: "Policy servicing",
    patterns: ["policy", "coverage", "deductible", "endorsement", "renewal", "add a driver", "declaration page"],
    solutionHints: ["policy", "coverage", "deductible"],
  },
  {
    theme: "Roadside assistance",
    patterns: ["roadside", "towing", "tow truck", "jump start", "lockout", "flat tire"],
    solutionHints: ["roadside", "tow"],
  },
  {
    theme: "Software testing",
    patterns: ["software testing", "testing techniques", "principles of software test"],
    solutionHints: ["software testing", "testing"],
  },
  { theme: "VPN connectivity", patterns: ["vpn"], solutionHints: ["vpn"] },
  {
    theme: "Outlook / email display",
    patterns: ["outlook", "emails look", "email look", "display issues"],
    solutionHints: ["outlook"],
  },
  { theme: "Litify", patterns: ["litify"], solutionHints: ["litify"] },
  { theme: "RO Innovation", patterns: ["ro innovation"], solutionHints: ["ro innovation"] },
  {
    theme: "Boiling water (pt-BR)",
    patterns: ["boiling water", "ferver", "agua", "água"],
    solutionHints: ["boiling", "water"],
  },
  {
    theme: "Mechanical rotor design",
    patterns: ["rotor"],
    solutionHints: ["rotor"],
  },
  {
    theme: '"test" and ID strings',
    patterns: [/^\d{8,}$/, "test"],
    qaNoise: true,
  },
];

export function matchTheme(queryNorm: string, themes: ThemeDefinition[]): ThemeDefinition | null {
  for (const theme of themes) {
    for (const pattern of theme.patterns) {
      const hit =
        typeof pattern === "string" ? queryNorm.includes(pattern) : pattern.test(queryNorm);
      if (hit) return theme;
    }
  }
  return null;
}
