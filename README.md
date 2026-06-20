# Spotify Lyrics Grabber (SLG)

Real-time Spotify lyrics display with terminal-style UI (web + CLI).

## Setup

### 1. Create Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Fill in:
   - **App Name:** SLG (or anything)
   - **Redirect URI:** `http://localhost:4000/api/callback`
   - **Which API/SDKs are you planning to use?:** Web API
4. Click **Save**
5. Go to **Settings** and copy your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `SPOTIFY_CLIENT_ID` — from step 1
- `SPOTIFY_CLIENT_SECRET` — from step 1
- `REDIRECT_URI` — keep as `http://localhost:4000/api/callback`
- `PORT` — keep as `4000`

### 3. First-Time Authentication

```bash
npm run dev:server
```

Open `http://localhost:4000/api/login` in your browser. Log in to Spotify and authorize the app.

The refresh token saves to `.env` automatically.

### 4. Run

**Web UI:**
```bash
npm run dev
```
Open `http://localhost:5173`

**CLI:**
```bash
npm run cli
```

## Architecture

```
Spotify Web API  <──poll──  Backend (Node/Express + WS)
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              Web UI (Vite)          CLI (blessed)
```

- Backend polls Spotify every 1s
- Fetches synced lyrics from lrclib.net
- **Auto-romanizes Japanese lyrics** (kuroshiro + kuromoji) — shows romaji under the lyric line
- Broadcasts state over WebSocket
- Two frontends consume the same WS stream

## Troubleshooting

- **`EADDRINUSE: port 4000`** — Kill the old process: `netstat -ano | findstr ":4000"` then `taskkill /PID <pid> /F`
- **No lyrics showing** — Ensure the song is playing on Spotify and the backend shows "WebSocket client connected" in the console
- **Token refresh fails** — Re-authenticate at `http://localhost:4000/api/login`
