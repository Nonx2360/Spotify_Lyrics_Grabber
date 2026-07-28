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

function escapeHtml(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

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

let lastProgressMs = 0;
let lastUpdateTimestamp = 0;
let isPlaying = false;
let durationMs = 0;

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

let lyricsList: LyricLine[] = [];
let currentLineIndex = -1;

function animateElement(el: HTMLElement) {
  el.classList.remove("animate");
  void el.offsetWidth;
  el.classList.add("animate");
}

function updateTicker() {
  requestAnimationFrame(updateTicker);

  let currentProgress = lastProgressMs;
  if (isPlaying) {
    const elapsed = performance.now() - lastUpdateTimestamp;
    currentProgress = Math.min(lastProgressMs + elapsed, durationMs);
  }

  // Update progress bar
  progressBar.style.width = `${
    durationMs > 0 ? (currentProgress / durationMs) * 100 : 0
  }%`;
  timeEl.textContent = formatTime(currentProgress);

  // Find active line index
  let activeLineIdx = -1;
  for (let i = 0; i < lyricsList.length; i++) {
    if (lyricsList[i].timeMs <= currentProgress) {
      activeLineIdx = i;
    } else {
      break;
    }
  }

  // If active line changes, render it immediately
  if (activeLineIdx !== currentLineIndex) {
    currentLineIndex = activeLineIdx;
    if (currentLineIndex >= 0 && lyricsList[currentLineIndex]) {
      const activeLine = lyricsList[currentLineIndex];
      const newLyric = activeLine.line || "";

      if (activeLine.words && activeLine.words.length > 0) {
        const wordsHtml = activeLine.words
          .map((w: WordData) => {
            return `<span class="lyric-word" data-start="${w.startMs}" data-end="${w.endMs}">${escapeHtml(w.word)}</span>`;
          })
          .join(" ");
        lyricsEl.innerHTML = wordsHtml;
      } else {
        lyricsEl.innerHTML = `<span>${escapeHtml(newLyric)}</span>`;
      }
      animateElement(lyricsEl);

      if (activeLine.romaji) {
        romajiRow.style.display = "block";
        romajiEl.textContent = activeLine.romaji;
      } else {
        romajiRow.style.display = "none";
      }
    } else {
      lyricsEl.innerHTML = "<span>No lyrics available</span>";
      romajiRow.style.display = "none";
    }
  }

  // Update lyric words progress
  const wordSpans = lyricsEl.querySelectorAll(".lyric-word");
  wordSpans.forEach((span) => {
    const start = parseFloat(span.getAttribute("data-start") || "0");
    const end = parseFloat(span.getAttribute("data-end") || "0");
    let progress = 0;
    if (currentProgress >= end) {
      progress = 1;
    } else if (currentProgress >= start) {
      if (end > start) {
        progress = (currentProgress - start) / (end - start);
      } else {
        progress = 1;
      }
    }

    const percentage = (progress * 100).toFixed(1);
    (span as HTMLElement).style.setProperty("--progress", `${percentage}%`);
    
    if (progress > 0) {
      span.classList.add("active");
    } else {
      span.classList.remove("active");
    }
  });
}

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    songEl.textContent = "Connected. Waiting for playback...";
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.song && (songEl.textContent !== data.song || artistEl.textContent !== data.artist)) {
      songEl.textContent = data.song;
      artistEl.textContent = data.artist || "Unknown";
      currentLineIndex = -1; // Reset to force re-render on track change
    }
    
    durationMs = data.durationMs || 0;
    isPlaying = data.isPlaying ?? false;
    lastProgressMs = data.progressMs || 0;
    lastUpdateTimestamp = performance.now();
    lyricsList = data.lyrics || [];

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
  };

  ws.onclose = () => {
    songEl.textContent = "Disconnected. Reconnecting...";
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

// Start local interpolation loop
requestAnimationFrame(updateTicker);
connect();
