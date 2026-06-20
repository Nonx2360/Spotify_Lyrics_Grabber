import { Router } from "express";
import { EventEmitter } from "events";
import { writeFileSync, readFileSync, existsSync } from "fs";

const SPOTIFY_API = "https://api.spotify.com/v1";
const SCOPES = "user-read-currently-playing user-read-playback-state";

export const spotifyEvents = new EventEmitter();
let accessToken = "";
let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || "";

function getAuthHeader() {
  return `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`;
}

async function refreshAccessToken(): Promise<string> {
  if (!refreshToken) throw new Error("No refresh token available");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: getAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  accessToken = data.access_token;
  if (data.refresh_token) refreshToken = data.refresh_token;
  return accessToken;
}

async function getAccessToken(code: string): Promise<void> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: getAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.REDIRECT_URI || "http://localhost:4000/api/callback",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data = await res.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  console.log("Spotify tokens acquired. Save SPOTIFY_REFRESH_TOKEN to .env:");
  console.log(`SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
}

export interface PlaybackState {
  isPlaying: boolean;
  song: string;
  artist: string;
  progressMs: number;
  durationMs: number;
  trackId: string;
}

let lastTrackId = "";

async function fetchCurrentlyPlaying(): Promise<PlaybackState | null> {
  if (!accessToken) {
    try {
      await refreshAccessToken();
    } catch {
      return null;
    }
  }
  const res = await fetch(`${SPOTIFY_API}/me/player/currently-playing`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204 || res.status === 401) {
    if (res.status === 401) {
      try {
        await refreshAccessToken();
        return fetchCurrentlyPlaying();
      } catch {
        return null;
      }
    }
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.item) return null;
  return {
    isPlaying: data.is_playing,
    song: data.item.name,
    artist: data.item.artists[0]?.name || "Unknown",
    progressMs: data.progress_ms || 0,
    durationMs: data.item.duration_ms || 0,
    trackId: data.item.id,
  };
}

export async function startPolling(): Promise<void> {
  console.log("Starting Spotify poller (1s interval)...");
  setInterval(async () => {
    const state = await fetchCurrentlyPlaying();
    if (!state) return;
    if (state.trackId !== lastTrackId) {
      lastTrackId = state.trackId;
      spotifyEvents.emit("trackChange", state);
    }
    spotifyEvents.emit("playback", state);
  }, 1000);
}

export const spotifyRouter = Router();

spotifyRouter.get("/login", (_req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID || "",
    response_type: "code",
    redirect_uri: process.env.REDIRECT_URI || "http://localhost:4000/api/callback",
    scope: SCOPES,
    show_dialog: "true",
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

spotifyRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send("No code provided");
    return;
  }
  try {
    await getAccessToken(code);

    // Auto-save refresh token to .env
    const envPath = ".env";
    if (existsSync(envPath)) {
      let env = readFileSync(envPath, "utf-8");
      if (env.includes("SPOTIFY_REFRESH_TOKEN=")) {
        env = env.replace(/SPOTIFY_REFRESH_TOKEN=.*/, `SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
      } else {
        env += `\nSPOTIFY_REFRESH_TOKEN=${refreshToken}\n`;
      }
      writeFileSync(envPath, env, "utf-8");
    }

    res.send(`
      <html><body style="background:#111;color:#33ff33;font-family:monospace;padding:40px">
        <h2>Authenticated!</h2>
        <p>Refresh token saved to .env automatically.</p>
        <p>You can close this tab and run: <code>npm run dev</code></p>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send(`Auth failed: ${err}`);
  }
});
