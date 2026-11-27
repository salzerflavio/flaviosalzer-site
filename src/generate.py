import json, re, os, html, shutil

D = json.load(open('data.json'))
M = json.load(open('manifest.json'))
NM = D['nameMap']
# extra projects added after the migration (assets already in site/media)
import glob as _glob
for _f in sorted(_glob.glob('extra_*.json')):
    _x = json.load(open(_f))
    NM.update(_x['nameMap'])
    for _k, _v in _x['manifest'].items(): M[_k] = _v
    _slugs = [c['slug'] for c in D['covers']]
    if _x['cover']['slug'] not in _slugs:
        _i = _slugs.index(_x['insert_after']) + 1 if _x.get('insert_after') in _slugs else len(_slugs)
        D['covers'].insert(_i, _x['cover'])
        D['pages'].append(_x['page'])
OUT = 'site'

def asset(url):
    f = NM.get(url)
    return M.get(f) if f else None

def slug_of(url):
    return url.rstrip('/').split('/')[-1]

# ---------- text normalisation (the type guide lives in CSS) ----------
ZW = re.compile('[​‌‍﻿]')

def _norm_html(h):
    h = ZW.sub('', h)
    h = h.replace('&nbsp;', ' ').replace('\xa0', ' ')
    h = re.sub(r'<big>\s*</big>', '', h)
    h = re.sub(r'<b>\s*</b>', '', h)
    h = h.replace('<big>', '<span class="t-lg">').replace('</big>', '</span>')
    h = h.replace('<small>', '<span class="t-sm">').replace('</small>', '</span>')
    h = h.replace('<b>', '<strong>').replace('</b>', '</strong>')
    h = h.replace('<i>', '<em>').replace('</i>', '</em>')
    h = re.sub(r'<a href="([^"]*)">', lambda m: f'<a href="{m.group(1)}" target="_blank" rel="noopener">', h)
    return h.strip()


FIXES = [
    ('Produced bu Kaus', 'Produced by Kaus'),
    ('sorrounded', 'surrounded'),
    ('Our visual and imagetic system is based socialization moments after run.', 'Our visual and imagery system is based on the social moments after the run.'),
    ('Here is impossible', 'Here it is impossible'),
    ('brazilian people', 'Brazilian people'),
    ('Zé Delivery aapp', 'Zé Delivery app'),
    ('OTHERS FESTIVALS', 'OTHER FESTIVALS'),
    ('Mihail Alexandrov', 'Mihail Aleksandrov'),
    ('- Filme - Look for The Earth', '- Film - Look to the Earth'),
    ('Filme', 'Film'),
    ('Look for The Earth', 'Look to the Earth'),
    ('Trouble calls for trouble', 'Trouble Calls for Trouble'),
    ('Zero a Zé - Modo Sacooler', 'From Zero to Zé - Sacooler Mode'),
    ('Zé Delivery’s new brand platform is “From Zero to Zé.”', 'Zé Delivery’s new brand platform is “From Zero to Zé.”'),
    ('Engagement- The', 'Engagement - The'),
    ('Wooooow! People did need to know that', 'Wooooow! People needed to know that'),
]
def norm_html(h):
    for a, b in FIXES:
        h = h.replace(a, b)
    return _norm_html(h)

def paragraphs(h):
    parts = re.split(r'\n|(?:<br>\s*){2,}', h)
    out = []
    carry = ''
    fixed = []
    for p in parts:
        p = carry + p
        opens = len(re.findall(r'<span class="t-(?:lg|sm)">', p)); closes = p.count('</span>')
        carry = ''
        if opens > closes:
            m = re.findall(r'<span class="t-(?:lg|sm)">', p)[-1]
            p += '</span>'; carry = m
        elif closes > opens:
            p = re.sub(r'</span>\s*$', '', p, count=closes - opens) if p.rstrip().endswith('</span>') else p
        fixed.append(p)
    for p in fixed:
        p = re.sub(r'^(<br>\s*)+|(<br>\s*)+$', '', p.strip())
        if re.sub(r'<[^>]+>', '', p).strip():
            out.append(p)
    return out

