import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { spotifyEvents, type PlaybackState } from "./spotify.js";
import { getSyncedLyrics, getCurrentLine, type LyricLine } from "./lyrics.js";

let wss: WebSocketServer;

interface LiveState {
  song: string;
  artist: string;
  progressMs: number;
  durationMs: number;
  currentLyricLine: string;
  romaji: string | null;
  isPlaying: boolean;
}

let currentLyrics: LyricLine[] = [];
let currentTrackId = "";

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");
    ws.on("close", () => console.log("WebSocket client disconnected"));
  });

  spotifyEvents.on("trackChange", async (state: PlaybackState) => {
    if (state.trackId !== currentTrackId) {
      currentTrackId = state.trackId;
      currentLyrics = await getSyncedLyrics(state.song, state.artist, state.durationMs);
    }
  });

  spotifyEvents.on("playback", (state: PlaybackState) => {
    const { line, romaji } = getCurrentLine(currentLyrics, state.progressMs);
    const liveState: LiveState = {
      song: state.song,
      artist: state.artist,
      progressMs: state.progressMs,
      durationMs: state.durationMs,
      currentLyricLine: line,
      romaji,
      isPlaying: state.isPlaying,
    };
    broadcast(liveState);
  });
}

function broadcast(data: LiveState): void {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}
