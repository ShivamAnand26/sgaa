/**
 * SGA Admin - Isometric Architectural Wireframe Scene (admin-scene.js)
 * Clean, lightweight Three.js wireframe projection for Admin Auth screens
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function initAdminAuthScene(canvasId = 'auth-three-canvas') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer, scene, camera, group;
  let animationFrameId = null;
  let mouseX = 0, mouseY = 0;
  let targetX = 0, targetY = 0;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();

    // Isometric perspective camera setup
    const aspect = window.innerWidth / window.innerHeight;
    const d = 18;
    camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    group = new THREE.Group();
    scene.add(group);

    // Materials
    const goldLineMat = new THREE.LineBasicMaterial({ color: 0xD9B77E, transparent: true, opacity: 0.65 });
    const copperLineMat = new THREE.LineBasicMaterial({ color: 0xC47A3B, transparent: true, opacity: 0.75 });
    const subtleMat = new THREE.LineBasicMaterial({ color: 0x4A443C, transparent: true, opacity: 0.35 });

    // Grid Floor
    const gridHelper = new THREE.GridHelper(36, 18, 0xC47A3B, 0x2A2420);
    gridHelper.position.y = -4;
    group.add(gridHelper);

    // Architectural modules: Building masses wireframe
    function addWireBox(size, pos, material) {
      const geom = new THREE.BoxGeometry(size[0], size[1], size[2]);
      const edges = new THREE.EdgesGeometry(geom);
      const line = new THREE.LineSegments(edges, material);
      line.position.set(pos[0], pos[1], pos[2]);
      group.add(line);
      return line;
    }

    // Pavilions & Studio Blocks
    addWireBox([8, 5, 12], [0, -1.5, 0], goldLineMat);
    addWireBox([6, 4, 8], [-4, 3, -2], copperLineMat);
    addWireBox([10, 0.4, 14], [0, 1.2, 0], copperLineMat);
    addWireBox([7, 3.5, 7], [4, 2.8, 2], goldLineMat);
    addWireBox([12, 0.3, 10], [1, 5, 0], subtleMat);

    // Columns
    for (let i = -5; i <= 5; i += 2.5) {
      const colGeom = new THREE.CylinderGeometry(0.12, 0.12, 6, 8);
      const colEdges = new THREE.EdgesGeometry(colGeom);
      const colLine = new THREE.LineSegments(colEdges, subtleMat);
      colLine.position.set(i, -1, 6.5);
      group.add(colLine);
    }

    // Mouse listener
    window.addEventListener('pointermove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    // Resize listener
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const newAspect = w / h;
      camera.left = -d * newAspect;
      camera.right = d * newAspect;
      camera.top = d;
      camera.bottom = -d;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    // Render loop
    const render = () => {
      if (reducedMotion) {
        renderer.render(scene, camera);
        return;
      }
      animationFrameId = requestAnimationFrame(render);
      targetX += (mouseX * 0.15 - targetX) * 0.05;
      targetY += (mouseY * 0.15 - targetY) * 0.05;

      group.rotation.y += 0.0018;
      group.rotation.x = targetY * 0.2;
      group.position.x = targetX * 1.5;

      renderer.render(scene, camera);
    };

    render();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
  } catch (e) {
    console.warn('Three.js scene init skipped:', e);
  }
}
