(function () {
  "use strict";
  var Can = window.CanScene, FL = window.FLAVOURS, Q = window.QURN;
  var TAU = Math.PI * 2;
  var stage = document.getElementById("fx-stage");
  var ghosts = document.getElementById("fx-ghosts");
  var copy = document.getElementById("fx-copy");
  var dots = document.getElementById("fx-dots");
  var section = document.getElementById("fx");
  var pickRow = document.getElementById("pick-row");
  var narrow = function () { return window.innerWidth <= 720; };
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  var panels = [];
  FL.forEach(function (f, i) {
    var g = document.createElement("p");
    g.className = "mega outline fx__ghost";
    g.textContent = f.name;
    ghosts.appendChild(g);

    var c = document.createElement("div");
    c.className = "fx__panel";
    var h = document.createElement("h2");
    h.className = "h1";
    h.textContent = f.name;
    var line = document.createElement("p");
    line.className = "line";
    line.textContent = f.line;
    var tags = document.createElement("ul");
    tags.className = "fx__tags";
    f.tags.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; tags.appendChild(li); });
    c.appendChild(h); c.appendChild(line); c.appendChild(tags);
    copy.appendChild(c);
    panels.push({ ghost: g, copy: c });

    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button"; b.className = "fx__dot"; b.textContent = f.name;
    b.addEventListener("click", function () { jump(i); });
    li.appendChild(b); dots.appendChild(li);

    var sw = document.createElement("button");
    sw.type = "button"; sw.className = "pick__swatch";
    sw.style.setProperty("--sw", f.bg);
    sw.style.setProperty("--sw-fg", f.fg);
    sw.textContent = f.name;
    sw.addEventListener("click", function () {
      Can.setFlavour(i);
      Q.drench(f.bg, f.fg);
      if (window.gsap && !Q.reduced) gsap.fromTo(spin, { v: -TAU }, { v: 0, duration: 1.2, ease: "power3.out", onUpdate: placeClose });
    });
    pickRow.appendChild(sw);
  });

  var current = -1;
  function show(i) {
    if (i === current) return;
    current = i;
    var f = FL[i];
    Can.setFlavour(i);
    Q.drench(f.bg, f.fg, section);
    panels.forEach(function (p, k) {
      p.ghost.classList.toggle("is-on", k === i);
      p.copy.classList.toggle("is-on", k === i);
      var dot = dots.children[k].firstChild;
      dot.setAttribute("aria-pressed", k === i ? "true" : "false");
      dot.style.color = k === i ? f.bg : "";
    });
    stage.dataset.side = i % 2 === 0 ? "right" : "left";
  }

  function sideX(i) { return narrow() ? 0 : (i % 2 === 0 ? 0.36 : -0.36); }

  function update(p) {
    var q = Math.min(p * 4, 3.9999);
    var i = Math.floor(q), local = q - i;
    var last = i === FL.length - 1;
    var spinT = last ? 0 : ease((local - 0.66) / 0.34);
    var ry = TAU * i - 0.2 + Math.min(local / 0.66, 1) * 0.4 + spinT * (TAU - 0.4);
    var x = sideX(i) + (last ? 0 : (sideX(i + 1) - sideX(i)) * spinT);
    var n = narrow();
    Can.setPose({
      x: x, y: n ? 0.3 : -0.02, s: n ? 0.72 : 1.12,
      rx: 0.08, ry: ry, rz: (i % 2 === 0 ? -0.12 : 0.12) * (1 - spinT) + (i % 2 === 0 ? 0.12 : -0.12) * spinT
    });
    Can.setTab(0);
    Can.setWet(0.7);
    show(!last && local > 0.83 ? i + 1 : i);
  }

  var spin = { v: 0 };
  function placeClose() {
    var n = narrow();
    Can.setPose({ x: n ? 0 : 0.45, y: n ? 0.4 : 0, s: n ? 0.55 : 0.95, rx: 0.1, ry: TAU * 4 + spin.v, rz: n ? 0 : 0.1 });
  }

  function jump(i) {
    if (Q.reduced) { update((i + 0.3) / 4); return; }
    var top = section.getBoundingClientRect().top + window.scrollY;
    var y = top + ((i + 0.3) / 4) * (section.offsetHeight - window.innerHeight);
    if (Q.lenis) Q.lenis.scrollTo(y, { duration: 1.4 });
    else window.scrollTo({ top: y, behavior: Q.reduced ? "auto" : "smooth" });
  }

  if (window.ScrollTrigger) {
    ScrollTrigger.create({
      trigger: section, start: "top top", end: "bottom bottom",
      onUpdate: function (self) { if (!Q.reduced) update(self.progress); },
      onToggle: function (self) { if (self.isActive) { current = -1; update(Q.reduced ? 0 : self.progress); } }
    });
    ScrollTrigger.create({
      trigger: "#pick", start: "top 60%", end: "bottom top",
      onToggle: function (self) {
        if (!self.isActive) return;
        Q.drench("#e4000f", "#fff4e8");
        Can.setFlavour(0);
        placeClose();
      }
    });
  }

  var n0 = narrow();
  Can.setPose({ x: sideX(0), y: n0 ? 0.3 : -1.6, s: n0 ? 0.72 : 1.12, rx: 0.08, ry: -2.4, rz: -0.12 }, true);
  update(0);
  if (Q.reduced) stage.classList.add("is-static");
})();
