import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { spotifyEvents, type PlaybackState } from "./spotify.js";
import { getSyncedLyrics, getCurrentLine, type LyricLine } from "./lyrics.js";
import type { LyricWord } from "./lyrics-types.js";

let wss: WebSocketServer;

interface LiveState {
  song: string;
  artist: string;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
  thumbnail: string | null;
  lyrics: LyricLine[];
}

let currentLyrics: LyricLine[] = [];
let currentTrackId = "";

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");
    // Send immediate state if available
    if (currentTrackId) {
      ws.send(JSON.stringify({
        song: "",
        artist: "",
        progressMs: 0,
        durationMs: 0,
        isPlaying: false,
        thumbnail: null,
        lyrics: currentLyrics
      }));
    }
    ws.on("close", () => console.log("WebSocket client disconnected"));
  });

  spotifyEvents.on("trackChange", async (state: PlaybackState) => {
    if (state.trackId !== currentTrackId) {
      currentTrackId = state.trackId;
      currentLyrics = await getSyncedLyrics(state.song, state.artist, state.durationMs);
    }
  });

  spotifyEvents.on("playback", (state: PlaybackState) => {
    const liveState: LiveState = {
      song: state.song,
      artist: state.artist,
      progressMs: state.progressMs,
      durationMs: state.durationMs,
      isPlaying: state.isPlaying,
      thumbnail: state.thumbnail,
      lyrics: currentLyrics,
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
