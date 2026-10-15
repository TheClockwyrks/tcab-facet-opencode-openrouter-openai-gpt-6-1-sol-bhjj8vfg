import type {
  BoardState,
  CellRef,
  FacetState,
  GemKind,
  GemState,
} from "./game";
import * as C from "./constants";

export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const index = (p: CellRef) => p.row * C.GRID_COLS + p.col;
export const same = (a: CellRef | null, b: CellRef | null) =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const emptyBoard = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
export const randomKind = () =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export const lastFall = (s: FacetState) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: FacetState) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;

export function initialState(): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted: false,
    refillKinds: Array(C.GRID_COLS).fill("") as string[],
  };
}

/** Maximal runs, ordered left-to-right then top-to-bottom. Prisms never match. */
export function runs(board: BoardState): number[][] {
  const result: number[][] = [];
  for (const vertical of [false, true]) {
    for (let line = 0; line < (vertical ? board.cols : board.rows); line++) {
      let start = 0;
      const length = vertical ? board.rows : board.cols;
      const at = (n: number) =>
        vertical ? n * board.cols + line : line * board.cols + n;
      while (start < length) {
        const kind = board.cells[at(start)].kind;
        let end = start + 1;
        while (
          kind !== null &&
          end < length &&
          board.cells[at(end)].kind === kind
        )
          end++;
        if (kind !== null && end - start >= C.MATCH_MIN)
          result.push(
            Array.from({ length: end - start }, (_, j) => at(start + j)),
          );
        start = end;
      }
    }
  }
  return result;
}

function exchange(board: BoardState, a: CellRef, b: CellRef): BoardState {
  const ai = index(a),
    bi = index(b);
  return {
    ...board,
    cells: board.cells.map((g, i) =>
      i === ai
        ? { ...board.cells[bi], ...a, fell: 0 }
        : i === bi
          ? { ...board.cells[ai], ...b, fell: 0 }
          : g,
    ),
  };
}
export function productive(board: BoardState, a: CellRef, b: CellRef): boolean {
  return (
    adjacent(a, b) &&
    !!board.cells[index(a)] &&
    !!board.cells[index(b)] &&
    (board.cells[index(a)].cut === "prism" ||
      board.cells[index(b)].cut === "prism" ||
      runs(exchange(board, a, b)).length > 0)
  );
}
export function legalSwap(board: BoardState): boolean {
  return board.cells.some((g) =>
    [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ].some(
      (b) =>
        b.col < board.cols && b.row < board.rows && productive(board, g, b),
    ),
  );
}
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (col >= 2 &&
            cells[cells.length - 1].kind === kind &&
            cells[cells.length - 2].kind === kind) ||
          (row >= 2 &&
            cells[(row - 1) * C.GRID_COLS + col].kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col].kind === kind)
        );
        cells.push({ col, row, kind, cut: "plain", strain: 0, fell: row + 1 });
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
export function requestSwap(s: FacetState, a: CellRef, b: CellRef): FacetState {
  if (s.phase !== "idle" || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  const ga = s.board.cells[index(a)],
    gb = s.board.cells[index(b)];
  const prismKind =
    ga.cut === "prism" && gb.cut === "prism"
      ? "all"
      : ga.cut === "prism"
        ? gb.kind!
        : gb.cut === "prism"
          ? ga.kind!
          : undefined;
  return {
    ...s,
    board: exchange(s.board, a, b),
    phase: "swapping",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    moveScore: 0,
    motion: { swap: [a, b], prismKind },
    refusal: null,
  };
}

const neighbors = (g: CellRef) =>
  [
    { col: g.col - 1, row: g.row },
    { col: g.col + 1, row: g.row },
    { col: g.col, row: g.row - 1 },
    { col: g.col, row: g.row + 1 },
  ].filter(
    (p) =>
      p.col >= 0 && p.col < C.GRID_COLS && p.row >= 0 && p.row < C.GRID_ROWS,
  );

export function resolve(s: FacetState, cues = new Set<string>()): FacetState {
  const cells = s.board.cells;
  const prism = s.chainStep === 1 ? s.motion?.prismKind : undefined;
  const lines = prism ? [] : runs(s.board);
  const seeds = prism
    ? cells.flatMap((g, i) =>
        prism === "all" ||
        g.kind === prism ||
        (g.cut === "prism" && s.motion?.swap?.some((p) => same(g, p)))
          ? [i]
          : [],
      )
    : lines.flat();
  const waves = new Map<number, number>();
  const queue: number[] = [];
  for (const i of seeds)
    if (!waves.has(i)) {
      waves.set(i, 0);
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = cells[i],
      wave = waves.get(i)!;
    const additions = neighbors(g)
      .filter((p) => cells[index(p)].strain === C.MAX_STRAIN)
      .map(index);
    if (g.cut === "brilliant")
      for (const other of cells) {
        if (
          Math.abs(other.col - g.col) <= 1 &&
          Math.abs(other.row - g.row) <= 1
        )
          additions.push(index(other));
      }
    if (g.cut === "star")
      for (const other of cells) {
        if (other.col === g.col || other.row === g.row)
          additions.push(index(other));
      }
    for (const j of additions)
      if (!waves.has(j)) {
        waves.set(j, wave + 1);
        queue.push(j);
      }
  }
  if (!waves.size) return s;
  cues.add(C.CUES.clear);
  // A long frame can resolve and settle more than one step. Retain the last
  // rung here, before chainStep returns to its resting value at that boundary.
  for (const cue of cues) if (cue.startsWith("rung-")) cues.delete(cue);
  cues.add(`rung-${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`);
  const created = new Map<number, GemState>();
  const priority = { plain: 0, brilliant: 1, star: 2, prism: 3 };
  const put = (i: number, cut: GemState["cut"]) => {
    if (priority[created.get(i)?.cut ?? "plain"] < priority[cut])
      created.set(i, {
        ...cells[i],
        kind: cut === "prism" ? null : cells[i].kind,
        strain: 0,
        cut,
        fell: 0,
      });
  };
  for (const line of lines) {
    for (const other of lines)
      if (other !== line && other[1] - other[0] !== line[1] - line[0])
        for (const i of line) if (other.includes(i)) put(i, "star");
    if (line.length >= 4) {
      const swapped = line.filter((i) =>
        s.motion?.swap?.some((p) => index(p) === i),
      );
      put(
        swapped[0] ?? line[Math.floor((line.length - 1) / 2)],
        line.length >= 5 ? "prism" : "brilliant",
      );
    }
  }
  if (created.size) cues.add(C.CUES.cut);
  let points = 0;
  const strained = cells.map((g, i) => {
    if (waves.has(i)) {
      points +=
        (g.strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) *
        Math.min(s.chainStep, C.MAX_MULTIPLIER);
      return null;
    }
    if (neighbors(g).some((p) => waves.has(index(p)))) {
      const strain = Math.min(C.MAX_STRAIN, g.strain + 1);
      if (strain === C.MAX_STRAIN && g.strain < C.MAX_STRAIN)
        cues.add(C.CUES.flaw);
      return { ...g, strain };
    }
    return g;
  });
  for (const [i, g] of created) strained[i] = g;
  const next: GemState[] = Array(cells.length);
  for (let col = 0; col < C.GRID_COLS; col++) {
    const survivors = strained.filter(
      (g): g is GemState => g !== null && g.col === col,
    );
    const missing = C.GRID_ROWS - survivors.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      const old = survivors[row - missing];
      next[row * C.GRID_COLS + col] = old
        ? { ...old, row, fell: row - old.row }
        : {
            col,
            row,
            kind: letterKind(s.refillKinds[col]?.[row]) ?? randomKind(),
            strain: 0,
            cut: "plain",
            fell: missing,
          };
    }
  }
  return {
    ...s,
    board: { ...s.board, cells: next },
    lastCleared: waves.size,
    lastPoints: points,
    lastWaves: Math.max(...waves.values()),
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    bestChain: Math.max(s.bestChain, s.chainStep),
    motion: {
      ...s.motion,
      before: s.board,
      cleared: [...waves].map(([i, wave]) => ({ gem: cells[i], wave })),
      created: [...created.values()],
    },
  };
}
export const LETTERS = "RACJBSM";
export const letterKind = (letter: string | undefined): GemKind | undefined =>
  letter === undefined ? undefined : C.GEM_KINDS[LETTERS.indexOf(letter)];

