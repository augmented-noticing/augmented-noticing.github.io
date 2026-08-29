/* Augmented Noticing — annotated portfolio canvas. Vanilla JS, no build step. */
(() => {
  'use strict';

  const RQ = ['rq1', 'rq2', 'rq3'];
  const RQ_LABEL = { rq1: 'RQ1 · Gaps', rq2: 'RQ2 · Tactics', rq3: 'RQ3 · Political tensions' };
  const RQ_Q = {
    rq1: 'What gaps do practitioners encounter when seeking to make more-than-human relations noticeable beyond specialist niches?',
    rq2: 'What sensory, affective, expressive, relational, and activist tactics do practitioners use or propose to bridge these gaps?',
    rq3: 'What political tensions become visible when makers and peers reflect on how these bridges configure attention, interpretation, publics, and action?',
  };
  const LS_POS = 'an.positions.v1';
  const LS_ANN = 'an.annotations.v1';
  const AVATAR_COLORS = ['#c2410c', '#0f766e', '#6d28d9', '#1d4ed8', '#b45309', '#be123c', '#4d7c0f', '#0e7490'];

  const state = {
    works: [], byId: new Map(), clusters: [], vocab: {}, vocabById: {},
    annotations: [], localAnnotations: [],
    tags: { rq1: new Set(), rq2: new Set(), rq3: new Set() },
    facets: { layer: new Set(), practice: new Set(), grade: new Set(), recommendation: new Set(), annotator: new Set() },
    query: '', selected: null,
    view: { x: 0, y: 0, k: 1 },
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>').split(/\n\n+/).map(p => `<p>${p}</p>`).join('');
  const initials = name => name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const colorFor = (() => { const m = new Map(); return name => { if (!m.has(name)) m.set(name, AVATAR_COLORS[m.size % AVATAR_COLORS.length]); return m.get(name); }; })();

  // ---------- data ----------
  async function load() {
    const get = u => fetch(u, { cache: 'no-cache' }).then(r => r.json());
    const [portfolio, vocab, ann] = await Promise.all([
      get('data/portfolio.json'), get('data/tag_vocabulary.json'), get('data/annotations.json').catch(() => []),
    ]);
    state.works = portfolio.works; state.clusters = portfolio.clusters; state.layoutVersion = portfolio.layout_version;
    state.works.forEach(w => state.byId.set(w.id, w));
    state.vocab = vocab;
    RQ.forEach(rq => (vocab[rq] || []).forEach(t => { state.vocabById[t.id] = { ...t, rq }; }));
    state.annotations = ann;
    try { state.localAnnotations = JSON.parse(localStorage.getItem(LS_ANN) || '[]'); } catch { state.localAnnotations = []; }
    try {
      const pos = JSON.parse(localStorage.getItem(LS_POS) || '{}');
      // Saved drag positions only apply to the layout they were made on; a new default layout discards them.
      if (pos.__v === state.layoutVersion) state.works.forEach(w => { if (pos[w.id]) { w.x = pos[w.id].x; w.y = pos[w.id].y; } });
      else localStorage.removeItem(LS_POS);
    } catch { /* ignore */ }
  }
  const allAnnotations = () => state.annotations.concat(state.localAnnotations);
  const annotationsFor = id => allAnnotations().filter(a => a.work === id);
  const annotatorsFor = id => [...new Set(annotationsFor(id).map(a => a.annotator))];

  // ---------- matching ----------
  function matches(w) {
    const q = state.query.trim().toLowerCase();
    if (q) {
      const hay = [w.id, w.title, w.creators, w.entity, w.medium, w.occasions, w.publics, w.practice_label, ...(w.keywords || []),
        ...RQ.map(rq => w[rq]), ...annotationsFor(w.id).map(a => a.text)].join('  ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    for (const rq of RQ) {
      const sel = state.tags[rq]; if (!sel.size) continue;
      if (![...sel].some(t => (w.tags?.[rq] || []).includes(t))) return false;
    }
    const f = state.facets;
    if (f.layer.size && !f.layer.has(w.layer)) return false;
    if (f.practice.size && !f.practice.has(w.practice)) return false;
    if (f.grade.size && !f.grade.has(w.grade)) return false;
    if (f.recommendation.size && !f.recommendation.has(w.recommendation)) return false;
    if (f.annotator.size && !annotatorsFor(w.id).some(a => f.annotator.has(a))) return false;
    return true;
  }
  const anyFilter = () => state.query.trim() || RQ.some(rq => state.tags[rq].size) || Object.values(state.facets).some(s => s.size);

  // ---------- sidebar ----------
  function buildChips() {
    RQ.forEach(rq => {
      const box = $(`#chips-${rq}`); box.innerHTML = '';
      (state.vocab[rq] || []).forEach(t => {
        const n = state.works.filter(w => (w.tags?.[rq] || []).includes(t.id)).length;
        const b = document.createElement('button');
        b.className = `chip ${rq}` + (n ? '' : ' is-zero'); b.dataset.rq = rq; b.dataset.tag = t.id;
        b.title = (t.zh ? t.zh + ' · ' : '') + (t.hint || t.label);
        b.innerHTML = `${esc(t.label)} <span class="n">${n}</span>`;
        b.addEventListener('click', () => { toggle(state.tags[rq], t.id); render(); });
        box.appendChild(b);
      });
    });
    const facetDefs = {
      layer: [['existing_core', 'Core portfolio'], ['new_candidate', 'Expanded portfolio'], ['dialogue_addition', 'Dialogue additions']],
      practice: state.clusters.map(c => [c.key, c.label]),
      grade: [...new Set(state.works.map(w => w.grade))].sort(),
      recommendation: [...new Set(state.works.map(w => w.recommendation))].sort(),
      annotator: [...new Set(allAnnotations().map(a => a.annotator))],
    };
    Object.entries(facetDefs).forEach(([facet, vals]) => {
      const box = $(`#facet-${facet}`); box.innerHTML = '';
      vals.forEach(v => {
        const [val, label] = Array.isArray(v) ? v : [v, v.replace(/_/g, ' ')];
        const n = state.works.filter(w => facet === 'annotator' ? annotatorsFor(w.id).includes(val) : w[facet] === val).length;
        const b = document.createElement('button');
        b.className = 'chip facet-chip'; b.dataset.facet = facet; b.dataset.val = val;
        b.innerHTML = `${esc(label)} <span class="n">${n}</span>`;
        b.addEventListener('click', () => { toggle(state.facets[facet], val); render(); });
        box.appendChild(b);
      });
    });
  }
  function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }

  function buildWorkList() {
    const box = $('#work-list'); box.innerHTML = '';
    state.clusters.forEach(c => {
      const h = document.createElement('div'); h.className = 'wl-group'; h.textContent = c.label; box.appendChild(h);
      state.works.filter(w => w.practice === c.key).forEach(w => {
        const el = document.createElement('div'); el.className = 'wl-item'; el.dataset.id = w.id;
        el.innerHTML = `<span class="wl-id">${w.id}</span><div><div class="wl-title">${esc(w.title)}</div><div class="wl-sub">${esc(w.creators)}</div></div><span class="wl-grade">${esc(w.grade)}</span>`;
        el.addEventListener('click', () => { select(w.id); flyTo(w); });
        box.appendChild(el);
      });
    });
  }

  function renderSidebar() {
    RQ.forEach(rq => $$(`#chips-${rq} .chip`).forEach(b => b.classList.toggle('is-on', state.tags[rq].has(b.dataset.tag))));
    $$('.facet-chip').forEach(b => b.classList.toggle('is-on', state.facets[b.dataset.facet].has(b.dataset.val)));
    $('#btn-clear').hidden = !anyFilter();
    $$('.wl-item').forEach(el => {
      const w = state.byId.get(el.dataset.id);
      el.classList.toggle('is-dim', anyFilter() && !matches(w));
      el.classList.toggle('is-selected', state.selected === w.id);
    });
  }

  // ---------- canvas ----------
  const canvas = $('#canvas'), world = $('#world');
  function applyView() { world.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.k})`; }

  function buildCanvas() {
    world.innerHTML = '';
    state.clusters.forEach(c => {
      const box = document.createElement('div'); box.className = 'cluster-box';
      Object.assign(box.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
      world.appendChild(box);
      const l = document.createElement('div'); l.className = 'cluster-label';
      l.style.left = (c.x + 16) + 'px'; l.style.top = (c.y - 34) + 'px';
      l.innerHTML = `${esc(c.label)}<small>${c.count} work${c.count === 1 ? '' : 's'}</small>`;
      world.appendChild(l);
    });
    state.works.forEach(w => world.appendChild(makeCard(w)));
  }

  function makeCard(w) {
    const el = document.createElement('article'); el.className = 'card'; el.dataset.id = w.id;
    el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
    const img = w.image?.file ? `<img class="card-img" src="${esc(w.image.file)}" alt="${esc(w.title)}" loading="lazy" draggable="false">`
      : `<div class="card-img is-missing">no image on file</div>`;
    const notes = RQ.map(rq => `<div class="note ${rq}"><b>${rq.toUpperCase()}</b>${esc(w.short?.[rq] || w[rq])}</div>`).join('');
    const extra = annotationsFor(w.id).filter(a => a.status !== 'researcher-generated');
    const who = [...new Set(extra.map(a => a.annotator))].map(a => `<span class="avatar" style="background:${colorFor(a)}" title="${esc(a)}">${initials(a)}</span>`).join('');
    const n = extra.length;
    el.innerHTML = `${img}
      <div class="card-body">
        <div class="card-head"><span class="card-id ${w.layer === 'existing_core' ? 'core' : ''}">${w.id} · ${w.matrix_id}</span><span class="card-grade" title="Evidence grade">${esc(w.grade)}</span></div>
        <div class="card-title">${esc(w.title)}</div>
        <div class="card-meta">${esc(w.creators)} · ${esc(w.year_short || w.year)}</div>
      </div>
      <div class="card-notes">${notes}</div>
      <div class="card-foot">${who}<span class="n-notes">${n ? `${n} annotation${n === 1 ? '' : 's'}` : 'no annotations yet'}</span></div>`;
    return el;
  }

  function renderCanvas() {
    const filtering = anyFilter();
    $$('.card').forEach(el => {
      const w = state.byId.get(el.dataset.id); const hit = matches(w);
      el.classList.toggle('is-dim', filtering && !hit);
      el.classList.toggle('is-hit', filtering && hit);
      el.classList.toggle('is-selected', state.selected === w.id);
    });
    const n = state.works.filter(matches).length;
    const nAnn = allAnnotations().filter(a => a.status !== 'researcher-generated').length;
    $('#status-count').textContent = filtering ? `${n} of ${state.works.length} works highlighted` : `${state.works.length} works · ${nAnn} annotation${nAnn === 1 ? '' : 's'}`;
  }

  function fitAll(pad = 60) {
    const r = canvas.getBoundingClientRect();
    const xs = state.works.map(w => w.x), ys = state.works.map(w => w.y);
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad - 40;
    const maxX = Math.max(...xs) + 270 + pad, maxY = Math.max(...ys) + 420 + pad;
    const k = Math.min(r.width / (maxX - minX), r.height / (maxY - minY), 1.2);
    state.view = { k, x: (r.width - (maxX - minX) * k) / 2 - minX * k, y: (r.height - (maxY - minY) * k) / 2 - minY * k };
    applyView();
  }
  function flyTo(w) {
    const r = canvas.getBoundingClientRect(); const k = Math.max(state.view.k, 0.9);
    const drawerW = $('#drawer').classList.contains('is-open') ? Math.min(480, r.width * .5) : 0;
    state.view = { k, x: (r.width - drawerW) / 2 - (w.x + 135) * k, y: r.height / 2 - (w.y + 210) * k };
    world.style.transition = 'transform .35s ease'; applyView();
    setTimeout(() => (world.style.transition = ''), 380);
  }
  function zoomAt(factor, cx, cy) {
    const k2 = Math.min(3, Math.max(0.12, state.view.k * factor));
    state.view.x = cx - (cx - state.view.x) * (k2 / state.view.k);
    state.view.y = cy - (cy - state.view.y) * (k2 / state.view.k);
    state.view.k = k2; applyView();
  }

  // pointer interactions: pan background, drag cards, click to select
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const card = e.target.closest('.card');
    drag = { sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, moved: false, card, id: e.pointerId };
    if (card) { const w = state.byId.get(card.dataset.id); drag.wx = w.x; drag.wy = w.y; }
    canvas.setPointerCapture(e.pointerId);
    if (!card) canvas.classList.add('is-panning');
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (drag.card) {
      const w = state.byId.get(drag.card.dataset.id);
      w.x = drag.wx + dx / state.view.k; w.y = drag.wy + dy / state.view.k;
      drag.card.style.left = w.x + 'px'; drag.card.style.top = w.y + 'px'; drag.card.classList.add('is-dragging');
    } else { state.view.x = drag.vx + dx; state.view.y = drag.vy + dy; applyView(); }
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    canvas.classList.remove('is-panning');
    if (drag.card) {
      drag.card.classList.remove('is-dragging');
      if (drag.moved) savePositions(); else select(drag.card.dataset.id);
    } else if (!drag.moved) { select(null); }
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    // Pinch on a trackpad arrives as wheel + ctrlKey; a physical mouse wheel sends large integer line steps.
    const isPinch = e.ctrlKey || e.metaKey;
    const isMouseWheel = e.deltaMode !== 0 || (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40 && e.deltaX === 0);
    if (isPinch) zoomAt(Math.exp(-e.deltaY * 0.012), cx, cy);
    else if (isMouseWheel) zoomAt(Math.exp(-Math.sign(e.deltaY) * 0.15), cx, cy);
    else { state.view.x -= e.deltaX; state.view.y -= e.deltaY; applyView(); } // two-finger trackpad scroll pans
  }, { passive: false });
  // touch pinch
  const pts = new Map(); let pinch = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') pts.set(e.pointerId, e); });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return; pts.set(e.pointerId, e);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2; const r = canvas.getBoundingClientRect();
      if (pinch) { zoomAt(d / pinch, cx - r.left, cy - r.top); drag = null; }
      pinch = d;
    }
  });
  const endTouch = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  canvas.addEventListener('pointerup', endTouch); canvas.addEventListener('pointercancel', endTouch);

  function savePositions() {
    const pos = { __v: state.layoutVersion }; state.works.forEach(w => (pos[w.id] = { x: w.x, y: w.y }));
    try { localStorage.setItem(LS_POS, JSON.stringify(pos)); } catch { /* ignore */ }
  }
  function resetLayout() {
    state.works.forEach(w => { w.x = w.x0; w.y = w.y0; const el = $(`.card[data-id="${w.id}"]`); el.style.left = w.x + 'px'; el.style.top = w.y + 'px'; });
    try { localStorage.removeItem(LS_POS); } catch { /* ignore */ }
    fitAll();
  }

  // ---------- selection + drawer ----------
  function select(id) {
    state.selected = id; renderCanvas(); renderSidebar();
    const d = $('#drawer');
    if (!id) { d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true'); return; }
    renderDrawer(state.byId.get(id)); d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false'); d.scrollTop = 0;
    history.replaceState(null, '', '#' + id);
  }

  function renderDrawer(w) {
    const tagRow = rq => (w.tags?.[rq] || []).map(t => { const v = state.vocabById[t]; return v ? `<span class="tag" data-rq="${rq}" data-tag="${t}" title="${esc(v.zh || '')}">${esc(v.label)}</span>` : ''; }).join('');
    const anns = annotationsFor(w.id).filter(a => a.status !== 'researcher-generated')
      .sort((a, b) => (a.timestamp || 'zz').localeCompare(b.timestamp || 'zz'));
    const annHtml = anns.map(renderAnn).join('');
    const src = (w.sources || []).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join('');
    const img = w.image?.file ? `<img class="d-img" src="${esc(w.image.file)}" alt="${esc(w.title)}"><div class="d-credit">Image: ${esc(w.image.credit || 'source page')}${w.image.page_url ? ` · <a href="${esc(w.image.page_url)}" target="_blank" rel="noopener">source ↗</a>` : ''} · permission ${esc(w.image.permission || 'unverified')}</div>` : '';
    $('#drawer-inner').innerHTML = `
      <button class="btn d-close" id="d-close">Close ✕</button>
      <div class="d-eyebrow"><span class="${w.layer === 'existing_core' ? 'core' : ''}">${w.id} · ${w.matrix_id} · ${({ existing_core: 'core portfolio', new_candidate: 'expanded portfolio', dialogue_addition: 'dialogue addition' })[w.layer] || w.layer}</span><span>grade ${esc(w.grade)}</span><span>${esc(w.recommendation.replace(/_/g, ' '))}</span></div>
      <h2 class="d-title">${esc(w.title)}</h2>
      <div class="d-creators">${esc(w.creators)} · ${esc(w.year)}</div>
      ${img}
      <dl class="d-facts">
        <dt>Relation</dt><dd>${esc(w.entity)}</dd>
        <dt>Medium</dt><dd>${esc(w.medium)}</dd>
        <dt>Public occasions</dt><dd>${esc(w.occasions)}</dd>
        <dt>Publics</dt><dd>${esc(w.publics)}</dd>
        <dt>Practice cluster</dt><dd>${esc(w.practice_label)}</dd>
        <dt>Note file</dt><dd><a href="https://github.com/realitydeslab/Augmented-Noticing/blob/main/references/notes/${esc(w.note_file)}" target="_blank" rel="noopener"><code>${esc(w.note_file)}</code></a></dd>
      </dl>
      <div class="d-section"><h3>Identity and project summary</h3><div class="serif">${md(w.summary)}</div></div>
      <div class="d-section"><h3>Exhibition, deployment and publics</h3>${md(w.publics_text)}</div>
      <div class="d-section"><h3>Researcher-generated annotations</h3>
        ${RQ.map(rq => `<div class="d-rq ${rq}"><div class="q">${RQ_LABEL[rq]} — ${esc(RQ_Q[rq])}</div>${md(w[rq])}<div class="tagrow">${tagRow(rq)}</div></div>`).join('')}
      </div>
      <div class="d-section"><h3>Evaluation and analytic memo</h3>
        <p><strong>Matrix evaluation.</strong> ${esc(w.evaluation)}</p>
        <div class="config">${esc(w.configuration)}</div>
        <p style="margin-top:8px"><strong>Evidence boundary.</strong> ${esc(w.evidence_boundary).replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')}</p>
      </div>
      <div class="d-section d-sources"><h3>Sources</h3>${src}</div>
      <div class="d-section"><h3>Annotations <span style="font-weight:400;text-transform:none;letter-spacing:0">(${anns.length})</span></h3>
        ${annHtml || '<p style="color:var(--ink-3)">No additional annotations yet.</p>'}
        <form class="ann-form" id="ann-form">
          <div class="row"><input name="annotator" placeholder="Your name" required><select name="rq"><option value="rq1">RQ1 · gaps</option><option value="rq2">RQ2 · tactics</option><option value="rq3">RQ3 · tensions</option><option value="general">General</option></select></div>
          <input name="role" placeholder="Role (e.g. maker, peer, reviewer) — optional">
          <textarea name="text" placeholder="Add an annotation for this work…" required></textarea>
          <div class="row"><button class="btn" type="submit">Add note (saved in this browser)</button><span class="hint">Use “Export my notes” in the top bar to share them as JSON for a pull request.</span></div>
        </form>
      </div>
      <div class="d-caution"><strong>Coding cautions.</strong> Do not infer exposure → engagement → interpretation → participation → action → lasting consequence without evidence for each transition. Treat creator-reported claims as creator-reported unless independently verified. Treat sensory translation, personification and proxy voice as mediation, not direct access to a more-than-human perspective.</div>`;
    $('#d-close').addEventListener('click', () => select(null));
    $$('#drawer .tag').forEach(t => t.addEventListener('click', () => { toggle(state.tags[t.dataset.rq], t.dataset.tag); $$('.side-tab')[0].click(); render(); }));
    $$('#drawer .del').forEach(b => b.addEventListener('click', () => { state.localAnnotations = state.localAnnotations.filter(a => a.id !== b.dataset.del); persistLocal(); rebuildAll(); select(w.id); }));
    $('#ann-form').addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      state.localAnnotations.push({ id: 'local-' + Date.now(), work: w.id, rq: f.get('rq'), annotator: f.get('annotator').trim(), role: f.get('role').trim(), text: f.get('text').trim(), date: new Date().toISOString().slice(0, 10), status: 'contributor', local: true });
      try { localStorage.setItem('an.name', f.get('annotator').trim()); } catch { /* ignore */ }
      persistLocal(); rebuildAll(); select(w.id);
    });
    try { const nm = localStorage.getItem('an.name'); if (nm) $('#ann-form [name=annotator]').value = nm; } catch { /* ignore */ }
  }
  const STATUS_LABEL = { 'practitioner-dialogue-provisional': 'dialogue · provisional', contributor: 'contributor', 'researcher-generated': 'researcher-generated' };
  function renderAnn(a) {
    const prov = a.status === 'practitioner-dialogue-provisional';
    const tags = (a.tags || []).map(t => state.vocabById[t]).filter(Boolean).map(v => `<span class="tag" title="${esc(v.zh || '')}">${esc(v.label)}</span>`).join('');
    return `<div class="ann ${esc(a.rq || '')} ${a.indirect ? 'indirect' : ''}">
      <div class="ann-head"><span class="avatar" style="background:${colorFor(a.annotator)}">${initials(a.annotator)}</span><span class="who">${esc(a.annotator)}</span>${a.role ? `<span>· ${esc(a.role)}</span>` : ''}<span class="rq">${esc((a.rq || '').toUpperCase())}</span>${a.timestamp ? `<span class="ts">${esc(a.timestamp)}</span>` : ''}${a.date && !a.timestamp ? `<span>· ${esc(a.date)}</span>` : ''}<span class="status ${prov ? 'prov' : ''}" title="${esc(a.source || '')}">${esc(STATUS_LABEL[a.status] || a.status || '')}${a.speaker_confidence === 'low' ? ' · speaker uncertain' : ''}</span>${a.local ? `<button class="del" data-del="${esc(a.id)}" title="Remove this note from your browser">remove</button>` : ''}</div>
      ${a.indirect && a.work_name ? `<div class="gist">Said about ${esc(a.work_name)}; also relevant here.</div>` : ''}
      <div>${md(a.text)}</div>
      ${a.gist ? `<div class="gist">${esc(a.gist)}</div>` : ''}
      ${a.verification_note ? `<div class="verify">Verify before citing: ${esc(a.verification_note)}</div>` : ''}
      ${a.zh ? `<details><summary>原文 (ASR transcript)</summary><div class="zh">${esc(a.zh)}</div></details>` : ''}
      ${tags ? `<div class="tagrow">${tags}</div>` : ''}</div>`;
  }
  function buildDialogueList() {
    const box = $('#dialogue-list'); if (!box) return; box.innerHTML = '';
    const general = allAnnotations().filter(a => !a.work && a.status !== 'researcher-generated');
    if (!general.length) { box.innerHTML = '<p class="side-hint">No general dialogue notes yet.</p>'; return; }
    const groups = [['general', 'Framing and theory'], ['rq1', RQ_LABEL.rq1], ['rq2', RQ_LABEL.rq2], ['rq3', RQ_LABEL.rq3]];
    groups.forEach(([rq, title]) => {
      const rows = general.filter(a => (a.rq || 'general') === rq).sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
      if (!rows.length) return;
      const h = document.createElement('div'); h.className = 'dl-group'; h.textContent = `${title} · ${rows.length}`; box.appendChild(h);
      const wrap = document.createElement('div'); wrap.innerHTML = rows.map(renderAnn).join(''); box.appendChild(wrap);
    });
  }
  function persistLocal() { try { localStorage.setItem(LS_ANN, JSON.stringify(state.localAnnotations)); } catch { /* ignore */ } }
  function exportLocal() {
    const blob = new Blob([JSON.stringify(state.localAnnotations.map(({ local, ...a }) => a), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-annotations.json'; a.click();
  }

  // ---------- wiring ----------
  function rebuildAll() { buildChips(); buildCanvas(); buildDialogueList(); renderSidebar(); renderCanvas(); }
  function render() { renderSidebar(); renderCanvas(); }

  function wire() {
    $$('.side-tab').forEach(t => t.addEventListener('click', () => {
      $$('.side-tab').forEach(x => x.classList.toggle('is-active', x === t));
      $$('.side-panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === t.dataset.tab));
    }));
    $('#search').addEventListener('input', e => { state.query = e.target.value; render(); });
    $('#btn-clear').addEventListener('click', () => { RQ.forEach(rq => state.tags[rq].clear()); Object.values(state.facets).forEach(s => s.clear()); state.query = ''; $('#search').value = ''; render(); });
    $('#btn-fit').addEventListener('click', () => fitAll()); $('#zoom-fit').addEventListener('click', () => fitAll());
    $('#btn-reset-layout').addEventListener('click', resetLayout);
    $('#btn-export').addEventListener('click', exportLocal);
    const r = () => canvas.getBoundingClientRect();
    $('#zoom-in').addEventListener('click', () => zoomAt(1.25, r().width / 2, r().height / 2));
    $('#zoom-out').addEventListener('click', () => zoomAt(0.8, r().width / 2, r().height / 2));
    document.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'f' || e.key === 'F') fitAll();
      if (e.key === '+' || e.key === '=') zoomAt(1.25, r().width / 2, r().height / 2);
      if (e.key === '-') zoomAt(0.8, r().width / 2, r().height / 2);
      if (e.key === 'Escape') select(null);
    });
    window.addEventListener('resize', () => { /* keep view; user can press F */ });
  }

  load().then(() => {
    state.works.forEach(w => { w.x0 = w.x0 ?? w.x; w.y0 = w.y0 ?? w.y; });
    $('.brand-sub').textContent = `Annotated portfolio · ${state.works.length} more-than-human design works`;
    wire(); buildWorkList(); rebuildAll(); fitAll();
    const h = location.hash.replace('#', '');
    if (h && state.byId.has(h)) { select(h); flyTo(state.byId.get(h)); }
  }).catch(err => { $('#status-count').textContent = 'Failed to load data: ' + err.message; console.error(err); });
})();
