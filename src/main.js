{
  document.documentElement.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover = matchMedia('(hover: none)').matches;

  const load = v => { if (v.dataset.src && !v.src) { v.src = v.dataset.src; } };
  const play = v => { load(v); const p = v.play(); if (p) p.catch(() => {}); };

  // reveal on scroll
  const revealObs = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  document.querySelectorAll('.reveal-t,.reveal-m,.reveal-s,.thumb').forEach((el) => {
    if (el.classList.contains('thumb')) {
      const col = el.parentElement.classList.contains('mcol') ? [...el.parentElement.parentElement.children].indexOf(el.parentElement) : 0;
      el.style.setProperty('--d', col);
    }
    reduce ? el.classList.add('in') : revealObs.observe(el);
  });


  // smooth (inertial) scrolling
  let lenis = null;
  if (!reduce && window.Lenis && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    lenis = new Lenis({ autoRaf: true, lerp: 0.15, wheelMultiplier: 1 });
  }


  // loading bar (top, like Elvis' site) + hold scroll until the first screen is ready
  (() => {
    const bar = document.createElement('div'); bar.className = 'loadbar'; bar.innerHTML = '<i></i>';
    document.body.appendChild(bar);
    const fill = bar.firstChild;
    const root = document.documentElement;
    root.classList.add('loading');
    if (lenis) lenis.stop();
    const limit = innerHeight * 1.6;
    const near = el => { const r = el.getBoundingClientRect(); return r.width && r.top < limit && r.bottom > -10; };
    const waits = [];
    document.querySelectorAll('img').forEach(im => {
      if (!near(im) || im.complete) return;
      im.loading = 'eager';
      waits.push(new Promise(res => { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); }));
    });
    document.querySelectorAll('.p-body video, .about video').forEach(v => {
      if (!near(v)) return;
      load(v);
      if (v.readyState >= 2) return;
      waits.push(new Promise(res => { v.addEventListener('loadeddata', res, { once: true }); v.addEventListener('error', res, { once: true }); }));
    });
    // films: all start loading now (so they're ready further down); only the ones on the first screen hold the scroll
    if (window.Vimeo) document.querySelectorAll('.vplayer').forEach(v => {
      const f = v.querySelector('iframe');
      if (!f.src) f.src = f.dataset.src;
      const pl = f._pl || (f._pl = new Vimeo.Player(f));
      const p = (new Promise(res => {
        const ok = () => { v.classList.add('ready'); res(); };
        pl.on('play', ok); pl.on('playing', ok);
        pl.ready().then(() => pl.getPaused()).then(p => { if (!p) ok(); }).catch(ok);
      }));
      if (near(v)) waits.push(p);
    });
    const total = waits.length || 1;
    let done = 0, shown = 0.08, target = 0.08;
    const tick = () => { shown += (target - shown) * 0.18; fill.style.transform = `scaleX(${shown})`; if (!finished) requestAnimationFrame(tick); };
    let finished = false;
    requestAnimationFrame(tick);
    waits.forEach(p => p.then(() => { done++; target = 0.08 + 0.92 * (done / total); }));
    const trickle = setInterval(() => { if (target < 0.9) target += 0.01; }, 200);
    const finish = () => {
      if (finished) return; finished = true; clearInterval(trickle);
      fill.style.transition = 'transform .35s ease-out'; fill.style.transform = 'scaleX(1)';
      setTimeout(() => { bar.classList.add('done'); root.classList.remove('loading'); if (lenis) lenis.start(); }, 380);
      setTimeout(() => bar.remove(), 1200);
    };
    Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 8000))]).then(() => setTimeout(finish, 150));
  })();

  // titles: split into lines and reveal line by line
  const splitLines = el => {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(w => `<span class="w">${w.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span>`).join(' ');
    const lines = []; let top = null;
    el.querySelectorAll('.w').forEach(w => { if (w.offsetTop !== top) { lines.push([]); top = w.offsetTop; } lines[lines.length - 1].push(w.textContent); });
    el.innerHTML = lines.map((l, i) => `<span class="ln" style="--l:${i}"><span>${l.join(' ')}</span></span>`).join('');
  };
  const splits = [...document.querySelectorAll('.split')];
  const doSplit = () => splits.forEach(splitLines);
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
    doSplit();
    splits.forEach(el => reduce ? el.classList.add('in') : revealObs.observe(el));
  });
  let rw; addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => { splits.forEach(el => { const t = [...el.querySelectorAll('.ln')].map(l => l.textContent).join(' '); el.textContent = t; }); doSplit(); }, 200); });

  // own film player: Vimeo in background mode, click for sound, white timeline to scrub
  if (window.Vimeo) {
    document.querySelectorAll('.vplayer').forEach(v => {
      const f = v.querySelector('iframe'), b = v.querySelector('.vp-hit'), lab = v.querySelector('.vp-label'), tl = v.querySelector('.vp-tl');
      const ensure = () => { if (!f.src) f.src = f.dataset.src; return f._pl || (f._pl = new Vimeo.Player(f)); };
      const pl = ensure();
      pl.on('play', () => v.classList.add('ready'));
      let dur = 0, dragging = false;
      pl.getDuration().then(d => { dur = d; }).catch(() => {});
      pl.on('timeupdate', d => { dur = d.duration || dur; if (!dragging) tl.style.setProperty('--p', d.percent.toFixed(4)); });
      new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) pl.play().catch(() => {}); else pl.pause().catch(() => {});
      }), { rootMargin: '200px 0px' }).observe(v);
      const seekTo = x => {
        const r = tl.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
        tl.style.setProperty('--p', p.toFixed(4));
        if (dur) pl.setCurrentTime(p * dur * 0.999).catch(() => {});
      };
      tl.addEventListener('pointerdown', e => { dragging = true; tl.setPointerCapture(e.pointerId); seekTo(e.clientX); });
      tl.addEventListener('pointermove', e => { if (dragging) seekTo(e.clientX); });
      const up = () => { dragging = false; pl.play().catch(() => {}); };
      tl.addEventListener('pointerup', up); tl.addEventListener('pointercancel', up);
      tl.addEventListener('keydown', e => {
        if (!dur) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); pl.getCurrentTime().then(t => pl.setCurrentTime(Math.max(0, Math.min(dur - .1, t + (e.key === 'ArrowRight' ? 5 : -5))))); }
      });
      b.addEventListener('click', async () => {
        if (v.classList.contains('sound')) {
          v.classList.remove('sound'); lab.textContent = 'Play with sound'; b.setAttribute('aria-label', 'Play with sound');
          try { await pl.setMuted(true); } catch (e) {}
        } else {
          document.querySelectorAll('.vplayer.sound .vp-hit').forEach(o => o.click());
          v.classList.add('sound'); lab.textContent = 'Mute'; b.setAttribute('aria-label', 'Mute');
          try { await pl.setCurrentTime(0); await pl.setMuted(false); await pl.setVolume(1); await pl.play(); } catch (e) {}
        }
      });
    });
  }


  // grid / list toggle (home); elsewhere it opens the home in the chosen view
  const vt = document.querySelector('.vt');
  if (vt) {
    const root = document.documentElement;
    const label = () => vt.setAttribute('aria-label', root.classList.contains('view-list') ? 'Show as grid' : 'Show as list');
    label();
    vt.addEventListener('click', () => {
      const list = !root.classList.contains('view-list');
      try { localStorage.setItem('fs-view', list ? 'list' : 'grid'); } catch (e) {}
      if (!document.body.classList.contains('pg-home')) { location.href = '/' + (list ? '#list' : ''); return; }
      const swap = () => { root.classList.toggle('view-list', list); label(); scrollTo(0, 0); if (lenis) lenis.scrollTo(0, { immediate: true }); };
      // no page slide here: the content under the menu fades out, swaps, and rises back in
      const main = document.querySelector('main');
      if (reduce || !main) return swap();
      main.classList.add('vswap-out');
      setTimeout(() => {
        swap();
        main.classList.remove('vswap-out');
        main.classList.add('vswap-in');
        requestAnimationFrame(() => requestAnimationFrame(() => main.classList.remove('vswap-in')));
      }, 280);
    });
  }
  // list: the row crossing the middle of the screen opens up and shows its name.
  // Heights follow a cos² bump that always sums to one row, so the list's total
  // height never changes and scrolling never fights the layout.
  const plistEl = document.querySelector('.plist');
  if (plistEl) {
    const rows = [...plistEl.querySelectorAll('.prow')];
    const vids = rows.map(r => r.querySelector('video'));
    // Each row gets a Gaussian share of one extra "open" height; the shares are
    // normalised so they always sum to 1 (total list height never changes), and
    // the open position eases toward the scroll position for a soft hand-off.
    const SIG = 0.62, PEAK = 1 / (1 + 2 * Math.exp(-1 / (2 * SIG * SIG)) + 2 * Math.exp(-4 / (2 * SIG * SIG)));
    let H0 = 0, E = 0, top = 0, vh = 0, cur = null, goal = 0, queued = false;
    const measure = () => {
      vh = innerHeight;
      const W = parseFloat(getComputedStyle(rows[0].querySelector('.pr-img')).width) || 320;
      H0 = Math.max(96, Math.min(124, vh * 0.13));
      const open = W * 0.6 + 72;   // image + equal room above and below                     // horizontal image when open
      E = Math.max(0, open - H0) / PEAK;
      top = plistEl.getBoundingClientRect().top + scrollY;
    };
    // the open row stays where the list starts (same gap below the menu as the mosaic)
    const target = () => {
      // map the whole page scroll onto the rows, so the last one opens right as the page ends (no empty tail)
      const max = Math.max(1, document.documentElement.scrollHeight - vh);
      return Math.min(rows.length - 1, Math.max(0, (rows.length - 1) * scrollY / max));
    };
    const paint = () => {
      queued = false;
      if (!root.classList.contains('view-list')) return;
      goal = hoverIdx ?? target();
      if (cur === null) cur = goal;
      cur += (goal - cur) * 0.12;
      if (Math.abs(goal - cur) < 0.001) cur = goal;
      const w = rows.map((r, i) => Math.exp(-((i - cur) ** 2) / (2 * SIG * SIG)));
      const sum = w.reduce((s, x) => s + x, 0);
      rows.forEach((r, i) => {
        const b = w[i] / sum, k = Math.min(1, b / PEAK);
        r.style.setProperty('--h', (H0 + E * b).toFixed(1) + 'px');
        r.style.setProperty('--a', (k * k * k).toFixed(3));
        // rows already passed fade out fast; the ones coming up dim gradually, like a soft roll
        { const d = i - cur; r.style.setProperty('--o', (d > 0 ? Math.max(0.1, Math.exp(-(d * d) / 12.5)) : Math.max(0.05, Math.exp(-(d * d) / 1.5))).toFixed(3)); }
        const v = vids[i];
        if (!v) return;
        if (k > 0.75) {
          if (!v.src) v.src = v.dataset.src;
          if (v.paused) v.play().then(() => v.classList.add('on')).catch(() => {});
        } else if (!v.paused) { v.pause(); v.classList.remove('on'); }
      });
      if (cur !== goal) req();
    };
    // with a mouse, the row under the cursor opens too; scrolling hands control back to the scroll
    let hoverIdx = null;
    if (matchMedia('(hover: hover)').matches) {
      plistEl.addEventListener('mousemove', e => {
        if (!e.movementX && !e.movementY) return;          // ignore events caused by the rows resizing
        const r = e.target.closest('.prow');
        const i = r ? rows.indexOf(r) : -1;
        if (i >= 0 && i !== hoverIdx) { hoverIdx = i; req(); }
      });
      plistEl.addEventListener('mouseleave', () => { hoverIdx = null; req(); });
      const release = () => { if (hoverIdx !== null) { hoverIdx = null; req(); } };
      addEventListener('wheel', release, { passive: true });
      addEventListener('keydown', release);
    }
    const req = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
    const root = document.documentElement;
    measure(); paint();
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', () => { measure(); req(); });
    new MutationObserver(() => { measure(); req(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  // in-page loops (ex-GIFs): load + play only while on screen
  const vidObs = new IntersectionObserver(es => {
    es.forEach(e => { const v = e.target; e.isIntersecting ? play(v) : v.pause(); });
  }, { rootMargin: '200px 0px' });
  document.querySelectorAll('.p-body video, .about video').forEach(v => vidObs.observe(v));

  // cover hover loops
  document.querySelectorAll('.thumb').forEach(t => {
    const v = t.querySelector('video.hover');
    if (!v) return;
    v.addEventListener('playing', () => v.classList.add('on'));
    v.addEventListener('pause', () => v.classList.remove('on'));
    if (noHover) return;
    let off;
    const on = () => { clearTimeout(off); play(v); };
    const stop = () => { clearTimeout(off); off = setTimeout(() => v.pause(), 350); };
    t.addEventListener('mouseenter', on);
    t.addEventListener('mouseleave', stop);
    t.addEventListener('focus', on);
    t.addEventListener('blur', stop);
  });

  // preload cover loops as thumbs come into view
  const preObs = new IntersectionObserver(es => {
    es.forEach(e => { if (!e.isIntersecting) return; const v = e.target.querySelector('video.hover'); if (v) { v.preload = 'auto'; load(v); } preObs.unobserve(e.target); });
  }, { rootMargin: '300px 0px' });
  document.querySelectorAll('.thumb').forEach(t => { if (!t.closest('.collage')) preObs.observe(t); });

  // touch screens: the thumb in the middle of the screen plays its loop
  if (noHover) {
    const midObs = new IntersectionObserver(es => {
      es.forEach(e => {
        const v = e.target.querySelector('video.hover');
        if (!v) return;
        if (e.isIntersecting) { e.target.classList.add('playing'); play(v); }
        else { e.target.classList.remove('playing'); v.pause(); }
      });
    }, { rootMargin: '-35% 0px -35% 0px' });
    document.querySelectorAll('.stack .thumb').forEach(t => midObs.observe(t));
  }

  // collage: scatter the thumbs over the first screen. Seeded, so the layout is the same on every visit;
  // tiles start around the centre and are pushed apart until they only overlap a little.
  const col = document.querySelector('.collage');
  if (col) {
    const tiles = [...col.querySelectorAll('.thumb')];
    const layout = () => {
      const W = col.clientWidth, H = col.clientHeight;
      if (!W || !H) return;
      let s = 20241126;
      const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const R = 1891 / 1479, n = tiles.length;
      const unit = Math.max(100, 0.085 * W);
      // best-candidate sampling: random, but each new tile takes the farthest of a few candidate spots,
      // so the cloud is organic yet evenly spread (no clumps, no big holes), like the ref
      const top = 96, b = [];
      for (let i = 0; i < n; i++) {
        const ar = parseFloat(tiles[i].dataset.ar) || 1.28;               // each still keeps its own proportions
        const sz = [0.8, 0.9, 1, 1, 1.1, 1.25][Math.floor(rnd() * 6)];     // a gentle variety of sizes
        const w = unit * sz * Math.sqrt(ar), h = unit * sz / Math.sqrt(ar);
        let best = null, bestD = -1;
        for (let c = 0; c < 14; c++) {
          const x = -0.3 * w + rnd() * (W - 0.4 * w), y = top + rnd() * (H - top - h - 24);
          let d = Infinity;
          for (const o of b) d = Math.min(d, Math.hypot((x - o.x) / W * 1.4, (y - o.y) / H));
          if (d > bestD) { bestD = d; best = { x, y }; }
        }
        b.push({ w, h, ar, x: best.x, y: best.y, z: 1 + Math.floor(rnd() * n) });
      }
      for (let it = 0; it < 400; it++) {
        let moved = false;
        for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) {
          const A = b[i], B = b[k];
          const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
          const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
          const ax = -0.14 * Math.min(A.w, B.w), ay = -0.14 * Math.min(A.h, B.h);   // never on top of each other: always a little air
          if (ox > ax && oy > ay) {
            moved = true;
            if (ox - ax < oy - ay) { const d = (ox - ax) / 2 + .5, sg = A.x < B.x ? 1 : -1; A.x -= sg * d; B.x += sg * d; }
            else { const d = (oy - ay) / 2 + .5, sg = A.y < B.y ? 1 : -1; A.y -= sg * d; B.y += sg * d; }
          }
        }
        b.forEach(t => { t.x = Math.max(-0.3 * t.w, Math.min(W - 0.7 * t.w, t.x)); t.y = Math.max(96, Math.min(H - t.h - 24, t.y)); });   // whole tiles at the bottom: the collage is one screen, no scroll   // at most a third cut by the screen edge
        if (!moved) break;
      }
      // centre the cloud on the page
      const minX = Math.min(...b.map(t => t.x)), maxX = Math.max(...b.map(t => t.x + t.w));
      const minY = Math.min(...b.map(t => t.y)), maxY = Math.max(...b.map(t => t.y + t.h));
      const dx = (W - (maxX + minX)) / 2, dy = (H - (maxY + minY)) / 2;
      tiles.forEach((t, i) => {
        t.style.setProperty('--w', b[i].w.toFixed(1) + 'px');
        t.style.setProperty('--ar', b[i].ar);
        t.style.setProperty('--x', b[i].x.toFixed(1) + 'px');
        t.style.setProperty('--y', b[i].y.toFixed(1) + 'px');
        t.style.setProperty('--z', b[i].z);
        t.style.setProperty('--d', i % 8);
      });
      col.classList.add('laid');
      tiles.forEach(t => t.classList.add('in'));   // tiles cut by the screen edge still reveal
      base = b; lens();
    };
    // lens: tiles near the cursor grow together (the nearest most) and the cloud bulges away from it
    let base = null, mx = null, my = null, lensOn = false, lensRaf = 0;
    // each tile eases at its own pace, so they swell one after another rather than in lockstep
    const st = tiles.map((_, i) => ({ s: 1, v: 0, tgt: 1, pend: 1, at: 0, x: 0, y: 0, jit: ((i * 7919) % 97) / 97 }));
    const cam = { x: 0, y: 0 };   // the whole canvas drifts gently toward where things are growing
    const lens = () => {
      lensRaf = 0;
      if (!base) return;
      const W = col.clientWidth, H = col.clientHeight, rx = 0.19 * W, ry = 0.27 * H, now = performance.now();
      let busy = false;
      const camTx = lensOn ? (W / 2 - mx) * 0.08 : 0, camTy = lensOn ? (H / 2 - my) * 0.08 : 0;
      cam.x += (camTx - cam.x) * 0.03; cam.y += (camTy - cam.y) * 0.03;
      if (Math.abs(camTx - cam.x) + Math.abs(camTy - cam.y) > 0.2) busy = true;
      tiles.forEach((t, i) => {
        const B = base[i], cx = B.x + B.w / 2, cy = B.y + B.h / 2;
        let ts = 1, dist = 0, tx = 0, ty = 0;
        if (lensOn) {
          // square-ish field (not a round bulge): tiles grow in place, the one under the cursor most
          // fisheye: the closer to the cursor, the bigger; neighbours move aside to make room
          const dx = cx - (mx - cam.x), dy = cy - (my - cam.y), d2 = dx * dx + dy * dy;
          const f = Math.exp(-d2 / (2 * (0.13 * W) ** 2));
          ts = 1 + 0.9 * f + (t.matches(':hover') ? 0.25 : 0);
          tx = dx * 0.6 * f; ty = dy * 0.6 * f;   // neighbours move aside to make room, then return
          dist = Math.hypot(cx - mx, cy - my) / W;
        }
        const S = st[i];
        // cascade: a new size is taken up after a delay that grows with distance from the cursor
        const hov = t.matches(':hover');
        if (Math.abs(ts - S.pend) > 0.015) { S.pend = ts; S.at = hov ? now : now + dist * 380 + S.jit * 80; }
        if (now >= S.at) S.tgt = S.pend;
        // soft spring: picks up right away, settles smoothly with no bounce
        S.s += (S.tgt - S.s) * 0.045; S.x += (tx - S.x) * 0.08; S.y += (ty - S.y) * 0.08;   // smooth exponential ease
        if (Math.abs(S.tgt - S.s) > 0.002 || Math.abs(tx - S.x) + Math.abs(ty - S.y) > 0.3 || S.tgt !== S.pend) busy = true;
        t.style.transform = `translate(${(B.x + cam.x + S.x).toFixed(1)}px,${(B.y + cam.y + S.y).toFixed(1)}px) scale(${S.s.toFixed(3)})`;
        t.style.zIndex = t.matches(':hover') ? 300 : Math.round(S.s * 100) + B.z;
      });
      if (busy) lensRaf = requestAnimationFrame(lens);
    };
    col.addEventListener('mousemove', e => {
      const r = col.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; lensOn = true;
      if (!lensRaf) lensRaf = requestAnimationFrame(lens);
    });
    col.addEventListener('mouseleave', () => { lensOn = false; if (!lensRaf) lensRaf = requestAnimationFrame(lens); });
    layout();
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); lens(); }, 150); });
    new MutationObserver(layout).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  // home deck: covers stacked in 3D from the bottom-left (near) to the top-right (far).
  // The wheel moves along the stack with inertia; the card under the cursor lifts and shows its caption;
  // a click turns the card to face the viewer, centred, before opening the project.
  const deckEl = document.querySelector('.deck');
  if (deckEl) {
    const cards = [...deckEl.querySelectorAll('.dk')];
    const N = cards.length;
    const lift = cards.map(() => 0);
    let pos = 4, cur = 4, hot = -1, raf = 0, opening = false, mx = -1, my = -1;
    const geo = cards.map(() => null);   // each card's resting parallelogram, for steady hover hit-testing
    const active = () => getComputedStyle(deckEl).display !== 'none';
    const place = () => {
      raf = 0;
      if (!active()) return;
      const W = innerWidth, H = innerHeight, ch = H * 0.368, cw = ch * 1891 / 1479;   // whole covers, about half the screen tall
      deckEl.style.setProperty('--cw', cw + 'px');
      cur += (pos - cur) * 0.06;
      let moving = Math.abs(pos - cur) > 0.0005;
      const SK = Math.tan(12 * Math.PI / 180), SX = 1, pw = cw * SX;   // near-isometric: parallel edges, no vanishing point
      cards.forEach((c, i) => {
        let d = ((i - cur) % N + N) % N; if (d >= N / 2) d -= N;
        lift[i] += ((i === hot ? 1 : 0) - lift[i]) * 0.14;
        if (Math.abs((i === hot ? 1 : 0) - lift[i]) > 0.002) moving = true;
        if (opening) return;
        // centres run along a diagonal through the middle of the screen
        const cx = W * 0.5 + d * W * 0.05, cy = H * 0.5 - d * H * 0.088;
        const sl = lift[i] * pw * 0.42;   // hovered card slides sideways along its own plane, staying in its layer
        const x = cx - pw / 2 + sl, y = cy - ch / 2 - pw / 2 * SK + sl * SK;
        const op = d < -6.5 ? Math.max(0, 1 + (d + 6.5) / 1.2) : d > 6 ? Math.max(0, 1 - (d - 6) / 2.5) : 1;
        c.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) skewY(12deg) scaleX(${SX})`;
        c.style.opacity = op.toFixed(3);
        c.style.zIndex = Math.round(1000 - d * 10);
        c.style.pointerEvents = 'none';
        geo[i] = { x: cx - pw / 2, y: cy - ch / 2 - pw / 2 * SK, w: pw, h: ch, sk: SK, z: Math.round(1000 - d * 10), on: op > 0.5 };
      });
      if (moving) raf = requestAnimationFrame(place);
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(place); };
    addEventListener('wheel', e => {
      if (!active() || opening) return;
      pos += (e.deltaY + e.deltaX) * 0.0028;
      req();
    }, { passive: true });
    addEventListener('keydown', e => {
      if (!active() || opening) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { pos = Math.round(pos) + 1; req(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { pos = Math.round(pos) - 1; req(); }
    });
    const setHot = n => {
      if (n === hot) return;
      if (hot >= 0) { const c = cards[hot], v = c.querySelector('video'); c.classList.remove('hot'); if (v) { v.pause(); v.classList.remove('on'); } }
      hot = n;
      if (hot >= 0) { const c = cards[hot], v = c.querySelector('video'); c.classList.add('hot'); if (v) { if (!v.src) v.src = v.dataset.src; v.play().then(() => v.classList.add('on')).catch(() => {}); } }
      document.body.style.cursor = hot >= 0 ? 'pointer' : '';
      req();
    };
    const hit = () => {
      let best = -1, bz = -1;
      geo.forEach((g, i) => {
        if (!g || !g.on || g.z <= bz) return;
        const dx = mx - g.x;
        if (dx < 0 || dx > g.w) return;
        const top = g.y + dx * g.sk;
        if (my >= top && my <= top + g.h) { best = i; bz = g.z; }
      });
      return best;
    };
    addEventListener('mousemove', e => {
      if (!active() || opening) return;
      mx = e.clientX; my = e.clientY;
      setHot(e.target.closest('.site-head') ? -1 : hit());
      // caption under the cursor
      const cap = document.querySelector('.cur-cap');
      if (cap) { if (hot >= 0) { cap.textContent = cards[hot].dataset.cap; cap.classList.add('on'); } else cap.classList.remove('on'); }
    });
    addEventListener('wheel', () => { if (active()) requestAnimationFrame(() => setHot(hit())); }, { passive: true });
    document.addEventListener('mouseleave', () => setHot(-1));
    deckEl.addEventListener('click', e => {
      if (!active() || hot < 0) return;
      const c = cards[hot];
      if (e.metaKey || e.ctrlKey || e.shiftKey) { open(c.href, '_blank'); return; }
      opening = true; c.classList.add('picked'); deckEl.classList.add('opening');
      const W = innerWidth, H = innerHeight, cw = parseFloat(deckEl.style.getPropertyValue('--cw')) || 300;
      const ch = cw * 1479 / 1891, s = Math.min(1.3, (H * 0.62) / ch);
      c.style.transformOrigin = '50% 50%';
      c.style.transform = `translate(${(W - cw) / 2}px,${(H - ch) / 2}px) skewY(0deg) scaleX(1) scale(${s.toFixed(3)})`;
      setTimeout(() => { location.href = c.href; }, 850);
    });
    addEventListener('resize', req);
    addEventListener('pageshow', () => { opening = false; deckEl.classList.remove('opening'); cards.forEach(c => c.classList.remove('picked')); req(); });
    new MutationObserver(req).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    place();
  }

  // custom cursor: Inter's asterisk, outline; filled over links
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const c = document.createElement('div'); c.className = 'cur'; c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<svg viewBox="-54 -59 108 118" width="25" height="27"><path class="o" transform="translate(-786.7 -420.5)" d="M789.4,364.41c1.9,0,3.17,1.27,3.17,3.17v41.2c0,.71.53,1.07,1.07,1.07.18,0,.36-.04.51-.12l37.08-21.23c.51-.31,1.05-.45,1.58-.45,1.12,0,2.21.64,2.85,1.71l2.22,4.44c.95,1.58.32,3.48-1.26,4.44l-36.76,20.91c-.64.32-.64,1.58,0,1.9l36.76,20.91c1.58.96,2.21,2.86,1.26,4.44l-2.22,4.44c-.64,1.07-1.73,1.71-2.85,1.71-.53,0-1.07-.14-1.58-.44l-37.08-21.24c-.15-.08-.33-.11-.51-.11-.54,0-1.07.35-1.07,1.06v41.2c0,1.9-1.27,3.17-3.17,3.17h-5.39c-1.9,0-3.17-1.27-3.17-3.17v-41.2c0-.71-.53-1.06-1.06-1.06-.18,0-.36.03-.52.11l-36.76,21.24c-.51.3-1.05.44-1.58.44-1.12,0-2.21-.64-2.85-1.71l-2.54-4.44c-.95-1.58-.32-3.48,1.27-4.44l36.76-20.91c.63-.32.63-1.58,0-1.9l-36.76-20.91c-1.59-.96-2.22-2.86-1.27-4.44l2.54-4.44c.64-1.07,1.73-1.71,2.85-1.71.53,0,1.07.14,1.58.45l36.76,21.23c.16.08.34.12.52.12.53,0,1.06-.36,1.06-1.07v-41.2c0-1.9,1.27-3.17,3.17-3.17H789.4ZM789.4,362.41h-5.39c-2.99,0-5.17,2.18-5.17,5.17v39.6l-35.34-20.42c-.77-.46-1.67-.71-2.58-.71-1.85,0-3.56,1-4.57,2.68l-2.56,4.48c-1.46,2.44-.6,5.59,1.98,7.14l35.41,20.15-35.37,20.13c-2.62,1.57-3.48,4.72-1.99,7.2l2.51,4.4c1.03,1.72,2.74,2.72,4.59,2.72.91,0,1.81-.25,2.61-.73l35.31-20.4v39.6c0,2.99,2.18,5.17,5.17,5.17h5.39c3,0,5.17-2.18,5.17-5.17v-39.6l35.66,20.42c.77.46,1.67.71,2.58.71,1.85,0,3.56-1,4.57-2.68l.04-.07.03-.07,2.19-4.37c1.43-2.47.56-5.58-1.99-7.11l-35.42-20.15,35.38-20.13c2.59-1.55,3.46-4.66,2.03-7.13l-2.19-4.37-.03-.07-.04-.07c-1.01-1.68-2.72-2.68-4.57-2.68-.91,0-1.81.25-2.61.73l-35.63,20.4v-39.6C794.57,364.59,792.4,362.41,789.4,362.41H789.4Z"/><path class="f" transform="translate(-403.8 -420.5)" d="M397.93,473.42v-41.2c0-.95-.95-1.26-1.58-.95l-36.76,21.24c-1.58.95-3.48.31-4.43-1.27l-2.54-4.44c-.95-1.58-.32-3.48,1.27-4.44l36.76-20.91c.63-.32.63-1.58,0-1.9l-36.76-20.91c-1.59-.96-2.22-2.86-1.27-4.44l2.54-4.44c.95-1.58,2.85-2.22,4.43-1.26l36.76,21.23c.63.31,1.58,0,1.58-.95v-41.2c0-1.9,1.27-3.17,3.17-3.17h5.39c1.9,0,3.17,1.27,3.17,3.17v41.2c0,.95.95,1.26,1.58.95l37.08-21.23c1.58-.96,3.48-.32,4.43,1.26l2.22,4.44c.95,1.58.32,3.48-1.26,4.44l-36.76,20.91c-.64.32-.64,1.58,0,1.9l36.76,20.91c1.58.96,2.21,2.86,1.26,4.44l-2.22,4.44c-.95,1.58-2.85,2.22-4.43,1.27l-37.08-21.24c-.63-.31-1.58,0-1.58.95v41.2c0,1.9-1.27,3.17-3.17,3.17h-5.39C399.2,476.59,397.93,475.32,397.93,473.42Z"/></svg>';
    const cap = document.createElement('div'); cap.className = 'cur-cap'; cap.setAttribute('aria-hidden', 'true'); document.body.appendChild(cap);
    // the caption trails the cursor with a soft delay
    let cx = -100, cy = -100, capLoop = 0;
    const trail = () => {
      cx += (x - cx) * 0.12; cy += (y - cy) * 0.12;
      cap.style.transform = `translate3d(${cx}px,${cy + 26}px,0) translateX(-50%)`;
      capLoop = (Math.abs(x - cx) + Math.abs(y - cy) > 0.3) ? requestAnimationFrame(trail) : 0;
    };
    const xh = document.createElement('i'); xh.className = 'xh'; c.appendChild(xh);
    c.classList.add('x');   // the thin cross is the cursor everywhere
    document.body.appendChild(c);
    document.documentElement.classList.add('has-cur');
    let x = -100, y = -100, raf = 0;
    const draw = () => { raf = 0; c.style.transform = `translate3d(${x - 12.5}px,${y - 13.5}px,0)`; };
    addEventListener('mousemove', e => {
      x = e.clientX; y = e.clientY; c.classList.add('on');
      c.classList.toggle('link', !!e.target.closest('a,button'));
      const ct = e.target.closest('.collage .thumb') || document.querySelector('.deck .dk.hot');
      if (ct) { if (cap.textContent !== ct.dataset.cap) cap.textContent = ct.dataset.cap; cap.classList.add('on'); c.classList.remove('link'); }
      else cap.classList.remove('on');
      if (!capLoop) capLoop = requestAnimationFrame(trail);

      if (!raf) raf = requestAnimationFrame(draw);
    }, { passive: true });
    document.addEventListener('mouseleave', () => c.classList.remove('on'));
    addEventListener('blur', () => c.classList.remove('on'));
  }

  document.querySelectorAll('a[href="#top"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); lenis ? lenis.scrollTo(0) : scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }));
}
