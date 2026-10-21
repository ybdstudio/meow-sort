/* Pure game logic: no DOM, no platform APIs. Shared by native build, emulator and tools. */
/* ===================== CORE: pure game logic (no DOM) ===================== */
var CORE = (function () {
  var CONFIG = {
    shelfCapacity: 5,
    matchSize: 5,
    bedCapacity: 1,
    accessRule: 'edge',       // only the outermost cat can be picked
    groupMove: true,          // a run of same-colour cats at the outer end moves together
    undoAcrossMatch: false,
    starsPerMatch: 1,
    coinsPerLevel: 50,
    startCoins: 1100,
    shuffleUses: 1,
    extraBedUses: 1
  };
  // Merge build config (js/config.js) over the defaults above.
  if (typeof GAME_CONFIG !== 'undefined') {
    [GAME_CONFIG.rules, GAME_CONFIG.economy].forEach(function (src) {
      if (src) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) CONFIG[k] = src[k];
    });
  }
  // Costumes: the original 5 + 7 cut from the costume sheet (tools/cut_costumes.py).
  var COLOR_CODES = { R: 'red', B: 'blue', G: 'green', Y: 'yellow', P: 'pink',
    C: 'chef', D: 'reindeer', O: 'pirate', A: 'astronaut', W: 'wizard', Q: 'princess', F: 'firefighter' };
  var COLOR_LETTER = {};
  for (var cl in COLOR_CODES) COLOR_LETTER[COLOR_CODES[cl]] = cl;

  // Strings list cats from the WALL outward (left column: left->right,
  // right column: right->left as seen on screen).
  var LEVELS = [
    { name: 'Tutorial', rowsL: [1, 2, 3], rowsR: [1, 2, 3], beds: 2,
      left: ['RRBB', 'YYR', 'BY'], right: ['RRY', 'BBY', ''] },
    { name: 'Standard', beds: 2,
      left: ['BPP', 'RGG', 'BRY', 'PBB', 'BPP'],
      right: ['YGG', 'G', '', 'RRR', 'YYY'] }
  ];   // levels 3+ come from js/levels_gen.js (30-level difficulty curve, tools/gen_levels.js)

  function buildBoard(def) {
    var nextId = 1, containers = [];
    var rowsL = def.rowsL || def.left.map(function (_, i) { return i; });
    var rowsR = def.rowsR || def.right.map(function (_, i) { return i; });
    function mk(side, row, str) {
      return {
        id: side + '_' + (row + 1), kind: 'shelf', side: side, row: row,
        capacity: CONFIG.shelfCapacity, completed: false,
        cats: str.split('').map(function (ch) { return { id: nextId++, color: COLOR_CODES[ch] }; })
      };
    }
    def.left.forEach(function (s, i) { containers.push(mk('left', rowsL[i], s)); });
    def.right.forEach(function (s, i) { containers.push(mk('right', rowsR[i], s)); });
    for (var b = 0; b < (def.beds || 0); b++) {
      containers.push({ id: 'bed_' + (b + 1), kind: 'bed', side: 'bottom', row: b,
        capacity: CONFIG.bedCapacity, completed: false, cats: [] });
    }
    return { containers: containers, nextId: nextId };
  }

  function validateLevel(def) {
    var errors = [], counts = {};
    def.left.concat(def.right).forEach(function (s, i) {
      if (s.length > CONFIG.shelfCapacity) errors.push('shelf ' + i + ' over capacity');
      for (var k = 0; k < s.length; k++) {
        if (!COLOR_CODES[s[k]]) errors.push('bad colour ' + s[k]);
        counts[s[k]] = (counts[s[k]] || 0) + 1;
      }
      if (s.length === CONFIG.matchSize && s.split('').every(function (c) { return c === s[0]; }))
        errors.push('shelf ' + i + ' starts completed');
    });
    Object.keys(counts).forEach(function (c) {
      if (counts[c] % CONFIG.matchSize) errors.push('colour ' + c + ' count ' + counts[c] + ' not a multiple of ' + CONFIG.matchSize);
    });
    return errors;
  }

  function getC(board, id) {
    for (var i = 0; i < board.containers.length; i++) if (board.containers[i].id === id) return board.containers[i];
    return null;
  }
  function accessible(cont, idx, rule) {
    if (!cont || cont.completed) return false;
    if (idx < 0 || idx >= cont.cats.length) return false;
    return rule === 'any' ? true : idx === cont.cats.length - 1;
  }
  function canMove(board, srcId, idx, dstId, rule) {
    var s = getC(board, srcId), d = getC(board, dstId);
    if (!s || !d) return { ok: false, reason: 'missing' };
    if (s === d) return { ok: false, reason: 'same' };
    if (!accessible(s, idx, rule)) return { ok: false, reason: 'blocked' };
    if (d.completed) return { ok: false, reason: 'locked' };
    if (d.cats.length >= d.capacity) return { ok: false, reason: 'full' };
    return { ok: true };
  }
  // Number of same-colour cats in a row at the outer (open) end of a container.
  function runLength(cont) {
    var cs = cont.cats, n = cs.length; if (!n) return 0;
    var r = 1; while (r < n && cs[n - 1 - r].color === cs[n - 1].color) r++;
    return r;
  }
  // How many cats a move carries: the whole outer run, limited by the free space at the destination.
  function moveCount(board, srcId, idx, dstId, rule) {
    var s = getC(board, srcId), d = getC(board, dstId);
    if (!s || !d) return 0;
    if (!CONFIG.groupMove || (rule || CONFIG.accessRule) !== 'edge' || idx !== s.cats.length - 1) return 1;
    return Math.max(1, Math.min(runLength(s), d.capacity - d.cats.length));
  }
  // Returns the moved cats, outermost first (it jumps first and lands deepest).
  function applyMove(board, srcId, idx, dstId, rule) {
    var s = getC(board, srcId), d = getC(board, dstId);
    var n = moveCount(board, srcId, idx, dstId, rule);
    var moved = s.cats.splice(idx - n + 1, n).reverse();
    moved.forEach(function (c) { d.cats.push(c); });
    return moved;
  }
  function isMatch(cont) {
    if (cont.kind !== 'shelf' || cont.completed) return false;
    if (cont.cats.length !== CONFIG.matchSize) return false;
    var c = cont.cats[0].color;
    for (var i = 1; i < cont.cats.length; i++) if (cont.cats[i].color !== c) return false;
    return true;
  }
  function findMatches(board) {
    return board.containers.filter(isMatch).map(function (c) { return c.id; });
  }
  function catCount(board) {
    var n = 0; board.containers.forEach(function (c) { n += c.cats.length; }); return n;
  }
  function isWon(board) { return catCount(board) === 0; }
  function snapshot(board) {
    return board.containers.map(function (c) {
      return { id: c.id, completed: c.completed, cats: c.cats.map(function (k) { return { id: k.id, color: k.color }; }) };
    });
  }
  function restore(board, snap) {
    var m = {}; snap.forEach(function (s) { m[s.id] = s; });
    board.containers.forEach(function (c) {
      var s = m[c.id];
      c.cats = s ? s.cats.map(function (k) { return { id: k.id, color: k.color }; }) : [];
      c.completed = s ? s.completed : false;
    });
  }
  function hasAnyMove(board, rule) {
    var cs = board.containers;
    for (var i = 0; i < cs.length; i++) {
      for (var k = 0; k < cs[i].cats.length; k++) {
        if (!accessible(cs[i], k, rule)) continue;
        for (var j = 0; j < cs.length; j++) if (canMove(board, cs[i].id, k, cs[j].id, rule).ok) return true;
      }
    }
    return false;
  }
  // Integrity: every cat id unique, nothing over capacity.
  function checkIntegrity(board) {
    var seen = {}, problems = [];
    board.containers.forEach(function (c) {
      if (c.cats.length > c.capacity) problems.push(c.id + ' over capacity');
      c.cats.forEach(function (k) { if (seen[k.id]) problems.push('duplicate cat ' + k.id); seen[k.id] = 1; });
    });
    return problems;
  }

  /* ---------- Solver (greedy best-first with visited set) ---------- */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (n) {
    var a = this.a; a.push(n); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  function solve(board, rule, maxNodes) {
    rule = rule || CONFIG.accessRule; maxNodes = maxNodes || 80000;
    var cs = board.containers;
    var caps = cs.map(function (c) { return c.capacity; });
    var shelf = cs.map(function (c) { return c.kind === 'shelf'; });
    var M = CONFIG.matchSize, group = CONFIG.groupMove && rule === 'edge';
    var start = cs.map(function (c) {
      return c.completed ? '' : c.cats.map(function (k) { return COLOR_LETTER[k.color]; }).join('');
    });
    function key(st) {
      var sh = [], bd = [];
      for (var i = 0; i < st.length; i++) {
        var v = rule === 'any' ? st[i].split('').sort().join('') : st[i];
        (shelf[i] ? sh : bd).push(v);
      }
      return sh.sort().join('|') + '#' + bd.sort().join('|');
    }
    function h(st) {
      var dis = 0, spread = 0, total = 0, colorSeen = {};
      for (var i = 0; i < st.length; i++) {
        var s = st[i]; if (!s) continue; total += s.length;
        var cnt = {}, mx = 0;
        for (var k = 0; k < s.length; k++) { cnt[s[k]] = (cnt[s[k]] || 0) + 1; if (cnt[s[k]] > mx) mx = cnt[s[k]]; }
        if (shelf[i]) dis += s.length - mx; else dis += s.length * 1.5;
        for (var c in cnt) { spread++; colorSeen[c] = 1; }
      }
      return dis * 2 + spread + total * 0.05;
    }
    var root = { st: start, g: 0, parent: null, move: null };
    root.f = h(start);
    var open = new Heap(); open.push(root);
    var seen = {}; seen[key(start)] = 1;
    var nodes = 0;
    while (open.a.length) {
      var n = open.pop(); nodes++;
      var st = n.st, done = true;
      for (var q = 0; q < st.length; q++) if (st[q]) { done = false; break; }
      if (done) {
        var moves = []; for (var p = n; p.move; p = p.parent) moves.unshift(p.move);
        return { solved: true, moves: moves, nodes: nodes };
      }
      if (nodes > maxNodes) return { solved: false, moves: null, nodes: nodes, exhausted: false };
      for (var i = 0; i < st.length; i++) {
        var s = st[i]; if (!s) continue;
        var idxs = [];
        if (rule === 'any') {
          var used = {};
          for (var k = s.length - 1; k >= 0; k--) if (!used[s[k]]) { used[s[k]] = 1; idxs.push(k); }
        } else idxs.push(s.length - 1);
        for (var a = 0; a < idxs.length; a++) {
          var idx = idxs[a], ch = s[idx];
          var emptyShelfTried = false, emptyBedTried = false;
          for (var j = 0; j < st.length; j++) {
            if (j === i) continue;
            var d = st[j];
            if (d.length >= caps[j]) continue;
            var cnt = 1;
            if (group && idx === s.length - 1) {
              var run = 1; while (run < s.length && s[s.length - 1 - run] === ch) run++;
              cnt = Math.min(run, caps[j] - d.length);
            }
            if (!d.length) {
              if (shelf[j]) { if (emptyShelfTried) continue; emptyShelfTried = true; }
              else { if (emptyBedTried) continue; emptyBedTried = true; }
              if (cnt === s.length && shelf[i] === shelf[j]) continue;      // moving a whole shelf to an empty one: pointless
            }
            var ns = st.slice();
            ns[i] = s.slice(0, idx - cnt + 1) + s.slice(idx + 1);
            var nd = d; for (var q = 0; q < cnt; q++) nd += ch;
            if (shelf[j] && nd.length === M) {
              var same = true; for (var z = 1; z < M; z++) if (nd[z] !== nd[0]) { same = false; break; }
              if (same) nd = '';
            }
            ns[j] = nd;
            var kk = key(ns); if (seen[kk]) continue; seen[kk] = 1;
            var child = { st: ns, g: n.g + 1, parent: n, move: { src: cs[i].id, idx: idx, dst: cs[j].id } };
            child.f = h(ns) + child.g * 0.02;
            open.push(child);
          }
        }
      }
    }
    return { solved: false, moves: null, nodes: nodes, exhausted: true };
  }

  /* ---------- Seeded RNG + procedural level generator ---------- */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function generateLevel(n, rule) {
    if (typeof PREGEN_LEVELS !== 'undefined') {
      if (PREGEN_LEVELS[n]) return PREGEN_LEVELS[n];
      // past the pre-generated range: loop the 31-90 block (it repeats the 11-30 rhythm), renamed
      if (n >= 90 && PREGEN_LEVELS[30 + ((n - 30) % 60)]) {
        var src = PREGEN_LEVELS[30 + ((n - 30) % 60)], cp = JSON.parse(JSON.stringify(src));
        cp.name = 'Level ' + (n + 1); return cp;
      }
    }
    var r = rng(9137 + n * 7919);
    var groups = Math.min(8, 5 + Math.floor((n - 3) / 2));
    for (var attempt = 0; attempt < 40; attempt++) {
      var letters = 'RBGYP'.split(''), pool = [];
      for (var g = 0; g < groups; g++) {
        var c = g < 5 ? letters[g] : letters[Math.floor(r() * 5)];
        for (var k = 0; k < CONFIG.matchSize; k++) pool.push(c);
      }
      for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      var shelves = ['', '', '', '', '', '', '', '', '', ''], maxPer = 4, p = 0;
      while (p < pool.length) {
        var si = Math.floor(r() * 10);
        if (shelves[si].length < maxPer) shelves[si] += pool[p++];
      }
      var def = { name: 'Level ' + (n + 1), beds: 2, left: shelves.slice(0, 5), right: shelves.slice(5) };
      if (validateLevel(def).length) continue;
      var res = solve(buildBoard(def), rule, 40000);
      if (res.solved) { def.verified = { rule: rule, moves: res.moves.length }; return def; }
    }
    return LEVELS[1];
  }

  function verifyAllLevels(rules) {
    rules = rules || ['any', 'edge'];
    var out = [];
    LEVELS.forEach(function (def, i) {
      var v = validateLevel(def);
      rules.forEach(function (rule) {
        var t0 = Date.now();
        var res = solve(buildBoard(def), rule, 300000);
        out.push({ level: i + 1, name: def.name, rule: rule, valid: v.length === 0, errors: v,
          solved: res.solved, solutionMoves: res.solved ? res.moves.length : null, nodes: res.nodes, ms: Date.now() - t0 });
      });
    });
    return out;
  }

  return {
    CONFIG: CONFIG, LEVELS: LEVELS, COLOR_CODES: COLOR_CODES,
    buildBoard: buildBoard, validateLevel: validateLevel, getC: getC, accessible: accessible,
    canMove: canMove, applyMove: applyMove, runLength: runLength, moveCount: moveCount, isMatch: isMatch, findMatches: findMatches,
    catCount: catCount, isWon: isWon, snapshot: snapshot, restore: restore, hasAnyMove: hasAnyMove,
    checkIntegrity: checkIntegrity, solve: solve, rng: rng, generateLevel: generateLevel,
    verifyAllLevels: verifyAllLevels
  };
})();

