# Rendering: how to change how Dotville looks

The game code (`../main.ts`) owns state, input and the camera. A **Renderer** only reads a `RenderView` and paints it
(`types.ts`). Nothing in the game depends on how the map is drawn.

| I want to... | change this |
|---|---|
| recolour things (ocean, houses, building types, job rings, season/night tint, labels) | `theme.ts` (`THEME`) |
| use art for buildings or people | give `THEME.sprites.building(b)` / `.dot(job)` a name, put that name in the atlas (`sprites.ts`) |
| restyle the ground (grass, water, trees, roads) | pass `terrain: (g, view, T) => ...` to `createCanvas2DRenderer` (default is the procedural painter in `canvas2d.ts`) |
| replace faces | `face.ts` (`drawFace`, used by the dossier, cast list and lower third) |
| add lighting, glow, particles, post effects | write a new `Renderer` (e.g. WebGL/PixiJS) with the same `resize / terrainChanged / frame` interface |
| change UI chrome (HUD, panels, tabs) | the `:root` CSS variables and styles in `../index.html` |

Wire it up in one place, `main.ts`:

```ts
const sprites = await SpriteAtlas.load('/art/atlas.json');          // optional
let renderer = createCanvas2DRenderer(cv, { theme: MY_THEME, sprites, terrain: myTerrainPainter });
```

## Sprite atlas
One image + JSON of named rectangles: `{ "image": "atlas.png", "frames": { "bld_3": { "x":0,"y":0,"w":64,"h":64 } } }`.
A name that is missing is **not an error**: the procedural drawing is used instead, so art can arrive piece by piece.

## Safety net (run these after any visual change)
- `npm run visual:baseline` — capture 16 deterministic frames (desktop + phone: overview, region, town, street, selected dot, night, rain, snow) as the "before".
- `npm run visual:check` — capture again and pixel-diff. A refactor must say "all scenes match"; an intentional restyle shows exactly which scenes changed (re-baseline once you approve).
- `npm run visual:seams` — proves the theme / sprite / fallback / terrain seams still work.
The frames come from the in-page `__dvTest` hook (only exists when a page sets `__DV_TEST__` before loading): it never starts the sim timer or draw loop, steps the sim a fixed number of times, and renders exactly one frame from an explicit camera.

## Not done yet (decide before the pass)
- WebGL or Canvas 2D? Lighting, soft shadows, colour grading and rich weather are much easier on WebGL; Canvas 2D is fine for ~2k dots.
- Dots are still one circle each; per-job sprites and walk animation need an atlas and a frame clock.
- No quality setting / frame-time readout yet (a low/high toggle matters for phones).
