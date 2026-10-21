#!/usr/bin/env node
/* Builds the TikTok Minis native package + local emulator.

   node tools/build_native.js --appid YOUR_APP_ID [--out dist] [--debug] [--no-minify]

   Output:
     dist/meow-sort/            -> open/upload with TikTok DevTool (ttmg dev)
       game.js                  (all modules concatenated into one closure)
       game.json, project.config.json
       res/                     ('res' subpackage: cats.png)
     dist/meow-sort-upload.zip  -> same files with game.json at the ZIP ROOT
     dist/emulator/index.html   -> local browser test (loads ../meow-sort/game.js)

   Upload ONLY dist/meow-sort (or the upload zip). The repo root / source zip has
   no game.json at its root and the packer rejects it.
   --strict exits non-zero when the pre-upload check fails (e.g. no appid).

   Module order matters: everything shares one function scope, exactly like the
   single <script> of the H5 prototype. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };

const APPID = opt('appid', null);
const OUT = path.resolve(ROOT, opt('out', 'dist'));
const PKG = path.join(OUT, 'meow-sort');
const DEBUG = !!opt('debug', false);
const MINIFY = !opt('no-minify', false);

const MODULES = [
  'native/src/adapter.js',   // Platform shim (must be first)
  'js/config.js',
  'js/core.js',
  'js/levels_gen.js',
  'js/cat_atlas.js',
  'js/game.js',
  'js/layout.js',
  'js/art.js',
  'js/view.js',
  'js/draw_helpers.js',
  'js/audio.js',
  'js/anim.js',
  'js/fx.js',
  'js/minis.js',
  'js/persist.js',
  'js/render.js',
  'native/src/ui_native.js',
  'js/input.js',
  'native/src/minis_native.js',
  'js/loop.js',
  'js/devapi.js',
  'native/src/main_native.js' // boot (must be last)
];
const LIMIT_MAIN = 4 * 1024 * 1024, LIMIT_TOTAL = 30 * 1024 * 1024;

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
function dirSize(p) {
  let n = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name); n += e.isDirectory() ? dirSize(f) : fs.statSync(f).size;
  }
  return n;
}
const kb = n => (n / 1024).toFixed(1) + ' KB';

(async () => {
  for (const m of MODULES) if (!fs.existsSync(path.join(ROOT, m))) { console.error('missing module', m); process.exit(1); }
  const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const version = (cfg.match(/var VERSION = '([^']+)'/) || [])[1] || '0.0.0';

  let code = '/* Meow Sort v' + version + ' — TikTok Minis native build ' + new Date().toISOString() + ' */\n' +
    '(function () {\n\'use strict\';\n' +
    MODULES.map(m => '/* ---- ' + m + ' ---- */\n' + fs.readFileSync(path.join(ROOT, m), 'utf8')).join('\n') +
    '\n})();\n';
  if (DEBUG) code = code.replace("debug: query.dev === '1' || query.debug === '1'", 'debug: true');

  // Syntax check before anything else
  try { new Function(code); } catch (e) { console.error('Syntax error in bundle:', e.message); process.exit(1); }

  if (MINIFY) {
    let terser = null;
    try { terser = require('terser'); } catch (e) { try { terser = require('/opt/npm-tools/node_modules/terser'); } catch (e2) {} }
    if (terser) {
      const r = await terser.minify(code, { compress: { passes: 2 }, mangle: true, format: { comments: /^!|Meow Sort v/ } });
      code = r.code;
    } else console.warn('  (terser not installed: shipping unminified — `npm i -D terser` to minify)');
  }

  rmrf(PKG); fs.mkdirSync(PKG, { recursive: true });
  fs.writeFileSync(path.join(PKG, 'game.js'), code);
  fs.copyFileSync(path.join(ROOT, 'native/project/game.json'), path.join(PKG, 'game.json'));
  const pc = JSON.parse(fs.readFileSync(path.join(ROOT, 'native/project/project.config.json'), 'utf8'));
  if (APPID && APPID !== true) pc.appid = APPID;
  if (!pc.appid || pc.appid === 'YOUR_APP_ID') console.warn('  WARNING: no app ID set — pass --appid <id> (DevTool upload will fail without it)');
  fs.writeFileSync(path.join(PKG, 'project.config.json'), JSON.stringify(pc, null, 2) + '\n');
  copyDir(path.join(ROOT, 'native/project/res'), path.join(PKG, 'res'));
  if (fs.existsSync(path.join(ROOT, 'native/project/ui'))) copyDir(path.join(ROOT, 'native/project/ui'), path.join(PKG, 'ui'));

  // Emulator
  const EMU = path.join(OUT, 'emulator');
  rmrf(EMU); fs.mkdirSync(EMU, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'native/emulator/index.html'), path.join(EMU, 'index.html'));

  // Size report (main package = total minus subpackage roots)
  const gj = JSON.parse(fs.readFileSync(path.join(PKG, 'game.json'), 'utf8'));
  const total = dirSize(PKG);
  const sub = (gj.subpackages || []).reduce((n, s) => n + dirSize(path.join(PKG, s.root)), 0);
  const main = total - sub;
  console.log('Meow Sort v' + version + (DEBUG ? ' [debug]' : '') + ' → ' + path.relative(ROOT, PKG));
  console.log('  game.js        ' + kb(fs.statSync(path.join(PKG, 'game.js')).size) + (MINIFY ? '' : ' (unminified)'));
  console.log('  main package   ' + kb(main) + ' / 4096 KB ' + (main < LIMIT_MAIN ? 'OK' : 'TOO BIG'));
  console.log('  subpackages    ' + kb(sub));
  console.log('  total          ' + kb(total) + ' / 30720 KB ' + (total < LIMIT_TOTAL ? 'OK' : 'TOO BIG'));
  console.log('  appid          ' + pc.appid);
  console.log('Emulator → ' + path.relative(ROOT, path.join(EMU, 'index.html')) + '   (serve ' + path.relative(ROOT, OUT) + '/ over http)');
  if (main >= LIMIT_MAIN || total >= LIMIT_TOTAL) process.exit(2);

  // Upload zip: contents of meow-sort/ at the ZIP ROOT (game.json must be at the root,
  // otherwise the packer fails with "Cannot find game.json in the project source").
  const ZIP = path.join(OUT, 'meow-sort-upload.zip');
  const entries = require('./zip').zipDir(PKG, ZIP);
  console.log('Upload zip → ' + path.relative(ROOT, ZIP) + '  (' + entries.length + ' files, root: ' + entries.filter(e => !e.includes('/')).join(', ') + ')');
  console.log('\nPre-upload check:');
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'check_package.js'), PKG], { stdio: 'inherit' });
  console.log('\nNext: cd ' + path.relative(process.cwd(), PKG) + ' && ttmg dev   → DevTool → Upload');
  if (r.status !== 0 && opt('strict', false)) process.exit(3);
})();
