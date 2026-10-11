/* =============================================================================
   The nave — a small WebGL renderer for the church interior behind the page.
   World units are metres. The camera stands at eye height in the aisle; its
   position, turn (yaw), the light level and the candles are all set from
   outside by journey.js, once per frame, from the same scroll value that
   moves every card. Nave.project() places page elements in the same space.

   Everything is textured quads in true perspective (floor, walls, piers,
   arches, pews), drawn far to near, plus additive light (window
   beams, candle glows, dust). One draw loop, GPU only — no layout work.
   Falls back to a still image when WebGL is unavailable.
   ========================================================================== */
(function () {
  "use strict";

  var M = {
    bay: 3.0, firstPier: 3.0, piers: 8,   // pier pairs every 3 m from z = 3 (the last frames the sanctuary)
    pierX: 2.4, wallX: 2.65, aisleX: 5.6, // pier centres, nave walls, side-aisle walls
    eye: 1.6,
    pewFrom: 1.8, pewTo: 19.8, pewIn: .82, pewOut: 1.86,
    coupleZ: 23.6, altarZ: 26.2, endDist: 4.3,
  };
  var VS = [
    "attribute vec2 aQ;",
    "uniform vec3 uO, uU, uV, uCam;",
    "uniform vec4 uUV, uProj; uniform vec2 uYaw;",
    "varying vec2 vUV; varying float vD;",
    "void main(){",
    "  vec3 w = uO + aQ.x * uU + aQ.y * uV - uCam;",
    "  vec3 v = vec3(w.x * uYaw.x - w.z * uYaw.y, w.y, w.x * uYaw.y + w.z * uYaw.x);",
    "  vUV = vec2(mix(uUV.x, uUV.z, aQ.x), mix(uUV.w, uUV.y, aQ.y));",
    "  vD = length(v);",
    "  gl_Position = vec4(v.x * uProj.x + uProj.z * v.z, v.y * uProj.y + uProj.w * v.z, v.z - .2, v.z);",
    "}"].join("\n");
  var FS = [
    "precision mediump float;",
    "uniform sampler2D uT; uniform vec4 uTint; uniform float uFog, uCut, uExpo;",
    "varying vec2 vUV; varying float vD;",
    "void main(){",
    "  vec4 c = texture2D(uT, vUV) * uTint;",
    "  if (c.a < uCut) discard;",
    "  gl_FragColor = vec4(c.rgb * exp(-vD * uFog) * uExpo, c.a);",
    "}"].join("\n");
  var VS_P = [
    "attribute vec4 aP;",
    "uniform vec3 uCam; uniform vec4 uProj; uniform float uPx, uExpo; uniform vec2 uYaw;",
    "varying float vB;",
    "void main(){",
    "  vec3 w = aP.xyz - uCam;",
    "  vec3 v = vec3(w.x * uYaw.x - w.z * uYaw.y, w.y, w.x * uYaw.y + w.z * uYaw.x);",
    "  gl_Position = vec4(v.x * uProj.x + uProj.z * v.z, v.y * uProj.y + uProj.w * v.z, v.z - .2, v.z);",
    "  gl_PointSize = clamp(uPx * .024 / max(v.z, .1), 1.5, 16.0);",
    "  vB = aP.w * uExpo * clamp(v.z - .4, 0., 1.) * exp(-v.z * .09);",
    "}"].join("\n");
  var FS_P = [
    "precision mediump float;",
    "varying float vB;",
    "void main(){",
    "  float d = length(gl_PointCoord - .5) * 2.;",
    "  float a = smoothstep(1., .1, d) * vB;",
    "  gl_FragColor = vec4(vec3(1., .8, .52) * a, 0.);",
    "}"].join("\n");

  var gl, canvas, prog, progP, U = {}, UP = {}, quadBuf, moteBuf, tex = {}, ready = false;
  var W = 0, H = 0, dpr = 1, k = 1, hz = 0, CW = 0;   // CW: page width in CSS px, kept from the last resize
  var solids = [], lights = [], motes, moteData, NM = 70;
  // P: what journey.js asks for each frame
  var P = { camZ: 0, yaw: 0, expo: 1, ignite: 1, win: 1, bloom: 0 };
  var opts = {}, dirty = true, slowFrames = 0, host, lastDraw = 0, lastKey = "", acc = 0, accN = 0;

  /* ------------------------------------------------------------- setup */
  function compile(vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  var aniso = null;
  function texture(src, repeat) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    var o = { t: t, ok: false };
    function upload(img) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      var wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      o.ok = true; dirty = true;
    }
    if (typeof src === "string") {
      var img = new Image();
      img.decoding = "async";
      img.onload = function () { upload(img); };
      afterHero(function () { img.src = src; });
    } else upload(src);
    return o;
  }
  // the church's pictures download after the opening photo, so they don't
  // compete with it on a slow connection (the church appears seconds later)
  var heroWait = null;
  function afterHero(fn) {
    if (!heroWait) {
      heroWait = [];
      var go = function () { if (!Array.isArray(heroWait)) return; var q = heroWait; heroWait = { push: function (f) { f(); } }; q.forEach(function (f) { f(); }); };
      var hero = document.querySelector(".hero__photo");
      if (!hero || hero.complete) setTimeout(go, 0);
      else { hero.addEventListener("load", go); hero.addEventListener("error", go); setTimeout(go, 2500); }
    }
    heroWait.push(fn);
  }
  // procedural sprites (no download): soft glow, light beam, candle flame
  function sprite(w, h, draw) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    return c;
  }
  function makeSprites() {
    tex.white = texture(sprite(4, 4, function (x) { x.fillStyle = "#fff"; x.fillRect(0, 0, 4, 4); }));
    tex.glow = texture(sprite(128, 128, function (x, w) {
      var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.18, "rgba(255,255,255,.55)");
      g.addColorStop(.5, "rgba(255,255,255,.14)"); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    }));
    tex.beam = texture(sprite(64, 256, function (x, w, h) {
      var img = x.createImageData(w, h), d = img.data;
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var u = i / (w - 1), v = j / (h - 1);
        var across = Math.pow(Math.sin(Math.PI * u), 1.6);
        var along = Math.pow(1 - v, 1.3) * Math.min(1, v * 12 + .25);
        var streak = .75 + .25 * Math.sin(u * 37.0 + Math.sin(u * 13.0) * 2);
        var a = across * along * streak;
        var o = (j * w + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(a * 255);
      }
      x.putImageData(img, 0, 0);
    }));
    tex.flame = texture(sprite(64, 128, function (x, w, h) {
      var g = x.createRadialGradient(32, 92, 2, 32, 80, 40);
      g.addColorStop(0, "rgba(255,250,235,1)"); g.addColorStop(.35, "rgba(255,214,140,.95)");
      g.addColorStop(.7, "rgba(255,150,60,.35)"); g.addColorStop(1, "rgba(255,120,40,0)");
      x.fillStyle = g;
      x.beginPath(); x.moveTo(32, 6); x.bezierCurveTo(46, 50, 52, 80, 32, 118); x.bezierCurveTo(12, 80, 18, 50, 32, 6); x.fill();
    }));
  }

  /* ---------------------------------------------------------- the scene */
  // a quad: origin O, edge vectors Ux (u direction) and Vy (v direction, "up")
  function Q(t, O, Ux, Vy, uv, tint, o) {
    o = o || {};
    return { t: t, O: O, U: Ux, V: Vy, uv: uv || [0, 0, 1, 1], tint: tint || [1, 1, 1, 1], fog: o.fog != null ? o.fog : .055, cut: o.cut || 0,
      z: o.z != null ? o.z : O[2], x0: o.x0, x1: o.x1, top: o.top, flick: o.flick, add: o.add };
  }
  function grey(v, a) { a = a == null ? 1 : a; return [v * a, v * a, v * a, a]; }
  function rgba(r, g, b, a) { return [r * a, g * a, b * a, a]; }

  function build() {
    var L = M.altarZ + 3, z0 = -3, uz = function (z) { return (z - M.firstPier) / M.bay; };
    var planes = [];
    // floor and carpet
    planes.push(Q(tex.floor, [-8, 0, z0], [16, 0, 0], [0, 0, L], [0, 0, 16 / 1.8, L / 1.8], grey(.95), { cut: .5 }));
    planes.push(Q(tex.carpet, [-.75, .004, z0], [1.5, 0, 0], [0, 0, M.coupleZ + .5 - z0], [0, 0, 1, (M.coupleZ + .5 - z0) / 3], grey(1), { cut: .5 }));
    [-1, 1].forEach(function (s) {
      // side-aisle outer wall with its windows, and the aisle's low ceiling
      planes.push(Q(tex.aisle, [s * M.aisleX, 0, z0], [0, 0, L], [0, 5.6, 0], [uz(z0), 0, uz(z0 + L), 1], grey(1), { cut: .5 }));
      planes.push(Q(tex.white, [s * M.wallX, 5.6, z0], [s * (M.aisleX - M.wallX), 0, 0], [0, 0, L], null, grey(.02), { cut: .5 }));
      // the nave wall: arcade openings, triforium and clerestory windows
      planes.push(Q(tex.wall, [s * M.wallX, 0, z0], [0, 0, L], [0, 9.4, 0], [uz(z0), 0, uz(z0 + L), 1], grey(1), { cut: .5 }));
    });
    // east wall around the altar, then the altar (rose window, lancets, candles)
    planes.push(Q(tex.white, [-M.wallX, 0, M.altarZ + .02], [2 * M.wallX, 0, 0], [0, 9.4, 0], null, grey(.015), { cut: .5 }));
    planes.push(Q(tex.altar, [-M.wallX, -.36 * 11.05, M.altarZ], [2 * M.wallX, 0, 0], [0, 11.05, 0], null, grey(1), { fog: .012, cut: .5 }));
    solids = planes;

    // depth-sorted things (piers, arches, pews, candles), drawn far to near
    var items = [];
    for (var i = 0; i < M.piers; i++) {
      var z = M.firstPier + i * M.bay;
      [-1, 1].forEach(function (s) {
        // texture is lit from the left (for the right-hand row); mirror for the left row
        items.push(Q(tex.pier, [s * M.pierX - .5, 0, z], [1, 0, 0], [0, 5.0, 0], s < 0 ? [1, 0, 0, 1] : [0, 0, 1, 1], grey(1), { cut: .02, x0: s * M.pierX - .5, x1: s * M.pierX + .5, top: 5 }));
        // candle sconce on the aisle face of each pier
        var sx = s * (M.pierX - .52), sz = z - .3;
        items.push(Q(tex.white, [sx - .015, 2.02, sz], [.03, 0, 0], [0, .16, 0], null, rgba(.85, .78, .62, 1), { cut: .5, x0: sx, x1: sx, top: 2.2 }));
        items.push(Q(tex.white, [sx - .06, 1.98, sz + .01], [.12, 0, 0], [0, .04, 0], null, grey(.06), { cut: .5, x0: sx, x1: sx, top: 2.1 }));
        lights.push({ kind: "flame", p: [sx, 2.235, sz - .01], s: .07, c: [1, .9, .7], a: .95, ph: Math.random() * 9, candle: sz });
        lights.push({ kind: "glow", p: [sx, 2.24, sz - .02], s: 1.6, c: [1, .62, .3], a: .22, ph: Math.random() * 9, candle: sz });
        lights.push({ kind: "pool", p: [sx * .7, 0, sz - .4], s: 2.2, c: [1, .6, .3], a: .09, ph: Math.random() * 9, candle: sz });
      });
      items.push(Q(tex.arch, [-2.95, 4.95, z + .02], [5.9, 0, 0], [0, 4.5, 0], null, grey(1), { cut: .02, x0: -2.95, x1: 2.95, top: 9.45 }));
      // god-rays from the left clerestory, falling across the nave to the right
      var zc = z + M.bay / 2;
      var D = [.55, -1, .16], len = 8.6;
      [-.3, .3].forEach(function (dz, j) {
        lights.push({ kind: "beam", O: [-M.wallX, 7.95, zc + dz], U: [0, 1.3, 0], V: [D[0] * len, D[1] * len, D[2] * len], c: [1, .8, .5], a: j ? .075 : .1 });
      });
      // lower beams from the side-aisle windows through the arcade, onto the aisle
      var D2 = [1, -.78, .22], len2 = 6.2;
      lights.push({ kind: "beam", O: [-M.aisleX, 2.0, zc], U: [0, 2.8, 0], V: [D2[0] * len2, D2[1] * len2, D2[2] * len2], c: [1, .78, .46], a: .11 });
      lights.push({ kind: "pool", p: [-.1, 0, zc + 1.3], s: 2.4, c: [1, .74, .42], a: .16, ph: 0, still: true });
    }
    // pews: backs (facing the altar, we see them from behind) and carved ends on the aisle
    for (var r = M.pewFrom; r <= M.pewTo + .01; r += 1) {
      [-1, 1].forEach(function (s) {
        var xa = s < 0 ? -M.pewOut : M.pewIn, w = M.pewOut - M.pewIn;
        items.push(Q(tex.pew, [xa, 0, r], [w, 0, 0], [0, 1.0, 0], [0, 0, w / 1.4, 1], grey(1), { cut: .5, x0: xa, x1: xa + w, top: 1 }));
        items.push(Q(tex.pewend, [s * M.pewIn, 0, r + .6], [0, 0, -.6], [0, 1.12, 0], null, grey(1), { cut: .5, z: r + .3, x0: s * M.pewIn, x1: s * M.pewIn, top: 1.12 }));
      });
    }
    // two tall candle stands before the altar
    [-1, 1].forEach(function (s) {
      var x = s * 1.32, z = M.coupleZ + .9;
      items.push(Q(tex.white, [x - .02, 0, z], [.04, 0, 0], [0, 1.32, 0], null, grey(.045), { cut: .5, x0: x, x1: x, top: 1.4 }));
      items.push(Q(tex.white, [x - .13, 0, z], [.26, 0, 0], [0, .06, 0], null, grey(.05), { cut: .5, x0: x, x1: x, top: .1 }));
      items.push(Q(tex.white, [x - .1, 1.31, z], [.2, 0, 0], [0, .03, 0], null, grey(.07), { cut: .5, x0: x, x1: x, top: 1.35 }));
      items.push(Q(tex.white, [x - .025, 1.34, z - .01], [.05, 0, 0], [0, .2, 0], null, rgba(.9, .84, .7, 1), { cut: .5, x0: x, x1: x, top: 1.55 }));
      lights.push({ kind: "flame", p: [x, 1.6, z - .02], s: .09, c: [1, .9, .7], a: 1, ph: Math.random() * 9, candle: z });
      lights.push({ kind: "glow", p: [x, 1.6, z - .03], s: 2.6, c: [1, .62, .3], a: .3, ph: Math.random() * 9, candle: z });
      lights.push({ kind: "pool", p: [x * .8, 0, z - .6], s: 3.4, c: [1, .6, .3], a: .12, ph: Math.random() * 9, candle: z });
    });
    // the sanctuary glows: a broad warm pool before the altar and a halo at the rose window
    lights.push({ kind: "pool", p: [0, 0, M.altarZ - 1.8], s: 7, c: [1, .7, .4], a: .16, ph: 0, still: true });
    lights.push({ kind: "glow", p: [0, 4.3, M.altarZ - .1], s: 7.5, c: [1, .66, .36], a: .12, ph: 0, still: true, fog: .01, rose: true });
    items.sort(function (a, b) { return b.z - a.z; });
    M.items = items;

    // dust: random points in a box ahead of the camera, wrapped as we walk
    moteData = new Float32Array(NM * 4);
    motes = [];
    for (var m = 0; m < NM; m++) motes.push({ x: (Math.random() * 2 - 1) * 2.4, y: .3 + Math.random() * 6, z: Math.random() * 14, ph: Math.random() * 6.28, sp: .4 + Math.random() * .6 });
  }

  /* ------------------------------------------------------------- render */
  function setQuad(o, tint, fog, cut) {
    gl.uniform3fv(U.O, o.O); gl.uniform3fv(U.U, o.U); gl.uniform3fv(U.V, o.V);
    gl.uniform4fv(U.UV, o.uv); gl.uniform4fv(U.Tint, tint); gl.uniform1f(U.Fog, fog); gl.uniform1f(U.Cut, cut);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  var boundTex = null;
  function bind(t) { if (boundTex !== t) { gl.bindTexture(gl.TEXTURE_2D, t.t); boundTex = t; } }
  function visible(o, cam) {
    var dz = o.z - cam;
    if (dz < .12) return false;
    if (o.x0 == null || Math.abs(P.yaw) > .005) return true;
    var s = k / dz, halfW = W / 2 / dpr;
    var a = o.x0 * s, b = o.x1 * s;
    if (Math.min(a, b) > halfW + 40 || Math.max(a, b) < -halfW - 40) return false;
    return true;
  }
  function flicker(l, t) {
    if (l.still) return 1;
    return 1 + .07 * Math.sin(t * 9.1 + l.ph) + .05 * Math.sin(t * 15.7 + l.ph * 2) + .04 * Math.sin(t * 27.3 + l.ph * 3);
  }

  function render(time) {
    var cam = P.camZ, cw = W / dpr, ch = H / dpr, yc = Math.cos(P.yaw), ys = Math.sin(P.yaw);
    var win = .3 + .7 * P.win;
    gl.viewport(0, 0, W, H);
    gl.clearColor(.022, .016, .013, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(U.aQ);
    gl.vertexAttribPointer(U.aQ, 2, gl.FLOAT, false, 0, 0);
    var proj = [2 * k / cw, 2 * k / ch, 0, 1 - 2 * hz / ch];
    gl.uniform3f(U.Cam, 0, M.eye, cam);
    gl.uniform4fv(U.Proj, proj);
    gl.uniform2f(U.Yaw, yc, ys);
    gl.uniform1f(U.Expo, P.expo);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    boundTex = null;

    // planes: floor, carpet, walls, altar
    for (var i = 0; i < 2; i++) { bind(solids[i].t); setQuad(solids[i], solids[i].tint, solids[i].fog, solids[i].cut); }
    for (i = 2; i < solids.length; i++) {
      var sq = solids[i], tint = sq.t === tex.altar ? [win, win, win, 1] : sq.tint;   // the windows wake last
      bind(sq.t); setQuad(sq, tint, sq.fog, sq.cut);
    }
    // depth-sorted billboards, far to near
    var items = M.items;
    for (i = 0; i < items.length; i++) {
      var o = items[i];
      if (!visible(o, cam)) continue;
      bind(o.t); setQuad(o, o.tint, o.fog, o.cut);
    }

    // light: additive, depth-tested so piers and pews occlude it
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform1f(U.Expo, 1);
    var tsec = time / 1000, reach = P.ignite * (M.altarZ + 2);
    for (i = 0; i < lights.length; i++) {
      var l = lights[i], f = flicker(l, tsec), lit;
      // candles light one by one down the aisle; daylight comes with the windows
      if (l.candle != null) lit = Math.min(1, Math.max(0, (reach - l.candle) / 1.6));
      else lit = P.win * P.expo;
      if (lit <= 0) continue;
      var a = l.a * f * lit;
      if (l.rose) a += P.bloom * 1.6;
      var col = [l.c[0] * a, l.c[1] * a, l.c[2] * a, 0];
      if (l.kind === "beam") {
        if (l.O[2] - cam < -6) continue;
        bind(tex.beam);
        setQuad({ O: l.O, U: l.U, V: l.V, uv: [0, 0, 1, 1] }, col, .03, 0);
        continue;
      }
      var p = l.p, s = l.s * (l.kind === "flame" ? (.92 + .1 * f) : 1) * (l.rose ? 1 + P.bloom * 2.2 : 1);
      if (p[2] - cam < .15) continue;
      if (l.kind === "pool") {
        bind(tex.glow);
        setQuad({ O: [p[0] - s / 2, .01, p[2] - s / 2], U: [s, 0, 0], V: [0, 0, s], uv: [0, 0, 1, 1] }, col, .04, 0);
      } else {
        bind(l.kind === "flame" ? tex.flame : tex.glow);
        var sw = l.kind === "flame" ? s * .55 : s;
        setQuad({ O: [p[0] - sw / 2, p[1] - s / 2, p[2]], U: [sw, 0, 0], V: [0, s, 0], uv: [0, 0, 1, 1] }, col, l.fog || .04, 0);
      }
    }
    // dust in the light
    gl.useProgram(progP);
    gl.uniform3f(UP.Cam, 0, M.eye, cam); gl.uniform4fv(UP.Proj, proj); gl.uniform1f(UP.Px, k * dpr);
    gl.uniform2f(UP.Yaw, yc, ys); gl.uniform1f(UP.Expo, P.expo * (.4 + .6 * P.win));
    for (i = 0; i < NM; i++) {
      var m = motes[i];
      var zz;
      zz = cam + .6 + (((m.z - cam) % 14) + 14) % 14;
      var yy = m.y + Math.sin(tsec * .23 * m.sp + m.ph) * .25, xx = m.x + Math.sin(tsec * .17 * m.sp + m.ph * 2) * .3;
      // brighter inside the clerestory beams (x grows as y falls)
      var bx = -M.wallX + .55 * (7.95 + .65 - yy);
      var inBeam = Math.exp(-Math.pow((xx - bx) / .7, 2));
      moteData[i * 4] = xx; moteData[i * 4 + 1] = yy; moteData[i * 4 + 2] = zz;
      moteData[i * 4 + 3] = (.22 + .9 * inBeam) * (.6 + .4 * Math.sin(tsec * 1.3 * m.sp + m.ph));
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, moteData);
    gl.enableVertexAttribArray(UP.aP);
    gl.vertexAttribPointer(UP.aP, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, NM);
    gl.disableVertexAttribArray(UP.aP);
    gl.depthMask(true);
  }

  /* --------------------------------------------------------- sizing */
  function resize() {
    var cw = host.clientWidth, ch = host.clientHeight;
    CW = cw;
    var want = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5);
    if (slowFrames > 2) want = Math.min(want, 1.1); else if (slowFrames > 0) want = Math.min(want, 1.3);
    dpr = want;
    W = Math.round(cw * dpr); H = Math.round(ch * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    // focal length: a portrait phone sees the aisle as a tall, narrow view
    k = Math.min(cw * 1.25, ch * .6);
    hz = ch * (cw < ch ? .375 : .42);
    dirty = true;
  }
  function viewSize() { return { w: host.clientWidth, h: host.clientHeight }; }

  // where a world point appears on screen (CSS px), for anchoring page elements
  function project(x, y, z) {
    var wx = x, wy = y - M.eye, wz = z - P.camZ, c = Math.cos(P.yaw), s = Math.sin(P.yaw);
    var vx = wx * c - wz * s, vz = wx * s + wz * c;
    if (vz < .05) return null;
    return { x: CW / 2 + vx * k / vz, y: hz - wy * k / vz, s: k / vz, dz: vz };
  }

  // draw one frame with the given camera/light state (called by journey.js)
  function draw(now, p) {
    if (!ready) return;
    for (var key in p) P[key] = p[key];
    var sig = [P.camZ.toFixed(4), P.yaw.toFixed(4), P.expo.toFixed(3), P.ignite.toFixed(3), P.win.toFixed(3), P.bloom.toFixed(3)].join();
    var moving = sig !== lastKey;
    lastKey = sig;
    // at rest only the candles and dust move: ~24 redraws a second is plenty
    if (!moving && !dirty && now - lastDraw < 40) return;
    // if the device struggles while moving, render fewer pixels
    if (moving && lastDraw) {
      acc += now - lastDraw; accN++;
      if (accN > 45) { if (acc / accN > 24 && slowFrames < 3) { slowFrames++; resize(); } acc = 0; accN = 0; }
    }
    lastDraw = now;
    dirty = false;
    render(now);
  }

  function init(el, o) {
    host = el; opts = o || {};
    canvas = document.createElement("canvas");
    canvas.className = "nave__gl";
    var ctxOpts = { alpha: false, antialias: (window.devicePixelRatio || 1) < 1.5, depth: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance" };
    try { gl = canvas.getContext("webgl", ctxOpts) || canvas.getContext("experimental-webgl", ctxOpts); } catch (e) { gl = null; }
    if (!gl) { host.classList.add("nave--still"); return false; }
    host.insertBefore(canvas, host.firstChild);
    try {
      prog = compile(VS, FS); progP = compile(VS_P, FS_P);
    } catch (e) { host.classList.add("nave--still"); canvas.remove(); return false; }
    ["aQ"].forEach(function (n) { U[n] = gl.getAttribLocation(prog, n); });
    ["O", "U", "V", "Cam", "UV", "Proj", "Tint", "Fog", "Cut", "T", "Yaw", "Expo"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, "u" + n); });
    UP.aP = gl.getAttribLocation(progP, "aP");
    ["Cam", "Proj", "Px", "Yaw", "Expo"].forEach(function (n) { UP[n] = gl.getUniformLocation(progP, "u" + n); });
    aniso = gl.getExtension("EXT_texture_filter_anisotropic") || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    moteBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, NM * 16, gl.DYNAMIC_DRAW);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    var A = opts.art || {}, base = "assets/images/nave/";
    tex.floor = texture(A.floor || base + "floor.webp", true);
    tex.carpet = texture(A.carpet || base + "carpet.webp", true);
    tex.wall = texture(A.wall || base + "wall.webp", true);
    tex.aisle = texture(A.aisle || base + "aisle.webp", true);
    tex.pier = texture(A.pier || base + "pier.webp");
    tex.arch = texture(A.arch || base + "arch.webp");
    tex.pew = texture(A.pew || base + "pew.webp", true);
    tex.pewend = texture(A.pewend || base + "pewend.webp");
    tex.altar = texture(A.altar || base + "altar.webp");
    makeSprites();
    build();
    resize();
    ready = true;
    var lastW = host.clientWidth, lastH = host.clientHeight;
    window.addEventListener("resize", function () {
      // ignore the small height changes of mobile browser bars
      if (host.clientWidth !== lastW || Math.abs(host.clientHeight - lastH) > 140) { lastW = host.clientWidth; lastH = host.clientHeight; resize(); }
    }, { passive: true });
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); ready = false; host.classList.add("nave--still"); });
    return true;
  }

  // without WebGL, project() still works so cards can be placed
  function initFallback(el) { host = el; CW = el.clientWidth; k = Math.min(el.clientWidth * 1.25, el.clientHeight * .6); hz = el.clientHeight * .375; }

  window.Nave = { init: init, draw: draw, project: project, M: M, P: P, initFallback: initFallback, isReady: function () { return ready; } };
})();
