(function () {
  "use strict";
  var Q = window.QURN;
  var list = document.getElementById("mo-list");
  var items = list.querySelectorAll(".mo__item");
  var lines = document.querySelectorAll("#bottle .draw");
  var liquid = document.getElementById("liquid");
  var main = document.getElementById("main");
  var bottle = document.getElementById("bottle");
  var cheers = document.getElementById("cheers");
  var burst = document.getElementById("burst");
  var rail = document.getElementById("mo-rail");

  var full = false;
  function setProgress(p) {
    var draw = Math.min(1, p / 0.55);
    lines.forEach(function (l, i) {
      var delay = l.classList.contains("flute") ? 0.35 + (i % 5) * 0.05 : 0;
      var t = Math.max(0, Math.min(1, (draw - delay) / (1 - delay)));
      l.style.strokeDashoffset = (1 - t).toFixed(4);
    });
    var fill = Math.max(0, Math.min(1, (p - 0.25) / 0.68));
    liquid.style.transform = "translate3d(0," + (640 - fill * 606).toFixed(1) + "px,0)";
    bottle.style.setProperty("--script", Math.max(0, Math.min(1, (p - 0.45) / 0.2)).toFixed(3));
    bottle.style.setProperty("--cap", Math.max(0, Math.min(1, (draw - 0.6) / 0.3)).toFixed(3));
    if (fill >= 0.999 && !full) { full = true; celebrate(); }
    else if (fill < 0.9 && full) { full = false; reset(); }
  }

  // ---------- the finale: cap pops, fizz and confetti burst, "Cheers." ----------
  var COLORS = ["#e4000f", "#fff4e8", "#140306", "#ff4f5a", "#ffffff"];
  function celebrate() {
    bottle.classList.add("is-popped");
    bottle.parentNode.classList.add("is-finale");
    cheers.classList.add("is-on");
    if (Q.reduced || !burst.animate) return;
    // burst from the bottle's mouth (where the cap was)
    var box = burst.getBoundingClientRect(), sb = bottle.getBoundingClientRect();
    var ox = sb.left - box.left + sb.width / 2, oy = sb.top - box.top + sb.height * 0.2;
    for (var i = 0; i < 70; i++) {
      var bit = document.createElement("span");
      var isBubble = i < 26;
      bit.className = isBubble ? "mo__fizz" : "mo__confetti";
      if (!isBubble) bit.style.background = COLORS[i % COLORS.length];
      burst.appendChild(bit);
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * (isBubble ? 0.9 : 2.2);
      var dist = (isBubble ? 120 : 220) + Math.random() * (isBubble ? 140 : 260);
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      var fall = isBubble ? -60 : 260 + Math.random() * 200;
      var spin = (Math.random() - 0.5) * 900;
      var dur = (isBubble ? 1100 : 1700) + Math.random() * 700;
      var anim = bit.animate([
        { transform: "translate(" + ox + "px," + oy + "px) scale(.4) rotate(0deg)", opacity: 1 },
        { transform: "translate(" + (ox + dx) + "px," + (oy + dy) + "px) scale(1) rotate(" + spin * 0.5 + "deg)", opacity: 1, offset: 0.35 },
        { transform: "translate(" + (ox + dx * 1.25) + "px," + (oy + dy + fall) + "px) scale(.9) rotate(" + spin + "deg)", opacity: 0 }
      ], { duration: dur, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
      anim.onfinish = (function (el) { return function () { el.remove(); }; })(bit);
    }
  }
  function reset() {
    bottle.classList.remove("is-popped");
    bottle.parentNode.classList.remove("is-finale");
    cheers.classList.remove("is-on");
  }

  if (Q.reduced || !window.ScrollTrigger) {
    setProgress(1);
  } else {
    setProgress(0);
    ScrollTrigger.create({
      trigger: main, start: "top top", end: "bottom bottom",
      onUpdate: function (self) { setProgress(self.progress); }
    });
  }

  // ---------- year rail: lights up as you pass each moment, click to jump ----------
  var dots = [];
  items.forEach(function (it, i) {
    var year = it.querySelector(".mo__year").textContent;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mo__dot";
    b.innerHTML = '<span class="mo__dot-year"></span><span class="mo__dot-pip" aria-hidden="true"></span>';
    b.firstChild.textContent = year;
    b.setAttribute("aria-label", "Jump to " + year + ": " + it.querySelector("h2").textContent.trim());
    b.addEventListener("click", function () {
      var y = it.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.12;
      if (Q.lenis) Q.lenis.scrollTo(y, { duration: 1.2 });
      else window.scrollTo({ top: y, behavior: Q.reduced ? "auto" : "smooth" });
    });
    rail.appendChild(b);
    dots.push(b);
  });
  function activate(i) {
    dots.forEach(function (d, k) {
      d.classList.toggle("is-on", k === i);
      d.classList.toggle("is-past", k < i);
      if (k === i) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current");
    });
  }

  items.forEach(function (it, i) {
    var year = it.querySelector(".mo__year");
    if (window.ScrollTrigger) {
      ScrollTrigger.create({
        trigger: it, start: "top 55%", end: "bottom 55%",
        onToggle: function (self) { if (self.isActive) { Q.drench(it.dataset.bg, it.dataset.fg); activate(i); } }
      });
      if (!Q.reduced) {
        gsap.fromTo(year, { xPercent: 8 }, {
          xPercent: -8, ease: "none",
          scrollTrigger: { trigger: it, start: "top bottom", end: "bottom top", scrub: 1 }
        });
      }
    }
  });
  Q.drench(items[0].dataset.bg, items[0].dataset.fg);
  activate(0);
})();
