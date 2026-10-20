/* ===================== DRAW HELPERS ===================== */
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function lin(y0, y1, stops) { var gr = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(function (s, i) { gr.addColorStop(i / (stops.length - 1), s); }); return gr; }
function text(str, x, y, size, fill, stroke, sw, align) {
  ctx.font = '900 ' + size + 'px ' + FONT; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.lineWidth = sw || 4; ctx.strokeText(str, x, y); }
  ctx.fillStyle = fill; ctx.fillText(str, x, y);
}
function starPath(x, y, R, r, n) {
  n = n || 5; ctx.beginPath();
  for (var i = 0; i < n * 2; i++) {
    var a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r : R;
    var px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function drawStar(x, y, R) {
  starPath(x, y + 2, R, R * 0.52); ctx.fillStyle = 'rgba(150,80,0,0.4)'; ctx.fill();
  starPath(x, y, R, R * 0.52); ctx.fillStyle = lin(y - R, y + R, ['#fff6a8', '#ffd21f', '#f29a06']); ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.2, R * 0.09); ctx.strokeStyle = '#d07a06'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(x - R * 0.22, y - R * 0.28, R * 0.22, R * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
}
function pawPath(x, y, s) {
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.35, s * 0.55, s * 0.45, 0, 0, Math.PI * 2);
  [[-0.62, -0.25, 0.22], [-0.24, -0.62, 0.24], [0.24, -0.62, 0.24], [0.62, -0.25, 0.22]].forEach(function (t) {
    ctx.moveTo(x + t[0] * s + t[2] * s, y + t[1] * s); ctx.ellipse(x + t[0] * s, y + t[1] * s, t[2] * s, t[2] * s * 1.25, 0, 0, Math.PI * 2);
  });
}
function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

