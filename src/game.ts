import type { Game } from "@clockwyrks/simple-2d";
import "./presentation.css";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { DeepReadonly } from "ts-essentials";
import {
  ACTIONS,
  BINDINGS,
  CUES,
  GEM_KINDS,
  MAX_MULTIPLIER,
} from "./constants";
import { initialState, advance, lastFall, legalSwap } from "./model";
import { debugApi } from "./debug";
import { action, pointerEvent } from "./input";
import { render } from "./render";

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";
export type Cut = "plain" | "brilliant" | "star" | "prism";
export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";
export type Phase = "idle" | "swapping" | "resolving";
export type PointerDevice = "mouse" | "pen" | "touch";
export interface CellRef {
  readonly col: number;
  readonly row: number;
}
export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}
export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}
export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}
export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}
export interface FacetState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;
  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;
  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;
  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;
  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
  /** Loaded resources are immutable, and shared across value transitions. */
  readonly assets?: Resources;
  /** A derivation of the move, retained to present its journey and clear waves. */
  readonly motion?: Motion;
}
export interface Motion {
  readonly swap?: readonly [CellRef, CellRef];
  readonly prismKind?: GemKind | "all";
  readonly before?: BoardState;
  readonly cleared?: readonly {
    readonly gem: GemState;
    readonly wave: number;
  }[];
  readonly created?: readonly CellRef[];
  readonly opening?: number;
}
export interface Resources {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly systems: DeepReadonly<Record<string, ParticleSystem>>;
}
export type { FacetDebugApi } from "./debug";
import type { FacetDebugApi } from "./debug";
export const BACKGROUND = "#0b131b";

export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const name of ACTIONS)
      api.input.register(name, { keys: [...BINDINGS[name]] });
    const paths = ["gems/frame.png", "gems/brilliant.png", "gems/star.png"];
    for (const kind of [...GEM_KINDS, "prism"]) {
      for (let s = 0; s < 4; s++) paths.push(`gems/${kind}-${s}.png`);
      if (kind !== "prism")
        for (let f = 0; f < 6; f++) paths.push(`gems/break/${kind}/${f}.png`);
    }
    for (let strain = 0; strain < 4; strain++) {
      for (let f = 0; f < 12; f++)
        paths.push(`gems/prism-turn/${strain ? `${strain}/` : ""}${f}.png`);
    }
    const images = Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => [p, await api.assets.loadImage(p)]),
      ),
    );
    const systems = Object.fromEntries(
      await Promise.all(
        ["clear", "flawed", "cut", "aura"].map(async (name) => [
          name,
          JSON.parse(
            await (await api.assets.load(`fx/${name}/system.json`)).text(),
          ) as ParticleSystem,
        ]),
      ),
    );
    await Promise.all([
      ...Object.values(CUES)
        .filter((c) => c !== CUES.clear)
        .map((c) => api.audio.load(c, `audio/${c}.wav`)),
      api.audio.load(CUES.clear, "audio/shatter.wav"),
      ...Array.from({ length: MAX_MULTIPLIER }, (_, i) =>
        api.audio.load(`rung-${i + 1}`, `audio/ladder-${i + 1}.wav`),
      ),
      ...["title", "play"].map((c) => api.audio.load(c, `audio/${c}.wav`)),
    ]);
    const sources: Record<
      string,
      (s: FacetState) => string | number | boolean
    > = {
      screen: (s) => s.screen,
      phase: (s) => s.phase,
      board: (s) => `${s.board.cols} × ${s.board.rows}`,
      score: (s) => s.score,
      level: (s) => s.level,
      levelScore: (s) =>
        `${s.levelScore} / ${debugApi.snapshot(s).levelTarget}`,
      chain: (s) => `${s.chainStep} / ×${debugApi.snapshot(s).multiplier}`,
      lastCleared: (s) => s.lastCleared,
      lastPoints: (s) => s.lastPoints,
      lastWaves: (s) => s.lastWaves,
      lastFall,
      selection: (s) => JSON.stringify(s.selection),
      offer: (s) => JSON.stringify(s.offer),
      bestMove: (s) => s.bestMove,
      bestChain: (s) => s.bestChain,
      legalSwap: (s) => legalSwap(s.board),
      pointer: (s) =>
        `${s.pointer.x.toFixed(0)}, ${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    };
    for (const [name, source] of Object.entries(sources))
      api.diagnostics.register(name, source);
    return [{ ...initialState(), assets: { images, systems } }, debugApi];
  },
  update(state, api, dt) {
    let s: FacetState = state;
    const cues = new Set<string>();
    for (const name of ACTIONS) {
      if (!api.input.pressed(name)) continue;
      if (name === "mute") api.audio.setMuted(!api.audio.muted());
      else s = action(s, name);
    }
    for (const sample of api.input.pointerSamples()) {
      if (
        !sample.primary ||
        (sample.button !== null && sample.button !== "primary")
      )
        continue;
      const old = s;
      s = pointerEvent(s, sample.type, sample.x, sample.y, sample.device);
      if (s.phase === "swapping" && old.phase !== "swapping")
        cues.add(CUES.swap);
      if (s.refusal !== old.refusal && s.refusal) cues.add(CUES.refuse);
      if (
        s.selection &&
        (s.selection.col !== old.selection?.col ||
          s.selection.row !== old.selection?.row)
      )
        cues.add(CUES.select);
    }
    s = advance(s, dt, cues);
    const title = s.screen === "title" || s.screen === "howto";
    api.audio.stop(title ? "play" : "title");
    api.audio.loop(title ? "title" : "play");
    for (const cue of cues) {
      api.audio.play(cue);
    }
    const p = api.input.pointer();
    return {
      ...s,
      simTime: state.simTime + dt,
      muted: api.audio.muted(),
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
    };
  },
  render,
};
