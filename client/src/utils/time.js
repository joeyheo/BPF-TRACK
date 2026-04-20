export function nowEpochMs() {
  return performance.timeOrigin + performance.now();
}

export function formatMs(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} ms`;
}

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function isoNow() {
  return new Date().toISOString();
}
