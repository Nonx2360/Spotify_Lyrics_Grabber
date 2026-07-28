import type { LyricsProvider, LyricsQuery, LyricLine } from "../lyrics-types.js";
import { parseLrc, enrichWithRomaji } from "../lyrics-utils.js";

interface LrcLibResponse {
  trackName: string;
  artistName: string;
  duration: number;
  syncedLyrics?: string;
  plainLyrics?: string;
}

export class LrclibProvider implements LyricsProvider {
  name = "lrclib";

  async getLyrics({ song, artist, duration }: LyricsQuery): Promise<LyricLine[] | null> {
    try {
      const getParams = new URLSearchParams({
        track_name: song,
        artist_name: artist,
      });
      const res = await fetch(`https://lrclib.net/api/get?${getParams}`);
      if (res.ok) {
        const data: LrcLibResponse = await res.json();
        if (data.syncedLyrics) return this.normalize(data);
      }

      const searchParams = new URLSearchParams({
        track_name: song,
        artist_name: artist,
        duration: String(Math.round((duration ?? 0) / 1000)),
      });
      const searchRes = await fetch(`https://lrclib.net/api/search?${searchParams}`);
      if (!searchRes.ok) return null;
      const results: LrcLibResponse[] = await searchRes.json();
      if (results.length === 0) return null;
      const best = results.find((r) => r.syncedLyrics) || results[0];
      return this.normalize(best);
    } catch {
      return null;
    }
  }

  private async normalize(data: LrcLibResponse): Promise<LyricLine[] | null> {
    if (data.syncedLyrics) {
      const parsed = parseLrc(data.syncedLyrics);
      return enrichWithRomaji(parsed);
    }
    if (data.plainLyrics) {
      return enrichWithRomaji([{ timeMs: 0, line: data.plainLyrics }]);
    }
    return null;
  }
}
