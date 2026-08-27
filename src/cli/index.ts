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

interface WordData {
  word: string;
  startMs: number;
  endMs: number;
}

interface LyricLine {
  timeMs: number;
  line: string;
  romaji: string | null;
  words?: WordData[];
}

let connectionState: ConnectionState = "connecting";
let reconnectCountdown = 0;
let blinkState = true;
let lastBlinkTime = 0;

let lyricsList: LyricLine[] = [];
let lastProgressMs = 0;
let lastUpdateTimestamp = 0;
let isPlaying = false;
let durationMs = 0;
let lastData: any = null;

// Ticker interval for smooth terminal rendering and interpolation (50ms)
setInterval(() => {
  const now = Date.now();
  if (now - lastBlinkTime >= 600) {
    blinkState = !blinkState;
    lastBlinkTime = now;
  }

  if (connectionState === "disconnected") {
    renderDisconnected();
    return;
  }
  if (connectionState === "connected" && !lastData) {
    renderIdle();
    return;
  }

  if (lastData) {
    let currentProgress = lastProgressMs;
    if (isPlaying) {
      const elapsed = performance.now() - lastUpdateTimestamp;
      currentProgress = Math.min(lastProgressMs + elapsed, durationMs);
    }

    // Find active lyric line index
    let activeLineIdx = -1;
    for (let i = 0; i < lyricsList.length; i++) {
      if (lyricsList[i].timeMs <= currentProgress) {
        activeLineIdx = i;
      } else {
        break;
      }
    }

    if (activeLineIdx >= 0 && lyricsList[activeLineIdx]) {
      renderNormal(lastData, activeLineIdx, currentProgress);
    } else {
      renderNoLyrics(lastData, currentProgress);
    }
  }
}, 50);

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

function renderNoLyrics(data: any, currentProgress: number) {
  box.height = 8;
  const bar = renderBar(currentProgress, durationMs, 30);
  const liveIndicator = blinkState ? "{green-fg}\u25CF" : "{gray-fg}\u25CB}";
  const timeStr = `${formatTime(currentProgress)}  ${bar}  ${formatTime(durationMs)}`;
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

function renderNormal(data: any, activeLineIdx: number, currentProgress: number) {
  const bar = renderBar(currentProgress, durationMs, 30);
  const liveIndicator = blinkState ? "{green-fg}\u25CF" : "{gray-fg}\u25CB}";
  const timeStr = `${formatTime(currentProgress)}  ${bar}  ${formatTime(durationMs)}`;

  const activeLine = lyricsList[activeLineIdx];
  let lyricLine = "";

  if (activeLine.words && activeLine.words.length > 0) {
    lyricLine = activeLine.words
      .map((w: WordData) => {
        if (currentProgress >= w.endMs) {
          return `{white-fg}{bold}${w.word}{/bold}{/}`;
        } else if (currentProgress >= w.startMs) {
          return `{cyan-fg}{bold}${w.word}{/bold}{/}`;
        } else {
          return `{gray-fg}${w.word}{/}`;
        }
      })
      .join(" ");
  } else {
    lyricLine = `{white-fg}{bold}${activeLine.line || ""}{/bold}{/}`;
  }

  const lines = [
    `{gray-fg}song:{/}    {white-fg}{bold}${data.song || "Unknown"}{/bold}{/}`,
    `{gray-fg}artist:{/}   {white-fg}${data.artist || "Unknown Artist"}{/}`,
    "",
    `  {white-fg}${timeStr}{/}`,
    "",
    `  {gray-fg}lyrics(LIVE):{/} ${liveIndicator}`,
    `  ${lyricLine}`,
  ];

  if (activeLine.romaji) {
    lines.push(`{gray-fg}{italic}  ${activeLine.romaji}{/italic}{/}`);
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
      lastData = data;
      durationMs = data.durationMs || 0;
      isPlaying = data.isPlaying ?? false;
      lastProgressMs = data.progressMs || 0;
      lastUpdateTimestamp = performance.now();
      lyricsList = data.lyrics || [];
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
