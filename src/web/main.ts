const songEl = document.getElementById("song")!;
const artistEl = document.getElementById("artist")!;
const timeEl = document.getElementById("time")!;
const durationEl = document.getElementById("duration")!;
const progressBar = document.getElementById("progress-bar")!;
const lyricsEl = document.getElementById("lyrics")!;
const romajiRow = document.getElementById("romaji-row")!;
const romajiEl = document.getElementById("romaji")!;
const thumbnailEl = document.getElementById("thumbnail") as HTMLImageElement;
const bgLayer1 = document.getElementById("bg-layer-1")!;
const bgLayer2 = document.getElementById("bg-layer-2")!;

let activeLayer: HTMLElement = bgLayer1;
let inactiveLayer: HTMLElement = bgLayer2;
let currentBgUrl = "";
let lastLyric = "";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function extractDominantColor(
  img: HTMLImageElement
): { r: number; g: number; b: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const size = 16;
  canvas.width = size;
  canvas.height = size;
  try {
    ctx.drawImage(img, 0, 0, size, size);
  } catch {
    return { r: 99, g: 102, b: 241 };
  }
  const data = ctx.getImageData(0, 0, size, size).data;

  let r = 0, g = 0, b = 0;
  const pixels = size * size;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return {
    r: Math.round(r / pixels),
    g: Math.round(g / pixels),
    b: Math.round(b / pixels),
  };
}

function updateAccentColor(r: number, g: number, b: number) {
  document.documentElement.style.setProperty("--accent", `rgb(${r}, ${g}, ${b})`);
}

function updateBackground(img: HTMLImageElement) {
  if (img.src === currentBgUrl) return;
  currentBgUrl = img.src;

  extractDominantColor(img);

  inactiveLayer.style.backgroundImage = `url(${img.src})`;

  requestAnimationFrame(() => {
    inactiveLayer.classList.add("active");
    activeLayer.classList.remove("active");

    const tmp = activeLayer;
    activeLayer = inactiveLayer;
    inactiveLayer = tmp;
  });

  const { r, g, b } = extractDominantColor(img);
  updateAccentColor(r, g, b);
}

function resetBackground() {
  currentBgUrl = "";
  activeLayer.classList.remove("active");
  inactiveLayer.classList.remove("active");
  document.documentElement.style.setProperty("--accent", "#6366f1");
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
    timeEl.textContent = formatTime(data.progressMs);
    durationEl.textContent = formatTime(data.durationMs);
    progressBar.style.width = `${
      data.durationMs > 0 ? (data.progressMs / data.durationMs) * 100 : 0
    }%`;

    const newLyric = data.currentLyricLine || "No lyrics available";
    if (newLyric !== lastLyric) {
      lastLyric = newLyric;
      lyricsEl.textContent = newLyric;
      lyricsEl.classList.remove("animate");
      void lyricsEl.offsetWidth;
      lyricsEl.classList.add("animate");
    }

    if (data.thumbnail) {
      if (thumbnailEl.src !== data.thumbnail) {
        thumbnailEl.src = data.thumbnail;
      }
      thumbnailEl.style.display = "block";
      thumbnailEl.onload = () => updateBackground(thumbnailEl);
    } else {
      thumbnailEl.style.display = "none";
      resetBackground();
    }

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
