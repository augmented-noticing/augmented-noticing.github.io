# Augmented Noticing — Annotated Portfolio (website)

Static site: 50 more-than-human design works on an infinite canvas, filterable by research-question
viewpoints (RQ1 gaps · RQ2 tactics · RQ3 political tensions), practice cluster, evidence grade, and annotator.

Live: https://augmented-noticing.github.io/ · Source of the notes: [`references/notes/`](../references/notes/)
in the research repository.

## Layout

```
index.html / style.css / app.js     the app (vanilla JS, no build step)
build_data.py                       merges data/works.json + tags.json + images.json → portfolio.json, annotations.json
deploy.sh                           pushes this directory to augmented-noticing/augmented-noticing.github.io
data/works.json                     parsed from references/notes/w*.md (+ the RQ CSV) — regenerate with the parser in deploy.sh
data/tags.json                      controlled-vocabulary RQ tags per work
data/tag_vocabulary.json            the three vocabularies (id, label, zh)
data/images.json                    one representative image per work with page URL, credit, permission status
data/annotations.json               all annotations shown on the site (see below)
assets/works/wXX.jpg                downsized representative images
```

## Annotations

`data/annotations.json` is a flat list:

```json
{ "id": "W07-rq2-jiabao", "work": "W07", "rq": "rq2", "annotator": "Jiabao Li", "role": "maker",
  "text": "…", "date": "2026-09-01", "status": "contributor" }
```

- Rows with `status: "researcher-generated"` are regenerated from the notes by `build_data.py`; do not edit them here.
- Rows with `status: "practitioner-dialogue-provisional"` are imported by `scripts/import_dialogue_annotations.py`
  from the translated 1 Aug 2026 Amber–Jiabao dialogue (`data/dialogue_annotations_2026-08-01.json`; readable record in
  `data/dialogue_annotations_2026-08-01_en.md`). They carry `timestamp`, `zh` (ASR excerpt), `speaker_confidence`, and
  `verification_note`; rows with `work: null` show under the site's **Dialogue** tab. Re-run the import script to refresh.
- Everyone else's annotations are added by hand (or by pasting the JSON exported from the site's
  **Export my notes** button) and committed. `rq` is `rq1` / `rq2` / `rq3` / `general`.
- Notes added in the browser stay in that browser's `localStorage` until exported.

## Images

Images are reproduced from creators' and venues' public pages for scholarly reference. Every entry in
`data/images.json` records the page it came from, the credit as stated there, and `permission`
(`unverified` until the creator confirms). Replace a file in `assets/works/` and update the JSON to swap an image;
set `"file": null` to remove one.

## Rebuild and deploy

```bash
# from the research repo root
python3 site/build_data.py        # after editing tags/images/annotations
./site/deploy.sh                  # pushes site/ to the GitHub Pages repository
```
