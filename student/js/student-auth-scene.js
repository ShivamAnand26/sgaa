/**
 * SGA.IN Student Portal - 3D Architectural Study Books Scene (Three.js)
 * Procedural 3D stack of architectural textbooks and open floor-plan sketchbook
 * with copper wireframe edge highlights, soft studio lighting, and pointer parallax.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function initStudentAuthScene() {
  const container = document.getElementById('auth-scene-container');
  const canvas = document.getElementById('auth-canvas');
  const fallback = document.getElementById('auth-fallback-visual');

  if (!canvas || !container) return;

  // WebGL availability check
  let isWebGLAvailable = false;
  try {
    const testCanvas = document.createElement('canvas');
    isWebGLAvailable = !!(window.WebGLRenderingContext && (testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl')));
  } catch {
    isWebGLAvailable = false;
  }

  if (!isWebGLAvailable) {
    if (fallback) fallback.style.display = 'block';
    if (canvas) canvas.style.display = 'none';
    return;
  }

  let renderer, scene, camera, animationFrameId;
  let bookGroup;
  let targetRotationX = 0.2;
  let targetRotationY = -0.4;
  let isVisible = true;

  try {
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 450;

    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 4.6);

    // Architectural Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xD9B77E, 1.8);
    dirLight1.position.set(4, 5, 4);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xC47A3B, 1.0);
    dirLight2.position.set(-3, 2, -2);
    scene.add(dirLight2);

    // Book Group
    bookGroup = new THREE.Group();

    // Material palette matching SGA.IN tokens
    const ivoryMat = new THREE.MeshStandardMaterial({
      color: 0xFAF8F5,
      roughness: 0.35,
      metalness: 0.05
    });

    const creamMat = new THREE.MeshStandardMaterial({
      color: 0xEFE9E1,
      roughness: 0.4,
      metalness: 0.05
    });

    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xC47A3B,
      roughness: 0.3,
      metalness: 0.2
    });

    const pageMat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.8
    });

    const edgeLineMat = new THREE.LineBasicMaterial({
      color: 0xC47A3B,
      transparent: true,
      opacity: 0.65
    });

    const goldLineMat = new THREE.LineBasicMaterial({
      color: 0xD9B77E,
      transparent: true,
      opacity: 0.85
    });

    // Helper: Create a stylized book
    function createBook(width, depth, height, coverMat, yOffset, rotationY) {
      const bGroup = new THREE.Group();

      // Pages block (inner)
      const pageGeo = new THREE.BoxGeometry(width - 0.06, height - 0.04, depth - 0.06);
      const pageMesh = new THREE.Mesh(pageGeo, pageMat);
      bGroup.add(pageMesh);

      // Book cover (outer)
      const coverGeo = new THREE.BoxGeometry(width, height, depth);
      const coverMesh = new THREE.Mesh(coverGeo, coverMat);
      bGroup.add(coverMesh);

      // Wireframe edge accent
      const edges = new THREE.EdgesGeometry(coverGeo);
      const edgeLine = new THREE.LineSegments(edges, edgeLineMat);
      bGroup.add(edgeLine);

      bGroup.position.y = yOffset;
      bGroup.rotation.y = rotationY;
      return bGroup;
    }

    // 1. Bottom Book (Large architectural monograph)
    const book1 = createBook(1.9, 2.4, 0.28, ivoryMat, -0.45, 0.12);
    bookGroup.add(book1);

    // 2. Middle Book (Structure & construction notes)
    const book2 = createBook(1.75, 2.2, 0.24, creamMat, -0.18, -0.18);
    bookGroup.add(book2);

    // 3. Top Open Drafting Sketchbook with floor plan markings
    const openBookGroup = new THREE.Group();
    openBookGroup.position.set(0, 0.12, 0);
    openBookGroup.rotation.y = 0.08;

    // Left page
    const leftPageGeo = new THREE.BoxGeometry(0.9, 0.06, 2.0);
    const leftPage = new THREE.Mesh(leftPageGeo, ivoryMat);
    leftPage.position.set(-0.46, 0, 0);
    leftPage.rotation.z = 0.06;
    openBookGroup.add(leftPage);
    openBookGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(leftPageGeo), goldLineMat));

    // Right page
    const rightPageGeo = new THREE.BoxGeometry(0.9, 0.06, 2.0);
    const rightPage = new THREE.Mesh(rightPageGeo, ivoryMat);
    rightPage.position.set(0.46, 0, 0);
    rightPage.rotation.z = -0.06;
    openBookGroup.add(rightPage);
    openBookGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(rightPageGeo), goldLineMat));

    // Spine
    const spineGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.0, 8);
    const spine = new THREE.Mesh(spineGeo, copperMat);
    spine.rotation.x = Math.PI / 2;
    openBookGroup.add(spine);

    // Miniature architectural drafting lines on open page
    const gridHelper = new THREE.GridHelper(1.4, 12, 0xC47A3B, 0xEFE9E1);
    gridHelper.position.set(0, 0.04, 0);
    gridHelper.rotation.x = 0;
    openBookGroup.add(gridHelper);

    bookGroup.add(openBookGroup);

    // Architectural compass / divider tool resting on top
    const toolGroup = new THREE.Group();
    const legGeo = new THREE.CylinderGeometry(0.015, 0.005, 1.1, 6);
    const leg1 = new THREE.Mesh(legGeo, copperMat);
    leg1.rotation.z = 0.35;
    leg1.position.set(-0.16, 0.28, 0.1);
    const leg2 = new THREE.Mesh(legGeo, copperMat);
    leg2.rotation.z = -0.35;
    leg2.position.set(0.16, 0.28, 0.1);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), copperMat);
    joint.position.set(0, 0.76, 0.1);
    toolGroup.add(leg1);
    toolGroup.add(leg2);
    toolGroup.add(joint);
    toolGroup.rotation.x = Math.PI / 2.3;
    toolGroup.rotation.z = 0.4;
    toolGroup.position.set(0.15, -0.05, 0.25);
    bookGroup.add(toolGroup);

    scene.add(bookGroup);

    // Initial position
    bookGroup.rotation.x = targetRotationX;
    bookGroup.rotation.y = targetRotationY;

    // Pointer parallax
    window.addEventListener('pointermove', (e) => {
      const mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      const mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
      targetRotationY = -0.4 + mouseX * 0.35;
      targetRotationX = 0.25 - mouseY * 0.25;
    }, { passive: true });

    // Handle resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    window.addEventListener('resize', handleResize);

    // Pause on tab hide
    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden;
    });

    // Animation Loop
    let clock = new THREE.Clock();

    function animate() {
      animationFrameId = requestAnimationFrame(animate);

      if (!isVisible) return;

      const delta = clock.getDelta();

      // Gentle continuous ambient drift
      targetRotationY += 0.08 * delta;

      // Smooth lerp to target
      bookGroup.rotation.x += (targetRotationX - bookGroup.rotation.x) * 0.05;
      bookGroup.rotation.y += (targetRotationY - bookGroup.rotation.y) * 0.05;

      // Subtle breathing float
      bookGroup.position.y = Math.sin(clock.getElapsedTime() * 1.2) * 0.04;

      renderer.render(scene, camera);
    }

    animate();

  } catch (err) {
    console.warn('Three.js student scene failed to initialize:', err);
    if (fallback) fallback.style.display = 'block';
    if (canvas) canvas.style.display = 'none';
  }
}
