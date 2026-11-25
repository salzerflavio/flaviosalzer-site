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
  document.querySelectorAll('.reveal-t,.reveal-m,.thumb').forEach((el) => {
    if (el.classList.contains('thumb')) {
      const col = el.parentElement.classList.contains('mcol') ? [...el.parentElement.parentElement.children].indexOf(el.parentElement) : 0;
      el.style.setProperty('--d', col);
    }
    reduce ? el.classList.add('in') : revealObs.observe(el);
  });


  // smooth (inertial) scrolling
  let lenis = null;
  if (!reduce && window.Lenis && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    lenis = new Lenis({ autoRaf: true, lerp: 0.09, wheelMultiplier: 1 });
  }

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

  // own film player: Vimeo in background mode, click for sound
  if (window.Vimeo) {
    document.querySelectorAll('.vplayer').forEach(v => {
      const f = v.querySelector('iframe'), b = v.querySelector('.vp-hit'), lab = v.querySelector('.vp-label');
      let pl = null;
      const ensure = () => { if (!pl) { f.src = f.dataset.src; pl = new Vimeo.Player(f); } return pl; };
      new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { ensure().play().catch(() => {}); }
        else if (pl) { pl.pause().catch(() => {}); }
      }), { rootMargin: '300px 0px' }).observe(v);
      b.addEventListener('click', async () => {
        const p = ensure();
        if (v.classList.contains('sound')) {
          v.classList.remove('sound'); lab.textContent = 'Play with sound'; b.setAttribute('aria-label', 'Play with sound');
          try { await p.setMuted(true); } catch (e) {}
        } else {
          document.querySelectorAll('.vplayer.sound .vp-hit').forEach(o => o.click());
          v.classList.add('sound'); lab.textContent = 'Mute'; b.setAttribute('aria-label', 'Mute');
          try { await p.setCurrentTime(0); await p.setMuted(false); await p.setVolume(1); await p.play(); } catch (e) {}
        }
      });
    });
  }

  // next project: keep scrolling at the bottom to go there
  const nx = document.querySelector('[data-next]');
  if (nx && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let acc = 0, going = false, decay;
    const atBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    addEventListener('wheel', e => {
      if (going) return;
      if (atBottom() && e.deltaY > 0) {
        acc = Math.min(1, acc + e.deltaY / 1400);
        nx.style.setProperty('--np', acc.toFixed(3));
        clearTimeout(decay);
        decay = setTimeout(function back() { acc = Math.max(0, acc - 0.08); nx.style.setProperty('--np', acc.toFixed(3)); if (acc > 0) decay = setTimeout(back, 30); }, 450);
        if (acc >= 1) { going = true; location.href = nx.href; }
      }
    }, { passive: true });
  }

  // exit effect: project media shrink + fade a little as they scroll off the top
  if (!reduce) {
    const mods = [...document.querySelectorAll('.p-body .reveal-m, .about .reveal-m')];
    mods.forEach(m => {
      const done = () => setTimeout(() => m.classList.add('done'), 1300);
      if (m.classList.contains('in')) done();
      else new MutationObserver((_, o) => { if (m.classList.contains('in')) { o.disconnect(); done(); } }).observe(m, { attributes: true, attributeFilter: ['class'] });
    });
    let ticking = false;
    const head = 80;
    const exitFx = () => {
      ticking = false;
      const vh = innerHeight;
      for (const m of mods) {
        const r = m.getBoundingClientRect();
        if (r.bottom < -50 || r.top > vh) continue;
        const span = Math.min(r.height, vh * 0.8);
        const p = Math.max(0, Math.min(1, (head - r.top) / span));
        m.style.setProperty('--x', p.toFixed(3));
      }
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(exitFx); } }, { passive: true });
    exitFx();
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
  document.querySelectorAll('.thumb').forEach(t => preObs.observe(t));

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

  // custom cursor: Inter's asterisk, outline; filled over links
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const c = document.createElement('div'); c.className = 'cur'; c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<svg viewBox="-54 -59 108 118" width="28" height="31"><path class="o" transform="translate(-786.7 -420.5)" d="M789.4,364.41c1.9,0,3.17,1.27,3.17,3.17v41.2c0,.71.53,1.07,1.07,1.07.18,0,.36-.04.51-.12l37.08-21.23c.51-.31,1.05-.45,1.58-.45,1.12,0,2.21.64,2.85,1.71l2.22,4.44c.95,1.58.32,3.48-1.26,4.44l-36.76,20.91c-.64.32-.64,1.58,0,1.9l36.76,20.91c1.58.96,2.21,2.86,1.26,4.44l-2.22,4.44c-.64,1.07-1.73,1.71-2.85,1.71-.53,0-1.07-.14-1.58-.44l-37.08-21.24c-.15-.08-.33-.11-.51-.11-.54,0-1.07.35-1.07,1.06v41.2c0,1.9-1.27,3.17-3.17,3.17h-5.39c-1.9,0-3.17-1.27-3.17-3.17v-41.2c0-.71-.53-1.06-1.06-1.06-.18,0-.36.03-.52.11l-36.76,21.24c-.51.3-1.05.44-1.58.44-1.12,0-2.21-.64-2.85-1.71l-2.54-4.44c-.95-1.58-.32-3.48,1.27-4.44l36.76-20.91c.63-.32.63-1.58,0-1.9l-36.76-20.91c-1.59-.96-2.22-2.86-1.27-4.44l2.54-4.44c.64-1.07,1.73-1.71,2.85-1.71.53,0,1.07.14,1.58.45l36.76,21.23c.16.08.34.12.52.12.53,0,1.06-.36,1.06-1.07v-41.2c0-1.9,1.27-3.17,3.17-3.17H789.4ZM789.4,362.41h-5.39c-2.99,0-5.17,2.18-5.17,5.17v39.6l-35.34-20.42c-.77-.46-1.67-.71-2.58-.71-1.85,0-3.56,1-4.57,2.68l-2.56,4.48c-1.46,2.44-.6,5.59,1.98,7.14l35.41,20.15-35.37,20.13c-2.62,1.57-3.48,4.72-1.99,7.2l2.51,4.4c1.03,1.72,2.74,2.72,4.59,2.72.91,0,1.81-.25,2.61-.73l35.31-20.4v39.6c0,2.99,2.18,5.17,5.17,5.17h5.39c3,0,5.17-2.18,5.17-5.17v-39.6l35.66,20.42c.77.46,1.67.71,2.58.71,1.85,0,3.56-1,4.57-2.68l.04-.07.03-.07,2.19-4.37c1.43-2.47.56-5.58-1.99-7.11l-35.42-20.15,35.38-20.13c2.59-1.55,3.46-4.66,2.03-7.13l-2.19-4.37-.03-.07-.04-.07c-1.01-1.68-2.72-2.68-4.57-2.68-.91,0-1.81.25-2.61.73l-35.63,20.4v-39.6C794.57,364.59,792.4,362.41,789.4,362.41H789.4Z"/><path class="f" transform="translate(-403.8 -420.5)" d="M397.93,473.42v-41.2c0-.95-.95-1.26-1.58-.95l-36.76,21.24c-1.58.95-3.48.31-4.43-1.27l-2.54-4.44c-.95-1.58-.32-3.48,1.27-4.44l36.76-20.91c.63-.32.63-1.58,0-1.9l-36.76-20.91c-1.59-.96-2.22-2.86-1.27-4.44l2.54-4.44c.95-1.58,2.85-2.22,4.43-1.26l36.76,21.23c.63.31,1.58,0,1.58-.95v-41.2c0-1.9,1.27-3.17,3.17-3.17h5.39c1.9,0,3.17,1.27,3.17,3.17v41.2c0,.95.95,1.26,1.58.95l37.08-21.23c1.58-.96,3.48-.32,4.43,1.26l2.22,4.44c.95,1.58.32,3.48-1.26,4.44l-36.76,20.91c-.64.32-.64,1.58,0,1.9l36.76,20.91c1.58.96,2.21,2.86,1.26,4.44l-2.22,4.44c-.95,1.58-2.85,2.22-4.43,1.27l-37.08-21.24c-.63-.31-1.58,0-1.58.95v41.2c0,1.9-1.27,3.17-3.17,3.17h-5.39C399.2,476.59,397.93,475.32,397.93,473.42Z"/></svg>';
    document.body.appendChild(c);
    document.documentElement.classList.add('has-cur');
    let x = -100, y = -100, raf = 0;
    const draw = () => { raf = 0; c.style.transform = `translate3d(${x - 14}px,${y - 15.5}px,0)`; };
    addEventListener('mousemove', e => {
      x = e.clientX; y = e.clientY; c.classList.add('on');
      c.classList.toggle('link', !!e.target.closest('a,button'));
      if (!raf) raf = requestAnimationFrame(draw);
    }, { passive: true });
    document.addEventListener('mouseleave', () => c.classList.remove('on'));
    addEventListener('blur', () => c.classList.remove('on'));
  }

  document.querySelectorAll('a[href="#top"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); lenis ? lenis.scrollTo(0) : scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }));
}
