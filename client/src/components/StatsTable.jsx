import React from 'react';
import { formatMs, formatNumber } from '../utils/time';

export default function StatsTable({ title, summary }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      <table className="compact-table">
        <thead>
          <tr>
            <th>Count</th>
            <th>Mean</th>
            <th>Median</th>
            <th>P95</th>
            <th>Min</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{summary.count ?? 0}</td>
            <td>{formatMs(summary.mean)}</td>
            <td>{formatMs(summary.median)}</td>
            <td>{formatMs(summary.p95)}</td>
            <td>{formatMs(summary.min)}</td>
            <td>{formatMs(summary.max)}</td>
          </tr>
        </tbody>
      </table>
      {Number.isFinite(summary.mean) ? null : <p className="muted">Not enough samples yet.</p>}
    </div>
  );
}
