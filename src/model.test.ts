/// <reference types="node" />
import { describe, expect, it, vi, afterEach } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import type { Game } from "@clockwyrks/simple-2d";
import { game } from "./game";
import type { FacetState, FacetDebugApi } from "./game";
import { debugApi as d } from "./debug";
import {
  advance,
  cellX,
  cellY,
  deal,
  initialState,
  legalSwap,
  requestSwap,
  resolve,
  runs,
  stepHold,
} from "./model";
import { action, hitCell, targets } from "./input";
import * as C from "./constants";

const latin = Array.from({ length: C.GRID_ROWS }, (_, r) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, c) => "RACJBSM"[(c + 2 * r) % 7] + "0",
  ).join(" "),
);
const posed = () => d.setScreen(d.loadBoard(initialState(), latin), "playing");
const set = (s: FacetState, c: number, r: number, t: string) =>
  d.setGem(s, c, r, t);
const refill = (s: FacetState) => {
  for (let c = 0; c < 8; c++)
    s = d.setRefillKinds(
      s,
      c,
      Array.from({ length: 8 }, (_, r) => "RACJBSM"[(c + 2 * r) % 7]).join(""),
    );
  return s;
};
function matchState() {
  let s = posed();
  s = set(s, 0, 4, "R0");
  s = set(s, 1, 4, "R0");
  s = set(s, 2, 4, "A0");
  s = set(s, 2, 5, "R0");
  return refill(s);
}
afterEach(() => vi.restoreAllMocks());

describe("opening boards and move enforcement", () => {
  it("deals only run-free, playable boards with genuine entrance distances", () => {
    for (let n = 0; n < 30; n++) {
      const b = deal();
      expect(b.cells).toHaveLength(64);
      expect(runs(b)).toEqual([]);
      expect(legalSwap(b)).toBe(true);
      expect(
        b.cells.every(
          (g) => g.cut === "plain" && g.strain === 0 && g.fell >= g.row + 1,
        ),
      ).toBe(true);
    }
  });
  it("refuses unproductive, diagonal, and non-neighbor moves immutably", () => {
    const s = posed();
    expect(legalSwap(s.board)).toBe(false);
    for (const b of [
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 4, row: 0 },
    ]) {
      const next = requestSwap(s, { col: 0, row: 0 }, b);
      expect(next.board).toBe(s.board);
      expect(next.refusal?.b).toEqual(b);
    }
    expect(s.refusal).toBeNull();
  });
  it("exchanges immediately, zeros the two journeys, and clears only after the swap span", () => {
    const s = matchState(),
      n = requestSwap(s, { col: 2, row: 4 }, { col: 2, row: 5 });
    expect(n.phase).toBe("swapping");
    expect(n.board.cells[34].kind).toBe("ruby");
    expect(n.score).toBe(0);
    expect(advance(n, C.SWAP_SECONDS / 2).phase).toBe("swapping");
    const resolved = advance(n, C.SWAP_SECONDS);
    expect(resolved.chainStep).toBe(1);
    expect(resolved.lastCleared).toBeGreaterThanOrEqual(3);
    expect(resolved.score).toBeGreaterThanOrEqual(30);
    expect(requestSwap(n, { col: 0, row: 0 }, { col: 1, row: 0 }).phase).toBe(
      "swapping",
    );
  });
});

