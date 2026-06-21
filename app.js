import * as THREE from 'three';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.innerWidth < 760;
const $ = (s) => document.querySelector(s);

/* ---------------- UI logic (works with or without WebGL) ---------------- */
function initUI(){
  const hd = $('#hd');
  const hud = $('#hud'), hudDepth = $('#hudDepth'), hudFill = $('#hudFill'), hudStrata = $('#hudStrata');
  const mFill = $('#mFill'), mRead = $('#mRead');
  const sections = Array.prototype.slice.call(document.querySelectorAll('section[data-depth]'));

  let ticking = false;
  function onScroll(){
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || 0;
      hd.classList.toggle('solid', y > 60);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      const depth = Math.round(p * 250);
      if (hudDepth) hudDepth.textContent = depth;
      if (hudFill) hudFill.style.height = (p * 170) + 'px';
      if (mFill) mFill.style.width = (p * 100) + '%';
      if (mRead) mRead.textContent = (depth === 0 ? '0м' : '−' + depth + 'м');
      // strata label = nearest section to viewport centre
      const mid = y + window.innerHeight / 2;
      let best = null, bestD = 1e9;
      for (const s of sections){
        const c = s.offsetTop + s.offsetHeight / 2;
        const d = Math.abs(c - mid);
        if (d < bestD){ bestD = d; best = s; }
      }
      if (best && hudStrata) hudStrata.textContent = best.getAttribute('data-strata') || '';
      window.__scrollP = p;
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  if (hud) setTimeout(() => hud.classList.add('show'), 1200);

  // reveal
  if ('IntersectionObserver' in window && !reduce){
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  // counters
  function count(el){
    const to = parseFloat(el.getAttribute('data-to'));
    if (reduce){ el.textContent = to; return; }
    let start = null;
    function step(t){
      if (!start) start = t;
      const p = Math.min(1, (t - start) / 1300);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * to);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window){
    const cio = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting){ count(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.6 });
    document.querySelectorAll('.cnt').forEach(el => cio.observe(el));
  } else { document.querySelectorAll('.cnt').forEach(el => el.textContent = el.getAttribute('data-to')); }

  // mobile menu
  const burger = $('#burger'), mpanel = $('#mpanel');
  function close(){ mpanel.classList.remove('open'); burger.setAttribute('aria-expanded','false'); document.body.style.overflow=''; }
  burger.addEventListener('click', () => {
    const open = mpanel.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  });
  mpanel.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

/* ---------------- WebGL descent scene ---------------- */
function initScene(){
  const canvas = $('#scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
  } catch(e){ return false; }
  if (!renderer) return false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const ABYSS = 0x06141d;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ABYSS);
  scene.fog = new THREE.FogExp2(ABYSS, 0.028);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 240);

  // lights
  scene.add(new THREE.AmbientLight(0x3a5566, 0.7));
  const key = new THREE.DirectionalLight(0xffe6c0, 1.1); key.position.set(6, 18, 8); scene.add(key);
  const waterLight = new THREE.PointLight(0x5fc4e8, 2.2, 60, 1.6); waterLight.position.set(0, -54, 0); scene.add(waterLight);
  const camLight = new THREE.PointLight(0xbfe6f5, 0.6, 26, 2); scene.add(camLight);

  const core = new THREE.Group(); scene.add(core);

  // ---- strata shaft: stacked open cylinder bands (rock layers) ----
  const stops = [
    [0xc99a59], [0xbf9150], [0xa97c45], [0x8f6f44], [0x6f6450],
    [0x556069], [0x42596a], [0x33566c], [0x295672], [0x255a74]
  ];
  function bandColor(t){
    const f = t * (stops.length - 1); const i = Math.floor(f); const k = f - i;
    const a = new THREE.Color(stops[Math.min(i, stops.length-1)][0]);
    const b = new THREE.Color(stops[Math.min(i+1, stops.length-1)][0]);
    return a.lerp(b, k);
  }
  const TOP = 6, BOTTOM = -54, N = 22, BH = (TOP - BOTTOM) / N;
  for (let i = 0; i < N; i++){
    const t = i / (N - 1);
    const yc = TOP - i * BH - BH/2;
    const r = 6.4 + Math.sin(i * 1.7) * 0.5;
    const geo = new THREE.CylinderGeometry(r, r + 0.25, BH * 0.96, 72, 1, true);
    const col = bandColor(t);
    const mat = new THREE.MeshStandardMaterial({
      color: col, emissive: col.clone().multiplyScalar(0.16),
      roughness: 0.92, metalness: 0.05, side: THREE.BackSide, fog: true
    });
    const band = new THREE.Mesh(geo, mat);
    band.position.y = yc;
    core.add(band);
    // thin seam ring between bands
    if (i > 0){
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.05, 0.03, 6, 80),
        new THREE.MeshBasicMaterial({ color: 0x0a1a24, fog: true })
      );
      ring.rotation.x = Math.PI / 2; ring.position.y = yc + BH/2;
      core.add(ring);
    }
  }

  // ---- borehole casing (drill string) ----
  const casingMat = new THREE.MeshStandardMaterial({ color: 0x9fb6c4, metalness: 0.95, roughness: 0.32, fog: true });
  const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 56, 40, 1, true), casingMat);
  casing.position.y = -25; core.add(casing);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 56, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x16323f, metalness: 0.6, roughness: 0.5, side: THREE.BackSide, fog: true }));
  inner.position.y = -25; core.add(inner);
  // glowing screen (filter) section near the water
  const screen = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 7, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2f9ccb, emissive: 0x2f9ccb, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: true }));
  screen.position.y = -47; core.add(screen);
  // collar rings on the casing (drill joints) for descent parallax cues
  for (let y = 2; y > -50; y -= 5){
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0x7d97a6, metalness: 0.9, roughness: 0.4, fog: true }));
    collar.rotation.x = Math.PI / 2; collar.position.y = y; core.add(collar);
  }

  // ---- water aquifer ----
  const waterMat = new THREE.MeshBasicMaterial({ color: 0x2f9ccb, transparent: true, opacity: 0.5, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const water = new THREE.Mesh(new THREE.CircleGeometry(6.2, 64), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = -53.5; core.add(water);
  const waterGlow = new THREE.Mesh(new THREE.CircleGeometry(9, 48),
    new THREE.MeshBasicMaterial({ color: 0x1a6fa8, transparent: true, opacity: 0.32, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  waterGlow.rotation.x = -Math.PI / 2; waterGlow.position.y = -54.2; core.add(waterGlow);

  // ---- particles: drifting motes ----
  function makePoints(count, yA, yB, rMin, rMax, colorTop, colorBot, size){
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const cT = new THREE.Color(colorTop), cB = new THREE.Color(colorBot), c = new THREE.Color();
    for (let i = 0; i < count; i++){
      const ang = Math.random() * Math.PI * 2;
      const rad = rMin + Math.random() * (rMax - rMin);
      const y = yA + Math.random() * (yB - yA);
      pos[i*3] = Math.cos(ang) * rad; pos[i*3+1] = y; pos[i*3+2] = Math.sin(ang) * rad;
      const t = (yA - y) / (yA - yB);
      c.copy(cT).lerp(cB, Math.min(1, Math.max(0, t)));
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    return new THREE.Points(g, m);
  }
  const moteCount = isMobile ? 500 : 1300;
  const motes = makePoints(moteCount, 6, -54, 1.4, 6.0, 0xe3c890, 0x5fc4e8, 0.07);
  core.add(motes);
  const bubbles = makePoints(isMobile ? 160 : 360, -54, -40, 0.6, 5.5, 0x9fe0f5, 0x5fc4e8, 0.09);
  core.add(bubbles);

  // ---- interaction state ----
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  window.addEventListener('pointermove', (e) => {
    tmx = (e.clientX / window.innerWidth - 0.5);
    tmy = (e.clientY / window.innerHeight - 0.5);
  }, { passive: true });

  function resize(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  const lerp = (a, b, t) => a + (b - a) * t;
  let curP = 0;
  const mpos = motes.geometry.attributes.position.array;
  const bpos = bubbles.geometry.attributes.position.array;

  let raf = 0, last = performance.now();
  function frame(now){
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;

    const targetP = window.__scrollP || 0;
    curP = lerp(curP, targetP, reduce ? 1 : 0.07);
    mx = lerp(mx, tmx, 0.05); my = lerp(my, tmy, 0.05);

    const camY = lerp(5, -48, curP);
    camera.position.set(mx * 3.2, camY, 4.6 + my * 1.2);
    camera.lookAt(mx * 1.5, camY - 9, -2);
    camLight.position.set(0, camY + 1, 3);

    if (!reduce){
      // motes drift up & wrap
      for (let i = 0; i < moteCount; i++){
        let y = mpos[i*3+1] + dt * 0.35;
        if (y > 6) y = -54;
        mpos[i*3+1] = y;
      }
      motes.geometry.attributes.position.needsUpdate = true;
      // bubbles rise faster
      const bc = bpos.length / 3;
      for (let i = 0; i < bc; i++){
        let y = bpos[i*3+1] + dt * 1.4;
        if (y > -40) y = -55;
        bpos[i*3+1] = y;
      }
      bubbles.geometry.attributes.position.needsUpdate = true;
      // water shimmer
      const s = 0.45 + Math.sin(now * 0.0016) * 0.12;
      waterMat.opacity = s; waterLight.intensity = 2.0 + Math.sin(now * 0.0016) * 0.5;
      screen.material.emissiveIntensity = 0.7 + Math.sin(now * 0.004) * 0.3;
    }
    renderer.render(scene, camera);
  }

  // pause when hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden){ cancelAnimationFrame(raf); }
    else { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  // render one frame, then reveal
  renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);
  return true;
}

/* ---------------- boot ---------------- */
function hideLoader(){
  const l = $('#loader');
  if (l) setTimeout(() => l.classList.add('done'), 500);
}
initUI();
let ok = false;
try { ok = initScene(); } catch(e){ console.warn('3D scene failed, using fallback', e); ok = false; }
if (!ok) document.body.classList.add('no3d');
// reveal page once first paint is ready (or immediately on failure)
if (document.readyState === 'complete') hideLoader();
else window.addEventListener('load', hideLoader);
setTimeout(hideLoader, 2500); // safety
