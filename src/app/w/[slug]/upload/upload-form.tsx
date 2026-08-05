"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Chip } from "@/components/charts";
import { commitUpload, previewUpload, type PreviewResult } from "./actions";

export function UploadForm({ expectedReports, slug }: { expectedReports: number; slug: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  function toFormData(chosen: File[]) {
    const formData = new FormData();
    for (const file of chosen) formData.append("files", file);
    return formData;
  }

  function analyse(list: FileList | null) {
    if (!list || list.length === 0) return;
    const chosen = Array.from(list);
    setFiles(chosen);
    setError(null);
    setConflict(null);
    startTransition(async () => setResult(await previewUpload(toFormData(chosen))));
  }

  function commit(replaceExisting: boolean) {
    if (files.length === 0) return;
    setError(null);
    startTransition(async () => {
      const response = await commitUpload(toFormData(files), { slug, replaceExisting, label: label || undefined });
      if (response.ok && response.snapshotId) {
        router.push(`/w/${slug}/dashboard/${response.snapshotId}`);
        return;
      }
      if (response.conflictSnapshotId) setConflict(response.conflictSnapshotId);
      setError(response.message ?? "Commit failed.");
    });
  }

  const preview = result?.preview;

  return (
    <>
      <div
        className="dropzone"
        data-over={over}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          analyse(event.dataTransfer.files);
        }}
      >
        <p style={{ margin: 0, color: "var(--ink)" }}>
          Drop this week&apos;s {expectedReports} CSV exports here, or click to choose files.
        </p>
        <p style={{ margin: "6px 0 0" }}>
          Reports are identified by their title line, so filenames and prefixes do not matter.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,text/csv"
          hidden
          onChange={(event) => analyse(event.target.files)}
        />
      </div>

      {pending ? <p className="mono" style={{ marginTop: 16 }}>Parsing…</p> : null}

      {preview ? (
        <section style={{ marginTop: 24 }}>
          {preview.errors.length > 0 ? (
            <div className="notice notice-bad">
              <strong>{preview.errors.length} file(s) could not be parsed.</strong>
              <ul>
                {preview.errors.map((e) => (
                  <li key={e.file + e.message}>
                    {e.file}: {e.message}
                    {e.detail ? <div className="mono" style={{ fontSize: 11 }}>{e.detail}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? <div className="notice notice-bad">{error}</div> : null}

          <div className="card">
            <h3 className="card-title">Window</h3>
            <p style={{ color: "var(--ink)", fontSize: 16 }} className="mono">
              {preview.windowStart} → {preview.windowEnd} ({preview.windowDays} days)
            </p>
            <p>
              Read from line 2 of the exports, not assumed. This value drives loop closure, so a
              mismatched window would silently change the headline metric.
            </p>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h3 className="card-title">
              Coverage — {preview.files.length} of {expectedReports} reports · {preview.totalRows} rows
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>File</th>
                  <th className="num">Rows</th>
                  <th className="num">Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.files.map((file) => (
                  <tr key={file.label}>
                    <td>{file.label}</td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--slate)" }}>
                      {file.originalName}
                    </td>
                    <td className="num">{file.rowCount}</td>
                    <td className="num">
                      {file.warnings.length ? (
                        <Chip kind="warm">{file.warnings.length} warning</Chip>
                      ) : (
                        <Chip kind="ok">clean</Chip>
                      )}
                    </td>
                  </tr>
                ))}
                {preview.missing.map((missing) => (
                  <tr key={missing.label}>
                    <td style={{ color: "var(--slate)" }}>{missing.label}</td>
                    <td colSpan={2} style={{ color: "var(--slate)", fontSize: 12 }}>
                      missing — affects {missing.feeds.join(", ")}
                    </td>
                    <td className="num">
                      <Chip kind={missing.critical ? "hot" : "neutral"}>
                        {missing.critical ? "critical" : "optional"}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <label htmlFor="label">Snapshot label (optional)</label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Week 30 — customer tenant"
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                className="btn"
                disabled={pending || !result?.ok}
                onClick={() => commit(false)}
                type="button"
              >
                Commit snapshot
              </button>
              {conflict ? (
                <button className="btn btn-danger" disabled={pending} onClick={() => commit(true)} type="button">
                  Replace existing snapshot
                </button>
              ) : null}
            </div>
            {conflict ? (
              <p style={{ marginTop: 10 }}>
                A committed snapshot already covers this window. Replacing marks the old one
                superseded; it is kept for audit rather than deleted.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