describe("clear closure, strain, score and cuts", () => {
  it("counts maximal runs once and excludes kindless prisms", () => {
    let s = posed();
    for (let c = 0; c < 6; c++) s = set(s, c, 3, "J0");
    expect(runs(s.board).filter((r) => r.length === 6)).toHaveLength(1);
    s = set(s, 3, 3, "X0");
    expect(runs(s.board).some((r) => r.length >= 6)).toBe(false);
  });
  it("propagates flawed neighbors by breadth-first waves and scores their old strain", () => {
    let s = posed();
    for (let c = 0; c < 3; c++) s = set(s, c, 4, "R0");
    s = set(s, 3, 4, "J3");
    s = set(s, 4, 4, "B3");
    s = set(s, 5, 4, "S2");
    const n = resolve({ ...refill(s), chainStep: 2, phase: "resolving" });
    expect(n.lastCleared).toBe(5);
    expect(n.lastWaves).toBe(2);
    expect(n.lastPoints).toBe(140);
    expect(
      n.board.cells.find((g) => g.kind === "sapphire" && g.strain === 3),
    ).toBeDefined();
    expect(s.board.cells[37].strain).toBe(2);
  });
  it("raises a neighbor's strain once even beside multiple cleared cells", () => {
    let s = posed();
    for (const [c, r] of [
      [2, 2],
      [3, 2],
      [4, 2],
      [2, 3],
      [3, 3],
      [4, 3],
    ])
      s = set(s, c, r, "R0");
    s = set(s, 3, 4, "J1");
    const n = resolve({ ...refill(s), chainStep: 1 });
    expect(
      n.board.cells.find(
        (g) => g.kind === "jade" && g.col === 3 && g.strain === 2,
      ),
    ).toBeDefined();
  });
  it("expands brilliants into eight neighbors, then stars across both axes", () => {
    let s = posed();
    s = set(s, 1, 3, "R0");
    s = set(s, 2, 3, "R0b");
    s = set(s, 3, 3, "R0");
    s = set(s, 3, 2, "B0s");
    const n = resolve({ ...refill(s), chainStep: 1 });
    expect(n.lastCleared).toBe(19);
    expect(n.lastWaves).toBeGreaterThanOrEqual(2);
    expect(
      n.motion?.cleared?.some((c) => c.gem.col === 7 && c.gem.row === 2),
    ).toBe(true);
  });
  it.each([
    [4, "brilliant"],
    [5, "prism"],
    [6, "prism"],
  ] as const)(
    "a run of %i earns a %s at the lower-middle fallback",
    (length, cut) => {
      let s = posed();
      for (let c = 0; c < length; c++) s = set(s, c, 7, "R0");
      const n = resolve({ ...refill(s), chainStep: 1 });
      const earned = n.board.cells.find((g) => g.cut === cut);
      expect(earned?.col).toBe(Math.floor((length - 1) / 2));
      expect(earned?.strain).toBe(0);
      expect(earned?.kind).toBe(cut === "prism" ? null : "ruby");
    },
  );
  it("places a created cut at a swap cell before gravity carries it", () => {
    let s = posed();
    for (let c = 0; c < 4; c++) s = set(s, c, 7, "R0");
    const n = resolve({
      ...refill(s),
      chainStep: 1,
      motion: {
        swap: [
          { col: 3, row: 7 },
          { col: 3, row: 6 },
        ],
      },
    });
    expect(n.board.cells.find((g) => g.cut === "brilliant")?.col).toBe(3);
  });
  it("creates a star at an intersection, with prism priority on a shared cell", () => {
    let s = posed();
    for (let c = 1; c <= 3; c++) s = set(s, c, 5, "R0");
    for (let r = 4; r <= 6; r++) s = set(s, 2, r, "R0");
    let n = resolve({ ...refill(s), chainStep: 1 });
    expect(n.motion?.created?.some((g) => g.col === 2 && g.row === 5)).toBe(
      true,
    );
    expect(n.board.cells.some((g) => g.cut === "star")).toBe(true);
    for (let c = 0; c <= 4; c++) s = set(s, c, 5, "R0");
    n = resolve({ ...refill(s), chainStep: 1 });
    expect(n.board.cells.some((g) => g.cut === "prism")).toBe(true);
    expect(n.board.cells.some((g) => g.cut === "star")).toBe(false);
  });
  it("a prism swap seeds its traded kind and a double-prism swap seeds all cells", () => {
    let s = set(posed(), 0, 0, "X0");
    let n = requestSwap(refill(s), { col: 0, row: 0 }, { col: 1, row: 0 });
    const count = s.board.cells.filter((g) => g.kind === "amber").length + 1;
    n = advance(n, C.SWAP_SECONDS);
    expect(n.lastCleared).toBe(count);
    expect(n.motion?.created).toEqual([]);
    s = set(s, 1, 0, "X0");
    n = advance(
      requestSwap(refill(s), { col: 0, row: 0 }, { col: 1, row: 0 }),
      C.SWAP_SECONDS,
    );
    expect(n.lastCleared).toBe(64);
    expect(n.lastWaves).toBe(0);
    expect(
      n.board.cells.every((g) => g.cut === "plain" && g.fell >= g.row + 1),
    ).toBe(true);
  });
  it("caps the multiplier at eight", () => {
    let s = posed();
    for (let c = 0; c < 3; c++) s = set(s, c, 7, "R0");
    const n = resolve({ ...refill(s), chainStep: 12 });
    expect(n.lastPoints).toBe(240);
    expect(n.bestChain).toBe(12);
  });
});

