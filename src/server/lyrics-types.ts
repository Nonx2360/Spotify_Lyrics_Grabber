export interface LyricWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  timeMs: number;
  line: string;
  romaji: string | null;
  words?: LyricWord[];
}

export interface LyricsQuery {
  song: string;
  artist: string;
  album?: string;
  duration?: number;
}

export interface LyricsProvider {
  name: string;
  getLyrics(params: LyricsQuery): Promise<LyricLine[] | null>;
}
