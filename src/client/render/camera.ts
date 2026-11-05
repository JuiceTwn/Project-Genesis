/* The camera: where we are looking, how zoomed, and which part of the canvas is actually free of floating UI.
   Shared by the game code (picking, following, view reports) and by renderers. Pure maths, no DOM. */
export interface Inset { t: number; r: number; b: number }

export class Camera {
  /** World position (tiles) at the centre of the free area, and zoom relative to `fit`. */
  x = 0; y = 0; z = 1;
  /** Pixels per tile at zoom 1: the whole map fits in the free area. */
  fit = 5;
  /** Canvas size in CSS pixels, and device pixel ratio. */
  cssW = 300; cssH = 200; dpr = 1;
  /** Pixels covered by floating UI: target and the eased value actually in use. */
  readonly inset: Inset = { t: 0, r: 0, b: 0 };
  readonly insetCur: Inset = { t: 0, r: 0, b: 0 };

  /** Pixels per tile right now. */
  sc() { return this.fit * this.z; }
  zMax() { return 40 / this.fit; }
  viewCX() { return (this.cssW - this.insetCur.r) / 2; }
  viewCY() { return this.insetCur.t + (this.cssH - this.insetCur.t - this.insetCur.b) / 2; }
  viewW() { return this.cssW - this.insetCur.r; }
  viewH() { return this.cssH - this.insetCur.t - this.insetCur.b; }
  /** World (tiles) -> canvas CSS pixels. */
  toS(x: number, y: number): [number, number] { return [(x - this.x) * this.sc() + this.viewCX(), (y - this.y) * this.sc() + this.viewCY()]; }
  /** Canvas CSS pixels -> world (tiles). */
  toWorld(px: number, py: number): [number, number] { const s = this.sc(); return [(px - this.viewCX()) / s + this.x, (py - this.viewCY()) / s + this.y]; }
  /** Keep the view inside the map (a map smaller than the view stays centred). */
  clamp(W: number, H: number) {
    const s = this.sc(), vw = this.viewW() / s, vh = this.viewH() / s;
    this.x = vw >= W ? W / 2 : Math.max(vw / 2, Math.min(W - vw / 2, this.x));
    this.y = vh >= H ? H / 2 : Math.max(vh / 2, Math.min(H - vh / 2, this.y));
  }
  /** Glide the used inset toward the target (a panel opened or closed). */
  easeInset(k = 0.18) {
    for (const key of ['t', 'r', 'b'] as const) {
      this.insetCur[key] += (this.inset[key] - this.insetCur[key]) * k;
      if (Math.abs(this.inset[key] - this.insetCur[key]) < 0.5) this.insetCur[key] = this.inset[key];
    }
  }
}
