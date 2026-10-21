#!/usr/bin/env node
/* Bakes the 5 cat costumes x 8 expressions into one PNG atlas.
   The H5 prototype painted these at start-up with 40 DOM canvases; the native
   runtime only has createCanvas(), so we do it once at build time instead.

   Inputs : assets_src/cat_<color>.webp, assets_src/cat_meta.json,
            js/core.js (CORE.rng), tools/bake/paint_moods.js
   Outputs: native/project/res/cats.png   (atlas, in the 'res' subpackage)
            js/cat_atlas.js               (frame rects + face metadata)

   Needs Playwright + Chromium (dev machine only):  node tools/bake_atlas.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function req(name) {
  try { return require(name); } catch (e) { return require(path.join('/opt/npm-tools/node_modules', name)); }
}
const { chromium } = req('playwright');
let sharp = null; try { sharp = req('sharp'); } catch (e) {}

const MOODS = ['open', 'blink', 'happy', 'sleep', 'squint', 'determined', 'sad', 'cheer'];
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets_src/cat_meta.json'), 'utf8'));
const colors = Object.keys(meta);
const srcs = {};
colors.forEach(c => { srcs[c] = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets_src/cat_' + c + '.webp')).toString('base64'); });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8') +
    fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'tools/bake/paint_moods.js'), 'utf8') });
  const result = await page.evaluate(async ({ meta, srcs, MOODS }) => {
    // 12 costumes x 8 moods: atlas stored at 62% (cats are drawn ~140 px wide on a 3x phone), keeps it ~1.2k x 2.3k
    const PAD = 2, AS = 0.62, colors = Object.keys(meta), imgs = {};
    await Promise.all(colors.map(c => new Promise((res, rej) => { const i = new Image(); i.onload = () => { imgs[c] = i; res(); }; i.onerror = rej; i.src = srcs[c]; })));
    const cellW = Math.ceil(Math.max(...colors.map(c => imgs[c].width)) * AS) + PAD * 2;
    const W = cellW * MOODS.length;
    let H = 0; const rowY = {};
    colors.forEach(c => { rowY[c] = H; H += Math.ceil(imgs[c].height * AS) + PAD * 2; });
    const atlas = document.createElement('canvas'); atlas.width = W; atlas.height = H;
    const ag = atlas.getContext('2d'), frames = {};
    colors.forEach(c => {
      frames[c] = {};
      MOODS.forEach((mood, mi) => {
        const img = imgs[c], cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        try { paintMood(g, meta[c], mood); } catch (e) {}
        const x = mi * cellW + PAD, y = rowY[c] + PAD;
        const fw = Math.round(img.width * AS), fh = Math.round(img.height * AS);
        ag.imageSmoothingQuality = 'high'; ag.drawImage(cv, x, y, fw, fh);
        frames[c][mood] = [x, y, fw, fh, img.width, img.height];   // atlas rect + original (logical) size
      });
    });
    // Selection glow: a blurred yellow silhouette per costume, baked at half resolution.
    // Replaces ctx.shadowBlur / radial gradients, which TikTok's native canvas renders badly.
    // Matches the prototype: shadowBlur 14 logical px at CAT_DRAW 64 / SPR_W 245 → σ ≈ 27 sprite px, drawn twice.
    const GS = 0.5, SIG = 27, PADG = 84, glow = {};
    const gCells = colors.map(c => ({ c, w: Math.ceil((imgs[c].width + PADG * 2) * GS), h: Math.ceil((imgs[c].height + PADG * 2) * GS) }));
    const GW = gCells.reduce((n, g) => n + g.w + 2, 0), GH = Math.max(...gCells.map(g => g.h));
    const gAtlas = document.createElement('canvas'); gAtlas.width = GW; gAtlas.height = GH;
    const gg = gAtlas.getContext('2d'); let gx = 0;
    gCells.forEach(cell => {
      const img = imgs[cell.c], sil = document.createElement('canvas'); sil.width = img.width; sil.height = img.height;
      const sg = sil.getContext('2d'); sg.drawImage(img, 0, 0); sg.globalCompositeOperation = 'source-in';
      sg.fillStyle = 'rgb(255,224,70)'; sg.fillRect(0, 0, sil.width, sil.height);
      gg.save(); gg.filter = 'blur(' + (SIG * GS) + 'px)';
      for (let k = 0; k < 2; k++) gg.drawImage(sil, gx + PADG * GS, PADG * GS, img.width * GS, img.height * GS);
      gg.restore();
      glow[cell.c] = [gx, 0, cell.w, cell.h];
      gx += cell.w + 2;
    });
    return { png: atlas.toDataURL('image/png'), W, H, frames, glowPng: gAtlas.toDataURL('image/png'), glow, glowPad: PADG, glowScale: GS };
  }, { meta, srcs, MOODS });
  await browser.close();

  const outDir = path.join(ROOT, 'native/project/res');
  fs.mkdirSync(outDir, { recursive: true });
  let buf = Buffer.from(result.png.split(',')[1], 'base64');
  const raw = buf.length;
  if (sharp) buf = await sharp(buf).png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(outDir, 'cats.png'), buf);
  let gbuf = Buffer.from(result.glowPng.split(',')[1], 'base64');
  if (sharp) gbuf = await sharp(gbuf).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(outDir, 'glow.png'), gbuf);
  const faces = {};
  colors.forEach(c => { faces[c] = meta[c]; });
  fs.writeFileSync(path.join(ROOT, 'js/cat_atlas.js'),
    '/* AUTO-GENERATED by tools/bake_atlas.js — do not edit. */\n' +
    'var CAT_ATLAS = ' + JSON.stringify({ image: 'res/cats.png', w: result.W, h: result.H, moods: MOODS, frames: result.frames, faces, glowImage: 'res/glow.png', glow: result.glow, glowPad: result.glowPad, glowScale: result.glowScale }) + ';\n');
  console.log('glow atlas', (gbuf.length / 1024).toFixed(0) + 'KB');
  console.log('atlas', result.W + 'x' + result.H, 'png', (raw / 1024).toFixed(0) + 'KB ->', (buf.length / 1024).toFixed(0) + 'KB');
})().catch(e => { console.error(e); process.exit(1); });
