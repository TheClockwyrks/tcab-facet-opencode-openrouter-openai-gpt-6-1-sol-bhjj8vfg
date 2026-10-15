/* global document, window */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Developer capture harness. The published game exposes no browser globals.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/src/main.ts", (route) =>
  route.fulfill({ contentType: "text/javascript", body: "" }),
);
await page.goto("http://localhost:5173");
await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const engine = createEngine({
    canvas: document.getElementById("stage"),
    game,
    width: 1280,
    height: 720,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  window.captureEngine = engine;
  await engine.advance(1);
});
await page.screenshot({ path: "showcase/title.png" });
await page.evaluate(async () => {
  const e = window.captureEngine,
    d = e.debug;
  e.apply((s) => d.pointerDown(s, 260, 450, "touch"));
  e.apply((s) => d.pointerUp(s, "touch"));
  await e.advance(50);
  const rows = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => "RACJBSM"[(c + 2 * r) % 7] + "0").join(
      " ",
    ),
  );
  e.apply((s) => d.loadBoard(s, rows));
  for (const [c, r, token] of [
    [1, 4, "R0"],
    [2, 4, "R0b"],
    [3, 4, "A0"],
    [3, 5, "R0"],
    [3, 3, "B0s"],
    [4, 3, "J3"],
    [5, 3, "A3"],
    [5, 4, "M3"],
    [6, 4, "S3"],
    [6, 6, "X0"],
    [0, 2, "M1"],
    [1, 6, "J2"],
    [5, 1, "B2"],
  ])
    e.apply((s) => d.setGem(s, c, r, token));
  e.apply((s) => d.setScore(s, 1280));
  e.apply((s) => d.setLevelScore(s, 1280));
  for (let c = 0; c < 8; c++) {
    const kinds = Array.from({ length: 8 }, (_, r) =>
      r === 0 && c < 5 ? "R" : "RACJBSM"[(c + 2 * r) % 7],
    ).join("");
    e.apply((s) => d.setRefillKinds(s, c, kinds));
  }
  await e.advance(1);
});
await page.screenshot({ path: "showcase/board.png" });
const recording = await page.evaluate(async () => {
  const e = window.captureEngine;
  e.startRecording();
  e.apply((s) => e.debug.pointerDown(s, 604, 432));
  e.apply((s) => e.debug.pointerMove(s, 604, 504));
  await e.advance(15);
  e.apply((s) => e.debug.pointerUp(s));
  await e.advance(210);
  return e.stopRecording();
});
await writeFile("showcase/chain.json.gz", gzipSync(JSON.stringify(recording)));
if (errors.length) throw new Error(errors.join("\n"));
await browser.close();
