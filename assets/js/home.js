(function () {
  "use strict";
  var Can = window.CanScene;
  var FL = window.FLAVOURS;
  var Q = window.QURN;
  var TAU = Math.PI * 2;
  var narrow = function () { return window.innerWidth <= 720; };

  function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function range(p, a, b) { return ease((p - a) / (b - a)); }
  function lerpPose(frames, p) {
    for (var i = 0; i < frames.length - 1; i++) {
      var a = frames[i], b = frames[i + 1];
      if (p <= b[0]) {
        var t = ease((p - a[0]) / (b[0] - a[0]));
        var out = {};
        Object.keys(a[1]).forEach(function (k) { out[k] = a[1][k] + (b[1][k] - a[1][k]) * t; });
        return out;
      }
    }
    return Object.assign({}, frames[frames.length - 1][1]);
  }
  function P(x, y, s, rx, ry, rz) { return { x: x, y: y, s: s, rx: rx, ry: ry, rz: rz }; }

  // ---------- poses per scene (narrow screens lift the can above the copy) ----------
  function framesFor(id) {
    var n = narrow();
    switch (id) {
      case "hero": return [
        [0, n ? P(0, 0.2, 0.86, 0.1, -0.45, 0.1) : P(0.3, -0.02, 1.06, 0.1, -0.45, 0.1)],
        [1, n ? P(0, 0.12, 0.9, 0.12, TAU - 0.45, 0.04) : P(0.08, 0, 1, 0.12, TAU - 0.45, 0.04)]
      ];
      // every scene's frame 0 is its "seat": the can is already there when the scene locks in.
      // the trip from the previous scene happens in the arrival phase while this scene slides up.
      case "ice": return [
        [0, n ? P(0, 0.3, 0.74, 0.04, TAU * 5 + 0.25, -0.08) : P(-0.42, 0, 1.12, 0.04, TAU * 5 + 0.25, -0.1)],
        [1, n ? P(0, 0.32, 0.74, 0.04, TAU * 5 + 0.6, -0.1) : P(-0.45, 0.02, 1.12, 0.04, TAU * 5 + 0.6, -0.12)]
      ];
      case "share": return [
        [0, n ? P(0, 0.34, 0.72, 0.02, TAU * 6, 0.04) : P(0.42, 0, 1.05, 0.02, TAU * 6, 0.06)],
        [1, n ? P(0, 0.34, 0.72, 0.02, TAU * 6, 0.04) : P(0.44, 0, 1.05, 0.02, TAU * 6, 0.06)]
      ];
      case "close": var seat = closeSeat(); return [[0, seat], [1, seat]];
    }
    return null;
  }

  // ending: measure where the headline really sits and stand the can just above it,
  // sized to fit between the nav and the copy on any window height
  var CAN_UNITS = 11.57, HALF_VIEW_UNITS = Math.tan(15 * Math.PI / 180) * 40;
  var closeCopy = document.querySelector(".close__copy");
  function closeSeat() {
    var vh = window.innerHeight, n = narrow();
    var fit = (window.innerWidth / vh) < 0.8 ? Math.max(0.62, (window.innerWidth / vh) / 0.8) : 1;
    var pxPerUnit = vh / (2 * HALF_VIEW_UNITS);
    var copyTop = closeCopy.offsetTop;                          // copy is absolutely placed in the 100svh stage
    var floor = copyTop - (n ? 22 : 30);                        // the can's base, with room for its shadow
    var ceiling = n ? 84 : 92;                                  // stay clear of the nav
    var room = Math.max(120, floor - ceiling);
    var s = Math.min(n ? 0.9 : 0.86, room / (CAN_UNITS * pxPerUnit * fit));
    var centrePx = floor - (CAN_UNITS * s * fit * pxPerUnit) / 2;
    return P(0, (vh / 2 - centrePx) / (vh / 2), s, 0.05, TAU * 7, 0);
  }

  // ---------- flavour act ----------
  var namesEl = document.getElementById("fl-names");
  var lineEl = document.getElementById("fl-line");
  var tagsEl = document.getElementById("fl-tags");
  var pickerEl = document.getElementById("fl-picker");
  var hudFl = document.getElementById("hud-flavour");
  var flSection = document.getElementById("flavours");

  FL.forEach(function (f, i) {
    var wrap = document.createElement("div");
    wrap.className = "fl__name";
    var span = document.createElement("p");
    span.className = "mega";
    span.textContent = f.name;
    wrap.appendChild(span);
    namesEl.appendChild(wrap);

    var b = document.createElement("button");
    b.type = "button";
    b.className = "fl__pick";
    b.textContent = f.name;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", function () { jumpToFlavour(i); });
    pickerEl.appendChild(b);
  });
  var nameEls = namesEl.children;
  var pickEls = pickerEl.children;

  var shownFlavour = -1;
  function showFlavour(i, drench) {
    if (i === shownFlavour) return;
    shownFlavour = i;
    var f = FL[i];
    Can.setFlavour(i);
    for (var k = 0; k < nameEls.length; k++) {
      nameEls[k].classList.toggle("is-on", k === i);
      pickEls[k].setAttribute("aria-pressed", k === i ? "true" : "false");
    }
    lineEl.textContent = f.line;
    tagsEl.textContent = "";
    f.tags.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; tagsEl.appendChild(li); });
    hudFl.textContent = f.name;
    if (drench) Q.drench(f.bg, f.fg, flSection);
  }

  function flavourPose(p) {
    var q = Math.min(p * 4, 3.9999);
    var i = Math.floor(q), local = q - i;
    var last = i === FL.length - 1;
    var ry = last || local < 0.76
      ? TAU * (1 + i) - 0.15 + Math.min(local / 0.76, 1) * 0.3
      : TAU * (1 + i) + 0.15 + ease((local - 0.76) / 0.24) * (TAU - 0.3);
    var idx = !last && local > 0.88 ? i + 1 : i;
    var n = narrow();
    return {
      idx: idx,
      pose: P(0, n ? 0.02 : -0.12, n ? 0.82 : 0.96, 0.06, ry, 0.07 * Math.sin(q * Math.PI))
    };
  }

  function jumpToFlavour(i) {
    var top = flSection.getBoundingClientRect().top + window.scrollY;
    var y = top + ((i + 0.3) / 4) * (flSection.offsetHeight - window.innerHeight);
    if (Q.lenis) Q.lenis.scrollTo(y, { duration: 1.4 });
    else window.scrollTo({ top: y, behavior: Q.reduced ? "auto" : "smooth" });
  }

  // ---------- per-scene extras ----------
  var ghostA = document.querySelector('.hero__ghost [data-drift="-1"]');
  var ghostB = document.querySelector('.hero__ghost [data-drift="1"]');
  var iceScene = document.querySelector("#ice .sticky");
  var kick = { v: 0 };

  function onScene(id, p) {
    Can.setTab(0);
    Can.setFizz(0);
    if (id === "flavours") {
      var fp = flavourPose(p);
      showFlavour(fp.idx, true);
      Can.setPose(fp.pose, Q.reduced);
      return;
    }
    var pose = lerpPose(framesFor(id), p);
    if (id === "share") pose.ry += kick.v;
    Can.setPose(pose, Q.reduced);

    if (id === "hero") {
      ghostA.style.transform = "translate3d(" + (-p * 9) + "vw,0,0)";
      ghostB.style.transform = "translate3d(" + (p * 9) + "vw,0,0)";
      Can.setWet(0.55);
    }
    if (id === "ice") {
      Can.setWet(0.55 + range(p, 0.05, 0.45) * 0.45);
      Can.setFizz(0);
      iceScene.style.setProperty("--mist", range(p, 0.1, 0.5).toFixed(3));
    }
    if (id === "share") { Can.setWet(0.75); }
    if (id === "close") { Can.setWet(0.7); }
  }

  // ---------- wire scroll ----------
  var scenes = ["hero", "flavours", "ice", "share", "close"];
  var lastP = {};

  if (!window.ScrollTrigger) {
    console.warn("ScrollTrigger missing: static layout only");
  } else {
    scenes.forEach(function (id) {
      var el = document.getElementById(id);
      ScrollTrigger.create({
        trigger: el,
        start: Q.reduced ? "top center" : "top top",
        end: Q.reduced ? "bottom center" : "bottom bottom",
        onUpdate: function (self) {
          lastP[id] = self.progress;
          if (!Q.reduced) onScene(id, self.progress);
        },
        onToggle: function (self) {
          if (id === "flavours") document.body.classList.toggle("in-flavours", self.isActive);
          if (!self.isActive) return;
          if (el.dataset.bg) Q.drench(el.dataset.bg, "#fff4e8");
          if (id !== "flavours") { shownFlavour = -1; if (id !== "hero") { Can.setFlavour(0); hudFl.textContent = FL[0].name; } }
          if (Q.reduced) onScene(id, id === "flavours" ? 0.1 : 0.99);
        }
      });
    });
    // flavour act drenches via its own logic; start it on the first flavour
    ScrollTrigger.create({
      trigger: flSection, start: Q.reduced ? "top center" : "top top", end: Q.reduced ? "bottom center" : "bottom bottom",
      onToggle: function (self) { if (self.isActive) { shownFlavour = -1; onScene("flavours", self.progress); } }
    });

    // as the footer scrolls in, the ending scene slides up; the can rides with it instead of floating
    var footerEl = document.querySelector(".footer");
    if (footerEl && !Q.reduced) {
      ScrollTrigger.create({
        trigger: footerEl, start: "top bottom", end: "bottom bottom",
        onUpdate: function (self) {
          var seat = closeSeat();
          var shiftPx = self.progress * footerEl.offsetHeight;
          seat.y += shiftPx / (window.innerHeight / 2);
          Can.setPose(seat, true);
        }
      });
    }

    // arrival: while the next scene slides up, the can travels to that scene's seat,
    // so it is never left parked on top of the incoming words
    if (!Q.reduced) {
      scenes.forEach(function (id, i) {
        if (!i) return;
        var prev = scenes[i - 1], el = document.getElementById(id);
        ScrollTrigger.create({
          trigger: el, start: "top bottom", end: "top top",
          onUpdate: function (self) {
            var e = self.progress;
            // a jump past the arrival lands on the seat, but only for the scene actually on screen
            if (e >= 1) { if (lastP[id] === undefined || lastP[id] < 1) onScene(id, lastP[id] || 0); return; }
            if (e <= 0) return;
            Can.setPose(mixPose(lastPose(prev), firstPose(id), ease(e)));
            if (e > 0.45) arrive(id);
          }
        });
      });
    }
  }

  function mixPose(a, b, t) {
    var o = {};
    Object.keys(a).forEach(function (k) { o[k] = a[k] + (b[k] - a[k]) * t; });
    return o;
  }
  function firstPose(id) { return id === "flavours" ? flavourPose(0).pose : lerpPose(framesFor(id), 0); }
  function lastPose(id) { return id === "flavours" ? flavourPose(1).pose : lerpPose(framesFor(id), 1); }
  // switch colour, label and lid to the incoming scene half-way through its arrival
  function arrive(id) {
    if (id === "flavours") { showFlavour(0, true); return; }
    var el = document.getElementById(id);
    if (el.dataset.bg) Q.drench(el.dataset.bg, "#fff4e8");
    shownFlavour = -1;
    Can.setFlavour(0);
    hudFl.textContent = FL[0].name;
  }

  // ---------- share a qurn ----------
  var form = document.getElementById("share-form");
  var input = document.getElementById("share-name");
  var hint = document.getElementById("share-hint");
  var deb;
  function clean(v) { return v.replace(/[^A-Za-zÀ-ɏ '\-]/g, "").slice(0, 12); }
  input.addEventListener("input", function () {
    var c = clean(input.value);
    if (c !== input.value) input.value = c;
    clearTimeout(deb);
    deb = setTimeout(function () { Can.setName(c); }, 60);
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var c = clean(input.value).trim();
    Can.setName(c);
    hint.textContent = c ? "Printed. Say hi to " + c.toUpperCase() + "." : "Type a name first.";
    if (c && window.gsap && !Q.reduced) {
      gsap.fromTo(kick, { v: -TAU }, {
        v: 0, duration: 1.4, ease: "power3.out",
        onUpdate: function () { onScene("share", lastP.share || 0.5); }
      });
    }
  });

  // ---------- entrance ----------
  var start = lerpPose(framesFor("hero"), 0);
  Can.setPose(Object.assign({}, start, { y: start.y - 1.6, ry: start.ry - 2.2 }), true);
  Can.setPose(start);
  showFlavour(0, false);

  window.addEventListener("resize", function () {
    scenes.forEach(function (id) { if (lastP[id] > 0 && lastP[id] < 1) onScene(id, lastP[id]); });
  }, { passive: true });
})();
