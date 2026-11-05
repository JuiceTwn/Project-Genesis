/* The contract between the game client and a renderer. The game code owns the state and the camera; a renderer only reads a RenderView and paints it.
   To change how the world looks, write a new Renderer (or give the Canvas 2D one a different Theme / SpriteAtlas / terrain painter). */
import type { BldView, SettView, StatsMsg, DetailMsg } from '../../shared/protocol';
import type { Camera } from './camera';

/** A dot as the client sees it (identity from init/born, motion from each frame). */
export interface DotView { id: number; name: string; job: number; home: number; traits: string[]; col: string; x: number; y: number; tx: number; ty: number; fx: number; fy: number; t0: number; fl: number; seen: boolean; wasSeen?: boolean; [k: string]: any }
/** A speech bubble: `inv` is the invented word, `en` its translation. d = dot id or b = building id. */
export interface Bubble { t0: number; inv: string; en: string; d?: number; b?: number }

export interface RenderView {
  camera: Camera;
  /** Map size in tiles, terrain classes, water/walkability string and elevation. */
  W: number; H: number; tiles: string; wk: string; el: Uint8Array;
  setts: SettView[]; blds: BldView[]; dots: DotView[];
  stat: StatsMsg | null; detail: DetailMsg | null;
  /** Selected dot id or -1. */
  sel: number;
  /** Zoomed-out overview: dots per 8x8-tile cell (null when individual dots are sent). */
  dens: Uint8Array | null; denseW: number; denseH: number;
  /** Time of day 0..1, and whether speech bubbles show translations. */
  tod: number; translate: boolean;
  bubbles: Bubble[];
  /** People inside each building, by building id (for lit windows at night). */
  occ: number[];
}

export interface Renderer {
  /** Size the drawing surface (CSS pixels and device pixel ratio). */
  resize(cssW: number, cssH: number, dpr: number): void;
  /** The static world (tiles, water, elevation) changed: repaint the terrain layer soon. */
  terrainChanged(): void;
  /** Paint one frame. Must not modify the view. */
  frame(view: RenderView, now: number): void;
}

/** Paints the whole static terrain (land, water, trees, roads) into `g`, T px per tile. Replace it to restyle the ground. */
export type TerrainPainter = (g: CanvasRenderingContext2D, v: RenderView, T: number) => void;
