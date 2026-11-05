/* Sprite atlas: one image plus a JSON map of named rectangles (the common "sprite sheet" layout).
   If a name is missing, draw() returns false and the caller falls back to its procedural drawing, so art can arrive piece by piece
   and a half-finished sheet never breaks the map.

   atlas.json:  { "image": "atlas.png", "frames": { "bld_3": { "x": 0, "y": 0, "w": 64, "h": 64 }, ... } }
   Optional per-frame "ax"/"ay" anchors (0..1, default 0/0 = top-left) say which point of the sprite sits at the draw position. */
export interface Frame { x: number; y: number; w: number; h: number; ax?: number; ay?: number }
export interface AtlasData { image: string; frames: Record<string, Frame> }

export class SpriteAtlas {
  constructor(private img: CanvasImageSource | null = null, private frames: Record<string, Frame> = {}) { }
  /** An atlas with nothing in it: every draw() returns false. */
  static readonly empty = new SpriteAtlas();

  static async load(jsonUrl: string): Promise<SpriteAtlas> {
    const data: AtlasData = await (await fetch(jsonUrl)).json();
    const img = new Image(); img.src = new URL(data.image, new URL(jsonUrl, location.href)).href; await img.decode();
    return new SpriteAtlas(img, data.frames);
  }
  has(name: string) { return !!this.img && name in this.frames; }
  /** Draw the sprite scaled into the box (x, y, w, h). Returns false if the sprite is not in the atlas. */
  draw(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number): boolean {
    const f = this.img && this.frames[name]; if (!f) return false;
    ctx.drawImage(this.img!, f.x, f.y, f.w, f.h, x - (f.ax || 0) * w, y - (f.ay || 0) * h, w, h);
    return true;
  }
  /** Draw the sprite centred on (cx, cy), `size` pixels wide, keeping its aspect ratio. */
  drawCentered(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, size: number): boolean {
    const f = this.img && this.frames[name]; if (!f) return false;
    const h = size * f.h / f.w; ctx.drawImage(this.img!, f.x, f.y, f.w, f.h, cx - size / 2, cy - h / 2, size, h); return true;
  }
}
