import { getRomaji } from "./romaji.js";
import type { LyricLine } from "./lyrics-types.js";

export function parseLrc(lrc: string): { timeMs: number; line: string }[] {
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

export async function enrichWithRomaji<T extends { timeMs: number; line: string }>(
  lines: T[]
): Promise<(T & { romaji: string | null })[]> {
  return Promise.all(
    lines.map(async (l) => ({
      ...l,
      romaji: await getRomaji(l.line),
    }))
  );
}
