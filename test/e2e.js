// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Drive index.html in headless Chromium: load the statement, download the zip
// in each mode and for one month, screenshot (light, dark, mobile).
//   CHROME=<path> node e2e.js <statement.xlsx> <out dir>
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

(async () => {
  const [xlsx, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(String(e)));
  await page.goto("file://" + path.resolve(__dirname, "../index.html"));
  await page.screenshot({ path: path.join(outDir, "empty.png") });
  const t0 = Date.now();
  await page.setInputFiles("#picker", xlsx);
  await page.waitForSelector("#cards .card", { timeout: 120000 });
  console.log(`read in ${((Date.now() - t0) / 1000).toFixed(1)}s; status:`, (await page.textContent("#status")).trim().slice(0, 200));
  console.log("default mode:", await page.$eval("#mode button.on", (b) => b.dataset.mode));
  await page.screenshot({ path: path.join(outDir, "loaded.png"), fullPage: true });
  const grab = async (name) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#zip")]);
    await dl.saveAs(path.join(outDir, name));
    console.log(`saved ${name} (${dl.suggestedFilename()}); card:`, (await page.textContent("#cards dl")).replace(/\s+/g, " ").trim());
  };
  await grab("balance.zip");
  for (const m of ["month", "day"]) { await page.click(`#mode button[data-mode="${m}"]`); await grab(`${m}.zip`); }
  await page.reload();
  console.log("mode after reload:", await page.$eval("#mode button.on", (b) => b.dataset.mode));
  await page.setInputFiles("#picker", xlsx);
  await page.waitForSelector("#cards .card", { timeout: 120000 });
  await page.click('#mode button[data-mode="balance"]');
  const last = await page.$eval("#to option:last-child", (o) => o.value);
  await page.selectOption("#from", last);
  await grab("last-month.zip");
  await page.click("#diagnostics details:nth-child(2) summary");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outDir, "mobile.png"), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.screenshot({ path: path.join(outDir, "dark.png"), fullPage: true });
  // A non-statement file must show an error, not crash.
  await page.setInputFiles("#picker", { name: "not-a-statement.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("hello") });
  await page.waitForSelector("#status .warn");
  console.log("bad file:", (await page.textContent("#status")).trim());
  console.log("horizontal overflow:", overflow, " console errors:", problems.length ? problems : "none");
  await browser.close();
})();
