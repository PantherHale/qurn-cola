/* Live 3D can: spline-turned 330 ml body printed as one seamless sheet, HDRI studio reflections,
   water-lens condensation (normal + roughness maps), beaded lid, bevelled pull tab, fizz. */
(function () {
  "use strict";

  var html = document.documentElement;
  var canvas = document.getElementById("stage");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function makeStub() {
    var noop = function () {};
    return {
      ready: Promise.resolve(false), live: false,
      setFlavour: noop, setName: noop, setPose: noop, setWet: noop,
      setFizz: noop, burst: noop, setTab: noop, setShadow: noop, pause: noop
    };
  }
  function noWebGL() { html.classList.add("no-webgl"); window.CanScene = makeStub(); }

  if (!canvas || typeof THREE === "undefined") { noWebGL(); return; }
  try {
    var probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) { noWebGL(); return; }
  } catch (e) { noWebGL(); return; }

  var FL = window.FLAVOURS;
  var TAU = Math.PI * 2;

  // ---------- real can dimensions (cm): 66 mm wide, 116.3 mm tall ----------
  var CAN_TOP = 11.57;
  var BAND_Y0 = 0.95, BAND_Y1 = 10.62;      // print runs up into the shoulder like the real can
  var BASE_W = 2048, BASE_H = 1024;         // design space for every map
  function yPx(y) { return BASE_H - (y / CAN_TOP) * BASE_H; }
  var BAND_T = yPx(BAND_Y1), BAND_B = yPx(BAND_Y0), BAND_MID = (BAND_T + BAND_B) / 2;

  // ---------- renderer ----------
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { noWebGL(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.physicallyCorrectLights = true;
  renderer.setClearColor(0x000000, 0);
  var maxAniso = renderer.capabilities.getMaxAnisotropy();
  var bigTex = renderer.capabilities.maxTextureSize >= 8192 && window.innerWidth > 900;
  var COLOR_SCALE = 1;   // 2048 px label: half the wrap is ever on screen, so 1024 px of print is already sharper than the display

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  camera.position.set(0, 0, 40);

  var seed = 1886;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  // ---------- environment: real studio HDRI on a rotatable dome + a flavour-tinted floor bounce ----------
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envScene = new THREE.Scene();
  var envDomeMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false });
  var envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), envDomeMat);
  envDome.rotation.y = 2.2;
  envScene.add(envDome);
  // black flag behind the can so the silhouette edges reflect dark, not a frosted halo
  var flag = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide, toneMapped: false }));
  flag.position.set(0, 0, -26);
  envScene.add(flag);
  // an overhead softbox so the lid catches a bright band, as in a real can top shot
  (function () {
    var m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    m.color.setScalar(9);
    var top = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.6), m);
    top.position.set(0, 24, 14);
    top.lookAt(0, 0, 0);
    envScene.add(top);
  })();
  // two hard strip lights, as a product photographer would add, for the crisp vertical streaks
  [[-11, 24, 34, 2.2], [15, 16, 18, 1.2]].forEach(function (s) {
    var m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    m.color.setScalar(s[2]);
    var strip = new THREE.Mesh(new THREE.PlaneGeometry(s[3], 40), m);
    strip.position.set(s[0], 2, s[1]);
    strip.lookAt(0, 2, 0);
    envScene.add(strip);
  });
  var bounceMat = new THREE.MeshBasicMaterial({ color: 0xe4000f, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.3 });
  var bounce = new THREE.Mesh(new THREE.CircleGeometry(30, 48), bounceMat);
  bounce.rotation.x = -Math.PI / 2;
  bounce.position.y = -18;
  envScene.add(bounce);
  // procedural softboxes stand in until the HDRI is decoded (or if it cannot be)
  var fallbackLights = new THREE.Group();
  (function () {
    var domeGeo = new THREE.SphereGeometry(49, 32, 16), cols = [], pos = domeGeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var t = (pos.getY(i) / 49 + 1) / 2, c = 0.03 + Math.pow(t, 1.8) * 0.4;
      cols.push(c, c, c);
    }
    domeGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    fallbackLights.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    [[-16, 14, 0.72, 6], [18, 9, -0.62, 4], [-9, 28, 1, 3]].forEach(function (b) {
      var m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); m.color.setScalar(b[3]);
      var p = new THREE.Mesh(new THREE.PlaneGeometry(5, 46), m);
      p.position.set(b[0], 2, b[1]); p.rotation.y = Math.PI * b[2]; fallbackLights.add(p);
    });
  })();
  envScene.add(fallbackLights);
  var hdrReady = false;

  // one prefiltered environment per flavour tint, built once; a swap only flips a pointer
  var envCache = {};
  function envFor(hex) {
    if (!envCache[hex]) {
      bounceMat.color.set(hex);
      envCache[hex] = pmrem.fromScene(envScene, 0.02).texture;
    }
    return envCache[hex];
  }
  function rebuildEnv(hex) { scene.environment = envFor(hex); }
  function resetEnvCache() {
    Object.keys(envCache).forEach(function (k) { envCache[k].dispose(); delete envCache[k]; });
  }

  function loadHDR() {
    // a plain binary .hdr fetch (1.6 MB, cached by the CDN) instead of a 2 MB base64 script the page had to parse
    var url = window.STUDIO_HDR || "assets/hdr/studio_small_09_1k.hdr";
    if (!THREE.RGBELoader) return;
    new THREE.RGBELoader().setDataType(THREE.HalfFloatType).load(url, function (tex) {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      envDomeMat.map = tex;
      envDomeMat.needsUpdate = true;
      envScene.remove(fallbackLights);
      hdrReady = true;
      resetEnvCache();
      rebuildEnv(FL[state.flavour].bg);
      warmUp();
      window.STUDIO_HDR = null;
    }, undefined, function () { /* keep the procedural studio */ });
  }

  // ---------- geometry: smooth spline profile ----------
  function C(x, y) { return new THREE.Vector3(x, y, 0); }
  // real 330 ml two-piece can: 66.2 mm body, 52.6 mm (202) lid, 115.7 mm tall,
  // deep base dome, conical chime, long S-curve shoulder, raised double seam, recessed lid
  // wall: from the standing ring, up the conical chime, the body, the necked shoulder,
  // over a real rolled double seam (vertical outer face, rounded crown) and down into the countersink
  var wallCtrl = [
    C(2.47, 0.0), C(2.53, 0.02), C(2.66, 0.13), C(2.86, 0.33), C(3.06, 0.58), C(3.22, 0.84), C(3.295, 1.06), C(3.31, 1.25),
    C(3.31, 4.0), C(3.31, 7.0), C(3.31, 9.7),
    C(3.3, 9.92), C(3.265, 10.12), C(3.2, 10.32), C(3.1, 10.53), C(2.97, 10.74),
    C(2.84, 10.92), C(2.74, 11.07), C(2.675, 11.2), C(2.648, 11.29),
    C(2.655, 11.325), C(2.69, 11.35), C(2.708, 11.38), C(2.712, 11.45), C(2.711, 11.52),
    C(2.7, 11.555), C(2.678, 11.572), C(2.648, 11.572), C(2.624, 11.555),
    C(2.612, 11.5), C(2.598, 11.36), C(2.578, 11.16), C(2.545, 11.03),
    C(2.5, 10.98), C(2.455, 11.0), C(2.43, 11.07), C(2.4, 11.12)
  ];
  // base dome: a deep pressure dome with a reinforcing step near the foot
  var domeCtrl = [
    C(0.0, 0.99), C(0.35, 0.985), C(0.7, 0.97), C(1.1, 0.93), C(1.45, 0.86), C(1.6, 0.8), C(1.66, 0.76),
    C(1.75, 0.72), C(1.95, 0.6), C(2.15, 0.42), C(2.3, 0.24), C(2.39, 0.1), C(2.44, 0.025), C(2.47, 0.0)
  ];
  var wallCurve = new THREE.CatmullRomCurve3(wallCtrl, false, "centripetal");
  var wallPts = wallCurve.getSpacedPoints(520).map(function (p) {
    var x = p.x;
    // spin-necked shoulder: four soft steps
    // die-necked shoulder: three distinct steps, each a short flat then a small inward roll
    if (p.y > 10.6 && p.y < 11.2) {
      var u = (p.y - 10.6) / 0.6 * 3, f = u - Math.floor(u);
      x -= 0.011 * Math.pow(Math.sin(Math.PI * Math.min(1, f / 0.55)), 2) * (f < 0.55 ? 1 : 0);
    }
    return new THREE.Vector2(Math.max(0, x), p.y);
  });

  var lidCtrl = [
    C(2.4, 11.12), C(2.3, 11.115), C(2.18, 11.11), C(2.1, 11.13), C(2.02, 11.145), C(1.94, 11.13),
    C(1.86, 11.11), C(1.2, 11.115), C(0.5, 11.12), C(0.0, 11.12)
  ];
  var lidPts = new THREE.CatmullRomCurve3(lidCtrl, false, "centripetal").getSpacedPoints(90)
    .map(function (p) { return new THREE.Vector2(Math.max(0, p.x), p.y); });
  var LID_Y = 11.12;

  // ---------- canvas helpers ----------
  function makeCanvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  // deferred detail maps: start as 2x2 placeholders, get their real pixels one job per task after first paint,
  // so building the can never blocks scrolling or input (the same texture object is refilled: no shader recompile)
  var jobs = [];
  function later(fn) { jobs.push(fn); }
  function pump() {
    if (!jobs.length) return;
    jobs.shift()();
    setTimeout(pump, 30);
  }
  function slotTex(rgb, srgb, repeat) {
    var c = makeCanvas(2, 2), g = c.getContext("2d");
    g.fillStyle = "rgb(" + rgb + ")"; g.fillRect(0, 0, 2, 2);
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    if (repeat) t.wrapS = THREE.RepeatWrapping;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  // WebGL2 textures have immutable storage, so free the 2x2 placeholder before uploading the full-size image
  function fill(t, canvas) { t.dispose(); t.image = canvas; t.needsUpdate = true; }

  function tex(c, srgb) {
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    t.wrapS = THREE.RepeatWrapping;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function eachWrapped(x, pad, fn) {
    fn(x);
    if (x < pad) fn(x + BASE_W);
    if (x > BASE_W - pad) fn(x - BASE_W);
  }

  // condensation: fixed layout so every flavour shares it
  var drops = [], drips = [], mist = [];
  (function () {
    var bandH = BAND_B - BAND_T;
    // drips first: each one runs down and wipes a clear lane through the beads
    for (var d = 0; d < 9; d++) {
      drips.push({ x: 40 + rnd() * (BASE_W - 80), y: BAND_T + 20 + rnd() * bandH * 0.45, len: 140 + rnd() * 320, w: 4 + rnd() * 4 });
    }
    function inLane(x, y) {
      for (var k = 0; k < drips.length; k++) {
        var p = drips[k];
        if (Math.abs(x - p.x) < p.w * 2.2 + 3 && y > p.y - 6 && y < p.y + p.len + p.w) return true;
      }
      return false;
    }
    // clustered beads: condensation gathers in patches and thickens toward the base
    var clusters = [];
    for (var c = 0; c < 46; c++) clusters.push({ x: rnd() * BASE_W, y: BAND_T + Math.pow(rnd(), 0.7) * bandH, s: 40 + rnd() * 120 });
    var tries = 0;
    while (drops.length < 540 && tries++ < 6000) {
      var cl = clusters[Math.floor(rnd() * clusters.length)];
      var useCl = rnd() < 0.7;
      var x = useCl ? cl.x + (rnd() + rnd() + rnd() - 1.5) * cl.s : rnd() * BASE_W;
      var y = useCl ? cl.y + (rnd() + rnd() + rnd() - 1.5) * cl.s * 0.8 : BAND_T + rnd() * bandH;
      x = (x + BASE_W) % BASE_W;
      if (y < BAND_T + 45 || y > BAND_B - 8 || inLane(x, y)) continue;
      var big = rnd() < 0.06;
      var r = big ? 7 + rnd() * 7 : 1.2 + Math.pow(rnd(), 2.6) * 5.5;
      drops.push({ x: x, y: y, r: r, sx: 0.82 + rnd() * 0.26 });
    }
    // fine fog: the frosted film between beads, also cleared inside drip lanes
    for (var m = 0; m < 2600; m++) {
      var mx = rnd() * BASE_W, my = BAND_T + rnd() * bandH;
      if (!inLane(mx, my)) mist.push([mx, my, 0.5 + rnd() * 0.9]);
    }
  })();

  function paintHeight() {
    var c = makeCanvas(BASE_W, BASE_H), g = c.getContext("2d", RF);
    g.fillStyle = "#000"; g.fillRect(0, 0, BASE_W, BASE_H);
    mist.forEach(function (p) {
      g.fillStyle = "rgba(255,255,255,.18)";
      g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.fill();
    });
    drops.forEach(function (p) {
      eachWrapped(p.x, 24, function (x) {
        var gr = g.createRadialGradient(x, p.y, 0, x, p.y, p.r);
        // hemispherical lens profile
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(0.5, "rgba(222,222,222,1)");
        gr.addColorStop(0.75, "rgba(168,168,168,1)");
        gr.addColorStop(0.92, "rgba(80,80,80,1)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.beginPath(); g.ellipse(x, p.y, p.r * p.sx, p.r, 0, 0, TAU); g.fill();
      });
    });
    drips.forEach(function (p) {
      var lg = g.createLinearGradient(0, p.y, 0, p.y + p.len);
      lg.addColorStop(0, "rgba(255,255,255,0)");
      lg.addColorStop(1, "rgba(255,255,255,.85)");
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(p.x - p.w * 0.3, p.y);
      g.quadraticCurveTo(p.x - p.w * 0.55, p.y + p.len * 0.6, p.x - p.w, p.y + p.len);
      g.arc(p.x, p.y + p.len, p.w, Math.PI, 0, true);
      g.quadraticCurveTo(p.x + p.w * 0.55, p.y + p.len * 0.6, p.x + p.w * 0.3, p.y);
      g.fill();
      var bulb = g.createRadialGradient(p.x, p.y + p.len, 0, p.x, p.y + p.len, p.w * 1.5);
      bulb.addColorStop(0, "rgba(255,255,255,1)"); bulb.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = bulb; g.beginPath(); g.arc(p.x, p.y + p.len, p.w * 1.5, 0, TAU); g.fill();
    });
    return c;
  }

  // height -> tangent-space normal map (OpenGL convention, wraps horizontally)
  var RF = { willReadFrequently: true };   // keep height maps CPU-side: reading a GPU canvas back stalls the page
  function heightToNormal(hc, strength) {
    var w = hc.width, h = hc.height;
    var src = hc.getContext("2d", RF).getImageData(0, 0, w, h).data;
    var out = makeCanvas(w, h), og = out.getContext("2d");
    var img = og.createImageData(w, h), d = img.data;
    var k = strength / 255, row = w * 4;
    // tight loop: direct index maths, no per-pixel function calls (this ran ~10x slower before)
    for (var y = 0; y < h; y++) {
      var up = (y > 0 ? y - 1 : 0) * row, dn = (y < h - 1 ? y + 1 : h - 1) * row, cur = y * row;
      for (var x = 0; x < w; x++) {
        var xl = (x === 0 ? w - 1 : x - 1) * 4, xr = (x === w - 1 ? 0 : x + 1) * 4, x4 = x * 4;
        var nx = (src[cur + xl] - src[cur + xr]) * k;
        var ny = (src[dn + x4] - src[up + x4]) * k;
        var inv = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
        var i = cur + x4;
        d[i] = nx * inv + 127.5;
        d[i + 1] = ny * inv + 127.5;
        d[i + 2] = inv + 127.5;
        d[i + 3] = 255;
      }
    }
    og.putImageData(img, 0, 0);
    return out;
  }

  // handling wear for still frames: hairline scratches and faint smudges that only raise roughness a touch
  function wear(g, W, H, n, scale) {
    g.save();
    g.lineCap = "round";
    for (var i = 0; i < n; i++) {
      var x = rnd() * W, y = rnd() * H, len = (0.15 + rnd() * 0.9) * scale, a = rnd() * TAU, curve = (rnd() - 0.5) * len * 0.3;
      g.strokeStyle = "rgba(255,255,255," + (0.025 + rnd() * 0.045).toFixed(3) + ")";
      g.lineWidth = 0.4 + rnd() * 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len / 2 - Math.sin(a) * curve, y + Math.sin(a) * len / 2 + Math.cos(a) * curve,
        x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    for (var s = 0; s < Math.round(n / 25); s++) {
      var sx = rnd() * W, sy = rnd() * H, sr = (0.4 + rnd()) * scale;
      var sg = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, "rgba(255,255,255,.07)"); sg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
    }
    g.restore();
  }

  function paintRough() {
    var c = makeCanvas(BASE_W, BASE_H), g = c.getContext("2d");
    // printed + varnished zone vs bare brushed aluminium
    g.fillStyle = "rgb(52,52,52)"; g.fillRect(0, 0, BASE_W, BASE_H);
    g.fillStyle = "rgb(44,44,44)";
    g.fillRect(0, 0, BASE_W, BAND_T); g.fillRect(0, BAND_B, BASE_W, BASE_H - BAND_B);
    for (var i = 0; i < 2600; i++) {
      var v = 30 + rnd() * 50;
      g.fillStyle = "rgba(" + v + "," + v + "," + v + ",.3)";
      g.fillRect(0, rnd() * BASE_H, BASE_W, 1);
    }
    wear(g, BASE_W, BASE_H, 700, 34);
    // frost haze lives between drops; drops themselves are glass-smooth
    mist.forEach(function (p) { g.fillStyle = "rgba(150,150,150,.25)"; g.fillRect(p[0], p[1], 2, 2); });
    g.fillStyle = "rgb(6,6,6)";
    drops.forEach(function (p) {
      eachWrapped(p.x, 24, function (x) { g.beginPath(); g.ellipse(x, p.y, p.r * p.sx * 0.92, p.r * 0.92, 0, 0, TAU); g.fill(); });
    });
    drips.forEach(function (p) { g.fillRect(p.x - p.w * 0.5, p.y + p.len * 0.25, p.w, p.len * 0.75); });
    return c;
  }

  function verticalText(g, text, cx, cy, font, maxLen, color, maxSize, minSize) {
    var size = maxSize;
    g.font = font.replace("{s}", size);
    var w = g.measureText(text).width;
    if (w > maxLen) { size = Math.max(minSize || 40, Math.floor(size * maxLen / w)); g.font = font.replace("{s}", size); }
    g.save();
    g.translate(cx, cy);
    g.rotate(-Math.PI / 2);
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 0, 0);
    g.restore();
  }

  // the Qurn Cola wordmark: script, reading bottom-to-top up the can
  function drawLogo(g, cx, cy, len, color) {
    verticalText(g, "Qurn Cola", cx, cy, "400 {s}px Yellowtail", len, color, 300);
  }

  function ribbonPath(g, yBase, amp, phase) {
    g.beginPath();
    for (var x = -10; x <= BASE_W + 10; x += 4) {
      var y = yBase + Math.sin((x / BASE_W) * Math.PI * 4 + phase) * amp + Math.sin((x / BASE_W) * TAU + phase * 0.5) * amp * 0.35;
      if (x === -10) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }

  // one small print-grain tile, painted once and tiled across every label
  var grain = null;
  function grainTile() {
    if (grain) return grain;
    grain = makeCanvas(256, 256);
    var g = grain.getContext("2d");
    for (var n = 0; n < 1100; n++) {
      g.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.05)";
      g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
    }
    return grain;
  }

  // mode "color" paints the print; mode "metal" paints the same shapes as a metalness mask
  function paintLabel(f, name, mode) {
    var isColor = mode === "color";
    var S = isColor ? COLOR_SCALE : 1;
    var c = makeCanvas(BASE_W * S, BASE_H * S), g = c.getContext("2d");
    g.scale(S, S);
    var inkMetal = "rgb(34,34,34)", bare = "rgb(255,255,255)", whiteInk = "rgb(6,6,6)";
    var silver = "#cdd1d6";

    // bare aluminium everywhere first
    g.fillStyle = isColor ? silver : bare;
    g.fillRect(0, 0, BASE_W, BASE_H);

    // printed band with a soft varnish edge
    if (isColor) {
      var bg = g.createLinearGradient(0, BAND_T, 0, BAND_B);
      bg.addColorStop(0, f.labelDeep); bg.addColorStop(0.07, f.label);
      bg.addColorStop(0.93, f.label); bg.addColorStop(1, f.labelDeep);
      g.fillStyle = f.bare ? silver : bg;
    } else {
      g.fillStyle = f.bare ? bare : inkMetal;
    }
    g.fillRect(0, BAND_T, BASE_W, BAND_B - BAND_T);
    if (!f.bare) {
      g.fillStyle = isColor ? f.labelDeep : inkMetal;
      g.fillRect(0, BAND_T - 3, BASE_W, 3);
      g.fillRect(0, BAND_B, BASE_W, 3);
    }

    // print grain so the ink is not a flat fill
    if (isColor && !f.bare) {
      g.fillStyle = g.createPattern(grainTile(), "repeat");
      g.fillRect(0, BAND_T, BASE_W, BAND_B - BAND_T);
    }

    // ribbon
    g.lineCap = "round";
    g.strokeStyle = isColor ? f.ribbon : (f.bare ? inkMetal : whiteInk);
    ribbonPath(g, BAND_B - 104, 34, 0.6); g.lineWidth = 24; g.stroke();
    ribbonPath(g, BAND_B - 62, 28, 1.1); g.lineWidth = 7; g.stroke();

    var wordInk = isColor ? f.word : (f.bare ? inkMetal : whiteInk);
    var front = BASE_W / 2;

    [0, BASE_W].forEach(function (x) { drawLogo(g, x, BAND_MID - 44, 640, wordInk); });
    if (name) {
      verticalText(g, "Share a Qurn with", front - 160, BAND_MID - 10, "400 {s}px Yellowtail", 600, wordInk, 72);
      verticalText(g, name.toUpperCase(), front + 40, BAND_MID - 10, "900 {s}px Archivo", 680, wordInk, 220, 70);
    } else {
      drawLogo(g, front, BAND_MID - 44, 640, wordInk);
    }

    if (f.band) {
      var bandInk = isColor ? f.band.color : inkMetal;
      var isDiet = f.band.text === "diet";
      [front + (name ? 200 : 185), 185].forEach(function (x) {
        verticalText(g, f.band.text, x, BAND_MID - 10, (isDiet ? "800" : "900") + " {s}px Archivo", 480, bandInk, isDiet ? 112 : 70);
      });
    } else {
      [front + 168, 168].forEach(function (x) {
        verticalText(g, "ORIGINAL TASTE", x, BAND_MID - 10, "800 {s}px Archivo", 420, wordInk, 34);
      });
    }

    // side panels: fine print, barcode, recycle line
    var fine = isColor ? (f.bare ? "rgba(20,3,6,.85)" : "rgba(255,255,255,.9)") : (f.bare ? inkMetal : whiteInk);
    g.fillStyle = fine;
    g.font = "500 19px 'JetBrains Mono', monospace";
    g.textAlign = "left";
    ["QURN COLA CO.", "A FICTIONAL BRAND", "MADE WITH QURN", "", "SERVE ICE COLD", "PLEASE RECYCLE"]
      .forEach(function (l, i) { g.fillText(l, BASE_W * 0.25 - 118, BAND_T + 120 + i * 28); });

    var keep = seed; seed = 42;
    var bx = BASE_W * 0.25 - 118, by = BAND_T + 330;
    g.fillStyle = isColor ? (f.bare ? "#e9ebee" : "rgba(244,236,228,.88)") : whiteInk;
    g.fillRect(bx - 10, by - 10, 236, 140);
    g.fillStyle = isColor ? "#111" : inkMetal;
    for (var x = 0; x < 214;) {
      var bw = 2 + Math.floor(rnd() * 3) * 2;
      if (rnd() > 0.42) g.fillRect(bx + x, by, bw, 96);
      x += bw + 2;
    }
    seed = keep;
    g.font = "500 16px 'JetBrains Mono', monospace";
    g.fillText("QURN · 330 · 0001", bx + 22, by + 118);

    g.fillStyle = fine;
    g.save();
    g.translate(BASE_W * 0.75, BAND_MID - 40);
    g.rotate(-Math.PI / 2);
    g.textAlign = "center";
    g.font = "400 76px Yellowtail";
    g.fillText("Feel the Fizz", 0, 0);
    g.font = "500 19px 'JetBrains Mono', monospace";
    g.fillText("330 ML  ·  ICE COLD  ·  QURN COLA CO.", 0, 64);
    g.restore();

    // shadowed crevice where the double seam meets the neck, and the seam's own crown highlight
    if (isColor) {
      var creviceY = yPx(11.31), crownY = yPx(11.56);
      var cg = g.createLinearGradient(0, creviceY - 6, 0, creviceY + 6);
      cg.addColorStop(0, "rgba(40,42,46,0)"); cg.addColorStop(0.5, "rgba(40,42,46,.55)"); cg.addColorStop(1, "rgba(40,42,46,0)");
      g.fillStyle = cg; g.fillRect(0, creviceY - 6, BASE_W, 12);
      g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(0, crownY - 1, BASE_W, 2);
    }

    // water lenses: a dark meniscus on the upper edge, a caustic on the lower edge,
    // so beads read as clear water on every ink (never as specks of dirt)
    if (isColor) {
      var caustic = f.bare || f.id === "zero" ? "rgba(255,255,255,.34)" : "rgba(255,235,230,.26)";
      drops.forEach(function (p) {
        if (p.r < 3) return;
        eachWrapped(p.x, 24, function (dx) {
          var rx = p.r * p.sx, ry = p.r;
          g.save();
          g.beginPath(); g.ellipse(dx, p.y, rx, ry, 0, 0, TAU); g.clip();
          var rim = g.createLinearGradient(0, p.y - ry, 0, p.y + ry);
          rim.addColorStop(0, "rgba(0,0,0,.30)");
          rim.addColorStop(0.35, "rgba(0,0,0,.06)");
          rim.addColorStop(0.7, "rgba(0,0,0,0)");
          rim.addColorStop(1, "rgba(0,0,0,.10)");
          g.fillStyle = rim; g.fillRect(dx - rx, p.y - ry, rx * 2, ry * 2);
          var cg = g.createRadialGradient(dx, p.y + ry * 0.55, 0, dx, p.y + ry * 0.55, ry * 0.6);
          cg.addColorStop(0, caustic); cg.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = cg; g.fillRect(dx - rx, p.y, rx * 2, ry);
          g.restore();
        });
      });
      // drip lanes: the wiped film shows slightly deeper, wetter ink
      drips.forEach(function (p) {
        var lg = g.createLinearGradient(0, p.y, 0, p.y + p.len);
        lg.addColorStop(0, "rgba(0,0,0,0)");
        lg.addColorStop(1, "rgba(0,0,0,.12)");
        g.fillStyle = lg;
        g.fillRect(p.x - p.w * 0.9, p.y, p.w * 1.8, p.len);
        var bl = g.createRadialGradient(p.x, p.y + p.len + p.w * 0.4, 0, p.x, p.y + p.len, p.w * 1.6);
        bl.addColorStop(0, caustic); bl.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = bl; g.beginPath(); g.arc(p.x, p.y + p.len, p.w * 1.6, 0, TAU); g.fill();
      });
    }
    return c;
  }

  // ---------- materials ----------
  var normalTex = slotTex("128,128,255", false, true);
  var roughTex = slotTex("60,60,60", false, true);
  later(function () { fill(normalTex, heightToNormal(paintHeight(), 6)); });
  later(function () { fill(roughTex, paintRough()); });

  var bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1, roughness: 1,
    roughnessMap: roughTex,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.9, 0.9),
    clearcoat: 1, clearcoatRoughness: 0.05,
    clearcoatNormalMap: normalTex, clearcoatNormalScale: new THREE.Vector2(0.9, 0.9),
    envMapIntensity: 0.9,
    side: THREE.FrontSide
  });

  // ---------- stamped lid, painted top-down (planar UVs), like a real 202 end ----------
  var LID_R = 2.42;
  var lidMaps = { normal: slotTex("128,128,255"), rough: slotTex("80,80,80"), ao: slotTex("255,255,255", true) };
  later(function () { var made = (function () {
    var S = 1024, k = S / (2 * LID_R), c = S / 2;
    function P(x, z) { return [c + x * k, c + z * k]; }          // body-frame (x, z) -> canvas, seen from above
    var hc = makeCanvas(S, S), h = hc.getContext("2d", RF);
    var rc = makeCanvas(S, S), r = rc.getContext("2d");
    h.fillStyle = "rgb(128,128,128)"; h.fillRect(0, 0, S, S);
    // satin base: smoother toward the centre, a touch rougher toward the bead, like a real spun end
    var rg = r.createRadialGradient(c, c, 0, c, c, LID_R * k);
    rg.addColorStop(0, "rgb(72,72,72)"); rg.addColorStop(0.85, "rgb(88,88,88)"); rg.addColorStop(1, "rgb(100,100,100)");
    r.fillStyle = rg; r.fillRect(0, 0, S, S);
    wear(r, S, S, 320, k * 0.45);
    // spin-finish rings: barely there, so they read as a sheen, not grooves
    for (var rr = 0.05; rr < LID_R; rr += 0.006) {
      var g = 126 + rnd() * 4, q = 76 + rnd() * 14;
      h.strokeStyle = "rgb(" + g + "," + g + "," + g + ")"; h.lineWidth = 1.2;
      h.beginPath(); h.arc(c, c, rr * k, 0, TAU); h.stroke();
      r.strokeStyle = "rgba(" + q + "," + q + "," + q + ",.6)";
      r.beginPath(); r.arc(c, c, rr * k, 0, TAU); r.stroke();
    }
    function ring(rad, w, tone) {
      h.save(); h.shadowColor = tone; h.shadowBlur = w * k * 0.9;
      h.strokeStyle = tone; h.lineWidth = w * k;
      h.beginPath(); h.arc(c, c, rad * k, 0, TAU); h.stroke(); h.restore();
    }
    ring(2.14, 0.07, "rgb(215,215,215)");   // panel reinforcing bead
    ring(2.25, 0.03, "rgb(70,70,70)");      // shoulder of the countersink
    ring(0.4, 0.05, "rgb(205,205,205)");    // rivet bead
    ring(0.52, 0.025, "rgb(80,80,80)");
    // debossed text running round the rim
    var text = "PLEASE RECYCLE  ·  ALUMINIUM  ·  330 ML  ·  ICE COLD  ·  ";
    h.save(); h.translate(c, c);
    h.font = "800 " + Math.round(0.135 * k) + "px Arial, Helvetica, sans-serif";
    h.fillStyle = "rgb(84,84,84)"; h.textAlign = "center"; h.textBaseline = "middle";
    h.shadowColor = "rgb(84,84,84)"; h.shadowBlur = 2;
    var step = TAU / text.length;
    for (var i = 0; i < text.length; i++) {
      h.save(); h.rotate(-0.28 * TAU + (i + 0.5) * step * 0.56);
      h.translate(0, -1.86 * k); h.fillText(text[i], 0, 0); h.restore();
    }
    h.restore();
    // pour opening (towards the front label = body -z): sunken panel, raised rim bead, sharp score groove
    function tear(scale, dz) {
      // smooth closed teardrop: quadratic curves through the midpoints of the control polygon
      var pts = [[0, 0.5], [-0.55, 0.62], [-0.98, 1.3], [-0.7, 2.0], [0, 2.18], [0.7, 2.0], [0.98, 1.3], [0.55, 0.62]]
        .map(function (p) { return P(-p[0] * scale, -(p[1] * scale + dz)); });
      var n = pts.length;
      function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
      h.beginPath();
      var m0 = mid(pts[n - 1], pts[0]);
      h.moveTo(m0[0], m0[1]);
      for (var i = 0; i < n; i++) {
        var m = mid(pts[i], pts[(i + 1) % n]);
        h.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      h.closePath();
    }
    h.save(); h.lineJoin = "round";
    tear(0.98, 0.08); h.fillStyle = "rgb(108,108,108)"; h.fill();
    tear(1.06, 0.04); h.strokeStyle = "rgb(225,225,225)"; h.lineWidth = 0.06 * k; h.shadowColor = "#ddd"; h.shadowBlur = 6; h.stroke();
    h.shadowBlur = 0;
    tear(0.9, 0.1); h.strokeStyle = "rgb(20,20,20)"; h.lineWidth = 0.022 * k; h.stroke();
    h.restore();
    // finger well under the tab ring (body +z)
    var fw = P(0, 1.42);
    var gw = h.createRadialGradient(fw[0], fw[1], 0, fw[0], fw[1], 0.55 * k);
    gw.addColorStop(0, "rgb(70,70,70)"); gw.addColorStop(1, "rgba(128,128,128,0)");
    h.fillStyle = gw; h.beginPath(); h.ellipse(fw[0], fw[1], 0.6 * k, 0.45 * k, 0, 0, TAU); h.fill();
    // two little stiffening beads either side of the rivet
    [-0.75, 0.75].forEach(function (x) {
      var a = P(x, -0.15), b = P(x, 0.45);
      h.save(); h.strokeStyle = "rgb(200,200,200)"; h.lineWidth = 0.05 * k; h.lineCap = "round";
      h.shadowColor = "#ccc"; h.shadowBlur = 5;
      h.beginPath(); h.moveTo(a[0], a[1]); h.lineTo(b[0], b[1]); h.stroke(); h.restore();
    });
    // ambient occlusion baked into colour: dark countersink edge, shadow under the tab, deeper opening
    var cc = makeCanvas(S, S), o = cc.getContext("2d");
    o.fillStyle = "#ffffff"; o.fillRect(0, 0, S, S);
    var edge = o.createRadialGradient(c, c, 1.95 * k, c, c, LID_R * k);
    edge.addColorStop(0, "rgba(0,0,0,0)"); edge.addColorStop(0.75, "rgba(40,40,40,.18)"); edge.addColorStop(1, "rgba(20,20,20,.55)");
    o.fillStyle = edge; o.fillRect(0, 0, S, S);
    var tabShadow = P(0, 0.62);
    o.save(); o.translate(tabShadow[0], tabShadow[1]); o.scale(1, 2.2);
    var ts = o.createRadialGradient(0, 0, 0, 0, 0, 0.62 * k);
    ts.addColorStop(0, "rgba(30,30,30,.32)"); ts.addColorStop(1, "rgba(30,30,30,0)");
    o.fillStyle = ts; o.beginPath(); o.arc(0, 0, 0.62 * k, 0, TAU); o.fill(); o.restore();
    var heightCtx = h;
    h = o; tear(0.9, 0.1); h = heightCtx;            // tear() traces onto whichever context h points at
    o.fillStyle = "rgba(60,60,60,.16)"; o.fill();

    // a few cold beads on the lid too, kept off the opening and the tab
    for (var d = 0; d < 42; d++) {
      var ang = rnd() * TAU, rad = 0.55 + Math.sqrt(rnd()) * 1.5;
      var dx = Math.sin(ang) * rad, dz = Math.cos(ang) * rad;
      if (dz < -0.3 && Math.abs(dx) < 1.1) continue;             // opening side
      if (Math.abs(dx) < 0.7 && dz > -0.9 && dz < 2.2) continue;  // under the tab
      var pr = (0.025 + Math.pow(rnd(), 2) * 0.07) * k, pp = P(dx, dz);
      var bh = h.createRadialGradient(pp[0], pp[1], 0, pp[0], pp[1], pr);
      bh.addColorStop(0, "rgba(255,255,255,1)"); bh.addColorStop(0.7, "rgba(200,200,200,.9)"); bh.addColorStop(1, "rgba(128,128,128,0)");
      h.fillStyle = bh; h.beginPath(); h.arc(pp[0], pp[1], pr, 0, TAU); h.fill();
      r.fillStyle = "rgb(30,30,30)"; r.beginPath(); r.arc(pp[0], pp[1], pr * 0.85, 0, TAU); r.fill();
      var lens = o.createRadialGradient(pp[0], pp[1] + pr * 0.3, 0, pp[0], pp[1], pr);
      lens.addColorStop(0, "rgba(0,0,0,0)"); lens.addColorStop(0.8, "rgba(0,0,0,.03)"); lens.addColorStop(1, "rgba(0,0,0,.1)");
      o.fillStyle = lens; o.beginPath(); o.arc(pp[0], pp[1], pr, 0, TAU); o.fill();
    }
    return { normal: heightToNormal(hc, 4), rough: rc, ao: cc };
  })();
  fill(lidMaps.normal, made.normal); fill(lidMaps.rough, made.rough); fill(lidMaps.ao, made.ao);
  });
  var lidMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2f4f6, map: lidMaps.ao, metalness: 1, roughness: 0.8, roughnessMap: lidMaps.rough,
    normalMap: lidMaps.normal, normalScale: new THREE.Vector2(0.85, 0.85),
    clearcoat: 0.35, clearcoatRoughness: 0.18,
    envMapIntensity: 1.6, side: THREE.DoubleSide
  });
  var rimMat = new THREE.MeshPhysicalMaterial({
    color: 0xdfe2e6, metalness: 1, roughness: 0.2, envMapIntensity: 1.4, side: THREE.DoubleSide
  });

  // tab: raised edge bead, stiffening rib, crisp finger-hole lip (painted in shape coordinates)
  var tabNormal = slotTex("128,128,255");
  tabNormal.repeat.set(1 / 1.3, 1 / 3.05);
  tabNormal.offset.set(0.65 / 1.3, 0.9 / 3.05);
  later(function () { fill(tabNormal, (function () {
    var W = 256, H = 640, sx = W / 1.3, sy = H / 3.05;
    function T(x, y) { return [(x + 0.65) * sx, H - (y + 0.9) * sy]; }
    var hc = makeCanvas(W, H), g = hc.getContext("2d", RF);
    g.fillStyle = "rgb(110,110,110)"; g.fillRect(0, 0, W, H);
    function outline(inset) {
      var w = 0.6 - inset, L = 2.1 - inset, rr = 0.55 - inset * 0.5;
      g.beginPath();
      var a = T(-w, -0.5); g.moveTo(a[0], a[1]);
      a = T(-w, L - rr); g.lineTo(a[0], a[1]);
      var c1 = T(-w, L), e1 = T(-w + rr, L); g.quadraticCurveTo(c1[0], c1[1], e1[0], e1[1]);
      a = T(w - rr, L); g.lineTo(a[0], a[1]);
      var c2 = T(w, L), e2 = T(w, L - rr); g.quadraticCurveTo(c2[0], c2[1], e2[0], e2[1]);
      a = T(w, -0.5); g.lineTo(a[0], a[1]);
      var c3 = T(w, -0.82 + inset), e3 = T(0, -0.84 + inset); g.quadraticCurveTo(c3[0], c3[1], e3[0], e3[1]);
      var c4 = T(-w, -0.82 + inset), e4 = T(-w, -0.5); g.quadraticCurveTo(c4[0], c4[1], e4[0], e4[1]);
    }
    g.save(); g.shadowColor = "#fff"; g.shadowBlur = 6;
    outline(0.1); g.strokeStyle = "rgb(235,235,235)"; g.lineWidth = 0.07 * sx; g.stroke();
    var f = T(0, 1.38);
    g.beginPath(); g.ellipse(f[0], f[1], 0.46 * sx, 0.56 * sy, 0, 0, TAU); g.lineWidth = 0.06 * sx; g.stroke();
    var r1 = T(0, 0.75), r2 = T(0, 0.9);
    g.beginPath(); g.moveTo(r1[0], r1[1]); g.lineTo(r2[0], r2[1]); g.lineWidth = 0.08 * sx; g.lineCap = "round"; g.stroke();
    g.restore();
    return heightToNormal(hc, 5);
  })()); });
  var tabMat = new THREE.MeshPhysicalMaterial({
    color: 0xc2c6cc, metalness: 1, roughness: 0.24, envMapIntensity: 1.3,
    normalMap: tabNormal, normalScale: new THREE.Vector2(1, 1),
    clearcoat: 0.3, clearcoatRoughness: 0.2, side: THREE.DoubleSide
  });

  var cache = {};
  function flavourTextures(i, name) {
    var key = i + "|" + (name || "");
    if (cache[key]) return cache[key];
    var f = FL[i];
    var pair = { map: tex(paintLabel(f, name, "color"), true), metal: tex(paintLabel(f, name, "metal"), false) };
    if (name) {
      Object.keys(cache).forEach(function (k) {
        if (k.indexOf(i + "|") === 0 && k !== i + "|" && k !== key) { cache[k].map.dispose(); cache[k].metal.dispose(); delete cache[k]; }
      });
    }
    cache[key] = pair;
    return pair;
  }

  // ---------- assemble ----------
  var can = new THREE.Group();
  var body = new THREE.Group();
  body.position.y = -CAN_TOP / 2;
  can.add(body);
  scene.add(can);

  var wallGeo = new THREE.LatheGeometry(wallPts, 256);
  (function uvByHeight() {
    var p = wallGeo.attributes.position, uv = wallGeo.attributes.uv;
    for (var i = 0; i < p.count; i++) uv.setY(i, p.getY(i) / CAN_TOP);
    uv.needsUpdate = true;
  })();
  body.add(new THREE.Mesh(wallGeo, bodyMat));

  // ---------- base dome: its own satin finish, stamped ring and the ink-jet batch code ----------
  var DOME_R = 2.47;
  var domeMaps = { normal: slotTex("128,128,255"), rough: slotTex("60,60,60"), color: slotTex("255,255,255", true) };
  later(function () { var made = (function () {
    var S = 1024, k = S / (2 * DOME_R), c = S / 2;
    var hc = makeCanvas(S, S), h = hc.getContext("2d", RF);
    var rc = makeCanvas(S, S), r = rc.getContext("2d");
    var cc = makeCanvas(S, S), o = cc.getContext("2d");
    h.fillStyle = "rgb(128,128,128)"; h.fillRect(0, 0, S, S);
    var rg = r.createRadialGradient(c, c, 0, c, c, DOME_R * k);
    rg.addColorStop(0, "rgb(48,48,48)"); rg.addColorStop(1, "rgb(70,70,70)");
    r.fillStyle = rg; r.fillRect(0, 0, S, S);
    wear(r, S, S, 260, k * 0.5);
    for (var rr = 0.05; rr < DOME_R; rr += 0.007) {
      var g = 125 + rnd() * 6;
      h.strokeStyle = "rgb(" + g + "," + g + "," + g + ")"; h.lineWidth = 1;
      h.beginPath(); h.arc(c, c, rr * k, 0, TAU); h.stroke();
    }
    // ambient occlusion: darker toward the foot and in the reinforcing step
    o.fillStyle = "#fff"; o.fillRect(0, 0, S, S);
    var ao = o.createRadialGradient(c, c, 1.5 * k, c, c, DOME_R * k);
    ao.addColorStop(0, "rgba(0,0,0,0)"); ao.addColorStop(0.35, "rgba(0,0,0,.18)"); ao.addColorStop(0.5, "rgba(0,0,0,.06)");
    ao.addColorStop(0.92, "rgba(0,0,0,.2)"); ao.addColorStop(1, "rgba(0,0,0,.45)");
    o.fillStyle = ao; o.fillRect(0, 0, S, S);
    // debossed recycling ring around the centre
    h.save(); h.translate(c, c);
    h.font = "800 " + Math.round(0.12 * k) + "px Arial, Helvetica, sans-serif";
    h.fillStyle = "rgb(88,88,88)"; h.textAlign = "center"; h.textBaseline = "middle";
    var ring = "RECYCLE  ·  ALUMINIUM  ·  RECYCLE  ·  ALUMINIUM  ·  ";
    for (var i = 0; i < ring.length; i++) {
      h.save(); h.rotate((i / ring.length) * TAU); h.translate(0, -1.2 * k); h.fillText(ring[i], 0, 0); h.restore();
    }
    h.restore();
    h.strokeStyle = "rgb(165,165,165)"; h.lineWidth = 0.035 * k;
    h.beginPath(); h.arc(c, c, 0.98 * k, 0, TAU); h.stroke();
    // ink-jet date code: rendered small, then re-drawn dot by dot like a real printer
    var lines = ["BB 08 27  L4", "2617 12:45"];
    var tc = makeCanvas(150, 40), t = tc.getContext("2d", RF);
    t.fillStyle = "#000"; t.font = "700 15px monospace"; t.textBaseline = "top";
    t.fillText(lines[0], 2, 2); t.fillText(lines[1], 2, 21);
    var px = t.getImageData(0, 0, 150, 40).data, dot = 0.0105 * k, step = dot * 2.1;
    var ox = c - 75 * step / 2, oy = c - 20 * step / 2;
    o.fillStyle = "rgba(28,28,30,.82)";
    for (var y = 0; y < 40; y += 1) for (var x = 0; x < 150; x += 1) {
      if (px[(y * 150 + x) * 4 + 3] > 120 && (x + y) % 2 === 0) {
        o.beginPath(); o.arc(ox + x * step / 2, oy + y * step / 2, dot, 0, TAU); o.fill();
      }
    }
    return { normal: heightToNormal(hc, 3.5), rough: rc, color: cc };
  })();
  fill(domeMaps.normal, made.normal); fill(domeMaps.rough, made.rough); fill(domeMaps.color, made.color);
  });
  var domeMat = new THREE.MeshPhysicalMaterial({
    color: 0xcdd0d5, map: domeMaps.color, metalness: 1, roughness: 1, roughnessMap: domeMaps.rough,
    normalMap: domeMaps.normal, normalScale: new THREE.Vector2(0.8, 0.8),
    envMapIntensity: 1.25, side: THREE.DoubleSide
  });
  var domeGeo = new THREE.LatheGeometry(
    new THREE.CatmullRomCurve3(domeCtrl, false, "centripetal").getSpacedPoints(140)
      .map(function (p) { return new THREE.Vector2(Math.max(0, p.x), p.y); }), 192);
  (function planarUV() {
    var p = domeGeo.attributes.position, uv = domeGeo.attributes.uv;
    for (var i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * DOME_R) + 0.5, 0.5 + p.getZ(i) / (2 * DOME_R));
    uv.needsUpdate = true;
  })();
  body.add(new THREE.Mesh(domeGeo, domeMat));
  var lidGeo = new THREE.LatheGeometry(lidPts, 192);
  (function planarUV() {
    var p = lidGeo.attributes.position, uv = lidGeo.attributes.uv;
    for (var i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * LID_R) + 0.5, 0.5 - p.getZ(i) / (2 * LID_R));
    uv.needsUpdate = true;
  })();
  body.add(new THREE.Mesh(lidGeo, lidMat));

  // lid parts face the front label
  var lidParts = new THREE.Group();
  lidParts.rotation.y = Math.PI;
  body.add(lidParts);

  // the countersink channel sits in shadow on a real can: a soft dark ring at its floor
  var channel = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.05, 12, 160),
    new THREE.MeshStandardMaterial({ color: 0x3a3d41, metalness: 0.9, roughness: 0.55 })
  );
  channel.rotation.x = Math.PI / 2;
  channel.position.y = 10.99;
  body.add(channel);

  // domed rivet with its stamped dimple
  var rivet = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.21, 0), new THREE.Vector2(0.2, 0.035), new THREE.Vector2(0.16, 0.07),
    new THREE.Vector2(0.09, 0.088), new THREE.Vector2(0.05, 0.08), new THREE.Vector2(0, 0.074)
  ], 48), rimMat);
  rivet.position.y = LID_Y;
  lidParts.add(rivet);

  var tabShape = new THREE.Shape();
  (function () {
    var w = 0.6, L = 2.1, r = 0.55;
    tabShape.moveTo(-w, -0.5);
    tabShape.lineTo(-w, L - r);
    tabShape.quadraticCurveTo(-w, L, -w + r, L);
    tabShape.lineTo(w - r, L);
    tabShape.quadraticCurveTo(w, L, w, L - r);
    tabShape.lineTo(w, -0.5);
    tabShape.quadraticCurveTo(w, -0.82, 0, -0.84);
    tabShape.quadraticCurveTo(-w, -0.82, -w, -0.5);
    var finger = new THREE.Path();
    finger.absellipse(0, 1.38, 0.36, 0.46, 0, TAU, true);
    tabShape.holes.push(finger);
    var slot = new THREE.Path();
    slot.moveTo(-0.22, 0.12); slot.quadraticCurveTo(0, 0.62, 0.22, 0.12);
    slot.quadraticCurveTo(0, 0.4, -0.22, 0.12);
    tabShape.holes.push(slot);
  })();
  var tabGeo = new THREE.ExtrudeGeometry(tabShape, {
    depth: 0.02, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.035, bevelSegments: 4, curveSegments: 40
  });
  tabGeo.rotateX(-Math.PI / 2);
  // real tabs are pressed with a gentle bow along their length
  (function bow() {
    var p = tabGeo.attributes.position;
    for (var i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.035 * Math.pow(p.getZ(i) / 2.1, 2));
    tabGeo.computeVertexNormals();
  })();
  var tabPivot = new THREE.Group();
  tabPivot.position.set(0, LID_Y + 0.07, 0);
  tabPivot.add(new THREE.Mesh(tabGeo, tabMat));
  lidParts.add(tabPivot);

  // the pour opening: dark gap that appears when the tab pushes the panel in, and stays open
  var holeShape = new THREE.Shape();
  (function () {
    var pts = [[0, 0.5], [-0.55, 0.62], [-0.98, 1.3], [-0.7, 2.0], [0, 2.18], [0.7, 2.0], [0.98, 1.3], [0.55, 0.62]]
      .map(function (p) { return [p[0] * 0.86, -(p[1] * 0.86 + 0.1)]; });
    var n = pts.length;
    function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    var m0 = mid(pts[n - 1], pts[0]);
    holeShape.moveTo(m0[0], m0[1]);
    for (var i = 0; i < n; i++) {
      var m = mid(pts[i], pts[(i + 1) % n]);
      holeShape.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
  })();
  var holeMat = new THREE.MeshBasicMaterial({ color: 0x060404, transparent: true, opacity: 0, depthWrite: false });
  var hole = new THREE.Mesh(new THREE.ShapeGeometry(holeShape, 32), holeMat);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = LID_Y + 0.004;
  hole.renderOrder = 1;
  lidParts.add(hole);
  var opened = false;

  // a cold puff of vapour that escapes on the crack
  var puffMat = new THREE.SpriteMaterial({
    map: (function () {
      var c = makeCanvas(128, 128), g = c.getContext("2d");
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(0.5, "rgba(255,255,255,.18)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })(),
    transparent: true, depthWrite: false, opacity: 0
  });
  var puff = new THREE.Sprite(puffMat);
  puff.visible = false;
  scene.add(puff);
  var puffT = -1, puffSrc = new THREE.Vector3();

  // ---------- fizz ----------
  var FIZZ = 320;
  var fizzPos = new Float32Array(FIZZ * 3), fizzVel = new Float32Array(FIZZ * 3), fizzLife = new Float32Array(FIZZ);
  var fizzGeo = new THREE.BufferGeometry();
  fizzGeo.setAttribute("position", new THREE.BufferAttribute(fizzPos, 3));
  var bubbleTex = (function () {
    var c = makeCanvas(64, 64), g = c.getContext("2d");
    var gr = g.createRadialGradient(32, 32, 10, 32, 32, 30);
    gr.addColorStop(0, "rgba(255,255,255,0.05)");
    gr.addColorStop(0.75, "rgba(255,255,255,0.35)");
    gr.addColorStop(0.92, "rgba(255,255,255,0.95)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.arc(23, 22, 5, 0, TAU); g.fill();
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  })();
  var fizz = new THREE.Points(fizzGeo, new THREE.PointsMaterial({ size: 0.13, map: bubbleTex, transparent: true, depthWrite: false, opacity: 0.6 }));
  fizz.frustumCulled = false;
  scene.add(fizz);
  for (var k = 0; k < FIZZ; k++) { fizzLife[k] = 0; fizzPos[k * 3 + 1] = -999; }

  var fizzLevel = 0, fizzAcc = 0, fizzCursor = 0;
  var topWorld = new THREE.Vector3();
  function spawn(n) {
    topWorld.set(0, CAN_TOP / 2 + 0.1, 0);
    can.localToWorld(topWorld);
    var s = can.scale.x;
    for (var i = 0; i < n; i++) {
      var j = fizzCursor; fizzCursor = (fizzCursor + 1) % FIZZ;
      var a = rnd() * TAU, r = (0.3 + rnd() * 0.9) * s;
      fizzPos[j * 3] = topWorld.x + Math.cos(a) * r;
      fizzPos[j * 3 + 1] = topWorld.y + rnd() * 0.3;
      fizzPos[j * 3 + 2] = topWorld.z + Math.sin(a) * r;
      fizzVel[j * 3] = Math.cos(a) * (0.2 + rnd() * 0.6);
      fizzVel[j * 3 + 1] = 1.6 + rnd() * 3;
      fizzVel[j * 3 + 2] = Math.sin(a) * (0.2 + rnd() * 0.6);
      fizzLife[j] = 0.5 + rnd() * 0.8;
    }
  }
  function stepFizz(dt) {
    fizzAcc += fizzLevel * 140 * dt;
    if (fizzAcc >= 1) { spawn(Math.floor(fizzAcc)); fizzAcc -= Math.floor(fizzAcc); }
    for (var i = 0; i < FIZZ; i++) {
      if (fizzLife[i] <= 0) continue;
      fizzLife[i] -= dt;
      var w = Math.sin((fizzLife[i] + i) * 9) * 0.6;
      fizzPos[i * 3] += (fizzVel[i * 3] + w) * dt;
      fizzPos[i * 3 + 1] += fizzVel[i * 3 + 1] * dt;
      fizzPos[i * 3 + 2] += fizzVel[i * 3 + 2] * dt;
      fizzVel[i * 3 + 1] *= 0.995;
      if (fizzLife[i] <= 0) fizzPos[i * 3 + 1] = -999;
    }
    fizzGeo.attributes.position.needsUpdate = true;
  }

  // soft contact shadow on an implied floor; breathes with the float
  var shadowMat = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, toneMapped: false, color: 0x000000,
    map: (function () {
      var c = makeCanvas(256, 64), g = c.getContext("2d");
      var gr = g.createRadialGradient(128, 32, 0, 128, 32, 128);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.setTransform(1, 0, 0, 0.25, 0, 24); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })(),
    alphaMap: null
  });
  shadowMat.alphaMap = shadowMat.map;
  var shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.25), shadowMat);
  shadow.renderOrder = -1;
  scene.add(shadow);
  var shadowOn = 1, shadowT = 1;

  // a soft key and rim so the silhouette separates from drenched backgrounds
  var key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(-8, 10, 12);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0xfff1ea, 0.5);
  rim.position.set(10, 4, -10);
  scene.add(rim);

  // ---------- state ----------
  var state = { flavour: 0, name: "" };
  var pose = { x: 0, y: 0, s: 1, rx: 0, ry: 0, rz: 0 };
  var target = { x: 0, y: 0, s: 1, rx: 0, ry: 0, rz: 0 };
  var wet = 0.6, wetTarget = 0.6;
  var tabT = 0, tabTarget = 0;
  var paused = false;

  var compiled = false;
  function applyFlavour() {
    var t = flavourTextures(state.flavour, state.name);
    bodyMat.map = t.map;
    bodyMat.metalnessMap = t.metal;
    if (!compiled) { bodyMat.needsUpdate = true; compiled = true; }
    rebuildEnv(FL[state.flavour].bg);
  }

  // paint, upload and prefilter every flavour during idle time so scrolling never stalls
  function warmUp() {
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 120); };
    fizz.visible = true; shadow.visible = true;
    idle(function () { renderer.compile(scene, camera); });
    FL.forEach(function (f, i) {
      idle(function () {
        var t = flavourTextures(i, i === state.flavour ? state.name : "");
        if (renderer.initTexture) { renderer.initTexture(t.map); renderer.initTexture(t.metal); }
        envFor(f.bg);
      });
    });
  }

  // adaptive resolution: if frames run long, render fewer pixels instead of dropping frames
  var dprMax = Math.min(window.devicePixelRatio || 1, 2), dprNow = dprMax, slow = 0, fast = 0;
  function adaptDpr(dt) {
    if (dt > 0.022) { slow++; fast = 0; } else if (dt < 0.0135) { fast++; slow = 0; }
    if (slow > 20 && dprNow > 1) { dprNow = Math.max(1, dprNow - 0.25); renderer.setPixelRatio(dprNow); slow = 0; }
    if (fast > 240 && dprNow < dprMax) { dprNow = Math.min(dprMax, dprNow + 0.25); renderer.setPixelRatio(dprNow); fast = 0; }
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  function halfExtents() {
    var hh = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    return { w: hh * camera.aspect, h: hh };
  }

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (paused || document.hidden) { clock.getDelta(); return; }
    var raw = clock.getDelta();
    adaptDpr(raw);
    var dt = Math.min(raw, 0.05);
    var t = clock.elapsedTime;
    var k = 1 - Math.pow(0.0008, dt);
    Object.keys(pose).forEach(function (p) { pose[p] += (target[p] - pose[p]) * k; });
    wet += (wetTarget - wet) * k;
    tabT += (tabTarget - tabT) * (1 - Math.pow(0.002, dt));

    var ext = halfExtents();
    var fit = camera.aspect < 0.8 ? Math.max(0.62, camera.aspect / 0.8) : 1;
    var bob = reduced ? 0 : Math.sin(t * 1.15) * 0.14;
    can.position.set(pose.x * ext.w, pose.y * ext.h + bob, 0);
    can.scale.setScalar(pose.s * fit);
    can.rotation.set(pose.rx, Math.PI + pose.ry, pose.rz + (reduced ? 0 : Math.sin(t * 0.7) * 0.012));

    shadowT += (shadowOn - shadowT) * k;
    var s = pose.s * fit;
    var tilt = Math.min(1, Math.abs(pose.rz) * 3 + Math.abs(pose.rx) * 1.2);
    var floorY = pose.y * ext.h - (CAN_TOP / 2) * s * Math.cos(pose.rx) * Math.cos(pose.rz) - 0.45 * s;
    shadow.position.set(pose.x * ext.w - Math.sin(pose.rz) * (CAN_TOP / 2) * s * 0.6, floorY, -1);
    shadow.scale.set(7.5 * s * (1 - bob * 0.3), 7.5 * s * (1 - bob * 0.3), 1);
    shadowMat.opacity = shadowT * (0.4 - bob * 0.6) * (1 - tilt * 0.6);
    shadow.visible = shadowMat.opacity > 0.01;

    // colder = more beads and a frosted haze between them
    var ns = 0.45 + wet * 0.75;
    bodyMat.normalScale.set(ns, ns);
    bodyMat.clearcoatNormalScale.set(ns, ns);
    bodyMat.roughness = 0.85 + wet * 0.3;
    bodyMat.clearcoatRoughness = 0.03 + wet * 0.06;
    tabPivot.rotation.x = tabT * 0.3;

    // once cracked the can stays open until we scroll back to the sealed hero
    if (tabT > 0.55) opened = true;
    if (tabTarget === 0 && tabT < 0.05) opened = false;
    holeMat.opacity = (opened ? 1 : Math.max(0, Math.min(1, (tabT - 0.3) / 0.3))) * 0.93;
    hole.visible = holeMat.opacity > 0.01;

    if (puffT >= 0) {
      puffT += dt;
      var life = puffT / 1.5;
      if (life >= 1) { puffT = -1; puff.visible = false; }
      else {
        puffSrc.set(0, LID_Y, 1.3);
        lidParts.localToWorld(puffSrc);
        var ps = can.scale.x;
        puff.position.set(puffSrc.x + life * 0.6 * ps, puffSrc.y + life * 3.2 * ps, puffSrc.z + 0.4);
        puff.scale.setScalar((1.2 + life * 5) * ps);
        puffMat.opacity = Math.sin(Math.min(1, life * 3) * Math.PI / 2) * (1 - life) * 0.85;
      }
    }

    stepFizz(dt);
    renderer.render(scene, camera);
  }

  function clamp01(n) { return Math.max(0, Math.min(1, n)); }

  window.CanScene = {
    live: true,
    ready: null,
    setFlavour: function (i) {
      i = ((i % FL.length) + FL.length) % FL.length;
      if (i === state.flavour) return;
      state.flavour = i; applyFlavour();
    },
    setName: function (n) {
      n = String(n || "").replace(/[^A-Za-zÀ-ɏ '\-]/g, "").slice(0, 12).trim();
      if (n === state.name) return;
      state.name = n; applyFlavour();
    },
    setPose: function (p, immediate) {
      Object.keys(p).forEach(function (key) { if (key in target) target[key] = p[key]; });
      if (immediate) Object.keys(target).forEach(function (key) { pose[key] = target[key]; });
    },
    setWet: function (n) { wetTarget = clamp01(n); },
    setFizz: function (n) { fizzLevel = clamp01(n); },
    burst: function (n) {
      spawn(n || 140);
      if (!reduced) { puffT = 0; puff.visible = true; }
    },
    setTab: function (n) { tabTarget = clamp01(n); },
    setShadow: function (n) { shadowOn = clamp01(n); },
    pause: function (b) { paused = !!b; }
  };

  // paint the label once, after the fonts arrive (or 1.5 s, whichever is first); the can waits hidden till then
  can.visible = false;
  rebuildEnv(FL[state.flavour].bg);
  loadHDR();
  requestAnimationFrame(frame);
  setTimeout(pump, 60);

  var fontsWanted = ["400 80px Yellowtail", "900 80px Archivo", "800 80px Archivo", "500 20px 'JetBrains Mono'"];
  var fontsReady = document.fonts && document.fonts.load
    ? Promise.all(fontsWanted.map(function (f) { return document.fonts.load(f); }))
    : Promise.resolve();
  var timeout = new Promise(function (r) { setTimeout(r, 1500); });
  function reveal() {
    applyFlavour();
    can.visible = true;
    html.classList.add("can-ready");
    warmUp();
    return true;
  }
  window.CanScene.ready = Promise.race([fontsReady, timeout]).then(reveal, reveal);
})();
