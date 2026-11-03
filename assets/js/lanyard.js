/* "Made By Panther" lanyard badge: a verlet rope with a card on the end. Drops in on load, swings,
   can be grabbed and flung, tucks itself up while you read the story, and sleeps when still. */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";

  var rig = document.createElement("div");
  rig.className = "tag-rig";
  rig.innerHTML =
    '<svg class="tag-strap" xmlns="' + NS + '" aria-hidden="true" focusable="false">' +
      '<defs><path id="tag-path" d=""/></defs>' +
      '<use href="#tag-path" class="tag-strap__band"/>' +
      '<use href="#tag-path" class="tag-strap__edge"/>' +
      '<text class="tag-strap__text" dy="4"><textPath href="#tag-path" startOffset="0">' +
        'PANTHER · PANTHER · PANTHER · PANTHER · PANTHER · PANTHER · PANTHER · PANTHER ·' +
      '</textPath></text>' +
    "</svg>" +
    '<div class="tag-card" role="group" aria-label="Made by Panther">' +
      '<span class="tag-card__clip"></span>' +
      '<span class="tag-card__slot"></span>' +
      '<span class="tag-card__kicker">MADE BY</span>' +
      '<a class="tag-card__name" href="https://github.com/PantherHale" target="_blank" rel="noopener noreferrer" ' +
        'aria-label="Panther on GitHub (opens in a new tab)" draggable="false">PANTHER</a>' +
      '<span class="tag-card__rule"></span>' +
      '<span class="tag-card__bars"></span>' +
      '<span class="tag-card__sheen"></span>' +
    "</div>";
  document.body.appendChild(rig);

  var svg = rig.querySelector(".tag-strap");
  var path = rig.querySelector("#tag-path");
  var card = rig.querySelector(".tag-card");

  var N = 7, pts = [], segLen = 24, cardW = 132, cardH = 188;
  var STRETCH = 1.8, restLen = 24, wide = false, bandW = 15;
  var anchor = { x: 0, y: -14 }, anchorTarget = { x: 0, y: -14 };
  var gravity = 2400, damping = 0.987;
  var drag = null, sleeping = false, still = 0, raf = 0, last = 0, tucked = false;

  function measure() {
    var small = window.innerWidth <= 720;
    cardW = small ? 70 : 132;
    cardH = small ? 100 : 188;
    segLen = small ? 11 : 32;
    bandW = small ? 9 : 15;
    rig.style.setProperty("--tag-w", cardW + "px");
    rig.style.setProperty("--tag-h", cardH + "px");
    anchorTarget.x = window.innerWidth - (small ? 52 : 118);
    anchorTarget.y = restY();
    restLen = segLen;
    sizeStrapLayer();
  }
  // a narrow strip while it hangs (cheap to repaint); the full screen while you drag it (never clipped)
  function sizeStrapLayer() {
    var small = window.innerWidth <= 720;
    svgW = wide ? window.innerWidth : (small ? 200 : 420);
    svgLeft = Math.max(0, window.innerWidth - svgW);
    svg.style.left = svgLeft + "px";
    svg.setAttribute("width", svgW);
    svg.setAttribute("height", wide ? window.innerHeight : Math.min(window.innerHeight, small ? 420 : 640));
  }
  var svgW = 420, svgLeft = 0;
  function restY() { return window.innerWidth <= 720 ? 74 : -14; }
  // tucking slides the whole rig on the compositor; the rope simulation stays asleep
  function applyTuck() {
    var small = window.innerWidth <= 720;
    var lift = tucked ? segLen * (N - 1) + cardH - (small ? 30 : 46) + Math.max(0, restY()) : 0;
    rig.style.transform = "translate3d(0," + (-lift) + "px,0)";
  }

  function init(dropFromAbove) {
    measure();
    anchor.x = anchorTarget.x; anchor.y = anchorTarget.y;
    pts = [];
    for (var i = 0; i < N; i++) {
      var y = dropFromAbove ? anchor.y - 520 + i * segLen : anchor.y + i * segLen;
      var x = anchor.x + (dropFromAbove ? i * 6 : 0);
      pts.push({ x: x, y: y, px: x, py: y });
    }
  }

  function step(dt) {
    anchor.x += (anchorTarget.x - anchor.x) * Math.min(1, dt * 10);
    anchor.y += (anchorTarget.y - anchor.y) * Math.min(1, dt * 6);
    var g = gravity * dt * dt;
    for (var i = 1; i < N; i++) {
      var p = pts[i];
      if (drag && i === N - 1) continue;
      var vx = (p.x - p.px) * damping, vy = (p.y - p.py) * damping;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
    }
    if (drag) {
      // elastic: the pull spreads evenly over every segment, capped at STRETCH x the strap length
      var ax = drag.x - anchor.x, ay = drag.y - anchor.y;
      var reach = Math.sqrt(ax * ax + ay * ay) || 1, maxReach = segLen * (N - 1) * STRETCH;
      var k = reach > maxReach ? maxReach / reach : 1;
      var e = pts[N - 1];
      e.px = e.x; e.py = e.y;
      e.x = anchor.x + ax * k; e.y = anchor.y + ay * k;
      var want = Math.min(segLen * STRETCH, Math.max(segLen, (reach * k) / (N - 1)));
      restLen += (want - restLen) * 0.6;
    } else {
      restLen += (segLen - restLen) * Math.min(1, dt * 9);   // springs back after a fling
    }
    pts[0].x = anchor.x; pts[0].y = anchor.y;
    for (var it = 0; it < 16; it++) {
      for (var j = 0; j < N - 1; j++) {
        var a = pts[j], b = pts[j + 1];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (d <= restLen) continue;                     // a strap goes slack, it never pushes
        var diff = (d - restLen) / d;
        var aFixed = j === 0, bFixed = drag && j + 1 === N - 1;
        var wa = aFixed ? 0 : bFixed ? 1 : 0.5, wb = bFixed ? 0 : aFixed ? 1 : 0.5;
        a.x += dx * diff * wa; a.y += dy * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb;
      }
      pts[0].x = anchor.x; pts[0].y = anchor.y;
    }
  }

  function render() {
    var o = svgLeft;
    var d = "M" + (pts[0].x - o).toFixed(1) + " " + pts[0].y.toFixed(1);
    for (var i = 1; i < N - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2 - o, my = (pts[i].y + pts[i + 1].y) / 2;
      d += " Q" + (pts[i].x - o).toFixed(1) + " " + pts[i].y.toFixed(1) + " " + mx.toFixed(1) + " " + my.toFixed(1);
    }
    var e = pts[N - 1], pe = pts[N - 2];
    d += " L" + (e.x - o).toFixed(1) + " " + e.y.toFixed(1);
    path.setAttribute("d", d);
    // a stretched strap gets a little thinner, like real webbing
    var thin = Math.sqrt(segLen / restLen);
    svg.style.setProperty("--strap-w", (bandW * thin).toFixed(2) + "px");

    var angle = Math.atan2(e.x - pe.x, e.y - pe.y);
    var vx = e.x - e.px;
    var turn = Math.max(-55, Math.min(55, vx * 3.2));
    card.style.transform =
      "translate3d(" + (e.x - cardW / 2).toFixed(1) + "px," + (e.y - 6).toFixed(1) + "px,0) perspective(700px)" +
      " rotate(" + (-angle * 57.3 * 0.9).toFixed(2) + "deg) rotateY(" + turn.toFixed(1) + "deg)";
    card.style.setProperty("--sheen", (50 + turn).toFixed(0) + "%");
  }

  function energy() {
    var m = 0;
    for (var i = 1; i < N; i++) m = Math.max(m, Math.abs(pts[i].x - pts[i].px) + Math.abs(pts[i].y - pts[i].py));
    return m + Math.abs(anchorTarget.y - anchor.y) * 0.05 + Math.abs(anchorTarget.x - anchor.x) * 0.05;
  }

  function loop(t) {
    raf = 0;
    var dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
    last = t;
    // two substeps keep fast flings stable
    step(dt / 2); step(dt / 2);
    render();
    if (!drag && energy() < 0.06 && Math.abs(restLen - segLen) < 0.05) {
      if (++still > 45) {
        sleeping = true; last = 0;
        if (wide) { wide = false; sizeStrapLayer(); render(); }
        return;
      }
    } else still = 0;
    raf = requestAnimationFrame(loop);
  }
  function wake() {
    if (reduced) { render(); return; }
    sleeping = false; still = 0;
    if (!raf) raf = requestAnimationFrame(loop);
  }

  // grab and fling
  // a drag must never fire the GitHub link; only a real tap/click does
  // (pointer capture retargets the click to the card, so a tap on the name is opened by hand on release)
  var downAt = null, moved = false, downOnLink = false;
  var link = card.querySelector(".tag-card__name");
  link.addEventListener("click", function (ev) { if (ev.detail !== 0) ev.preventDefault(); });   // keyboard Enter still follows

  card.addEventListener("pointerdown", function (ev) {
    downAt = { x: ev.clientX, y: ev.clientY };
    moved = false;
    downOnLink = link.contains(ev.target);
    if (reduced) return;
    ev.preventDefault();
    card.setPointerCapture(ev.pointerId);
    drag = { x: ev.clientX, y: ev.clientY - 6 };
    rig.classList.add("is-grabbed");
    if (!wide) { wide = true; sizeStrapLayer(); }
    if (tucked) { tucked = false; applyTuck(); }
    wake();
  });
  card.addEventListener("pointermove", function (ev) {
    if (downAt && Math.abs(ev.clientX - downAt.x) + Math.abs(ev.clientY - downAt.y) > 6) moved = true;
    if (!drag) return;
    drag.x = ev.clientX; drag.y = ev.clientY - 6;
  });
  function release() {
    if (downOnLink && !moved) window.open(link.href, "_blank", "noopener,noreferrer");
    downOnLink = false;
    if (!drag) return;
    drag = null;
    rig.classList.remove("is-grabbed");
    wake();
  }
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", function () { downOnLink = false; release(); });

  // the badge always hangs in view (operator 2026-11-02); scrolling only gives it a gentle sway
  var lastScroll = window.scrollY, swayAt = 0;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  window.addEventListener("scroll", function () {
    if (reduced || coarse) return;                            // phones: no scroll sway (a thumb flick flung it over the nav)
    var y = window.scrollY, d = y - lastScroll;
    lastScroll = y;
    var now = performance.now();
    if (Math.abs(d) > 2 && now - swayAt > 120) {
      swayAt = now;
      var push = Math.max(-6, Math.min(6, d * 0.06));
      for (var i = 1; i < N; i++) pts[i].px += push * (i / N);
      wake();
    }
  }, { passive: true });
  window.addEventListener("resize", function () { measure(); applyTuck(); wake(); }, { passive: true });

  init(!reduced);
  if (reduced) { anchor.y = anchorTarget.y; init(false); render(); }
  else {
    render();
    // drop in once the loading screen lifts (or shortly after load on pages without one)
    var loaderEl = document.getElementById("loader");
    if (loaderEl && !loaderEl.classList.contains("is-done")) {
      window.addEventListener("loader:done", function () { setTimeout(wake, 300); });
    } else {
      setTimeout(wake, 650);
    }
  }
})();
