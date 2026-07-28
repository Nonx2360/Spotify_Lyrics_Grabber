# How SLG Works

A technical walkthrough of the Spotify Lyrics Grabber architecture.

---

## Overview

```
Spotify App (your phone/PC)
        │
        ▼
┌─────────────────┐
│ Spotify Web API │ ◄── SLG polls this every 1 second
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  SLG Backend    │ ──► │   Unison     │ ◄── │  lrclib.net │
│  (Node.js)      │ ──► │ (primary)    │     │  (fallback) │
└────────┬────────┘     └──────────────┘     └─────────────┘
         │
    WebSocket
    (live stream)
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│  Web  │ │  CLI  │
│  UI   │ │ TUI   │
└───────┘ └───────┘
```

**One backend, two frontends.** Both receive the same real-time data over WebSocket.

---

## 1. Spotify Authentication (OAuth 2.0)

**File:** `src/server/spotify.ts`

Spotify requires OAuth to access your playback data. SLG uses the **Authorization Code** flow:

```
┌──────────┐   1. User visits /api/login   ┌──────────┐
│          │ ──────────────────────────────► │          │
│  Browser │                                │  SLG     │
│          │ ◄────────────────────────────── │  Server  │
└──────────┘   2. Redirect to Spotify       └──────────┘
                     │
                     ▼
              ┌─────────────┐
              │   Spotify   │  3. User logs in & approves
              │   Accounts  │
              └──────┬──────┘
                     │
                     ▼
┌──────────┐   4. Redirect back with code   ┌──────────┐
│          │ ◄────────────────────────────── │          │
│  Browser │ ──────────────────────────────► │  SLG     │
│          │   5. Server exchanges code      │  Server  │
└──────────┘      for tokens                 └──────────┘
```

**What happens:**
1. `/api/login` → redirects user to Spotify's login page
2. User approves → Spotify redirects to `/api/callback?code=xxx`
3. Server exchanges the `code` for an **access token** + **refresh token**
4. Refresh token is saved to `.env` automatically
5. Access token expires after ~1 hour; server uses refresh token to get a new one

**Key code (`spotify.ts`):**
```typescript
// Token refresh uses Basic auth header
async function refreshAccessToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    headers: {
      Authorization: getAuthHeader(),  // Basic base64(clientId:clientSecret)
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
}
```

---

## 2. Playback Polling

**File:** `src/server/spotify.ts`

Every 1 second, SLG calls the Spotify API:

```
GET https://api.spotify.com/v1/me/player/currently-playing
Authorization: Bearer <access_token>
```

**Response contains:**
```json
{
  "is_playing": true,
  "progress_ms": 56000,
  "item": {
    "name": "Re:Re:",
    "artists": [{ "name": "ASIAN KUNG-FU GENERATION" }],
    "duration_ms": 148000,
    "album": {
      "images": [{ "url": "https://i.scdn.co/image/..." }]
    }
  }
}
```

**SLG extracts:**
- `song` — track name
- `artist` — first artist name
- `progressMs` — current position in milliseconds
- `durationMs` — total track length
- `trackId` — unique ID for lyrics lookup
- `thumbnail` — album art URL

**Event system:**
```typescript
// When track changes (new song)
spotifyEvents.emit("trackChange", state);

// Every tick (every 1s)
spotifyEvents.emit("playback", state);
```

---

## 3. Lyrics Fetching

**Files:** `src/server/lyrics-service.ts`, `src/server/providers/lrclib.ts`, `src/server/providers/unison.ts`

SLG uses a **provider abstraction** with fallback chain. Providers implement the `LyricsProvider` interface:

```typescript
interface LyricsProvider {
  name: string;
  getLyrics(params: LyricsQuery): Promise<LyricLine[] | null>;
}
```

**Provider chain:** `UnisonProvider` → `LrclibProvider` (tried in order, first match wins)

### Unison (primary)

Unison is a community-curated lyrics database with word-level timing (richsync). No API key needed.

```
GET https://unison.boidu.dev/lyrics?song=Re:Re:&artist=ASIAN KUNG-FU GENERATION
```

**Response format:**
```json
{
  "success": true,
  "data": {
    "format": "ttml",
    "syncType": "richsync",
    "confidence": "high",
    "lyrics": "<tt>...<p begin=\"0:12.50\"><span begin=\"...\">kawaita</span>...</p>...</tt>"
  }
}
```

