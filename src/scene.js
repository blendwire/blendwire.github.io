// The home viewport: a tiny software renderer drawing a Blender-style scene on a 2D canvas.
// It follows the page's shading mode (html[data-shade]): wireframe, solid, material preview, rendered.
// Drag to orbit; it turns slowly on its own unless the visitor prefers reduced motion.
(() => {
  const canvas = document.querySelector('[data-scene]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── meshes (y is up) ──────────────────────────────────
  const mesh = (verts, faces, opts) => ({ verts, faces, ...opts });
  function cube(s, [cx, cy, cz]) {
    const v = [];
    for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) v.push([cx + x, cy + y, cz + z]);
    // vertex index = xi*4 + yi*2 + zi
    return mesh(v, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]);
  }
  function sphere(r, [cx, cy, cz], seg = 18, rings = 12) {
    const v = [], f = [];
    for (let i = 0; i <= rings; i++) {
      const t = (i / rings) * Math.PI;
      for (let j = 0; j < seg; j++) { const p = (j / seg) * Math.PI * 2; v.push([cx + r * Math.sin(t) * Math.cos(p), cy + r * Math.cos(t), cz + r * Math.sin(t) * Math.sin(p)]); }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg);
      f.push([a, b, b + seg, a + seg]);
    }
    return mesh(v, f);
  }
  function torus(R, r, [cx, cy, cz], seg = 28, sides = 12) {
    const v = [], f = [];
    for (let i = 0; i < seg; i++) {
      const u = (i / seg) * Math.PI * 2;
      for (let j = 0; j < sides; j++) {
        const w = (j / sides) * Math.PI * 2;
        // tilted ring standing on the floor
        const x = (R + r * Math.cos(w)) * Math.cos(u), y = (R + r * Math.cos(w)) * Math.sin(u), z = r * Math.sin(w);
        const tilt = 0.35;
        v.push([cx + x, cy + y * Math.cos(tilt) - z * Math.sin(tilt), cz + y * Math.sin(tilt) + z * Math.cos(tilt)]);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + ((j + 1) % sides), c = ((i + 1) % seg) * sides + ((j + 1) % sides), d = ((i + 1) % seg) * sides + j;
      f.push([a, d, c, b]);
    }
    return mesh(v, f);
  }
  const objects = [
    { ...cube(1, [0, 1, 0]), color: [232, 125, 13], selected: true, spec: 0.35 },
    { ...sphere(0.8, [-2.6, 0.8, 1.1]), color: [71, 140, 230], spec: 0.8 },
    { ...torus(0.9, 0.3, [2.5, 1.25, -0.6]), color: [139, 220, 0], spec: 0.5, emissive: true },
  ];
  for (const o of objects) o.normals = o.faces.map((f) => normal(o.verts[f[0]], o.verts[f[1]], o.verts[f[2]]));

  function normal(a, b, c) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const LIGHT = (() => { const l = [-0.45, 0.8, 0.55]; const n = Math.hypot(...l); return l.map((x) => x / n); })();

  // ── camera ────────────────────────────────────────────
  let yaw = 0.7, pitch = 0.42, dist = 9.5, W = 0, H = 0, dpr = 1, cx = 0, cy = 0, focal = 0;
  const camPos = () => [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + 0.8, Math.cos(yaw) * Math.cos(pitch) * dist];
  function view(p) {
    // rotate world around the orbit target (0, 0.8, 0) into camera space
    const x0 = p[0], y0 = p[1] - 0.8, z0 = p[2];
    const cyw = Math.cos(-yaw), syw = Math.sin(-yaw);
    const x1 = x0 * cyw + z0 * syw, z1 = -x0 * syw + z0 * cyw;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y2 = y0 * cp - z1 * sp, z2 = y0 * sp + z1 * cp;
    return [x1, y2, dist - z2];
  }
  const project = (q) => [cx + (q[0] * focal) / q[2], cy - (q[1] * focal) / q[2]];

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const narrow = W < 860;
    cx = narrow ? W * 0.5 : W * 0.56; cy = narrow ? H * 0.56 : H * 0.48;
    focal = narrow ? Math.min(W * 0.75, H * 1.15) : Math.min(W, H) * 1.25;
  }

  // ── drawing ───────────────────────────────────────────
  const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const rgb = (c, k = 1) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;

  function line(a, b, style, width = 1) {
    const qa = view(a), qb = view(b);
    if (qa[2] < 0.3 || qb[2] < 0.3) return;
    const pa = project(qa), pb = project(qb);
    ctx.strokeStyle = style; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
  }

  function floor(mode) {
    if (mode === 'rendered') {
      const c = project(view([0, 0, 0]));
      const g = ctx.createRadialGradient(c[0], c[1], 10, c[0], c[1], focal * 0.7);
      g.addColorStop(0, 'rgba(255,170,90,.16)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      return;
    }
    const light = mode === 'material';
    const n = 10;
    for (let i = -n; i <= n; i++) {
      const a = 1 - Math.abs(i) / (n + 1);
      const col = light ? `rgba(0,0,0,${0.12 * a})` : `rgba(255,255,255,${(mode === 'wire' ? 0.13 : 0.09) * a})`;
      if (i !== 0) { line([i, 0, -n], [i, 0, n], col); line([-n, 0, i], [n, 0, i], col); }
    }
    line([-n, 0, 0], [n, 0, 0], 'rgba(255,51,82,.75)', 1.5);
    line([0, 0, -n], [0, 0, n], 'rgba(139,220,0,.65)', 1.5);
  }

  // Soft contact shadows under each object (rendered and material).
  function shadows(mode) {
    for (const o of objects) {
      const c = o.verts.reduce((s, v) => [s[0] + v[0], s[1] + v[2]], [0, 0]).map((x) => x / o.verts.length);
      const p = project(view([c[0] + 0.25, 0, c[1] - 0.2]));
      const r = focal * 0.11;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      g.addColorStop(0, `rgba(0,0,0,${mode === 'rendered' ? 0.55 : 0.22})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1.6, 0.55); ctx.translate(-p[0], -p[1]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  function draw() {
    const mode = document.documentElement.dataset.shade || 'solid';
    ctx.clearRect(0, 0, W, H);
    floor(mode);
    const cam = camPos();
    const accent = css('--accent') || '#e87d0d';

    if (mode === 'wire') {
      for (const o of objects) {
        const seen = new Set();
        for (const f of o.faces) for (let i = 0; i < f.length; i++) {
          const a = f[i], b = f[(i + 1) % f.length], k = a < b ? `${a}-${b}` : `${b}-${a}`;
          if (seen.has(k)) continue; seen.add(k);
          line(o.verts[a], o.verts[b], o.selected ? accent : 'rgba(230,230,230,.55)', o.selected ? 1.4 : 0.8);
        }
      }
      return;
    }
    if (mode !== 'solid') shadows(mode);

    // Collect visible faces from every object, then paint back to front.
    const polys = [];
    for (const o of objects) {
      o.faces.forEach((f, fi) => {
        const n = o.normals[fi];
        const c0 = o.verts[f[0]];
        const toCam = [cam[0] - c0[0], cam[1] - c0[1], cam[2] - c0[2]];
        if (dot(n, toCam) <= 0) return; // back face
        const q = f.map((i) => view(o.verts[i]));
        if (q.some((p) => p[2] < 0.3)) return;
        const depth = q.reduce((s, p) => s + p[2], 0) / q.length;
        polys.push({ o, n, pts: q.map(project), depth, toCam });
      });
    }
    polys.sort((a, b) => b.depth - a.depth);

    for (const { o, n, pts, toCam } of polys) {
      const diff = Math.max(0, dot(n, LIGHT));
      let fill;
      if (mode === 'solid') {
        // Blender's default studio light: soft grey, a little brighter toward the light
        const g = 0.42 + diff * 0.5 + Math.max(0, n[1]) * 0.08;
        fill = rgb([200, 200, 200], g);
      } else {
        const len = Math.hypot(...toCam);
        const v = toCam.map((x) => x / len);
        const h = [LIGHT[0] + v[0], LIGHT[1] + v[1], LIGHT[2] + v[2]];
        const hl = Math.hypot(...h);
        const spec = Math.pow(Math.max(0, dot(n, h.map((x) => x / hl))), 40) * o.spec;
        const amb = mode === 'rendered' ? 0.18 : 0.38;
        const rim = mode === 'rendered' ? Math.pow(1 - Math.max(0, dot(n, v)), 3) * 0.6 : 0;
        const k = amb + diff * (mode === 'rendered' ? 0.95 : 0.7) + rim;
        const c = o.emissive && mode === 'rendered' ? o.color.map((x) => x * 1.15) : o.color;
        fill = `rgb(${Math.min(255, c[0] * k + spec * 255) | 0},${Math.min(255, c[1] * k + spec * 255) | 0},${Math.min(255, c[2] * k + spec * 255) | 0})`;
      }
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      if (mode === 'rendered' && o.emissive) { ctx.shadowColor = 'rgba(160,255,60,.65)'; ctx.shadowBlur = 18; } else ctx.shadowBlur = 0;
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.stroke(); // hides hairline seams between faces
    }
    ctx.shadowBlur = 0;

    // Selection outline, as Blender draws the active object in Solid mode.
    if (mode === 'solid') {
      ctx.strokeStyle = accent; ctx.lineWidth = 1.6;
      for (const p of polys) if (p.o.selected) { ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1; }
    }
    if (mode === 'rendered') {
      // light bloom over the whole frame
      const g = ctx.createRadialGradient(cx - focal * 0.2, cy - focal * 0.45, 0, cx - focal * 0.2, cy - focal * 0.45, focal * 0.9);
      g.addColorStop(0, 'rgba(255,220,170,.10)'); g.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  // ── interaction & loop ────────────────────────────────
  let dragging = false, lx = 0, ly = 0, idleAt = 0, visible = true, last = performance.now();
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lx) * 0.008;
    pitch = Math.max(0.08, Math.min(1.35, pitch + (e.clientY - ly) * 0.006));
    lx = e.clientX; ly = e.clientY; idleAt = performance.now();
    if (reduce) draw();
  });
  const up = () => { dragging = false; idleAt = performance.now(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  function frame(t) {
    const dt = Math.min(64, t - last); last = t;
    if (!dragging && t - idleAt > 1500) yaw += dt * 0.00012;
    draw();
    if (visible && !reduce) requestAnimationFrame(frame);
  }
  resize(); draw();
  addEventListener('resize', () => { resize(); draw(); });
  document.addEventListener('shadechange', draw);
  if (!reduce) {
    new IntersectionObserver(([e]) => {
      const was = visible; visible = e.isIntersecting;
      if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
    }).observe(canvas);
    requestAnimationFrame(frame);
  }
})();
