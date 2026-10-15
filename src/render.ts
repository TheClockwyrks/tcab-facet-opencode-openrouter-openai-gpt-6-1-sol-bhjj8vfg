import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleSimulator } from "@clockwyrks/particle-runtime";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { DeepReadonly } from "ts-essentials";
import type { FacetState, GemState } from "./game";
import * as C from "./constants";
import { cellX, cellY, same } from "./model";
import { menuItems, targets } from "./input";

const INK = "#e6ece5",
  MUTED = "#8babae",
  GOLD = "#d4c295",
  TEAL = "#91dfd0";
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  font = "monospace",
  align: CanvasTextAlign = "left",
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}
function rule(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  color = "#2a4048",
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function diamond(ctx: Context, x: number, y: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.stroke();
}
function field(ctx: Context) {
  const g = ctx.createRadialGradient(
    C.STAGE_CX,
    C.STAGE_CY,
    40,
    C.STAGE_CX,
    C.STAGE_CY,
    740,
  );
  g.addColorStop(0, "#18323a");
  g.addColorStop(0.65, "#0e1b25");
  g.addColorStop(1, "#0b131b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.lineWidth = 1;
  for (let x = -720; x < C.STAGE_W; x += 96) {
    ctx.strokeStyle = "#6c9a9810";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 720, C.STAGE_H);
    ctx.stroke();
  }
  rule(ctx, 42, 29, 1196);
  rule(ctx, 42, 690, 1196);
  for (const x of [42, 1238]) {
    diamond(ctx, x, 29, 4, GOLD);
    diamond(ctx, x, 690, 4, GOLD);
  }
}
function effect(
  ctx: Context,
  s: DeepReadonly<FacetState>,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  const system = s.assets?.systems[name];
  if (!system || age < 0 || (name !== "aura" && age > 0.8)) return;
  // Reconstruct a pure, time-indexed simulation: render never owns persistent state.
  const sim = new ParticleSimulator(system as ParticleSystem, {
    seed,
    maxParticles: 80,
  });
  let remaining = age;
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 30);
    sim.step(dt * 1000);
    remaining -= dt;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((v) => Math.round(v * 255)).join(",")})`;
    const r = Math.max(0.3, p.size);
    ctx.beginPath();
    ctx.arc(x + p.position[0], y - p.position[1], r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function sprite(
  ctx: Context,
  s: DeepReadonly<FacetState>,
  g: GemState,
  x: number,
  y: number,
  scale = 1,
  animated = true,
) {
  const images = s.assets?.images;
  if (!images) return;
  const prism = g.cut === "prism";
  const path =
    prism && animated
      ? `gems/prism-turn/${g.strain ? `${g.strain}/` : ""}${Math.floor(s.simTime * 9) % 12}.png`
      : `gems/${prism ? "prism" : g.kind}-${g.strain}.png`;
  const img = images[path];
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x - 32 * scale, y - 32 * scale, 64 * scale, 64 * scale);
  if (g.cut === "star" || g.cut === "brilliant")
    ctx.drawImage(
      images[`gems/${g.cut}.png`],
      x - 32 * scale,
      y - 32 * scale,
      64 * scale,
      64 * scale,
    );
  if (g.cut !== "plain" && animated)
    effect(
      ctx,
      s,
      "aura",
      x,
      y,
      (s.simTime * 0.6 + g.col * 0.12 + g.row * 0.2) % 1.2,
      g.col + g.row * 8 + 131,
    );
}
const specimen = (
  kind: GemState["kind"],
  strain = 0,
  cut: GemState["cut"] = "plain",
): GemState => ({ col: 0, row: 0, kind, strain, cut, fell: 0 });

function button(
  ctx: Context,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  selected: boolean,
  armed: boolean,
) {
  ctx.fillStyle = selected ? "#24473f" : "#101e27";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = selected ? TEAL : "#355059";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (selected) {
    ctx.fillStyle = TEAL;
    ctx.fillRect(x, y, 3, h);
  }
  if (armed) {
    ctx.fillStyle = "#a6e1cd18";
    ctx.fillRect(x, y, w, h);
  }
  text(ctx, label, x + 24, y + h / 2 + 6, 17, selected ? "#d9ffed" : MUTED);
  text(
    ctx,
    selected ? "↗" : "·",
    x + w - 28,
    y + h / 2 + 7,
    24,
    selected ? TEAL : MUTED,
    "serif",
    "center",
  );
}
function menu(ctx: Context, s: DeepReadonly<FacetState>) {
  const items = menuItems(s.screen);
  for (const t of targets(s)) {
    const i = Number(t.id.slice(5));
    const label =
      t.id === "pause"
        ? C.PAUSE_LABEL
        : t.id === "back"
          ? C.BACK_LABEL
          : items[i];
    button(
      ctx,
      label,
      t.x,
      t.y,
      t.w,
      t.h,
      t.id.startsWith("menu-") && s.menuIndex === i,
      s.armedTarget === t.id,
    );
  }
}
function title(ctx: Context, s: DeepReadonly<FacetState>) {
  text(ctx, "A STUDY IN CHAIN REACTIONS", 136, 118, 13, GOLD);
  text(ctx, C.TITLE_TEXT, 125, 282, 132, INK, "Georgia, serif");
  text(ctx, C.TAGLINE_TEXT, 136, 326, 17, TEAL);
  rule(ctx, 136, 358, 338);
  text(
    ctx,
    "Seven stones. One beautiful fault.",
    136,
    391,
    16,
    MUTED,
    "Georgia, serif",
  );
  const x = 882,
    y = 330;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 12);
  for (const r of [125, 169, 212]) {
    ctx.strokeStyle = r === 169 ? "#b9b18a55" : "#496d6b55";
    ctx.strokeRect(-r, -r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.strokeStyle = "#35585d";
  ctx.beginPath();
  ctx.arc(x, y, 234, 0, Math.PI * 2);
  ctx.stroke();
  const points = [
    [-160, -130],
    [153, -119],
    [172, 117],
    [-152, 136],
  ];
  points.forEach(([dx, dy], i) =>
    sprite(ctx, s, specimen(C.GEM_KINDS[i * 2]), x + dx, y + dy, 1.25, false),
  );
  sprite(
    ctx,
    s,
    specimen(null, 0, "prism"),
    x,
    y + Math.sin(s.simTime) * 5,
    3.6,
  );
  text(ctx, "THE LAPIDARY COLLECTION", x, 607, 12, GOLD, "monospace", "center");
  menu(ctx, s);
  text(ctx, "DRAG TO DISCOVER", 136, 631, 11, MUTED);
}
function board(ctx: Context, s: DeepReadonly<FacetState>) {
  const images = s.assets?.images;
  if (!images || !s.board.cells.length) return;
  ctx.save();
  ctx.shadowColor = "#000a";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "#0a141d";
  ctx.fillRect(336, 92, 608, 608);
  ctx.restore();
  ctx.drawImage(images["gems/frame.png"], 336, 92);
  for (const g of s.board.cells) {
    const x = cellX(g.col),
      y = cellY(g.row);
    ctx.fillStyle = (g.col + g.row) % 2 === 0 ? "#132631" : "#10222c";
    ctx.fillRect(
      x - C.CELL_PITCH / 2 + 1,
      y - C.CELL_PITCH / 2 + 1,
      C.CELL_PITCH - 2,
      C.CELL_PITCH - 2,
    );
    ctx.fillStyle = "#51707a33";
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(352, 108, 576, 576);
  ctx.clip();
  const motion = s.motion;
  const shatter = s.lastWaves * C.WAVE_SECONDS;
  const falling = s.phase === "resolving";
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    if (falling) {
      if (s.stepTimer < shatter) continue;
      const age = s.stepTimer - shatter;
      const duration = g.fell * C.FALL_SECONDS_PER_ROW;
      if (duration > 0 && age < duration)
        y -= (1 - (age / duration) ** 2) * g.fell * C.CELL_PITCH;
    } else if (motion?.opening !== undefined) {
      const duration = g.fell * C.FALL_SECONDS_PER_ROW;
      if (motion.opening < duration)
        y -= (1 - (motion.opening / duration) ** 2) * g.fell * C.CELL_PITCH;
    }
    if (s.phase === "swapping" && motion?.swap) {
      const [a, b] = motion.swap;
      const from = same(g, a) ? b : same(g, b) ? a : null;
      if (from) {
        const t = s.swapTimer / C.SWAP_SECONDS;
        const ease = t * t * (3 - 2 * t);
        x = cellX(from.col) + (x - cellX(from.col)) * ease;
        y = cellY(from.row) + (y - cellY(from.row)) * ease;
      }
    }
    if (s.selection && s.offer) {
      if (same(g, s.selection)) {
        x = cellX(s.offer.col);
        y = cellY(s.offer.row);
      } else if (same(g, s.offer)) {
        x = cellX(s.selection.col);
        y = cellY(s.selection.row);
      }
    }
    sprite(ctx, s, g, x, y);
  }
  if (falling && motion?.before) {
    for (const g of motion.before.cells) {
      const clear = motion.cleared?.find((c) => same(c.gem, g));
      const age = s.stepTimer - (clear?.wave ?? 0) * C.WAVE_SECONDS;
      if (clear) {
        if (age < 0) sprite(ctx, s, g, cellX(g.col), cellY(g.row));
        else if (age < 0.3 && g.kind) {
          const f = Math.min(5, Math.floor(age / 0.05));
          ctx.drawImage(
            images[`gems/break/${g.kind}/${f}.png`],
            cellX(g.col) - 32,
            cellY(g.row) - 32,
          );
        }
      } else if (s.stepTimer < shatter)
        sprite(ctx, s, g, cellX(g.col), cellY(g.row));
    }
  }
  ctx.restore();
  if (falling) {
    for (const c of motion?.cleared ?? [])
      effect(
        ctx,
        s,
        c.gem.strain === C.MAX_STRAIN ? "flawed" : "clear",
        cellX(c.gem.col),
        cellY(c.gem.row),
        s.stepTimer - c.wave * C.WAVE_SECONDS,
        Math.floor(s.simTime - s.stepTimer) * 97 + c.gem.row * 8 + c.gem.col,
      );
    for (const p of motion?.created ?? [])
      effect(
        ctx,
        s,
        "cut",
        cellX(p.col),
        cellY(p.row),
        s.stepTimer - shatter,
        27 + p.row * 8 + p.col,
      );
  }
  for (const p of [s.selection, s.offer])
    if (p) {
      ctx.strokeStyle = TEAL;
      ctx.lineWidth = 2;
      ctx.strokeRect(cellX(p.col) - 33, cellY(p.row) - 33, 66, 66);
      diamond(ctx, cellX(p.col), cellY(p.row) - 36, 3, TEAL);
    }
  if (s.refusal)
    for (const p of [s.refusal.a, s.refusal.b]) {
      ctx.strokeStyle = "#ee998b";
      ctx.lineWidth = 2;
      ctx.strokeRect(cellX(p.col) - 33, cellY(p.row) - 33, 66, 66);
    }
}
function hud(ctx: Context, s: DeepReadonly<FacetState>) {
  text(ctx, C.TITLE_TEXT, 52, 82, 35, INK, "Georgia, serif");
  text(ctx, "THE LAPIDARY COLLECTION", 54, 107, 9, GOLD);
  text(ctx, C.HUD_SCORE_LABEL, 54, 181, 12, MUTED);
  text(
    ctx,
    s.score.toLocaleString("en-US"),
    50,
    227,
    45,
    INK,
    "Georgia, serif",
  );
  rule(ctx, 54, 250, 231);
  text(ctx, C.HUD_LEVEL_LABEL, 54, 290, 12, MUTED);
  text(
    ctx,
    String(s.level).padStart(2, "0"),
    52,
    339,
    48,
    TEAL,
    "Georgia, serif",
  );
  text(ctx, "PRESSURE FINDS", 54, 417, 13, GOLD);
  text(ctx, "THE FLAW", 54, 438, 13, GOLD);
  text(ctx, "Match beside cracked stones.", 54, 471, 13, MUTED);
  text(ctx, "A flaw is an opportunity.", 54, 492, 13, MUTED);
  rule(ctx, 54, 527, 231);
  for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
    sprite(ctx, s, specimen("jade", strain), 78 + strain * 58, 570, 0.8, false);
  text(ctx, "CLEAN", 54, 618, 10, MUTED);
  text(ctx, "FLAWED · 2×", 203, 618, 10, GOLD);
  text(
    ctx,
    "HOLD  →  OFFER  →  RELEASE",
    C.STAGE_CX,
    73,
    12,
    MUTED,
    "monospace",
    "center",
  );
  const x = 994;
  text(ctx, "LEVEL PROGRESS", x, 175, 12, MUTED);
  text(
    ctx,
    `${s.levelScore.toLocaleString("en-US")} / ${(s.level * C.LEVEL_TARGET_STEP).toLocaleString("en-US")}`,
    x,
    204,
    15,
    INK,
  );
  ctx.fillStyle = "#263e46";
  ctx.fillRect(x, 223, 231, 5);
  ctx.fillStyle = TEAL;
  ctx.fillRect(
    x,
    223,
    231 * Math.min(1, s.levelScore / (s.level * C.LEVEL_TARGET_STEP)),
    5,
  );
  if (s.phase === "resolving") {
    text(ctx, C.HUD_CHAIN_LABEL, x, 286, 12, GOLD);
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      x - 3,
      348,
      64,
      TEAL,
      "Georgia, serif",
    );
    text(ctx, `+${s.lastPoints}  /  ${s.lastCleared} stones`, x, 377, 13, INK);
  } else {
    text(ctx, "MAKE A LITTLE", x, 290, 13, GOLD);
    text(ctx, "CHAIN REACTION.", x, 311, 13, GOLD);
    text(ctx, "Drag a stone onto a neighbor.", x, 345, 12, MUTED);
    text(ctx, "Line up three of one kind.", x, 366, 12, MUTED);
  }
  rule(ctx, x, 413, 231);
  text(ctx, "EXTRAORDINARY CUTS", x, 445, 11, MUTED);
  const cuts = ["brilliant", "star", "prism"] as const;
  const labels = ["4 IN A LINE", "CROSSING LINES", "5 IN A LINE"];
  cuts.forEach((cut, i) => {
    const y = 485 + i * 69;
    sprite(
      ctx,
      s,
      specimen(cut === "prism" ? null : "beryl", 0, cut),
      x + 22,
      y,
      0.7,
    );
    text(ctx, cut.toUpperCase(), x + 58, y - 2, 12, INK);
    text(ctx, labels[i], x + 58, y + 16, 9, MUTED);
  });
  menu(ctx, s);
}
function howto(ctx: Context, s: DeepReadonly<FacetState>) {
  text(ctx, "THE ART OF THE CHAIN", 64, 84, 12, GOLD);
  text(ctx, "How to play", 61, 143, 52, INK, "Georgia, serif");
  const columns = [
    {
      x: 64,
      title: "01  MAKE A MATCH",
      lines: [
        "Seven kinds of stone. Take hold of one",
        "with a mouse, pen, or finger. Carry it",
        "onto a neighbor, then release to swap.",
        "Carry it back to cancel the offer.",
        "",
        "Three or more of one kind in a line",
        "shatter. A move that clears nothing",
        "is refused; the board stays as it was.",
      ],
    },
    {
      x: 477,
      title: "02  BUILD THE PRESSURE",
      lines: [
        "Every stone beside a clear takes strain.",
        "After three hits, it becomes flawed.",
        "A flawed stone shatters with any clear",
        "it touches — and scores double.",
        "",
        "Fresh stones fall into every gap.",
        "If they match, the chain goes on.",
        "Each step pays more, up to eightfold.",
      ],
    },
    {
      x: 890,
      title: "03  EARN THE CUT",
      lines: [
        "Four in a line leaves a brilliant:",
        "it takes the eight stones around it.",
        "Crossed lines leave a star:",
        "it takes its whole row and column.",
        "Five or more leave a prism:",
        "swap it to clear every stone of a kind.",
        "",
        "Fill the target to finish a level.",
        "No productive swap? The round is over.",
      ],
    },
  ];
  columns.forEach(({ x, title, lines }) => {
    rule(ctx, x, 183, 326);
    text(ctx, title, x, 219, 13, TEAL);
    lines.forEach((line, i) => text(ctx, line, x, 264 + i * 27, 13, INK));
  });
  for (let i = 0; i < C.GEM_KIND_COUNT; i++)
    sprite(ctx, s, specimen(C.GEM_KINDS[i]), 91 + i * 45, 559, 0.58, false);
  [0, 1, 2, 3].forEach((n) =>
    sprite(ctx, s, specimen("jade", n), 510 + n * 77, 559, 0.75, false),
  );
  ["brilliant", "star", "prism"].forEach((cut, i) =>
    sprite(
      ctx,
      s,
      specimen(cut === "prism" ? null : "beryl", 0, cut as GemState["cut"]),
      939 + i * 90,
      559,
      0.8,
    ),
  );
  text(
    ctx,
    "↑ ↓  MENUS     ENTER / SPACE  CHOOSE     ESC / P  PAUSE     M  MUTE     ESC  BACK",
    64,
    645,
    12,
    MUTED,
  );
  menu(ctx, s);
}
function overlay(ctx: Context, s: DeepReadonly<FacetState>) {
  ctx.fillStyle = "#071019dc";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#10232bec";
  ctx.fillRect(422, 134, 436, 463);
  ctx.strokeStyle = "#6b887866";
  ctx.strokeRect(422.5, 134.5, 435, 462);
  diamond(ctx, C.STAGE_CX, 173, 10, GOLD);
  const heading =
    s.screen === "paused"
      ? C.PAUSED_TITLE_TEXT
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_TITLE_TEXT
        : C.GAMEOVER_TITLE_TEXT;
  text(
    ctx,
    heading,
    C.STAGE_CX,
    246,
    s.screen === "gameover" ? 34 : 40,
    INK,
    "Georgia, serif",
    "center",
  );
  if (s.screen === "paused") {
    text(
      ctx,
      "A MOMENT OF STILLNESS",
      C.STAGE_CX,
      292,
      12,
      GOLD,
      "monospace",
      "center",
    );
    text(
      ctx,
      "Your next chain can wait.",
      C.STAGE_CX,
      338,
      17,
      MUTED,
      "Georgia, serif",
      "center",
    );
  } else if (s.screen === "levelclear") {
    text(
      ctx,
      `${C.HUD_LEVEL_LABEL} ${s.level}  ·  ${s.levelScore.toLocaleString("en-US")} POINTS`,
      C.STAGE_CX,
      284,
      13,
      GOLD,
      "monospace",
      "center",
    );
    text(ctx, `${C.BEST_CHAIN_LABEL}    ${s.bestChain}`, 470, 328, 13, MUTED);
    text(ctx, `${C.BEST_MOVE_LABEL}        ${s.bestMove}`, 470, 357, 13, MUTED);
  } else {
    text(
      ctx,
      `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString("en-US")}`,
      C.STAGE_CX,
      307,
      23,
      TEAL,
      "monospace",
      "center",
    );
    text(
      ctx,
      `${C.HUD_LEVEL_LABEL} ${s.level}  ·  EVERY STONE WELL SPENT`,
      C.STAGE_CX,
      353,
      11,
      GOLD,
      "monospace",
      "center",
    );
  }
  menu(ctx, s);
}
export function render(s: DeepReadonly<FacetState>, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  field(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else {
    board(ctx, s);
    if (s.screen === "playing") hud(ctx, s);
    else overlay(ctx, s);
  }
  text(ctx, "FACET  /  A GEM-MATCHING STUDY", 54, 709, 9, "#789394");
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    1225,
    709,
    9,
    MUTED,
    "monospace",
    "right",
  );
  ctx.restore();
}