**TTML parsing** extracts both line-level (`<p begin="...">`) and word-level (`<span begin="..." end="...">`) timing:

```typescript
function parseTtml(ttml: string) {
  // Extract <p begin="..."> for line timestamps
  // Extract <span begin="..." end="..."> for per-word timestamps
  // Consecutive spans without whitespace gap are merged into full words
  // Returns { timeMs, line, words[] }
}
```

**Word-level data** flows through the entire pipeline to enable per-word karaoke highlighting in the web UI.

### lrclib (fallback)

When Unison has no match, SLG falls back to lrclib.net (free, no API key).

```
GET https://lrclib.net/api/get?track_name=Re:Re:&artist_name=ASIAN KUNG-FU GENERATION
```

**Response contains LRC format:**
```
[00:12.50]kawaita asufaruto no ue
[00:16.80]nigenashi de aruita
[00:21.20]kono hi ga wasurenai de
```

**Parsing:**
```typescript
function parseLrc(lrc: string): LyricLine[] {
  // Converts "[mm:ss.xx]text" → { timeMs: 12500, line: "text" }
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
  // ... parse each line, return sorted by timeMs
}
```

### Finding current line (binary search)

```typescript
function getCurrentLine(lyrics, progressMs) {
  // Binary search for the last line whose timeMs <= progressMs
  // Returns { line, romaji, words?, wordIndex? }
  // wordIndex is binary-searched within words[] for per-word highlight
}
```

### Caching

Lyrics are cached in memory per track (`"song::artist"` key), so repeat plays don't refetch.

---

## 4. Japanese Romanization

**File:** `src/server/romaji.ts`

For Japanese lyrics, SLG generates romaji (romanized text) using **kuroshiro** + **kuromoji**.

```typescript
// Check if text contains Japanese characters
function isJapanese(text) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

// Convert to romaji
async function getRomaji(line) {
  // "笑いながら" → "warai nagara"
  return await kuroshiro.convert(line, { to: "romaji", mode: "spaced" });
}
```

**When lyrics are fetched:**
```typescript
// Each line gets romaji precomputed once
const enriched = await Promise.all(
  lines.map(async (l) => ({
    ...l,
    romaji: await getRomaji(l.line),  // null for non-Japanese lines
  }))
);
```

**Performance:** Kuromoji dictionary (~5MB) loads once at server startup. Romaji is computed once per track, cached with lyrics.

---

## 5. WebSocket Broadcast

**File:** `src/server/ws.ts`

The backend broadcasts live state to all connected clients every ~1 second.

```typescript
interface LiveState {
  song: string;
  artist: string;
  progressMs: number;
  durationMs: number;
  currentLyricLine: string;
  romaji: string | null;
  isPlaying: boolean;
  thumbnail: string | null;
  currentWords?: LyricWord[];     // word-level timing (richsync)
  currentWordIndex?: number;      // which word is being sung now
}

interface LyricWord {
  word: string;
  startMs: number;
  endMs: number;
}

// On every playback tick
spotifyEvents.on("playback", (state) => {
  const { line, romaji, words, wordIndex } = getCurrentLine(currentLyrics, state.progressMs);
  broadcast({
    song: state.song,
    artist: state.artist,
    progressMs: state.progressMs,
    durationMs: state.durationMs,
    currentLyricLine: line,
    romaji,
    isPlaying: state.isPlaying,
    thumbnail: state.thumbnail,
    currentWords: words,           // sent only when available
    currentWordIndex: wordIndex,
  });
});

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}
```

**Why WebSocket instead of polling:**
- Server pushes updates instantly (no client request needed)
- Lower latency (~1s refresh)
- One connection, many clients

---

## 6. Web UI

**Files:** `src/web/index.html`, `style.css`, `main.ts`

A Vite app styled with liquid glass aesthetic.

