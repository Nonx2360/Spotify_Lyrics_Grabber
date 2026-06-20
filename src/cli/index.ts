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
  height: "60%",
  border: { type: "line" },
  style: {
    border: { fg: "green" },
    label: { fg: "green" },
  },
  label: " SLG ",
  tags: true,
});

const content = blessed.text({
  parent: box,
  top: 1,
  left: 2,
  right: 2,
  bottom: 1,
  style: { fg: "green" },
  tags: true,
});

screen.append(box);

screen.key(["escape", "q", "C-c"], () => process.exit(0));

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function renderBar(progressMs: number, durationMs: number, width: number): string {
  const pct = durationMs > 0 ? progressMs / durationMs : 0;
  const filled = Math.floor(pct * width);
  return "{green-fg}█".repeat(filled) + "{gray-fg}░".repeat(width - filled) + "{/}";
}

function render(data: {
  song: string;
  artist: string;
  progressMs: number;
  durationMs: number;
  currentLyricLine: string;
  isPlaying: boolean;
}) {
  const bar = renderBar(data.progressMs, data.durationMs, 40);
  const text = [
    `{bold}{green-fg}song:{/green-fg}{/bold}   {white-fg}${data.song || "Unknown"}{/white-fg}`,
    `{bold}{green-fg}artist:{/green-fg}{/bold}  {gray-fg}${data.artist || "Unknown"}{/gray-fg}`,
    `{bold}{green-fg}time:{/green-fg}{/bold}   {yellow-fg}${formatTime(data.progressMs)} | ${formatTime(data.durationMs)}{/yellow-fg}`,
    "",
    `  ${bar}`,
    "",
    `{bold}{green-fg}lyrics(LIVE):{/green-fg}{/bold}`,
    `{bold}{green-fg}${data.currentLyricLine || "No lyrics available"}{/green-fg}`,
  ].join("\n");
  content.setContent(text);
  screen.render();
}

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    render({
      song: "Connected. Waiting for playback...",
      artist: "-",
      progressMs: 0,
      durationMs: 0,
      currentLyricLine: "",
      isPlaying: false,
    });
  });

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      render(data);
    } catch {}
  });

  ws.on("close", () => {
    render({
      song: "Disconnected. Reconnecting...",
      artist: "-",
      progressMs: 0,
      durationMs: 0,
      currentLyricLine: "",
      isPlaying: false,
    });
    setTimeout(connect, 2000);
  });

  ws.on("error", () => ws.close());
}

connect();
