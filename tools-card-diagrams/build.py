"""Write every card picture, and a contact sheet to look at them on."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from kit import svg, W, H            # noqa
import part1, part2                  # noqa

DRAW = {}
DRAW.update(part1.D)
DRAW.update(part2.D)

REG = json.load(open('/home/claude/lab/seven-physics-lab/src/data/registry.json'))
OUTS = [pathlib.Path('/home/claude/lab/seven-physics-lab/public/thumbs'),
        pathlib.Path('/home/claude/lab/preview/thumbs')]

missing = [s['slug'] for s in REG['sims'] if s['slug'] not in DRAW]
if missing:
    print('NO PICTURE FOR:', missing)

for out in OUTS:
    out.mkdir(parents=True, exist_ok=True)

sheet = ['<style>body{margin:0;background:#FAFCFC;font-family:Quicksand,sans-serif}'
         '.g{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:18px}'
         '.c{background:#fff;border:1px solid #DDE7E8;border-radius:12px;overflow:hidden}'
         '.c img{display:block;width:100%}'
         '.c p{margin:0;padding:8px 12px 12px;font-size:13px;font-weight:700;color:#005F6A}'
         '</style><div class="g">']

for s in REG['sims']:
    if s['slug'] not in DRAW:
        continue
    body = DRAW[s['slug']]()
    doc = svg(body)
    for out in OUTS:
        (out / f"{s['slug']}.svg").write_text(doc)
    sheet.append(f'<div class="c"><img src="{s["slug"]}.svg"><p>{s["name"]}</p></div>')

sheet.append('</div>')
pathlib.Path('/home/claude/lab/preview/thumbs/_sheet.html').write_text(''.join(sheet))
print('wrote', len(DRAW), 'pictures')
