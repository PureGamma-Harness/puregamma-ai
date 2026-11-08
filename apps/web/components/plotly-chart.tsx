"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { chartDataPreview, CHART_PREVIEW_LIMITS, type ChartFigure } from "@/components/plotly-chart-data";

type PlotlyApi = {
  newPlot: (el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown) => Promise<unknown>;
  purge: (el: HTMLElement) => void;
};
declare global { interface Window { Plotly?: PlotlyApi } }
const LIBRARY_WAIT_MS = 5_000;
const RENDER_WAIT_MS = 10_000;
type State = "loading" | "ready" | "error";

export function PlotlyChart({ figure, className = "h-72" }: { figure: ChartFigure; className?: string }) {
  const locale = useLocale();
  const zh = locale === "zh";
  const host = useRef<HTMLDivElement>(null);
  const dataId = useId();
  const [state, setState] = useState<State>("loading");
  const [attempt, retry] = useState(0);
  const preview = useMemo(() => chartDataPreview(figure), [figure]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    // Plotly cannot cancel an in-flight promise. Give each attempt its own
    // canvas so a late renderer can never write into its successor's canvas.
    const canvas = document.createElement("div");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    element.replaceChildren(canvas);
    let current = true;
    let rendering = false;
    let disposed = false;
    let api: PlotlyApi | undefined;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    setState("loading");

    const dispose = () => {
      canvas.remove();
      if (!rendering && api && !disposed) {
        disposed = true;
        try { api.purge(canvas); } catch { /* The canvas is already detached. */ }
      }
    };
    const fail = () => {
      if (!current) return;
      current = false;
      setState("error");
      dispose();
    };
    const waitForLibrary = () => {
      if (!current) return;
      if (!window.Plotly || typeof window.Plotly.newPlot !== "function") {
        poll = setTimeout(waitForLibrary, 100);
        return;
      }
      clearTimeout(deadline);
      api = window.Plotly;
      rendering = true;
      deadline = setTimeout(fail, RENDER_WAIT_MS);
      const layout = figure?.layout && typeof figure.layout === "object" ? figure.layout : {};
      Promise.resolve()
        .then(() => current ? api!.newPlot(canvas, Array.isArray(figure?.data) ? figure.data : [], {
          autosize: true, margin: { t: 36, r: 16, b: 42, l: 52 }, ...layout,
        }, { responsive: true, displaylogo: false }) : undefined)
        .then(() => { if (current) setState("ready"); })
        .catch(fail)
        .finally(() => {
          clearTimeout(deadline);
          rendering = false;
          if (!current) dispose();
        });
    };
    deadline = setTimeout(fail, LIBRARY_WAIT_MS);
    waitForLibrary();
    return () => {
      current = false;
      clearTimeout(poll);
      clearTimeout(deadline);
      dispose();
    };
  }, [figure, attempt]);

  return <div className="min-w-0 space-y-3">
    <div className="relative">
      <div ref={host} className={className} data-plotly-chart data-state={state}
        role={state === "ready" ? "group" : undefined}
        aria-label={state === "ready" ? (zh ? "交互图表；可在下方查看数据预览" : "Interactive chart; data preview available below") : undefined}
        aria-hidden={state !== "ready"}
        style={{ visibility: state === "ready" ? "visible" : "hidden", ...(state === "error" ? { display: "none" } : {}) }} />
      {state === "loading" ? <div role="status" className="absolute inset-0 grid place-content-center rounded-xl border border-border-pg bg-bg-panel-muted p-5 text-center text-sm text-text-pg-muted">
        {zh ? "正在准备图表…" : "Preparing chart…"}
      </div> : null}
      {state === "error" ? <div role="alert" className="rounded-xl border border-status-warning bg-bg-panel-muted p-4 text-sm">
        <p className="font-semibold">{zh ? "图表暂不可用" : "Chart unavailable"}</p>
        <p className="mt-2 text-text-pg-muted">{zh ? "你可以重试，或查看下方已提供的数据。" : "Try again, or review the supplied data below."}</p>
        <button type="button" onClick={() => retry(value => value + 1)} className="mt-3 min-h-11 rounded-lg border border-border-pg px-3 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          {zh ? "重试图表" : "Retry chart"}
        </button>
      </div> : null}
    </div>
    <details open={state === "error" ? true : undefined} className="min-w-0 rounded-lg border border-border-pg bg-bg-panel-muted p-3">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-controls={dataId}>
        {zh ? "查看图表数据" : "View chart data"}
      </summary>
      <div id={dataId}>
        <p className="my-3 text-xs leading-5 text-text-pg-muted">{zh
          ? `预览仅展示原始序列中最多 ${CHART_PREVIEW_LIMITS.series} 组、${CHART_PREVIEW_LIMITS.points} 个数据点；长值会截断，— 表示没有可展示的值。`
          : `Preview of up to ${CHART_PREVIEW_LIMITS.points} supplied points across ${CHART_PREVIEW_LIMITS.series} series. Long values are shortened; — means no displayable value.`}
          {preview.truncated ? (zh ? " 图表还包含其他数据。" : " The figure contains additional data.") : ""}</p>
        {preview.rows.length ? <div role="region" aria-label={zh ? "图表数据，可横向滚动" : "Chart data, scroll horizontally"} tabIndex={0} className="max-w-full overflow-x-auto" style={{ maxWidth: "100%", overflowX: "auto" }}>
          <table aria-label={zh ? "图表数据预览" : "Chart data preview"} className="w-full text-left text-xs">
            <thead><tr><th scope="col" className="px-2 py-2">{zh ? "序列" : "Series"}</th><th scope="col" className="px-2 py-2">{zh ? "数据点" : "Point"}</th>{preview.columns.map(column => <th scope="col" key={column} className="px-2 py-2">{column}</th>)}</tr></thead>
            <tbody>{preview.rows.map(row => <tr key={`${row.series}:${row.point}`} className="border-t border-border-pg">
              <th scope="row" className="max-w-48 break-words px-2 py-2 font-medium">{row.name || `${zh ? "序列" : "Series"} ${row.series + 1}`}</th>
              <td className="px-2 py-2 tabular-nums">{row.point}</td>{preview.columns.map(column => <td key={column} className="max-w-48 break-words px-2 py-2 tabular-nums">{row.values[column] ?? "—"}</td>)}
            </tr>)}</tbody>
          </table>
        </div> : <p className="text-sm text-text-pg-muted">{zh ? "当前图表没有可预览的表格数据。" : "This figure has no tabular series data to preview."}</p>}
      </div>
    </details>
  </div>;
}
