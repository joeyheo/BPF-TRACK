# [BPF-TRACK] Browser-based Pseudo-telemetry Framework for early-stage functional validation of directional TRACKing systems

**Companion repository for:** *An Open-Source Browser-Based Pseudo-Telemetry Framework for Early-Stage Functional Validation of Directional Tracking Systems*, Sunghyun (Joey) Heo, AIAA Journal of Aerospace Information Systems, submitted 2026.

## What this is

This is a small, commodity-hardware framework that lets you drive a directional tracker — an antenna tracker, a camera mount, or any other position-responsive pointing system — from a **smartphone acting as a moving surrogate target**. Your phone's browser streams its position over WebSocket; a ground-side PC receives the stream and uses it as pseudo-telemetry in place of a real live target.

It's intended to fill the awkward gap between software-only simulation and full integrated field test: you can exercise your *real* telemetry-to-motion chain without relocating your actual target-generating system for every iteration.

## What the paper measured

Over a 385-sample outdoor field run:
- Update rate: stable **1 Hz** (95th-percentile callback interval 1008 ms)
- Reported horizontal accuracy: **6.92 m** mean
- End-to-end latency: **113.5 ms** mean, **139.5 ms** at the 95th percentile
- **100%** of samples arrived within one update period → qualifies as *soft real-time*
- Zero sequence gaps

The paper also derives an operating envelope: required tracker slew rate, angular pointing uncertainty, and minimum usable range for representative antenna beamwidths.

## Quick start

### Live demo
- Frontend: https://gps-pseudotelemetry-lab.vercel.app/
- WebSocket relay: `wss://gpspseudotelemetrylab-production.up.railway.app`

Open the phone transmitter page on your phone, the monitor dashboard on your laptop, use the same session ID, and start streaming.

### Run locally

**Server (relay):**
```bash
cd server
cp .env.example .env
npm install
npm run dev      # listens on ws://localhost:8080
```

**Client (React + Vite):**
```bash
cd client
cp .env.example .env.local
npm install
npm run dev      # served at http://localhost:5173
```

Then open the phone transmitter on your phone browser and the monitor dashboard on your ground-station computer, using the same session ID on both.

## Project layout

```
client/   React + Vite frontend (phone transmitter + monitor dashboard)
server/   Node.js WebSocket relay + time-sync endpoint
data/     Retained field-run CSV underlying the paper
scripts/  Analysis scripts that reproduce the tables in the paper
```

## What it logs per packet

- sequence number, phone callback interval, geolocation age at send
- server receive time, server forward time (for latency decomposition)
- monitor receive time, monitor interarrival interval
- phone-to-server, server-to-monitor, and end-to-end latency estimates
- latitude, longitude, altitude, browser-reported horizontal accuracy

All downloadable as CSV from the monitor UI.

## Suggested experiments

- **Standing still outdoors** — baseline callback interval and jitter
- **Walking test** — callback behavior under low-speed motion
- **Vehicle test** — higher-speed motion; check interarrival stability
- **Forced dropout** — briefly disable Wi-Fi; measure reconnect and packet gaps
- **Cross-device sweep** — same test on multiple phones/browsers for the multi-device survey mentioned in the paper's Future Work section

## Important limitations

This framework is useful for **application-layer pseudo-telemetry validation**. It is **not**:
- an RF telemetry test
- a GNSS receiver qualification setup
- a precision truth source
- a deterministic hard-real-time network test bench

It is best used as an intermediate validation layer between desktop simulation and full integrated tracker tests. See Sec. VII of the paper for the full limitation discussion.

## Citing this work

If you use this framework in academic or engineering work, please cite:

> Heo, S., "An Open-Source Browser-Based Pseudo-Telemetry Framework for Early-Stage Functional Validation of Directional Tracking Systems," *Journal of Aerospace Information Systems*, 2026.

## License

Permissive open-source license (MIT recommended). See `LICENSE` in the repository.

## Contact

Sunghyun (Joey) Heo, Franklin W. Olin College of Engineering — `jheo@olin.edu`
