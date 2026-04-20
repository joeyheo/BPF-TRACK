import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const defaultServerUrl = import.meta.env.VITE_WS_URL || 'wss://gpspseudotelemetrylab-production.up.railway.app';

export default function HomePage() {
  const [sessionId, setSessionId] = useState('rocket-test-01');
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);

  const encodedSession = useMemo(() => encodeURIComponent(sessionId.trim() || 'default-session'), [sessionId]);
  const encodedServer = useMemo(() => encodeURIComponent(serverUrl.trim() || defaultServerUrl), [serverUrl]);

  return (
    <div className="page-shell">
      <div className="hero-card">
        <p className="eyebrow">GPS Pseudo-Telemetry Lab</p>
        <h1>Measure real geolocation update behavior and end-to-end telemetry latency</h1>
        <p className="lede">
          This updated project separates geolocation callback timing, phone-to-server latency, and full
          phone-to-monitor transport delay so you can collect publishable results instead of just eyeballing a map.
        </p>

        <div className="form-grid">
          <label>
            Session ID
            <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
          </label>
          <label>
            WebSocket server URL
            <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} />
          </label>
        </div>

        <div className="button-row">
          <Link className="primary-button" to={`/phone?session=${encodedSession}&server=${encodedServer}`}>
            Open phone transmitter
          </Link>
          <Link className="secondary-button" to={`/monitor?session=${encodedSession}&server=${encodedServer}`}>
            Open monitor dashboard
          </Link>
        </div>

        <div className="info-grid">
          <div className="info-card">
            <h3>What gets measured</h3>
            <ul>
              <li>Geolocation callback interval</li>
              <li>Geolocation timestamp age at send</li>
              <li>Approximate phone-to-server latency</li>
              <li>Approximate server-to-monitor latency</li>
              <li>Approximate end-to-end phone-to-monitor latency</li>
              <li>Packet drops, stale data, and reconnect behavior</li>
            </ul>
          </div>
          <div className="info-card">
            <h3>Why this matters</h3>
            <ul>
              <li>No web standard guarantees a fixed geolocation update interval</li>
              <li>Different phones and browsers behave differently outdoors</li>
              <li>Clock sync is required to estimate one-way latency with useful accuracy</li>
              <li>CSV export makes it easier to analyze results later in Python or MATLAB</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
