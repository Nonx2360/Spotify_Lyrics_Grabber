const songEl = document.getElementById("song")!;
const artistEl = document.getElementById("artist")!;
const timeEl = document.getElementById("time")!;
const progressBar = document.getElementById("progress-bar")!;
const lyricsEl = document.getElementById("lyrics")!;
const romajiRow = document.getElementById("romaji-row")!;
const romajiEl = document.getElementById("romaji")!;

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    songEl.textContent = "Connected. Waiting for playback...";
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    songEl.textContent = data.song || "Unknown";
    artistEl.textContent = data.artist || "Unknown";
    timeEl.textContent = `${formatTime(data.progressMs)} / ${formatTime(data.durationMs)}`;
    progressBar.style.width = `${data.durationMs > 0 ? (data.progressMs / data.durationMs) * 100 : 0}%`;
    lyricsEl.textContent = data.currentLyricLine || "No lyrics available";

    if (data.romaji) {
      romajiRow.style.display = "block";
      romajiEl.textContent = data.romaji;
    } else {
      romajiRow.style.display = "none";
    }
  };

  ws.onclose = () => {
    songEl.textContent = "Disconnected. Reconnecting...";
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

connect();
