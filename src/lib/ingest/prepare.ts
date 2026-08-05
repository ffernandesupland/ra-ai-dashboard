import { createHash } from "node:crypto";
import { ReportType } from "@/generated/prisma/enums";
import { EXPECTED_REPORT_COUNT, REPORTS, reportDefinition } from "@/lib/reports/definitions";
import { mapReport, type MappedReport } from "@/lib/reports/map";
import { ReportParseError, parseReportCsv, type ParsedReport, type ParseWarning } from "@/lib/reports/parse";
import type { SnapshotDataset } from "@/lib/metrics/types";

export interface UploadInput {
  name: string;
  content: string;
}

export interface PreparedFile {
  originalName: string;
  checksum: string;
  byteSize: number;
  reportType: ReportType;
  label: string;
  rowCount: number;
  titleLine: string;
  filterLine: string;
  warnings: ParseWarning[];
  parsed: ParsedReport;
  mapped: MappedReport;
}

export interface IngestIssue {
  file: string;
  message: string;
  detail?: string;
}

export interface PreparedBatch {
  files: PreparedFile[];
  errors: IngestIssue[];
  /** Reports that are missing from the batch. */
  missing: { reportType: ReportType; label: string; critical: boolean; feeds: string[] }[];
  windowStart: Date | null;
  windowEnd: Date | null;
  windowDays: number;
  dataset: SnapshotDataset | null;
  totalRows: number;
}

const MAX_FILES = 40;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Parses and validates an upload batch without writing anything. The result drives
 * the preview screen; nothing reaches the database until the operator commits.
 */
export function prepareBatch(inputs: UploadInput[]): PreparedBatch {
  const errors: IngestIssue[] = [];
  const files: PreparedFile[] = [];
  const seenTypes = new Map<string, string>();

  if (inputs.length > MAX_FILES) {
    return emptyBatch([{ file: "batch", message: `Too many files: ${inputs.length} (max ${MAX_FILES}).` }]);
  }

  for (const input of inputs) {
    const byteSize = Buffer.byteLength(input.content, "utf8");
    if (byteSize > MAX_BYTES) {
      errors.push({ file: input.name, message: `File exceeds the ${MAX_BYTES / 1024 / 1024}MB limit.` });
      continue;
    }
    try {
      const parsed = parseReportCsv(input.content, input.name);
      const existing = seenTypes.get(parsed.reportType);
      if (existing) {
        errors.push({
          file: input.name,
          message: `Duplicate report: "${parsed.definition.label}" was already supplied by ${existing}.`,
        });
        continue;
      }
      seenTypes.set(parsed.reportType, input.name);
      const mapped = mapReport(parsed);
      files.push({
        originalName: input.name,
        checksum: createHash("sha256").update(input.content).digest("hex"),
        byteSize,
        reportType: parsed.reportType,
        label: parsed.definition.label,
        rowCount: mapped.rows.length,
        titleLine: parsed.titleLine,
        filterLine: parsed.filterLine,
        warnings: [...parsed.warnings, ...mapped.warnings],
        parsed,
        mapped,
      });
    } catch (error) {
      if (error instanceof ReportParseError) {
        errors.push({ file: input.name, message: error.message, detail: error.detail });
      } else {
        errors.push({ file: input.name, message: (error as Error).message });
      }
    }
  }

  if (files.length === 0) return emptyBatch(errors);

  // All files in a batch must describe the same window, or the snapshot is meaningless.
  const windows = new Set(files.map((f) => `${f.parsed.windowStart.toISOString()}|${f.parsed.windowEnd.toISOString()}`));
  if (windows.size > 1) {
    const detail = files
      .map((f) => `${f.label}: ${f.parsed.windowStart.toISOString().slice(0, 10)} → ${f.parsed.windowEnd.toISOString().slice(0, 10)}`)
      .join("; ");
    errors.push({ file: "batch", message: "Files cover different date ranges.", detail });
    return emptyBatch(errors, files);
  }

  const { windowStart, windowEnd, windowDays } = files[0].parsed;
  const present = new Set(files.map((f) => f.reportType));
  const missing = REPORTS.filter((r) => !present.has(r.type)).map((r) => ({
    reportType: r.type,
    label: r.label,
    critical: r.critical,
    feeds: r.feeds,
  }));

  return {
    files,
    errors,
    missing,
    windowStart,
    windowEnd,
    windowDays,
    dataset: buildDataset(files, windowStart, windowEnd, windowDays),
    totalRows: files.reduce((sum, f) => sum + f.rowCount, 0),
  };
}

export function buildDataset(
  files: PreparedFile[],
  windowStart: Date,
  windowEnd: Date,
  windowDays: number,
): SnapshotDataset {
  const dataset: SnapshotDataset = {
    windowStart,
    windowEnd,
    windowDays,
    gapAnalysis: [],
    solutionUsage: [],
    aiKaSolutions: [],
    dailySummary: [],
    ttfaQueries: [],
    aggregates: {},
  };

  for (const file of files) {
    switch (file.mapped.kind) {
      case "gapAnalysis":
        dataset.gapAnalysis = file.mapped.rows;
        break;
      case "solutionUsage":
        dataset.solutionUsage = file.mapped.rows;
        break;
      case "aiKaSolution":
        dataset.aiKaSolutions = file.mapped.rows;
        break;
      case "dailySummary":
        dataset.dailySummary = file.mapped.rows;
        break;
      case "ttfaQuery":
        dataset.ttfaQueries = file.mapped.rows;
        break;
      case "aggregate":
        dataset.aggregates[file.reportType] = file.mapped.rows;
        break;
    }
  }
  return dataset;
}

function emptyBatch(errors: IngestIssue[], files: PreparedFile[] = []): PreparedBatch {
  return {
    files,
    errors,
    missing: REPORTS.map((r) => ({
      reportType: r.type,
      label: r.label,
      critical: r.critical,
      feeds: r.feeds,
    })),
    windowStart: null,
    windowEnd: null,
    windowDays: 0,
    dataset: null,
    totalRows: 0,
  };
}

export function coverageSummary(batch: PreparedBatch) {
  return {
    present: batch.files.length,
    expected: EXPECTED_REPORT_COUNT,
    missingCritical: batch.missing.filter((m) => m.critical).map((m) => m.label),
    labels: batch.files.map((f) => reportDefinition(f.reportType).label),
  };
}
