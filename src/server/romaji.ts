import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

const KuroshiroConstructor = (Kuroshiro as any).default || Kuroshiro;
const KuromojiAnalyzerConstructor = (KuromojiAnalyzer as any).default || KuromojiAnalyzer;

let kuroshiro: any;

export async function initRomaji(): Promise<void> {
  kuroshiro = new KuroshiroConstructor();
  await kuroshiro.init(new KuromojiAnalyzerConstructor());
  console.log("Kuroshiro romaji engine initialized");
}

export function isJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

export async function getRomaji(line: string): Promise<string | null> {
  if (!isJapanese(line)) return null;
  return await kuroshiro.convert(line, { to: "romaji", mode: "spaced" });
}
