# GPS Pseudo-Telemetry Lab

This project upgrades your original phone-to-PC WebSocket demo into a measurement-focused test platform for pseudo-telemetry validation.

## What it measures

Instead of mixing everything into one vague “delay,” this version measures three different timing behaviors:

1. **Geolocation callback interval on the phone**
   - How often `navigator.geolocation.watchPosition()` actually fires.
   - This is the best way to find the practical location update rate of a phone/browser combination in the field.

2. **Approximate phone-to-server latency**
   - Uses lightweight time sync between the phone browser and the server.
   - Lets you estimate the time from phone send to server receive.

3. **Approximate end-to-end phone-to-monitor latency**
   - Uses the same server clock as a common reference.
   - Lets you estimate the total time from phone send to monitor receipt.

It also logs:
- geolocation timestamp age at send
- server-to-monitor latency
- monitor interarrival interval
- packet continuity for each sequence number

## Why this matters

The web geolocation API does **not** give you a fixed guaranteed update interval. The real update behavior depends on the phone, browser, OS location stack, permission state, and environment. That means you should **measure it directly** instead of assuming 1 Hz or any other fixed value.

## Project structure

```text
client/   React + Vite frontend
server/   Node.js WebSocket relay and time sync server
```

## Run locally

### 1) Start the WebSocket server

```bash
cd server
npm install
npm run dev
```

By default the server runs on:

```text
ws://localhost:8080
```

### 2) Start the React client

```bash
cd client
npm install
npm run dev
```

By default the client runs on:

```text
http://localhost:5173
```

### 3) Open two devices

- Open the **Phone transmitter** page on your phone browser.
- Open the **Monitor dashboard** page on your laptop or ground-station computer.
- Use the **same session ID** on both.

## Deploying for real field tests

For field tests, you will usually want:

- the server deployed on a public host
- `wss://...` instead of `ws://...`
- the site served over HTTPS

Examples:
- Render
- Railway
- Fly.io
- a small VPS with Nginx reverse proxy

## Suggested experiments

### A. Standing still outdoors
Purpose:
- measure the baseline callback interval and network delay
- inspect raw jitter when motion is minimal

### B. Walking test
Purpose:
- measure callback interval under low-speed motion
- inspect continuity and stale-data behavior

### C. Vehicle test
Purpose:
- test higher-speed target motion
- inspect whether interarrival timing stays smooth enough for tracker use

### D. Forced dropout test
Purpose:
- turn Wi-Fi off briefly or move into weak service
- measure reconnect delay and packet discontinuity

## What to analyze later

Export the CSVs and compute:

- mean / median / p95 callback interval
- mean / median / p95 phone-to-server latency
- mean / median / p95 end-to-end latency
- packet drop count from sequence gaps
- stale position rate
- compare browser, phone model, and network type

## Important limitations

This system is useful for **application-layer pseudo-telemetry validation**. It is **not**:

- an RF telemetry test
- a GNSS receiver qualification setup
- a precision truth source
- a deterministic real-time network test bench

It is best used as an intermediate validation layer between desktop simulation and full integrated tracker tests.