describe("timing and screen lifecycles", () => {
  it("ends a settled round with no legal swaps, and back retains its finished board", () => {
    const cues = new Set<string>();
    const s = advance(
      { ...posed(), phase: "resolving", chainStep: 1, moveScore: 80 },
      C.STEP_SECONDS,
      cues,
    );
    expect(s.screen).toBe("gameover");
    expect(s.bestMove).toBe(80);
    expect(cues.has(C.CUES.gameOver)).toBe(true);
    const title = action(s, "back");
    expect(title.screen).toBe("title");
    expect(title.board).toBe(s.board);
  });
  it("emits the landing cue at the longest fall boundary, only once", () => {
    const s = advance(
      requestSwap(matchState(), { col: 2, row: 4 }, { col: 2, row: 5 }),
      C.SWAP_SECONDS,
    );
    const landing = {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, i) => (i === 0 ? { ...g, fell: 5 } : g)),
      },
    };
    const cues = new Set<string>();
    const n = advance(
      landing,
      landing.lastWaves * C.WAVE_SECONDS + 5 * C.FALL_SECONDS_PER_ROW,
      cues,
    );
    expect(cues.has(C.CUES.land)).toBe(true);
    cues.clear();
    advance(n, 0.01, cues);
    expect(cues.has(C.CUES.land)).toBe(false);
  });
  it("consumes boundaries equivalently under one large or many uneven frames", () => {
    const start = requestSwap(
      matchState(),
      { col: 2, row: 4 },
      { col: 2, row: 5 },
    );
    let split = start;
    for (const dt of [0.03, 0.11, 0.04, 0.12, 0.19]) split = advance(split, dt);
    const whole = advance(start, 0.49);
    expect(d.snapshot(split)).toEqual(d.snapshot(whole));
  });
  it("retains the final clear rung when a long frame also settles its chain", () => {
    const cues = new Set<string>();
    const start = requestSwap(
      matchState(),
      { col: 2, row: 4 },
      { col: 2, row: 5 },
    );
    const s = advance(start, 5, cues);
    expect(s.chainStep).toBe(0);
    expect([...cues].filter((c) => c.startsWith("rung-"))).toHaveLength(1);
    expect(cues.has("rung-0")).toBe(false);
  });
  it("holds fell after the chain rests, and measures best move at that boundary", () => {
    let s = advance(
      requestSwap(matchState(), { col: 2, row: 4 }, { col: 2, row: 5 }),
      C.SWAP_SECONDS,
    );
    expect(s.bestMove).toBe(0);
    for (let i = 0; i < 30 && s.phase !== "idle"; i++)
      s = advance(s, stepHold(s));
    expect(s.phase).toBe("idle");
    expect(s.bestMove).toBe(s.moveScore);
    expect(s.board.cells.some((g) => g.fell > 0)).toBe(true);
  });
  it.each(["title", "howto", "paused", "levelclear", "gameover"] as const)(
    "freezes resolution and refusal on %s",
    (screen) => {
      const s = {
        ...requestSwap(matchState(), { col: 2, row: 4 }, { col: 2, row: 5 }),
        screen,
      };
      expect(advance(s, 50)).toBe(s);
    },
  );
  it("expires a refusal only in play", () => {
    const s = requestSwap(posed(), { col: 0, row: 0 }, { col: 1, row: 0 });
    expect(advance(s, 0.29).refusal).not.toBeNull();
    expect(advance(s, 0.3).refusal).toBeNull();
  });
  it("gives level completion priority, then continues with a fresh measured level", () => {
    let s = d.setLevelScore(matchState(), C.LEVEL_TARGET_STEP);
    s = advance(requestSwap(s, { col: 2, row: 4 }, { col: 2, row: 5 }), 4);
    expect(s.screen).toBe("levelclear");
    const score = s.score;
    s = action(s, "confirm");
    expect(s.level).toBe(2);
    expect(s.levelScore).toBe(0);
    expect(s.bestMove).toBe(0);
    expect(s.bestChain).toBe(0);
    expect(s.score).toBe(score);
    expect(runs(s.board)).toEqual([]);
  });
  it("quits by putting the board down while preserving round figures", () => {
    const s = action(
      { ...matchState(), screen: "paused", score: 123, menuIndex: 1 },
      "confirm",
    );
    expect(s.screen).toBe("title");
    expect(s.board.cells).toEqual([]);
    expect(s.score).toBe(123);
    expect(s.phase).toBe("idle");
    expect(action(s, "confirm").score).toBe(0);
  });
});

