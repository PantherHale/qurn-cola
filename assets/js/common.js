(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  window.QURN = { reduced: reduced, lenis: null };

  if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  // loading screen: covers the one-time GPU warm-up so nobody scrolls into a stutter
  var loader = document.getElementById("loader");
  var loaderDone = false;
  function liftLoader() {
    if (loaderDone || !loader) return;
    loaderDone = true;
    loader.classList.add("is-done");
    document.documentElement.classList.remove("is-loading");
    if (window.QURN && window.QURN.lenis) window.QURN.lenis.start();
    window.dispatchEvent(new Event("loader:done"));
  }
  if (loader) {
    if (!window.CanScene || !window.CanScene.live) {
      setTimeout(liftLoader, 300);
    } else {
      window.addEventListener("can:warm", liftLoader);
      if (document.documentElement.classList.contains("can-warm")) setTimeout(liftLoader, 0);
      setTimeout(liftLoader, 6000);
    }
  }

  // smooth scroll (off for reduced motion and touch)
  if (!reduced && !coarse && window.Lenis && window.gsap) {
    var lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
    window.QURN.lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    if (loader && !loaderDone) lenis.stop();
  }

  // split headings into words that rise in
  function split(el) {
    var words = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", el.textContent.trim());
    el.textContent = "";
    words.forEach(function (w, i) {
      var outer = document.createElement("span");
      outer.className = "w";
      outer.setAttribute("aria-hidden", "true");
      var inner = document.createElement("span");
      inner.style.setProperty("--i", i);
      inner.textContent = w;
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }
  document.querySelectorAll(".reveal-words").forEach(split);

  var targets = document.querySelectorAll(".reveal, .reveal-words");
  if (reduced || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    targets.forEach(function (el) { io.observe(el); });
  }

  // magnetic primary buttons (pointer only)
  if (!coarse && !reduced) {
    document.querySelectorAll(".btn--cream").forEach(function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        b.style.setProperty("--mx", (dx * 8).toFixed(1) + "px");
        b.style.setProperty("--my", (dy * 6).toFixed(1) + "px");
      });
      b.addEventListener("pointerleave", function () {
        b.style.setProperty("--mx", "0px");
        b.style.setProperty("--my", "0px");
      });
    });
  }

  // drench helper: floods one fixed backdrop layer (a single element repaints, nothing restyles);
  // the inherited text colour only changes when it really differs
  var backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  document.body.insertBefore(backdrop, document.body.firstChild);
  var curBg = "";
  window.QURN.drench = function (bg, fg, scope) {
    fg = fg || "#fff4e8";
    if (bg !== curBg) { backdrop.style.backgroundColor = bg; curBg = bg; }
    var el = scope || document.body;
    if ((el.dataset.fg || "#fff4e8") !== fg) { el.style.setProperty("--fg", fg); el.dataset.fg = fg; }
  };

  // footer in view: hide corner readouts; pause WebGL only if the footer covers the whole screen
  var footer = document.querySelector(".footer");
  if (footer && "IntersectionObserver" in window) {
    var steps = [];
    for (var s = 0; s <= 20; s++) steps.push(s / 20);
    new IntersectionObserver(function (e) {
      var visible = e[0].intersectionRect.height;
      document.body.classList.toggle("at-footer", visible > 40);
      if (window.CanScene) window.CanScene.pause(visible >= window.innerHeight - 2);
    }, { threshold: steps }).observe(footer);
  }
})();
