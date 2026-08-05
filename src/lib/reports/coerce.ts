import type { ParseWarning } from "./parse";

/** Collects coercion failures so the upload preview can show what was dropped. */
export class Coercer {
  readonly warnings: ParseWarning[] = [];

  constructor(private readonly rowOffset = 4) {}

  private warn(code: ParseWarning["code"], message: string, index: number, column?: string) {
    if (this.warnings.length < 200) {
      this.warnings.push({ code, message, row: index + this.rowOffset, column });
    }
  }

  /** Returns null rather than 0 when a value will not parse. A missing count is not a zero count. */
  int(value: string | undefined, index: number, column: string): number | null {
    if (value === undefined || value === "") return null;
    const cleaned = value.replace(/[,\s]/g, "");
    const parsed = Number.parseInt(cleaned, 10);
    if (!Number.isFinite(parsed)) {
      this.warn("coerced_null", `"${value}" is not an integer`, index, column);
      return null;
    }
    return parsed;
  }

  float(value: string | undefined, index: number, column: string): number | null {
    if (value === undefined || value === "") return null;
    const cleaned = value.replace(/[%,\s]/g, "");
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) {
      this.warn("coerced_null", `"${value}" is not a number`, index, column);
      return null;
    }
    return parsed;
  }

  /** `Response` arrives as TRUE/FALSE, True/False or 1/0 depending on the export tool. */
  bool(value: string | undefined): boolean {
    const upper = (value ?? "").trim().toUpperCase();
    return upper === "TRUE" || upper === "1" || upper === "YES" || upper === "Y";
  }

  /** ISO date (YYYY-MM-DD) held in UTC so day bucketing never shifts. */
  isoDate(value: string | undefined, index: number, column: string): Date | null {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) {
      this.warn("malformed_date", `"${value}" is not an ISO date`, index, column);
      return null;
    }
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  /** "2026-07-27 12:02:00.67" from the AI KA export. */
  timestamp(value: string | undefined, index: number, column: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value.trim().replace(" ", "T") + "Z");
    if (Number.isNaN(parsed.getTime())) {
      this.warn("malformed_date", `"${value}" is not a timestamp`, index, column);
      return null;
    }
    return parsed;
  }

  /**
   * "07\21\2026 08:04:15 AM EDT" — backslash separators plus a timezone abbreviation,
   * which breaks every standard date parser.
   */
  backslashDateTime(value: string | undefined, index: number, column: string): Date | null {
    if (!value) return null;
    const match =
      /^(\d{2})[\\/](\d{2})[\\/](\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?\s*([A-Z]{2,4})?$/i.exec(
        value.trim(),
      );
    if (!match) {
      this.warn("malformed_date", `"${value}" is not a recognised timestamp`, index, column);
      return null;
    }
    const [, mm, dd, yyyy, hh, min, sec, meridiem, zone] = match;
    let hour = Number(hh);
    if (meridiem?.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (meridiem?.toUpperCase() === "AM" && hour === 12) hour = 0;

    const offsetHours = TZ_OFFSETS[(zone ?? "UTC").toUpperCase()];
    if (offsetHours === undefined) {
      this.warn("malformed_date", `Unknown timezone "${zone}", read as UTC`, index, column);
    }
    return new Date(
      Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min), Number(sec)) -
        (offsetHours ?? 0) * 3_600_000,
    );
  }
}

const TZ_OFFSETS: Record<string, number> = {
  UTC: 0,
  GMT: 0,
  EDT: -4,
  EST: -5,
  CDT: -5,
  CST: -6,
  MDT: -6,
  MST: -7,
  PDT: -7,
  PST: -8,
};

/**
 * `Context Set` and `Reference Solutions` are space-separated 15-digit ID lists.
 * IDs stay strings: parsed as numbers they lose precision in JS and joins fail silently.
 */
export function splitSolutionIds(value: string | undefined): string[] {
  if (!value) return [];
  return value.trim().split(/\s+/).filter(Boolean);
}

/** Collection lists are semicolon-delimited and may contain commas, quotes and backslashes. */
export function splitCollections(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Query normalisation used for every clustering operation.
 * Lowercase, collapse whitespace, strip trailing "?". No stemming, no fuzzy matching —
 * two queries are the same only if they normalise identically.
 */
export function normaliseQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/\?+$/, "").trim();
}

export function normaliseSearchType(value: string | undefined): "KEYWORD" | "NEURAL" | "HYBRID" | "UNKNOWN" {
  switch ((value ?? "").trim().toLowerCase()) {
    case "keyword":
      return "KEYWORD";
    case "neural":
      return "NEURAL";
    case "hybrid":
      return "HYBRID";
    default:
      return "UNKNOWN";
  }
}