describe("pointer and debug contract", () => {
  it.each(["mouse", "pen", "touch"] as const)(
    "offers and withdraws before releasing with %s",
    (device) => {
      let s = matchState();
      s = d.pointerDown(s, cellX(2), cellY(4), device);
      s = d.pointerMove(s, cellX(2), cellY(5), device);
      expect(s.offer).toEqual({ col: 2, row: 5 });
      expect(s.phase).toBe("idle");
      s = d.pointerMove(s, cellX(2), cellY(4), device);
      expect(s.offer).toBeNull();
      s = d.pointerUp(s, device);
      expect(s.selection).toEqual({ col: 2, row: 4 });
      s = d.pointerDown(s, cellX(2), cellY(5), device);
      s = d.pointerUp(s, device);
      expect(s.phase).toBe("swapping");
      expect(s.selection).toBeNull();
      expect(s.pointer.device).toBe(device);
    },
  );
  it("retains an offer when moving away and clears selection on an empty press", () => {
    let s = d.pointerDown(matchState(), cellX(2), cellY(4));
    s = d.pointerMove(s, cellX(2), cellY(5));
    s = d.pointerMove(s, 0, 0);
    expect(s.offer).not.toBeNull();
    s = d.pointerUp(s);
    expect(s.phase).toBe("swapping");
    s = d.pointerDown(s, 0, 0);
    expect(s.selection).toBeNull();
  });
  it("uses Euclidean hits and resolves boundary ties in reading order", () => {
    expect(hitCell(cellX(0) + 36, cellY(0))).toEqual({ col: 0, row: 0 });
    expect(hitCell(cellX(0), cellY(0) + 36)).toEqual({ col: 0, row: 0 });
    expect(hitCell(cellX(0) + 35, cellY(0) + 35)).toBeNull();
  });
  it("requires release in the same armed target on every menu", () => {
    for (const screen of [
      "title",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      let s: FacetState = { ...matchState(), screen };
      const t = targets(s)[1];
      s = d.pointerDown(s, t.x + 2, t.y + 2);
      expect(s.menuIndex).toBe(1);
      s = d.pointerMove(s, 0, 0);
      s = d.pointerUp(s);
      expect(s.screen).toBe(screen);
      s = d.pointerDown(s, t.x + 2, t.y + 2);
      s = d.pointerUp(s);
      expect(s.screen).toBe(screen === "title" ? "howto" : "title");
    }
  });
  it("keeps all targets fingertip-sized, disjoint, and inside the logical stage", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const)
      for (const t of targets({ ...initialState(), screen })) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
      }
  });
  it("validates fixed domains loudly, including malformed boards and tokens", () => {
    const s = posed();
    for (const f of [
      () => d.setGem(s, 8, 0, "R0"),
      () => d.setGem(s, 0, 0, "X0b"),
      () => d.setLevel(s, 0),
      () => d.setMenuIndex(s, -1),
      () => d.loadBoard(s, ["R0"]),
      () => d.setRefillKinds(s, 0, "X"),
      () => d.pointerDown(s, NaN, 0),
    ])
      expect(f).toThrow();
  });
  it("poses each declared element independently and reconciles without advancing", () => {
    let s = matchState();
    s = d.setScore(s, 55);
    s = d.setLevel(s, 4);
    s = d.setLevelScore(s, 99);
    s = d.setBestChain(s, 8);
    s = d.setBestMove(s, 800);
    s = d.setMoveScore(s, 70);
    s = d.setMenuIndex(s, 99);
    s = d.setSelection(s, 7, 7);
    s = d.setOffer(s, 0, 0);
    const n = d.reconcile(s);
    expect(n).toEqual(s);
    const snap = d.snapshot(n);
    expect(snap.levelTarget).toBe(8000);
    expect(snap.bestMove).toBe(800);
    expect(snap.offer).toEqual({ col: 0, row: 0 });
    expect(snap.board.cells[0].x).toBe(cellX(0));
    s = d.clearSelection(s);
    expect(s.offer).not.toBeNull();
    s = d.clearOffer(s);
    s = d.clearRefillKinds(s);
    expect(s.refillKinds.every((k) => k === "")).toBe(true);
    expect(d.reset({ ...s, muted: true })).toEqual({
      ...initialState(),
      muted: true,
      assets: undefined,
    });
  });
  it("poses numerical points exactly without imposing an unstated minimum or rounding", () => {
    const s = d.setScore(posed(), -1.25);
    expect(s.score).toBe(-1.25);
    expect(d.setLevelScore(s, 5.5).levelScore).toBe(5.5);
  });
});

