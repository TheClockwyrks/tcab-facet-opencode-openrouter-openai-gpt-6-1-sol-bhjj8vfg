import type { DeepReadonly } from "ts-essentials";
import type {
  BoardState,
  FacetState,
  GemState,
  PointerDevice,
  Screen,
} from "./game";
import * as C from "./constants";
import {
  cellX,
  cellY,
  deal,
  emptyBoard,
  index,
  initialState,
  lastFall,
  legalSwap,
  letterKind,
  LETTERS,
  requestSwap,
  stepHold,
} from "./model";
import { pointerEvent, targets } from "./input";

type ReadState = DeepReadonly<FacetState>;
type Pose = (s: ReadState) => FacetState;
type NumberPose = (s: ReadState, n: number) => FacetState;
type CellPose = (s: ReadState, col: number, row: number) => FacetState;
export interface FacetDebugApi {
  readonly version: number;
  reset: Pose;
  reconcile: Pose;
  snapshot: typeof snapshot;
  setScreen(s: ReadState, screen: Screen): FacetState;
  setMenuIndex: NumberPose;
  loadBoard(s: ReadState, rows: readonly string[]): FacetState;
  dealBoard: Pose;
  clearBoard: Pose;
  setGem(s: ReadState, col: number, row: number, token: string): FacetState;
  setRefillKinds(s: ReadState, col: number, kinds: string): FacetState;
  clearRefillKinds: Pose;
  setScore: NumberPose;
  setLevel: NumberPose;
  setLevelScore: NumberPose;
  setBestChain: NumberPose;
  setBestMove: NumberPose;
  setMoveScore: NumberPose;
  setSelection: CellPose;
  clearSelection: Pose;
  setOffer: CellPose;
  clearOffer: Pose;
  clearRefusal: Pose;
  clearChain: Pose;
  requestSwap(
    s: ReadState,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState;
  pointerDown(
    s: ReadState,
    x: number,
    y: number,
    device?: PointerDevice,
  ): FacetState;
  pointerMove(
    s: ReadState,
    x: number,
    y: number,
    device?: PointerDevice,
  ): FacetState;
  pointerUp(s: ReadState, device?: PointerDevice): FacetState;
}
function integer(n: number, min = 0, max = Infinity): number {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new RangeError(`Invalid integer: ${n}`);
  return n;
}
function points(n: number): number {
  if (!Number.isFinite(n)) throw new RangeError(`Invalid points: ${n}`);
  return n;
}
function cell(col: number, row: number) {
  return {
    col: integer(col, 0, C.GRID_COLS - 1),
    row: integer(row, 0, C.GRID_ROWS - 1),
  };
}
function token(t: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(t))
    throw new Error(`Invalid gem token: ${t}`);
  return {
    col,
    row,
    kind: letterKind(t[0]) ?? null,
    strain: Number(t[1]),
    cut:
      t[0] === "X"
        ? "prism"
        : t[2] === "b"
          ? "brilliant"
          : t[2] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
function load(rows: readonly string[]): BoardState {
  if (rows.length !== C.GRID_ROWS) throw new RangeError("Expected eight rows");
  return {
    cols: C.GRID_COLS,
    rows: C.GRID_ROWS,
    cells: rows.flatMap((line, row) => {
      const ts = line.trim().split(/\s+/);
      if (ts.length !== C.GRID_COLS)
        throw new RangeError("Expected eight tokens");
      return ts.map((t, col) => token(t, col, row));
    }),
  };
}
export function snapshot(s: ReadState) {
  return {
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      cols: s.board.cols,
      rows: s.board.rows,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection ? { ...s.selection } : null,
    offer: s.offer ? { ...s.offer } : null,
    refusal: s.refusal
      ? { a: { ...s.refusal.a }, b: { ...s.refusal.b } }
      : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
function pointer(
  s: ReadState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new Error("Invalid pointer");
  return pointerEvent(s, type, x, y, device);
}
export const debugApi: FacetDebugApi = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s) => ({ ...initialState(), muted: s.muted, assets: s.assets }),
  reconcile: (s) => ({ ...s }),
  snapshot,
  setScreen: (s, screen) => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s, n) => ({ ...s, menuIndex: integer(n) }),
  loadBoard: (s, rows) => ({ ...s, board: load(rows) }),
  dealBoard: (s) => ({ ...s, board: deal() }),
  clearBoard: (s) => ({ ...s, board: emptyBoard() }),
  setGem: (s, col, row, t) => {
    const p = cell(col, row);
    if (!s.board.cells[index(p)]) throw new Error("No board in play");
    const g = token(t, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((old, i) => (i === index(p) ? g : old)),
      },
    };
  },
  setRefillKinds: (s, col, kinds) => {
    integer(col, 0, C.GRID_COLS - 1);
    if (![...kinds].every((k) => LETTERS.includes(k)))
      throw new Error("Invalid refill kind");
    return {
      ...s,
      refillKinds: s.refillKinds.map((k, i) => (i === col ? kinds : k)),
    };
  },
  clearRefillKinds: (s) => ({
    ...s,
    refillKinds: Array.from({ length: C.GRID_COLS }, () => ""),
  }),
  setScore: (s, n) => ({ ...s, score: points(n) }),
  setLevel: (s, n) => ({ ...s, level: integer(n, 1) }),
  setLevelScore: (s, n) => ({ ...s, levelScore: points(n) }),
  setBestChain: (s, n) => ({ ...s, bestChain: integer(n) }),
  setBestMove: (s, n) => ({ ...s, bestMove: points(n) }),
  setMoveScore: (s, n) => ({ ...s, moveScore: points(n) }),
  setSelection: (s, col, row) => ({ ...s, selection: cell(col, row) }),
  clearSelection: (s) => ({ ...s, selection: null }),
  setOffer: (s, col, row) => ({ ...s, offer: cell(col, row) }),
  clearOffer: (s) => ({ ...s, offer: null }),
  clearRefusal: (s) => ({ ...s, refusal: null }),
  clearChain: (s) => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    motion: undefined,
  }),
  requestSwap: (s, ca, ra, cb, rb) => {
    const a = cell(ca, ra),
      b = cell(cb, rb);
    if (!s.board.cells[index(a)] || !s.board.cells[index(b)])
      throw new Error("No board in play");
    return requestSwap(s, a, b);
  },
  pointerDown: (s, x, y, d) => pointer(s, "down", x, y, d),
  pointerMove: (s, x, y, d) => pointer(s, "move", x, y, d),
  pointerUp: (s, d) => pointer(s, "up", s.pointer.x, s.pointer.y, d),
};
