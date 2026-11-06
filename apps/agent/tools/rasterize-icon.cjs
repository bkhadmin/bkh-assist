// Rasterize resources/novice.svg to the PNG icons (tray-16/32, icon 256) with Chromium:
//   npx electron tools/rasterize-icon.cjs resources/novice.svg <outDir> 16 32 256   (then copy into resources/)
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"), path = require("node:path");
const [svgPath, outDir, ...sizes] = process.argv.slice(2);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("data:text/html,<html><body></body></html>");
  const svg = fs.readFileSync(svgPath, "utf8");
  for (const s of sizes.map(Number)) {
    const url = await win.webContents.executeJavaScript(`new Promise((res) => {
      const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = ${s};
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, ${s}, ${s}); res(c.toDataURL('image/png')); };
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString("base64"))}; })`);
    fs.writeFileSync(path.join(outDir, `icon-${s}.png`), Buffer.from(url.split(",")[1], "base64"));
  }
  app.quit();
});