def strip_tags(h):
    return re.sub(r'<[^>]+>', '', h)

# ---------- media ----------

import base64, io
from PIL import Image as _Img
_LQ = {}
def lqip(name):
    if name in _LQ: return _LQ[name]
    try:
        im = _Img.open(os.path.join(OUT, 'media', name)).convert('RGB')
        w, h = im.size
        im = im.resize((20, max(1, round(20 * h / w))))
        b = io.BytesIO(); im.save(b, 'WEBP', quality=40)
        _LQ[name] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    except Exception:
        _LQ[name] = ''
    return _LQ[name]

def lq_style(name):
    d = lqip(name)
    return f' style="background-image:url({d})"' if d else ''

def media_tag(url, cls='', sizes='100vw'):
    a = asset(url)
    if not a:
        return ''
    w, h = a['w'], a['h']
    if a['type'] == 'video':
        return (f'<video class="m {cls}" data-src="/media/{a["src"]}" poster="/media/{a["poster"]}" '
                f'width="{w}" height="{h}" muted loop playsinline preload="none"{lq_style(a["poster"])}></video>')
    return f'<img class="m {cls}" src="/media/{a["src"]}" width="{w}" height="{h}" loading="lazy" decoding="async" alt=""{lq_style(a["src"])}>'

def render_image(m):
    a = asset(m.get('big'))
    if not a:
        return ''
    full = a['w'] >= 1500
    style = '' if full else f' style="max-width:{a["w"]}px"'
    return f'<figure class="mod img reveal-m"{style}>{media_tag(m["big"])}</figure>'

def render_grid(m):
    items = [i for i in m['items'] if asset(i['src'])]
    if not items:
        return ''
    n = len(items)
    portrait = sum(1 for i in items if i['h'] > i['w']) > n / 2
    per = 4 if portrait else (3 if n == 3 else (1 if n == 1 else 2))
    rows = [items[k:k + per] for k in range(0, n, per)]
    out = []
    for r in rows:
        cells = ''.join(
            f'<div class="cell reveal-m" style="flex:{i["w"]/i["h"]:.4f} 1 0;transition-delay:{k*90}ms">{media_tag(i["src"])}</div>' for k, i in enumerate(r))
        out.append(f'<div class="row">{cells}</div>')
    return f'<div class="mod grid">{"".join(out)}</div>'

def render_embed(m):
    src = m.get('src') or ''
    if not src:
        return ''
    r = m.get('ratio') or '56.25%'
    if r.endswith('px'):
        return f'<div class="mod embed"><iframe src="{html.escape(src)}" height="{r[:-2]}" style="width:100%;border:0" loading="lazy" allow="autoplay"></iframe></div>'
    if 'player.vimeo.com' in src:
        base = src.split('&')[0]
        vsrc = base + ('&' if '?' in base else '?') + 'background=1&autoplay=1&loop=1&muted=1&dnt=1'
        return (f'<div class="mod vplayer reveal-m"><div class="ratio" style="padding-bottom:{r}">'
                f'<iframe data-src="{html.escape(vsrc)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Film"></iframe>'
                f'<button class="vp-hit" type="button" aria-label="Play with sound"><span class="vp-label">Play with sound</span></button></div>'
                f'<div class="vp-tl" role="slider" aria-label="Seek" tabindex="0"><i></i></div></div>')
    return (f'<div class="mod embed reveal-m"><div class="ratio" style="padding-bottom:{r}">'
            f'<iframe src="{html.escape(src)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div></div>')

