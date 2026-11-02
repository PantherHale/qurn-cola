(function () {
  "use strict";
  var Can = window.CanScene, Q = window.QURN;
  var TAU = Math.PI * 2;
  var section = document.getElementById("ag");
  var beats = document.querySelectorAll(".ag__beat");
  var ring = document.getElementById("ag-progress");
  var COLORS = [["#e4000f", "#fff4e8"], ["#7a0008", "#fff4e8"], ["#140306", "#fff4e8"], ["#e4000f", "#fff4e8"]];

  var shown = -1;
  function beat(i) {
    if (i === shown) return;
    shown = i;
    beats.forEach(function (b, k) { b.classList.toggle("is-on", k === i); });
    Q.drench(COLORS[i][0], COLORS[i][1]);
  }

  function ringRadiusPx() {
    var svg = document.querySelector(".ag__ring").getBoundingClientRect();
    return (svg.width / 2) * (92 / 100);
  }

  function update(p) {
    var theta = -Math.PI / 2 + p * TAU;
    var R = ringRadiusPx();
    var hw = window.innerWidth / 2, hh = window.innerHeight / 2;
    var small = window.innerWidth <= 720;
    Can.setPose({
      x: (Math.cos(theta) * R) / hw,
      y: -(Math.sin(theta) * R) / hh,
      s: small ? 0.26 : 0.3,
      rx: 0.15,
      ry: p * TAU * 3,
      rz: -(theta + Math.PI / 2)
    });
    Can.setTab(p > 0.2 && p < 0.7 ? 0.12 : 0);
    Can.setShadow(0);
    Can.setWet(0.6);
    ring.style.strokeDashoffset = (1 - p).toFixed(4);
    beat(Math.min(3, Math.floor(p * 4)));
  }

  if (window.ScrollTrigger) {
    ScrollTrigger.create({
      trigger: section, start: "top top", end: "bottom bottom",
      onUpdate: function (self) { if (!Q.reduced) update(self.progress); },
      onToggle: function (self) { if (self.isActive) update(Q.reduced ? 0 : self.progress); }
    });
    ScrollTrigger.create({
      trigger: ".ag__close", start: "top 60%",
      onToggle: function (self) {
        if (!self.isActive) return;
        Q.drench("#e4000f", "#fff4e8");
        Can.setShadow(1);
        var small = window.innerWidth <= 720;
        Can.setPose({ x: small ? 0 : 0.45, y: small ? 0.4 : 0, s: small ? 0.55 : 0.95, rx: 0.1, ry: TAU * 3, rz: small ? 0 : 0.1 });
      }
    });
  }

  var R0 = ringRadiusPx();
  Can.setPose({ x: 0, y: (R0 / (window.innerHeight / 2)) + 0.6, s: 0.36, rx: 0.15, ry: -2, rz: 0 }, true);
  update(0);
  if (Q.reduced) beats.forEach(function (b) { b.classList.add("is-on"); });
})();
