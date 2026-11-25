cd "$(dirname "$0")" && find site -mindepth 1 -maxdepth 1 ! -name media -exec rm -rf {} +
# keep media
python3 generate.py >/dev/null
rm -rf preview && mkdir preview && python3 - <<'PY'
import re,glob,os
for f in glob.glob('site/**/*.html',recursive=True):
    rel=os.path.relpath(f,'site'); depth=rel.count('/'); pre='../'*depth
    s=open(f).read()
    s=re.sub(r'(src|poster|data-src)="/media/',lambda m:f'{m.group(1)}="{pre}media/',s)
    s=re.sub(r'href="/([\w-]*)/?"',lambda m:f'href="{pre}{m.group(1)+"/" if m.group(1) else ""}index.html"',s)
    o=os.path.join('preview',rel); os.makedirs(os.path.dirname(o),exist_ok=True); open(o,'w').write(s)
os.symlink(os.path.abspath('site/media'),'preview/media')
PY
