#!/usr/bin/env python3
"""Parse references/notes/w*.md (+ the RQ annotation CSVs) into site/data/works.json.

Run from the repo root: python3 site/parse_notes.py
"""
import csv, glob, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSVS = ['data/expanded_portfolio_50_rq_annotations_2026-08-29.csv', 'data/portfolio_additions_2026-08-29.csv']

def section(md, heading, level='##'):
    m = re.search(rf'^{re.escape(level)} {re.escape(heading)}.*?$', md, re.M)
    if not m: return ''
    rest = md[m.end():]
    nxt = re.search(rf'^#{{1,{len(level)}}} ', rest, re.M)
    return (rest[:nxt.start()] if nxt else rest).strip()
def strip_quote(t): return '\n'.join(l for l in t.splitlines() if not l.startswith('>')).strip()

notes = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'references/notes/w*.md')) + glob.glob(os.path.join(ROOT, 'references/notes/j*.md'))):
    md = open(f).read()
    fm = dict(re.findall(r'^(\w+):\s*"(.*)"\s*$', md.split('---')[1], re.M))
    rec = {r[0]: r[1] for r in re.findall(r'^\| (.+?) \| (.+?) \|$', section(md, 'Project record'), re.M) if r[0] != 'Field'}
    memo = section(md, 'Evaluation and analytic memo')
    def memo_field(label):
        m = re.search(rf'\*\*{label}\.\*\*\s*(.+?)(?=\n\n\*\*|\Z)', memo, re.S)
        return m.group(1).strip() if m else ''
    notes[fm['work_id']] = {
        'id': fm['work_id'], 'matrix_id': fm['matrix_id'], 'title': fm['title'], 'creators': fm['creators'],
        'year': fm['year_trajectory'], 'grade': fm['evidence_grade'], 'recommendation': fm['recommendation'],
        'note_file': os.path.basename(f),
        'entity': rec.get('More-than-human relation', ''), 'medium': rec.get('Medium', ''),
        'occasions': rec.get('Principal public occasions', ''), 'publics': rec.get('Publics named in index', ''),
        'summary': section(md, 'Identity and project summary'),
        'publics_text': section(md, 'Exhibition, deployment and publics'),
        'rq1': strip_quote(section(md, 'RQ1 — gaps', '###')), 'rq2': strip_quote(section(md, 'RQ2 — tactics', '###')),
        'rq3': strip_quote(section(md, 'RQ3 — political tensions', '###')),
        'evaluation': memo_field('Matrix evaluation'), 'configuration': memo_field('Cross-RQ configuration'),
        'evidence_boundary': memo_field('Evidence boundary'),
        'sources': [{'label': a, 'url': b} for a, b in re.findall(r'\[([^\]]+)\]\((https?://[^)]+)\)', section(md, 'Source ledger'))],
    }

matrix_to_work = {n['matrix_id']: n['id'] for n in notes.values()}
for path in CSVS:
    p = os.path.join(ROOT, path)
    if not os.path.exists(p): continue
    for r in csv.DictReader(open(p)):
        wid = matrix_to_work.get(r['case_id'])
        if not wid: print('no note for', r['case_id']); continue
        n = notes[wid]
        n.update(layer=r['portfolio_layer'], entity_short=r['more_than_human_entity'], format=r['format'],
                 source_url=r['source_url'], local_evidence=r['local_evidence'], year_short=r['year'],
                 csv={'rq1': r['rq1_gap'], 'rq2': r['rq2_tactics'], 'rq3': r['rq3_political_tensions']})

out = sorted(notes.values(), key=lambda n: n['id'])
missing = [n['id'] for n in out if 'layer' not in n]
if missing: print('WARNING: notes without CSV row:', missing)
json.dump(out, open(os.path.join(ROOT, 'site/data/works.json'), 'w'), ensure_ascii=False, indent=1)
print(len(out), 'works parsed')
