import Papa from "papaparse";
import { REPORTS, ReportType, type ReportDefinition } from "./definitions";

export interface ParseWarning {
  code:
    | "unknown_column"
    | "coerced_null"
    | "malformed_date"
    | "empty_row"
    | "duplicate_key"
    | "papaparse";
  message: string;
  row?: number;
  column?: string;
}

export interface ParsedReport {
  reportType: ReportType;
  definition: ReportDefinition;
  titleLine: string;
  filterLine: string;
  windowStart: Date;
  windowEnd: Date;
  windowDays: number;
  headers: string[];
  rows: Record<string, string>[];
  warnings: ParseWarning[];
}

export class ReportParseError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ReportParseError";
  }
}

/** Collapse to lowercase alphanumeric words so "Usage By Role" == "Usage by Role". */
function normaliseTitle(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Detects the report from CSV line 1. Filenames are unreliable: the same export
 * ships as "Gen Answers - Usage by User.csv", "superadmin_Gen Answers - Usage by User.csv"
 * and "..._(1).csv" depending on who downloaded it.
 */
export function detectReportType(titleLine: string): ReportDefinition | null {
  const normalised = normaliseTitle(titleLine);
  if (!normalised) return null;

  const exact = REPORTS.find((r) => normaliseTitle(r.title) === normalised);
  if (exact) return exact;

  // Longest containment wins, so "AI Usage by User" never shadows a longer title.
  const candidates = REPORTS.filter((r) => normalised.includes(normaliseTitle(r.title))).sort(
    (a, b) => b.title.length - a.title.length,
  );
  return candidates[0] ?? null;
}

const DATE_RANGE = /\((\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\)/;

/** Parses MM/DD/YYYY as a UTC date so the window never shifts with the server timezone. */
function parseUsDate(value: string): Date {
  const [month, day, year] = value.split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export interface ReportWindow {
  windowStart: Date;
  windowEnd: Date;
  windowDays: number;
}

/** Extracts the window from CSV line 2. Never hardcode 7 — it drives loop closure. */
export function extractWindow(filterLine: string): ReportWindow {
  const match = DATE_RANGE.exec(filterLine);
  if (!match) {
    throw new ReportParseError(
      "Could not read the date range from line 2 of the export.",
      filterLine.slice(0, 200),
    );
  }
  const windowStart = parseUsDate(match[1]);
  const windowEnd = parseUsDate(match[2]);
  if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) {
    throw new ReportParseError("The date range on line 2 is not a valid date pair.", match[0]);
  }
  if (windowEnd < windowStart) {
    throw new ReportParseError("The export's window ends before it starts.", match[0]);
  }
  const windowDays = Math.round((windowEnd.getTime() - windowStart.getTime()) / 86_400_000);
  return { windowStart, windowEnd, windowDays };
}

function isJunkColumn(name: string): boolean {
  const trimmed = name.trim();
  return trimmed === "" || /^unnamed/i.test(trimmed) || trimmed === "__parsed_extra";
}

/**
 * Every export shares a 3-line preamble:
 *   1: report title
 *   2: filter description carrying the date range
 *   3: column headers
 *   4+: data, each line ending in a trailing comma (phantom final column)
 */
export function parseReportCsv(content: string, originalName: string): ParsedReport {
  const warnings: ParseWarning[] = [];
  let trailingFieldRows = 0;
  const text = content.replace(/^\uFEFF/, "");

  const preambleEnd = nthLineBreak(text, 2);
  if (preambleEnd === -1) {
    throw new ReportParseError(
      `"${originalName}" is too short to be a RightAnswers export.`,
      "Expected a title line, a filter line, then a header row.",
    );
  }

  const [titleLine, filterLine] = text.slice(0, preambleEnd).split(/\r?\n/);
  const definition = detectReportType(titleLine);
  if (!definition) {
    throw new ReportParseError(
      `Unrecognised report: "${titleLine.trim().slice(0, 120)}"`,
      `File "${originalName}" does not match any of the ${REPORTS.length} known exports.`,
    );
  }

  const window = extractWindow(filterLine);
  const body = text.slice(preambleEnd + 1);

  const result = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  for (const error of result.errors) {
    // Every data line ends with a trailing comma while the header row does not,
    // so papaparse reports one "TooManyFields" per row. Summarised below instead.
    if (error.code === "TooManyFields") {
      trailingFieldRows += 1;
      continue;
    }
    if (warnings.length < 10) {
      warnings.push({
        code: "papaparse",
        message: error.message,
        row: typeof error.row === "number" ? error.row + 4 : undefined,
      });
    }
  }

  if (trailingFieldRows > 0) {
    warnings.push({
      code: "unknown_column",
      message: `Ignored a trailing empty field on ${trailingFieldRows} row(s).`,
    });
  }

  const rawHeaders = result.meta.fields ?? [];
  const headers = rawHeaders.filter((h) => !isJunkColumn(h));
  const dropped = rawHeaders.filter(isJunkColumn);
  if (dropped.length > 0) {
    warnings.push({
      code: "unknown_column",
      message: `Dropped ${dropped.length} empty trailing column(s).`,
    });
  }

  const missing = definition.requiredColumns.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new ReportParseError(
      `"${definition.label}" is missing required column(s): ${missing.join(", ")}`,
      `Found: ${headers.join(", ")}`,
    );
  }

  const rows: Record<string, string>[] = [];
  for (const raw of result.data) {
    const row: Record<string, string> = Object.create(null);
    let hasValue = false;
    for (const header of headers) {
      const value = (raw[header] ?? "").trim();
      row[header] = value;
      if (value !== "") hasValue = true;
    }
    if (hasValue) rows.push(row);
  }

  return {
    reportType: definition.type,
    definition,
    titleLine: titleLine.trim(),
    filterLine: filterLine.trim(),
    ...window,
    headers,
    rows,
    warnings,
  };
}

function nthLineBreak(text: string, count: number): number {
  let index = -1;
  for (let i = 0; i < count; i += 1) {
    index = text.indexOf("\n", index + 1);
    if (index === -1) return -1;
  }
  return index;
}
