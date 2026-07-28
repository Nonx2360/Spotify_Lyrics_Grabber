import { fetchLyrics } from "./lyrics-service.js";
import type { LyricLine, LyricWord } from "./lyrics-types.js";
export type { LyricLine } from "./lyrics-types.js";

export async function getSyncedLyrics(
  track: string,
  artist: string,
  durationMs: number
): Promise<LyricLine[]> {
  return fetchLyrics(track, artist, durationMs);
}

export function getCurrentLine(
  lyrics: LyricLine[],
  progressMs: number
): { line: string; romaji: string | null; words?: LyricWord[]; wordIndex?: number } {
  if (lyrics.length === 0) return { line: "", romaji: null };
  let lo = 0;
  let hi = lyrics.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lyrics[mid].timeMs <= progressMs) lo = mid + 1;
    else hi = mid - 1;
  }
  const idx = hi >= 0 ? hi : 0;
  const current = lyrics[idx];

  let wordIndex: number | undefined;
  if (current.words && current.words.length > 0) {
    let wlo = 0;
    let whi = current.words.length - 1;
    while (wlo <= whi) {
      const wmid = (wlo + whi) >>> 1;
      if (current.words[wmid].startMs <= progressMs) wlo = wmid + 1;
      else whi = wmid - 1;
    }
    wordIndex = whi >= 0 ? whi : 0;
  }

  return { line: current.line, romaji: current.romaji, words: current.words, wordIndex };
}