def render_text(m, center_default=False):
    h = norm_html(m['html'])
    ps = paragraphs(h)
    if not ps:
        return ''
    is_statement = all(p.startswith('<span class="t-lg">') for p in ps)
    if is_statement:
        body = ''.join(f'<p>{p}</p>' for p in ps)
        return f'<div class="mod statement reveal-t">{body}</div>'
    body = ''.join(f'<p>{p}</p>' for p in ps)
    return f'<div class="mod prose reveal-t">{body}</div>'

def split_title(h):
    """first t-lg span is the title, rest is the description"""
    h = norm_html(h)
    m = re.match(r'\s*(<strong>)?\s*<span class="t-lg">(.*?)</span>\s*(</strong>)?', h, re.S)
    if not m:
        return '', h
    title = strip_tags(m.group(2)).strip()
    return title, h[m.end():]

def parse_credits(h):
    h = norm_html(h)
    h = re.sub(r'</?span[^>]*>', '', h)
    chunks = re.split(r'(?:<br>\s*){2,}|\n', h)
    rows = []
    for c in chunks:
        c = c.strip()
        m = re.match(r'<strong>(.*?)</strong>\s*(?:<br>)?\s*(.*)', c, re.S)
        if m and strip_tags(m.group(2)).strip():
            rows.append((strip_tags(m.group(1)).strip(), m.group(2).strip()))
    return rows


NAMES = {
    'followers': 'Followers Store',
    'the-ze-theory': 'The Zé Theory',
    'skip-the-line': 'Skip the Line',
    'finishline-club': 'Finish Line Club',
    'copia-de-iphone-17pro-x-mercado-libre': 'Chew It',
    'mercadolibrexapple': 'iPhone 17 Pro x Mercado Libre',
    'zero-a-ze': 'From Zero to Zé',
    'congress-league': 'Congress League',
    'maradona': 'The Man Who Became God',
    'shadow-delivery': 'Shadow Delivery',
    'ceu-azul': 'Brazil’s Sky Is Blue',
    'perrengue': 'Trouble Calls for Trouble',
    'regeneracao': 'Look to the Earth',
    'notificacoes': 'Life’s Notifications',
    'flexmode': '#FlexMode',
    'ai-assisted': 'AI-Assisted Software Engineering',
    'hh-virtual-skol': 'Virtual Happy Hour',
    'ze-salva': 'Zé Saves',
    'the-smallest-launch': 'The Smallest Launch in the World',
    'delivery-pool': 'Pool Delivery',
    'skol-zero-zero': 'Skol Zero Zero',
}

SMALL = {'a','an','and','as','at','by','for','from','in','of','on','or','the','to','with','x','e','do','da','de','é'}
def nice_title(page_title, cover_name):
    if cover_name and cover_name.lower() == page_title.lower():
        return cover_name
    if page_title != page_title.upper():
        return page_title
    words = page_title.lower().split()
    out = []
    for k, w in enumerate(words):
        out.append(w if (k and w in SMALL) else w[:1].upper() + w[1:] if not w.startswith('#') else '#' + w[1:2].upper() + w[2:])
    return ' '.join(out)

def project_header(tree, cover_name=''):
    left = tree['children'][0]['mods'][0]['html']
    right = tree['children'][1]['mods'][0]['html'] if len(tree['children']) > 1 else ''
    title, desc = split_title(left)
    title = nice_title(title, cover_name)
    desc_ps = ''.join(f'<p>{p}</p>' for p in paragraphs(desc))
    creds = parse_credits(right)
    dl = ''.join(f'<div><dt>{html.escape(k)}</dt><dd>{v}</dd></div>' for k, v in creds)
    return title, (f'<header class="p-head">'
                   f'<div class="p-intro"><a class="back" href="/" aria-label="Back to work"><svg class="arr" viewBox="486 353 250 95" width="66" height="25" aria-hidden="true"><polygon points="534.41 445.79 488.14 401.58 532.35 355.3 536.69 359.45 496.62 401.38 538.55 441.45 534.41 445.79"/><rect x="492.38" y="398.48" width="241.62" height="6"/></svg></a><h1 class="reveal-s" style="--d:0">{html.escape(title)}</h1><div class="p-desc reveal-s" style="--d:1">{desc_ps}</div></div>'
                   f'<dl class="credits reveal-s" style="--d:2">{dl}</dl></header>')

