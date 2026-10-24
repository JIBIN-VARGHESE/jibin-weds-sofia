/* =============================================================================
   The nave — a small WebGL renderer for the church interior behind the page.
   World units are metres; the aisle runs along +z towards the altar. The
   camera stands at eye height in the aisle; its position, turn (yaw), the
   light level and the candles are all set from outside by journey.js, once
   per frame, from the same value that moves every card. Nave.project()
   places page elements in the same space.

   The church is real geometry, generated here on load (nothing to download
   but this file): fluted columns with carved capitals, pointed arcades,
   clerestory and aisle windows of stained glass, a rib vault, pews, bronze
   chandeliers, lanterns, a stepped sanctuary with altar, reredos and a rose
   window. Surfaces are lit per pixel by the nearest candle lights plus soft
   daylight from the windows; stone, marble, wood and glass are painted into
   small textures at start-up. Light beams, glows, flames and dust are added
   on top. About 10 draw calls for the building: smooth on phones.
   While words are held in front of the church, the lens pulls focus to
   them: the finished frame is blurred at a quarter size and laid over
   itself (P.focus). The camera can lean a few centimetres and circle a
   point ahead of it (P.ox, P.oy, P.orbit), which gives the church real
   parallax behind the cards.
   Falls back to a still image when WebGL is unavailable.
   ========================================================================== */
