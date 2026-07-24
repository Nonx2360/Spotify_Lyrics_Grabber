import WebSocket from "ws";
import blessed from "blessed";

const WS_URL = process.env.WS_URL || "ws://localhost:4000/ws";

const screen = blessed.screen({
  smartCSR: true,
  title: "SLG - Spotify Lyrics Grabber",
});

const box = blessed.box({
  top: "center",
  left: "center",
  width: "80%",
  height: 12,
  border: { type: "line" },
  style: {
    border: { fg: "green" },
  },
  label: " SLG ",
  tags: true,
  padding: { left: 1, right: 1 },
});

const content = blessed.text({
  parent: box,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  style: { fg: "green" },
  tags: true,
});

screen.append(box);

let lastEscTime = 0;
screen.key(["escape"], () => {
  const now = Date.now();
  if (now - lastEscTime < 500) {
    process.exit(0);
  }
  lastEscTime = now;
});
screen.key(["C-c"], () => process.exit(0));

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function renderBar(progressMs: number, durationMs: number, width: number): string {
  const pct = durationMs > 0 ? progressMs / durationMs : 0;
  const filled = Math.floor(pct * width);
  const empty = width - filled;
  const fill = "\u2588".repeat(filled);
  const emptyChars = "\u2591".repeat(empty);
  return `\u2502{white-fg}${fill}{/white-fg}{gray-fg}${emptyChars}{/gray-fg}\u2502`;
}

type ConnectionState = "connecting" | "connected" | "disconnected";

let connectionState: ConnectionState = "connecting";
let reconnectCountdown = 0;
let blinkState = true;

setInterval(() => {
  blinkState = !blinkState;
  if (connectionState === "disconnected") {
    renderDisconnected();
  } else if (connectionState === "connected" && !lastData) {
    renderIdle();
  } else if (lastData) {
    if (lastData.currentLyricLine) {
      renderNormal(lastData);
    } else {
      renderNoLyrics(lastData);
    }
  }
}, 600);

let lastData: any = null;

function renderDisconnected() {
  const dots = ".".repeat((reconnectCountdown % 3) + 1);
  box.height = 6;
  const lines = [
    "",
    `  {gray-fg}connecting to SLG server${dots}{/}`,
    `  {gray-fg}retrying in ${reconnectCountdown}s...{/}`,
  ];
  content.setContent(lines.join("\n"));
  screen.render();
}

function renderIdle() {
  box.height = 5;
  const lines = [
    "",
    `  {gray-fg}connected. waiting for playback...{/}`,
  ];
  content.setContent(lines.join("\n"));
  screen.render();
}

function renderNoLyrics(data: { song: string; artist: string; progressMs: number; durationMs: number }) {
  box.height = 11;
  const bar = renderBar(data.progressMs, data.durationMs, 30);
  const liveIndicator = blinkState ? "{green-fg}\u25CF" : "{gray-fg}\u25CB}";
  const timeStr = `${formatTime(data.progressMs)}  ${bar}  ${formatTime(data.durationMs)}`;
  const lines = [
    `{gray-fg}song:{/}    {white-fg}{bold}${data.song || "Unknown"}{/bold}{/}`,
    `{gray-fg}artist:{/}   {white-fg}${data.artist || "Unknown Artist"}{/}`,
    "",
    `  {white-fg}${timeStr}{/}`,
    "",
    `  {gray-fg}lyrics(LIVE):{/} ${liveIndicator}`,
    `  {gray-fg}(no lyrics found for this track){/}`,
  ];
  content.setContent(lines.join("\n"));
  screen.render();
}

function renderNormal(data: {
  song: string;
  artist: string;
  progressMs: number;
  durationMs: number;
  currentLyricLine: string;
  romaji?: string | null;
  isPlaying: boolean;
}) {
  lastData = data;
  const bar = renderBar(data.progressMs, data.durationMs, 30);
  const liveIndicator = blinkState ? "{green-fg}\u25CF" : "{gray-fg}\u25CB}";
  const lyricLine = data.currentLyricLine || "No lyrics available";
  const timeStr = `${formatTime(data.progressMs)}  ${bar}  ${formatTime(data.durationMs)}`;

  const lines = [
    `{gray-fg}song:{/}    {white-fg}{bold}${data.song || "Unknown"}{/bold}{/}`,
    `{gray-fg}artist:{/}   {white-fg}${data.artist || "Unknown Artist"}{/}`,
    "",
    `  {white-fg}${timeStr}{/}`,
    "",
    `  {gray-fg}lyrics(LIVE):{/} ${liveIndicator}`,
    `{white-fg}{bold}${lyricLine}{/bold}{/}`,
  ];

  if (data.romaji) {
    lines.push(`{gray-fg}{italic}  ${data.romaji}{/italic}{/}`);
    box.height = 10;
  } else {
    box.height = 9;
  }

  content.setContent(lines.join("\n"));
  screen.render();
}

function connect() {
  connectionState = "connecting";
  renderDisconnected();

  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    connectionState = "connected";
    reconnectCountdown = 0;
    lastData = null;
    renderIdle();
  });

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (!data.currentLyricLine) {
        renderNoLyrics(data);
      } else {
        renderNormal(data);
      }
    } catch {}
  });

  ws.on("close", () => {
    connectionState = "disconnected";
    reconnectCountdown = 5;
    renderDisconnected();

    const countdown = setInterval(() => {
      reconnectCountdown--;
      if (reconnectCountdown <= 0) {
        clearInterval(countdown);
        connect();
      } else {
        renderDisconnected();
      }
    }, 1000);
  });

  ws.on("error", () => ws.close());
}

connect();
