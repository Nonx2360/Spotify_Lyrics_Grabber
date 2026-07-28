import type { LyricsProvider, LyricsQuery, LyricLine } from "../lyrics-types.js";
import { parseLrc, enrichWithRomaji } from "../lyrics-utils.js";

interface UnisonError {
  success: false;
  code: string;
  error: string;
  hint: string;
}

interface UnisonData {
  id: number;
  videoId: string;
  song: string;
  artist: string;
  album?: string;
  duration: number;
  format: "ttml" | "lrc" | "plain";
  syncType: "richsync" | "linesync" | "plain";
  language: string;
  score: number;
  voteCount: number;
  confidence: "low" | "medium" | "high";
  lyrics: string;
}

interface UnisonSuccess {
  success: true;
  data: UnisonData;
}

type UnisonResponse = UnisonSuccess | UnisonError;

function parseTtmlTime(time: string): number {
  const parts = time.split(":");
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseInt(h) * 3600000 + parseInt(m) * 60000 + parseFloat(s) * 1000;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return parseInt(m) * 60000 + parseFloat(s) * 1000;
  }
  return parseFloat(parts[0]) * 1000;
}

function parseTtml(
  ttml: string
): { timeMs: number; line: string; words: { word: string; startMs: number; endMs: number }[] }[] {
  const lines: {
    timeMs: number;
    line: string;
    words: { word: string; startMs: number; endMs: number }[];
  }[] = [];
  const pRegex = /<p\s+begin="([\d:.]+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(ttml)) !== null) {
    const lineStartMs = parseTtmlTime(match[1]);
    const inner = match[2];
    const wordRegex = /<span\s+begin="([\d:.]+)"\s+end="([\d:.]+)"[^>]*>([\s\S]*?)<\/span>/g;
    const words: { word: string; startMs: number; endMs: number }[] = [];
    let lastEnd = 0;
    let wm: RegExpExecArray | null;
    while ((wm = wordRegex.exec(inner)) !== null) {
      const gap = inner.slice(lastEnd, wm.index);
      const w = wm[3].trim();
      if (w) {
        if (words.length > 0 && !/\s/.test(gap)) {
          words[words.length - 1].word += w;
          words[words.length - 1].endMs = parseTtmlTime(wm[2]);
        } else {
          words.push({ word: w, startMs: parseTtmlTime(wm[1]), endMs: parseTtmlTime(wm[2]) });
        }
      }
      lastEnd = wordRegex.lastIndex;
    }
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (text) {
      lines.push({ timeMs: lineStartMs, line: text, words });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

export class UnisonProvider implements LyricsProvider {
  name = "unison";
  private baseUrl = "https://unison.boidu.dev";

  async getLyrics({ song, artist, album, duration }: LyricsQuery): Promise<LyricLine[] | null> {
    try {
      const url = new URL(`${this.baseUrl}/lyrics`);
      url.searchParams.set("song", song);
      url.searchParams.set("artist", artist);
      if (album) url.searchParams.set("album", album);
      if (duration) url.searchParams.set("duration", String(Math.round(duration / 1000)));

      const res = await fetch(url);
      if (!res.ok) return null;

      const json: UnisonResponse = await res.json();
      if (!json.success) return null;

      const data = json.data;
      return this.normalize(data);
    } catch {
      return null;
    }
  }

  private async normalize(data: UnisonData): Promise<LyricLine[] | null> {
    const { format, lyrics } = data;

    if (format === "lrc") {
      const parsed = parseLrc(lyrics);
      return enrichWithRomaji(parsed);
    }

    if (format === "ttml") {
      const parsed = parseTtml(lyrics);
      if (parsed.length > 0) return enrichWithRomaji(parsed);
    }

    if (format === "plain") {
      return enrichWithRomaji([{ timeMs: 0, line: lyrics }]);
    }

    return null;
  }
}
