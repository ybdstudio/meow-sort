/* ===================== RENDER CONSTANTS / LAYOUT ===================== */
var LW = 540, LH = 960;
var ROW_Y = [262, 356, 450, 544, 638];          // plank top (cat feet) per row
var CAT_W = 49;                                  // slot width (5 per shelf)
var CAT_DRAW = 64;                               // drawn sprite width
var SPR_W = 245;                                 // reference sprite width
var PLANK_H = 15;
var BED_Y = 784;
var FLOOR_Y = 806;
var FONT = '"Arial Rounded MT Bold","Nunito","Trebuchet MS","Segoe UI",system-ui,-apple-system,sans-serif';
var PODS = [{ x: 186, y: 62, icon: 'pink', mood: 'open', bounce: 0, bv: 0 },
            { x: 270, y: 62, icon: 'red', mood: 'determined', bounce: 0, bv: 0 },
            { x: 354, y: 62, icon: 'video', bounce: 0, bv: 0 }];
var BTN = {
  undo: { x: 150, y: 902, w: 76, h: 70 }, shuffle: { x: 270, y: 902, w: 76, h: 70 },
  bed: { x: 390, y: 902, w: 76, h: 70 }, settings: { x: 486, y: 898, r: 30 }
};
var STAR_PILL = { x: 470, y: 46 }, COIN_PILL = { x: 92, y: 46 };

function shelfSpan(side) { return side === 'left' ? { x0: -14, x1: 250 } : { x0: 290, x1: LW + 14 }; }
function bedX(i, n) { return n <= 2 ? [204, 336][i] : [150, 270, 390][i]; }
function contPos(board, cont) {
  if (cont.kind === 'shelf') {
    var sp = shelfSpan(cont.side);
    return { x: (Math.max(0, sp.x0) + Math.min(LW, sp.x1)) / 2, y: ROW_Y[cont.row] };
  }
  var beds = board.containers.filter(function (c) { return c.kind === 'bed'; });
  return { x: bedX(beds.indexOf(cont), beds.length), y: BED_Y };
}
// updateShelfLayout: deterministic slot position for cat i in a container
function updateShelfLayout(board, cont, i) {
  if (cont.kind === 'shelf') {
    var y = ROW_Y[cont.row];
    var x = cont.side === 'left' ? 3 + CAT_W * (i + 0.5) : LW - 3 - CAT_W * (i + 0.5);
    return { x: x, y: y };
  }
  return contPos(board, cont);
}

