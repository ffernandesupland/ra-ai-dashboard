import { ReportType } from "@/generated/prisma/enums";
import {
  Coercer,
  normaliseQuery,
  normaliseSearchType,
  splitCollections,
  splitSolutionIds,
} from "./coerce";
import type { ParsedReport, ParseWarning } from "./parse";

export interface GapAnalysisInput {
  ordinal: number;
  askedOn: Date;
  username: string;
  firstName: string | null;
  lastName: string | null;
  portalGroup: string;
  query: string;
  queryNorm: string;
  searchType: "KEYWORD" | "NEURAL" | "HYBRID" | "UNKNOWN";
  answered: boolean;
  referenceSolutions: string[];
  contextSet: string[];
  mrr: number | null;
}

export interface SolutionUsageInput {
  solutionId: string;
  title: string;
  citations: number;
  pctOfTotal: number | null;
  daysSinceModified: number | null;
  collections: string[];
}

export interface AiKaSolutionInput {
  solutionId: string;
  title: string;
  status: string;
  lastModifiedAt: Date | null;
  collections: string[];
  aiActions: number;
}

export interface DailySummaryInput {
  date: Date;
  questions: number;
  answered: number;
  unanswered: number;
  pctAnswered: number | null;
  referenceSolutionView: number;
}

export interface TtfaQueryInput {
  ordinal: number;
  askedAt: Date | null;
  answeredAt: Date | null;
  username: string;
  sessionId: string;
  searchText: string;
  ttfaSec: number;
}

export type MappedReport =
  | { kind: "gapAnalysis"; rows: GapAnalysisInput[]; warnings: ParseWarning[] }
  | { kind: "solutionUsage"; rows: SolutionUsageInput[]; warnings: ParseWarning[] }
  | { kind: "aiKaSolution"; rows: AiKaSolutionInput[]; warnings: ParseWarning[] }
  | { kind: "dailySummary"; rows: DailySummaryInput[]; warnings: ParseWarning[] }
  | { kind: "ttfaQuery"; rows: TtfaQueryInput[]; warnings: ParseWarning[] }
  | { kind: "aggregate"; rows: Record<string, unknown>[]; warnings: ParseWarning[] };

export function mapReport(parsed: ParsedReport): MappedReport {
  switch (parsed.reportType) {
    case ReportType.GEN_SEARCH_GAP_ANALYSIS:
      return mapGapAnalysis(parsed);
    case ReportType.GEN_USAGE_BY_SOLUTION:
      return mapSolutionUsage(parsed);
    case ReportType.AIKA_USAGE_BY_SOLUTION:
      return mapAiKaSolution(parsed);
    case ReportType.GEN_SUMMARY_BY_DAY:
      return mapDailySummary(parsed);
    case ReportType.GEN_TTFA_BY_QUERY:
      return mapTtfaQuery(parsed);
    default:
      return mapAggregate(parsed);
  }
}

function mapGapAnalysis(parsed: ParsedReport): MappedReport {
  const c = new Coercer();
  const rows: GapAnalysisInput[] = [];
  parsed.rows.forEach((row, index) => {
    const askedOn = c.isoDate(row["Date"], index, "Date");
    if (!askedOn) return;
    const query = row["Query"] ?? "";
    rows.push({
      ordinal: index,
      askedOn,
      username: row["Username"] ?? "",
      firstName: row["First Name"] || null,
      lastName: row["Last Name"] || null,
      portalGroup: row["Portal Group"] ?? "",
      query,
      queryNorm: normaliseQuery(query),
      searchType: normaliseSearchType(row["Search Type"]),
      answered: c.bool(row["Response"]),
      referenceSolutions: splitSolutionIds(row["Reference Solutions"]),
      contextSet: splitSolutionIds(row["Context Set"]),
      mrr: c.float(row["Mean Reciprocal Rank - MRR"], index, "Mean Reciprocal Rank - MRR"),
    });
  });
  return { kind: "gapAnalysis", rows, warnings: c.warnings };
}

