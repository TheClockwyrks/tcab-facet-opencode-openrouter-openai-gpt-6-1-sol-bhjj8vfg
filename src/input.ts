import type { CellRef, FacetState, PointerDevice, Screen } from "./game";
import * as C from "./constants";
import {
  adjacent,
  cellX,
  cellY,
  deal,
  emptyBoard,
  initialState,
  requestSwap,
  same,
} from "./model";

export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return C.TITLE_ITEMS;
    case "paused":
      return C.PAUSED_ITEMS;
    case "levelclear":
      return C.LEVELCLEAR_ITEMS;
    case "gameover":
      return C.GAMEOVER_ITEMS;
    default:
      return [];
  }
}
export function targets(s: FacetState): Target[] {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1052, y: 36, w: 160, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 1040, y: 616, w: 172, h: C.TARGET_MIN_H }];
  return menuItems(s.screen).map((_, i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 134 : 470,
    y: (s.screen === "title" ? 418 : 404) + i * 88,
    w: 340,
    h: C.TARGET_MIN_H,
  }));
}
export const show = (
  s: FacetState,
  screen: Screen,
  menuIndex = 0,
): FacetState => ({ ...s, screen, menuIndex, armedTarget: null });
function fresh(s: FacetState): FacetState {
  return {
    ...initialState(),
    screen: "playing",
    board: deal(),
    assets: s.assets,
    muted: s.muted,
    simTime: s.simTime,
    pointer: s.pointer,
    motion: { opening: 0 },
  };
}
function quit(s: FacetState): FacetState {
  return {
    ...show(s, "title"),
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    stepTimer: 0,
    swapTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    motion: undefined,
  };
}
export function action(s: FacetState, name: C.ActionName): FacetState {
  const items = menuItems(s.screen);
  if ((name === "up" || name === "down") && items.length)
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (name === "down" ? 1 : -1) + items.length) %
        items.length,
    };
  if (name === "pause") {
    if (s.screen === "playing") return show(s, "paused");
    if (s.screen === "paused") return show(s, "playing");
  }
  if (name === "back") {
    if (s.screen === "howto") return show(s, "title", 1);
    if (s.screen === "gameover") return show(s, "title");
  }
  if (name !== "confirm") return s;
  if (s.screen === "title")
    return s.menuIndex === 0 ? fresh(s) : show(s, "howto");
  if (s.screen === "paused")
    return s.menuIndex === 0 ? show(s, "playing") : quit(s);
  if (s.screen === "gameover") return s.menuIndex === 0 ? fresh(s) : quit(s);
  if (s.screen === "levelclear")
    return s.menuIndex === 0
      ? {
          ...show(s, "playing"),
          level: s.level + 1,
          levelScore: 0,
          bestChain: 0,
          bestMove: 0,
          board: deal(),
          selection: null,
          offer: null,
          refusal: null,
          motion: { opening: 0 },
        }
      : quit(s);
  return s;
}
export function hitCell(x: number, y: number): CellRef | null {
  let cell: CellRef | null = null,
    best = C.GEM_HIT_R * C.GEM_HIT_R;
  for (let row = 0; row < C.GRID_ROWS; row++)
    for (let col = 0; col < C.GRID_COLS; col++) {
      const distance = (x - cellX(col)) ** 2 + (y - cellY(row)) ** 2;
      if (distance <= best && (!cell || distance < best)) {
        best = distance;
        cell = { col, row };
      }
    }
  return cell;
}
export function pointerEvent(
  state: FacetState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice,
): FacetState {
  let s: FacetState = {
    ...state,
    pointer: {
      x,
      y,
      device,
      down: type === "down" || (type === "move" && state.pointer.down),
    },
  };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-") && (!s.pointer.down || type === "down"))
    s = { ...s, menuIndex: Number(target.id.slice(5)) };
  if (type === "up") {
    const armed = s.armedTarget;
    s = { ...s, armedTarget: null };
    if (armed) {
      if (target?.id !== armed) return s;
      return action(
        s,
        armed === "pause" ? "pause" : armed === "back" ? "back" : "confirm",
      );
    }
    if (s.screen === "playing" && s.selection && s.offer)
      return {
        ...requestSwap(s, s.selection, s.offer),
        selection: null,
        offer: null,
      };
    return s;
  }
  if (type === "down") {
    s = { ...s, armedTarget: target?.id ?? null };
    if (target || s.screen !== "playing") return s;
    const cell = hitCell(x, y);
    if (!cell) return { ...s, selection: null, offer: null };
    if (
      !s.selection ||
      (!same(s.selection, cell) && !adjacent(s.selection, cell))
    )
      return { ...s, selection: cell, offer: null };
    return { ...s, offer: same(s.selection, cell) ? null : cell };
  }
  if (
    s.screen === "playing" &&
    s.pointer.down &&
    !s.armedTarget &&
    s.selection
  ) {
    const cell = hitCell(x, y);
    if (same(cell, s.selection)) return { ...s, offer: null };
    if (cell && adjacent(cell, s.selection)) return { ...s, offer: cell };
  }
  return s;
}
