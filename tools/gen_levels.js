#!/usr/bin/env node
/* Level generator: the 30-level difficulty curve (docs/difficulty_curve_v1.png) + an endless tail.

   node tools/gen_levels.js [--total 90] [--candidates 36]   -> js/levels_gen.js

   Levels 1-2 are hand-made (js/core.js). Every other level is generated offline and verified by
   the same solver the game uses, so the phone never generates anything.

   Difficulty knobs per tier:
     groups   cat groups of 5 on the board (more cats = less free space)
     colors   distinct costumes (more = harder to read; repeats = easier)
     rows     shelf rows used (4 rows = 8 shelves for the gentlest levels)
     pick     which solver-difficulty percentile of the candidates to keep
              (score = solver nodes + 40 x solution moves; Easy keeps an easy one, Super Hard a hard one)
   Costumes unlock one by one (a new one always appears in the level that unlocks it).
   Look-alike pairs never share a level: strawberry/firefighter, bee/princess, shark/wizard. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const TOTAL = opt('total', 90), CANDS = opt('candidates', 36);
const sb = {}; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8') + '\nthis.CORE = CORE;', sb);
const CORE = sb.CORE, rule = CORE.CONFIG.accessRule;

// ---- the curve (level number 1-based) ----
const CURVE = { 1: 'Easy', 2: 'Easy', 3: 'Easy', 4: 'Easy', 5: 'Easy', 6: 'Easy', 7: 'Easy', 8: 'Medium', 9: 'Medium',
  10: 'Easy', 11: 'Easy', 12: 'Easy', 13: 'Easy', 14: 'Easy', 15: 'Easy', 16: 'Easy', 17: 'Hard', 18: 'Super Hard',
  19: 'Easy', 20: 'Easy', 21: 'Easy', 22: 'Easy', 23: 'Medium', 24: 'Easy', 25: 'Hard', 26: 'Easy', 27: 'Medium',
  28: 'Easy', 29: 'Medium', 30: 'Super Hard' };
// after 30: repeat the 11-30 rhythm forever
const tierOf = (lv) => lv <= 30 ? CURVE[lv] : CURVE[11 + ((lv - 31) % 20)];

function params(lv) {
  const t = tierOf(lv), late = lv > 30;
  if (t === 'Easy') {
    if (lv <= 5) return { groups: 5, colors: 5, rows: 4, beds: 2, pick: 0.2 };
    if (lv <= 7) return { groups: 6, colors: 5, rows: 5, beds: 2, pick: 0.25 };
    if (lv <= 13) return { groups: 6, colors: 6, rows: 5, beds: 2, pick: 0.3 };
    return { groups: 7, colors: 6, rows: 5, beds: 2, pick: late ? 0.45 : 0.35 };
  }
  if (t === 'Medium') return { groups: 8, colors: 7, rows: 5, beds: 2, pick: 0.3 };
  if (t === 'Hard') return { groups: 8, colors: 8, rows: 5, beds: 1, pick: 0.85 };
  return { groups: 9, colors: 9, rows: 5, beds: 1, pick: 0.45 };   // Super Hard
}

/* How it FEELS: a casual player model (prefers same-colour moves, otherwise random) plays the level
   many times with a move budget of 2.5x the solver's solution. failRate = share of runs that don't clear
   it in budget (a player would have reached for Undo / Shuffle / Extra Bed / Restart). */
function feel(def, seed, runs, budget) {
  const r = rng(seed); let stuck = 0, lenSum = 0;
  for (let k = 0; k < runs; k++) {
    const board = CORE.buildBoard(def);
    let steps = 0, won = false;
    while (steps < budget) {
      if (CORE.isWon(board)) { won = true; break; }
      const moves = [], good = [];
      board.containers.forEach(src => {
        const idx = src.cats.length - 1; if (idx < 0 || src.completed) return;
        board.containers.forEach(dst => {
          if (dst === src) return;
          if (!CORE.canMove(board, src.id, idx, dst.id, rule).ok) return;
          const top = dst.cats[dst.cats.length - 1];
          const m = { s: src.id, d: dst.id, idx };
          moves.push(m);
          if (top && top.color === src.cats[idx].color) good.push(m);
        });
      });
      if (!moves.length) break;
      const pool = good.length && r() < 0.75 ? good : moves;
      const m = pool[Math.floor(r() * pool.length)];
      CORE.applyMove(board, m.s, m.idx, m.d, rule);
      CORE.findMatches(board).forEach(id => { CORE.getC(board, id).cats = []; });
      steps++;
    }
    if (!won) stuck++;
    lenSum += steps;
  }
  return { stuckRate: stuck / runs, avgSteps: lenSum / runs };
}

