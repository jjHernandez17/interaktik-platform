// Impresora de fotos en 3D (Three.js), en primera persona: una oficina, una impresora de cama plana (tipo plotter) sobre el escritorio
// y solo se ven las manos del personaje. El personaje no se mueve: se mueve la camara (su cabeza). El streamer la gira arrastrando con el mouse; si no la
// toca, la camara sigue sola la impresion y, cuando no hay nada que imprimir, mira alrededor de la oficina.
//
// Un cabezal metalico corre por una barra horizontal (sostenida por dos rieles plateados) e imprime sobre una cinta de papel infinita
// que avanza hacia el espectador y se curva sobre el borde frontal de la bandeja. La textura de la hoja es un canvas "rodante": cada
// foto se compone aparte (papel, foto, nombre, regalo) y se va mostrando renglon a renglon justo bajo el cabezal.
//
//   const engine = window.PhotoPrinter3D.create(contenedor);   // null si el navegador no puede con WebGL
//   engine.setTheme({ paper, shape, showName, showGift });
//   await engine.print({ nickname, giftName, count }, imagenDeLaFoto, imagenDelRegalo, milisegundos);
//
// Unidades del mundo: 1 unidad = 5 cm. El escritorio tiene su tapa en y = 0; la camara es la cabeza del personaje sentado.
(function () {
  const THREE = window.THREE;
  const Looks = window.PhotoPrinterLooks; // el dibujo de cada foto (marcos, colores, sellos...) vive en photo-printer-looks.js
  if (!THREE || !Looks) {
    window.PhotoPrinter3D = null;
    return;
  }

  const THEMES = {
    white: { paper: '#fbfbf8', ink: '#1d2230' },
    cream: { paper: '#f6ecd2', ink: '#3a2e18' },
    kraft: { paper: '#d7b58a', ink: '#3b2713' },
    pink: { paper: '#ffd3e4', ink: '#5b1a39' },
    mint: { paper: '#cdf3dd', ink: '#13452c' },
    blue: { paper: '#cfe6ff', ink: '#123a63' },
  };

  // la impresora: una bandeja crema (cama) con la hoja encima, una carcasa negra atras y dos rieles laterales
  const BED_W = 12.6;
  const BED_FRONT_Z = 5.4;
  const DESK_FRONT_Z = 10; // el papel corre sobre el escritorio y cae por su borde
  const BED_REAR_Z = -7.2;
  const BASE_H = 0.09; // sin base: la hoja va sobre el tapete del escritorio. Lo de arriba (carcasa, rieles, cabezal) esta modelado para 2.2 y se baja con `upper`
  const PAPER_W = 9;
  const CANVAS_W = 512;
  const PAPER_PX = CANVAS_W / PAPER_W; // pixeles de la textura por unidad del mundo
  const PAPER_Z0 = -6.2; // donde empieza la hoja (escondida bajo la carcasa trasera)
  const GANTRY_Z = -3.3; // donde esta la barra del cabezal: ahi se imprime
  const ARC_R = 0.9; // curva de la hoja al caer por el borde frontal
  const HANG = 4.2; // largo de hoja que cuelga por delante
  const PAPER_ZF = DESK_FRONT_Z + 0.05;
  const PAPER_FLAT = PAPER_ZF - ARC_R - PAPER_Z0;
  const PAPER_L = PAPER_FLAT + (Math.PI * ARC_R) / 2 + HANG;
  const CANVAS_H = Math.round(PAPER_L * PAPER_PX);
  const HEAD_Y_PX = Math.round((GANTRY_Z - PAPER_Z0) * PAPER_PX); // fila de la textura que esta bajo el cabezal
  const HOLE_STEP = 34; // separacion de los agujeros del papel continuo (pixeles del canvas)
  const LINE_FEED_PX = 5; // la hoja avanza "renglon a renglon"
  const GRAY_FILTER = 'grayscale(0.9) contrast(1.2) brightness(1.1)';
  const DRY_SECONDS = 1.1;
  const MAX_BLOCKS = 10;
  const FONT = '"Poppins", "Segoe UI", system-ui, -apple-system, sans-serif';

  const DESK_Y = 0;
  const FLOOR_Y = -15;
  const CEILING_Y = 34;
  const ROOM_X = 34;
  const ROOM_BACK_Z = -26;
  const ROOM_FRONT_Z = 24;
  const EYE = new THREE.Vector3(0, 11.6, 11.8); // la cabeza del personaje, de pie junto al escritorio (se echa hacia atras en pantallas angostas)

  // ---------------------------------------------------------------- utilidades de dibujo (canvas 2D)

  function roundRectPath(g, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + radius, y);
    g.arcTo(x + w, y, x + w, y + h, radius);
    g.arcTo(x + w, y + h, x, y + h, radius);
    g.arcTo(x, y + h, x, y, radius);
    g.arcTo(x, y, x + w, y, radius);
    g.closePath();
  }

  // recorta la imagen para que llene el cuadro (como object-fit: cover)
  function drawCover(g, img, x, y, w, h) {
    const sw = img.naturalWidth || img.width || 1;
    const sh = img.naturalHeight || img.height || 1;
    const side = Math.min(sw, sh);
    g.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, x, y, w, h);
  }

  function fitText(g, text, maxWidth) {
    if (g.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && g.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  function wrapLines(g, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && g.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6d2b79f5) >>> 0;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canvasTexture(canvas, anisotropy) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (anisotropy) texture.anisotropy = anisotropy;
    return texture;
  }

  function clamp255(value) {
    return Math.max(0, Math.min(255, value));
  }

  // ruido de color suave (manchas grandes de `cell` px + grano fino): alfombra, pared, plastico, tela, piel
  function noiseCanvas(size, seed, rgb, spread, cell = 1, fine = 0.35) {
    const random = seededRandom(seed);
    const n = Math.max(2, Math.round(size / cell));
    const small = document.createElement('canvas');
    small.width = n;
    small.height = n;
    const sg = small.getContext('2d');
    const data = sg.createImageData(n, n);
    for (let i = 0; i < n * n; i += 1) {
      const d = (random() - 0.5) * 2 * spread;
      data.data[i * 4] = clamp255(rgb[0] + d);
      data.data[i * 4 + 1] = clamp255(rgb[1] + d);
      data.data[i * 4 + 2] = clamp255(rgb[2] + d);
      data.data[i * 4 + 3] = 255;
    }
    sg.putImageData(data, 0, 0);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 0, 0, size, size);
    if (fine > 0 && cell > 1) {
      const grain = document.createElement('canvas');
      grain.width = size;
      grain.height = size;
      const gg = grain.getContext('2d');
      const grainData = gg.createImageData(size, size);
      for (let i = 0; i < size * size; i += 1) {
        const v = random() * 255;
        grainData.data[i * 4] = v;
        grainData.data[i * 4 + 1] = v;
        grainData.data[i * 4 + 2] = v;
        grainData.data[i * 4 + 3] = 255;
      }
      gg.putImageData(grainData, 0, 0);
      g.globalAlpha = fine * (spread / 60);
      g.globalCompositeOperation = 'overlay';
      g.drawImage(grain, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    return c;
  }

  // madera con vetas y nudos (tapa del escritorio)
  function woodCanvas(w, h, seed) {
    const random = seededRandom(seed);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#8c6040';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i += 1) {
      g.fillStyle = random() < 0.5 ? 'rgba(60,35,18,0.10)' : 'rgba(200,150,98,0.10)';
      g.fillRect(0, random() * h, w, 16 + random() * 70);
    }
    for (let i = 0; i < 520; i += 1) {
      const y = random() * h;
      const amp = 2 + random() * 7;
      const freq = 0.0035 + random() * 0.01;
      const phase = random() * 6.28;
      g.strokeStyle = random() < 0.7 ? `rgba(52,30,15,${0.08 + random() * 0.2})` : `rgba(206,156,106,${0.06 + random() * 0.12})`;
      g.lineWidth = 0.6 + random() * 1.9;
      g.beginPath();
      for (let x = 0; x <= w; x += 14) {
        const yy = y + Math.sin(x * freq + phase) * amp;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    for (let k = 0; k < 3; k += 1) {
      const kx = w * (0.15 + random() * 0.7);
      const ky = h * (0.2 + random() * 0.6);
      for (let ring = 7; ring >= 1; ring -= 1) {
        g.strokeStyle = `rgba(45,25,12,${0.12 + (7 - ring) * 0.025})`;
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(kx, ky, ring * 9, ring * 4.2, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    return c;
  }

  // mancha de sombra suave (para "apoyar" los objetos en el escritorio)
  function blobCanvas() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.38)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  function repeatTexture(canvas, rx, ry, anisotropy, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (anisotropy) t.anisotropy = anisotropy;
    return t;
  }

  // ---------------------------------------------------------------- geometria

  // caja con esquinas redondeadas (un rectangulo redondeado extruido con un pequeno bisel)
  function roundedBox(width, height, depth, radius, bevel) {
    const w = width - bevel * 2;
    const h = height - bevel * 2;
    const r = Math.max(0.001, Math.min(radius - bevel, w / 2, h / 2));
    const x = -w / 2;
    const y = -h / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 10,
    });
    geometry.translate(0, 0, -(depth - bevel * 2) / 2);
    return geometry;
  }

  function create(container) {
    // ---------------------------------------------------------------- renderer
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (error) {
      return null;
    }
    const coarse = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const SHADOW_SIZE = coarse ? 1024 : 2048;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvasEl = renderer.domElement;
    canvasEl.className = 'pp-canvas';
    container.appendChild(canvasEl);
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e1b);
    scene.fog = new THREE.Fog(0x0b0e1b, 55, 120);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 150);
    camera.rotation.order = 'YXZ';

    // ---------------------------------------------------------------- materiales y ayudas
    const mats = {};
    function mat(name, color, roughness = 0.7, metalness = 0, extra = {}) {
      if (!mats[name]) {
        const { physical, ...options } = extra;
        const Material = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
        mats[name] = new Material({ color, roughness, metalness, ...options });
      }
      return mats[name];
    }

    function box(w, h, d, material, x, y, z, parent = scene, shadows = true) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    function cylinder(rTop, rBottom, h, material, x, y, z, parent = scene, segments = 24) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    // cilindro entre dos puntos (brazos de la lampara...)
    function limb(a, b, radius, material, parent = scene) {
      const dir = new THREE.Vector3().subVectors(b, a);
      const length = dir.length();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), material);
      mesh.position.copy(a).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    }

    // sombra de contacto: una mancha oscura y suave bajo un objeto
    const blobTexture = new THREE.CanvasTexture(blobCanvas());
    const blobMaterial = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false });
    function blob(x, z, w, d, opacity = 1, y = 0.012, parent = scene) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), blobMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.material = opacity === 1 ? blobMaterial : blobMaterial.clone();
      if (opacity !== 1) mesh.material.opacity = blobMaterial.opacity * opacity;
      mesh.renderOrder = 1;
      parent.add(mesh);
      return mesh;
    }

    // texturas procedurales de la oficina
    const carpetCanvas = noiseCanvas(256, 11, [48, 56, 84], 30, 3);
    const carpetMap = repeatTexture(carpetCanvas, 16, 7, maxAnisotropy, true);
    const carpetBump = repeatTexture(carpetCanvas, 16, 7, maxAnisotropy, false);
    const plasterBump = repeatTexture(noiseCanvas(256, 23, [128, 128, 128], 46, 4), 8, 4, maxAnisotropy, false);
    const woodSource = woodCanvas(2048, 800, 7);
    const woodMap = repeatTexture(woodSource, 1, 1, maxAnisotropy, true);
    const woodBump = repeatTexture(woodSource, 1, 1, maxAnisotropy, false);
    const grainBump = repeatTexture(noiseCanvas(128, 31, [128, 128, 128], 60, 1), 1.4, 1.4, maxAnisotropy, false);
    const fabricCanvas = (() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 64, 64);
      g.strokeStyle = '#4a4a4a';
      g.lineWidth = 2;
      for (let i = 0; i < 64; i += 4) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 64);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i + 2);
        g.lineTo(64, i + 2);
        g.stroke();
      }
      return c;
    })();
    const fabricBump = repeatTexture(fabricCanvas, 5, 5, maxAnisotropy, false);

    // ---------------------------------------------------------------- la oficina
    const office = new THREE.Group();
    scene.add(office);
    const midZ = (ROOM_FRONT_Z + ROOM_BACK_Z) / 2;
    const roomH = CEILING_Y - FLOOR_Y;
    const roomMidY = (CEILING_Y + FLOOR_Y) / 2;

    // piso (alfombra), paredes y techo
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X * 2, ROOM_FRONT_Z - ROOM_BACK_Z), mat('carpet', 0xffffff, 0.98, 0, { map: carpetMap, bumpMap: carpetBump, bumpScale: 1.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR_Y, midZ);
    floor.receiveShadow = true;
    office.add(floor);
    box(ROOM_X * 2, roomH, 0.6, mat('wall', 0xd8d2c8, 0.9, 0, { bumpMap: plasterBump, bumpScale: 0.7 }), 0, roomMidY, ROOM_BACK_Z, office, false);
    box(0.6, roomH, ROOM_FRONT_Z - ROOM_BACK_Z, mat('wallSide', 0xc9c3ba, 0.9, 0, { bumpMap: plasterBump, bumpScale: 0.7 }), -ROOM_X, roomMidY, midZ, office, false);
    box(0.6, roomH, ROOM_FRONT_Z - ROOM_BACK_Z, mat('wallSide'), ROOM_X, roomMidY, midZ, office, false);
    box(ROOM_X * 2, 0.6, ROOM_FRONT_Z - ROOM_BACK_Z, mat('ceiling', 0xe9e5de, 0.95), 0, CEILING_Y, midZ, office, false);
    // zocalos
    box(ROOM_X * 2, 1.4, 0.5, mat('skirt', 0x6b5d4d, 0.8), 0, FLOOR_Y + 0.7, ROOM_BACK_Z + 0.4, office, false);
    box(0.5, 1.4, ROOM_FRONT_Z - ROOM_BACK_Z, mat('skirt'), -ROOM_X + 0.4, FLOOR_Y + 0.7, midZ, office, false);
    box(0.5, 1.4, ROOM_FRONT_Z - ROOM_BACK_Z, mat('skirt'), ROOM_X - 0.4, FLOOR_Y + 0.7, midZ, office, false);

    // alfombra bajo el escritorio
    box(34, 0.08, 20, mat('rug', 0x6a3b4f, 0.97), 0, FLOOR_Y + 0.05, 2, office, false);

    // estante con libros (pared del fondo, a la izquierda)
    const rnd = seededRandom(99);
    const bookColors = [0xd9534f, 0x3b82c4, 0x4aa36b, 0xe8b53a, 0x8a5fc8, 0xf08a4b, 0x2f3b5c, 0xc9d3e0];
    for (const shelfY of [7, 14, 21]) {
      box(20, 0.7, 4.4, mat('shelf', 0x7a5638, 0.7), -18, shelfY, ROOM_BACK_Z + 2.6, office);
      let x = -27;
      while (x < -9) {
        const w = 0.7 + rnd() * 0.9;
        const h = 3 + rnd() * 2.4;
        const colorIndex = Math.floor(rnd() * bookColors.length);
        box(w, h, 3.2, mat(`book${colorIndex}`, bookColors[colorIndex], 0.8), x + w / 2, shelfY + 0.35 + h / 2, ROOM_BACK_Z + 2.6, office);
        x += w + 0.08;
        if (rnd() < 0.12) x += 1.4;
      }
    }
    box(5, 0.5, 3.4, mat('trophyBase', 0x2a2a35, 0.5), -12.5, 21.6, ROOM_BACK_Z + 2.6, office);
    cylinder(0.9, 0.45, 2.2, mat('gold', 0xe3b341, 0.3, 0.8), -12.5, 23, ROOM_BACK_Z + 2.6, office);

    // cuadros y reloj en la pared del fondo
    function artCanvas(kind) {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 400;
      const g = c.getContext('2d');
      g.fillStyle = '#f3efe6';
      g.fillRect(0, 0, c.width, c.height);
      if (kind === 0) {
        const grad = g.createLinearGradient(0, 0, 0, 400);
        grad.addColorStop(0, '#12b8ff');
        grad.addColorStop(1, '#ff3d9a');
        g.fillStyle = grad;
        g.fillRect(30, 30, 260, 340);
        g.fillStyle = '#fff3c4';
        g.beginPath();
        g.arc(160, 150, 52, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#26214d';
        g.beginPath();
        g.moveTo(30, 370);
        g.lineTo(110, 230);
        g.lineTo(170, 310);
        g.lineTo(230, 210);
        g.lineTo(290, 370);
        g.closePath();
        g.fill();
      } else {
        g.fillStyle = '#26214d';
        g.fillRect(30, 30, 260, 340);
        for (let i = 0; i < 6; i += 1) {
          g.fillStyle = ['#ffd400', '#ff3d9a', '#12b8ff', '#4ade80', '#fb923c', '#a78bfa'][i];
          g.beginPath();
          g.arc(80 + (i % 3) * 80, 120 + Math.floor(i / 3) * 130, 34, 0, Math.PI * 2);
          g.fill();
        }
      }
      return c;
    }
    function hangPicture(texture, x, y, w, h) {
      box(w + 0.8, h + 0.8, 0.5, mat('picFrame', 0x2b2118, 0.6), x, y, ROOM_BACK_Z + 0.55, office);
      const picture = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
      picture.position.set(x, y, ROOM_BACK_Z + 0.82);
      office.add(picture);
    }
    hangPicture(canvasTexture(artCanvas(0), maxAnisotropy), 0, 17, 6.4, 8);
    hangPicture(canvasTexture(artCanvas(1), maxAnisotropy), 8.2, 15.2, 5, 6.3);

    const clockCanvas = document.createElement('canvas');
    clockCanvas.width = 256;
    clockCanvas.height = 256;
    const clockTexture = canvasTexture(clockCanvas, maxAnisotropy);
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshStandardMaterial({ map: clockTexture, roughness: 0.6 }));
    clockFace.position.set(17, 19.5, ROOM_BACK_Z + 0.85);
    office.add(clockFace);
    const clockRim = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.22, 12, 48), mat('clockRim', 0x23262f, 0.5, 0.4));
    clockRim.position.set(17, 19.5, ROOM_BACK_Z + 0.85);
    office.add(clockRim);
    let lastClockSecond = -1;
    function drawClock() {
      const now = new Date();
      const second = now.getSeconds();
      if (second === lastClockSecond) return;
      lastClockSecond = second;
      const g = clockCanvas.getContext('2d');
      g.fillStyle = '#f7f5ef';
      g.fillRect(0, 0, 256, 256);
      g.save();
      g.translate(128, 128);
      g.strokeStyle = '#23262f';
      g.lineCap = 'round';
      for (let i = 0; i < 12; i += 1) {
        g.lineWidth = i % 3 === 0 ? 8 : 4;
        g.beginPath();
        g.moveTo(0, -104);
        g.lineTo(0, -122);
        g.stroke();
        g.rotate(Math.PI / 6);
      }
      const hands = [
        [((now.getHours() % 12) + now.getMinutes() / 60) * 30, 66, 10, '#23262f'],
        [now.getMinutes() * 6 + second / 10, 98, 7, '#23262f'],
        [second * 6, 108, 3, '#e03a3a'],
      ];
      for (const [angle, length, width, color] of hands) {
        g.save();
        g.rotate((angle * Math.PI) / 180);
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(0, 14);
        g.lineTo(0, -length);
        g.stroke();
        g.restore();
      }
      g.restore();
      clockTexture.needsUpdate = true;
    }

    // planta en la esquina
    cylinder(2.6, 2.1, 4.2, mat('pot', 0xb8643f, 0.75), -29, FLOOR_Y + 2.1, -21, office);
    for (let i = 0; i < 9; i += 1) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.6 + rnd() * 1.1, 14, 10), mat(`leaf${i % 3}`, [0x2f8f55, 0x3da565, 0x277a4a][i % 3], 0.8));
      leaf.position.set(-29 + (rnd() - 0.5) * 4.6, FLOOR_Y + 6 + rnd() * 7, -21 + (rnd() - 0.5) * 4.6);
      leaf.castShadow = true;
      office.add(leaf);
    }

    // luces del techo
    const ceilingLightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6e2, toneMapped: false });
    for (const lx of [-12, 12]) {
      const lightPanel = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 4.5), ceilingLightMaterial);
      lightPanel.position.set(lx, CEILING_Y - 0.4, -6);
      office.add(lightPanel);
    }

    // ---------------------------------------------------------------- el escritorio y lo que hay encima
    box(46, 1.4, 18, mat('desk', 0xffffff, 0.42, 0, { map: woodMap, bumpMap: woodBump, bumpScale: 0.9, physical: true, clearcoat: 0.35, clearcoatRoughness: 0.35 }), 0, DESK_Y - 0.7, 1);
    box(46.4, 0.18, 18.4, mat('deskEdge', 0x6b4529, 0.5), 0, DESK_Y - 1.42, 1, scene, false); // canto inferior
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) box(1.4, 14.2, 1.4, mat('deskLeg', 0x4a3524, 0.6), sx * 21.8, DESK_Y - 8.1, 1 + sz * 7.6);
    }
    box(44, 7, 0.6, mat('deskPanel', 0x5b3f29, 0.7), 0, DESK_Y - 4.9, -6.5); // faldon trasero
    box(21, 0.1, 8.5, mat('deskMat', 0x2b3350, 0.85, 0, { bumpMap: grainBump, bumpScale: 0.8 }), 0, DESK_Y + 0.05, 5.6, scene, false); // tapete

    // monitor con una pantalla que muestra los ultimos regalos impresos
    const monitorCanvas = document.createElement('canvas');
    monitorCanvas.width = 640;
    monitorCanvas.height = 400;
    const monitorTexture = canvasTexture(monitorCanvas, maxAnisotropy);
    const monitor = new THREE.Group();
    monitor.position.set(-16, 0, -3.6);
    monitor.rotation.y = 0.42;
    scene.add(monitor);
    cylinder(2.2, 2.6, 0.4, mat('monitorBase', 0x23262f, 0.45, 0.4), 0, 0.2, 0, monitor);
    box(0.9, 3.8, 0.8, mat('monitorNeck', 0x23262f, 0.45, 0.4), 0, 2.2, -0.3, monitor);
    box(13.4, 8.4, 0.9, mat('monitorBody', 0x181b24, 0.4, 0.3), 0, 6.4, 0, monitor);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 7.6), new THREE.MeshBasicMaterial({ map: monitorTexture, toneMapped: false }));
    screen.position.set(0, 6.4, 0.46);
    monitor.add(screen);
    // reflejo de la ventana en el vidrio
    const glareCanvas = document.createElement('canvas');
    glareCanvas.width = 256;
    glareCanvas.height = 160;
    const glareCtx = glareCanvas.getContext('2d');
    const glareGradient = glareCtx.createLinearGradient(0, 0, 256, 160);
    glareGradient.addColorStop(0, 'rgba(255,255,255,0.22)');
    glareGradient.addColorStop(0.32, 'rgba(255,255,255,0.05)');
    glareGradient.addColorStop(0.5, 'rgba(255,255,255,0)');
    glareGradient.addColorStop(1, 'rgba(255,255,255,0.04)');
    glareCtx.fillStyle = glareGradient;
    glareCtx.fillRect(0, 0, 256, 160);
    const glare = new THREE.Mesh(
      new THREE.PlaneGeometry(12.6, 7.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glareCanvas), transparent: true, depthWrite: false, toneMapped: false }),
    );
    glare.position.set(0, 6.4, 0.48);
    monitor.add(glare);
    const keyboardCanvas = document.createElement('canvas');
    keyboardCanvas.width = 512;
    keyboardCanvas.height = 170;
    {
      const g = keyboardCanvas.getContext('2d');
      g.fillStyle = '#b9bfcc';
      g.fillRect(0, 0, 512, 170);
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 15; col += 1) {
          const wide = row === 4 && col > 2 && col < 10;
          if (row === 4 && col > 2 && col !== 3) continue;
          const w = wide ? 190 : 30;
          g.fillStyle = '#eef0f5';
          roundRectPath(g, 12 + col * 33, 12 + row * 30, w, 25, 5);
          g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.18)';
          g.lineWidth = 1.5;
          g.stroke();
        }
      }
    }
    const keyboardMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, map: canvasTexture(keyboardCanvas, maxAnisotropy) });
    box(8.4, 0.35, 2.8, keyboardMaterial, -15.4, 0.2, 2.4, scene).rotation.y = 0.42;
    box(1.5, 0.4, 2.4, mat('mouse', 0x23262f, 0.4), -9.6, 0.22, 3.6, scene);
    const recent = []; // ultimos regalos impresos (para la pantalla del monitor)
    let topDonor = null; // { nickname, coins, img }: quien mas monedas ha mandado

    blob(-16, -3.6, 8, 6, 1);
    blob(-15.4, 2.5, 10, 4.2, 0.9);
    blob(-9.6, 3.6, 3.2, 3.8, 0.8);
    blob(-9.2, 6.9, 7.4, 9.2, 0.7);
    blob(12.8, 4.8, 4.4, 4.4, 0.9);
    blob(16, -3.2, 5, 5, 1);
    blob(8.6, -4.6, 3.2, 3.2, 0.9);

    function drawDonorPanel(g) {
      const x = 16;
      const y = 68;
      const w = 232;
      const h = 320;
      const cx = x + w / 2;
      const panel = g.createLinearGradient(x, y, x, y + h);
      panel.addColorStop(0, '#2c1b52');
      panel.addColorStop(1, '#140c2b');
      g.fillStyle = panel;
      roundRectPath(g, x, y, w, h, 18);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#f2c230';
      roundRectPath(g, x, y, w, h, 18);
      g.stroke();

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#f2c230';
      g.font = `800 17px ${FONT}`;
      g.fillText('TOP DONADOR', cx, y + 24);

      const cy = y + 140;
      const r = 62;
      Looks.drawCrown(g, cx, cy - r - 22, 64, 34, '#f2c230', '#8a5a08');
      const ring = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      ring.addColorStop(0, '#fff3b0');
      ring.addColorStop(0.5, '#d9a21c');
      ring.addColorStop(1, '#fff0a0');
      g.fillStyle = ring;
      g.beginPath();
      g.arc(cx, cy, r + 6, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#0d0820';
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
      if (topDonor.img) Looks.drawCoverRect(g, topDonor.img, cx - r, cy - r, r * 2, r * 2);
      g.restore();

      g.fillStyle = '#fff';
      g.font = `800 23px ${FONT}`;
      g.fillText(Looks.fitText(g, topDonor.nickname, w - 26), cx, y + 242);

      const amount = String(topDonor.coins);
      g.font = `800 30px ${FONT}`;
      const amountWidth = g.measureText(amount).width;
      const rowWidth = 30 + amountWidth;
      const startX = cx - rowWidth / 2;
      const coin = g.createRadialGradient(startX + 10, y + 276, 2, startX + 12, y + 278, 14);
      coin.addColorStop(0, '#fff3b0');
      coin.addColorStop(1, '#c98a00');
      g.fillStyle = coin;
      g.beginPath();
      g.arc(startX + 12, y + 278, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7a5200';
      g.font = `900 14px ${FONT}`;
      g.fillText('$', startX + 12, y + 279);
      g.textAlign = 'left';
      g.fillStyle = '#ffd25e';
      g.font = `800 30px ${FONT}`;
      g.fillText(amount, startX + 30, y + 278);
      g.textAlign = 'center';
      g.fillStyle = '#b8a9e0';
      g.font = `700 14px ${FONT}`;
      g.fillText('MONEDAS', cx, y + 304);
    }

    function drawMonitor() {
      const g = monitorCanvas.getContext('2d');
      const bgGradient = g.createLinearGradient(0, 0, 0, 400);
      bgGradient.addColorStop(0, '#13172b');
      bgGradient.addColorStop(1, '#0a0d1b');
      g.fillStyle = bgGradient;
      g.fillRect(0, 0, 640, 400);
      g.fillStyle = '#ff3d9a';
      g.fillRect(0, 0, 640, 54);
      g.fillStyle = '#fff';
      g.font = `800 28px ${FONT}`;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillText('● EN VIVO · Impresora de fotos', 22, 28);

      const listX = topDonor ? 262 : 16;
      const listW = 640 - listX - 16;
      if (topDonor) drawDonorPanel(g);

      g.textAlign = 'left';
      g.font = `700 20px ${FONT}`;
      if (!recent.length) {
        g.fillStyle = '#8a92b2';
        g.fillText('Esperando regalos...', listX + 8, 110);
      }
      recent.slice(0, 6).forEach((entry, index) => {
        const y = 92 + index * 50;
        g.fillStyle = index === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
        roundRectPath(g, listX, y - 20, listW, 42, 10);
        g.fill();
        g.fillStyle = '#7dffb0';
        g.textAlign = 'left';
        g.fillText('▶', listX + 12, y + 1);
        g.fillStyle = '#fff';
        g.fillText(fitText(g, entry.nickname || '', listW * 0.46), listX + 40, y + 1);
        g.fillStyle = '#ffd27a';
        g.textAlign = 'right';
        g.fillText(fitText(g, `${entry.giftName || ''}${entry.count > 1 ? ` ×${entry.count}` : ''}`, listW * 0.4), listX + listW - 12, y + 1);
        g.textAlign = 'left';
      });
      monitorTexture.needsUpdate = true;
    }

    // lampara de escritorio (con luz calida sobre la impresora)
    const lampBase = new THREE.Vector3(16, DESK_Y, -3.2);
    cylinder(1.9, 2.2, 0.5, mat('lamp', 0x2b3a55, 0.4, 0.5), lampBase.x, 0.25, lampBase.z);
    const lampElbow = new THREE.Vector3(14.6, 8.4, -3);
    const lampHead = new THREE.Vector3(10.6, 10.8, -1.6);
    limb(new THREE.Vector3(lampBase.x, 0.4, lampBase.z), lampElbow, 0.26, mat('lamp'));
    limb(lampElbow, lampHead, 0.24, mat('lamp'));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.4, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }));
    shade.position.copy(lampHead).add(new THREE.Vector3(-0.5, -0.4, 0.2));
    shade.rotation.z = 0.55;
    shade.rotation.x = -0.15;
    shade.castShadow = true;
    scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false }));
    bulb.position.copy(lampHead).add(new THREE.Vector3(-1.0, -1.0, 0.3));
    scene.add(bulb);

    // taza, cuaderno y portalapices
    cylinder(1.05, 0.9, 1.7, mat('mug', 0xf4f1ea, 0.35), 12.8, 0.85, 4.8);
    const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 10, 20, Math.PI), mat('mug'));
    mugHandle.position.set(13.85, 0.9, 4.8);
    mugHandle.rotation.z = -Math.PI / 2;
    scene.add(mugHandle);
    cylinder(0.92, 0.92, 0.06, mat('coffee', 0x3a2314, 0.3), 12.8, 1.62, 4.8);
    box(5.6, 0.3, 7.4, mat('notebook', 0x3b82c4, 0.7), -9.4, 0.15, 6.8).rotation.y = -0.18;
    box(0.2, 0.2, 3.6, mat('pen', 0xe03a3a, 0.4), -7.0, 0.42, 6.6).rotation.y = 0.5;
    cylinder(1.1, 1.0, 2.4, mat('penCup', 0x23262f, 0.5), 8.6, 1.2, -4.6);
    for (let i = 0; i < 4; i += 1) {
      const pencil = cylinder(0.08, 0.08, 3.4, mat(`pencil${i}`, [0xe03a3a, 0x3b82c4, 0xffd400, 0x4aa36b][i], 0.5), 8.6 + (i - 1.5) * 0.28, 2.6, -4.6 + (i % 2) * 0.2);
      pencil.rotation.z = (i - 1.5) * 0.12;
    }

    // ---------------------------------------------------------------- luces
    scene.add(new THREE.HemisphereLight(0xe6edff, 0x3a2f4a, 0.35));
    const key = new THREE.DirectionalLight(0xfff3df, 1.5);
    key.position.set(-8, 22, 16);
    key.target.position.set(0, 3, 0);
    scene.add(key.target);
    key.castShadow = true;
    key.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 18, bottom: -6, near: 1, far: 60 });
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    scene.add(key);

    const deskSpot = new THREE.SpotLight(0xffd9a0, 260, 40, 0.62, 0.55, 1.4);
    deskSpot.position.copy(lampHead).add(new THREE.Vector3(-0.8, -0.6, 0.2));
    deskSpot.target.position.set(0, 2.4, -1.2);
    deskSpot.castShadow = true;
    deskSpot.shadow.mapSize.set(SHADOW_SIZE / 2, SHADOW_SIZE / 2);
    deskSpot.shadow.bias = -0.0005;
    scene.add(deskSpot, deskSpot.target);

    // luz suave sobre cada pared lateral: ahi se van a ir colgando las impresiones
    for (const sx of [-1, 1]) {
      const wallLight = new THREE.PointLight(0xfff0dc, 150, 70, 2);
      wallLight.position.set(sx * 24, 14, -6);
      scene.add(wallLight);
    }
    const monitorLight = new THREE.PointLight(0x7a9bff, 55, 22, 2);
    monitorLight.position.set(-14, 7, 0);
    scene.add(monitorLight);
    const ceilingLight = new THREE.PointLight(0xfff2dc, 420, 80, 2);
    ceilingLight.position.set(0, CEILING_Y - 4, -4);
    scene.add(ceilingLight);

    // ---------------------------------------------------------------- iluminacion de entorno (reflejos y luz ambiente realistas)
    // Se captura la oficina desde donde esta la cabeza del personaje; los objetos brillantes (impresora, manos) reflejan la sala.
    {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.position.set(-EYE.x, -(EYE.y - 1.5), -EYE.z);
      scene.updateMatrixWorld(true);
      scene.environment = pmrem.fromScene(scene, 0.035, 0.1, 140).texture;
      scene.position.set(0, 0, 0);
      pmrem.dispose();
    }

    // ---------------------------------------------------------------- impresora (cama plana con cabezal sobre una barra)
    const printer = new THREE.Group();
    scene.add(printer);
    const upper = new THREE.Group();
    upper.position.y = BASE_H - 2.2;
    printer.add(upper);

    const cream = new THREE.MeshPhysicalMaterial({ color: 0xe9ddc2, roughness: 0.55, metalness: 0.02, clearcoat: 0.3, clearcoatRoughness: 0.4, bumpMap: grainBump, bumpScale: 0.3 });
    const creamDark = new THREE.MeshPhysicalMaterial({ color: 0xcdbd9a, roughness: 0.6, metalness: 0.02, clearcoat: 0.2, bumpMap: grainBump, bumpScale: 0.3 });
    const blackMatte = new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.62, metalness: 0.12, clearcoat: 0.18, clearcoatRoughness: 0.6, bumpMap: grainBump, bumpScale: 0.55 });
    // metal cepillado: vetas finas a lo largo de la pieza
    const brushCanvas = document.createElement('canvas');
    brushCanvas.width = 256;
    brushCanvas.height = 64;
    {
      const g = brushCanvas.getContext('2d');
      const random = seededRandom(404);
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 256; i += 1) {
        const v = 128 + (random() - 0.5) * 120;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(i, 0, 1, 64);
      }
    }
    const brushBump = repeatTexture(brushCanvas, 3, 1, maxAnisotropy, false);
    const brushed = new THREE.MeshStandardMaterial({ color: 0xd4d8de, roughness: 0.28, metalness: 1, bumpMap: brushBump, bumpScale: 0.25 });
    const brushedDark = new THREE.MeshStandardMaterial({ color: 0x9096a1, roughness: 0.36, metalness: 1, bumpMap: brushBump, bumpScale: 0.25 });
    const grayMetal = new THREE.MeshStandardMaterial({ color: 0x7b818b, roughness: 0.5, metalness: 0.8, bumpMap: grainBump, bumpScale: 0.4 });

    function add(mesh, x, y, z, parent = upper) {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    function rod(radius, length, material, x, y, z, axis, parent = upper) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 32), material);
      if (axis === 'x') mesh.rotation.z = Math.PI / 2;
      else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
      return add(mesh, x, y, z, parent);
    }

    // sin base: la hoja corre directo sobre el escritorio. Una carcasa negra delgada atras, dos rieles plateados a los lados
    // y una barra con el cabezal (todo lo de abajo esta modelado en las coordenadas de `upper`, que lo baja al escritorio)
    const bedDepth = BED_FRONT_Z - BED_REAR_Z;
    const RAIL_X = 6.9;
    const RAIL_Y = 3.4;
    const HOUSING_Z = -6.0;
    const FACE_Z = HOUSING_Z + 0.4;

    // carcasa trasera negra (delgada) por donde entra la hoja, con pantalla, luces y botones
    add(new THREE.Mesh(roundedBox(13.4, 1.0, 0.8, 0.22, 0.06), blackMatte), 0, RAIL_Y, HOUSING_Z);
    const railFrontZ = 5.3;
    const railLength = railFrontZ - FACE_Z;
    for (const sx of [-1, 1]) {
      // oreja gris donde se agarra el riel
      add(new THREE.Mesh(roundedBox(0.5, 1.0, 0.9, 0.14, 0.05), grayMetal), sx * (RAIL_X + 0.05), RAIL_Y, HOUSING_Z + 0.05);
      // riel plateado
      rod(0.26, railLength, brushed, sx * RAIL_X, RAIL_Y, FACE_Z + railLength / 2, 'z');
      add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), brushed), sx * RAIL_X, RAIL_Y, railFrontZ);
      // soporte delantero: una pata gris hasta el escritorio
      add(new THREE.Mesh(roundedBox(0.7, 1.5, 0.8, 0.15, 0.05), grayMetal), sx * RAIL_X, RAIL_Y - 0.55, railFrontZ - 0.35);
    }

    const lcdCanvas = document.createElement('canvas');
    lcdCanvas.width = 384;
    lcdCanvas.height = 144;
    const lcdTexture = canvasTexture(lcdCanvas);
    add(new THREE.Mesh(roundedBox(2.3, 0.82, 0.1, 0.1, 0.03), new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.35, clearcoat: 0.7 })), -4.6, RAIL_Y, FACE_Z + 0.025);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.77), new THREE.MeshBasicMaterial({ map: lcdTexture, toneMapped: false }));
    lcd.position.set(-4.6, RAIL_Y, FACE_Z + 0.08);
    upper.add(lcd);

    const ledPower = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshStandardMaterial({ color: 0x34e07a, emissive: 0x34e07a, emissiveIntensity: 2 }));
    ledPower.position.set(3.4, RAIL_Y + 0.17, FACE_Z + 0.04);
    upper.add(ledPower);
    const ledBusyMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4258, emissive: 0xffb02e, emissiveIntensity: 0 });
    const ledBusy = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), ledBusyMaterial);
    ledBusy.position.set(3.75, RAIL_Y + 0.17, FACE_Z + 0.04);
    upper.add(ledBusy);
    [0x34e07a, 0xffb02e, 0xe0453a].forEach((color, index) => {
      const button = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 22), new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8 }));
      button.rotation.x = Math.PI / 2;
      button.position.set(3.35 + index * 0.4, RAIL_Y - 0.17, FACE_Z + 0.04);
      button.castShadow = true;
      upper.add(button);
    });
    const brandCanvas = document.createElement('canvas');
    brandCanvas.width = 768;
    brandCanvas.height = 64;
    const brandCtx = brandCanvas.getContext('2d');
    brandCtx.font = `700 34px ${FONT}`;
    brandCtx.fillStyle = '#aeb6c8';
    brandCtx.textBaseline = 'middle';
    brandCtx.fillText('I N T E R A K T I K   P H O T O   P R I N T', 6, 34);
    const brand = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.35), new THREE.MeshBasicMaterial({ map: canvasTexture(brandCanvas), transparent: true, toneMapped: false }));
    brand.position.set(-0.5, RAIL_Y, FACE_Z + 0.03);
    upper.add(brand);

    // barra del cabezal: dos carros negros sobre los rieles, una barra plateada y otra fina encima
    const GANTRY_Y = RAIL_Y + 0.15;
    for (const sx of [-1, 1]) add(new THREE.Mesh(roundedBox(0.8, 1.15, 0.95, 0.18, 0.06), blackMatte), sx * RAIL_X, RAIL_Y, GANTRY_Z);
    rod(0.22, RAIL_X * 2 + 0.2, brushed, 0, GANTRY_Y, GANTRY_Z, 'x');
    rod(0.15, RAIL_X * 2 + 0.2, brushedDark, 0, GANTRY_Y + 0.67, GANTRY_Z + 0.32, 'x');
    add(new THREE.Mesh(new THREE.BoxGeometry(RAIL_X * 2 - 0.6, 0.3, 0.45), blackMatte), 0, GANTRY_Y + 0.35, GANTRY_Z - 0.4);

    // cabezal de impresion: bloque negro delgado con tapa plateada, luz azul y una boquilla
    const head = new THREE.Group();
    head.position.set(0, GANTRY_Y, GANTRY_Z);
    upper.add(head);
    add(new THREE.Mesh(roundedBox(1.0, 1.1, 1.0, 0.22, 0.07), blackMatte), 0, 0, 0, head);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.1, 1.06), brushed), 0, 0.58, 0, head);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.05), brushedDark), 0, -0.1, 0.52, head);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.45, 18), blackMatte), 0, -0.78, 0.05, head);
    const headLed = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), new THREE.MeshBasicMaterial({ color: 0x6cc4ff, toneMapped: false }));
    headLed.position.set(-0.25, 0.28, 0.53);
    head.add(headLed);
    const headLight = new THREE.PointLight(0x54b4ff, 6, 9, 2);
    headLight.position.set(0, -0.6, 0.7);
    head.add(headLight);
    // brillo de la linea que se esta imprimiendo, justo bajo el cabezal
    const printGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshBasicMaterial({ color: 0x54b4ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    printGlow.rotation.x = -Math.PI / 2;
    printGlow.position.set(0, BASE_H + 0.09, GANTRY_Z + 0.15);
    printer.add(printGlow);

    blob(0, HOUSING_Z, 15.5, 4.2, 0.9);
    blob(RAIL_X, railFrontZ - 0.35, 2.2, 2.2, 0.8);
    blob(-RAIL_X, railFrontZ - 0.35, 2.2, 2.2, 0.8);

    // ---------------------------------------------------------------- hoja (cinta infinita)
    const paperCanvas = document.createElement('canvas');
    paperCanvas.width = CANVAS_W;
    paperCanvas.height = CANVAS_H;
    const pg = paperCanvas.getContext('2d');
    const paperTexture = canvasTexture(paperCanvas, maxAnisotropy);
    paperTexture.generateMipmaps = false;
    paperTexture.minFilter = THREE.LinearFilter;
    paperTexture.magFilter = THREE.LinearFilter;

    // la hoja recorre un camino: plana sobre la bandeja, se curva sobre el borde frontal y cuelga por delante
    const paperGeometry = new THREE.PlaneGeometry(PAPER_W, PAPER_L, 10, 150);
    paperGeometry.translate(0, PAPER_L / 2, 0);
    {
      const pos = paperGeometry.attributes.position;
      const uv = paperGeometry.attributes.uv;
      const yt = BASE_H + 0.05;
      const arcLength = (Math.PI * ARC_R) / 2;
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const u = pos.getY(i);
        let y;
        let z;
        if (u <= PAPER_FLAT) {
          y = yt;
          z = PAPER_Z0 + u;
        } else if (u <= PAPER_FLAT + arcLength) {
          const theta = (u - PAPER_FLAT) / ARC_R;
          z = PAPER_ZF - ARC_R + ARC_R * Math.sin(theta);
          y = yt - ARC_R + ARC_R * Math.cos(theta);
        } else {
          z = PAPER_ZF;
          y = yt - ARC_R - (u - PAPER_FLAT - arcLength);
        }
        pos.setXYZ(i, x, y, z);
        uv.setY(i, 1 - u / PAPER_L);
      }
      pos.needsUpdate = true;
      uv.needsUpdate = true;
      paperGeometry.computeVertexNormals();
    }
    const paperMaterial = new THREE.MeshStandardMaterial({
      map: paperTexture,
      emissiveMap: paperTexture,
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const paper = new THREE.Mesh(paperGeometry, paperMaterial);
    paper.castShadow = true;
    paper.receiveShadow = true;
    scene.add(paper);

    const holeTile = document.createElement('canvas');
    holeTile.width = 22;
    holeTile.height = HOLE_STEP;
    const hg = holeTile.getContext('2d');
    hg.fillStyle = 'rgba(30, 24, 16, 0.5)';
    hg.beginPath();
    hg.arc(11, 14, 4.2, 0, Math.PI * 2);
    hg.fill();
    const holePattern = pg.createPattern(holeTile, 'repeat');

    // ---------------------------------------------------------------- las manos del personaje (primera persona)
    // piel: tono con manchas rojizas, poros (bump) y un brillo suave en los bordes (sheen) que imita la dispersion de la luz
    const skinCanvas = noiseCanvas(256, 77, [226, 172, 140], 14, 5, 0.5);
    {
      const g = skinCanvas.getContext('2d');
      const random = seededRandom(5);
      for (let i = 0; i < 26; i += 1) {
        const x = random() * 256;
        const y = random() * 256;
        const radial = g.createRadialGradient(x, y, 0, x, y, 30 + random() * 40);
        radial.addColorStop(0, random() < 0.6 ? 'rgba(214,120,100,0.22)' : 'rgba(255,215,185,0.2)');
        radial.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = radial;
        g.fillRect(0, 0, 256, 256);
      }
    }
    const skinMap = repeatTexture(skinCanvas, 1, 1, maxAnisotropy, true);
    const skinBump = repeatTexture(noiseCanvas(256, 78, [128, 128, 128], 70, 1), 3, 3, maxAnisotropy, false);
    const skinMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: skinMap,
      bumpMap: skinBump,
      bumpScale: 0.5,
      roughness: 0.52,
      metalness: 0,
      sheen: 0.8,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color(0xff9a82),
      clearcoat: 0.12,
      clearcoatRoughness: 0.5,
    });
    const nailMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf2c9bd, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.12 });
    const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3a63, roughness: 0.92, bumpMap: fabricBump, bumpScale: 1.4 });
    const cuffMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f4f7, roughness: 0.8, bumpMap: fabricBump, bumpScale: 1.1 });

    // una mano con la muneca en el origen: los dedos apuntan a -Z y la palma mira a -Y
    function makeHand(isRight) {
      const root = new THREE.Group();
      const palm = new THREE.Mesh(roundedBox(1.7, 0.55, 1.9, 0.26, 0.14), skinMaterial);
      palm.position.set(0, 0, -0.95);
      palm.castShadow = true;
      root.add(palm);
      const thumbBase = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), skinMaterial);
      thumbBase.scale.set(1, 0.7, 1.35);
      thumbBase.position.set((isRight ? -1 : 1) * 0.62, -0.02, -0.55);
      thumbBase.castShadow = true;
      root.add(thumbBase);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 1.0, 20), cuffMaterial);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(0, 0, 0.55);
      cuff.castShadow = true;
      root.add(cuff);

      function segment(radius, length) {
        const geometry = new THREE.CapsuleGeometry(radius, length, 4, 10);
        geometry.rotateX(Math.PI / 2); // el eje de la capsula queda a lo largo de Z
        const mesh = new THREE.Mesh(geometry, skinMaterial);
        mesh.position.z = -length / 2;
        mesh.castShadow = true;
        return mesh;
      }

      // cada dedo: falanges anidadas; al doblarlas se rota cada articulacion
      function finger(x, z, lengths, radius, yaw = 0) {
        const joints = [];
        let parent = root;
        lengths.forEach((length, index) => {
          const joint = new THREE.Group();
          if (index === 0) {
            joint.position.set(x, 0.02, z);
            joint.rotation.y = yaw;
          } else {
            joint.position.set(0, 0, -lengths[index - 1] - radius * 0.2);
          }
          const segmentRadius = radius * (1 - index * 0.08);
          joint.add(segment(segmentRadius, length));
          if (index > 0) {
            // nudillo: rellena la articulacion al doblar el dedo
            const knuckle = new THREE.Mesh(new THREE.SphereGeometry(segmentRadius * 1.04, 12, 10), skinMaterial);
            knuckle.castShadow = true;
            joint.add(knuckle);
          }
          if (index === lengths.length - 1) {
            const nail = new THREE.Mesh(new THREE.SphereGeometry(segmentRadius * 0.82, 12, 8), nailMaterial);
            nail.scale.set(0.95, 0.3, 1.5);
            nail.position.set(0, segmentRadius * 0.74, -length * 0.82);
            joint.add(nail);
          }
          parent.add(joint);
          joints.push(joint);
          parent = joint;
        });
        return joints;
      }

      const fingers = [
        finger(-0.62, -1.8, [0.7, 0.5, 0.4], 0.17),
        finger(-0.21, -1.86, [0.78, 0.55, 0.42], 0.175),
        finger(0.21, -1.84, [0.72, 0.52, 0.4], 0.17),
        finger(0.62, -1.76, [0.56, 0.4, 0.34], 0.155),
      ];
      const thumbSide = isRight ? -1 : 1;
      const thumb = finger(thumbSide * 0.9, -0.55, [0.62, 0.5], 0.2, thumbSide * 0.75);

      return { root, fingers, thumb };
    }

    function applyCurl(hand, curls, thumbCurl) {
      hand.fingers.forEach((joints, index) => {
        const curl = curls[index];
        joints[0].rotation.x = -curl * 0.85;
        joints[1].rotation.x = -curl * 1.15;
        joints[2].rotation.x = -curl * 0.75;
      });
      hand.thumb[0].rotation.x = -thumbCurl * 0.35;
      hand.thumb[1].rotation.x = -thumbCurl * 0.8;
    }

    const hands = { left: makeHand(false), right: makeHand(true) };
    scene.add(hands.left.root, hands.right.root);

    // mangas: del hombro (detras de la camara) a la muneca
    const sleeves = {
      left: new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 18), sleeveMaterial),
      right: new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 18), sleeveMaterial),
    };
    sleeves.left.castShadow = true;
    sleeves.right.castShadow = true;
    scene.add(sleeves.left, sleeves.right);

    // posturas: las dos manos descansan sobre los costados de la bandeja; la izquierda golpetea de vez en cuando y la derecha
    // tamborilea mientras la impresora trabaja
    const REST = {
      left: { pos: new THREE.Vector3(-5.6, 0.62, 4.3), euler: new THREE.Euler(0.03, -0.14, 0, 'YXZ'), curls: [0.3, 0.36, 0.42, 0.48], thumb: 0.25 },
      right: { pos: new THREE.Vector3(5.6, 0.62, 4.3), euler: new THREE.Euler(0.03, 0.14, 0, 'YXZ'), curls: [0.3, 0.36, 0.42, 0.48], thumb: 0.25 },
    };
    const restQuat = {
      left: new THREE.Quaternion().setFromEuler(REST.left.euler),
      right: new THREE.Quaternion().setFromEuler(REST.right.euler),
    };
    const handPose = { left: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, right: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() } };
    const shoulder = { left: new THREE.Vector3(), right: new THREE.Vector3() };
    const tmpWrist = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);
    let handSpread = 1; // en pantallas angostas las manos se acercan un poco al centro
    const tap = { finger: 0, until: 0, nextAt: 1.5 };

    // cuando el personaje sostiene la foto para darle un beso: donde esta la foto (en el espacio de la camara) y cuanto la sostiene
    const kissState = { hold: 0, D: 9, cx: 0, cy: 0.5, halfW: 3.1, halfH: 3.1 };
    const holdQuatLocal = {
      left: new THREE.Quaternion().setFromEuler(new THREE.Euler(1.15, 0.3, 0, 'YXZ')),
      right: new THREE.Quaternion().setFromEuler(new THREE.Euler(1.15, -0.3, 0, 'YXZ')),
    };
    const HOLD_CURLS = [0.55, 0.6, 0.65, 0.7];
    const tmpHold = new THREE.Vector3();
    const tmpHoldQuat = new THREE.Quaternion();

    function updateHands(time, busy, eyePosition) {
      // respiracion: las manos suben y bajan apenas
      const breathe = Math.sin(time * 1.5) * 0.02;

      // un dedo de la mano izquierda golpetea de vez en cuando
      if (time > tap.nextAt) {
        tap.finger = Math.floor(Math.random() * 4);
        tap.until = time + 0.5;
        tap.nextAt = time + 2.2 + Math.random() * 3;
      }
      const tapPhase = time < tap.until ? Math.sin(((tap.until - time) / 0.5) * Math.PI * 3) * 0.5 + 0.5 : 0;

      const leftCurls = REST.left.curls.slice();
      leftCurls[tap.finger] = Math.max(0.05, leftCurls[tap.finger] - tapPhase * 0.28);
      // derecha: mientras imprime tamborilea con los dedos en cadena
      const rightCurls = REST.right.curls.map((value, index) => (busy ? Math.max(0.05, value - (Math.sin(time * 9 - index * 0.9) * 0.5 + 0.5) * 0.22) : value));

      for (const side of ['left', 'right']) {
        const hand = hands[side];
        const pose = handPose[side];
        pose.pos.copy(REST[side].pos);
        pose.pos.x *= handSpread;
        pose.pos.y += breathe;
        pose.quat.copy(restQuat[side]);
        let curls = side === 'left' ? leftCurls : rightCurls;
        if (kissState.hold > 0.001) {
          // las dos manos agarran la foto por sus esquinas de abajo
          const sx = side === 'left' ? -1 : 1;
          tmpHold.set(kissState.cx + sx * (kissState.halfW - 0.55), kissState.cy - kissState.halfH + 0.2, -kissState.D + 0.5);
          camera.localToWorld(tmpHold);
          tmpHoldQuat.copy(camera.quaternion).multiply(holdQuatLocal[side]);
          pose.pos.lerp(tmpHold, kissState.hold);
          pose.quat.slerp(tmpHoldQuat, kissState.hold);
          curls = curls.map((value, index) => value + (HOLD_CURLS[index] - value) * kissState.hold);
        }
        hand.root.position.copy(pose.pos);
        hand.root.quaternion.copy(pose.quat);
        applyCurl(hand, curls, REST[side].thumb);

        // manga: del hombro (detras de la camara) a la muneca
        shoulder[side].set((side === 'left' ? -1 : 1) * 5.4, eyePosition.y - 4.5, eyePosition.z + 1.6);
        tmpWrist.set(0, 0, 0.9).applyQuaternion(pose.quat).add(pose.pos);
        tmpDir.subVectors(tmpWrist, shoulder[side]);
        const length = tmpDir.length();
        sleeves[side].position.copy(shoulder[side]).addScaledVector(tmpDir, 0.5);
        sleeves[side].scale.set(0.62, length, 0.62);
        sleeves[side].quaternion.setFromUnitVectors(UP, tmpDir.normalize());
      }
    }

    // ---------------------------------------------------------------- contenido de la hoja
    const settings = { paper: 'white', shape: 'rounded', showName: true, showGift: true, vipWall: false };
    const blocks = []; // del mas viejo al mas nuevo
    let intro = null;
    let introHint = 'Aquí se imprimirán las fotos de perfil de quienes manden regalos.';
    let feedTotal = 0;
    let active = null;
    let dirty = true;
    let finishedAt = -10;

    function theme() {
      return THEMES[settings.paper] || THEMES.white;
    }

    function drawFold(g, h) {
      g.save();
      const crease = g.createLinearGradient(0, h - 16, 0, h);
      crease.addColorStop(0, 'rgba(0,0,0,0)');
      crease.addColorStop(0.6, 'rgba(0,0,0,0.06)');
      crease.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.fillStyle = crease;
      g.fillRect(0, h - 16, CANVAS_W, 16);
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.lineWidth = 2;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(0, h - 1);
      g.lineTo(CANVAS_W, h - 1);
      g.stroke();
      g.restore();
    }

    function renderIntro() {
      const t = theme();
      const h = 560;
      const c = document.createElement('canvas');
      c.width = CANVAS_W;
      c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = t.ink;
      g.globalAlpha = 0.55;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 56px ${FONT}`;
      g.fillText('HOJA EN', CANVAS_W / 2, 150);
      g.fillText('BLANCO', CANVAS_W / 2, 214);
      g.font = `600 27px ${FONT}`;
      wrapLines(g, introHint, CANVAS_W - 170).slice(0, 4).forEach((line, i) => g.fillText(line, CANVAS_W / 2, 290 + i * 36));
      g.globalAlpha = 1;
      drawFold(g, h);
      return { canvas: c, h, printed: h, done: true, dry: 1, intro: true };
    }

    // La foto ya compuesta (papel aparte): foto + nombre + regalo, con el estilo que le toco (ver photo-printer-looks.js)
    function renderBlock(job, img, giftImg) {
      const canvas = Looks.renderBlock(job, img, giftImg, { paper: settings.paper, shape: settings.shape, showName: settings.showName, showGift: settings.showGift });
      return {
        canvas,
        h: canvas.height,
        printed: 0,
        done: false,
        dry: 0,
        job,
        img,
        giftImg,
        pinned: Boolean(job.style && job.style.pinned),
        kiss: Boolean(job.style && job.style.kiss),
        tear: Boolean(job.style && job.style.tear),
        kissStarted: false,
        kissed: false,
        doneAt: 0,
        teleporting: false,
        teleported: false,
        tele: 0,
      };
    }

    function rebuildBlocks() {
      intro = renderIntro();
      for (const block of blocks) {
        if (block.job && block.img) {
          const fresh = renderBlock(block.job, block.img, block.giftImg);
          block.canvas = fresh.canvas;
          block.h = fresh.h;
        }
      }
      for (const card of wallCards) if (card && card.block) drawCard(card, card.block);
      dirty = true;
    }

    // arma la hoja entera: fondo con agujeros y, desde el cabezal hacia el espectador, cada foto (la mas nueva primero).
    // Cada foto se imprime de abajo hacia arriba (primero su pie, al final su parte de arriba), asi queda derecha para quien mira.
    function compose() {
      const t = theme();
      pg.setTransform(1, 0, 0, 1, 0, 0);
      pg.globalAlpha = 1;
      pg.fillStyle = t.paper;
      pg.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const edge = pg.createLinearGradient(0, 0, CANVAS_W, 0);
      edge.addColorStop(0, 'rgba(0,0,0,0.08)');
      edge.addColorStop(0.07, 'rgba(0,0,0,0)');
      edge.addColorStop(0.93, 'rgba(0,0,0,0)');
      edge.addColorStop(1, 'rgba(0,0,0,0.08)');
      pg.fillStyle = edge;
      pg.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const list = [intro, ...blocks].filter(Boolean);
      let top = HEAD_Y_PX;
      for (let i = list.length - 1; i >= 0 && top < CANVAS_H; i -= 1) {
        const block = list[i];
        const visible = Math.max(0, Math.min(block.printed, block.h));
        if (visible <= 0) continue;
        if (block.teleported) {
          top += visible;
          continue;
        }
        const srcY = block.h - visible;
        const gray = !block.done || block.dry < 1;
        if (gray && 'filter' in pg) {
          pg.save();
          pg.filter = GRAY_FILTER;
          pg.drawImage(block.canvas, 0, srcY, CANVAS_W, visible, 0, top, CANVAS_W, visible);
          pg.restore();
          if (block.dry > 0) {
            pg.globalAlpha = block.dry;
            pg.drawImage(block.canvas, 0, srcY, CANVAS_W, visible, 0, top, CANVAS_W, visible);
            pg.globalAlpha = 1;
          }
        } else {
          pg.drawImage(block.canvas, 0, srcY, CANVAS_W, visible, 0, top, CANVAS_W, visible);
        }
        if (!block.done) {
          pg.fillStyle = 'rgba(0,0,0,0.1)';
          for (let y = top; y < top + visible; y += 3) pg.fillRect(0, y, CANVAS_W, 1);
        }
        if (block.teleporting) {
          pg.fillStyle = t.paper;
          pg.globalAlpha = block.tele;
          pg.fillRect(0, top, CANVAS_W, visible);
          pg.fillStyle = '#54b4ff';
          pg.globalAlpha = Math.sin(block.tele * Math.PI) * 0.55;
          pg.fillRect(0, top, CANVAS_W, visible);
          pg.globalAlpha = 1;
        }
        top += visible;
      }

      // agujeros del papel continuo: se mueven con la hoja
      pg.save();
      pg.translate(0, (feedTotal % HOLE_STEP) - HOLE_STEP);
      pg.fillStyle = holePattern;
      pg.fillRect(0, 0, 22, CANVAS_H + HOLE_STEP);
      pg.translate(CANVAS_W - 22, 0);
      pg.fillRect(0, 0, 22, CANVAS_H + HOLE_STEP);
      pg.restore();

      paperTexture.needsUpdate = true;
    }

    // ---------------------------------------------------------------- paredes con las impresiones
    // Cada foto terminada se "teletransporta" a la pared: primero se llena la izquierda y luego la derecha. Cuando las dos
    // estan llenas se vuelve a empezar por la primera (se reemplaza la mas vieja).
    const WALL_COLS = 5;
    const WALL_ROWS = 7;
    const WALL_CELL = 6.2;
    const WALL_Y0 = -8.3; // centro de la fila de abajo
    const WALL_PER = WALL_COLS * WALL_ROWS;
    const WALL_ROW_ORDER = [3, 2, 4, 1, 5, 0, 6]; // empieza por la fila a la altura de los ojos y se abre hacia arriba y abajo
    const WALL_X = ROOM_X - 0.38; // cara interior de la pared (las paredes miden 0.6 de grosor)
    const TELEPORT_DELAY = 2.2; // segundos que la foto se ve en la hoja antes de irse a la pared
    const wallCards = [];
    let wallCount = 0;
    const poolCursor = { all: 0, left: 0, right: 0 };
    let lastWallSide = -1;
    let wallWatch = null;
    let wallToggle = 0;

    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 128;
    ringCanvas.height = 128;
    {
      const g = ringCanvas.getContext('2d');
      const radial = g.createRadialGradient(64, 64, 8, 64, 64, 63);
      radial.addColorStop(0, 'rgba(84,180,255,0.08)');
      radial.addColorStop(0.58, 'rgba(120,205,255,0.85)');
      radial.addColorStop(0.7, 'rgba(255,255,255,1)');
      radial.addColorStop(0.86, 'rgba(84,180,255,0.4)');
      radial.addColorStop(1, 'rgba(84,180,255,0)');
      g.fillStyle = radial;
      g.fillRect(0, 0, 128, 128);
    }
    const ringTexture = canvasTexture(ringCanvas);
    const ringGeometry = new THREE.PlaneGeometry(1, 1);
    const cardGeometry = new THREE.PlaneGeometry(1, 1);

    function makeCard(side) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const texture = canvasTexture(canvas, maxAnisotropy);
      const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.9 });
      const mesh = new THREE.Mesh(cardGeometry, material);
      mesh.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      mesh.visible = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ map: ringTexture, color: 0x8fd4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      ring.rotation.y = mesh.rotation.y;
      ring.visible = false;
      scene.add(ring);
      return { mesh, ring, canvas, texture, material, block: null, t: 99, settled: true, w: 5.7, h: 5.7 };
    }

    // la foto sobre un papel con borde y una tira de cinta (y la marca de labial si ya la besaron)
    function drawCard(card, block, w = 256, markProgress = block.kissed ? 1 : 0) {
      const k = w / 256;
      const h = Math.max(Math.round(120 * k), Math.round((w * block.h) / CANVAS_W));
      card.canvas.width = w;
      card.canvas.height = h;
      const g = card.canvas.getContext('2d');
      g.fillStyle = theme().paper;
      g.fillRect(0, 0, w, h);
      g.drawImage(block.canvas, 0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 3 * k;
      g.strokeRect(1.5 * k, 1.5 * k, w - 3 * k, h - 3 * k);
      g.save();
      g.translate(w / 2, 4 * k);
      g.rotate(-0.04);
      g.fillStyle = 'rgba(255,236,170,0.8)';
      g.fillRect(-26 * k, -6 * k, 52 * k, 17 * k);
      g.restore();
      if (markProgress > 0) Looks.drawKissMark(g, w * 0.56, h * 0.56, w * 0.4, markProgress, Looks.hashText(block.job ? block.job.nickname : 'x'));
      card.texture.needsUpdate = true;
      const width = 5.7;
      const height = (width * h) / w;
      const fit = Math.min(1, 5.9 / height);
      card.w = width * fit;
      card.h = height * fit;
    }

    function gazeAt(x, y, z) {
      const dx = x - eyePosition.x;
      const dy = y - eyePosition.y;
      const dz = z - eyePosition.z;
      return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    }

    // Elige el lugar de la foto. Las fotos fijas no se reemplazan al dar la vuelta; con "pared VIP" las fijas van solo a la derecha
    // y las demas solo a la izquierda.
    function pickWallSlot(block) {
      const vip = settings.vipWall;
      const pool = vip ? (block.pinned ? 'right' : 'left') : 'all';
      const from = pool === 'right' ? WALL_PER : 0;
      const size = pool === 'all' ? WALL_PER * 2 : WALL_PER;
      const cursor = poolCursor[pool];
      for (let i = 0; i < size; i += 1) {
        const index = from + ((cursor + i) % size);
        const occupant = wallCards[index];
        const locked = occupant && occupant.mesh.visible && occupant.block && occupant.block.pinned;
        if (!locked) {
          poolCursor[pool] = (cursor + i + 1) % size;
          return index;
        }
      }
      poolCursor[pool] = (cursor + 1) % size; // todo esta fijo: se reemplaza el mas viejo
      return from + (cursor % size);
    }

    function wallSideHasCards(side) {
      const from = side < 0 ? 0 : WALL_PER;
      for (let i = from; i < from + WALL_PER; i += 1) if (wallCards[i] && wallCards[i].mesh.visible) return true;
      return false;
    }

    function spawnCard(block) {
      const n = pickWallSlot(block);
      wallCount += 1;
      const side = n < WALL_PER ? -1 : 1; // -1 = pared izquierda, 1 = derecha
      const k = n % WALL_PER;
      const row = WALL_ROW_ORDER[Math.floor(k / WALL_COLS)];
      const col = k % WALL_COLS;
      // se llena como se lee: de izquierda a derecha, de arriba hacia abajo (visto desde el personaje)
      const z = side < 0 ? 6.2 - col * WALL_CELL : -18.6 + col * WALL_CELL;
      const y = WALL_Y0 + row * WALL_CELL;
      const card = wallCards[n] || (wallCards[n] = makeCard(side));
      card.block = block;
      drawCard(card, block);
      card.mesh.position.set(side * WALL_X, y, z);
      card.ring.position.set(side * (WALL_X - 0.05), y, z);
      card.mesh.scale.set(0.001, 0.001, 1);
      card.mesh.visible = true;
      card.ring.visible = true;
      card.t = 0;
      card.settled = false;
      lastWallSide = side;
      // el personaje mira como aparece (si no esta ocupado con otra cosa)
      const aim = gazeAt(side * WALL_X, y, (z - 6) / 2);
      wallWatch = { yaw: aim.yaw, pitch: aim.pitch * 0.9, until: clock.time + 2.8 };
    }

    function startTeleport(block) {
      block.teleporting = true;
      block.tele = 0;
      spawnCard(block);
    }

    // lo que sale de la lista antes de teletransportarse se manda a la pared de inmediato: nada se pierde
    function releaseBlock(block) {
      if (block.job && !block.teleporting && !block.teleported) {
        block.teleported = true;
        if (block.tear) return; // la foto que iba a rasgarse simplemente no llega a la pared
        if (block.kiss) block.kissed = true;
        spawnCard(block);
      }
    }

    // ---------------------------------------------------------------- acciones del personaje con la foto: besarla o rasgarla
    // Las dos comparten la foto que sostiene con las manos.
    //  - Beso: se la acerca a la cara, la besa (marca de labial rojo) y 1,3 s despues del beso se teletransporta a la pared.
    //  - Rasgar: la toma y la rompe a la mitad; las mitades se sueltan y caen (no van a la pared).
    const ACTION = {
      delay: 1.0, // despues de que termina de imprimirse
      lift: 1.1,
      kiss: { approach: 0.75, hold: 0.5, retreat: 0.6, afterKiss: 1.3, release: 0.3 },
      tear: { grab: 0.45, rip: 0.9, hold: 0.5, drop: 0.85 },
    };
    const held = makeCard(-1); // la foto que sostiene en las manos
    held.mesh.material.side = THREE.DoubleSide;
    held.mesh.material.emissiveIntensity = 0.3;
    held.mesh.rotation.set(0, 0, 0);
    held.mesh.renderOrder = 5;
    held.mesh.frustumCulled = false;
    const actionStart = new THREE.Vector3(0, BASE_H + 0.25, 0.9);
    const actionFlatQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const tmpAction = new THREE.Vector3();
    const tmpActionQuat = new THREE.Quaternion();
    const smooth = (x) => x * x * (3 - 2 * x);
    let action = null; // { type, block, t, ... }

    // la foto rasgada: dos mitades con el borde del rasgon irregular y una orilla blanca de fibras de papel
    const tearGroup = new THREE.Group();
    tearGroup.visible = false;
    scene.add(tearGroup);
    const tearMaterial = new THREE.MeshStandardMaterial({ map: held.texture, emissiveMap: held.texture, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.9, side: THREE.DoubleSide, transparent: true });
    const fiberMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.4, side: THREE.DoubleSide, transparent: true });
    const tearHalves = [];

    function buildTear(width, height, seed) {
      for (const half of tearHalves) {
        tearGroup.remove(half.group);
        half.mesh.geometry.dispose();
        half.fiber.geometry.dispose();
      }
      tearHalves.length = 0;
      const random = seededRandom(seed);
      const segments = 16;
      const xs = [];
      const ys = [];
      for (let k = 0; k <= segments; k += 1) {
        ys.push(-height / 2 + (height * k) / segments);
        xs.push(k === 0 || k === segments ? 0 : (random() - 0.5) * width * 0.075);
      }
      for (const side of [-1, 1]) {
        const outer = (side * width) / 2;
        const shape = new THREE.Shape();
        shape.moveTo(outer, ys[0]);
        for (let k = 0; k <= segments; k += 1) shape.lineTo(xs[k], ys[k]);
        shape.lineTo(outer, ys[segments]);
        shape.closePath();
        const geometry = new THREE.ShapeGeometry(shape);
        const uv = geometry.attributes.uv;
        const position = geometry.attributes.position;
        for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (position.getX(i) + width / 2) / width, (position.getY(i) + height / 2) / height);
        // orilla de fibras blancas sobre el rasgon
        const fiberShape = new THREE.Shape();
        fiberShape.moveTo(xs[0], ys[0]);
        for (let k = 0; k <= segments; k += 1) fiberShape.lineTo(xs[k], ys[k]);
        for (let k = segments; k >= 0; k -= 1) fiberShape.lineTo(xs[k] + side * (0.08 + random() * 0.14), ys[k]);
        fiberShape.closePath();
        const fiberGeometry = new THREE.ShapeGeometry(fiberShape);
        // el pivote de cada mitad es su esquina de abajo, donde la sostiene la mano
        geometry.translate(-outer, height / 2, 0);
        fiberGeometry.translate(-outer, height / 2, 0);
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(geometry, tearMaterial);
        const fiber = new THREE.Mesh(fiberGeometry, fiberMaterial);
        fiber.position.z = 0.012;
        mesh.frustumCulled = false;
        fiber.frustumCulled = false;
        group.add(mesh, fiber);
        group.position.set(outer, -height / 2, 0);
        tearGroup.add(group);
        tearHalves.push({ side, outer, group, mesh, fiber });
      }
    }

    // corazoncitos que suben frente a la camara despues del beso
    const heartCanvas = document.createElement('canvas');
    heartCanvas.width = 96;
    heartCanvas.height = 96;
    {
      const g = heartCanvas.getContext('2d');
      g.fillStyle = '#ff4d85';
      g.shadowColor = 'rgba(255,60,120,0.7)';
      g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(48, 82);
      g.bezierCurveTo(8, 52, 14, 14, 48, 34);
      g.bezierCurveTo(82, 14, 88, 52, 48, 82);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.ellipse(32, 36, 7, 4, -0.6, 0, Math.PI * 2);
      g.fill();
    }
    const heartTexture = canvasTexture(heartCanvas);
    const hearts = [];
    for (let i = 0; i < 12; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false }));
      sprite.visible = false;
      sprite.renderOrder = 20;
      scene.add(sprite);
      hearts.push({ sprite, life: 0, x: 0, y: 0, vx: 0, vy: 0, size: 1 });
    }
    const tmpHeart = new THREE.Vector3();

    function spawnHearts() {
      hearts.forEach((heart) => {
        heart.life = 1.3 + Math.random() * 0.7;
        heart.x = (Math.random() - 0.5) * 3.4;
        heart.y = -0.8 + Math.random() * 1.2;
        heart.vx = (Math.random() - 0.5) * 0.9;
        heart.vy = 1.1 + Math.random() * 1.4;
        heart.size = 0.55 + Math.random() * 0.7;
        heart.sprite.visible = true;
      });
    }

    function updateHearts(dt) {
      for (const heart of hearts) {
        if (heart.life <= 0) continue;
        heart.life -= dt;
        if (heart.life <= 0) {
          heart.sprite.visible = false;
          continue;
        }
        heart.x += heart.vx * dt;
        heart.y += heart.vy * dt;
        tmpHeart.set(heart.x, heart.y, -4.5);
        camera.localToWorld(tmpHeart);
        heart.sprite.position.copy(tmpHeart);
        heart.sprite.scale.set(heart.size, heart.size, 1);
        heart.sprite.material.opacity = Math.min(1, heart.life / 0.5);
      }
    }

    function startAction(block) {
      block.kissStarted = true;
      block.teleporting = true; // la hoja la suelta (se desvanece) mientras el personaje la levanta
      block.tele = 0;
      action = { type: block.tear ? 'tear' : 'kiss', block, t: 0, marked: false, markT: 99, ripped: false, sent: false };
      drawCard(held, block, 512, 0);
      held.mesh.visible = true;
      tearGroup.visible = false;
      tearMaterial.opacity = 1;
      fiberMaterial.opacity = 1;
    }

    function endAction() {
      held.mesh.visible = false;
      tearGroup.visible = false;
      kissState.hold = 0;
      action = null;
    }

    // coloca la foto (entera) en la mano: vuela desde el escritorio hasta quedar frente a la camara
    function placeHeld(object, lift, cx, cy, distance, flying) {
      tmpAction.set(cx, cy, -distance);
      camera.localToWorld(tmpAction);
      tmpActionQuat.copy(camera.quaternion);
      if (flying) {
        object.position.lerpVectors(actionStart, tmpAction, lift);
        object.quaternion.slerpQuaternions(actionFlatQuat, tmpActionQuat, lift);
      } else {
        object.position.copy(tmpAction);
        object.quaternion.copy(tmpActionQuat);
      }
    }

    function updateAction(dt) {
      if (!action) {
        kissState.hold = 0;
        return;
      }
      action.t += dt;
      const t = action.t;
      const tLift = ACTION.lift;
      const width = held.w * 1.15;
      const height = held.h * 1.15;
      const lift = t < tLift ? smooth(t / tLift) : 1;
      const holdIn = t < tLift ? smooth(Math.min(1, t / (tLift * 0.8))) : 1;

      if (action.type === 'kiss') {
        const K = ACTION.kiss;
        const tApproach = tLift + K.approach;
        const tHold = tApproach + K.hold;
        const tRetreat = tHold + K.retreat;
        const tKiss = tApproach + 0.12;
        const tTeleport = tKiss + K.afterKiss; // 1,3 s despues del beso la foto se teletransporta a la pared
        const tEnd = tTeleport + K.release;
        let approach = 0;
        let release = 0;
        if (t >= tLift && t < tApproach) approach = smooth((t - tLift) / K.approach);
        else if (t >= tApproach && t < tHold) approach = 1;
        else if (t >= tHold && t < tRetreat) approach = 1 - smooth((t - tHold) / K.retreat);
        if (t >= tTeleport) release = smooth(Math.min(1, (t - tTeleport) / K.release));

        // el beso: suena, aparece la marca y suben corazones
        if (!action.marked && t >= tKiss) {
          action.marked = true;
          action.markT = 0;
          action.block.kissed = true;
          container.dispatchEvent(new CustomEvent('pp-kiss'));
          spawnHearts();
        }
        if (action.markT < 0.5) {
          action.markT += dt;
          drawCard(held, action.block, 512, Math.min(1, action.markT / 0.28));
        }
        // se va a la pared (con su beso) exactamente 1,3 s despues
        if (!action.sent && t >= tTeleport) {
          action.sent = true;
          action.block.kissed = true;
          spawnCard(action.block);
        }

        const distance = 9 + (1.7 - 9) * approach;
        // al acercarla, el punto del beso (un poco abajo a la derecha del centro) queda en el centro de la vista
        const cx = -0.06 * width * approach;
        const cy = 0.5 + (0.06 * height - 0.5) * approach;
        placeHeld(held.mesh, lift, cx, cy, distance, t < tLift);
        if (t >= tLift) held.mesh.rotateZ(Math.sin(clock.time * 2.1) * 0.025 * (1 - approach));
        const scale = 1 - release * 0.75;
        held.mesh.scale.set(width * scale, height * scale, 1);
        held.mesh.visible = release < 0.999;

        kissState.D = distance;
        kissState.cx = cx;
        kissState.cy = cy;
        kissState.halfW = (width * scale) / 2;
        kissState.halfH = (height * scale) / 2;
        kissState.hold = t < tLift ? holdIn : 1 - release;
        if (t >= tEnd) endAction();
        return;
      }

      // rasgar
      const T = ACTION.tear;
      const tRip = tLift + T.grab;
      const tAfter = tRip + T.rip;
      const tDrop = tAfter + T.hold;
      const tEnd = tDrop + T.drop;
      let sep = 0;
      let drop = 0;
      if (t >= tRip) sep = smooth(Math.min(1, (t - tRip) / T.rip)) * 2.5;
      if (t >= tDrop) drop = Math.min(1, (t - tDrop) / T.drop);

      if (!action.ripped && t >= tRip + 0.06) {
        // aqui se rompe: se cambia la foto entera por sus dos mitades
        action.ripped = true;
        buildTear(width, height, Looks.hashText(action.block.job ? action.block.job.nickname : 'x'));
        held.mesh.visible = false;
        tearGroup.visible = true;
        container.dispatchEvent(new CustomEvent('pp-tear'));
      }
      if (!action.ripped) {
        placeHeld(held.mesh, lift, 0, 0.5, 9, t < tLift);
        // aprieta con las manos antes de romperla
        if (t >= tLift) held.mesh.rotateZ(Math.sin(clock.time * 40) * 0.006);
        held.mesh.scale.set(width, height, 1);
      } else {
        placeHeld(tearGroup, 1, 0, 0.5, 9, false);
        const tilt = (sep / 2.5) * 0.4;
        const fall = drop * drop * 9;
        tearMaterial.opacity = 1 - smooth(Math.min(1, drop * 1.15));
        fiberMaterial.opacity = tearMaterial.opacity;
        for (const half of tearHalves) {
          half.group.position.set(half.outer + half.side * sep, -height / 2 - fall, 0);
          half.group.rotation.z = -half.side * (tilt + drop * 0.9) + (drop > 0 ? half.side * drop * 0.2 : 0);
        }
      }

      kissState.D = 9;
      kissState.cx = 0;
      kissState.cy = 0.5;
      kissState.halfW = width / 2 + sep;
      kissState.halfH = height / 2;
      const letGo = t >= tDrop ? smooth(Math.min(1, (t - tDrop) / 0.4)) : 0;
      kissState.hold = t < tLift ? holdIn : 1 - letGo;
      if (t >= tEnd) endAction();
    }

    function updateWallCards(dt) {
      for (const card of wallCards) {
        if (!card || card.settled) continue;
        card.t += dt;
        const pop = Math.min(1, card.t / 0.7);
        const x = pop - 1;
        const back = 1 + 2.70158 * x * x * x + 1.70158 * x * x;
        const scale = Math.max(0.001, back);
        card.mesh.scale.set(card.w * scale, card.h * scale, 1);
        const flash = Math.max(0, 1 - card.t / 0.9);
        card.material.emissiveIntensity = 0.18 + flash * 2.4;
        const ringT = card.t / 0.9;
        if (ringT < 1) {
          const ringScale = 0.5 + ringT * 1.5;
          card.ring.scale.set(card.w * ringScale * 1.3, card.h * ringScale * 1.3, 1);
          card.ring.material.opacity = 1 - ringT;
        } else {
          card.ring.visible = false;
        }
        if (card.t > 1.3) {
          card.settled = true;
          card.mesh.scale.set(card.w, card.h, 1);
          card.material.emissiveIntensity = 0.18;
        }
      }
    }

    function clearWall() {
      for (const card of wallCards) {
        if (!card) continue;
        card.mesh.visible = false;
        card.ring.visible = false;
        card.block = null;
        card.settled = true;
      }
      wallCount = 0;
      poolCursor.all = 0;
      poolCursor.left = 0;
      poolCursor.right = 0;
      wallWatch = null;
    }

    // ---------------------------------------------------------------- pantallita de la impresora (LCD)
    const display = { state: 'LISTA', name: 'Esperando regalos', busy: false };

    function drawLcd() {
      const g = lcdCanvas.getContext('2d');
      const bgGradient = g.createLinearGradient(0, 0, 0, lcdCanvas.height);
      bgGradient.addColorStop(0, '#0a1b12');
      bgGradient.addColorStop(1, '#0e2a1a');
      g.fillStyle = bgGradient;
      g.fillRect(0, 0, lcdCanvas.width, lcdCanvas.height);
      g.fillStyle = '#7dffb0';
      g.shadowColor = 'rgba(125,255,176,0.8)';
      g.shadowBlur = 10;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.font = '800 40px ui-monospace, Consolas, monospace';
      // los estados cortos se escriben con letras separadas; los largos, normales para que quepan
      const stateText = display.state.length <= 7 ? display.state.split('').join(' ') : display.state;
      g.fillText(stateText, 20, 50);
      g.font = '500 28px ui-monospace, Consolas, monospace';
      g.globalAlpha = 0.85;
      g.fillText(fitText(g, display.name, lcdCanvas.width - 40), 20, 104);
      g.globalAlpha = 1;
      g.shadowColor = 'transparent';
      lcdTexture.needsUpdate = true;
    }
    drawLcd();
    drawMonitor();
    drawClock();

    // ---------------------------------------------------------------- la camara es la cabeza del personaje
    // Hacia donde mira: yaw (+ = izquierda), pitch (+ = arriba). El personaje no se mueve: solo gira la cabeza.
    const GAZE = {
      bed: { yaw: 0, pitch: -0.52 },
      front: { yaw: 0, pitch: -0.62 },
      monitor: { yaw: 0.78, pitch: -0.34 },
      shelf: { yaw: 0.46, pitch: 0.08 },
      lamp: { yaw: -0.64, pitch: -0.04 },
      clock: { yaw: -0.42, pitch: 0.2 },
    };
    const IDLE_PLACES = ['bed', 'monitor', 'bed', 'wall', 'front', 'shelf', 'bed', 'wall', 'lamp', 'clock'];
    const gaze = { yaw: 0, pitch: -0.52 };
    const gazeTarget = { yaw: 0, pitch: -0.52 };
    let idleIndex = 0;
    let nextGazeAt = 2;

    // La camara empieza MANUAL: no se mueve sola. El streamer arrastra con el mouse (o el dedo) para girar la cabeza del personaje;
    // doble clic vuelve a la vista de inicio. La tecla C (o el boton del escenario) activa o desactiva la camara automatica.
    const MAX_YAW = 1.55;
    const MIN_PITCH = -1.15;
    const MAX_PITCH = 0.95;
    const view = { manual: true, touched: false, dragging: false, pointerId: null, lastX: 0, lastY: 0, moved: 0 };

    function setManual(on) {
      if (view.manual === on) return;
      view.manual = on;
      canvasEl.classList.toggle('is-manual', on);
      if (on) {
        gazeTarget.yaw = gaze.yaw;
        gazeTarget.pitch = gaze.pitch;
      } else {
        nextGazeAt = 0;
      }
      container.dispatchEvent(new CustomEvent('pp-camera-mode', { detail: { manual: on } }));
    }

    function homeCamera() {
      setManual(true);
      view.touched = false;
      gazeTarget.yaw = 0;
      gazeTarget.pitch = GAZE.bed.pitch;
    }

    canvasEl.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      view.dragging = true;
      view.pointerId = event.pointerId;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      view.moved = 0;
      try {
        canvasEl.setPointerCapture(event.pointerId);
      } catch (error) {
        // sin captura el arrastre sigue funcionando mientras el puntero este sobre el escenario
      }
      canvasEl.classList.add('is-dragging');
    });
    canvasEl.addEventListener('pointermove', (event) => {
      if (!view.dragging || event.pointerId !== view.pointerId) return;
      const dx = event.clientX - view.lastX;
      const dy = event.clientY - view.lastY;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      view.moved += Math.abs(dx) + Math.abs(dy);
      if (view.moved < 3) return;
      if (!view.manual) setManual(true);
      view.touched = true;
      // sensibilidad proporcional al angulo de vision: con mas zoom el giro es mas fino
      const sensitivity = 0.0042 * (camera.fov / 55);
      gazeTarget.yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, gazeTarget.yaw - dx * sensitivity));
      gazeTarget.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, gazeTarget.pitch - dy * sensitivity));
    });
    const endDrag = (event) => {
      if (event.pointerId !== view.pointerId) return;
      view.dragging = false;
      view.pointerId = null;
      canvasEl.classList.remove('is-dragging');
    };
    canvasEl.addEventListener('pointerup', endDrag);
    canvasEl.addEventListener('pointercancel', endDrag);
    canvasEl.addEventListener('lostpointercapture', endDrag);
    canvasEl.addEventListener('dblclick', homeCamera);

    let eyeBack = 0; // cuanto echa la cabeza hacia atras el personaje (segun la forma de la pantalla)
    let baseFov = 55;
    let zoomAmount = 0; // 0..1: acercamiento de la camara mientras se imprime una foto con "zoom"

    function resize() {
      const width = Math.max(2, container.clientWidth);
      const height = Math.max(2, container.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.aspect = aspect;
      handSpread = Math.min(1, Math.max(0.84, aspect / 1.5));
      // en pantallas angostas (vertical) se abre el angulo y, si hace falta, el personaje echa la cabeza hacia atras para que
      // la impresora entera quepa a lo ancho
      const horizontal = (50 * Math.PI) / 180;
      const vertical = 2 * Math.atan(Math.tan(horizontal / 2) / aspect);
      camera.fov = Math.min(100, Math.max(55, (vertical * 180) / Math.PI));
      baseFov = camera.fov;
      camera.updateProjectionMatrix();
      const halfHorizontal = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect);
      const neededZ = BED_FRONT_Z + 5.2 / Math.tan(halfHorizontal);
      eyeBack = Math.min(14, Math.max(0, neededZ - EYE.z));
      // la mirada hacia la bandeja se ajusta a donde queda la cabeza
      GAZE.bed.pitch = -Math.atan((EYE.y + eyeBack * 0.85 - (BASE_H + 0.4)) / (EYE.z + eyeBack + 0.6)) - 0.1;
      GAZE.front.pitch = GAZE.bed.pitch - 0.12;
      if (view.manual && !view.touched) {
        gazeTarget.yaw = 0;
        gazeTarget.pitch = GAZE.bed.pitch;
      }
      dirty = true;
    }

    if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(container);
    else window.addEventListener('resize', resize);
    resize();
    gaze.yaw = 0;
    gaze.pitch = GAZE.bed.pitch;

    // ---------------------------------------------------------------- bucle
    const clock = { last: performance.now(), time: 0 };
    const eyePosition = new THREE.Vector3().copy(EYE);

    function tick(now) {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - clock.last) / 1000);
      clock.last = now;
      clock.time += dt;
      const time = clock.time;
      const busy = display.busy;

      // impresion en curso: la hoja sale renglon a renglon
      let progress = 0;
      if (active) {
        progress = Math.min(1, (now - active.startedAt) / active.ms);
        const total = active.block.h;
        const rows = Math.max(24, Math.round(total / LINE_FEED_PX));
        const quantized = progress >= 1 ? total : Math.floor(progress * rows) * (total / rows);
        feedTotal += quantized - active.block.printed;
        active.block.printed = quantized;
        dirty = true;
        if (progress >= 1) {
          active.block.done = true;
          active.block.doneAt = time;
          const finished = active;
          active = null;
          finishedAt = time;
          recent.unshift({ nickname: finished.block.job.nickname, giftName: finished.block.job.giftName, count: finished.block.job.count });
          recent.length = Math.min(recent.length, 8);
          drawMonitor();
          finished.resolve();
        }
      }
      // la tinta fresca se seca y toma su color
      for (const block of blocks) {
        if (block.done && block.dry < 1) {
          block.dry = Math.min(1, block.dry + dt / DRY_SECONDS);
          dirty = true;
        }
      }
      // una foto lista se queda un momento en la hoja y luego se teletransporta a la pared
      for (const block of blocks) {
        if (!block.job) continue;
        if (block.kiss || block.tear) {
          if (block.done && !block.kissStarted && !block.teleported && !action && time - block.doneAt > ACTION.delay) startAction(block);
        } else if (block.done && !block.teleporting && !block.teleported && time - block.doneAt > TELEPORT_DELAY) {
          startTeleport(block);
        }
        if (block.teleporting) {
          block.tele = Math.min(1, block.tele + dt / 0.8);
          dirty = true;
          if (block.tele >= 1) {
            block.teleporting = false;
            block.teleported = true;
          }
        }
      }
      updateWallCards(dt);
      if (dirty) {
        dirty = false;
        compose();
      }
      drawClock();

      // la impresora (y la hoja) vibran suavemente mientras trabajan
      const jitterX = busy ? Math.sin(time * 61) * 0.004 : 0;
      const jitterY = busy ? Math.abs(Math.sin(time * 47)) * 0.0035 : 0;
      printer.position.set(jitterX, jitterY, 0);
      paper.position.set(jitterX, jitterY, 0);

      // cabezal: barre la hoja de lado a lado mientras imprime; en reposo se queda estacionado a un costado
      const sweep = PAPER_W / 2 - 0.6;
      const headTarget = busy ? Math.sin(time * 8.5) * sweep : -(PAPER_W / 2 + 0.55);
      head.position.x += (headTarget - head.position.x) * (1 - Math.exp(-(busy ? 30 : 3.5) * dt));
      head.position.y = 3.55 + (busy ? Math.sin(time * 70) * 0.006 : 0);
      headLight.intensity = busy ? 16 : 5;
      headLed.material.color.set(busy ? 0xb7e1ff : 0x6cc4ff);
      printGlow.position.x = head.position.x;
      printGlow.material.opacity = busy ? 0.55 + Math.sin(time * 40) * 0.15 : 0;
      ledBusyMaterial.emissiveIntensity = busy ? (Math.sin(time * 16) > 0 ? 2.4 : 0.1) : 0;


      // a donde mira el personaje: sigue la impresion (de la ranura hacia arriba, conforme sube la foto); al terminar mira lo impreso;
      // y sin trabajo mira la oficina
      if (view.manual) {
        // el streamer manda: la camara no se mueve sola
        nextGazeAt = time + 4;
      } else if (active) {
        // sigue el cabezal con la mirada
        gazeTarget.yaw = -head.position.x * 0.012 + Math.sin(time * 0.7) * 0.02;
        gazeTarget.pitch = GAZE.bed.pitch + Math.sin(time * 0.5) * 0.015;
        nextGazeAt = time + 1.8;
      } else if (wallWatch && time < wallWatch.until) {
        // una foto acaba de teletransportarse a la pared: se queda mirandola un momento
        gazeTarget.yaw = wallWatch.yaw;
        gazeTarget.pitch = wallWatch.pitch;
        nextGazeAt = Math.max(nextGazeAt, wallWatch.until + 0.4);
      } else if (time - finishedAt < 2.2) {
        // al terminar mira la foto que salio hacia el borde frontal
        Object.assign(gazeTarget, GAZE.front);
        nextGazeAt = Math.max(nextGazeAt, finishedAt + 2.2);
      } else if (time > nextGazeAt) {
        const place = IDLE_PLACES[idleIndex % IDLE_PLACES.length];
        idleIndex += 1;
        const wallSides = place === 'wall' ? [-1, 1].filter(wallSideHasCards) : [];
        if (wallSides.length > 0) {
          // mira la pared que se esta llenando (si las dos tienen fotos, alterna)
          const side = wallSides[wallToggle % wallSides.length];
          wallToggle += 1;
          Object.assign(gazeTarget, gazeAt(side * WALL_X, 10, -6));
        } else {
          Object.assign(gazeTarget, place === 'wall' ? GAZE.bed : GAZE[place]);
        }
        nextGazeAt = time + 3.2 + Math.random() * 2.8;
      }
      const follow = 1 - Math.exp(-(view.manual ? 14 : active ? 3.4 : 1.7) * dt);
      gaze.yaw += (gazeTarget.yaw - gaze.yaw) * follow;
      gaze.pitch += (gazeTarget.pitch - gaze.pitch) * follow;

      // estilos con "zoom": la camara se acerca mientras se imprime esa foto
      const zoomWanted = active && active.zoom ? 1 : 0;
      zoomAmount += (zoomWanted - zoomAmount) * (1 - Math.exp(-3 * dt));
      const fovNow = baseFov * (1 - 0.32 * zoomAmount);
      if (Math.abs(camera.fov - fovNow) > 0.01) {
        camera.fov = fovNow;
        camera.updateProjectionMatrix();
      }

      // la cabeza respira y se balancea muy poco
      eyePosition.set(EYE.x, EYE.y + eyeBack * 0.85, EYE.z + eyeBack);
      camera.position.set(
        eyePosition.x + Math.sin(time * 0.31) * 0.12,
        eyePosition.y + Math.sin(time * 1.5) * 0.04 + Math.sin(time * 0.53) * 0.05,
        eyePosition.z + Math.sin(time * 0.23) * 0.1,
      );
      camera.rotation.set(gaze.pitch + Math.sin(time * 0.9) * 0.004, gaze.yaw + Math.sin(time * 0.37) * 0.006, Math.sin(time * 0.29) * 0.004);

      camera.updateMatrixWorld(true);
      updateAction(dt);
      updateHearts(dt);
      updateHands(time, busy, eyePosition);

      renderer.render(scene, camera);
    }

    intro = renderIntro();

    // ---------------------------------------------------------------- API
    const api = {
      canvas: canvasEl,

      setTheme(next) {
        Object.assign(settings, {
          paper: THEMES[next.paper] ? next.paper : settings.paper,
          shape: next.shape || settings.shape,
          showName: next.showName === undefined ? settings.showName : Boolean(next.showName),
          showGift: next.showGift === undefined ? settings.showGift : Boolean(next.showGift),
          vipWall: next.vipWall === undefined ? settings.vipWall : Boolean(next.vipWall),
        });
        rebuildBlocks();
      },

      setDisplay(state, name, busy) {
        display.state = String(state || '');
        display.name = String(name || '');
        display.busy = Boolean(busy);
        drawLcd();
      },

      setEmptyHint(text) {
        introHint = String(text || '');
        intro = renderIntro();
        dirty = true;
      },

      hasPrints() {
        return blocks.length > 0;
      },

      // el que mas monedas ha mandado sale en la pantalla del escritorio ({ nickname, coins, img } o null)
      setTopDonor(info) {
        topDonor = info && info.nickname ? { nickname: String(info.nickname), coins: Number(info.coins) || 0, img: info.img || null } : null;
        drawMonitor();
      },

      isManual() {
        return view.manual;
      },

      // tecla C: camara manual (como la dejes con el mouse) <-> automatica (sigue la impresion y mira la oficina)
      toggleCamera() {
        setManual(!view.manual);
      },

      // vuelve a la vista de inicio (en manual)
      homeCamera,

      // Imprime una foto: dura `ms` y se resuelve cuando ya salio entera por la ranura
      print(job, img, giftImg, ms) {
        return new Promise((resolve) => {
          const block = renderBlock(job, img, giftImg || null);
          blocks.push(block);
          while (blocks.length > MAX_BLOCKS) releaseBlock(blocks.shift());
          active = { block, ms: Math.max(300, ms), startedAt: performance.now(), resolve, zoom: Boolean(job.style && job.style.zoom) };
          dirty = true;
        });
      },

      clear() {
        if (active) {
          const pending = active;
          active = null;
          pending.resolve();
        }
        blocks.length = 0;
        endAction();
        clearWall();
        recent.length = 0;
        feedTotal = 0;
        intro = renderIntro();
        drawMonitor();
        dirty = true;
      },
    };

    // el entorno ilumina de mas si se deja a toda su intensidad: se baja un poco en todo lo que lo usa
    scene.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material && 'envMapIntensity' in material) material.envMapIntensity = material.isMeshPhysicalMaterial ? 0.85 : 0.6;
    });

    requestAnimationFrame(tick);
    return api;
  }

  window.PhotoPrinter3D = { create };
})();
