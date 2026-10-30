// Blendwire client: viewport shading modes, live times, filters, tabs, outliner,
// the F3 search palette and live update notices. No dependencies.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.body.dataset.root || '';
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const typing = (e) => /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;

  // ── viewport shading: restyles the whole site ─────────
  const SHADE_NAMES = { wire: 'Wireframe', solid: 'Solid', material: 'Material Preview', rendered: 'Rendered' };
  const THEME_COLOR = { wire: '#0c0c0c', solid: '#1d1d1d', material: '#d6d6d6', rendered: '#07060a' };
  const setShade = (mode) => {
    if (!SHADE_NAMES[mode]) return;
    document.documentElement.dataset.shade = mode;
    store.set('shade', mode);
    $$('.shading [data-shade]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.shade === mode)));
    $$('[data-shade-label]').forEach((l) => { l.textContent = SHADE_NAMES[mode]; });
    $('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
    document.dispatchEvent(new Event('shadechange'));
  };
  setShade(document.documentElement.dataset.shade || 'solid');
  $$('.shading [data-shade]').forEach((b) => b.addEventListener('click', () => setShade(b.dataset.shade)));
  // Z opens Blender's shading pie menu at the pointer; 1–4 or a click picks a mode.
  const pie = $('[data-pie]');
  let pointer = [innerWidth / 2, innerHeight / 2];
  addEventListener('pointermove', (e) => { pointer = [e.clientX, e.clientY]; }, { passive: true });
  const closePie = () => { pie.hidden = true; };
  const openPie = () => {
    const x = Math.min(innerWidth - 200, Math.max(200, pointer[0])), y = Math.min(innerHeight - 110, Math.max(150, pointer[1]));
    pie.style.left = `${x}px`; pie.style.top = `${y}px`;
    $$('button', pie).forEach((b) => b.classList.toggle('on', b.dataset.shade === document.documentElement.dataset.shade));
    pie.hidden = false;
  };
  pie.addEventListener('click', (e) => { const b = e.target.closest('[data-shade]'); if (b) { setShade(b.dataset.shade); closePie(); } });
  document.addEventListener('pointerdown', (e) => { if (!pie.hidden && !pie.contains(e.target)) closePie(); });
  document.addEventListener('keydown', (e) => {
    if (pie.hidden) return;
    const pick = { 1: 'wire', 2: 'solid', 3: 'material', 4: 'rendered' }[e.key];
    if (pick) { e.preventDefault(); e.stopImmediatePropagation(); setShade(pick); closePie(); }
    else if (e.key === 'Escape') { e.stopImmediatePropagation(); closePie(); }
  }, true);
  if ($('[data-scene]')) document.head.appendChild(Object.assign(document.createElement('script'), { src: `${root}assets/scene.js?v=${document.currentScript?.src.split('v=')[1] || ''}`, defer: true }));

  // ── sidebar ───────────────────────────────────────────
  const toggleSidebar = () => {
    const off = document.documentElement.classList.toggle('no-side');
    store.set('sidebar', off ? '0' : '1');
    dispatchEvent(new Event('resize'));
  };

  // ── live relative times ───────────────────────────────
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
    if (s < 86400 * 365) return `${Math.round(s / 86400 / 30)}mo ago`;
    return `${(s / 86400 / 365).toFixed(1).replace(/\.0$/, '')}y ago`;
  };
  const tick = () => $$('time[datetime]').forEach((t) => { if (/ago$/.test(t.textContent)) t.textContent = ago(t.getAttribute('datetime')); });
  setInterval(tick, 60e3);
  const countdowns = () => $$('[data-countdown]').forEach((c) => {
    const days = Math.max(0, Math.ceil((Date.parse(c.dataset.countdown) - Date.now()) / 864e5));
    const b = $('b', c); if (b) b.textContent = days;
  });
  countdowns(); setInterval(countdowns, 3600e3);

  // ── category filter (home feed, project grids) ────────
  $$('[data-filter]').forEach((group) => {
    const scope = group.closest('section') || document;
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      $$('button', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const cat = btn.dataset.cat;
      $$('.node, .pnode', scope).forEach((n) => n.classList.toggle('is-hidden', cat !== 'all' && n.dataset.cat !== cat));
    });
  });
  // News topic filter
  $$('[data-tagfilter]').forEach((group) => {
    const scope = group.closest('section');
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tag]');
      if (!btn) return;
      $$('button', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      $$('.art', scope).forEach((a) => a.classList.toggle('is-hidden', btn.dataset.tag !== 'all' && a.dataset.tag !== btn.dataset.tag));
    });
  });

  // ── tabs ──────────────────────────────────────────────
  $$('[data-tabs]').forEach((list) => {
    const tabs = $$('[role="tab"]', list);
    const select = (tab) => {
      tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', String(on)); const p = document.getElementById(t.getAttribute('aria-controls')); if (p) p.hidden = !on; });
    };
    list.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) select(t); });
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0 || !/Arrow(Left|Right)/.test(e.key)) return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); select(n);
    });
  });

  // ── outliner ──────────────────────────────────────────
  const ol = $('[data-outliner]');
  if (ol) {
    ol.addEventListener('click', (e) => {
      const twist = e.target.closest('.ol-twist');
      const eye = e.target.closest('.ol-eye');
      if (twist) {
        const open = twist.getAttribute('aria-expanded') !== 'true';
        twist.setAttribute('aria-expanded', String(open));
        twist.closest('.ol-coll').classList.toggle('is-collapsed', !open);
      }
      if (eye) {
        const on = eye.getAttribute('aria-pressed') !== 'true';
        eye.setAttribute('aria-pressed', String(on));
        eye.closest('.ol-coll').classList.toggle('is-off', !on);
      }
    });
    $('[data-ol-filter]', ol)?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.ol-obj', ol).forEach((li) => li.classList.toggle('is-hidden', !!q && !li.dataset.name.includes(q)));
    });
  }

  // ── properties tabs: highlight the panel in view ──────
  const props = $('[data-props]');
  if (props && 'IntersectionObserver' in window) {
    const links = $$('.props-tabs a', props);
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${en.target.id}`));
    }), { rootMargin: '-40% 0px -55% 0px' });
    $$('.ppanel[id]', props).forEach((p) => io.observe(p));
  }

  // ── tooltips ([data-tip]) ───────────────
  let tip;
  const showTip = (el) => {
    tip ||= Object.assign(document.createElement('div'), { className: 'data-tip-pop' });
    tip.textContent = el.dataset.tip;
    document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 8}px`;
  };
  const hideTip = () => tip?.remove();
  document.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) hideTip(); });

  // ── F3 search palette ─────────────────────────────────
  const pal = $('[data-palette]');
  const input = $('[data-palette-input]');
  const list = $('[data-palette-list]');
  let index = null, results = [], sel = 0;
  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mark = (s, q) => {
    const e = escHtml(s);
    if (!q) return e;
    const i = s.toLowerCase().indexOf(q);
    return i < 0 ? e : `${escHtml(s.slice(0, i))}<mark>${escHtml(s.slice(i, i + q.length))}</mark>${escHtml(s.slice(i + q.length))}`;
  };
  const load = async () => {
    if (index) return index;
    try { index = (await (await fetch(`${root}search.json`)).json()).items; } catch { index = []; }
    return index;
  };
  const score = (it, q, words) => {
    const n = it.n.toLowerCase();
    const hay = `${n} ${(it.s || '').toLowerCase()} ${(it.t || '').toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) return -1;
    let s = n === q ? 100 : n.startsWith(q) ? 60 : n.includes(q) ? 35 : 10;
    if (it.t === 'page') s += 20;
    if (!it.x) s += 8;
    if (it.d) s += Math.max(0, 10 - (Date.now() - Date.parse(it.d)) / 864e5 / 30);
    return s;
  };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    results = (q ? index.map((it) => [score(it, q, words), it]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0]).map(([, it]) => it) : index.filter((it) => it.t === 'page' || it.t === 'series').slice(0, 14)).slice(0, 40);
    sel = 0;
    list.innerHTML = results.length ? results.map((it, i) => `<li role="option" aria-selected="${i === sel}"><a href="${it.x ? escHtml(it.u) : root + escHtml(it.u)}"${it.x ? ' target="_blank" rel="noopener"' : ''}><span class="pt" style="--c:${escHtml(it.c || '')}"><i></i>${escHtml(it.t)}</span><span class="pn">${mark(it.n, q)}</span><span class="ps">${escHtml(it.s || '')}</span></a></li>`).join('') : '<li class="empty">Nothing found</li>';
  };
  const highlight = () => $$('li[role="option"]', list).forEach((li, i) => { li.setAttribute('aria-selected', String(i === sel)); if (i === sel) li.scrollIntoView({ block: 'nearest' }); });
  const openPalette = async () => { pal.hidden = false; input.value = ''; input.focus(); await load(); render(); };
  const closePalette = () => { pal.hidden = true; };
  $$('[data-search]').forEach((b) => b.addEventListener('click', openPalette));
  pal.addEventListener('click', (e) => { if (e.target === pal) closePalette(); });
  input.addEventListener('input', () => index && render());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); highlight(); }
    else if (e.key === 'Enter') { const a = $$('li[role="option"] a', list)[sel]; if (a) { e.preventDefault(); a.click(); closePalette(); } }
  });

  // ── Blender-style shortcuts ───────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pal.hidden) { closePalette(); return; }
    if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); openPalette(); return; }
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); }
    else if (e.key === 'n' || e.key === 'N') toggleSidebar();
    else if (e.key === 'z' || e.key === 'Z') openPie();
  });

  // ── Your Blender: personal update status + add-on compatibility ──
  const vData = (() => { try { return JSON.parse($('#bw-versions').textContent); } catch { return null; } })();
  if (vData) {
    const vcmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
    const all = vData.series.flatMap((s) => s.v.map(([v, d]) => ({ v, d, s })));
    const newest = all.slice().sort((a, b) => vcmp(b.v, a.v))[0];
    const supported = (s) => !s.end || Date.parse(s.end) > Date.now();
    const newestLts = vData.series.find((s) => s.lts && supported(s));
    const month = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const dl = (s) => (s === newest.s ? 'https://www.blender.org/download/' : `https://download.blender.org/release/Blender${s.s}/`);
    const status = (v) => {
      const me = all.find((x) => x.v === v);
      if (!me) return null;
      const s = me.s, latest = s.v[0][0], behind = s.v.findIndex(([x]) => x === v);
      if (!supported(s)) {
        const to = newestLts && newestLts !== s ? `${newestLts.v[0][0]} LTS` : newest.v;
        return { state: 'eol', short: `${v} · unsupported`, title: `Blender ${s.s} no longer gets fixes`,
          text: `Support ended ${month(s.end)}. Move to ${to} for bug and security fixes.`, cta: ['Get ' + to.replace(' LTS', ''), 'https://www.blender.org/download/'] };
      }
      const until = s.lts && s.end ? ` LTS · supported until ${month(s.end)}` : '';
      const newer = s !== newest.s && !s.lts ? ` Blender ${newest.v} is the newest release.` : '';
      if (behind > 0) {
        // What the newer patch releases in this series fixed: [version, date, fixes, crash, security, dataloss]
        const newerPatches = s.v.slice(0, behind);
        const miss = newerPatches.reduce((m, r) => ({ n: m.n + (r[2] || 0), crash: m.crash + (r[3] || 0), security: m.security + (r[4] || 0), dataloss: m.dataloss + (r[5] || 0) }), { n: 0, crash: 0, security: 0, dataloss: 0 });
        const serious = [miss.security && `${miss.security} security`, miss.dataloss && `${miss.dataloss} data-loss`, miss.crash && `${miss.crash} crash`].filter(Boolean);
        return { state: 'update', short: miss.n ? `${v} · missing ${miss.n} fixes` : `${v} · ${behind} behind`,
          title: miss.n ? `You're missing ${miss.n} bug fix${miss.n === 1 ? '' : 'es'}` : `${behind} bug-fix release${behind > 1 ? 's' : ''} behind`,
          text: `${serious.length ? `Including ${serious.join(', ')} fixes. ` : ''}${latest} (${day(s.v[0][1])}) is a drop-in update for ${s.s}${until ? ` — ${until.trim()}` : ''}.${newer}`,
          cta: [`Get ${latest}`, dl(s)], missing: miss.n ? newerPatches.map((r) => r[0]) : null };
      }
      return { state: 'ok', short: `${v} · up to date`, title: 'You\'re up to date', text: `${v} is the latest ${s.s} release.${until ? ` ${until.trim()}.` : ''}${newer}`, cta: newer ? [`See ${newest.v}`, `${root}releases/`] : null };
    };
    const paint = (v) => {
      $$('[data-mine-select]').forEach((sel) => { sel.value = v || ''; });
      const st = v && status(v);
      $$('[data-mine]').forEach((m) => { m.dataset.state = st ? st.state : ''; });
      $$('[data-mine-out]').forEach((out) => {
        out.innerHTML = st ? `<span class="mine-dot"></span><span class="mine-msg"><b>${st.title}</b><small>${st.text}</small></span>${st.cta ? `<a class="btn btn-sm" href="${st.cta[1]}"${/^https?:/.test(st.cta[1]) ? ' target="_blank" rel="noopener"' : ''}>${st.cta[0]}</a>` : ''}`
            + (st.missing ? `<details class="mine-miss"><summary>Show what's fixed in ${st.missing.slice().reverse().join(', ')}</summary><ul class="fix-list fix-list-sm" data-miss></ul></details>` : '')
            + (vcmp(newest.s.s, v) > 0 && !v.startsWith(`${newest.s.s}.`) ? `<a class="mine-new" href="${root}releases/${newest.s.s}/">What's new in Blender ${newest.s.s} →</a>` : '')
            + (st.state !== 'eol' ? `<button type="button" class="mine-follow" data-follow-open>${'<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>'} Get notified when ${v.split('.').slice(0, 2).join('.')} updates</button>` : '')
          : '<span class="mine-hint">See if you\'re behind, still supported, and which add-ons work for you.</span>';
        const det = $('.mine-miss', out);
        det?.addEventListener('toggle', () => { if (det.open) showMissing($('[data-miss]', det), st.missing); }, { once: true });
      });
      const sb = $('[data-mine-sb]');
      if (sb) { sb.hidden = !st; if (st) { sb.textContent = `Your Blender ${st.short}`; sb.dataset.state = st.state; } }
      // Add-on cards: flag the ones this version can't run.
      const cards = $$('.ext[data-min]');
      let bad = 0;
      for (const c of cards) {
        const no = !!v && (vcmp(v, c.dataset.min) < 0 || (c.dataset.max && vcmp(v, c.dataset.max) >= 0));
        c.classList.toggle('incompat', no);
        if (no) { bad++; c.dataset.need = vcmp(v, c.dataset.min) < 0 ? `Needs ${c.dataset.min.replace(/\.0$/, '')}+` : `Up to ${c.dataset.max}`; }
      }
      $$('[data-mine-compat]').forEach((out) => {
        out.innerHTML = v ? `<span class="mine-dot"></span><span class="mine-msg"><b>${cards.length - bad} of ${cards.length} listed add-ons work on ${v}</b><small>${bad ? `${bad} need a newer Blender — they're dimmed below.` : 'Everything here runs on your version.'}</small></span>`
          : '<span class="mine-hint">Add-ons that need a newer Blender get flagged.</span>';
      });
    };
    // The missing fixes, most serious first, loaded on demand from fixes.json.
    let fixesP = null;
    const LABEL = { security: 'Security', dataloss: 'Data loss', crash: 'Crash', fix: 'Fix' };
    const ORDER = { security: 0, dataloss: 1, crash: 2, fix: 3 };
    const showMissing = async (ul, versions) => {
      ul.innerHTML = '<li class="muted">Loading…</li>';
      try {
        fixesP ||= fetch(`${root}fixes.json`).then((r) => r.json());
        const all = await fixesP;
        const list = versions.flatMap((v) => (all[v] || []).map(([k, t, url, ref]) => ({ k, t, url, ref, v }))).sort((a, b) => ORDER[a.k] - ORDER[b.k]);
        const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const shown = list.slice(0, 14);
        ul.innerHTML = shown.map((f) => `<li class="k-${f.k}"><span class="fix-k">${LABEL[f.k]}</span><span class="fix-t">${esc(f.t)} <em>${esc(f.v)}</em></span>${f.url ? `<a class="fix-ref" href="${esc(f.url)}" target="_blank" rel="noopener nofollow">${esc(f.ref)}</a>` : ''}</li>`).join('')
          + (list.length > shown.length ? `<li class="fix-more"><a href="${root}tools/blender/${versions[0]}/">+ ${list.length - shown.length} more in the release notes →</a></li>` : '');
      } catch { ul.innerHTML = '<li class="muted">Couldn\'t load the fix list.</li>'; }
    };
    const setMine = (v) => { store.set('myBlender', v || ''); paint(v); document.dispatchEvent(new CustomEvent('minechange', { detail: v })); };
    $$('[data-mine-select]').forEach((sel) => sel.addEventListener('change', () => setMine(sel.value)));
    $$('[data-mine-hide]').forEach((cb) => {
      cb.checked = store.get('hideIncompat') === '1';
      document.documentElement.classList.toggle('hide-incompat', cb.checked);
      cb.addEventListener('change', () => { store.set('hideIncompat', cb.checked ? '1' : ''); document.documentElement.classList.toggle('hide-incompat', cb.checked); });
    });
    const saved = store.get('myBlender');
    paint(saved && all.some((x) => x.v === saved) ? saved : '');
  }

  // ── Follow: calendar + feeds popover ──────────────────
  const follow = $('[data-follow]');
  const openFollow = () => {
    follow.hidden = false;
    $('[data-follow-close]', follow)?.focus();
  };
  const closeFollow = () => { follow.hidden = true; };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-follow-open]')) { e.preventDefault(); openFollow(); return; }
    if (e.target.closest('[data-follow-close]') || e.target === follow) closeFollow();
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const done = () => { const t = copy.textContent; copy.textContent = 'Copied ✓'; setTimeout(() => { copy.textContent = t; }, 1600); };
      navigator.clipboard?.writeText(copy.dataset.copy).then(done, () => window.prompt('Copy this feed link:', copy.dataset.copy));
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && follow && !follow.hidden) closeFollow(); });
  // Put the feed for the visitor's own Blender version first, and label it.
  const markMyFeed = (v) => {
    const series = v ? v.split('.').slice(0, 2).join('.') : '';
    $$('[data-feed-list]').forEach((list) => {
      $$('[data-feed-series]', list).forEach((li) => {
        const mine = li.dataset.feedSeries === series;
        li.classList.toggle('is-mine', mine);
        li.hidden = !!series && !mine && li.dataset.feedSeries !== undefined && !li.closest('.follow-page');
        if (mine) list.prepend(li);
      });
    });
  };
  markMyFeed(store.get('myBlender'));
  document.addEventListener('minechange', (e) => markMyFeed(e.detail));

  // ── demo videos (what's new pages): play while on screen, never with reduced motion ──
  const vids = $$('video[data-autoplay]');
  if (vids.length) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      vids.forEach((v) => { v.controls = true; v.preload = 'metadata'; });
    } else {
      const io = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
        if (isIntersecting) { v.preload = 'auto'; v.play().catch(() => { v.controls = true; }); } else v.pause();
      }), { threshold: 0.5 });
      vids.forEach((v) => io.observe(v));
    }
  }

  // ── live updates: poll version.json, show a report in the status bar ──
  const report = $('[data-report]');
  const feed = $('[data-feed]');
  const generated = $('.sb-stats time')?.getAttribute('datetime');
  let pending = null;
  const poll = async () => {
    if (document.hidden) return;
    try {
      const v = await (await fetch(`${root}version.json?t=${Date.now()}`, { cache: 'no-store' })).json();
      if (!generated || v.generatedAt <= generated) return;
      const known = new Set($$('[data-id]').flatMap((n) => (n.dataset.ids || n.dataset.id).split(' ')));
      const fresh = (v.cards || []).filter((c) => !known.has(c.id));
      pending = fresh;
      report.hidden = false;
      report.textContent = fresh.length ? `● ${fresh.length} new: ${fresh[0].title}${fresh.length > 1 ? ' …' : ''}` : '● Site updated — reload';
      report.setAttribute('role', 'button'); report.tabIndex = 0;
    } catch {}
  };
  report?.addEventListener('click', () => {
    if (feed && pending?.length) {
      const tmp = document.createElement('div');
      for (const c of pending.slice().reverse()) {
        tmp.innerHTML = c.html.replace(/href="(?!https?:)/g, `href="${root}`);
        const node = tmp.firstElementChild; node.classList.add('is-new'); feed.prepend(node);
      }
      report.hidden = true; pending = null; feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else location.reload();
  });
  setInterval(poll, 90e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register(`${root}sw.js`).catch(() => {});
})();
