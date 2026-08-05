import { ReportType } from "@/generated/prisma/enums";

export { ReportType };

export type ReportKind = "typed" | "aggregate";

export interface ReportDefinition {
  type: ReportType;
  /** CSV line 1, verbatim from the export. Detection key. */
  title: string;
  /** Short name for the upload UI. */
  label: string;
  kind: ReportKind;
  /** Columns that must be present after header cleanup, or the file is rejected. */
  requiredColumns: string[];
  /** Dashboard tabs that degrade if this file is absent. */
  feeds: string[];
  /** Absent file blocks a headline metric rather than a supporting one. */
  critical: boolean;
}

/**
 * The 15 known exports. `title` is matched against CSV line 1 after normalisation,
 * because filenames vary by tenant and export tool ("superadmin_" prefixes, "(1)" suffixes).
 */
export const REPORTS: ReportDefinition[] = [
  {
    type: ReportType.GEN_SEARCH_GAP_ANALYSIS,
    title: "Gen Answers - Search and Gap Analysis",
    label: "Search & Gap Analysis",
    kind: "typed",
    requiredColumns: [
      "Date",
      "Username",
      "Portal Group",
      "Query",
      "Search Type",
      "Response",
      "Reference Solutions",
      "Mean Reciprocal Rank - MRR",
      "Context Set",
    ],
    feeds: ["Overview", "Demand", "Answer quality", "Knowledge health", "ROI"],
    critical: true,
  },
  {
    type: ReportType.GEN_USAGE_BY_SOLUTION,
    title: "Gen Answers - Usage by Solution",
    label: "Usage by Solution",
    kind: "typed",
    requiredColumns: ["Solution ID", "Title", "Count", "Days Since Last Modified"],
    feeds: ["Overview", "Knowledge health", "ROI"],
    critical: true,
  },
  {
    type: ReportType.AIKA_USAGE_BY_SOLUTION,
    title: "AI Knowledge Assistant - Usage By Solution",
    label: "AI KA — Usage by Solution",
    kind: "typed",
    requiredColumns: ["Solution ID", "Title", "Status", "AI Actions"],
    feeds: ["Knowledge health"],
    critical: true,
  },
  {
    type: ReportType.GEN_SUMMARY_BY_DAY,
    title: "Gen Answers - Summary by day",
    label: "Summary by Day",
    kind: "typed",
    requiredColumns: ["Date", "Questions", "Answered questions", "Unanswered questions"],
    feeds: ["Answer quality"],
    critical: false,
  },
  {
    type: ReportType.GEN_TTFA_BY_QUERY,
    title: "Gen Answers - Time to Answer by query",
    label: "Time to Answer by Query",
    kind: "typed",
    requiredColumns: ["Username", "Session ID", "Search Text", "TTFA (sec)"],
    feeds: ["Overview", "Answer quality", "ROI"],
    critical: true,
  },
  {
    type: ReportType.GEN_SUMMARY_BY_SEARCH_TYPE,
    title: "Gen Answers - Summary by search type",
    label: "Summary by Search Type",
    kind: "aggregate",
    requiredColumns: ["Search Type", "Questions", "Answered questions"],
    feeds: ["Answer quality"],
    critical: false,
  },
  {
    type: ReportType.GEN_SUMMARY_BY_USER,
    title: "Gen Answers - Summary by user",
    label: "Summary by User",
    kind: "aggregate",
    requiredColumns: ["Username", "Questions", "Answered questions"],
    feeds: ["Demand"],
    critical: false,
  },
  {
    type: ReportType.GEN_USAGE_BY_USER,
    title: "Gen Answers - Usage by User",
    label: "Usage by User",
    kind: "aggregate",
    requiredColumns: ["Username", "Questions"],
    feeds: ["Demand"],
    critical: false,
  },
  {
    type: ReportType.GEN_USAGE_BY_COLLECTION,
    title: "Gen Answers - Usage by Collection",
    label: "Usage by Collection",
    kind: "aggregate",
    requiredColumns: ["Collection", "References", "Distinct Solutions"],
    feeds: ["Overview", "Knowledge health"],
    critical: false,
  },
  {
    type: ReportType.GEN_TTFA_BY_PORTAL_GROUP,
    title: "Gen Answers - Time to Answer by Portal Group",
    label: "TTFA by Portal Group",
    kind: "aggregate",
    requiredColumns: ["Portal Group", "Answered Questions", "Avg TTFA (sec)"],
    feeds: ["Answer quality"],
    critical: false,
  },
  {
    type: ReportType.GEN_TTFA_BY_COLLECTION,
    title: "Gen Answers - Time to Answer by Collection",
    label: "TTFA by Collection",
    kind: "aggregate",
    requiredColumns: ["Collection", "Answered Questions", "Avg TTFA (sec)"],
    feeds: ["Answer quality"],
    critical: false,
  },
  {
    type: ReportType.GEN_TTFA_BY_USER,
    title: "Gen Answers - Time to Answer by User",
    label: "TTFA by User",
    kind: "aggregate",
    requiredColumns: ["Username", "Answered Questions", "Avg TTFA (sec)"],
    feeds: ["Answer quality"],
    critical: false,
  },
  {
    type: ReportType.AIKA_USAGE_BY_ROLE,
    title: "AI Knowledge Assistant - Usage By Role",
    label: "AI KA — Usage by Role",
    kind: "aggregate",
    requiredColumns: ["Role", "AI Actions", "Active Users"],
    feeds: ["Knowledge health"],
    critical: false,
  },
  {
    type: ReportType.AIKA_USAGE_BY_USER,
    title: "AI Knowledge Assistant - Usage By User",
    label: "AI KA — Usage by User",
    kind: "aggregate",
    requiredColumns: ["Username", "Role", "AI Actions"],
    feeds: ["Knowledge health"],
    critical: false,
  },
  {
    type: ReportType.AI_USAGE_BY_USER,
    title: "AI Usage by User",
    label: "AI Usage by User",
    kind: "aggregate",
    requiredColumns: ["User", "AI Knowledge Assistant", "AI Duplicate Summary"],
    feeds: ["Knowledge health"],
    critical: false,
  },
];

export const REPORT_BY_TYPE = new Map(REPORTS.map((r) => [r.type, r]));

export const EXPECTED_REPORT_COUNT = REPORTS.length;

export function reportDefinition(type: ReportType): ReportDefinition {
  const def = REPORT_BY_TYPE.get(type);
  if (!def) throw new Error(`Unknown report type: ${type}`);
  return def;
}
