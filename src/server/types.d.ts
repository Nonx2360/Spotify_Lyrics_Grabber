declare module "kuroshiro" {
  export default class Kuroshiro {
    init(analyzer: any): Promise<void>;
    convert(input: string, options: { to: string; mode?: string }): Promise<string>;
  }
}

declare module "kuroshiro-analyzer-kuromoji" {
  export default class KuromojiAnalyzer {
    constructor();
  }
}
