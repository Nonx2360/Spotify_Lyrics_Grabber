import type { LyricLine, LyricsProvider } from "./lyrics-types.js";
import { LrclibProvider } from "./providers/lrclib.js";
import { UnisonProvider } from "./providers/unison.js";

const providers: LyricsProvider[] = [new UnisonProvider(), new LrclibProvider()];

const lyricsCache = new Map<string, LyricLine[]>();

function cacheKey(song: string, artist: string): string {
  return `${song}::${artist}`;
}

function providersForTrack(): LyricsProvider[] {
  return providers;
}

export async function fetchLyrics(
  song: string,
  artist: string,
  durationMs: number
): Promise<LyricLine[]> {
  const key = cacheKey(song, artist);
  if (lyricsCache.has(key)) return lyricsCache.get(key)!;

  for (const provider of providersForTrack()) {
    const result = await provider.getLyrics({ song, artist, duration: durationMs });
    if (result && result.length > 0) {
      lyricsCache.set(key, result);
      return result;
    }
  }

  return [];
}
