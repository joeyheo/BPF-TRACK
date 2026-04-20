export function mean(values) {
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function min(values) {
  if (!values.length) return NaN;
  return Math.min(...values);
}

export function max(values) {
  if (!values.length) return NaN;
  return Math.max(...values);
}

export function summarize(values) {
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    p95: percentile(values, 0.95),
    min: min(values),
    max: max(values),
  };
}