(function () {
  "use strict";

  var M = {
    bay: 3.0, firstPier: 0, piers: 9,        // pier pairs every 3 m from z = 0 to 24
    pierX: 2.6, wallX: 2.35, aisleX: 5.6,    // pier centres, nave wall face, side-aisle walls
    eye: 1.6,
    pewFrom: 1.8, pewTo: 19.8, pewIn: .85, pewOut: 2.1,
    coupleZ: 23.6, altarZ: 28.0, endDist: 4.3,
    west: -3,
  };
  var SPRING = 5.07, COURSE = 7.6, VAULT = 10.5;    // arcade springing, string course, vault springing

  /* ----------------------------------------------------------- shaders */
  // the building: lit, textured triangles
  var VS_B = [
    "attribute vec3 aP, aN; attribute vec2 aU; attribute float aA;",
    "uniform vec3 uCam; uniform vec4 uProj; uniform vec2 uYaw;",
    "varying vec3 vP, vN; varying vec2 vU; varying float vA;",
    "void main(){",
    "  vec3 w = aP - uCam;",
    "  vec3 v = vec3(w.x * uYaw.x - w.z * uYaw.y, w.y, w.x * uYaw.y + w.z * uYaw.x);",
    "  vP = aP; vN = aN; vU = aU; vA = aA;",
    "  gl_Position = vec4(v.x * uProj.x + uProj.z * v.z, v.y * uProj.y + uProj.w * v.z, v.z - .2, v.z);",
    "}"].join("\n");
  var FS_B = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "uniform sampler2D uT;",
    "uniform vec4 uAlb;    // rgb tint, a: texture mapping (0 none, 1 world triplanar, 2 uv, 3 floor)",
    "uniform vec4 uMat;    // x: texture scale, y: specular, z: shininess, w: emission",
    "uniform float uMetal;",
    "uniform vec3 uEye, uAmb, uSunD, uSunC, uHaze;",
    "uniform vec4 uLP[8]; uniform vec3 uLC[8];",
    "uniform float uExpo, uFog;",
    "uniform vec2 uGrade;  // x: saturation, y: brightness",
    "uniform float uK;     // focal length in device pixels (how big a metre looks at 1 m)",
    "varying vec3 vP, vN; varying vec2 vU; varying float vA;",
    "void main(){",
    "  vec3 n = normalize(vN);",
    "  vec3 V = uEye - vP; float d = length(V); V /= d;",
    "  if (dot(n, V) < 0.) n = -n;",
    "  vec4 tx = vec4(1.);",
    "  float ao = vA;",
    // column shafts: the 24 flutes are drawn by the light, not modelled, and fade
    // out where they would be thinner than a few pixels (no shimmer in the distance)
    "  if (uAlb.a > 3.5) {",
    "    vec2 r = vP.xz - vec2(sign(vP.x) * 2.6, floor(vP.z / 3. + .5) * 3.);",
    "    float ang = atan(r.y, r.x), c = cos(ang * 24.);",
    "    float amt = smoothstep(2.5, 6.5, .0785 * uK / d) * smoothstep(.7, .8, vP.y) * (1. - smoothstep(4.12, 4.2, vP.y));",
    "    float g = pow(max(c, 0.), .7);",
    "    ao *= 1. - .28 * mix(.3, g, amt) * smoothstep(.7, .8, vP.y) * (1. - smoothstep(4.12, 4.2, vP.y));",
    "    n = normalize(n + vec3(-sin(ang), 0., cos(ang)) * (-sin(ang * 24.) * step(0., c) * .55 * amt));",
    "    vec3 a = abs(n);",
    "    tx = texture2D(uT, ((a.x > a.z) ? vP.zy : vP.xy) * uMat.x);",
    "  } else if (uAlb.a > 2.5) {",
    "    tx = texture2D(uT, vP.xz * uMat.x);",
    "    float ax = abs(vP.x);",
    "    ao *= 1. - .6 * smoothstep(.62, .9, ax) * (1. - smoothstep(2.1, 2.35, ax)) * smoothstep(1.2, 1.55, vP.z) * (1. - smoothstep(20.3, 20.6, vP.z));",
    "    vec2 q = vec2(ax - 2.6, mod(vP.z + 1.5, 3.) - 1.5);",
    "    if (vP.z > -.8 && vP.z < 24.8) ao *= .45 + .55 * smoothstep(.42, 1.25, length(q));",
    "    ao *= .55 + .45 * smoothstep(0., .9, 5.6 - ax);",
    "  }",
    "  else if (uAlb.a > 1.5) tx = texture2D(uT, vU);",
    "  else if (uAlb.a > .5) {",
    "    vec3 a = abs(n);",
    "    vec2 c = (a.x > a.y && a.x > a.z) ? vP.zy : (a.y > a.z ? vP.xz : vP.xy);",
    "    tx = texture2D(uT, c * uMat.x);",
    "  }",
    "  if (tx.a < .5) discard;",
    "  vec3 base = uAlb.rgb * tx.rgb;",
    // soft light from above, a warm bounce from below, and the windows' daylight
    "  float hy = 1. - .45 * smoothstep(2., 13., vP.y);",
  "  vec3 lit = (uAmb * (.66 + .34 * n.y) + uAmb * vec3(.5, .34, .22) * max(-n.y, 0.) * .6) * ao * hy;",
    "  lit += uSunC * (max(dot(n, uSunD), 0.) * .8 + .2) * ao;",
    "  vec3 spec = vec3(0.);",
    "  for (int i = 0; i < 8; i++) {",
    "    vec3 L = uLP[i].xyz - vP; float d2 = dot(L, L); L *= inversesqrt(d2);",
    "    float att = 1. / (1. + d2 * uLP[i].w);",
    "    float ndl = max(dot(n, L), 0.);",
    "    lit += uLC[i] * (ndl * .92 + .08) * att * (.3 + .7 * ao);",
    "    spec += uLC[i] * pow(max(dot(n, normalize(L + V)), 0.), uMat.z) * att * ndl;",
    "  }",
    "  vec3 col = base * lit + spec * uMat.y * mix(vec3(1.), base * 1.6, uMetal) * ao;",
    "  col += base * uMat.w;",
    "  col = mix(uHaze, col, exp(-d * uFog));",
    "  col *= uExpo;",
    // a filmic curve: deep shadows, warm soft highlights
    "  col = clamp((col * (2.51 * col + .03)) / (col * (2.43 * col + .59) + .14), 0., 1.);",
    // a muted grade, so the words over the church stay easy to read
    "  col = mix(dot(col, vec3(.2126, .7152, .0722)) * vec3(1.06, .96, .82), col, uGrade.x) * uGrade.y;",
    "  gl_FragColor = vec4(col, 1.);",
    "}"].join("\n");
  // light: camera-facing or world quads (beams, glows, flames, pools), additive
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
  // focus: the finished frame, halved again and again and grown back (a
  // "dual filter" blur, cheap on phones), then laid over itself
  var VS_F = "attribute vec2 aQ; varying vec2 vUV; void main(){ vUV = aQ; gl_Position = vec4(aQ * 2. - 1., 0., 1.); }";
  var FS_DOWN = [
    "precision mediump float;",
    "uniform sampler2D uT; uniform vec2 uH; varying vec2 vUV;",
    "void main(){",
    "  vec4 c = texture2D(uT, vUV) * 4.;",
    "  c += texture2D(uT, vUV - uH) + texture2D(uT, vUV + uH);",
    "  c += texture2D(uT, vUV + vec2(uH.x, -uH.y)) + texture2D(uT, vUV - vec2(uH.x, -uH.y));",
    "  gl_FragColor = c / 8.;",
    "}"].join("\n");
  var FS_UP = [
    "precision mediump float;",
    "uniform sampler2D uT; uniform vec2 uH; varying vec2 vUV;",
    "void main(){",
    "  vec4 c = texture2D(uT, vUV + vec2(-uH.x * 2., 0.)) + texture2D(uT, vUV + vec2(uH.x * 2., 0.));",
    "  c += texture2D(uT, vUV + vec2(0., uH.y * 2.)) + texture2D(uT, vUV + vec2(0., -uH.y * 2.));",
    "  c += (texture2D(uT, vUV + uH) + texture2D(uT, vUV - uH) + texture2D(uT, vUV + vec2(uH.x, -uH.y)) + texture2D(uT, vUV - vec2(uH.x, -uH.y))) * 2.;",
    "  gl_FragColor = c / 12.;",
    "}"].join("\n");
  // the soft frame over the sharp one: a little soft (uT) or softer (uU),
  // so focus deepens gradually rather than one blur fading in over another
  var FS_COMP = [
    "precision mediump float;",
    "uniform sampler2D uT, uU; uniform float uA, uM; varying vec2 vUV;",
    "void main(){",
    "  gl_FragColor = vec4(mix(texture2D(uT, vUV).rgb, texture2D(uU, vUV).rgb, uM), uA);",
    "}"].join("\n");

  var gl, canvas, prog, progB, progP, U = {}, UB = {}, UP = {}, quadBuf, moteBuf, tex = {}, ready = false;
  var W = 0, H = 0, dpr = 1, k = 1, hz = 0, CW = 0;   // CW: page width in CSS px, kept from the last resize
  var lights = [], points = [], motes, moteData, NM = 70, draws = [];
  // P: what journey.js asks for each frame
  // dim: 0..1, how much words are on screen (the church steps back behind them)
  // focus: 0..1, the lens focused on the words in front (the church goes soft)
  // ox, oy: the camera's lean (metres, sideways and up, in the view);
  // orbit: 0..1, how much the camera circles a point `pivot` metres ahead
  // instead (that point stays still on screen and the church swings behind it)
  var P = { camZ: 0, yaw: 0, expo: 1, ignite: 1, win: 1, bloom: 0, dim: 0, focus: 0, ox: 0, oy: 0, orbit: 0, pivot: 2.35 };
  var post = null;   // the focus passes (programs, textures, framebuffers); null if not supported
  var SAT = 1, BRIGHT = 1, DIM = .16;   // the church's colour grade
  var opts = {}, dirty = true, slowFrames = 0, host, lastDraw = 0, lastKey = "", lastKey2 = "", acc = 0, accN = 0;

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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return { t: t };
  }

  /* ------------------------------------------------ painted textures
     Stone, marble, wood, carpet and stained glass, drawn into canvases on
     load (a few milliseconds), so the church needs no picture downloads. */
  function canvas2(w, h, fn) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var x = c.getContext("2d"), img = x.createImageData(w, h);
    fn(img.data, w, h);
    x.putImageData(img, 0, 0);
    return c;
  }
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  // tileable value noise on a g×g lattice, sampled at (u, v) in 0..1
  function lattice(g) { var a = new Float32Array(g * g); for (var i = 0; i < a.length; i++) a[i] = rnd(); return { g: g, a: a }; }
  function vn(L, u, v) {
    var g = L.g, x = u * g, y = v * g, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var x0 = ((xi % g) + g) % g, y0 = ((yi % g) + g) % g, x1 = (x0 + 1) % g, y1 = (y0 + 1) % g, a = L.a;
    var t = a[y0 * g + x0] + (a[y0 * g + x1] - a[y0 * g + x0]) * fx, b = a[y1 * g + x0] + (a[y1 * g + x1] - a[y1 * g + x0]) * fx;
    return t + (b - t) * fy;
  }
  function put(d, o, r, g, b, a) { d[o] = r < 0 ? 0 : r > 255 ? 255 : r; d[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b; d[o + 3] = a == null ? 255 : a; }

  // warm limestone in ashlar courses: 512 px = 2 m
  function stoneTex() {
    var n1 = lattice(8), n2 = lattice(32), n3 = lattice(128);
    var rows = [], RH = 85;
    for (var r = 0; r < Math.ceil(512 / RH); r++) {
      var edges = [], x = Math.floor(rnd() * 140);
      while (x < 512) { edges.push(x); x += 130 + Math.floor(rnd() * 110); }
      var tints = edges.map(function () { return .88 + rnd() * .2; });
      rows.push({ e: edges, t: tints });
    }
    return canvas2(512, 512, function (d, w, h) {
      for (var y = 0; y < h; y++) {
        var row = rows[Math.floor(y / RH)], ry = y % RH, rh = Math.min(RH, 512 - Math.floor(y / RH) * RH);
        for (var x = 0; x < w; x++) {
          var e = row.e, bi = e.length - 1, dx = 999;
          for (var i = 0; i < e.length; i++) { if (x >= e[i]) bi = i; dx = Math.min(dx, Math.abs(x - e[i]), Math.abs(x - e[i] - 512), Math.abs(x - e[i] + 512)); }
          var dm = Math.min(dx, ry, rh - ry);
          var u = x / w, v = y / h;
          var f = .78 + .22 * vn(n1, u, v) + .12 * vn(n2, u, v) + .07 * vn(n3, u, v);
          var t = row.t[bi] * f;
          if (dm < 1.5) t *= .82; else if (dm < 4) t *= .93 + .017 * dm;   // fine joints and a chiselled edge
          put(d, (y * w + x) * 4, 226 * t, 208 * t, 178 * t);
        }
      }
    });
  }
  // polished floor: cream and rose-grey marble in 1.2 m squares, 512 px = 2.4 m
  function marbleTex() {
    var n1 = lattice(6), n2 = lattice(24), n3 = lattice(96);
    return canvas2(512, 512, function (d, w, h) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = x / w, v = y / h, tile = ((x >> 8) + (y >> 8)) & 1;
        var turb = vn(n1, u, v) * 2 + vn(n2, u, v) + vn(n3, u, v) * .5;
        var vein = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 2) * 6.283 + turb * 4.2)), 18);
        var f = .92 + .08 * vn(n2, u, v) - .2 * vein;
        var gx = Math.min(x % 256, 256 - x % 256), gy = Math.min(y % 256, 256 - y % 256);
        if (Math.min(gx, gy) < 1.5) f *= .62;
        if (tile) put(d, (y * w + x) * 4, 222 * f, 210 * f, 190 * f);
        else put(d, (y * w + x) * 4, 186 * f, 158 * f, 128 * f);
      }
    });
  }
  // dark walnut, grain along x: 256 px = 1.1 m
  function woodTex() {
    var n1 = lattice(4), n2 = lattice(16), n3 = lattice(64);
    return canvas2(256, 256, function (d, w, h) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = x / w, v = y / h;
        var g = vn(n1, u * .25, v) * 3 + vn(n2, u * .5, v) * .8;
        var s = .5 + .5 * Math.sin(v * 6.283 * 22 + g * 7);
        var f = .84 + .12 * s + .1 * vn(n3, u, v * 4);
        put(d, (y * w + x) * 4, 84 * f, 38 * f, 22 * f);
      }
    });
  }
  // the aisle runner: deep red with gold borders (u across, v along)
  function carpetTex() {
    var n = lattice(32);
    return canvas2(128, 256, function (d, w, h) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = x / (w - 1), f = .9 + .14 * vn(n, u, y / h);
        var m = Math.abs(((x + y) % 16) - 8) < 1 && u > .14 && u < .86 ? .9 : 1;    // a faint diamond weave
        var e = Math.min(u, 1 - u), o = (y * w + x) * 4;
        if (e < .035) put(d, o, 70 * f, 10 * f, 12 * f);
        else if (e > .06 && e < .085) put(d, o, 168 * f, 120 * f, 56 * f);
        else put(d, o, 118 * f * m, 16 * f * m, 22 * f * m);
      }
    });
  }
  // a night-blue vault with gold stars, over the sanctuary
  function starTex() {
    var stars = [];
    for (var i = 0; i < 26; i++) stars.push([rnd() * 256, rnd() * 256, 2 + rnd() * 2.5]);
    return canvas2(256, 256, function (d, w, h) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var r = 30, g = 44, b = 92, s = 0;
        for (var i = 0; i < stars.length; i++) {
          var dx = Math.abs(x - stars[i][0]), dy = Math.abs(y - stars[i][1]);
          dx = Math.min(dx, 256 - dx); dy = Math.min(dy, 256 - dy);
          var st = stars[i][2] - (Math.min(dx, dy) * 2.4 + Math.max(dx, dy) * .55);   // a four-pointed star
          if (st > s) s = st;
        }
        s = Math.min(1, s);
        put(d, (y * w + x) * 4, r + (236 - r) * s, g + (186 - g) * s, b + (96 - b) * s);
      }
    });
  }
  var JEWELS = [[150, 28, 30], [30, 52, 132], [30, 100, 64], [200, 146, 56], [100, 34, 90], [170, 72, 34], [44, 96, 140]];
  function glassNoise(L, u, v) { return .78 + .3 * vn(L, u, v); }
  // a lancet window (pointed top), w × h metres, springing at s metres; canvas top = window top
  function lancetTex(wm, hm, sm, variant, W, H) {
    var n = lattice(16), cells = lattice(64);
    var R = wm * .8, hw = wm / 2;
    var c = canvas2(W, H, function (d, w, h) {
      for (var py = 0; py < h; py++) for (var px = 0; px < w; px++) {
        var x = (px + .5) / w * wm, y = (1 - (py + .5) / h) * hm, o = (py * w + px) * 4;
        var inside = y <= sm || (Math.hypot(x - R, y - sm) <= R && Math.hypot(x - (wm - R), y - sm) <= R);
        if (!inside) { put(d, o, 0, 0, 0, 0); continue; }
        var u = x / wm, v = y / hm, lead = false, col;
        var bx = Math.min(x, wm - x);
        if (bx < .07 || y < .07) {                                  // the border band
          col = Math.floor(y / .14) % 2 ? JEWELS[3] : JEWELS[0];
          if (Math.abs(bx - .07) < .012 || (y < .07 && Math.abs(y - .07) < .012)) lead = true;
          if (bx < .07 && Math.abs((y % .14) - .07) > .062) lead = true;
        } else {                                                     // pale quarries, a few jewels
          var qa = (x / .16 + y / .22), qb = (x / .16 - y / .22);
          var ia = Math.floor(qa), ib = Math.floor(qb);
          if (Math.abs(qa - Math.round(qa)) < .07 || Math.abs(qb - Math.round(qb)) < .07) lead = true;
          var pick = Math.floor(vn(cells, ((ia * 7 + 64) % 64) / 64, ((ib * 13 + 64) % 64) / 64) * 7) % 7;
          col = pick < 5 ? [[214, 186, 132], [196, 176, 140], [222, 200, 150]][pick % 3] : JEWELS[pick];
        }
        if (Math.abs(bx - hw) > hw - .015 && y > sm) lead = true;
        var f = glassNoise(n, u, v * 2);
        if (lead) put(d, o, 24, 18, 14);
        else put(d, o, col[0] * f, col[1] * f, col[2] * f);
      }
    });
    saint(c, wm, hm, sm, variant);
    return c;
  }
  // a saint in the glass: halo, robe and mantle, holding a cross, a lily or a
  // book, on a deep-blue niche; drawn in metres so it never stretches
  function saint(c, wm, hm, sm, variant) {
    var x = c.getContext("2d"), W = c.width, H = c.height;
    x.save();
    x.globalCompositeOperation = "source-atop";
    x.scale(W / wm, H / hm);
    var cx = wm / 2, y0 = hm - sm + .06, f = Math.min(hm - y0 - .2, wm * 2.5), bw = Math.min(.19 * f, wm / 2 - .13);
    var LEAD = "#18110c", lw = .016;
    var ROBE = [["#981c24", "#24408f"], ["#24408f", "#981c24"], ["#1f6a46", "#c99436"]][variant % 3];
    function shape(fill, draw) { x.beginPath(); draw(); x.fillStyle = fill; x.fill(); x.lineWidth = lw; x.strokeStyle = LEAD; x.stroke(); }
    // the niche behind the figure
    shape("#1f2c66", function () { x.moveTo(cx - bw - .05, y0 + .98 * f); x.lineTo(cx - bw - .05, y0 + .2 * f); x.quadraticCurveTo(cx - bw - .05, y0 - .04 * f, cx, y0 - .06 * f); x.quadraticCurveTo(cx + bw + .05, y0 - .04 * f, cx + bw + .05, y0 + .2 * f); x.lineTo(cx + bw + .05, y0 + .98 * f); x.closePath(); });
    // halo
    shape("#d9a63e", function () { x.arc(cx, y0 + .1 * f, .095 * f, 0, Math.PI * 2); });
    x.beginPath(); x.arc(cx, y0 + .1 * f, .072 * f, 0, Math.PI * 2); x.lineWidth = lw * .6; x.stroke();
    // the cloak over both shoulders, falling to the feet
    shape(ROBE[1], function () {
      x.moveTo(cx - .06 * f, y0 + .19 * f);
      x.quadraticCurveTo(cx - bw * .95, y0 + .2 * f, cx - bw, y0 + .36 * f);
      x.lineTo(cx - bw * 1.02, y0 + .9 * f); x.quadraticCurveTo(cx, y0 + .94 * f, cx + bw * 1.02, y0 + .9 * f);
      x.lineTo(cx + bw, y0 + .36 * f); x.quadraticCurveTo(cx + bw * .95, y0 + .2 * f, cx + .06 * f, y0 + .19 * f); x.closePath();
    });
    // the robe, seen between the folds of the cloak, with a gold belt
    shape(ROBE[0], function () { x.moveTo(cx - .05 * f, y0 + .2 * f); x.lineTo(cx + .05 * f, y0 + .2 * f); x.lineTo(cx + bw * .5, y0 + .91 * f); x.lineTo(cx - bw * .5, y0 + .91 * f); x.closePath(); });
    shape("#d9a63e", function () { x.rect(cx - bw * .32, y0 + .53 * f, bw * .64, .018 * f); });
    x.beginPath();
    [-.72, -.5, .5, .72].forEach(function (k) { x.moveTo(cx + k * bw * .9, y0 + .42 * f); x.quadraticCurveTo(cx + k * bw * .97, y0 + .7 * f, cx + k * bw * 1.0, y0 + .9 * f); });
    x.moveTo(cx - bw * .12, y0 + .6 * f); x.lineTo(cx - bw * .18, y0 + .9 * f); x.moveTo(cx + bw * .12, y0 + .6 * f); x.lineTo(cx + bw * .18, y0 + .9 * f);
    x.lineWidth = lw * .7; x.strokeStyle = LEAD; x.stroke();
    // hair, face, hands
    shape("#5a3418", function () { x.arc(cx, y0 + .105 * f, .058 * f, Math.PI * .95, Math.PI * 2.05); x.lineTo(cx + .05 * f, y0 + .17 * f); x.lineTo(cx - .05 * f, y0 + .17 * f); x.closePath(); });
    shape("#ecd3ad", function () { x.ellipse(cx, y0 + .12 * f, .038 * f, .048 * f, 0, 0, Math.PI * 2); });
    x.beginPath(); x.moveTo(cx - .014 * f, y0 + .113 * f); x.lineTo(cx - .006 * f, y0 + .113 * f); x.moveTo(cx + .006 * f, y0 + .113 * f); x.lineTo(cx + .014 * f, y0 + .113 * f);
    x.lineWidth = lw * .5; x.stroke();
    shape("#ecd3ad", function () { x.arc(cx - .028 * f, y0 + .4 * f, .019 * f, 0, Math.PI * 2); });
    shape("#ecd3ad", function () { x.arc(cx + .028 * f, y0 + .4 * f, .019 * f, 0, Math.PI * 2); });
    // what the saint holds
    if (variant % 3 === 0) {          // a budded cross, held at the chest
      shape("#e2b04c", function () { x.rect(cx - .008 * f, y0 + .27 * f, .016 * f, .2 * f); x.rect(cx - .045 * f, y0 + .31 * f, .09 * f, .016 * f); });
    } else if (variant % 3 === 1) {   // a lily
      shape("#3d7a3a", function () { x.rect(cx + .03 * f - .005 * f, y0 + .23 * f, .01 * f, .18 * f); });
      [[0, .22], [-.025, .26], [.025, .265]].forEach(function (q) { shape("#f4ecd8", function () { x.ellipse(cx + .03 * f + q[0] * f, y0 + q[1] * f, .018 * f, .028 * f, q[0] * 9, 0, Math.PI * 2); }); });
    } else {                          // an open book
      shape("#f4ecd8", function () { x.moveTo(cx - .065 * f, y0 + .35 * f); x.lineTo(cx, y0 + .365 * f); x.lineTo(cx + .065 * f, y0 + .35 * f); x.lineTo(cx + .065 * f, y0 + .42 * f); x.lineTo(cx, y0 + .435 * f); x.lineTo(cx - .065 * f, y0 + .42 * f); x.closePath(); });
      x.beginPath(); x.moveTo(cx, y0 + .365 * f); x.lineTo(cx, y0 + .435 * f); x.lineWidth = lw * .6; x.stroke();
    }
    // the pedestal
    shape("#d9a63e", function () { x.rect(cx - bw - .03, y0 + .91 * f, 2 * bw + .06, .05 * f); });
    x.restore();
    // antique glass: the figure's colours vary a little, like the rest
    var img = x.getImageData(0, 0, W, H), d = img.data, nz = lattice(24);
    for (var py = 0; py < H; py++) for (var px = 0; px < W; px++) {
      var o = (py * W + px) * 4; if (!d[o + 3]) continue;
      var g = .86 + .2 * vn(nz, px / W, py / H * 3);
      d[o] *= g; d[o + 1] *= g; d[o + 2] *= g;
    }
    x.putImageData(img, 0, 0);
  }
  // the rose window: twelve petals and a ring of roundels around a quatrefoil
  function roseTex() {
    var n = lattice(16);
    return canvas2(512, 512, function (d, w, h) {
      for (var py = 0; py < h; py++) for (var px = 0; px < w; px++) {
        var x = (px + .5) / w * 2 - 1, y = (py + .5) / h * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x), o = (py * w + px) * 4;
        if (r > 1) { put(d, o, 0, 0, 0, 0); continue; }
        var lead = false, col, seg = (a + Math.PI) / (Math.PI * 2) * 12, si = Math.floor(seg), sf = seg - si;
        if (r < .2) {
          var q = Math.abs(Math.cos(a * 2));
          col = r < .2 * (.55 + .45 * q) ? JEWELS[3] : JEWELS[0];
          if (Math.abs(r - .2 * (.55 + .45 * q)) < .012) lead = true;
        } else if (r < .7) {
          var pr = (r - .2) / .5, half = Math.abs(sf - .5) * 2;          // petal: a pointed lancet radiating out
          var inPetal = half < .82 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, pr - .6) / .4, 2)));
          col = inPetal ? (si % 2 ? JEWELS[1] : JEWELS[0]) : JEWELS[6];
          if (inPetal && Math.abs(r - .45) < .01) lead = true;
          if (Math.abs(half - .82 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, pr - .6) / .4, 2)))) < .05) lead = true;
          if (inPetal && r > .47 && r < .62) col = si % 2 ? JEWELS[2] : JEWELS[3];
        } else {
          var ca = (Math.floor((a + Math.PI) / (Math.PI * 2) * 24) + .5) / 24 * Math.PI * 2 - Math.PI;
          var cx = Math.cos(ca) * .84, cy = Math.sin(ca) * .84, cr = Math.hypot(x - cx, y - cy);
          col = cr < .1 ? JEWELS[(Math.floor((a + Math.PI) / (Math.PI * 2) * 24)) % 2 ? 3 : 4] : JEWELS[1];
          if (Math.abs(cr - .1) < .012) lead = true;
        }
        if (Math.abs(r - .2) < .01 || Math.abs(r - .7) < .012 || r > .975) lead = true;
        if (r > .2 && r < .7 && (sf < .02 || sf > .98)) lead = true;
        var f = glassNoise(n, (x + 1) / 2, (y + 1) / 2);
        if (lead) put(d, o, 24, 18, 14); else put(d, o, col[0] * f, col[1] * f, col[2] * f);
      }
    });
  }
  // the niches of the reredos: a pointed arch of night blue with gold stars and a gold border
  function nicheTex() {
    return canvas2(64, 128, function (d, w, h) {
      var wm = 1, hm = 2, sm = 1.35, R = .8;
      for (var py = 0; py < h; py++) for (var px = 0; px < w; px++) {
        var x = (px + .5) / w * wm, y = (1 - (py + .5) / h) * hm, o = (py * w + px) * 4;
        var dl = Math.hypot(x - R, y - sm), dr = Math.hypot(x - (wm - R), y - sm);
        var inside = y <= sm || (dl <= R && dr <= R);
        if (!inside) { put(d, o, 0, 0, 0, 0); continue; }
        var edge = Math.min(x, wm - x, y, y > sm ? Math.min(R - dl, R - dr) : 9);
        if (edge < .07) put(d, o, 214, 160, 72);
        else { var g = .55 + .45 * (y / hm); put(d, o, 26 * g, 38 * g, 86 * g); if (((px * 7 + py * 13) % 37) === 0) put(d, o, 230, 190, 110); }
      }
    });
  }
  // the altar frontal: crimson damask, a gold border and a budded cross
  function frontalTex() {
    var n = lattice(32);
    return canvas2(256, 128, function (d, w, h) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4, e = Math.min(x, w - 1 - x, y, h - 1 - y), cx = Math.abs(x - w / 2), cy = y - h / 2;
        var cross = (cx < 3.5 && Math.abs(cy) < 40) || (Math.abs(cy + 12) < 3.5 && cx < 24) || Math.hypot(cx, cy + 40) < 6 || Math.hypot(cx - 24, cy + 12) < 6 || Math.hypot(cx, cy - 40) < 6 * 0;
        var dam = .88 + .12 * Math.sin(x * .35) * Math.sin(y * .35) + .08 * vn(n, x / w, y / h);
        if (e < 8 || (e > 11 && e < 13) || cross) put(d, o, 214, 162, 74);
        else put(d, o, 112 * dam, 16 * dam, 22 * dam);
      }
    });
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
    tex.flame = texture(sprite(64, 128, function (x) {
      var g = x.createRadialGradient(32, 92, 2, 32, 80, 40);
      g.addColorStop(0, "rgba(255,250,235,1)"); g.addColorStop(.35, "rgba(255,214,140,.95)");
      g.addColorStop(.7, "rgba(255,150,60,.35)"); g.addColorStop(1, "rgba(255,120,40,0)");
      x.fillStyle = g;
      x.beginPath(); x.moveTo(32, 6); x.bezierCurveTo(46, 50, 52, 80, 32, 118); x.bezierCurveTo(12, 80, 18, 50, 32, 6); x.fill();
    }));
  }

  /* ------------------------------------------------- geometry builder
     Each material collects triangles into chunks of < 65k vertices
     (position, normal, uv, ambient occlusion). Normals face either way:
     the shader turns them toward the eye. */
  function Mesh() { this.chunks = []; this.v = []; this.i = []; this.n = 0; }
  Mesh.prototype.room = function (k) { if (this.n + k > 65000) this.flush(); };
  Mesh.prototype.flush = function () { if (this.n) this.chunks.push({ v: new Float32Array(this.v), i: new Uint16Array(this.i) }); this.v = []; this.i = []; this.n = 0; };
  Mesh.prototype.vert = function (p, nn, u, v, a) { this.v.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], u, v, a); return this.n++; };
  var G = {};
  function mesh(name) { return G[name] || (G[name] = new Mesh()); }

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function add(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }

  // a parametric surface: f(i, j) for i in 0..nu, j in 0..nv
  function surf(m, nu, nv, f, o) {
    o = o || {};
    m.room((nu + 1) * (nv + 1));
    var P = [], i, j;
    for (j = 0; j <= nv; j++) { P.push([]); for (i = 0; i <= nu; i++) P[j].push(f(i, j)); }
    var base = m.n;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var ip = i + 1, im = i - 1;
      if (o.wrap) { if (ip > nu) ip = 1; if (im < 0) im = nu - 1; } else { ip = Math.min(ip, nu); im = Math.max(im, 0); }
      var du = sub(P[j][ip], P[j][im]), dv = sub(P[Math.min(j + 1, nv)][i], P[Math.max(j - 1, 0)][i]);
      var nn = norm(cross(du, dv));
      if (!isFinite(nn[0]) || (nn[0] === 0 && nn[1] === 0 && nn[2] === 0)) nn = [0, 1, 0];
      var uv = o.uv ? o.uv(i, j, P[j][i]) : [i / nu, j / nv];
      m.vert(P[j][i], nn, uv[0], uv[1], o.ao ? o.ao(i, j, P[j][i]) : 1);
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e = c + 1;
      m.i.push(a, b, c, b, e, c);
    }
  }
  // a turned shape around a vertical axis: profile [[r, y], ...]; rf(angle, j) shapes it
  function lathe(m, cx, cy, cz, prof, seg, rf, ao) {
    surf(m, seg, prof.length - 1, function (i, j) {
      var a = i / seg * Math.PI * 2, r = prof[j][0] * (rf ? rf(a, j) : 1);
      return [cx + Math.cos(a) * r, cy + prof[j][1], cz + Math.sin(a) * r];
    }, { wrap: true, ao: ao ? function (i, j) { return ao(i / seg * Math.PI * 2, j); } : null });
  }
  // a section [[a, b], ...] swept along path(t), t in 0..1; side(t, T) gives the section's "a" axis
  function sweep(m, path, steps, sec, side, ao) {
    var pts = [], i;
    for (i = 0; i <= steps; i++) pts.push(path(i / steps));
    surf(m, sec.length - 1, steps, function (si, ti) {
      var p = pts[ti], T = norm(sub(pts[Math.min(ti + 1, steps)], pts[Math.max(ti - 1, 0)]));
      var S = side ? side(ti / steps, T) : norm(cross(T, [0, 1, 0]));
      var d = S[0] * T[0] + S[1] * T[1] + S[2] * T[2];
      var Ua = norm([S[0] - T[0] * d, S[1] - T[1] * d, S[2] - T[2] * d]), Vb = cross(T, Ua);
      return add(add(p, Ua, sec[si][0]), Vb, sec[si][1]);
    }, { ao: ao ? function () { return ao; } : null });
  }
  function ring(r, n) { var s = []; for (var i = 0; i <= n; i++) { var a = i / n * Math.PI * 2; s.push([Math.cos(a) * r, Math.sin(a) * r]); } return s; }
  function box(m, x0, y0, z0, x1, y1, z1, ao) {
    ao = ao || [1, 1];
    m.room(24);
    var F = [
      [[1, 0, 0], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[-1, 0, 0], [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]]],
      [[0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]],
      [[0, -1, 0], [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]]],
      [[0, 0, 1], [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]]],
      [[0, 0, -1], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]],
    ];
    F.forEach(function (f) {
      var b = m.n;
      f[1].forEach(function (p, k) { m.vert(p, f[0], k === 1 || k === 2 ? 1 : 0, k > 1 ? 1 : 0, ao[0] + (ao[1] - ao[0]) * (y1 > y0 ? (p[1] - y0) / (y1 - y0) : 1)); });
      m.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
  }
  // a flat four-cornered panel with uv (for glass and niches)
  function panel(m, p0, p1, p2, p3, uvFlip) {
    m.room(4);
    var nn = norm(cross(sub(p1, p0), sub(p3, p0))), b = m.n;
    m.vert(p0, nn, 0, uvFlip ? 0 : 1, 1); m.vert(p1, nn, 1, uvFlip ? 0 : 1, 1); m.vert(p2, nn, 1, uvFlip ? 1 : 0, 1); m.vert(p3, nn, 0, uvFlip ? 1 : 0, 1);
    m.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // a convex outline [[z, y], ...] extruded across x0..x1 (pew ends)
  function slabX(m, poly, x0, x1, ao) {
    var n = poly.length;
    [x0, x1].forEach(function (x) {
      m.room(n);
      var b = m.n;
      poly.forEach(function (q) { m.vert([x, q[1], q[0]], [1, 0, 0], 0, 0, ao); });
      for (var i = 1; i < n - 1; i++) m.i.push(b, b + i, b + i + 1);
    });
    for (var i = 0; i < n; i++) {
      var a = poly[i], c = poly[(i + 1) % n];
      m.room(4);
      var b = m.n;
      m.vert([x0, a[1], a[0]], [0, c[0] - a[0], -(c[1] - a[1])], 0, 0, ao); m.vert([x1, a[1], a[0]], [0, c[0] - a[0], -(c[1] - a[1])], 0, 0, ao);
      m.vert([x1, c[1], c[0]], [0, c[0] - a[0], -(c[1] - a[1])], 0, 0, ao); m.vert([x0, c[1], c[0]], [0, c[0] - a[0], -(c[1] - a[1])], 0, 0, ao);
      m.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  // a pointed (two-centred) arch between a and b springing at y0; sharp = radius / half-span
  function pointed(a, b, y0, sharp) {
    var h = (b - a) / 2, R = h * sharp, m = (a + b) / 2;
    return function (t) {
      return t <= m ? y0 + Math.sqrt(Math.max(0, R * R - Math.pow(t - (a + R), 2))) : y0 + Math.sqrt(Math.max(0, R * R - Math.pow(t - (b - R), 2)));
    };
  }

  /* ---------------------------------------------------------- the church */
  function build() {
    var stone = mesh("stone"), vault = mesh("vault"), rib = mesh("rib"), floor = mesh("floor"), marble = mesh("marble"),
      carpet = mesh("carpet"), wood = mesh("wood"), gold = mesh("gold"), wax = mesh("wax"), lamp = mesh("lamp"),
      rose = mesh("rose"), stars = mesh("stars"), niche = mesh("niche"), dark = mesh("dark");
    var X = M.wallX, Z0 = M.west, ZE = M.altarZ, ZC = M.firstPier + (M.piers - 1) * M.bay;   // ZC: where the chancel begins (24)
    var vaultY = pointed(-X, X, VAULT, 1.5), apex = vaultY(0);

    // the floor, the runner and the sanctuary steps
    surf(floor, 1, 1, function (i, j) { return [-M.aisleX + i * 2 * M.aisleX, 0, Z0 + j * (ZE - Z0)]; });
    var runEnd = ZC + .6;
    surf(carpet, 1, 1, function (i, j) { return [-.75 + 1.5 * i, .006, Z0 + j * (runEnd - Z0)]; }, { uv: function (i, j) { return [i, j * (runEnd - Z0) / 2]; } });
    for (var s3 = 0; s3 < 3; s3++) {
      var zs = runEnd + s3 * .32, ys = .15 * (s3 + 1);
      box(marble, -X, 0, zs, X, ys, ZE);
      box(carpet, -.75, 0, zs - .006, .75, ys + .006, zs + .32);
    }
    var platY = .45, zTable = 26.3;

    // a run of wall between z0 and z1, from y0 to y1, at x (facing the nave)
    function wall(m, x, z0, z1, y0, y1, aoFn) {
      surf(m, 1, 1, function (i, j) { return [x, y0 + j * (y1 - y0), z0 + i * (z1 - z0)]; }, { ao: aoFn || function (i, j, p) { return .62 + .38 * Math.min(1, p[1] / 1.6); } });
    }
    // a wall face with a pointed window cut out: x, the bay z0..z1, window centre zc, width w, sill, spring, wall top
    function windowWall(m, x, s, z0, z1, zc, w, sill, spring, y0, y1, glassMesh, depth) {
      var a = zc - w / 2, b = zc + w / 2, arch = pointed(a, b, spring, 1.6), top = arch(zc);
      wall(m, x, z0, a, y0, y1); wall(m, x, b, z1, y0, y1); wall(m, x, a, b, y0, sill);
      surf(m, 16, 1, function (i, j) { var z = a + (b - a) * i / 16; return [x, j ? y1 : (z < a + .001 || z > b - .001 ? spring : arch(z)), z]; });
      // the reveal: jambs, sill and arch, cut into the wall
      var xd = x + s * depth;
      surf(m, 1, 1, function (i, j) { return [x + s * depth * i, sill + j * (spring - sill), a]; }, { ao: function (i) { return 1 - .35 * i; } });
      surf(m, 1, 1, function (i, j) { return [x + s * depth * i, sill + j * (spring - sill), b]; }, { ao: function (i) { return 1 - .35 * i; } });
      surf(m, 1, 1, function (i, j) { return [x + s * depth * i, sill - .06 * (1 - i), a + j * w]; }, { ao: function (i) { return 1 - .3 * i; } });
      surf(m, 16, 1, function (i, j) { var z = a + w * i / 16; return [x + s * depth * j, arch(Math.min(b, Math.max(a, z))), z]; }, { ao: function (i, j) { return 1 - .35 * j; } });
      panel(glassMesh, [xd, sill, a], [xd, sill, b], [xd, top, b], [xd, top, a]);
      return { top: top, a: a, b: b };
    }

    [-1, 1].forEach(function (s) {
      var xi = s * X;
      // west of the first pier and the chancel: solid walls
      wall(stone, xi, Z0, M.firstPier, 0, VAULT);
      // the arcade: a pointed arch between each pair of piers, with the clerestory above
      for (var p = 0; p < M.piers - 1; p++) {
        var z0 = M.firstPier + p * M.bay, z1 = z0 + M.bay, za = z0 + .49, zb = z1 - .49, zm = (z0 + z1) / 2;
        var arch = pointed(za, zb, SPRING, 1.55);
        // spandrel: from the arch (or the pier tops) up to the string course
        surf(stone, 28, 1, function (i, j) {
          var z = z0 + M.bay * i / 28;
          return [xi, j ? COURSE : (z > za && z < zb ? arch(z) : SPRING), z];
        }, { ao: function (i, j) { return j ? 1 : .8; } });
        // soffit: the underside of the arch, through the wall's thickness
        surf(stone, 24, 1, function (i, j) { var z = za + (zb - za) * i / 24; return [xi + s * .5 * j, arch(z), z]; }, { ao: function (i, j) { return .8 - .25 * j; } });
        // two mouldings follow the arch
        sweep(rib, function (t) { var z = za + (zb - za) * t; return [xi - s * .03, arch(z), z]; }, 24, ring(.065, 8), function () { return [1, 0, 0]; });
        sweep(rib, function (t) { var z = za - .16 + (zb - za + .32) * t; return [xi - s * .02, pointed(za - .16, zb + .16, SPRING, 1.55)(z), z]; }, 24, ring(.04, 6), function () { return [1, 0, 0]; });
        // clerestory: a stained-glass lancet in each bay
        windowWall(stone, xi, s, z0, z1, zm, .92, COURSE + .35, COURSE + 1.6, COURSE, VAULT, mesh("glassC" + ((p + (s > 0 ? 1 : 0)) % 3)), .4);
        // the side aisle: its outer wall with a taller window, and a dark timber ceiling
        windowWall(stone, s * M.aisleX, s, z0, z1, zm, 1.1, 1.5, 4.2, 0, 7.2, mesh("glassA" + ((p + (s > 0 ? 2 : 0)) % 3)), .32);
        surf(dark, 1, 1, function (i, j) { return [s * (X + .5 + (M.aisleX - X - .5) * i), 7.2, z0 + j * M.bay]; });
      }
      // the aisle wall west of the first pier, and its end wall by the chancel
      wall(stone, s * M.aisleX, Z0, M.firstPier, 0, 7.2);
      surf(dark, 1, 1, function (i, j) { return [s * (X + .5 + (M.aisleX - X - .5) * i), 7.2, Z0 + j * (M.firstPier - Z0)]; });
      surf(stone, 1, 1, function (i, j) { return [s * (X + .5 + (M.aisleX - X - .5) * i), j * 7.2, ZC]; }, { ao: function (i, j) { return .5 + .3 * j; } });
      // the chancel: one tall window each side
      windowWall(stone, xi, s, ZC, ZE, (ZC + ZE) / 2 + .2, 1.0, 3.6, 7.4, 0, VAULT, mesh("glassH" + (s > 0 ? 1 : 0)), .45);
      // string courses along the whole nave
      [SPRING, COURSE, VAULT].forEach(function (y, q) {
        sweep(rib, function (t) { return [xi - s * .04, y, Z0 + (ZE - Z0) * t]; }, 1, ring(q === 1 ? .07 : .055, 8), function () { return [1, 0, 0]; });
      });
    });

    // the piers: plinth, moulded base, fluted shaft, leafy capital, abacus
    var base = [[.47, .32], [.47, .36], [.41, .4], [.43, .47], [.37, .53], [.35, .6], [.31, .66]];
    var shaft = [[.31, .66], [.3, .72], [.3, 4.2], [.31, 4.24]];
    var cap = []; for (var c = 0; c <= 12; c++) { var t = c / 12; cap.push([.3 + .16 * t * t + .02 * Math.sin(t * Math.PI), 4.26 + .66 * t]); }
    function leaves(a, j) {
      var t = j / 12, l1 = Math.pow(Math.abs(Math.cos(a * 4)), 3) * Math.sin(Math.min(1, t / .55) * Math.PI) * .2;
      var l2 = Math.pow(Math.abs(Math.sin(a * 4)), 3) * Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - .35) / .55)) * Math.PI)) * .18;
      var vol = Math.pow(Math.max(0, Math.cos(a * 4 + Math.PI / 4 * 0)), 10) * Math.max(0, (t - .7) / .3) * .25;
      return 1 + l1 + l2 + vol;
    }
    for (var p2 = 0; p2 < M.piers; p2++) {
      var zp = M.firstPier + p2 * M.bay;
      [-1, 1].forEach(function (s) {
        var xp = s * M.pierX;
        box(stone, xp - .48, 0, zp - .48, xp + .48, .32, zp + .48, [.55, .9]);
        lathe(stone, xp, 0, zp, base, 32, null, function (a, j) { return .75 + .25 * j / 6; });
        lathe(mesh("shaft"), xp, 0, zp, shaft, 48);
        lathe(stone, xp, 0, zp, cap, 64, leaves, function (a, j) { var l = leaves(a, j) - 1; return .72 + Math.min(.28, l * 1.6); });
        box(stone, xp - .49, 4.92, zp - .49, xp + .49, SPRING, zp + .49, [.85, 1]);
        // a vaulting shaft rising from the capital to the vault
        lathe(rib, s * (X - .06), 0, zp, [[.09, SPRING], [.09, VAULT - .1], [.13, VAULT - .05], [.13, VAULT + .02]], 16);
        // a bronze lantern on the aisle side of the pier
        var lx = s * (M.pierX - .58), ly = 2.55;
        box(gold, Math.min(lx, s * (M.pierX - .3)), ly + .2, zp - .025, Math.max(lx, s * (M.pierX - .3)), ly + .24, zp + .025);
        lathe(gold, lx, ly, zp, [[.0, .3], [.05, .3], [.11, .22], [.11, .2]], 6);
        lathe(lamp, lx, ly, zp, [[.095, .2], [.08, -.08]], 6);
        for (var lb = 0; lb < 6; lb++) {
          var la = lb / 6 * Math.PI * 2, bx2 = lx + Math.cos(la) * .1, bz2 = zp + Math.sin(la) * .1;
          box(gold, bx2 - .008, ly - .08, bz2 - .008, bx2 + .008, ly + .2, bz2 + .008);
        }
        lathe(gold, lx, ly, zp, [[.09, -.08], [.06, -.12], [.0, -.16]], 6);
        lights.push({ kind: "flame", p: [lx, ly + .02, zp], s: .07, c: [1, .9, .7], a: .9, ph: Math.random() * 9, candle: zp });
        lights.push({ kind: "glow", p: [lx, ly + .04, zp - .01], s: 1.3, c: [1, .62, .3], a: .22, ph: Math.random() * 9, candle: zp });
        lights.push({ kind: "pool", p: [lx * .8, 0, zp], s: 2.2, c: [1, .6, .3], a: .06, ph: Math.random() * 9, candle: zp });
      });
    }

    // the vault: a pointed barrel, with transverse and diagonal ribs, a ridge rib and gilded bosses
    var bays = [Z0]; for (var bz = M.firstPier; bz <= ZC + .01; bz += M.bay) bays.push(bz); bays.push(ZE);
    for (var b = 0; b < bays.length - 1; b++) {
      var za2 = bays[b], zb2 = bays[b + 1], vm = b === bays.length - 2 ? stars : vault;
      surf(vm, 24, 2, function (i, j) { var x = -X + 2 * X * i / 24; return [x, vaultY(x), za2 + (zb2 - za2) * j / 2]; }, { ao: function (i) { var e = Math.abs(i - 12) / 12; return .7 + .3 * (1 - e * e); } });
      (function (za2, zb2) {
        var dia = function (sgn) { return function (t) { var x = -X + 2 * X * t; return [x, vaultY(x) - .05, sgn > 0 ? za2 + (zb2 - za2) * t : zb2 - (zb2 - za2) * t]; }; };
        sweep(rib, dia(1), 24, [[-.07, 0], [-.05, -.1], [.05, -.1], [.07, 0]], null);
        sweep(rib, dia(-1), 24, [[-.07, 0], [-.05, -.1], [.05, -.1], [.07, 0]], null);
        lathe(gold, 0, apex - .14, (za2 + zb2) / 2, [[0, -.12], [.1, -.08], [.14, 0], [.12, .06], [0, .1]], 12);
      })(za2, zb2);
    }
    bays.forEach(function (z) {
      sweep(rib, function (t) { var x = -X + 2 * X * t; return [x, vaultY(x) - .06, z]; }, 32, [[-.09, 0], [-.07, -.14], [.07, -.14], [.09, 0]], function () { return [0, 0, 1]; });
    });
    sweep(rib, function (t) { return [0, apex - .04, Z0 + (ZE - Z0) * t]; }, 1, [[-.06, 0], [-.05, -.08], [.05, -.08], [.06, 0]], function () { return [1, 0, 0]; });

    // the east wall, with the rose window
    var RC = [0, 5.85], RR = 1.28;
    surf(stone, 96, 1, function (i, j) {
      var a = i / 96 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      if (!j) return [RC[0] + dx * RR, RC[1] + dy * RR, ZE];
      var tx = dx ? (dx > 0 ? X - RC[0] : -X - RC[0]) / dx : 1e9, ty = dy ? (dy > 0 ? apex - RC[1] : -RC[1]) / dy : 1e9;
      var t = Math.min(Math.abs(tx), Math.abs(ty));
      return [RC[0] + dx * t, Math.min(vaultY(RC[0] + dx * t), RC[1] + dy * t), ZE];
    }, { ao: function (i, j, p) { return .62 + .38 * Math.min(1, p[1] / 1.6); } });
    surf(stone, 64, 1, function (i, j) { var a = i / 64 * Math.PI * 2; return [Math.cos(a) * RR, RC[1] + Math.sin(a) * RR, ZE + .4 * j]; }, { wrap: true, ao: function (i, j) { return 1 - .4 * j; } });
    sweep(rib, function (t) { var a = t * Math.PI * 2; return [Math.cos(a) * (RR + .06), RC[1] + Math.sin(a) * (RR + .06), ZE - .03]; }, 64, ring(.075, 8), function () { return [0, 0, 1]; });
    panel(rose, [-RR, RC[1] - RR, ZE + .38], [RR, RC[1] - RR, ZE + .38], [RR, RC[1] + RR, ZE + .38], [-RR, RC[1] + RR, ZE + .38]);

    // the altar: marble table with a gilded frontal, a gradine with six candles and the cross
    box(marble, -1.3, platY, zTable, 1.3, platY + 1.0, zTable + .62, [.7, 1]);
    panel(mesh("frontal"), [-1.08, platY + .1, zTable - .012], [1.08, platY + .1, zTable - .012], [1.08, platY + .9, zTable - .012], [-1.08, platY + .9, zTable - .012]);
    box(marble, -1.4, platY + 1.0, zTable - .05, 1.4, platY + 1.08, zTable + .67);
    box(marble, -1.2, platY + 1.08, zTable + .38, 1.2, platY + 1.22, zTable + .62);
    var gy = platY + 1.22;
    [-.95, -.65, -.35, .35, .65, .95].forEach(function (x, q) {
      var hgt = .34 + (2 - Math.abs(q < 3 ? 2 - q : q - 3)) * .06;
      lathe(gold, x, gy, zTable + .5, [[0, 0], [.07, 0], [.07, .02], [.03, .05], [.02, hgt * .5], [.035, hgt * .55], [.015, hgt * .6], [.015, hgt - .03], [.04, hgt - .02], [.04, hgt]], 12);
      lathe(wax, x, gy + hgt, zTable + .5, [[.02, 0], [.02, .22], [0, .23]], 8);
      lights.push({ kind: "flame", p: [x, gy + hgt + .27, zTable + .48], s: .07, c: [1, .9, .7], a: 1, ph: Math.random() * 9, candle: zTable });
      lights.push({ kind: "glow", p: [x, gy + hgt + .27, zTable + .47], s: .9, c: [1, .62, .3], a: .25, ph: Math.random() * 9, candle: zTable });
    });
    box(gold, -.03, gy, zTable + .48, .03, gy + .92, zTable + .54);
    box(gold, -.21, gy + .62, zTable + .48, .21, gy + .68, zTable + .54);
    points.push({ p: [0, gy + .7, zTable - .3], c: [1, .66, .36], i: 1.4, k: .35, candle: zTable });

    // the reredos behind the altar: stone panelling with five starry niches, pinnacles and a gable
    var zr = ZE - .5;
    box(stone, -2.2, platY, zr, 2.2, platY + .8, zr + .4, [.7, 1]);
    box(stone, -2.0, platY + .8, zr + .1, 2.0, 3.85, zr + .4);
    [-1.5, -.75, 0, .75, 1.5].forEach(function (x, q) {
      var w = q === 2 ? .62 : .5, h = q === 2 ? 2.4 : 2.0, y0 = platY + 1.0;
      panel(niche, [x - w / 2, y0, zr + .09], [x + w / 2, y0, zr + .09], [x + w / 2, y0 + h, zr + .09], [x - w / 2, y0 + h, zr + .09]);
    });
    [-2.0, -1.125, -.375, .375, 1.125, 2.0].forEach(function (x) {
      lathe(rib, x, platY + .8, zr + .06, [[.06, 0], [.05, .06], [.045, 2.5], [.07, 2.56], [.07, 2.62]], 10);
      lathe(stone, x, 3.85, zr + .2, [[.13, 0], [.13, .16], [.1, .2], [.1, .22], [.0, .72]], 8, function (a, j) { return j === 4 ? 1 : 1 + .12 * Math.pow(Math.abs(Math.cos(a * 2)), 4); });
      lathe(gold, x, 4.57, zr + .2, [[0, 0], [.03, .02], [0, .07]], 6);
    });
    surf(stone, 16, 1, function (i, j) { var x = -.8 + 1.6 * i / 16; return [x, j ? 3.85 + .62 * (1 - Math.abs(x) / .8) : 3.85, zr + .12]; });
    box(gold, -.03, 4.47, zr + .1, .03, 4.55 + .0, zr + .16);

    // two tall candle stands before the steps, where the couple will stand
    [-1, 1].forEach(function (s) {
      var x = s * 1.32, z = M.coupleZ + .9;
      lathe(gold, x, 0, z, [[0, 0], [.18, 0], [.18, .03], [.08, .08], [.04, .2], [.03, 1.1], [.06, 1.2], [.03, 1.28], [.1, 1.3], [.1, 1.33]], 16);
      lathe(wax, x, 1.33, z, [[.03, 0], [.03, .26], [0, .27]], 8);
      lights.push({ kind: "flame", p: [x, 1.66, z - .02], s: .09, c: [1, .9, .7], a: 1, ph: Math.random() * 9, candle: z });
      lights.push({ kind: "glow", p: [x, 1.66, z - .03], s: 2.4, c: [1, .62, .3], a: .3, ph: Math.random() * 9, candle: z });
      lights.push({ kind: "pool", p: [x * .8, 0, z - .6], s: 3.2, c: [1, .6, .3], a: .1, ph: Math.random() * 9, candle: z });
    });

    // pews: back, seat, kneeler and carved ends, in two blocks either side of the aisle
    var endPoly = function (r) {
      var pts = [[r - .07, 0], [r + .56, 0], [r + .56, .55]];
      for (var e = 1; e <= 8; e++) { var a = e / 8 * Math.PI / 2; pts.push([r - .07 + .63 * Math.cos(a), .55 + .5 * Math.sin(a)]); }
      return pts;
    };
    for (var r = M.pewFrom; r <= M.pewTo + .01; r += 1) {
      [-1, 1].forEach(function (s) {
        var xa = s < 0 ? -M.pewOut : M.pewIn, xb = s < 0 ? -M.pewIn : M.pewOut;
        box(wood, xa, .12, r, xb, .95, r + .05, [.45, 1]);
        sweep(wood, function (t) { return [xa + (xb - xa) * t, .965, r + .025]; }, 1, [[-.055, -.03], [-.05, .015], [-.025, .04], [.025, .04], [.05, .015], [.055, -.03]], function () { return [0, 0, 1]; });
        box(wood, xa, .8, r - .012, xb, .83, r);
        for (var pn = 0; pn < 3; pn++) {
          var pw = (xb - xa - .16) / 3, px0 = xa + .08 + pn * pw;
          box(dark, px0 + .03, .3, r - .008, px0 + pw - .03, .74, r, [.8, 1]);
        }
        box(wood, xa, .42, r + .05, xb, .47, r + .5, [.8, .9]);
        box(wood, xa, .08, r - .36, xb, .17, r - .22, [.4, .55]);
        [s * M.pewIn, s * M.pewOut].forEach(function (xe, q) {
          slabX(wood, endPoly(r), xe - .035, xe + .035, .9);
          if (!q) slabX(wood, endPoly(r).map(function (pt) { return [r + .25 + (pt[0] - r - .25) * .7, .22 + (pt[1] - .22) * .66]; }), xe - s * .05 - .01, xe - s * .05 + .01, .7);
        });
      });
    }

    // bronze chandeliers hanging down the nave, each with two tiers of candles
    [4.5, 10.5, 16.5, 22.5].forEach(function (zc) {
      var yc = 5.0;
      lathe(gold, 0, yc, zc, [[0, -.5], [.05, -.46], [.09, -.36], [.05, -.25], [.13, -.1], [.15, 0], [.09, .07], [.05, .22], [.11, .4], [.075, .55], [.03, .66], [.035, .95], [.025, 1.0]], 16);
      lathe(gold, 0, yc + 1.0, zc, [[.012, 0], [.012, apex - yc - 1.1]], 6);
      [[8, .82, 0, -.02], [6, .48, .5, .48]].forEach(function (tier) {
        var n = tier[0], R = tier[1], y1 = tier[2], yr = yc + tier[3];
        sweep(gold, function (t) { var a = t * Math.PI * 2; return [Math.cos(a) * R * .96, yr, zc + Math.sin(a) * R * .96]; }, 40, ring(.016, 6), function () { return [0, 1, 0]; });
        for (var q = 0; q < n; q++) {
          var a = (q + .5) / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          (function (ca, sa) {
            // an S-curved arm out from the stem, ending in a cup with a candle
            sweep(gold, function (t) {
              var u = 1 - t, r0 = .08, r3 = R, y0 = y1 - .06, y3 = y1 + .06;
              var rr = u * u * u * r0 + 3 * u * u * t * (R * .35) + 3 * u * t * t * (R * .95) + t * t * t * r3;
              var yy = yc + u * u * u * y0 + 3 * u * u * t * (y1 - .42) + 3 * u * t * t * (y1 - .32) + t * t * t * y3;
              return [ca * rr, yy, zc + sa * rr];
            }, 14, ring(.017, 6), function () { return [-sa, 0, ca]; });
            var cx = ca * R, cz = zc + sa * R, cy = yc + y1 + .06;
            lathe(gold, cx, cy, cz, [[.0, 0], [.03, .01], [.065, .05], [.06, .06]], 10);
            lathe(wax, cx, cy, cz, [[.019, .04], [.019, .2], [0, .21]], 6);
            lights.push({ kind: "flame", p: [cx, cy + .25, cz], s: .06, c: [1, .9, .7], a: .95, ph: Math.random() * 9, candle: zc });
            lights.push({ kind: "glow", p: [cx, cy + .25, cz - .01], s: .55, c: [1, .66, .34], a: .3, ph: Math.random() * 9, candle: zc });
          })(ca, sa);
        }
      });
      lights.push({ kind: "glow", p: [0, yc + .2, zc], s: 3.4, c: [1, .64, .32], a: .12, ph: Math.random() * 9, candle: zc });
      lights.push({ kind: "pool", p: [0, 0, zc], s: 4.2, c: [1, .66, .36], a: .1, ph: 0, candle: zc });
      points.push({ p: [0, yc + .1, zc], c: [1, .66, .38], i: 2.6, k: .16, candle: zc });
    });

    // the sanctuary is the brightest place; the rose window glows into it
    points.push({ p: [0, 4.2, 25.2], c: [1, .74, .48], i: 2.4, k: .06, still: true });
    points.push({ p: [0, RC[1], ZE - .6], c: [1, .7, .45], i: 1.2, k: .12, still: true, rose: true });

    // light: daylight beams from the left clerestory and aisle windows, and soft halos at the glass
    for (var bb = 0; bb < M.piers - 1; bb++) {
      var zc2 = M.firstPier + bb * M.bay + M.bay / 2, D = [.55, -1, .16], len = 9.2;
      [-.22, .22].forEach(function (dz, j) {
        lights.push({ kind: "beam", O: [-X - .2, COURSE + 1.6, zc2 + dz], U: [0, 1.0, 0], V: [D[0] * len, D[1] * len, D[2] * len], c: [1, .8, .5], a: j ? .06 : .08 });
      });
      var D2 = [1, -.62, .2], len2 = 6.4;
      lights.push({ kind: "beam", O: [-M.aisleX, 2.0, zc2], U: [0, 2.4, 0], V: [D2[0] * len2, D2[1] * len2, D2[2] * len2], c: [1, .78, .46], a: .08 });
      [-1, 1].forEach(function (s) {
        lights.push({ kind: "glow", p: [s * (X + .1), COURSE + 1.2, zc2], s: 2.2, c: [1, .8, .55], a: .05, still: true, win: true });
      });
    }
    lights.push({ kind: "glow", p: [0, RC[1], ZE - .1], s: 7.5, c: [1, .66, .36], a: .12, ph: 0, still: true, fog: .01, rose: true });
    lights.push({ kind: "pool", p: [0, platY + .01, 25.6], s: 6, c: [1, .7, .4], a: .1, ph: 0, still: true });

    // dust: random points in a box ahead of the camera, wrapped as we walk
    moteData = new Float32Array(NM * 4);
    motes = [];
    for (var m = 0; m < NM; m++) motes.push({ x: (Math.random() * 2 - 1) * 2.4, y: .3 + Math.random() * 6, z: Math.random() * 14, ph: Math.random() * 6.28, sp: .4 + Math.random() * .6 });
  }

  // the materials: tint, texture, mapping, scale, specular, shininess, emission, metal; drawn near things first
  var MATS = [
    ["wood", [1, 1, 1], "wood", 1, 1 / 1.1, .45, 40, 0, 0],
    ["dark", [.42, .3, .24], "wood", 1, 1 / 1.1, .1, 20, 0, 0],
    ["gold", [.86, .6, .3], "white", 0, 1, 1.3, 30, .02, 1],
    ["wax", [1, .94, .82], "white", 0, 1, .2, 10, .25, 0],
    ["lamp", [1, .8, .52], "white", 0, 1, 0, 1, .55, 0, "lamp"],
    ["stone", [1, 1, 1], "stone", 1, .5, .06, 14, 0, 0],
    ["shaft", [1, 1, 1], "stone", 4, .5, .08, 16, 0, 0],
    ["rib", [.97, .9, .76], "stone", 1, .5, .1, 18, 0, 0],
    ["marble", [1.05, 1.02, 1], "marble", 1, 1 / 2.4, .5, 60, 0, 0],
    ["niche", [1, 1, 1], "niche", 2, 1, .2, 20, .25, 0],
    ["frontal", [1, 1, 1], "frontal", 2, 1, .15, 16, .05, 0],
    ["carpet", [.62, .57, .57], "carpet", 2, 1, .05, 6, 0, 0],
    ["floor", [.95, .95, .95], "marble", 3, 1 / 2.4, .38, 50, 0, 0],
    ["vault", [1.04, 1, .95], "stone", 1, .5, .02, 8, 0, 0],
    ["stars", [1, 1, 1], "stars", 1, .45, .3, 20, .1, 0],
    ["glassC0", [1, 1, 1], "glassC0", 2, 1, 0, 1, .95, 0, "win"], ["glassC1", [1, 1, 1], "glassC1", 2, 1, 0, 1, .95, 0, "win"], ["glassC2", [1, 1, 1], "glassC2", 2, 1, 0, 1, .95, 0, "win"],
    ["glassA0", [1, 1, 1], "glassA0", 2, 1, 0, 1, .85, 0, "win"], ["glassA1", [1, 1, 1], "glassA1", 2, 1, 0, 1, .85, 0, "win"], ["glassA2", [1, 1, 1], "glassA2", 2, 1, 0, 1, .85, 0, "win"],
    ["glassH0", [1, 1, 1], "glassH0", 2, 1, 0, 1, 1.0, 0, "win"], ["glassH1", [1, 1, 1], "glassH1", 2, 1, 0, 1, 1.0, 0, "win"],
    ["rose", [1, 1, 1], "rose", 2, 1, 0, 1, 1.1, 0, "rose"],
  ];
  function upload() {
    MATS.forEach(function (mt) {
      var m = G[mt[0]];
      if (!m) return;
      m.flush();
      m.chunks.forEach(function (c) {
        var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, c.v, gl.STATIC_DRAW);
        var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, c.i, gl.STATIC_DRAW);
        draws.push({ mt: mt, vb: vb, ib: ib, n: c.i.length });
      });
      m.chunks = null;
    });
  }

  /* ------------------------------------------------------------- render */
  function setQuad(o, tint, fog, cut) {
    gl.uniform3fv(U.O, o.O); gl.uniform3fv(U.U, o.U); gl.uniform3fv(U.V, o.V);
    gl.uniform4fv(U.UV, o.uv); gl.uniform4fv(U.Tint, tint); gl.uniform1f(U.Fog, fog); gl.uniform1f(U.Cut, cut);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  var boundTex = null;
  function bind(t) { if (boundTex !== t) { gl.bindTexture(gl.TEXTURE_2D, t.t); boundTex = t; } }
  function flicker(l, t) {
    if (l.still || l.kind === "pool" || l.kind === "beam") return 1;
    var f = .045 * Math.sin(t * 2.1 + l.ph) + .025 * Math.sin(t * 3.4 + l.ph * 2);
    return 1 + (l.kind === "flame" ? f : f * .35);
  }
  function litBy(l, reach) {
    if (l.candle != null) return Math.min(1, Math.max(0, (reach - l.candle) / 1.6));
    return P.win * P.expo;
  }
  var LP = new Float32Array(32), LC = new Float32Array(24);

  // the camera this frame: where it stands (the aisle position plus its lean,
  // turned with the view) and the lens shift that keeps the pivot in place
  function view() {
    var c = Math.cos(P.yaw), s = Math.sin(P.yaw), ox = P.ox || 0, oy = P.oy || 0;
    var sh = P.orbit > 0 ? P.orbit * k / Math.max(.5, P.pivot) : 0;
    return { x: c * ox, y: M.eye + oy, z: P.camZ - s * ox, c: c, s: s, sx: ox * sh, sy: -oy * sh };
  }

  function render(time) {
    var cam = P.camZ, cw = W / dpr, ch = H / dpr, yc = Math.cos(P.yaw), ys = Math.sin(P.yaw), V = view();
    var tsec = time / 1000, reach = P.ignite * (M.altarZ + 2), win = P.win;
    gl.viewport(0, 0, W, H);
    gl.clearColor(.022, .016, .013, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    var proj = [2 * k / cw, 2 * k / ch, 2 * V.sx / cw, 1 - 2 * (hz + V.sy) / ch];
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.BLEND);

    /* the building */
    gl.useProgram(progB);
    gl.uniform3f(UB.Cam, V.x, V.y, V.z); gl.uniform4fv(UB.Proj, proj); gl.uniform2f(UB.Yaw, yc, ys);
    gl.uniform3f(UB.Eye, V.x, V.y, V.z);
    gl.uniform1f(UB.K, k * dpr);
    // the chandeliers, the altar, the sanctuary and the rose window: always the
    // same lights, steady (no flicker on the stone), lit one by one as the church wakes
    for (var q = 0; q < 8; q++) {
      var l0 = points[q], lit0 = 0;
      if (l0) { lit0 = l0.candle != null ? Math.min(1, Math.max(0, (reach - l0.candle) / 1.6)) : win; if (l0.rose) lit0 = win * (1 + P.bloom * 3); }
      LP[q * 4] = l0 ? l0.p[0] : 0; LP[q * 4 + 1] = l0 ? l0.p[1] : 0; LP[q * 4 + 2] = l0 ? l0.p[2] : 0; LP[q * 4 + 3] = l0 ? l0.k : 1;
      LC[q * 3] = l0 ? l0.c[0] * l0.i * lit0 : 0; LC[q * 3 + 1] = l0 ? l0.c[1] * l0.i * lit0 : 0; LC[q * 3 + 2] = l0 ? l0.c[2] * l0.i * lit0 : 0;
    }
    gl.uniform4fv(UB.LP, LP); gl.uniform3fv(UB.LC, LC);
    var amb = .035 + .085 * win;
    gl.uniform3f(UB.Amb, amb * 1.0, amb * .84, amb * .64);
    gl.uniform3f(UB.SunD, .48, .74, .2);
    gl.uniform3f(UB.SunC, .1 * win, .075 * win, .05 * win);
    gl.uniform3f(UB.Haze, .07, .05, .036);
    gl.uniform1f(UB.Fog, .022);
    gl.uniform1f(UB.Expo, P.expo);
    var grade = BRIGHT * (1 - DIM * P.dim);
    gl.uniform2f(UB.Grade, SAT + (1 - SAT) * P.bloom, grade + (1 - grade) * P.bloom);
    gl.enableVertexAttribArray(UB.aP); gl.enableVertexAttribArray(UB.aN); gl.enableVertexAttribArray(UB.aU); gl.enableVertexAttribArray(UB.aA);
    var curMat = null;
    boundTex = null;
    for (var i = 0; i < draws.length; i++) {
      var dr = draws[i], mt = dr.mt;
      if (curMat !== mt) {
        curMat = mt;
        bind(tex[mt[2]]);
        gl.uniform4f(UB.Alb, mt[1][0], mt[1][1], mt[1][2], mt[3]);
        var em = mt[7];
        if (mt[9] === "win") em *= .12 + .88 * win;
        else if (mt[9] === "rose") em *= (.12 + .88 * win) * (1 + P.bloom * 2.5);
        else if (mt[9] === "lamp") em *= Math.min(1, P.ignite * 1.5);
        gl.uniform4f(UB.Mat, mt[4], mt[5], mt[6], em);
        gl.uniform1f(UB.Metal, mt[8]);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, dr.vb);
      gl.vertexAttribPointer(UB.aP, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(UB.aN, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(UB.aU, 2, gl.FLOAT, false, 36, 24);
      gl.vertexAttribPointer(UB.aA, 1, gl.FLOAT, false, 36, 32);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dr.ib);
      gl.drawElements(gl.TRIANGLES, dr.n, gl.UNSIGNED_SHORT, 0);
    }
    gl.disableVertexAttribArray(UB.aN); gl.disableVertexAttribArray(UB.aU); gl.disableVertexAttribArray(UB.aA);

    /* light: additive, depth-tested so piers and pews occlude it */
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(U.aQ);
    gl.vertexAttribPointer(U.aQ, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(U.Cam, V.x, V.y, V.z);
    gl.uniform4fv(U.Proj, proj);
    gl.uniform2f(U.Yaw, yc, ys);
    gl.uniform1f(U.Expo, (grade + (1 - grade) * P.bloom) * .9);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE);
    boundTex = null;
    for (i = 0; i < lights.length; i++) {
      var l = lights[i], f = flicker(l, tsec), lit = litBy(l, reach);
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
        setQuad({ O: [p[0] - s / 2, p[1] || .01, p[2] - s / 2], U: [s, 0, 0], V: [0, 0, s], uv: [0, 0, 1, 1] }, col, .04, 0);
      } else {
        bind(l.kind === "flame" ? tex.flame : tex.glow);
        var sw = l.kind === "flame" ? s * .55 : s;
        setQuad({ O: [p[0] - sw / 2, p[1] - s / 2, p[2]], U: [sw, 0, 0], V: [0, s, 0], uv: [0, 0, 1, 1] }, col, l.fog || .04, 0);
      }
    }
    // dust in the light
    gl.useProgram(progP);
    gl.uniform3f(UP.Cam, V.x, V.y, V.z); gl.uniform4fv(UP.Proj, proj); gl.uniform1f(UP.Px, k * dpr);
    gl.uniform2f(UP.Yaw, yc, ys); gl.uniform1f(UP.Expo, P.expo * (.4 + .6 * P.win) * grade);
    for (i = 0; i < NM; i++) {
      var m = motes[i];
      var zz = cam + .6 + (((m.z - cam) % 14) + 14) % 14;
      var yy = m.y + Math.sin(tsec * .23 * m.sp + m.ph) * .25, xx = m.x + Math.sin(tsec * .17 * m.sp + m.ph * 2) * .3;
      // brighter inside the clerestory beams (x grows as y falls)
      var bx = -M.wallX + .55 * (COURSE + 1.6 - yy);
      var inBeam = Math.exp(-Math.pow((xx - bx) / .7, 2));
      moteData[i * 4] = xx; moteData[i * 4 + 1] = yy; moteData[i * 4 + 2] = zz;
      moteData[i * 4 + 3] = (.22 + .9 * inBeam) * (.75 + .25 * Math.sin(tsec * .6 * m.sp + m.ph));
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, moteData);
    gl.enableVertexAttribArray(UP.aP);
    gl.vertexAttribPointer(UP.aP, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, NM);
    gl.disableVertexAttribArray(UP.aP);
    gl.depthMask(true);

    /* focus: the church goes soft behind the words in front of it. Skipped
       only on a device already at its lowest resolution and still struggling. */
    if (post && P.focus > .003 && slowFrames < 4 && sizePost()) soften(Math.min(1, P.focus));
  }

  /* ------------------------------------------------------------- focus */
  function setupPost() {
    try { post = { down: compile(VS_F, FS_DOWN), up: compile(VS_F, FS_UP), comp: compile(VS_F, FS_COMP), w: 0, h: 0, lv: [] }; }
    catch (e) { post = null; return; }
    ["down", "up", "comp"].forEach(function (n) {
      var p = post[n];
      post[n] = { p: p, aQ: gl.getAttribLocation(p, "aQ"), T: gl.getUniformLocation(p, "uT"), U: gl.getUniformLocation(p, "uU"), H: gl.getUniformLocation(p, "uH"), A: gl.getUniformLocation(p, "uA"), M: gl.getUniformLocation(p, "uM") };
    });
  }
  function plainTex(w, h, fmt) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // the copy of the frame and smaller targets (1/2, 1/4, 1/8 and one more
  // 1/4 for the way back up), made again when the canvas changes size
  function sizePost() {
    if (post.w === W && post.h === H) return true;
    if (post.copy) gl.deleteTexture(post.copy.t);
    post.lv.forEach(function (l) { gl.deleteTexture(l.t); gl.deleteFramebuffer(l.fb); });
    post.copy = { t: plainTex(W, H, gl.RGB), w: W, h: H };   // the canvas has no alpha, so neither can its copy
    post.lv = [];
    for (var i = 1; i <= 4; i++) {
      var d = Math.pow(2, i < 4 ? i : 2), w = Math.max(1, Math.round(W / d)), h = Math.max(1, Math.round(H / d));
      var l = { t: plainTex(w, h, gl.RGBA), fb: gl.createFramebuffer(), w: w, h: h };
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, l.t, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      post.lv.push(l);
      if (!ok) { post = null; return false; }
    }
    post.w = W; post.h = H;
    return true;
  }
  // f 0..1: sharp → a little soft (by .4) → soft
  function soften(f) {
    var L = post.lv, a = Math.min(1, f / .4), m = Math.max(0, (f - .4) / .6);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, post.copy.t);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    function pass(pr, src, dst, spread) {
      var w = dst ? dst.w : W, h = dst ? dst.h : H;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(pr.p);
      gl.enableVertexAttribArray(pr.aQ);
      gl.vertexAttribPointer(pr.aQ, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, src.t);
      gl.uniform1i(pr.T, 0);
      if (pr.H) gl.uniform2f(pr.H, spread * .5 / w, spread * .5 / h);
      if (pr.A) { gl.uniform1f(pr.A, a); gl.uniform1f(pr.M, m); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // down to 1/2, 1/4 (a little soft), 1/8, and back up to 1/4 (soft)
    pass(post.down, post.copy, L[0], 1); pass(post.down, L[0], L[1], 1);
    if (m > 0) { pass(post.down, L[1], L[2], 1); pass(post.up, L[2], L[3], 1); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L[3].t); gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(post.comp.p); gl.uniform1i(post.comp.U, 1);
    pass(post.comp, L[1], null, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
    gl.disableVertexAttribArray(post.comp.aQ);
    gl.depthMask(true);
    boundTex = null;
  }

  /* --------------------------------------------------------- sizing */
  function resize() {
    var cw = host.clientWidth, ch = host.clientHeight;
    CW = cw;
    var want = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5);
    if (slowFrames > 2) want = Math.min(want, 1); else if (slowFrames > 1) want = Math.min(want, 1.15); else if (slowFrames > 0) want = Math.min(want, 1.3);
    dpr = want;
    W = Math.round(cw * dpr); H = Math.round(ch * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    // focal length: a portrait phone sees the aisle as a tall, narrow view
    k = Math.min(cw * 1.25, ch * .6);
    hz = ch * (cw < ch ? .375 : .42);
    dirty = true;
  }

  // where a world point appears on screen (CSS px), for anchoring page elements
  function project(x, y, z) {
    var V = view(), wx = x - V.x, wy = y - V.y, wz = z - V.z;
    var vx = wx * V.c - wz * V.s, vz = wx * V.s + wz * V.c;
    if (vz < .05) return null;
    return { x: CW / 2 + vx * k / vz + V.sx, y: hz + V.sy - wy * k / vz, s: k / vz, dz: vz };
  }

  // draw one frame with the given camera/light state (called by journey.js)
  function draw(now, p) {
    if (!ready) return;
    for (var key in p) P[key] = p[key];
    var sig = [P.camZ.toFixed(4), P.yaw.toFixed(4), P.expo.toFixed(3), P.ignite.toFixed(3), P.win.toFixed(3), P.bloom.toFixed(3), P.dim.toFixed(3)].join();
    // the lean and focus redraw too, but don't count as the journey moving
    // (the lean in steps of 2 mm, so the camera's slow float rarely redraws
    // on its own; a guest's hand moves it in many steps)
    var sig2 = [P.focus.toFixed(3), Math.round(P.ox * 500), Math.round(P.oy * 500), P.orbit.toFixed(2)].join();
    var moving = sig !== lastKey, changed = moving || sig2 !== lastKey2;
    lastKey = sig; lastKey2 = sig2;
    // at rest only the candles and dust move: ~24 redraws a second is plenty
    if (!changed && !dirty && now - lastDraw < 40) return;
    // if the device struggles while the journey moves, render fewer pixels
    if (moving && lastDraw) {
      acc += now - lastDraw; accN++;
      if (accN > 45) { if (acc / accN > 24 && slowFrames < 4) { slowFrames++; resize(); } acc = 0; accN = 0; }
    }
    lastDraw = now;
    dirty = false;
    render(now);
  }

  function init(el, o) {
    host = el; opts = o || {};
    canvas = document.createElement("canvas");
    canvas.className = "nave__gl";
    // failIfMajorPerformanceCaveat: no WebGL when it would be drawn in software
    // (devices without a usable graphics chip, test robots like PageSpeed):
    // 60 frames a second on the processor stutters badly, so those get the
    // still picture of the church instead, and the journey runs over it.
    var ctxOpts = { alpha: false, antialias: true, depth: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true };
    try { gl = canvas.getContext("webgl", ctxOpts) || canvas.getContext("experimental-webgl", ctxOpts); } catch (e) { gl = null; }
    if (!gl) { host.classList.add("nave--still"); return false; }
    // some software renderers don't report the caveat: recognise them by name
    var info = gl.getExtension("WEBGL_debug_renderer_info");
    var renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) {
      var lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
      gl = null; host.classList.add("nave--still"); return false;
    }
    host.insertBefore(canvas, host.firstChild);
    try {
      prog = compile(VS, FS); progB = compile(VS_B, FS_B); progP = compile(VS_P, FS_P);
    } catch (e) { host.classList.add("nave--still"); canvas.remove(); return false; }
    U.aQ = gl.getAttribLocation(prog, "aQ");
    ["O", "U", "V", "Cam", "UV", "Proj", "Tint", "Fog", "Cut", "T", "Yaw", "Expo"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, "u" + n); });
    ["aP", "aN", "aU", "aA"].forEach(function (n) { UB[n] = gl.getAttribLocation(progB, n); });
    ["Cam", "Proj", "Yaw", "T", "Alb", "Mat", "Metal", "Eye", "Amb", "SunD", "SunC", "Haze", "Expo", "Fog", "Grade", "K"].forEach(function (n) { UB[n] = gl.getUniformLocation(progB, "u" + n); });
    UB.LP = gl.getUniformLocation(progB, "uLP[0]"); UB.LC = gl.getUniformLocation(progB, "uLC[0]");
    UP.aP = gl.getAttribLocation(progP, "aP");
    ["Cam", "Proj", "Px", "Yaw", "Expo"].forEach(function (n) { UP[n] = gl.getUniformLocation(progP, "u" + n); });
    aniso = gl.getExtension("EXT_texture_filter_anisotropic") || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    if (opts.focus !== false) setupPost();
    quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    moteBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, NM * 16, gl.DYNAMIC_DRAW);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    resize();
    // paint the textures and build the church in small steps (none long
    // enough to stutter the opening animation); it shows once all are done
    var rise = function (w) { return pointed(0, w, 0, 1.6)(w / 2); };
    var steps = [
      makeSprites,
      function () { tex.stone = texture(stoneTex(), true); },
      function () { tex.marble = texture(marbleTex(), true); },
      function () { tex.wood = texture(woodTex(), true); tex.carpet = texture(carpetTex(), true); },
      function () { tex.stars = texture(starTex(), true); tex.niche = texture(nicheTex()); tex.frontal = texture(frontalTex()); },
      function () { tex.rose = texture(roseTex()); },
      function () { for (var v = 0; v < 3; v++) tex["glassC" + v] = texture(lancetTex(.92, 1.25 + rise(.92), 1.25, v, 128, 512)); },
      function () { tex.glassA0 = texture(lancetTex(1.1, 2.7 + rise(1.1), 2.7, 0, 256, 1024)); },
      function () { tex.glassA1 = texture(lancetTex(1.1, 2.7 + rise(1.1), 2.7, 1, 256, 1024)); },
      function () { tex.glassA2 = texture(lancetTex(1.1, 2.7 + rise(1.1), 2.7, 2, 256, 1024)); },
      function () { tex.glassH0 = texture(lancetTex(1.0, 3.8 + rise(1.0), 3.8, 1, 256, 1024)); },
      function () { tex.glassH1 = texture(lancetTex(1.0, 3.8 + rise(1.0), 3.8, 2, 256, 1024)); },
      build,
      function () { upload(); ready = true; dirty = true; },
    ];
    (function next() {
      if (!gl || gl.isContextLost()) return;
      steps.shift()();
      if (steps.length) setTimeout(next, 0);
    })();
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