def render_mods(mods):
    out = []
    for m in mods:
        t = m['type']
        if t == 'image': out.append(render_image(m))
        elif t == 'grid': out.append(render_grid(m))
        elif t == 'embed': out.append(render_embed(m))
        elif t == 'text': out.append(render_text(m))
        elif t == 'tree':
            cols = ''.join(f'<div class="col" style="flex:{c["flex"].split()[0]} 1 0">{render_mods(c["mods"])}</div>' for c in m['children'])
            out.append(f'<div class="mod cols">{cols}</div>')
    return '\n'.join(o for o in out if o)


# ---------- share previews (1200x630 jpg) ----------
def make_og(src_name, out_name, focus_left=True):
    os.makedirs(os.path.join(OUT, 'og'), exist_ok=True)
    dst = os.path.join(OUT, 'og', out_name)
    try:
        im = _Img.open(os.path.join(OUT, 'media', src_name)).convert('RGB')
    except Exception:
        return
    W, H = 1200, 630
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), _Img.LANCZOS)
    x = 0 if focus_left else (im.width - W) // 2
    y = (im.height - H) // 2
    im.crop((x, y, x + W, y + H)).save(dst, 'JPEG', quality=84, optimize=True, progressive=True)

def next_block(slug):
    order = [c['slug'] for c in covers]
    if slug not in order: return ''
    k = order.index(slug)
    prv, nxt = order[k - 1], order[(k + 1) % len(order)]
    return (f'<nav class="pn" aria-label="More projects">'
            f'<a href="/{prv}/" rel="prev"><span class="ar">←</span> Previous Page</a><a href="/{nxt}/" rel="next">Next Page <span class="ar">→</span></a></nav>')

def _ogv(og):
    import hashlib
    p = os.path.join(OUT, og)
    return hashlib.md5(open(p, 'rb').read()).hexdigest()[:8] if os.path.exists(p) else '1'

# ---------- page shell ----------
CSS = open('style.css').read()
JS = open('main.js').read()

def page(title, body, cls='', desc='Flávio Salzer is a Creative Director and Art Director based in São Paulo. Former LePub and Africa, now back at GUT. Selected work for Zé Delivery, Heineken, New Balance, Skol and more.', path='/', og='og/home.jpg', vimeo=False):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://flaviosalzer.com{path}">
<meta property="og:image" content="https://flaviosalzer.com/{og}?v={_ogv(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="https://flaviosalzer.com{path}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27><text y=%27.9em%27 font-size=%2790%27>🫀</text></svg>">
<script>document.documentElement.classList.add('js');try{{var v=localStorage.getItem('fs-view');if(v==='list'||location.hash==='#list'||(!v&&matchMedia('(max-width:700px)').matches))document.documentElement.classList.add('view-list')}}catch(e){{}}</script>
<style>{CSS}</style>
</head>
<body class="{cls}" id="top">
<header class="site-head">
  <a class="logo" href="/">f*</a>
  <nav><a href="/">Work</a><a href="/flavio/">☺ About</a><button class="vt" type="button" aria-label="Show as list"><svg class="i-list" viewBox="0 0 20 20" width="17" height="17"><rect x="2" y="4" width="16" height="1.6"/><rect x="2" y="9.2" width="16" height="1.6"/><rect x="2" y="14.4" width="16" height="1.6"/></svg><svg class="i-grid" viewBox="0 0 20 20" width="17" height="17"><rect x="2" y="2" width="7" height="7"/><rect x="11" y="2" width="7" height="7"/><rect x="2" y="11" width="7" height="7"/><rect x="11" y="11" width="7" height="7"/></svg></button></nav>
