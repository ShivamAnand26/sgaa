/**
 * SGA Client Portal - 3D Auth Scene (auth-scene.js)
 * Minimal procedural architectural geometry with copper edge lines and warm lighting.
 * Pauses rendering when hidden, caps DPR at 2, falls back gracefully if WebGL fails.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function initAuthScene(canvasId = 'auth-canvas') {
  const canvas = document.getElementById(canvasId);
  const container = canvas ? canvas.parentElement : null;
  const fallback = document.getElementById('auth-fallback-visual');

  if (!canvas || !container) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer, scene, camera, group, animFrameId = null;
  let isVisible = true;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: window.innerWidth > 600,
      powerPreference: 'low-power'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      32,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(8.5, 6.2, 9.5);
    camera.lookAt(0, 1.2, 0);

    // Warm ambient and architectural directional light
    const hemiLight = new THREE.HemisphereLight(0xfff9f2, 0x9b9388, 2.2);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffe8cf, 2.5);
    dirLight.position.set(5, 8, 6);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
    fillLight.position.set(-6, 4, -4);
    scene.add(fillLight);

    // Procedural House Geometry
    group = new THREE.Group();

    const materials = {
      plinth: new THREE.MeshStandardMaterial({ color: 0xded7cb, roughness: 0.85 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.8 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.75 }),
      wood: new THREE.MeshStandardMaterial({ color: 0xa87d54, roughness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xdde7e7, roughness: 0.2, transparent: true, opacity: 0.85 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xc47a3b, roughness: 0.35, metalness: 0.4 })
    };

    const copperEdgeMat = new THREE.LineBasicMaterial({
      color: 0xc47a3b,
      transparent: true,
      opacity: 0.65
    });

    function addArchitecturalBlock(size, pos, mat, withEdges = true) {
      const geo = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      group.add(mesh);

      if (withEdges) {
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, copperEdgeMat);
        line.position.copy(mesh.position);
        group.add(line);
      }
      return mesh;
    }

    // Foundation plinth
    addArchitecturalBlock([6.5, 0.2, 5.0], [0, 0.1, 0], materials.plinth);
    addArchitecturalBlock([2.2, 0.1, 0.8], [0, 0.15, 2.8], materials.plinth);

    // Ground floor volumes
    addArchitecturalBlock([2.8, 1.8, 3.2], [-1.2, 1.05, 0.2], materials.wall);
    addArchitecturalBlock([2.2, 1.8, 2.6], [1.4, 1.05, -0.1], materials.wall);

    // Timber accent portal
    addArchitecturalBlock([0.15, 1.6, 1.4], [-0.4, 0.95, 1.82], materials.wood);
    addArchitecturalBlock([1.6, 1.5, 0.05], [0.6, 1.0, 1.82], materials.glass);

    // Copper columns on veranda
    for (let i = 0; i < 4; i++) {
      addArchitecturalBlock([0.05, 1.8, 0.05], [0.1 + i * 0.6, 1.05, 2.5], materials.copper, false);
    }

    // First floor cantilevered volume
    addArchitecturalBlock([3.4, 1.6, 2.8], [0.4, 2.75, 0.3], materials.wall);
    addArchitecturalBlock([1.8, 1.1, 0.05], [0.5, 2.7, 1.72], materials.glass);
    addArchitecturalBlock([0.1, 1.3, 1.4], [-1.15, 2.7, 0.6], materials.wood);

    // Overhanging thin flat roof slab
    addArchitecturalBlock([5.8, 0.16, 4.2], [0.1, 3.65, 0.4], materials.roof);

    // Ground groundline circle
    const ringGeo = new THREE.RingGeometry(3.8, 3.82, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd9b77e, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    group.add(ring);

    group.rotation.y = -0.45;
    scene.add(group);

    // Subtle pointer interactivity
    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    container.addEventListener('pointermove', (e) => {
      const rect = container.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.4;
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.25;
    }, { passive: true });

    container.addEventListener('pointerleave', () => {
      targetX = 0;
      targetY = 0;
    }, { passive: true });

    // Resize handler
    const onResize = () => {
      if (!renderer || !camera || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.render(scene, camera);
    };

    window.addEventListener('resize', onResize);

    // Render loop
    const animate = () => {
      if (!isVisible || reducedMotion) return;
      animFrameId = requestAnimationFrame(animate);

      currentX += (targetX - currentX) * 0.04;
      currentY += (targetY - currentY) * 0.04;

      group.rotation.y = -0.45 + currentX + Math.sin(performance.now() * 0.0004) * 0.05;
      group.rotation.x = currentY;

      renderer.render(scene, camera);
    };

    // Pause rendering when tab is hidden
    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden;
      if (isVisible && !reducedMotion) {
        cancelAnimationFrame(animFrameId);
        animate();
      } else {
        cancelAnimationFrame(animFrameId);
      }
    });

    renderer.render(scene, camera);
    if (!reducedMotion) {
      animate();
    }
  } catch (err) {
    console.warn('WebGL initialization failed. Using static architectural fallback visual.', err);
    if (canvas) canvas.style.display = 'none';
    if (fallback) fallback.style.display = 'block';
  }
}
