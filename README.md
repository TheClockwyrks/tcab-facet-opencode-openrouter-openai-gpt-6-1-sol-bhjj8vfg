# Facet

**Pressure finds the flaw.** A browser puzzle of seven cut stones, gathering strain, and cascading chain reactions. Match neighboring gems, exploit the flaws left by earlier clears, and earn brilliant, star, and prism cuts. Each level asks for more points; a round ends when no productive swap remains.

## Run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser, with no backend or network services.

## Production

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`. Serve that directory from a static server at the origin root or any sub-path. All asset references are relative.

## Controls

- **Mouse, pen, or touch:** hold a gem, drag onto an orthogonal neighbor, and release to swap. Drag back to withdraw the offer. You can also select a gem and press/release its neighbor.
- **Menus:** click/tap a choice, or use **↑ / ↓** and **Enter / Space**.
- **Pause/resume:** **Esc / P**, or the drawn **PAUSE** control.
- **Back:** **Esc**, or the drawn **BACK** control on the instructions screen.
- **Mute all audio:** **M**. Sound unlocks on the first interaction.
- **Diagnostics:** **backtick**.

## Development and verification

```sh
npx tsc --noEmit
npx eslint .
npx prettier --check .
npx vitest run --coverage
```

The immutable rules core is in `src/model.ts`, controls in `src/input.ts`, automation poses and snapshots in `src/debug.ts`, and canvas presentation in `src/render.ts`. `src/game.ts` assembles them on Simple 2D. Tests exercise rules, timing, controls, and a complete engine with a native canvas.

The debug surface is returned by the game's initialization and accessed through `engine.debug`; poses run through `engine.apply`. No game handle is installed on the published page.

## Original assets

`public/assets/` contains the complete produced art and audio: 32 gem damage sprites, brilliant/star treatments, a pixel-inlaid board surround, seven six-frame break sequences, twelve-frame prism turns at every damage state, four authored particle systems, eight chain-ladder tones, eight distinct event sounds, a sampled shatter body, and title/play compositions with MIDI scores.

`tools/produce.py` documents the one-time authoring procedure using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. Those studio tools are **not required to install, build, or play**. The build simply bundles the finished files already in the repository. Canvas chrome and typography are drawn in code; particle appearances come from the shipped systems and are simulated using the particle runtime.

`showcase/` contains live screenshots and a gzipped Simple 2D draw-command replay. With a development server running, `node tools/capture.mjs` captures these through a separate development-only engine harness.