// costume unlocks: level → letter (original five from the start)
const BASE = ['R', 'B', 'G', 'Y', 'P'];
const UNLOCK = { 4: 'C', 8: 'D', 11: 'O', 14: 'A', 17: 'W', 20: 'Q', 23: 'F' };
const CLASH = [['R', 'F'], ['Y', 'Q'], ['B', 'W']];
function unlocked(lv) { const u = BASE.slice(); Object.keys(UNLOCK).forEach(k => { if (+k <= lv) u.push(UNLOCK[k]); }); return u; }

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function palette(lv, k, r) {
  const pool = unlocked(lv), fresh = UNLOCK[lv];
  const pick = [];
  if (fresh) pick.push(fresh);
  const rest = shuffle(pool.filter(c => c !== fresh), r);
  for (const c of rest) {
    if (pick.length >= k) break;
    if (CLASH.some(([a, b]) => (c === a && pick.includes(b)) || (c === b && pick.includes(a)))) continue;
    pick.push(c);
  }
  return pick;
}

function candidate(lv, P, seed) {
  const r = rng(seed);
  const pal = palette(lv, Math.min(P.colors, P.groups), r);
  const groups = [];
  for (let g = 0; g < P.groups; g++) groups.push(pal[g % pal.length]);
  const cats = shuffle(groups.flatMap(c => Array(CORE.CONFIG.matchSize).fill(c)), r);
  const nShelves = P.rows * 2, slots = nShelves * CORE.CONFIG.shelfCapacity;
  const maxPer = cats.length > nShelves * 4 ? 5 : 4;
  const shelves = Array(nShelves).fill('');
  let p = 0, guard = 0;
  while (p < cats.length && guard++ < 10000) {
    const i = Math.floor(r() * nShelves);
    if (shelves[i].length < maxPer) shelves[i] += cats[p++];
  }
  if (p < cats.length) return null;
  // no shelf may start already solved / almost solved by a single colour
  if (shelves.some(s => s.length >= 4 && new Set(s).size === 1)) return null;
  const rows = [...Array(P.rows).keys()].map(i => i + (5 - P.rows));    // bottom-aligned when fewer rows
  const def = { name: 'Level ' + lv, tier: tierOf(lv), beds: P.beds, rowsL: rows, rowsR: rows,
    left: shelves.slice(0, P.rows), right: shelves.slice(P.rows) };
  if (CORE.validateLevel && CORE.validateLevel(def).length) return null;
  const res = CORE.solve(CORE.buildBoard(def), rule, 250000);
  if (!res.solved) return null;
  const f = feel(def, seed ^ 0x9e3779b9, 60, Math.ceil(res.moves.length * 2.5));
  def.verified = { rule, moves: res.moves.length, nodes: res.nodes, stuckRate: +f.stuckRate.toFixed(2) };
  def.score = f.stuckRate * 100 + res.moves.length * 0.5;
  return def;
}

const out = {}, report = [], t0 = Date.now();
for (let lv = 3; lv <= TOTAL; lv++) {
  const P = params(lv), cands = [];
  for (let k = 0; k < CANDS * 3 && cands.length < CANDS; k++) {
    const d = candidate(lv, P, 1000003 * lv + 7919 * k + 17);
    if (d) cands.push(d);
  }
  if (!cands.length) { console.error('level', lv, 'no solvable candidate'); process.exit(1); }
  cands.sort((a, b) => a.score - b.score);
  const def = cands[Math.min(cands.length - 1, Math.floor(P.pick * (cands.length - 1)))];
  delete def.score;
  out[lv - 1] = def;
  const colors = new Set((def.left.join('') + def.right.join('')).split('')).size;
  report.push({ lv, tier: def.tier, groups: P.groups, colors, rows: P.rows, beds: P.beds, moves: def.verified.moves, stuckRate: def.verified.stuckRate, cands: cands.length, newCostume: UNLOCK[lv] ? CORE.COLOR_CODES[UNLOCK[lv]] : '' });
  if (lv <= 30 || lv % 10 === 0) process.stdout.write('L' + lv + ' ' + def.tier + ' g' + P.groups + ' c' + colors + ' beds' + P.beds + ' moves ' + def.verified.moves + ' stuck ' + Math.round(def.verified.stuckRate * 100) + '%' + (UNLOCK[lv] ? ' +' + CORE.COLOR_CODES[UNLOCK[lv]] : '') + '\n');
}
fs.writeFileSync(path.join(ROOT, 'js/levels_gen.js'),
  '/* AUTO-GENERATED by tools/gen_levels.js — do not edit. Index = level index (0-based). */\nvar PREGEN_LEVELS = ' + JSON.stringify(out) + ';\n');
fs.writeFileSync(path.join(ROOT, 'docs/levels_report.json'), JSON.stringify(report, null, 1));
console.log('wrote', Object.keys(out).length, 'levels (3..' + TOTAL + ') in', ((Date.now() - t0) / 1000).toFixed(1), 's');