</header>
<main>
{body}
</main>
<footer class="site-foot">
  <span class="social"><a href="https://www.linkedin.com/in/flaviosalzer" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="ic ic-li"></i></a><a href="https://instagram.com/flaviosalzer" target="_blank" rel="noopener" aria-label="Instagram"><i class="ic ic-ig"></i></a></span>
</footer>
<script src="/js/lenis.min.js"></script>
{'<script src="/js/player.min.js"></script>' if vimeo else ''}
<script>{JS}</script>
</body>
</html>'''

_P = re.compile(r'(<p\b[^>]*>)(.*?)(</p>)', re.S)
def _nowidow(m):
    """glue the last words of a paragraph with nbsp so no word sits alone on the last line"""
    body = m.group(2)
    parts = re.split(r'(<[^>]+>)', body)
    # indices of text chunks (not tags), from the end
    glue = 2 if re.search(r'[↴→]\s*$', strip_tags(body)) else 1
    if len(strip_tags(body).split()) < 5:
        return m.group(0)
    for k in range(len(parts) - 1, -1, -1):
        if glue == 0: break
        if parts[k].startswith('<'): continue
        t = parts[k].rstrip()
        trail = parts[k][len(t):]
        while glue and ' ' in t:
            i = t.rfind(' ')
            t = t[:i] + '\u00a0' + t[i+1:]
            glue -= 1
            if glue and ' ' not in t: break
        parts[k] = t + trail
        if glue and t.strip(): break
    return m.group(1) + ''.join(parts) + m.group(3)
def _nowidow_br(m):
    # each <br>-separated line of a paragraph gets the same treatment
    segs = re.split(r'(<br\s*/?>)', m.group(2))
    out = []
    for sg in segs:
        if re.fullmatch(r'<br\s*/?>', sg): out.append(sg); continue
        out.append(_nowidow(re.match(r'(.*)', '<p>' + sg + '</p>', re.S) and _P.match('<p>' + sg + '</p>'))[3:-4])
    return m.group(1) + ''.join(out) + m.group(3)
def nowidow(s):
    return _P.sub(_nowidow_br, s)

def write(path, s):
    s = s.replace('<br> -  From Zero to Zé - Sacooler', '<br><strong>SILVER</strong> -  From Zero to Zé - Sacooler')  # award level missing in source
    s = nowidow(s)
    p = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(s)

# ---------- home ----------
covers = D['covers']

def project_meta(slug):
    p = next((p for p in D['pages'] if slug_of(p['url']) == slug), None)
    if not p: return '', ''
    tree = p['mods'][0]
    right = tree['children'][1]['mods'][0]['html'] if len(tree['children']) > 1 else ''
    cr = {k.lower(): strip_tags(v).strip() for k, v in parse_credits(right)}
    return cr.get('client', ''), cr.get('year', '')

def clean_name(t):
    name = t.split('→')[0]
    name = re.sub(r'[^\w\s&#\'’.,:!?-]', '', name)
    return re.sub(r'\s+', ' ', name).strip()

def thumb(c, i, ratio=None):
    n = asset(c['normal']); hv = asset(c['hover'])
    name = NAMES.get(c['slug']) or clean_name(c['title']); client, year = project_meta(c['slug'])
    sub = ', '.join(x for x in (client, year) if x)
    img = media_tag(c['normal'], 'cover') if n else ''
    hover = ''
    if hv and hv['type'] == 'video':
        hover = f'<video class="m hover" data-src="/media/{hv["src"]}" muted loop playsinline preload="none"></video>'
    elif hv and hv['src'] != (n or {}).get('src'):
        hover = f'<img class="m hover" src="/media/{hv["src"]}" loading="lazy" alt="">'
    st = f' style="aspect-ratio:{ratio:.4f}"' if ratio else ''
    return (f'<a class="thumb" href="/{c["slug"]}/" style="--i:{i}">'
            f'<div class="frame"{st}>{img}{hover}</div>'
            f'<span class="t-title"><b>{html.escape(name)}</b>' + (f'<i>{html.escape(sub)}.</i>' if sub else '') + '</span></a>')

STD = 1891 / 1479
def masonry(ncols, first):
    """round-robin into columns; first tile of each column gets its own height so columns interleave,
    then the last tile of each column is stretched so every column ends on the same line."""
    cols = [[] for _ in range(ncols)]
    for i, c in enumerate(covers):
        cols[i % ncols].append([i, c, STD])
    for k, col in enumerate(cols):
        col[0][2] = first[k]
    out = ''.join('<div class="mcol">' + ''.join(thumb(c, i, r) for i, c, r in col) + '</div>' for col in cols)
    return f'<section class="masonry m{ncols}">{out}</section>'

flat = ''.join(thumb(c, i) for i, c in enumerate(covers))

AWARDS = {  # badges as they appear on each cover
    'followers': ['lion'],
    'the-ze-theory': ['lion', 'effie', 'head', 'clube'],
    'skip-the-line': ['lion'],
    'perrengue': ['effie', 'clube'],
    'regeneracao': ['clube'],
    'zero-a-ze': ['effie'],
}
AWARD_LABEL = {'lion': 'Cannes Lions', 'effie': 'Effie', 'head': 'Award', 'clube': 'Clube de Criação'}
def badges(slug):
    b = AWARDS.get(slug, [])
    return ''.join(f'<i class="bd bd-{k}" role="img" aria-label="{AWARD_LABEL[k]}" title="{AWARD_LABEL[k]}"></i>' for k in b)

def plist_row(c):
    name = NAMES.get(c['slug']) or clean_name(c['title']); client, year = project_meta(c['slug'])
    n = asset(c['normal']); hv = asset(c['hover'])
    src = ''
    if n: src = n.get('poster') if n.get('type') == 'video' else n['src']
    img = f'<img src="/media/{src}" alt="" loading="lazy" decoding="async">' if src else ''
    vid = f'<video data-src="/media/{hv["src"]}" muted loop playsinline preload="none"></video>' if hv and hv.get('type') == 'video' else ''
    meta = ', '.join(x for x in (client, year) if x)
    return (f'<a class="prow" href="/{c["slug"]}/"><div class="pr-meta"><span>{html.escape(name)}</span>'
            f'<span class="pr-r"><span class="pr-bd">{badges(c["slug"])}</span><span>{html.escape(meta)}</span></span></div>'
            f'<div class="pr-stage"><span class="pr-big" aria-hidden="true">{html.escape(name)}</span><div class="pr-img">{img}{vid}</div></div></a>')
plist = '<section class="plist">' + ''.join(plist_row(c) for c in covers) + '</section>'
home = masonry(3, [1.1, STD, 1.18]) + masonry(2, [1.1, STD]) + f'<section class="stack">{flat}</section>' + plist
if os.path.exists('og-home.jpg'):
    os.makedirs(os.path.join(OUT, 'og'), exist_ok=True); shutil.copy('og-home.jpg', os.path.join(OUT, 'og', 'home.jpg'))
else:
    make_og(asset(covers[0]['normal'])['src'], 'home.jpg')
write('index.html', page('Flávio Salzer', home, 'pg-home'))

# ---------- projects ----------
titles = {c['slug']: c['title'] for c in covers}
for p in D['pages']:
    slug = slug_of(p['url'])
    mods = p['mods']
    if slug == 'flavio':
        continue
    title, head = project_header(mods[0], clean_name(titles.get(slug, '')))
    if slug in NAMES:
        head = re.sub(r'(<h1 class="split">)[^<]*', lambda m: m.group(1) + html.escape(NAMES[slug]), head, count=1); title = NAMES[slug]
    rest = render_mods(mods[1:])
    clean_title = NAMES.get(slug, title)
    desc = strip_tags(split_title(mods[0]['children'][0]['mods'][0]['html'])[1])
    desc = re.sub(r'\s+', ' ', desc).strip()[:180]
    cov = next((c for c in covers if c['slug'] == slug), None)
    if cov and asset(cov['normal']): make_og(asset(cov['normal'])['src'], f'{slug}.jpg')
    write(f'{slug}/index.html', page(f'{clean_title} — Flávio Salzer', f'<article class="project">{head}<div class="p-body">{rest}</div>{next_block(slug)}</article>', 'proj', desc or 'Flávio Salzer — Creative Director and Art Director.', path=f'/{slug}/', og=f'og/{slug}.jpg', vimeo='vplayer' in rest))

# ---------- about ----------
about = [p for p in D['pages'] if slug_of(p['url']) == 'flavio'][0]['mods']

def about_block(text_html):
    h = norm_html(text_html)
    m = re.match(r'\s*<span class="t-lg">\s*(?:<strong>)?(.*?)(?:</strong>)?\s*</span>', h, re.S)
    head = ''
    if m and len(strip_tags(m.group(1))) < 30:
        txt = strip_tags(m.group(1)).strip()
        if 'ABOUT' in txt.upper():
            head = '<h1 class="a-title split">About</h1>'
        else:
            head = f'<h2 class="reveal-t">{txt}</h2>'
        h = h[m.end():]
    ps = paragraphs(h)
    return head + ''.join(f'<p class="reveal-t">{p}</p>' for p in ps)

parts = []
for m in about:
    if m['type'] == 'tree':
        cols = []
        for c in m['children']:
            inner = ''
            for mm in c['mods']:
                if mm['type'] == 'text': inner += about_block(mm['html'])
                elif mm['type'] == 'image': inner += render_image(mm)
            cols.append(f'<div class="col" style="flex:{c["flex"].split()[0]} 1 0">{inner}</div>')
        parts.append(f'<div class="a-row">{"".join(cols)}</div>')
    elif m['type'] == 'image':
        parts.append(render_image(m))
_pimg = asset(about[0]['children'][1]['mods'][0].get('big')) if about and about[0]['type']=='tree' and len(about[0]['children'])>1 else None
if _pimg: make_og(_pimg['src'], 'about.jpg', focus_left=False)
write('flavio/index.html', page('About — Flávio Salzer', f'<article class="about">{"".join(parts)}</article>', 'pg-about', path='/flavio/', og='og/about.jpg' if _pimg else 'og/home.jpg'))

# ---------- netlify config ----------
# GitHub Pages: custom domain, no Jekyll, and HTML redirects in place of Netlify's _redirects
open(os.path.join(OUT, 'CNAME'), 'w').write('flaviosalzer.com\n')
open(os.path.join(OUT, '.nojekyll'), 'w').write('')
for _from, _to in (('work', '/'), ('about', '/flavio/')):
    os.makedirs(os.path.join(OUT, _from), exist_ok=True)
    open(os.path.join(OUT, _from, 'index.html'), 'w').write(f'<!doctype html><meta charset="utf-8"><title>Redirecting…</title><link rel="canonical" href="https://flaviosalzer.com{_to}"><meta http-equiv="refresh" content="0;url={_to}"><script>location.replace("{_to}")</script>')
open(os.path.join(OUT, '_redirects'), 'w').write('/work / 301\n/work/ / 301\n/about /flavio/ 301\n')
open(os.path.join(OUT, '_headers'), 'w').write('/media/*\n  Cache-Control: public, max-age=31536000, immutable\n')
write('404.html', page('Not found — Flávio Salzer', '<div class="nf"><h1>Not found.</h1><p><a href="/">← back to work</a></p></div>', 'proj'))
print('ok')
