/* global document, console */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import assert from "node:assert/strict";

// Exercise the actual production entry point mounted below an arbitrary prefix.
const prefix = "/mounted/facet/";
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    assert(req.url.startsWith(prefix));
    const path = req.url.slice(prefix.length) || "index.html";
    assert(!path.includes(".."));
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(`dist/${path}`));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(4178, "127.0.0.1", resolve));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [],
    failures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(r.url());
  });
  await page.goto(`http://127.0.0.1:4178${prefix}`);
  await page.waitForTimeout(700);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  await page.screenshot({ path: "/tmp/opencode/howto.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await page.waitForTimeout(600);
  const colors = await page.evaluate(() => {
    const ctx = document.querySelector("canvas").getContext("2d");
    return Array.from({ length: 64 }, (_, i) =>
      [
        ...ctx.getImageData(
          388 + (i % 8) * 72,
          144 + Math.floor(i / 8) * 72,
          1,
          1,
        ).data,
      ].join(","),
    );
  });
  const hasRun = (a) =>
    a.some(
      (k, i) =>
        (i % 8 < 6 && k === a[i + 1] && k === a[i + 2]) ||
        (i < 48 && k === a[i + 8] && k === a[i + 16]),
    );
  assert(!hasRun(colors), "Opening board must hold no run");
  let pair;
  for (let i = 0; i < 64 && !pair; i++)
    for (const j of [i % 8 < 7 ? i + 1 : -1, i < 56 ? i + 8 : -1]) {
      if (j < 0) continue;
      const copy = [...colors];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      if (hasRun(copy)) {
        pair = [i, j];
        break;
      }
    }
  assert(pair, "Opening board must offer a productive swap");
  const position = (i) => ({
    x: 388 + (i % 8) * 72,
    y: 144 + Math.floor(i / 8) * 72,
  });
  const a = position(pair[0]),
    b = position(pair[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/opencode/production-play.png" });
  await page.mouse.click(1130, 72);
  await page.waitForTimeout(100);
  await page.keyboard.press("KeyP");
  await page.keyboard.press("KeyM");
  await page.keyboard.press("KeyM");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const size = await page.evaluate(() => ({
    w: document.querySelector("canvas").width,
    h: document.querySelector("canvas").height,
  }));
  assert.deepEqual(errors, []);
  assert.equal(size.w, 390);
  assert.equal(size.h, 844);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  await page.screenshot({ path: "/tmp/opencode/mobile.png" });
  console.log(
    "Production browser verified: sub-path loading, menus, legal drag, pause, mute, mobile fit; no failed assets or runtime errors.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
