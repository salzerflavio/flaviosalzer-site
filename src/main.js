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
    c.innerHTML = '<svg viewBox="140 -1510 863 878" width="48" height="49"><path transform="scale(1,-1)" vector-effect="non-scaling-stroke" d="M476 652 495 936 257 777 160 945 417 1070 160 1195 257 1365 495 1206 476 1490H668L650 1206L888 1365L983 1195L728 1070L983 945L888 777L650 936L668 652Z"/></svg>';
    document.body.appendChild(c);
    document.documentElement.classList.add('has-cur');
    let x = -100, y = -100, raf = 0;
    const draw = () => { raf = 0; c.style.transform = `translate3d(${x - 24}px,${y - 24.5}px,0)`; };
    addEventListener('mousemove', e => {
      x = e.clientX; y = e.clientY; c.classList.add('on');
      c.classList.toggle('link', !!e.target.closest('a,button'));
      if (!raf) raf = requestAnimationFrame(draw);
    }, { passive: true });
    document.addEventListener('mouseleave', () => c.classList.remove('on'));
    addEventListener('blur', () => c.classList.remove('on'));
  }

  document.querySelectorAll('a[href="#top"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }));
}
