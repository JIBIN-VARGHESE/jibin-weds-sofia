/* =============================================================================
   The journey — one continuous scene driven by one number.

   Everything you see is fixed and placed here, every frame, from a single
   timeline position `s`. The page doesn't scroll: the journey is cut into
   CHAPTERS and the guest taps "Continue" (or swipes once) to move on; the
   timeline then plays on its own to that chapter's stop: the camera glides,
   turns to the next card, the card settles, words reveal. The opening plays
   by itself, and so does the finale.

     0    – 1.1   arrival: the photo and names, fading to black
     1.0  – 2.5   the church wakes: candles light down the aisle, then windows
     2.4  – 3.9   "Save the Date" hangs in the aisle; you walk through it
     3.9  – 15.6  stations: each card stands in the aisle; the camera turns
                  to it, it comes to the centre and holds, then you walk past
     5.6  – 7.4   (between stations) the verse under the rose window
     15.6 – 16.8  the light: the rose window floods the screen
     16.8 – 20.5  together: the photograph, the names, the verse, one candle

   Edit the timings in STATIONS / the keyframes below; the README explains.
   ========================================================================== */
(function () {
  "use strict";

  var TOTAL = 20.5;          // length of the timeline (in "screens" of the original scroll story)
  // the chapters: where the timeline rests after each swipe
  var STOPS = [0, 4.75, 8.22, 9.82, 11.42, 12.98, 14.85, 20.4];   // (the verse plays on the way from the invitation to the engagement)
  // how fast the timeline plays (units per second) in each stretch
  function rate(x) {
    if (x < 1.1) return .38;            // the opening photo fades
    if (x < 2.35) return .42;           // the church wakes
    if (x > 2.95 && x < 3.2) return .1;    // Save the Date rests in the centre (~2.5 s), then you walk through it
    if (x < 3.9) return .34;            // Save the Date settles, and you walk through it
    if (x > 5.6 && x < 6.25) return .3;    // the verse appears and its words light up
    if (x > 6.25 && x < 6.75) return .25;  // ...it rests (~2 s), then you walk through it
    if (x < 15.6) return .46;           // walking between the cards (an unhurried glide)
    if (x < 16.9) return .36;           // the light
    return .42;                         // the finale reveals
  }
  var GATE_AT = 1400;       // ms after the names begin to appear that "Open the invitation" is offered
  var HURRY = 2.8;           // a tap or swipe while the journey moves plays it this much faster, to the next stop
  var REPEAT_INTRO = 1;      // opening speed for a guest who has seen it before (1 = the same as the first time)
  var HOLD = 2.35;           // metres between camera and a card while you read it
  var CARD_Y = 1.5;          // card height above the floor (metres)

  // where each card stands (z along the aisle, x left/right) and when (screens):
  // s0 approach starts, a = arrives and holds, b = hold ends, s1 = walked past
  var STATIONS = [
    { id: "invitation", z: 6.6,  x: .7,  s0: 3.9,  a: 4.35,  b: 5.15, s1: 5.6 },
    { id: "engagement", z: 11.4, x: -.7, s0: 7.4,  a: 7.85,  b: 8.6,  s1: 9.0 },
    { id: "ceremony",   z: 13.8, x: .7,  s0: 9.0,  a: 9.45,  b: 10.2, s1: 10.6 },
    { id: "reception",  z: 16.2, x: -.7, s0: 10.6, a: 11.05, b: 11.8, s1: 12.2 },
    { id: "countdown",  z: 18.6, x: .6,  s0: 12.2, a: 12.65, b: 13.3, s1: 13.6 },
    { id: "rsvp",       z: 21.6, x: 0,   s0: 13.6, a: 14.1,  b: 15.6, s1: 16.1, stay: true },
  ];
  var VERSE_Z = 9.0, SAVE_Z = 4.2;
  // camera position along the aisle (metres) at given timeline positions;
  // a smooth curve runs through these, so it eases into every stop. Words
  // (Save the Date, the verse) hang in the aisle and the camera walks
  // through them; at each card it stops 2.35 m away and turns to it.
  var CAM = [
    [0, -1.5], [1.0, -1.5], [2.4, .4], [2.95, 1.5], [3.2, 1.6], [3.75, 3.4], [3.9, 3.6],
    [4.35, 4.25], [5.15, 4.45], [5.6, 5.7],
    [6.25, 6.6], [6.75, 6.75], [7.3, 8.4],
    [7.85, 9.05], [8.6, 9.25], [9.0, 10.5],
    [9.45, 11.45], [10.2, 11.65], [10.6, 12.9],
    [11.05, 13.85], [11.8, 14.05], [12.2, 15.3],
    [12.65, 16.25], [13.3, 16.45], [13.6, 17.7],
    [14.1, 19.25], [15.6, 19.45], [16.8, 20.4], [TOTAL + 1, 20.4],
  ];

  var doc = document, root = doc.documentElement;
  var settled = 0, intro = false, introGo = false, resting = false, boost = 1, introBoost = 1, readyAt = 0, gate = true;
  var el = {}, cards = [], camAt, sm = 0, vel = 0, last = 0, dust = null, opts = {}, chapter = 0;

  /* ---------------------------------------------------------- helpers */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ss(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function bump(a, b, c, d, x) { return ss(a, b, x) * (1 - ss(c, d, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // monotone cubic interpolation (no overshoot, so the camera never walks backwards)
  function monotone(pts) {
    var n = pts.length, xs = [], ys = [], m = [], d = [];
    for (var i = 0; i < n; i++) { xs.push(pts[i][0]); ys.push(pts[i][1]); }
    for (i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m.push(d[0]);
    for (i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    m.push(d[n - 2]);
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
      if (h > 9) { var t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      var k = 0; while (xs[k + 1] < x) k++;
      var hh = xs[k + 1] - xs[k], t = (x - xs[k]) / hh, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * hh * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * hh * m[k + 1];
    };
  }

  /* ------------------------------------------------------------ setup */
  function measure() {}
  function stopIndexNear(x) { var k = 0; for (var i = 0; i < STOPS.length; i++) if (STOPS[i] <= x + 1e-6) k = i; return k; }
  // move one chapter at a time, and only once the current one has finished
  function goTo(i) {
    if (intro) return;
    i = clamp(i, 0, STOPS.length - 1);
    if (Math.abs(i - settled) > 1) i = settled + (i > settled ? 1 : -1);
    chapter = i;
  }
  // the opening plays by itself: a scroll or tap during it only makes the
  // "sit back" line glow, so guests see there is nothing to do yet (before
  // the invitation is opened, the seal glows instead)
  function nudge() {
    var n = gate ? el.gate : el.intro;
    if (!n) return;
    n.classList.remove("is-nudge"); void n.offsetWidth; n.classList.add("is-nudge");
  }
  // "Open the invitation": the guest's tap starts the music (browsers allow
  // sound only after a touch) and the journey
  function openInvite() {
    if (!gate || !readyAt) return;
    gate = false; introGo = true;
    if (navigator.vibrate) try { navigator.vibrate(14); } catch (e) {}   // a soft tap as the seal breaks (Android)
    if (el.gate) { el.gate.classList.add("is-open"); el.gate.blur(); }
    doc.dispatchEvent(new CustomEvent("invite:open"));
  }
  // after the opening, input while the journey moves is never lost: it hurries the move along
  function hurry() {
    if (gate) return openInvite();
    if (intro) return nudge();
    boost = HURRY;
  }
  function next() {
    if (gate) return nudge();
    if (intro) return nudge();
    if (!resting && STOPS[chapter] > sm) return hurry();
    if (resting) { goTo(settled + 1); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} }
  }
  function back() {
    if (intro) return;
    if (!resting) { if (STOPS[chapter] < sm) hurry(); return; }
    if (settled > 1) goTo(settled - 1);
  }

  function init(o) {
    opts = o || {};
    root.classList.add("journey");
    el.scroller = doc.querySelector(".scroller");
    el.hint = doc.querySelector(".next-hint");
    el.back = doc.querySelector(".back-hint");
    el.intro = doc.querySelector(".intro-hint");
    el.gate = doc.querySelector(".gate");
    if (el.gate) el.gate.addEventListener("click", openInvite);
    if (el.hint) el.hint.addEventListener("click", next);
    if (el.back) el.back.addEventListener("click", back);
    // a single deliberate swipe (or wheel / arrow key) counts as one tap
    var ty = null, tx = null;
    // a plain tap on the church (not on a link, button or field) while it moves hurries it along
    doc.addEventListener("click", function (e) {
      if (resting && !intro) return;
      if (e.target.closest && e.target.closest("a, button, input, textarea, select, label")) return;
      if (gate) return openInvite();
      hurry();
    });
    window.addEventListener("touchstart", function (e) { var t = e.touches[0]; ty = t.clientY; tx = t.clientX; }, { passive: true });
    window.addEventListener("touchend", function (e) {
      if (ty == null) return;
      var t = e.changedTouches[0], dy = t.clientY - ty, dx = t.clientX - tx; ty = null;
      // a tap: iPhones send no "click" for taps on plain parts of the page, so catch it here
      if (Math.abs(dy) < 12 && Math.abs(dx) < 12) {
        if ((!resting || intro) && !(e.target.closest && e.target.closest("a, button, input, textarea, select, label"))) hurry();
        return;
      }
      if (Math.abs(dy) < 60 || Math.abs(dy) < Math.abs(dx) * 1.3) return;
      if (doc.activeElement && /INPUT|TEXTAREA/.test(doc.activeElement.tagName)) return;
      dy < 0 ? next() : back();
    }, { passive: true });
    var wheelAt = 0;
    window.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaY) < 25 || performance.now() - wheelAt < 900) return;
      wheelAt = performance.now();
      e.deltaY > 0 ? next() : back();
    }, { passive: true });
    window.addEventListener("keydown", function (e) {
      var t = e.target && e.target.closest ? e.target : doc.body;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      // Space on a button or link must press it (the guest stepper, "Send reply"), not move on
      if (e.key === " " && t.closest("button, a")) return;
      if (gate && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return openInvite(); }
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); back(); }
    });
    // after a reply is sent, the ending begins on its own
    doc.addEventListener("rsvp:sent", function () {
      setTimeout(function () { if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur(); goTo(STOPS.length - 1); }, 3200);
    });
    el.hero = doc.querySelector(".hero");
    el.heroImg = doc.querySelector(".hero__film");
    el.heroText = doc.querySelector(".hero__content");
    el.cue = doc.querySelector(".scroll-cue");
    el.nave = doc.querySelector(".nave");
    el.wake = doc.getElementById("wake");
    el.save = doc.getElementById("save-the-date");
    el.verse = doc.getElementById("verse");
    el.presence = doc.getElementById("presence");
    el.finale = doc.getElementById("closing");
    el.photo = doc.querySelector(".finale__photo img");
    el.flash = doc.querySelector(".flash");
    el.progress = doc.querySelector(".progress span");
    el.mark = doc.querySelector(".topbar__mark");
    el.fin = {
      names: doc.querySelector(".finale__names"), full: doc.querySelector(".finale__full"),
      date: doc.querySelector(".finale__date"), quote: doc.querySelector(".finale__quote"),
      ref: doc.querySelector(".finale__ref"), candle: doc.querySelector(".finale__candle"),
      share: doc.querySelector(".finale__share"), plan: doc.querySelector(".finale__plan"),
    };
    STATIONS.forEach(function (st) {
      var node = doc.getElementById(st.id);
      if (node) cards.push({ st: st, node: node, o: -1, pe: null });
    });
    camAt = monotone(CAM);

    // the church
    var gl = window.Nave && window.Nave.init(el.nave, { art: opts.art || {} });
    if (!gl && window.Nave) window.Nave.initFallback(el.nave);

    measure();
    window.addEventListener("resize", measure, { passive: true });
    if (el.mark) el.mark.addEventListener("click", function (e) { e.preventDefault(); window.scrollTo(0, 0); });

    dust = makeDust(doc.querySelector(".finale__dust"));
    window.scrollTo(0, 0);
    chapter = 0; sm = 0; settled = 0;
    // the opening: the names appear, then the wax seal ("Open the
    // invitation"). Once opened, the photo → church → Save the Date →
    // invitation plays on its own.
    intro = chapter === 0;
    try { if (localStorage.getItem("journey-seen")) introBoost = REPEAT_INTRO; } catch (e) {}
    (function offer() {
      if (!readyAt && root.classList.contains("is-ready")) readyAt = Date.now();
      if (readyAt && Date.now() - readyAt >= GATE_AT) { if (el.gate) el.gate.classList.add("is-on"); return; }
      setTimeout(offer, 100);
    })();
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------ frame */
  var cache = {};
  function setStyle(node, key, prop, val) {          // write only when a value changes
    var id = key + prop;
    if (cache[id] === val) return;
    cache[id] = val;
    node.style.setProperty(prop, val);
  }

  var VW = 0, VH = 0;   // the screen size, read once per frame before anything is written (no forced layouts)
  function frame(now) {
    requestAnimationFrame(frame);
    VW = root.clientWidth; VH = window.innerHeight;
    var dt = last ? Math.min(.05, (now - last) / 1000) : .016;
    last = now;
    // the chapter you have swiped to; the timeline plays toward its stop on
    // its own, easing out of rest and settling gently at the stop. However
    // far a swipe flings the page, the journey moves one chapter at a time.
    if (intro) chapter = introGo ? 1 : 0;
    var target = STOPS[chapter];
    var gap = target - sm, dist = Math.abs(gap);
    var backward = gap < 0 ? 2.2 : 1;                             // going back is a little quicker
    var again = intro && (sm < 2.35 || sm > 3.9) ? introBoost : 1;   // returning guests: faster, but Save the Date keeps its full time
    var speed = dist < 1e-4 ? 0 : rate(sm) * backward * again * boost * Math.min(1, .12 + dist / .45);
    vel += (speed - vel) * (1 - Math.exp(-dt / .28));
    var step = Math.min(dist, vel * dt);
    sm += gap > 0 ? step : -step;
    if (dist - step < 1e-4) { sm = target; vel = 0; }
    var s = sm;
    resting = sm === target;
    if (resting) {
      settled = chapter; boost = 1;
      if (intro && chapter === 1) {                           // the opening is over: hand over to the guest
        intro = false;
        try { localStorage.setItem("journey-seen", "1"); } catch (e) {}
      }
    }

    /* arrival */
    var heroOut = ss(.3, 1.05, s);
    setStyle(el.hero, "h", "opacity", (1 - heroOut).toFixed(3));
    setStyle(el.hero, "h", "visibility", heroOut >= 1 ? "hidden" : "visible");
    if (heroOut < 1) {
      setStyle(el.heroImg, "hi", "transform", "scale(" + (1 + .07 * clamp(s, 0, 1.1)).toFixed(4) + ")");
      setStyle(el.heroText, "ht", "transform", "translate3d(0," + (-60 * ss(0, .8, s)).toFixed(1) + "px,0)");
      setStyle(el.heroText, "ht", "opacity", (1 - ss(.05, .55, s)).toFixed(3));
      if (el.cue) setStyle(el.cue, "cu", "opacity", (1 - ss(0, .12, s)).toFixed(3));
    }
    if (el.mark) el.mark.classList.toggle("is-away", s > .8);
    if (el.progress) setStyle(el.progress, "pg", "--progress", clamp(s / TOTAL, 0, 1).toFixed(4));

    // the opening's "sit back" line, with its progress: the photo's rest, then the walk in
    if (el.intro) {
      el.intro.classList.toggle("is-on", intro && introGo);
      var ip = !intro ? 1 : clamp(sm / STOPS[1], 0, 1);
      setStyle(el.intro, "ih", "--p", ip.toFixed(3));
    }
    // a quiet "swipe up" cue whenever the journey rests and there is more
    if (el.hint) {
      var showHint = resting && !intro && chapter > 0 && chapter < STOPS.length - 1;
      el.hint.classList.toggle("is-on", showHint);
      if (el.back) el.back.classList.toggle("is-on", resting && !intro && chapter > 1);
    }

    /* the church: camera, turn toward the card being read, light */
    var camZ = camAt(s), yaw = 0, holdAny = 0;
    var P = window.Nave && window.Nave.P;
    if (P) P.camZ = camZ;                            // so project() below uses this frame's camera
    cards.forEach(function (c) {
      var st = c.st;
      c.h = ss(lerp(st.s0, st.a, .25), st.a, s) * (st.stay ? 1 - ss(st.b, st.s1, s) : 1 - ss(st.b, lerp(st.b, st.s1, .55), s));
      if (c.h > 0 && st.x) yaw += c.h * Math.atan2(st.x, Math.max(.4, st.z - camZ));
      holdAny = Math.max(holdAny, c.h);
    });
    var lightUp = ss(1.0, 2.4, s);
    var bloom = ss(15.6, 16.7, s) + .18 * bump(5.7, 6.3, 6.9, 7.5, s);   // the rose window: brighter for the verse, then floods
    var finaleOn = s > 16.6;
    if (window.Nave) {
      window.Nave.P.yaw = yaw;
      // the church steps back (dims) while a card or words are in front of it
      var dim = Math.max(holdAny, bump(1.15, 1.45, 2.05, 2.35, s), bump(2.35, 2.9, 3.2, 3.6, s), bump(5.6, 6.0, 6.75, 7.1, s));
      if (!finaleOn || s < 17.6) window.Nave.draw(now, { camZ: camZ, yaw: yaw, expo: .04 + .96 * lightUp, ignite: ss(1.05, 2.6, s), win: ss(1.8, 2.9, s), bloom: bloom, dim: dim });
    }
    setStyle(el.nave, "nv", "visibility", s > 17.6 ? "hidden" : "visible");

    /* 2 · welcome */
    var w = bump(1.15, 1.45, 2.05, 2.35, s);
    setStyle(el.wake, "wk", "opacity", w.toFixed(3));
    setStyle(el.wake, "wk", "transform", "translate3d(0," + ((1 - ss(1.15, 1.6, s)) * 14 - ss(2.05, 2.35, s) * 14).toFixed(1) + "px,0)");

    /* 3 · Save the Date hangs in the aisle */
    // it settles in the centre of the screen, rests, then you walk through it
    anchor(el.save, "sv", 0, 2.05, SAVE_Z, 2.6, ss(2.35, 2.9, s), 1.6, bump(2.45, 2.95, 3.2, 3.6, s));

    /* 4 · the cards */
    cards.forEach(function (c) { placeCard(c, s); });

    /* the verse hangs in the aisle under the brightening rose window: it
       settles, its words light up, it rests, then you walk through it */
    anchor(el.verse, "vs", 0, 1.75, VERSE_Z, 2.4, ss(5.6, 5.95, s), 1.4, bump(5.6, 6.0, 6.75, 7.1, s));
    setStyle(el.verse, "vs", "--p", clamp((s - 5.75) / .75, 0, 1).toFixed(4));

    /* 5 · the light */
    var pr = bump(15.75, 16.05, 16.45, 16.75, s);
    setStyle(el.presence, "pr", "opacity", pr.toFixed(3));
    setStyle(el.presence, "pr", "visibility", pr > 0 ? "visible" : "hidden");
    var fl = ss(16.15, 16.75, s) * (1 - ss(16.8, 17.5, s));
    if (fl > 0 && !el.flashDrawn) paintFlash();
    setStyle(el.flash, "fl", "opacity", fl.toFixed(3));

    /* 6 · together */
    setStyle(el.finale, "fn", "visibility", finaleOn ? "visible" : "hidden");
    if (finaleOn) {
      var f = clamp((s - 16.75) / (TOTAL - 16.75), 0, 1);
      setStyle(el.photo, "ph", "transform", "scale(" + (1.0 + .085 * f).toFixed(4) + ")");
      var wr = ss(17.25, 18.0, s);
      setStyle(el.fin.names, "fnn", "--write", wr.toFixed(4));
      setStyle(el.fin.full, "ff", "opacity", ss(17.9, 18.25, s).toFixed(3));
      setStyle(el.fin.date, "fd", "opacity", ss(18.05, 18.4, s).toFixed(3));
      setStyle(el.fin.quote, "fq", "opacity", ss(18.45, 18.9, s).toFixed(3));
      setStyle(el.fin.ref, "fr", "opacity", ss(18.7, 19.0, s).toFixed(3));
      if (el.fin.plan) setStyle(el.fin.plan, "fp", "opacity", ss(18.85, 19.25, s).toFixed(3));
      if (el.fin.share) setStyle(el.fin.share, "fs", "opacity", ss(19.0, 19.4, s).toFixed(3));
      if (dust) dust.draw(now, ss(16.8, 17.6, s), ss(19.05, 19.5, s));
    }
  }

  // the flood of light at the altar: a warm white radial glow, painted once
  function paintFlash() {
    var c = el.flash; if (!c || !c.getContext) return;
    c.width = Math.max(1, Math.round(c.clientWidth / 2)); c.height = Math.max(1, Math.round(c.clientHeight / 2));
    var g = c.getContext("2d"), w = c.width, h = c.height;
    var rg = g.createRadialGradient(w / 2, h * .3, 0, w / 2, h * .3, Math.max(w, h) * .9);
    rg.addColorStop(0, "#FFFDF7"); rg.addColorStop(.45, "#FFF2D8"); rg.addColorStop(1, "#F0CE98");
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    el.flashDrawn = true;
  }
  window.addEventListener("resize", function () { el.flashDrawn = false; }, { passive: true });

  // a page element hanging in the church at (x, y, z): it is drawn at its
  // CSS size when it is `at` metres away and grows/shrinks with distance
  function anchor(node, key, x, y, z, at, fadeIn, gone, centre) {
    var p = window.Nave && window.Nave.project(x, y, z);
    var o = p ? fadeIn * ss(gone * .55, gone, p.dz) : 0;
    setStyle(node, key, "opacity", o.toFixed(3));
    setStyle(node, key, "visibility", o > .002 ? "visible" : "hidden");
    if (o > .002) {
      var c = centre || 0, px = lerp(p.x, VW / 2, c), py = lerp(p.y, VH * .44, c);
      setStyle(node, key, "transform", "translate3d(" + px.toFixed(1) + "px," + py.toFixed(1) + "px,0) translate(-50%,-50%) scale(" + (at / p.dz).toFixed(4) + ")");
    }
  }

  function placeCard(c, s) {
    var st = c.st, node = c.node, key = "c" + st.id;
    var on = s > st.s0 - .7 && s < st.s1 + .3;
    if (!on) { setStyle(node, key, "visibility", "hidden"); setStyle(node, key, "opacity", "0"); return; }
    var p = window.Nave.project(st.x, CARD_Y, st.z), vw = VW, vh = VH;
    var h = c.h;
    // a card never needs scrolling inside: if it is taller than the screen
    // (small phones), it is shown slightly smaller, leaving room for "Continue"
    if (!c.ht || c.vh !== vh) { c.ht = node.offsetHeight; c.vh = vh; }
    // on big landscape screens the cards are shown up to 30% larger
    var big = vw > vh && vw >= 900 && vh >= 560 ? clamp(vh / 760, 1, 1.3) : 1;
    var fit = Math.min(big, (vh - 110) / Math.max(1, c.ht));
    var x, y, sc, o;
    if (p) {
      x = lerp(p.x, vw / 2, h); y = lerp(p.y, vh / 2 - 24, h); sc = lerp(HOLD / p.dz * fit, fit, h);
      // appears in the distance just before its approach, gone before it grows past you
      o = ss(11, 7.5, p.dz) * ss(st.s0 - .6, st.s0 + .05, s) * (st.stay ? 1 : ss(1.5, 2.2, p.dz));
    } else { x = vw / 2; y = vh / 2; sc = 1; o = 0; }
    var away = st.stay ? 1 - ss(st.b + .02, st.b + .3, s) : 1;   // the reply card dissolves into the light
    // the card comes into view as the camera turns to it (not hanging empty in the distance)
    o = Math.max(o * ss(.12, .6, h), h) * away;
    setStyle(node, key, "visibility", o > .002 ? "visible" : "hidden");
    setStyle(node, key, "opacity", o.toFixed(3));
    setStyle(node, key, "transform", "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) translate(-50%,-50%) scale(" + Math.min(sc, 1.3 * big).toFixed(4) + ")");
    // the words inside reveal one after another once the card has settled
    var held = h > .97;
    if (held !== c.held) { c.held = held; node.classList.toggle("is-held", held); }
    var pe = h > .6 ? "auto" : "none";
    if (pe !== c.pe) { c.pe = pe; node.style.pointerEvents = pe; }
  }

  /* ---------------------------------------------- gold dust over the photo */
  function makeDust(cv) {
    if (!cv || !cv.getContext) return null;
    var g = cv.getContext("2d"), parts = [], W = 0, H = 0;
    function size() { W = cv.width = cv.clientWidth || 1; H = cv.height = cv.clientHeight || 1; }
    for (var i = 0; i < 46; i++) parts.push({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 1.8, sp: .008 + Math.random() * .02, ph: Math.random() * 6.3 });
    var sprite = doc.createElement("canvas"); sprite.width = sprite.height = 32;
    var sg = sprite.getContext("2d"), rg = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, "rgba(255,236,190,1)"); rg.addColorStop(.35, "rgba(255,206,130,.55)"); rg.addColorStop(1, "rgba(255,190,110,0)");
    sg.fillStyle = rg; sg.fillRect(0, 0, 32, 32);
    var lastT = 0, cc = doc.querySelector(".finale__candle"), cg = cc && cc.getContext ? cc.getContext("2d") : null;
    // the last candle: a slim taper with a living flame, drawn on its own
    // canvas above the text shading (page styles would be repainted by dark modes)
    function drawCandle(now, a) {
      if (!cg) return;
      var d = Math.min(2, window.devicePixelRatio || 1), w = 60, h = 64;
      if (cc.width !== w * d) { cc.width = w * d; cc.height = h * d; }
      cg.setTransform(d, 0, 0, d, 0, 0);
      cg.clearRect(0, 0, w, h);
      var x = w / 2, base = h - 2;
      var t = now / 1000, fl = 1 + .06 * Math.sin(t * 7.3) + .04 * Math.sin(t * 13.1) + .03 * Math.sin(t * 23.7);
      var sway = 1.2 * Math.sin(t * 2.1) + .6 * Math.sin(t * 5.3);
      cg.globalAlpha = a;
      var halo = cg.createRadialGradient(x, base - 28, 0, x, base - 28, 30 * fl);
      halo.addColorStop(0, "rgba(255,205,130,.55)"); halo.addColorStop(1, "rgba(255,170,80,0)");
      cg.fillStyle = halo; cg.fillRect(0, 0, w, h);
      var wax = cg.createLinearGradient(x - 3, 0, x + 3, 0);
      wax.addColorStop(0, "#C9B28C"); wax.addColorStop(.45, "#FFF4DE"); wax.addColorStop(1, "#B39C77");
      cg.fillStyle = wax; cg.fillRect(x - 3, base - 20, 6, 20);
      cg.fillStyle = "#2a1d10"; cg.fillRect(x - .5, base - 23, 1, 3);
      var fx = x + sway * .4, fy = base - 23, hg = 17 * fl;
      cg.beginPath();
      cg.moveTo(fx + sway * .6, fy - hg);
      cg.bezierCurveTo(fx + 4.6, fy - hg * .55, fx + 4.4, fy - 1, fx, fy + 1.2);
      cg.bezierCurveTo(fx - 4.4, fy - 1, fx - 4.6, fy - hg * .55, fx + sway * .6, fy - hg);
      var fg = cg.createRadialGradient(fx, fy - 4, 0, fx, fy - 6, hg);
      fg.addColorStop(0, "rgba(255,255,245,1)"); fg.addColorStop(.35, "rgba(255,225,150,1)"); fg.addColorStop(.8, "rgba(255,160,70,.7)"); fg.addColorStop(1, "rgba(255,120,40,0)");
      cg.fillStyle = fg; cg.fill();
      cg.globalAlpha = 1;
    }
    return {
      draw: function (now, a, candle) {
        if (!W) size();
        if (now - lastT < 33) return;                 // 30 fps is plenty for drifting dust
        var dt = lastT ? Math.min(.1, (now - lastT) / 1000) : .03; lastT = now;
        g.clearRect(0, 0, W, H);
        if (candle > 0) drawCandle(now, candle);
        if (a <= 0) return;
        g.globalCompositeOperation = "lighter";
        parts.forEach(function (q) {
          q.y -= q.sp * dt; if (q.y < -.05) { q.y = 1.05; q.x = Math.random(); }
          var x = (q.x + .02 * Math.sin(now / 1900 + q.ph)) * W, y = q.y * H;
          g.globalAlpha = a * (.35 + .35 * Math.sin(now / 700 + q.ph * 3));
          var d = q.r * 7; g.drawImage(sprite, x - d / 2, y - d / 2, d, d);
        });
        g.globalAlpha = 1;
      },
      resize: size,
    };
  }
  window.addEventListener("resize", function () { if (dust) dust.resize(); cards.forEach(function (c) { c.ht = 0; }); }, { passive: true });
  document.addEventListener("rsvp:sent", function () { cards.forEach(function (c) { c.ht = 0; }); });

  window.Journey = { init: init, TOTAL: TOTAL, STATIONS: STATIONS, STOPS: STOPS, go: goTo, next: next, back: back, state: function () { return { s: sm, chapter: chapter, resting: resting }; } };
})();
