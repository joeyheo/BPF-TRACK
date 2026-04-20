import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import MetricCard from './MetricCard';
import StatsTable from './StatsTable';
import { summarize } from '../utils/stats';
import { downloadCsv } from '../utils/export';
import { formatMs, formatNumber, nowEpochMs, isoNow } from '../utils/time';

const MAX_LOGS = 600;
const DEFAULT_SERVER = 'ws://localhost:8080';

export default function PhonePage() {
  const [params] = useSearchParams();
  const sessionId = params.get('session') || 'default-session';
  const serverUrl = params.get('server') || DEFAULT_SERVER;

  const [connectionState, setConnectionState] = useState('connecting');
  const [clockSync, setClockSync] = useState({ offsetMs: 0, bestRttMs: NaN, sampleCount: 0, lastSyncedAt: null });
  const [logs, setLogs] = useState([]);
  const [latestPosition, setLatestPosition] = useState(null);
  const [isTracking, setIsTracking] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Waiting for geolocation permission...');

  const socketRef = useRef(null);
  const pendingSyncsRef = useRef(new Map());
  const bestSyncRef = useRef({ offsetMs: 0, bestRttMs: Infinity, sampleCount: 0, lastSyncedAt: null });
  const seqRef = useRef(0);
  const lastCallbackEpochMsRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    const socket = new WebSocket(serverUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionState('open');
      setStatusMessage('Connected. Requesting periodic time sync and geolocation updates.');
      socket.send(JSON.stringify({
        type: 'hello',
        role: 'phone',
        sessionId,
      }));
    };

    socket.onclose = () => {
      setConnectionState('closed');
      setStatusMessage('WebSocket closed. Reload or check the server.');
    };

    socket.onerror = () => {
      setConnectionState('error');
      setStatusMessage('WebSocket error. Check server URL, HTTPS/WSS, and firewall settings.');
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
            lastSyncedAt: Date.now(),
          };
          bestSyncRef.current = next;
          setClockSync(next);
        }

        if (data.type === 'gps_ack') {
          setLogs((previous) => {
            const updated = [...previous];
            const index = updated.findIndex((row) => row.seq === data.seq);
            if (index >= 0) {
              const row = updated[index];
              updated[index] = {
                ...row,
                serverReceivedEpochMs: data.serverReceivedEpochMs,
                phoneToServerLatencyMs: data.serverReceivedEpochMs - row.phoneSendEstimatedServerEpochMs,
                acked: true,
              };
            }
            return updated;
          });
        }
      } catch (error) {
        console.error('Failed to parse phone message', error);
      }
    };

    return () => {
      socket.close();
    };
  }, [serverUrl, sessionId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const reqId = crypto.randomUUID();
      const t0 = nowEpochMs();
      pendingSyncsRef.current.set(reqId, { t0 });
      socket.send(JSON.stringify({
        type: 'timesync_request',
        reqId,
        role: 'phone',
        sessionId,
        t0LocalEpochMs: t0,
      }));
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [sessionId]);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setStatusMessage('Geolocation is not supported by this browser.');
      return undefined;
    }

    if (!isTracking) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setStatusMessage('Tracking paused.');
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const callbackEpochMs = nowEpochMs();
        const callbackIntervalMs = lastCallbackEpochMsRef.current
          ? callbackEpochMs - lastCallbackEpochMsRef.current
          : NaN;
        lastCallbackEpochMsRef.current = callbackEpochMs;

        const phoneSendLocalEpochMs = nowEpochMs();
        const phoneSendEstimatedServerEpochMs = phoneSendLocalEpochMs + bestSyncRef.current.offsetMs;
        const geolocationAgeAtSendMs = phoneSendLocalEpochMs - position.timestamp;
        const seq = ++seqRef.current;

        const payload = {
          type: 'gps_sample',
          sessionId,
          seq,
          sentAtIso: isoNow(),
          phoneCallbackLocalEpochMs: callbackEpochMs,
          phoneSendLocalEpochMs,
          phoneSendEstimatedServerEpochMs,
          callbackIntervalMs,
          geolocationAgeAtSendMs,
          clockSyncBestRttMs: bestSyncRef.current.bestRttMs,
          gps: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          },
        };

        setLatestPosition(payload);
        setLogs((previous) => {
          const next = [
            ...previous,
            {
              seq,
              callbackIntervalMs,
              geolocationAgeAtSendMs,
              phoneSendEstimatedServerEpochMs,
              phoneSendLocalEpochMs,
              latitude: payload.gps.latitude,
              longitude: payload.gps.longitude,
              altitude: payload.gps.altitude,
              accuracy: payload.gps.accuracy,
              phoneToServerLatencyMs: NaN,
              acked: false,
            },
          ];
          return next.slice(-MAX_LOGS);
        });

        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(payload));
          setStatusMessage(`Streaming seq ${seq} to session ${sessionId}.`);
        } else {
          setStatusMessage('GPS callback received, but WebSocket is not open.');
        }
      },
      (error) => {
        setStatusMessage(`Geolocation error ${error.code}: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    watchIdRef.current = watchId;

    return () => {
      navigator.geolocation.clearWatch(watchId);
      watchIdRef.current = null;
    };
  }, [isTracking, sessionId]);

  const callbackSummary = useMemo(
    () => summarize(logs.map((row) => row.callbackIntervalMs).filter(Number.isFinite)),
    [logs]
  );
  const ageSummary = useMemo(
    () => summarize(logs.map((row) => row.geolocationAgeAtSendMs).filter(Number.isFinite)),
    [logs]
  );
  const uplinkSummary = useMemo(
    () => summarize(logs.map((row) => row.phoneToServerLatencyMs).filter(Number.isFinite)),
    [logs]
  );

  const ackedCount = logs.filter((row) => row.acked).length;
  const exportRows = logs.map((row) => ({
    sessionId,
    ...row,
  }));

  return (
    <div className="page-shell">
      <div className="top-bar">
        <Link to="/" className="plain-link">← Home</Link>
        <span className={`pill ${connectionState}`}>{connectionState}</span>
        <span className="pill neutral">session: {sessionId}</span>
      </div>

      <div className="header-block">
        <h1>Phone transmitter</h1>
        <p className="lede">Measures raw geolocation callback behavior at the source and estimates phone-to-server latency using lightweight clock sync.</p>
      </div>

      <div className="button-row">
        <button className="primary-button" onClick={() => setIsTracking((value) => !value)}>
          {isTracking ? 'Pause tracking' : 'Resume tracking'}
        </button>
        <button className="secondary-button" onClick={() => downloadCsv(`phone-${sessionId}.csv`, exportRows)}>
          Export CSV
        </button>
      </div>

      <p className="status-line">{statusMessage}</p>

      <div className="metrics-grid">
        <MetricCard label="Samples sent" value={String(logs.length)} subvalue={`Acked by server: ${ackedCount}`} />
        <MetricCard label="Best sync RTT" value={formatMs(clockSync.bestRttMs)} subvalue={`Sync samples: ${clockSync.sampleCount}`} />
        <MetricCard label="Clock offset to server" value={formatMs(clockSync.offsetMs)} subvalue="Used to approximate one-way latency" />
        <MetricCard label="Latest callback age" value={formatMs(latestPosition ? latestPosition.geolocationAgeAtSendMs : NaN)} subvalue="How old the position already was when sent" />
      </div>

      <div className="two-column-grid">
        <StatsTable title="Geolocation callback interval" summary={callbackSummary} />
        <StatsTable title="Geolocation timestamp age at send" summary={ageSummary} />
      </div>

      <StatsTable title="Approximate phone-to-server latency" summary={uplinkSummary} />

      <div className="panel">
        <h3>Latest position packet</h3>
        {latestPosition ? (
          <div className="key-value-grid">
            <div><strong>Latitude</strong><span>{formatNumber(latestPosition.gps.latitude, 7)}</span></div>
            <div><strong>Longitude</strong><span>{formatNumber(latestPosition.gps.longitude, 7)}</span></div>
            <div><strong>Altitude</strong><span>{formatNumber(latestPosition.gps.altitude, 2)}</span></div>
            <div><strong>Accuracy</strong><span>{formatNumber(latestPosition.gps.accuracy, 2)} m</span></div>
            <div><strong>Heading</strong><span>{formatNumber(latestPosition.gps.heading, 2)}</span></div>
            <div><strong>Speed</strong><span>{formatNumber(latestPosition.gps.speed, 2)} m/s</span></div>
            <div><strong>Seq</strong><span>{latestPosition.seq}</span></div>
            <div><strong>Position timestamp</strong><span>{new Date(latestPosition.gps.timestamp).toLocaleString()}</span></div>
          </div>
        ) : (
          <p className="muted">Waiting for the first geolocation callback.</p>
        )}
      </div>
    </div>
  );
}
