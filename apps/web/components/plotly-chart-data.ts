/** A bounded view of existing Plotly trace values, never a reconstructed valuation. */
export type ChartFigure = { data?: unknown[]; layout?: Record<string, unknown> };
export const CHART_PREVIEW_LIMITS = { series: 6, points: 50, cellLength: 120 } as const;
const fields = ["x", "y", "z", "labels", "values", "open", "high", "low", "close", "text"] as const;
type Field = typeof fields[number];
export type ChartDataRow = { series: number; name: string | null; point: number; values: Partial<Record<Field, string | null>> };

function cell(value: unknown, nested = false): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") return value.length > CHART_PREVIEW_LIMITS.cellLength ? value.slice(0, CHART_PREVIEW_LIMITS.cellLength - 1) + "…" : value;
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (nested) return "[…]";
    return cell("[" + value.slice(0, 8).map(item => cell(item, true) ?? "—").join(", ") + (value.length > 8 ? ", …" : "") + "]");
  }
  // Arbitrary objects are not serialized or traversed in a financial data cell.
  return null;
}

export function chartDataPreview(figure: ChartFigure) {
  const data = Array.isArray(figure?.data) ? figure.data : [];
  const traces = data.slice(0, CHART_PREVIEW_LIMITS.series).map((trace, series) => ({
    trace: trace && typeof trace === "object" ? trace as Record<string, unknown> : {}, series,
  }));
  const columns = fields.filter(field => traces.some(({ trace }) => Array.isArray(trace[field])));
  const rows: ChartDataRow[] = [];
  let availablePoints = 0;
  for (const { trace, series } of traces) {
    const count = Math.max(0, ...columns.map(field => Array.isArray(trace[field]) ? trace[field].length : 0));
    availablePoints += count;
    for (let point = 0; point < count && rows.length < CHART_PREVIEW_LIMITS.points; point += 1) {
      const values: ChartDataRow["values"] = {};
      for (const field of columns) values[field] = Array.isArray(trace[field]) ? cell(trace[field][point]) : null;
      rows.push({ series, name: typeof trace.name === "string" ? cell(trace.name) : null, point: point + 1, values });
    }
  }
  return { columns, rows, truncated: data.length > CHART_PREVIEW_LIMITS.series || availablePoints > rows.length };
}
