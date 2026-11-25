import json, re, os, html, shutil

D = json.load(open('data.json'))
M = json.load(open('manifest.json'))
NM = D['nameMap']
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
def media_tag(url, cls='', sizes='100vw'):
    a = asset(url)
    if not a:
        return ''
    w, h = a['w'], a['h']
    if a['type'] == 'video':
        return (f'<video class="m {cls}" data-src="/media/{a["src"]}" poster="/media/{a["poster"]}" '
                f'width="{w}" height="{h}" muted loop playsinline preload="none"></video>')
    return f'<img class="m {cls}" src="/media/{a["src"]}" width="{w}" height="{h}" loading="lazy" decoding="async" alt="">'

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
            f'<div class="cell" style="flex:{i["w"]/i["h"]:.4f} 1 0">{media_tag(i["src"])}</div>' for i in r)
        out.append(f'<div class="row">{cells}</div>')
    return f'<div class="mod grid reveal-m">{"".join(out)}</div>'

def render_embed(m):
    src = m.get('src') or ''
    if not src:
        return ''
    r = m.get('ratio') or '56.25%'
    if r.endswith('px'):
        return f'<div class="mod embed"><iframe src="{html.escape(src)}" height="{r[:-2]}" style="width:100%;border:0" loading="lazy" allow="autoplay"></iframe></div>'
    if 'vimeo' in src and 'dnt=1' not in src:
        src += ('&' if '?' in src else '?') + 'dnt=1'
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

def project_header(tree):
    left = tree['children'][0]['mods'][0]['html']
    right = tree['children'][1]['mods'][0]['html'] if len(tree['children']) > 1 else ''
    title, desc = split_title(left)
    desc_ps = ''.join(f'<p>{p}</p>' for p in paragraphs(desc))
    creds = parse_credits(right)
    dl = ''.join(f'<div><dt>{html.escape(k)}</dt><dd>{v}</dd></div>' for k, v in creds)
    return title, (f'<header class="p-head">'
                   f'<div class="p-intro"><h1 class="reveal-t">{html.escape(title)}</h1><div class="p-desc reveal-t">{desc_ps}</div></div>'
                   f'<dl class="credits reveal-t">{dl}</dl></header>')

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

# ---------- page shell ----------
CSS = open('style.css').read()
JS = open('main.js').read()

def page(title, body, cls='', desc='Flávio Salzer — Creative and Art Director.'):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27><text y=%27.9em%27 font-size=%2790%27>🫀</text></svg>">
<script>document.documentElement.classList.add('js')</script>
<style>{CSS}</style>
</head>
<body class="{cls}">
<header class="site-head">
  <a class="logo" href="/">f*</a>
  <nav><a href="/">work</a><a href="/flavio/">☺ about</a></nav>
</header>
<main>
{body}
</main>
<footer class="site-foot">
  <a href="#top" class="totop">↑ back to top</a>
  <span><a href="https://www.linkedin.com/in/flaviosalzer" target="_blank" rel="noopener">LinkedIn</a><a href="https://instagram.com/flaviosalzer" target="_blank" rel="noopener">Instagram</a></span>
</footer>
<script>{JS}</script>
</body>
</html>'''

def write(path, s):
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
    name = clean_name(c['title']); client, year = project_meta(c['slug'])
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
home = masonry(3, [1.1, STD, 1.18]) + masonry(2, [1.1, STD]) + f'<section class="stack">{flat}</section>'
write('index.html', page('Flávio Salzer', home, 'pg-home'))

# ---------- projects ----------
titles = {c['slug']: c['title'] for c in covers}
for p in D['pages']:
    slug = slug_of(p['url'])
    mods = p['mods']
    if slug == 'flavio':
        continue
    title, head = project_header(mods[0])
    rest = render_mods(mods[1:])
    clean_title = titles.get(slug, title)
    desc = strip_tags(split_title(mods[0]['children'][0]['mods'][0]['html'])[1])
    desc = re.sub(r'\s+', ' ', desc).strip()[:180]
    write(f'{slug}/index.html', page(f'{clean_title} — Flávio Salzer', f'<article class="project">{head}<div class="p-body">{rest}</div></article>', 'proj', desc or 'Flávio Salzer — Creative and Art Director.'))

# ---------- about ----------
about = [p for p in D['pages'] if slug_of(p['url']) == 'flavio'][0]['mods']

def about_block(text_html):
    h = norm_html(text_html)
    m = re.match(r'\s*<span class="t-lg">\s*(?:<strong>)?(.*?)(?:</strong>)?\s*</span>', h, re.S)
    head = ''
    if m and len(strip_tags(m.group(1))) < 30:
        head = f'<h2 class="reveal-t">{strip_tags(m.group(1)).strip()}</h2>'
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
write('flavio/index.html', page('About — Flávio Salzer', f'<article class="about">{"".join(parts)}</article>', 'pg-about'))

# ---------- netlify config ----------
open(os.path.join(OUT, '_redirects'), 'w').write('/work / 301\n/work/ / 301\n/about /flavio/ 301\n')
open(os.path.join(OUT, '_headers'), 'w').write('/media/*\n  Cache-Control: public, max-age=31536000, immutable\n')
write('404.html', page('Not found — Flávio Salzer', '<div class="nf"><h1>Not found.</h1><p><a href="/">← back to work</a></p></div>', 'proj'))
print('ok')