describe("engine integration", () => {
  it("loads every produced asset, renders all screens, drives keys, and advances a real chain", async () => {
    const eventTarget = new EventTarget();
    const loaded: string[] = [];
    const testGame: Game<FacetState, FacetDebugApi> = {
      ...game,
      initialize: (api) =>
        game.initialize({
          ...api,
          assets: {
            ...api.assets,
            loadImage: async (path) => {
              loaded.push(path);
              return (await loadImage(
                await readFile(`public/assets/${path}`),
              )) as unknown as ImageBitmap;
            },
            load: async (path) => {
              loaded.push(path);
              return new Blob([await readFile(`public/assets/${path}`)]);
            },
          },
          audio: {
            ...api.audio,
            load: async (cue, path) => {
              const bytes = await readFile(`public/assets/${path}`);
              expect(bytes.length).toBeGreaterThan(44);
              loaded.push(path);
              api.audio.define(cue, { freq: 440, durationMs: 1, gain: 0 });
            },
          },
        }),
    };
    const e = createEngine({
      game: testGame,
      canvas: createCanvas(
        C.STAGE_W,
        C.STAGE_H,
      ) as unknown as HTMLCanvasElement,
      width: C.STAGE_W,
      height: C.STAGE_H,
      clock: new ConstantClock(20),
      surface: {
        cssWidth: () => C.STAGE_W,
        cssHeight: () => C.STAGE_H,
        dpr: () => 1,
        events: () => eventTarget,
      },
    });
    const played: string[] = [];
    e.events.on("cue:played", (ev) => played.push(ev.cue));
    await e.initialize();
    expect(loaded.length).toBeGreaterThan(100);
    for (const screen of [
      "title",
      "howto",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      e.apply((s) => e.debug.setScreen(s, screen));
      await e.advance(1);
    }
    e.apply((s) => ({ ...matchState(), assets: s.assets }));
    e.apply((s) => e.debug.requestSwap(s, 2, 4, 2, 5));
    await e.advance(10);
    expect(e.state.score).toBeGreaterThan(0);
    expect(played).toContain(C.CUES.clear);
    // Coalesced browser input must retain every primary pointer sample in order.
    e.apply((s) => ({ ...matchState(), assets: s.assets }));
    const pointer = (type: string, col: number, row: number, buttons: number) =>
      eventTarget.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: cellX(col),
          clientY: cellY(row),
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons,
        }),
      );
    pointer("pointerdown", 2, 4, 1);
    pointer("pointermove", 2, 5, 1);
    pointer("pointerup", 2, 5, 0);
    await e.advance(1);
    expect(e.state.phase).toBe("swapping");
    expect(e.state.pointer.device).toBe("touch");
    expect(played).toContain(C.CUES.select);
    expect(played).toContain(C.CUES.swap);
    e.apply((s) => ({ ...posed(), assets: s.assets }));
    pointer("pointerdown", 0, 0, 1);
    pointer("pointermove", 1, 0, 1);
    pointer("pointerup", 1, 0, 0);
    await e.advance(1);
    expect(e.state.refusal).not.toBeNull();
    expect(played).toContain(C.CUES.refuse);
    expect(e.diagnostics().every((r) => r.error === undefined)).toBe(true);
    const key = (type: string, code: string) =>
      eventTarget.dispatchEvent(
        Object.assign(new Event(type), { code, repeat: false }),
      );
    key("keydown", "KeyP");
    await e.advance(1);
    key("keyup", "KeyP");
    expect(e.state.screen).toBe("paused");
    const timer = e.state.stepTimer;
    e.setClock(new SequenceClock([11, 49, 22]));
    await e.advance(3);
    expect(e.state.stepTimer).toBe(timer);
    expect(e.state.simTime).toBeGreaterThan(0);
    key("keydown", "KeyM");
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    e.destroy();
  });
});
