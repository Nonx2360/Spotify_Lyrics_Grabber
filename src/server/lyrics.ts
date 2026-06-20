import { getRomaji } from "./romaji.js";

export interface LyricLine {
  timeMs: number;
  line: string;
  romaji: string | null;
}

interface LrcLibResponse {
  trackName: string;
  artistName: string;
  duration: number;
  syncedLyrics?: string;
  plainLyrics?: string;
}

const lyricsCache = new Map<string, LyricLine[]>();

function parseLrc(lrc: string): { timeMs: number; line: string }[] {
  const lines: { timeMs: number; line: string }[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
  for (const raw of lrc.split("\n")) {
    const times: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = parseInt(match[3].padEnd(3, "0"), 10);
      times.push(min * 60000 + sec * 1000 + ms);
    }
    const text = raw.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, "").trim();
    for (const t of times) {
      lines.push({ timeMs: t, line: text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

async function enrichWithRomaji(lines: { timeMs: number; line: string }[]): Promise<LyricLine[]> {
  return Promise.all(
    lines.map(async (l) => ({
      ...l,
      romaji: await getRomaji(l.line),
    }))
  );
}

export async function getSyncedLyrics(
  track: string,
  artist: string,
  durationMs: number
): Promise<LyricLine[]> {
  const cacheKey = `${track}::${artist}`;
  if (lyricsCache.has(cacheKey)) return lyricsCache.get(cacheKey)!;

  const params = new URLSearchParams({
    track_name: track,
    artist_name: artist,
    duration: String(Math.round(durationMs / 1000)),
  });
  try {
    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) {
      const searchRes = await fetch(
        `https://lrclib.net/api/search?${params}`
      );
      if (!searchRes.ok) return [];
      const results: LrcLibResponse[] = await searchRes.json();
      if (results.length === 0) return [];
      const best =
        results.find((r) => r.syncedLyrics) || results[0];
      if (!best.syncedLyrics) {
        const fallback = [{ timeMs: 0, line: best.plainLyrics || "No lyrics found." }];
        const enriched = await enrichWithRomaji(fallback);
        lyricsCache.set(cacheKey, enriched);
        return enriched;
      }
      const parsed = parseLrc(best.syncedLyrics);
      const enriched = await enrichWithRomaji(parsed);
      lyricsCache.set(cacheKey, enriched);
      return enriched;
    }
    const data: LrcLibResponse = await res.json();
    if (!data.syncedLyrics) {
      const fallback = [{ timeMs: 0, line: data.plainLyrics || "No lyrics found." }];
      const enriched = await enrichWithRomaji(fallback);
      lyricsCache.set(cacheKey, enriched);
      return enriched;
    }
    const parsed = parseLrc(data.syncedLyrics);
    const enriched = await enrichWithRomaji(parsed);
    lyricsCache.set(cacheKey, enriched);
    return enriched;
  } catch {
    return [];
  }
}

export function getCurrentLine(
  lyrics: LyricLine[],
  progressMs: number
): { line: string; romaji: string | null } {
  if (lyrics.length === 0) return { line: "", romaji: null };
  let lo = 0;
  let hi = lyrics.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lyrics[mid].timeMs <= progressMs) lo = mid + 1;
    else hi = mid - 1;
  }
  const idx = hi >= 0 ? hi : 0;
  return { line: lyrics[idx].line, romaji: lyrics[idx].romaji };
}
