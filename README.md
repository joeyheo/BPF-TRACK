# BPF-TRACK: Browser-based Pseudo-telemetry Framework for early-stage functional validation of directional TRACKing systems

**Repository:** <https://github.com/joeyheo/BPF-TRACK>

**Companion repository for:** *An Open-Source Browser-Based Pseudo-Telemetry Framework for Early-Stage Functional Validation of Directional Tracking Systems*, Sunghyun (Joey) Heo, AIAA Journal of Aerospace Information Systems, submitted 2026.

## What this is

BPF-TRACK is a small, commodity-hardware framework that lets you drive a directional tracker — an antenna tracker, a camera mount, or any other position-responsive pointing system — from a **smartphone acting as a moving surrogate target**. Your phone's browser streams its position over WebSocket; a ground-side PC receives the stream and uses it as pseudo-telemetry in place of a real live target.

It's intended to fill the awkward gap between software-only simulation and full integrated field test: you can exercise your *real* telemetry-to-motion chain without relocating your actual target-generating system for every iteration.

## What the paper measured

Three outdoor field runs totaling 1725 samples over 28.7 minutes of continuous operation, spanning both active pedestrian motion and long-duration near-stationary operation:

- Update rate: stable **1 Hz** across all runs (pooled 95th-percentile callback interval 1006 ms)
- Reported horizontal accuracy: **4.46 m** pooled mean (range 3.40–6.92 m across runs)
- End-to-end latency: **123.3 ms** pooled mean, **155.3 ms** pooled 95th percentile, **169.9 ms** pooled 99th percentile
- **100%** of samples arrived within one update period in every run → qualifies as *soft real-time*
- **99.6%** of pooled samples arrived within a stricter 200 ms deadline
- Zero sequence gaps across all three retained-run windows

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
client/       React + Vite frontend (phone transmitter + monitor dashboard)
server/       Node.js WebSocket relay + time-sync endpoint
data/         Retained field-run CSVs underlying the paper (see below)
scripts/      Analysis scripts that reproduce the tables in the paper
paper/
  main.tex        Paper source (compiles with AIAA new-aiaa.cls)
  references.bib  Bibliography
```

## What it logs per packet

Each CSV row contains:

```
seq                              Per-session sequence number from the phone client
latitude, longitude, altitude    Browser-reported geolocation fields
accuracy                         Browser-reported 1-sigma horizontal accuracy (m)
serverReceivedEpochMs            Server receive timestamp (ms, server clock)
serverForwardEpochMs             Server forward timestamp (ms, server clock)
phoneSendEstimatedServerEpochMs  Phone send timestamp mapped to server clock
phoneCallbackIntervalMs          Phone-side time between successive watchPosition callbacks
geolocationAgeAtSendMs           Age of the fix at send (phone wall-clock minus fix timestamp)
pcReceiveLocalEpochMs            Monitor receive timestamp (ms, monitor local clock)
pcReceiveEstimatedServerEpochMs  Monitor receive timestamp mapped to server clock
monitorInterarrivalMs            Monitor-side time between successive receive events
phoneToServerLatencyMs           Derived; see Eq. (2) of paper
serverToMonitorLatencyMs         Derived; see Eq. (3) of paper
endToEndLatencyMs                Derived; see Eq. (4) of paper
```

All fields are downloadable as CSV directly from the monitor UI.

## Reproducing the paper's statistics

All statistics in the paper are computed over the boundary-trimmed retained windows documented in Sec. V.B. The raw CSVs include boundary samples; apply the `seq` filters below to reproduce the paper's numbers exactly.

| File                                          | Retained `seq` range                                     | N    | Duration (s) |
|-----------------------------------------------|----------------------------------------------------------|------|--------------|
| `data/run1_pedestrian.csv`                    | 51 – 435                                                 | 385  | 384.1        |
| `data/run2_long_duration_stationary.csv`      | 44 – 943 (post-restart session only; skip raw rows 0–58) | 900  | 899.3        |
| `data/run3_pedestrian.csv`                    | 60 – 499                                                 | 440  | 439.0        |

**Note on Run 2:** the raw CSV contains an explicit client session restart at row 58, where `seq` jumps from 100 back to 3. Only the post-restart session (rows from index 59 onward, `seq` 3–943) is retained; within that session, the retained window is `seq` 44–943. This event is discussed in Sec. VI.C of the paper.

## Suggested experiments

- **Standing still outdoors** — baseline callback interval and jitter
- **Walking test** — callback behavior under low-speed motion (the regime of Runs 1 and 3)
- **Long-duration session** — check for the monitor-side latency drift documented in Sec. VI.C
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
