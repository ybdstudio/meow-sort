#!/usr/bin/env node
/* Pre-upload check for a TikTok Minis native package (folder or .zip).
   Catches the DevTool/packer errors we hit, before uploading:
     "Cannot find game.json in the project source"  → game.json not at the ROOT
   Usage: node tools/check_package.js dist/meow-sort
          node tools/check_package.js dist/meow-sort-upload.zip      (needs `unzip`) */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist/meow-sort'));
let errors = 0, warns = 0;
const err = m => { console.log('  ✗ ' + m); errors++; };
const warn = m => { console.log('  ! ' + m); warns++; };
const pass = m => console.log('  ✓ ' + m);

let dir = target, tmp = null;
if (/\.zip$/i.test(target)) {
  const list = cp.execFileSync('unzip', ['-Z1', target]).toString().split('\n').filter(Boolean);
  if (!list.includes('game.json')) {
    const nested = list.find(f => /(^|\/)game\.json$/.test(f));
    err('zip has no game.json at its root' + (nested ? ' (found "' + nested + '" — zip the folder CONTENTS, not the folder)' : ''));
  } else pass('zip root contains game.json');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttpkg-'));
  cp.execFileSync('unzip', ['-q', target, '-d', tmp]);
  dir = tmp;
}
console.log('Checking ' + path.relative(process.cwd(), target));
const has = f => fs.existsSync(path.join(dir, f));
const size = p => { const s = fs.statSync(p); return s.isDirectory() ? fs.readdirSync(p).reduce((n, e) => n + size(path.join(p, e)), 0) : s.size; };

if (!has('game.json')) err('game.json missing at package root (this is the "Cannot find game.json in the project source" pack error)');
if (!has('game.js')) err('game.js (entry) missing at package root');
if (!has('project.config.json')) err('project.config.json missing at package root');
if (has('index.html')) warn('index.html at root: an HTML entry is not a valid native package entry');

let gj = null;
if (has('game.json')) {
  try { gj = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8')); pass('game.json is valid JSON'); }
  catch (e) { err('game.json is not valid JSON: ' + e.message); }
}
if (gj) {
  if (gj.subPackages) err('use lowercase "subpackages", not "subPackages"');
  (gj.subpackages || []).forEach(s => {
    const root = (s.root || '').replace(/\/$/, '');
    if (!s.name || !root) { err('subpackage needs name + root: ' + JSON.stringify(s)); return; }
    if (!has(root) || !fs.statSync(path.join(dir, root)).isDirectory()) { err('subpackage root "' + s.root + '" does not exist'); return; }
    if (!has(path.join(root, 'game.js'))) err('subpackage "' + s.name + '" has no ' + root + '/game.js entry');
    else pass('subpackage "' + s.name + '" → ' + s.root);
    if (s.independent && size(path.join(dir, root)) > 4 * 1024 * 1024) err('independent subpackage "' + s.name + '" > 4 MB');
  });
  if (gj.deviceOrientation && !/^(portrait|landscape)$/.test(gj.deviceOrientation)) warn('deviceOrientation should be portrait|landscape');
}
if (has('project.config.json')) {
  try {
    const pc = JSON.parse(fs.readFileSync(path.join(dir, 'project.config.json'), 'utf8'));
    if (!pc.appid || /YOUR_APP_ID/i.test(pc.appid)) err('project.config.json appid is not set (build with --appid <your app id>)');
    else pass('appid ' + pc.appid);
  } catch (e) { err('project.config.json is not valid JSON'); }
}
if (has('game.js')) {
  const src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  try { new Function(src); pass('game.js parses'); } catch (e) { err('game.js syntax error: ' + e.message); }
  if (/document\.getElementById|window\.addEventListener\(/.test(src) && !/GameGlobal/.test(src)) warn('game.js references DOM APIs');
}
const total = size(dir);
const sub = gj ? (gj.subpackages || []).reduce((n, s) => n + (has(s.root) ? size(path.join(dir, s.root)) : 0), 0) : 0;
const main = total - sub;
(main <= 4 * 1024 * 1024 ? pass : err)('main package ' + (main / 1024).toFixed(0) + ' KB (≤ 4096 KB)');
(total <= 30 * 1024 * 1024 ? pass : err)('total ' + (total / 1024).toFixed(0) + ' KB (≤ 30720 KB)');
if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
console.log(errors ? 'NOT READY: ' + errors + ' error(s)' : 'READY for DevTool upload' + (warns ? ' (' + warns + ' warning(s))' : ''));
process.exit(errors ? 1 : 0);