**Main loop:**
```typescript
const ws = new WebSocket(`ws://${location.host}/ws`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  songEl.textContent = data.song;
  artistEl.textContent = data.artist;
  progressBar.style.width = `${(progressMs / durationMs) * 100}%`;

  if (data.currentWords) {
    // Render word-by-word with sliding gradient highlight
    lyricsEl.innerHTML = data.currentWords
      .map(w => `<span class="lyric-word">${escapeHtml(w.word)}</span>`)
      .join(" ");
    const pct = ((data.currentWordIndex + 1) / data.currentWords.length) * 100;
    lyricsEl.style.setProperty("--highlight-pct", `${pct}%`);
  } else {
    // Fallback to line-level text
    lyricsEl.textContent = data.currentLyricLine;
  }
};
```

**Word highlight via sliding gradient:**
```css
@property --highlight-pct {
  syntax: '<percentage>';
  initial-value: 0%;
}

.lyrics {
  background: linear-gradient(to right,
    #fff 0%, #fff var(--highlight-pct),
    rgba(255,255,255,0.2) var(--highlight-pct),
    rgba(255,255,255,0.2) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  transition: --highlight-pct 300ms ease;
}
```

The gradient cut smoothly slides across the line as `currentWordIndex` advances, creating a karaoke-bar effect.

**Background from album art:**
```typescript
function updateBackground(img) {
  // Sample dominant color from thumbnail via canvas
  const { r, g, b } = extractDominantColor(img);

  // Set blurred artwork as page background
  inactiveLayer.style.backgroundImage = `url(${img.src})`;
  inactiveLayer.classList.add("active");

  // Use extracted color as accent
  document.documentElement.style.setProperty("--accent", `rgb(${r},${g},${b})`);
}
```

**Liquid glass effect:**
```css
.card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(32px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.18);
}
```

---

## 7. CLI Terminal Client

**File:** `src/cli/index.ts`

A `blessed`-based TUI that connects to the same WebSocket endpoint.

**Key features:**
- **Dynamic height:** Box resizes based on content (idle vs playing vs romaji)
- **Live indicator:** `●`/`○` blinks every 600ms, tied to WS connection state
- **Reconnect countdown:** Shows 5s countdown when disconnected
- **Double Esc to quit:** Prevents accidental exits

**Render states:**
```typescript
// Connecting
"connecting to SLG server..."

// Connected, nothing playing
"connected. waiting for playback..."

// Playing with lyrics
song:    Re:Re:
artist:  ASIAN KUNG-FU GENERATION
time:    00:56  │████████░░░░░░░░│  02:28
lyrics(LIVE): ●
kawaita asufaruto no ue

// Playing without lyrics
lyrics(LIVE): ●
(no lyrics found for this track)
```

---

## Data Flow Summary

```
1. Spotify API ──poll──► SLG Backend
                               │
2. Unison ──fetch──► (primary) │
   lrclib.net ──fetch──► (fallback)
                               │
3. Lyrics cached in memory per track
                               │
4. kuroshiro ──convert──► Romaji cached per track
                               │
5. WebSocket ──broadcast──► Web UI + CLI
   (includes words[] + wordIndex for richsync)
                               │
6. Frontend ──render──► Line-level text (CLI)
                     └──► Word-by-word sliding gradient (Web)
```

All of this happens every ~1 second while music plays.

---

## File Structure

```
SLG/
├── src/
│   ├── server/
│   │   ├── index.ts              # Express server entry point
│   │   ├── spotify.ts            # OAuth + polling + EventEmitter
│   │   ├── lyrics.ts             # Facade — re-exports public API
│   │   ├── lyrics-types.ts       # LyricLine, LyricWord, LyricsProvider interfaces
│   │   ├── lyrics-utils.ts       # parseLrc(), enrichWithRomaji()
│   │   ├── lyrics-service.ts     # Provider chain + cache
│   │   ├── providers/
│   │   │   ├── unison.ts         # Unison provider (TTML/richsync)
│   │   │   └── lrclib.ts         # lrclib provider (LRC/plain)
│   │   ├── romaji.ts             # kuroshiro initialization
│   │   └── ws.ts                 # WebSocket broadcast
│   ├── web/
│   │   ├── index.html            # Vite entry HTML
│   │   ├── main.ts               # WS client + DOM updates
│   │   ├── style.css             # Liquid glass + karaoke gradient
│   │   └── vite.config.ts        # Dev server + proxy
│   └── cli/
│       └── index.ts              # blessed TUI client
├── .env                          # Secrets (gitignored)
├── .env.example                  # Template
├── package.json                  # Dependencies + scripts
└── tsconfig.json                 # TypeScript config
```
