#!/usr/bin/env python3
"""Merge works.json + tags.json + images.json into portfolio.json and seed annotations.json.

Run from the repo root or from site/:  python3 site/build_data.py
Inputs (all under site/data/): works.json (from references/notes), tags.json, images.json.
Outputs: site/data/portfolio.json, site/data/annotations.json (researcher-generated seed rows are
regenerated; rows with other statuses — contributor rows, practitioner-dialogue rows imported by
scripts/import_dialogue_annotations.py — are preserved).
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, 'data')
def load(name, default):
    p = os.path.join(D, name)
    return json.load(open(p)) if os.path.exists(p) else default

works = load('works.json', None)
if works is None:
    sys.exit('site/data/works.json missing — run the notes parser first')
tags = load('tags.json', {})
images = {i['id']: i for i in load('images.json', [])}
old_ann = load('annotations.json', [])

# Practice clusters: who made the work, in the order the canvas lays them out.
CLUSTERS = [
    ('reality-design-lab', 'Reality Design Lab · Hu, Huang & collaborators', ['W01','W02','W03','W04','W05']),
    ('jiabao-li', 'Jiabao Li', ['W07','W08','W25','W26','J01','J02','J03','J04','J05','J06']),
    ('yang-ryokai', 'Yang & Ryokai', ['W06']),
    ('marshmallow-laser-feast', 'Marshmallow Laser Feast', ['W09','W43','W44']),
    ('jeremijenko', 'Jeremijenko · xClinic & The Living', ['W11','W15','W16']),
    ('sound-sensing', 'Sound, sensing & civic data', ['W13','W14','W17','W18','W19','W22','W24']),
    ('civic-public-art', 'Civic public art & campaigns', ['W10','W20','W23','W27','W28','W42','W45']),
    ('living-media', 'Living media & bioart', ['W12','W21']),
    ('youyang-hu', 'Youyang Hu & Kakehi Lab', ['W29','W30','W31','W32']),
    ('liu-bardzell', 'Liu, Bardzell & Bardzell', ['W33','W34','W35']),
    ('rolighed-hansen', 'Rolighed & Hansen · Aarhus', ['W36','W37','W38','W39']),
    ('lu-lopes', 'Lu & Lopes', ['W40','W41']),
    ('yuning-chen', 'Yuning Chen', ['W46','W47','W48','W49','W50']),
]
by_id = {w['id']: w for w in works}
CLUSTERS = [(k, l, [i for i in ids if i in by_id]) for k, l, ids in CLUSTERS]   # drop ids not (yet) parsed
assigned = {wid for _, _, ids in CLUSTERS for wid in ids}
missing = sorted(set(by_id) - assigned)
if missing:
    CLUSTERS.append(('other', 'Other works', missing))

# Layout: each cluster is a grid block; blocks flow left-to-right in rows of limited width.
CARD_W, CARD_H, GAP = 270, 430, 28
PAD, LABEL_H = 28, 48
ROW_MAX_W = 4600
clusters_out = []
cx, cy, row_h = 0, 0, 0
for key, label, ids in CLUSTERS:
    n = len(ids)
    cols = min(n, 4 if n > 4 else max(1, math.ceil(math.sqrt(n)) if n > 2 else n))
    if n == 7: cols = 4
    rows = math.ceil(n / cols)
    w = cols * CARD_W + (cols - 1) * GAP + 2 * PAD
    h = rows * CARD_H + (rows - 1) * GAP + 2 * PAD
    if cx + w > ROW_MAX_W and cx > 0:
        cx, cy, row_h = 0, cy + row_h + LABEL_H + 60, 0
    for i, wid in enumerate(ids):
        wk = by_id[wid]
        wk['x'] = wk['x0'] = cx + PAD + (i % cols) * (CARD_W + GAP)
        wk['y'] = wk['y0'] = cy + PAD + (i // cols) * (CARD_H + GAP)
        wk['practice'] = key; wk['practice_label'] = label
    clusters_out.append({'key': key, 'label': label, 'count': n, 'x': cx, 'y': cy, 'w': w, 'h': h})
    cx += w + 60; row_h = max(row_h, h)

for wk in works:
    t = tags.get(wk['id'], {})
    wk['tags'] = {rq: t.get(rq, []) for rq in ('rq1', 'rq2', 'rq3')}
    wk['keywords'] = t.get('keywords', [])
    img = images.get(wk['id'])
    wk['image'] = {k: img.get(k) for k in ('file', 'image_url', 'page_url', 'credit', 'permission')} if img and img.get('file') else None
    wk['short'] = wk.pop('csv', wk.get('short', {}))

import hashlib
layout_version = hashlib.sha1(json.dumps([(w['id'], w['x0'], w['y0']) for w in sorted(works, key=lambda w: w['id'])]).encode()).hexdigest()[:10]
json.dump({'generated_from': 'references/notes + data/expanded_portfolio_50_rq_annotations_2026-08-29.csv + data/portfolio_additions_2026-08-29.csv',
           'layout_version': layout_version, 'works': works, 'clusters': clusters_out},
          open(os.path.join(D, 'portfolio.json'), 'w'), ensure_ascii=False, indent=1)

# Seed annotations: one researcher-generated row per RQ per work; keep any contributed rows.
seed = []
for wk in works:
    for rq in ('rq1', 'rq2', 'rq3'):
        seed.append({'id': f"{wk['id']}-{rq}-research-team", 'work': wk['id'], 'rq': rq, 'annotator': 'Research team',
                     'role': 'researcher-generated', 'text': wk[rq], 'date': '2026-08-29', 'status': 'researcher-generated'})
kept = [a for a in old_ann if a.get('status') != 'researcher-generated']
json.dump(seed + kept, open(os.path.join(D, 'annotations.json'), 'w'), ensure_ascii=False, indent=1)

print(f"{len(works)} works, {len(clusters_out)} clusters, {sum(1 for w in works if w['image'])} images, "
      f"{sum(1 for w in works if any(w['tags'].values()))} tagged, {len(kept)} contributed annotations kept")
