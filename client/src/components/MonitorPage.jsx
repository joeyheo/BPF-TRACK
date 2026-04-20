import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Polyline } from 'react-leaflet';
import MetricCard from './MetricCard';
import StatsTable from './StatsTable';
import { summarize } from '../utils/stats';
import { downloadCsv } from '../utils/export';
import { formatMs, formatNumber, nowEpochMs } from '../utils/time';

const MAX_SAMPLES = 1000;
const DEFAULT_SERVER = import.meta.env.VITE_WS_URL || 'wss://gpspseudotelemetrylab-production.up.railway.app';

export default function MonitorPage() {
  const [params] = useSearchParams();
  const sessionId = params.get('session') || 'default-session';
  const serverUrl = params.get('server') || DEFAULT_SERVER;

  const [connectionState, setConnectionState] = useState('connecting');
  const [clockSync, setClockSync] = useState({ offsetMs: 0, bestRttMs: NaN, sampleCount: 0 });
  const [samples, setSamples] = useState([]);
  const [latestSample, setLatestSample] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Waiting for streamed GPS packets...');

  const pendingSyncsRef = useRef(new Map());
  const bestSyncRef = useRef({ offsetMs: 0, bestRttMs: Infinity, sampleCount: 0 });
  const lastArrivalRef = useRef(null);

  useEffect(() => {
    const socket = new WebSocket(serverUrl);

    socket.onopen = () => {
      setConnectionState('open');
      socket.send(JSON.stringify({ type: 'hello', role: 'monitor', sessionId }));
      setStatusMessage(`Connected to ${serverUrl} for session ${sessionId}.`);
    };

    socket.onclose = () => {
      setConnectionState('closed');
      setStatusMessage('WebSocket closed.');
    };

    socket.onerror = () => {
      setConnectionState('error');
      setStatusMessage('WebSocket error.');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'timesync_response') {
          const t1 = nowEpochMs();
          const pending = pendingSyncsRef.current.get(data.reqId);
          if (!pending) return;
          pendingSyncsRef.current.delete(data.reqId);
          const rttMs = t1 - pending.t0;
          const midpoint = (pending.t0 + t1) / 2;
          const offsetMs = data.serverReceiveEpochMs - midpoint;
          const currentBest = bestSyncRef.current;
          const useThisSample = !Number.isFinite(currentBest.bestRttMs) || rttMs < currentBest.bestRttMs;
          const next = {
            offsetMs: useThisSample ? offsetMs : currentBest.offsetMs,
            bestRttMs: useThisSample ? rttMs : currentBest.bestRttMs,
            sampleCount: currentBest.sampleCount + 1,
          };
          bestSyncRef.current = next;
          setClockSync(next);
          return;
        }

        if (data.type === 'gps_sample_relay') {
          const pcReceiveLocalEpochMs = nowEpochMs();
          const pcReceiveEstimatedServerEpochMs = pcReceiveLocalEpochMs + bestSyncRef.current.offsetMs;
          const monitorInterarrivalMs = lastArrivalRef.current
            ? pcReceiveLocalEpochMs - lastArrivalRef.current
            : NaN;
          lastArrivalRef.current = pcReceiveLocalEpochMs;

          const sample = {
            seq: data.seq,
            latitude: data.gps.latitude,
            longitude: data.gps.longitude,
            altitude: data.gps.altitude,
            accuracy: data.gps.accuracy,
            serverReceivedEpochMs: data.serverReceivedEpochMs,
            serverForwardEpochMs: data.serverForwardEpochMs,
            phoneSendEstimatedServerEpochMs: data.phoneSendEstimatedServerEpochMs,
            phoneCallbackIntervalMs: data.callbackIntervalMs,
            geolocationAgeAtSendMs: data.geolocationAgeAtSendMs,
            pcReceiveLocalEpochMs,
            pcReceiveEstimatedServerEpochMs,
            monitorInterarrivalMs,
            phoneToServerLatencyMs: data.serverReceivedEpochMs - data.phoneSendEstimatedServerEpochMs,
            serverToMonitorLatencyMs: pcReceiveEstimatedServerEpochMs - data.serverForwardEpochMs,
            endToEndLatencyMs: pcReceiveEstimatedServerEpochMs - data.phoneSendEstimatedServerEpochMs,
          };

          setLatestSample(sample);
          setSamples((previous) => [...previous, sample].slice(-MAX_SAMPLES));
          setStatusMessage(`Received seq ${sample.seq}.`);
        }
      } catch (error) {
        console.error('Failed to parse monitor message', error);
      }
    };

    const syncIntervalId = window.setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const reqId = crypto.randomUUID();
      const t0 = nowEpochMs();
      pendingSyncsRef.current.set(reqId, { t0 });
      socket.send(JSON.stringify({
        type: 'timesync_request',
        reqId,
        role: 'monitor',
        sessionId,
        t0LocalEpochMs: t0,
      }));
    }, 2000);

    return () => {
      window.clearInterval(syncIntervalId);
      socket.close();
    };
  }, [serverUrl, sessionId]);

  const phoneCallbackSummary = useMemo(
    () => summarize(samples.map((row) => row.phoneCallbackIntervalMs).filter(Number.isFinite)),
    [samples]
  );
  const interarrivalSummary = useMemo(
    () => summarize(samples.map((row) => row.monitorInterarrivalMs).filter(Number.isFinite)),
    [samples]
  );
  const uplinkSummary = useMemo(
    () => summarize(samples.map((row) => row.phoneToServerLatencyMs).filter(Number.isFinite)),
    [samples]
  );
  const downlinkSummary = useMemo(
    () => summarize(samples.map((row) => row.serverToMonitorLatencyMs).filter(Number.isFinite)),
    [samples]
  );
  const endToEndSummary = useMemo(
    () => summarize(samples.map((row) => row.endToEndLatencyMs).filter(Number.isFinite)),
    [samples]
  );

  const recentChartData = samples.slice(-80).map((row) => ({
    seq: row.seq,
    endToEndLatencyMs: Number.isFinite(row.endToEndLatencyMs) ? row.endToEndLatencyMs : null,
    phoneCallbackIntervalMs: Number.isFinite(row.phoneCallbackIntervalMs) ? row.phoneCallbackIntervalMs : null,
    monitorInterarrivalMs: Number.isFinite(row.monitorInterarrivalMs) ? row.monitorInterarrivalMs : null,
  }));

  const path = samples
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
    .map((row) => [row.latitude, row.longitude]);
  const latestCenter = latestSample ? [latestSample.latitude, latestSample.longitude] : [37.5665, 126.9780];

  return (
    <div className="page-shell">
      <div className="top-bar">
        <Link to="/" className="plain-link">← Home</Link>
        <span className={`pill ${connectionState}`}>{connectionState}</span>
        <span className="pill neutral">session: {sessionId}</span>
      </div>

      <div className="header-block">
        <h1>Monitor dashboard</h1>
        <p className="lede">Estimates one-way and end-to-end latency using a shared server clock and displays the streamed trajectory live.</p>
      </div>

      <div className="button-row">
        <button className="secondary-button" onClick={() => downloadCsv(`monitor-${sessionId}.csv`, samples)}>
          Export CSV
        </button>
      </div>

      <p className="status-line">{statusMessage}</p>

      <div className="metrics-grid">
        <MetricCard label="Samples received" value={String(samples.length)} subvalue={`Best sync RTT: ${formatMs(clockSync.bestRttMs)}`} />
        <MetricCard label="End-to-end mean" value={formatMs(endToEndSummary.mean)} subvalue={`P95: ${formatMs(endToEndSummary.p95)}`} />
        <MetricCard label="Phone-to-server mean" value={formatMs(uplinkSummary.mean)} subvalue={`P95: ${formatMs(uplinkSummary.p95)}`} />
        <MetricCard label="Server-to-monitor mean" value={formatMs(downlinkSummary.mean)} subvalue={`P95: ${formatMs(downlinkSummary.p95)}`} />
      </div>

      <div className="two-column-grid">
        <StatsTable title="Phone callback interval" summary={phoneCallbackSummary} />
        <StatsTable title="Monitor interarrival interval" summary={interarrivalSummary} />
      </div>

      <div className="two-column-grid">
        <StatsTable title="Phone-to-server latency" summary={uplinkSummary} />
        <StatsTable title="Server-to-monitor latency" summary={downlinkSummary} />
      </div>

      <StatsTable title="End-to-end phone-to-monitor latency" summary={endToEndSummary} />

      <div className="two-column-grid wide-first">
        <div className="panel chart-panel">
          <h3>Recent timing traces</h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={recentChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="seq" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="endToEndLatencyMs" dot={false} name="End-to-end latency (ms)" />
              <Line type="monotone" dataKey="phoneCallbackIntervalMs" dot={false} name="Phone callback interval (ms)" />
              <Line type="monotone" dataKey="monitorInterarrivalMs" dot={false} name="Monitor interarrival (ms)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Latest sample</h3>
          {latestSample ? (
            <div className="key-value-grid">
              <div><strong>Seq</strong><span>{latestSample.seq}</span></div>
              <div><strong>Latitude</strong><span>{formatNumber(latestSample.latitude, 7)}</span></div>
              <div><strong>Longitude</strong><span>{formatNumber(latestSample.longitude, 7)}</span></div>
              <div><strong>Altitude</strong><span>{formatNumber(latestSample.altitude, 2)} m</span></div>
              <div><strong>Accuracy</strong><span>{formatNumber(latestSample.accuracy, 2)} m</span></div>
              <div><strong>End-to-end latency</strong><span>{formatMs(latestSample.endToEndLatencyMs)}</span></div>
              <div><strong>Phone-to-server</strong><span>{formatMs(latestSample.phoneToServerLatencyMs)}</span></div>
              <div><strong>Server-to-monitor</strong><span>{formatMs(latestSample.serverToMonitorLatencyMs)}</span></div>
              <div><strong>Phone callback interval</strong><span>{formatMs(latestSample.phoneCallbackIntervalMs)}</span></div>
              <div><strong>Geolocation age at send</strong><span>{formatMs(latestSample.geolocationAgeAtSendMs)}</span></div>
            </div>
          ) : (
            <p className="muted">Waiting for samples.</p>
          )}
        </div>
      </div>

      <div className="panel map-panel">
        <h3>Live trajectory</h3>
        <div className="map-wrapper">
          <MapContainer center={latestCenter} zoom={18} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />
            {path.length > 1 ? <Polyline positions={path} /> : null}
            {latestSample ? <CircleMarker center={latestCenter} radius={8} /> : null}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