/** Consume all elapsed time, including boundaries crossed inside a long frame. */
export function advance(
  state: FacetState,
  dt: number,
  cues = new Set<string>(),
): FacetState {
  if (state.screen !== "playing") return state;
  let s: FacetState = {
    ...state,
    refusal:
      state.refusal && state.refusal.timer + dt < C.REFUSAL_SECONDS
        ? { ...state.refusal, timer: state.refusal.timer + dt }
        : null,
  };
  if (s.motion?.opening !== undefined)
    s = { ...s, motion: { ...s.motion, opening: s.motion.opening + dt } };
  let left = dt;
  while (left > 1e-10 && s.phase !== "idle") {
    if (s.phase === "swapping") {
      const used = Math.min(left, C.SWAP_SECONDS - s.swapTimer);
      left -= used;
      s = { ...s, swapTimer: s.swapTimer + used };
      if (s.swapTimer + 1e-10 >= C.SWAP_SECONDS)
        s = resolve(
          {
            ...s,
            phase: "resolving",
            swapTimer: 0,
            chainStep: 1,
            stepTimer: 0,
          },
          cues,
        );
    } else {
      const land =
        s.lastWaves * C.WAVE_SECONDS + lastFall(s) * C.FALL_SECONDS_PER_ROW;
      const used = Math.min(left, stepHold(s) - s.stepTimer);
      if (
        s.stepTimer < land &&
        s.stepTimer + used + 1e-10 >= land &&
        lastFall(s) > C.LAND_MIN_ROWS
      )
        cues.add(C.CUES.land);
      left -= used;
      s = { ...s, stepTimer: s.stepTimer + used };
      if (s.stepTimer + 1e-10 >= stepHold(s)) {
        if (runs(s.board).length)
          s = resolve({ ...s, chainStep: s.chainStep + 1, stepTimer: 0 }, cues);
        else {
          s = {
            ...s,
            phase: "idle",
            chainStep: 0,
            stepTimer: 0,
            bestMove: Math.max(s.bestMove, s.moveScore),
            motion: undefined,
          };
          if (s.levelScore >= C.LEVEL_TARGET_STEP * s.level) {
            s = { ...s, screen: "levelclear", menuIndex: 0, armedTarget: null };
            cues.add(C.CUES.levelUp);
          } else if (!legalSwap(s.board)) {
            s = { ...s, screen: "gameover", menuIndex: 0, armedTarget: null };
            cues.add(C.CUES.gameOver);
          }
        }
      }
    }
  }
  return s;
}
