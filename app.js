import * as THREE from 'three';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.innerWidth < 760;
const $ = (s) => document.querySelector(s);

function hideLoader(){
  const l = $('#loader');
  if (l && !l.classList.contains('done')) setTimeout(() => l.classList.add('done'), 350);
}

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

  if ('IntersectionObserver' in window && !reduce){
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

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

  const burger = $('#burger'), mpanel = $('#mpanel');
  function close(){ mpanel.classList.remove('open'); burger.setAttribute('aria-expanded','false'); document.body.style.overflow=''; }
  burger.addEventListener('click', () => {
    const open = mpanel.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  });
  mpanel.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

/* ---------------- WebGL descent scene (high quality) ---------------- */
async function initScene(){
  const canvas = $('#scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch(e){ return false; }
  if (!renderer || !renderer.getContext()) return false;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const ABYSS = 0x06141d;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ABYSS);
  scene.fog = new THREE.FogExp2(ABYSS, 0.026);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 260);

  // ---- post-processing + environment (loaded defensively) ----
  let composer = null, bloomPass = null;
  try {
    const [EC, RP, UB, OP, RE] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/environments/RoomEnvironment.js')
    ]);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RE.RoomEnvironment(), 0.025).texture;
    if (!isMobile){
      composer = new EC.EffectComposer(renderer);
      composer.addPass(new RP.RenderPass(scene, camera));
      bloomPass = new UB.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.65, 0.8);
      composer.addPass(bloomPass);
      composer.addPass(new OP.OutputPass());
    }
  } catch(e){ console.warn('postprocessing/env unavailable, basic render', e); }

  // lights
  scene.add(new THREE.AmbientLight(0x44627a, 0.55));
  const key = new THREE.DirectionalLight(0xffe7c4, 1.25); key.position.set(7, 22, 9); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4aafe0, 0.5); rim.position.set(-8, -6, -6); scene.add(rim);
  const waterLight = new THREE.PointLight(0x5fc4e8, 3.0, 70, 1.6); waterLight.position.set(0, -54, 0); scene.add(waterLight);
  const camLight = new THREE.PointLight(0xbfe6f5, 0.7, 30, 2); scene.add(camLight);

  const core = new THREE.Group(); scene.add(core);

  // ---- strata shaft (banded rock walls) ----
  const stops = [0xc99a59,0xbf9150,0xa97c45,0x8f6f44,0x6f6450,0x556069,0x42596a,0x33566c,0x295672,0x255a74];
  function bandColor(t){
    const f = t * (stops.length - 1); const i = Math.floor(f); const k = f - i;
    const a = new THREE.Color(stops[Math.min(i, stops.length-1)]);
    const b = new THREE.Color(stops[Math.min(i+1, stops.length-1)]);
    return a.lerp(b, k);
  }
  const TOP = 6, BOTTOM = -54, N = 24, BH = (TOP - BOTTOM) / N;
  for (let i = 0; i < N; i++){
    const t = i / (N - 1);
    const yc = TOP - i * BH - BH/2;
    const r = 6.4 + Math.sin(i * 1.7) * 0.55;
    const col = bandColor(t);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r + 0.28, BH * 0.97, 120, 1, true),
      new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.12), roughness: 0.96, metalness: 0.04, envMapIntensity: 0.45, side: THREE.BackSide, fog: true })
    );
    band.position.y = yc; core.add(band);
    if (i > 0){
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.05, 0.035, 8, 110),
        new THREE.MeshStandardMaterial({ color: 0x0a1a24, roughness: 0.6, metalness: 0.3, envMapIntensity: 0.4, fog: true })
      );
      ring.rotation.x = Math.PI / 2; ring.position.y = yc + BH/2; core.add(ring);
    }
  }

  // ---- borehole casing (drill string) ----
  const casing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 56, 72, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xb4c6d2, metalness: 1.0, roughness: 0.24, envMapIntensity: 1.4, fog: true })
  );
  casing.position.y = -25; core.add(casing);
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 56, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x132c39, metalness: 0.7, roughness: 0.45, envMapIntensity: 0.8, side: THREE.BackSide, fog: true })
  );
  inner.position.y = -25; core.add(inner);
  const screen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 7, 72, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2f9ccb, emissive: 0x4fb6e6, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.92, side: THREE.DoubleSide, fog: true })
  );
  screen.position.y = -47; core.add(screen);
  for (let y = 2; y > -50; y -= 5){
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.96, 0.13, 12, 44),
      new THREE.MeshStandardMaterial({ color: 0x8aa3b2, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.5, fog: true })
    );
    collar.rotation.x = Math.PI / 2; collar.position.y = y; core.add(collar);
  }

  // ---- water aquifer ----
  const waterMat = new THREE.MeshBasicMaterial({ color: 0x37a8db, transparent: true, opacity: 0.5, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const water = new THREE.Mesh(new THREE.CircleGeometry(6.2, 96), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = -53.5; core.add(water);
  const waterGlow = new THREE.Mesh(new THREE.CircleGeometry(9.5, 64),
    new THREE.MeshBasicMaterial({ color: 0x1f7fbf, transparent: true, opacity: 0.34, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  waterGlow.rotation.x = -Math.PI / 2; waterGlow.position.y = -54.2; core.add(waterGlow);

  // ---- particles ----
  function makePoints(count, yA, yB, rMin, rMax, cTop, cBot, size){
    const pos = new Float32Array(count*3), col = new Float32Array(count*3);
    const cT = new THREE.Color(cTop), cB = new THREE.Color(cBot), c = new THREE.Color();
    for (let i=0;i<count;i++){
      const ang = Math.random()*Math.PI*2, rad = rMin + Math.random()*(rMax-rMin), y = yA + Math.random()*(yB-yA);
      pos[i*3]=Math.cos(ang)*rad; pos[i*3+1]=y; pos[i*3+2]=Math.sin(ang)*rad;
      const t=(yA-y)/(yA-yB); c.copy(cT).lerp(cB, Math.min(1,Math.max(0,t)));
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    g.setAttribute('color', new THREE.BufferAttribute(col,3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors:true, transparent:true, opacity:0.85, depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true }));
  }
  const moteCount = isMobile ? 600 : 1600;
  const motes = makePoints(moteCount, 6, -54, 1.4, 6.0, 0xe8cf95, 0x7fd4f2, 0.075); core.add(motes);
  const bubbles = makePoints(isMobile ? 200 : 420, -54, -40, 0.6, 5.6, 0xbfeefb, 0x5fc4e8, 0.1); core.add(bubbles);

  // ---- interaction ----
  let mx=0,my=0,tmx=0,tmy=0;
  window.addEventListener('pointermove', (e)=>{ tmx=(e.clientX/window.innerWidth-0.5); tmy=(e.clientY/window.innerHeight-0.5); }, {passive:true});
  function resize(){
    const w=window.innerWidth, h=window.innerHeight;
    camera.aspect=w/h; camera.updateProjectionMatrix();
    renderer.setSize(w,h); if (composer) composer.setSize(w,h); if (bloomPass) bloomPass.setSize(w,h);
  }
  window.addEventListener('resize', resize);

  const lerp=(a,b,t)=>a+(b-a)*t;
  let curP=0;
  const mpos=motes.geometry.attributes.position.array;
  const bpos=bubbles.geometry.attributes.position.array;
  function render(){ if (composer) composer.render(); else renderer.render(scene, camera); }

  // verification hook: force a render at the current scroll position even when the tab is hidden
  window.__draw = function(){
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    curP = p;
    const camY = lerp(5, -48, p);
    camera.position.set(0, camY, 4.6); camera.lookAt(0, camY - 9, -2); camLight.position.set(0, camY + 1, 3);
    render(); return p;
  };

  let raf=0, last=performance.now();
  function frame(now){
    raf=requestAnimationFrame(frame);
    const dt=Math.min(0.05,(now-last)/1000); last=now;
    const targetP=window.__scrollP||0;
    curP=lerp(curP,targetP, reduce?1:0.07);
    mx=lerp(mx,tmx,0.05); my=lerp(my,tmy,0.05);
    const camY=lerp(5,-48,curP);
    camera.position.set(mx*3.2, camY, 4.6 + my*1.2);
    camera.lookAt(mx*1.5, camY-9, -2);
    camLight.position.set(0, camY+1, 3);
    if (!reduce){
      for (let i=0;i<moteCount;i++){ let y=mpos[i*3+1]+dt*0.35; if (y>6) y=-54; mpos[i*3+1]=y; }
      motes.geometry.attributes.position.needsUpdate=true;
      const bc=bpos.length/3;
      for (let i=0;i<bc;i++){ let y=bpos[i*3+1]+dt*1.4; if (y>-40) y=-55; bpos[i*3+1]=y; }
      bubbles.geometry.attributes.position.needsUpdate=true;
      waterMat.opacity=0.46+Math.sin(now*0.0016)*0.12;
      waterLight.intensity=2.6+Math.sin(now*0.0016)*0.6;
      screen.material.emissiveIntensity=1.1+Math.sin(now*0.004)*0.4;
    }
    render();
  }

  document.addEventListener('visibilitychange', ()=>{
    if (document.hidden){ cancelAnimationFrame(raf); }
    else { last=performance.now(); raf=requestAnimationFrame(frame); }
  });

  render();          // first frame
  hideLoader();      // reveal once 3D is ready
  raf=requestAnimationFrame(frame);
  return true;
}

/* ---------------- boot ---------------- */
initUI();
initScene().then(ok => { if (!ok){ document.body.classList.add('no3d'); hideLoader(); } })
           .catch(e => { console.warn('3D failed', e); document.body.classList.add('no3d'); hideLoader(); });
setTimeout(hideLoader, 3000);