function mapSolutionUsage(parsed: ParsedReport): MappedReport {
  const c = new Coercer();
  const rows: SolutionUsageInput[] = [];
  const seen = new Set<string>();
  parsed.rows.forEach((row, index) => {
    const solutionId = (row["Solution ID"] ?? "").trim();
    const citations = c.int(row["Count"], index, "Count");
    if (!solutionId || citations === null) return;
    if (seen.has(solutionId)) {
      c.warnings.push({
        code: "duplicate_key",
        message: `Solution ${solutionId} appears more than once; keeping the first row.`,
        row: index + 4,
      });
      return;
    }
    seen.add(solutionId);
    rows.push({
      solutionId,
      title: row["Title"] ?? "",
      citations,
      pctOfTotal: c.float(row["% of Total"], index, "% of Total"),
      daysSinceModified: c.int(
        row["Days Since Last Modified"],
        index,
        "Days Since Last Modified",
      ),
      collections: splitCollections(row["Collection"]),
    });
  });
  return { kind: "solutionUsage", rows, warnings: c.warnings };
}

function mapAiKaSolution(parsed: ParsedReport): MappedReport {
  const c = new Coercer();
  const rows: AiKaSolutionInput[] = [];
  const seen = new Set<string>();
  parsed.rows.forEach((row, index) => {
    const solutionId = (row["Solution ID"] ?? "").trim();
    if (!solutionId || seen.has(solutionId)) return;
    seen.add(solutionId);
    rows.push({
      solutionId,
      title: row["Title"] ?? "",
      status: (row["Status"] ?? "").trim(),
      lastModifiedAt: c.timestamp(row["Last Modified Date"], index, "Last Modified Date"),
      collections: splitCollections(row["Collections"]),
      aiActions: c.int(row["AI Actions"], index, "AI Actions") ?? 0,
    });
  });
  return { kind: "aiKaSolution", rows, warnings: c.warnings };
}

function mapDailySummary(parsed: ParsedReport): MappedReport {
  const c = new Coercer();
  const rows: DailySummaryInput[] = [];
  parsed.rows.forEach((row, index) => {
    const date = c.isoDate(row["Date"], index, "Date");
    if (!date) return;
    rows.push({
      date,
      questions: c.int(row["Questions"], index, "Questions") ?? 0,
      answered: c.int(row["Answered questions"], index, "Answered questions") ?? 0,
      unanswered: c.int(row["Unanswered questions"], index, "Unanswered questions") ?? 0,
      pctAnswered: c.float(row["% Answered questions"], index, "% Answered questions"),
      referenceSolutionView:
        c.int(row["Reference solution view"], index, "Reference solution view") ?? 0,
    });
  });
  return { kind: "dailySummary", rows, warnings: c.warnings };
}

function mapTtfaQuery(parsed: ParsedReport): MappedReport {
  const c = new Coercer();
  const rows: TtfaQueryInput[] = [];
  parsed.rows.forEach((row, index) => {
    const ttfaSec = c.int(row["TTFA (sec)"], index, "TTFA (sec)");
    if (ttfaSec === null) return;
    rows.push({
      ordinal: index,
      askedAt: c.backslashDateTime(row["User Question Time"], index, "User Question Time"),
      answeredAt: c.backslashDateTime(row["Answer Time"], index, "Answer Time"),
      username: row["Username"] ?? "",
      sessionId: (row["Session ID"] ?? "").trim(),
      searchText: row["Search Text"] ?? "",
      ttfaSec,
    });
  });
  return { kind: "ttfaQuery", rows, warnings: c.warnings };
}

/**
 * Rollup reports become JSON with camelCased keys, which also reconciles the
 * casing drift between exports ("First Name" vs "First name", "Portal Group" vs "Portal group").
 */
function mapAggregate(parsed: ParsedReport): MappedReport {
  const keys = new Map(parsed.headers.map((h) => [h, camelise(h)]));
  const rows = parsed.rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [header, key] of keys) {
      out[key] = typedValue(header, row[header]);
    }
    return out;
  });
  return { kind: "aggregate", rows, warnings: [] };
}

export function camelise(header: string): string {
  const tokens = header
    .replace(/%/g, " pct ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  return tokens
    .map((token, i) => {
      const lower = token.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** Identifier-like columns stay strings; usernames such as "123" must not become numbers. */
const STRING_COLUMNS = /id|name|user|role|collection|title|group|type|adoption|status|text|query/i;

function typedValue(header: string, raw: string | undefined): string | number | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (STRING_COLUMNS.test(header)) return value;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
