import * as THREE from 'three';
import { Batch, basic, label, rng } from '../art';
import { streetHeight } from '../site';
import { point, local, rectCollider, rectFloor, stairFloor, type Interior, type InteractiveTarget, type Collider, type WalkSurface, type Frame } from './types';

/** Original geometry; photographed topology, inferred dimensions. See references/SUPPLEMENT_NINTENDO.md. */
export function buildNintendoInterior(): Interior {
  const frame: Frame = { x: -85, z: 32, y: streetHeight(-85, 32) + .12, yaw: Math.PI / 2 };
  const group = new THREE.Group(); group.name = 'Nintendo SAN FRANCISCO · ground and lower sales floors';
  group.position.set(frame.x, frame.y, frame.z); group.rotation.y = frame.yaw;
  const batch = new Batch(), colliders: Collider[] = [], targets: InteractiveTarget[] = [];
  const white = basic(0xf1f0e9, .36), edge = basic(0xd9dcd9, .42), red = basic(0xc70919, .26);
  const black = basic(0x17202a, .36), metal = basic(0x9ba6a9, .22, .78), brass = basic(0xb4964d, .26, .7);
  const stone = basic(0xb6b2a3, .84), charcoal = basic(0x272a2d, .55), burgundy = basic(0x733d3e, .64);
  const glowing = new THREE.MeshStandardMaterial({ color: 0xffece0, emissive: 0xfff0dc, emissiveIntensity: 2.2, roughness: .42 });
  const redGlow = new THREE.MeshStandardMaterial({ color: 0xd7081b, emissive: 0xff1830, emissiveIntensity: .9, roughness: .3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xe9f3f5, roughness: .15, metalness: .08, transparent: true, opacity: .18, side: THREE.DoubleSide, depthWrite: false });
  const colors = [0xd8202f, 0x4b80b8, 0xe0b43b, 0x64a779, 0xc5b4d2, 0xe5ded0, 0x293d50].map(c => basic(c, .56));
  const random = rng('Nintendo 2025 merchandise original');
  const woodCanvas = document.createElement('canvas'); woodCanvas.width = woodCanvas.height = 1024;
  const wc = woodCanvas.getContext('2d')!; wc.fillStyle = '#bba786'; wc.fillRect(0, 0, 1024, 1024);
  wc.save(); wc.translate(512, 512); wc.rotate(Math.PI / 4);
  // Interlocking parquet: perpendicular planks share a repeating diagonal spine.
  const unit = 40, length = 160;
  for (let a = -11; a < 12; a++) for (let b = -14; b < 15; b++) {
    const x = a * length - b * unit, y = a * length + b * unit;
    for (let direction = 0; direction < 2; direction++) {
      wc.save(); wc.translate(x + (direction ? length : 0), y); if (direction) wc.rotate(Math.PI / 2);
      const tone = Math.round(random() * 14); wc.fillStyle = `rgb(${197 + tone},${176 + tone},${143 + tone})`; wc.fillRect(1, 1, length - 2, unit - 2);
      for (let k = 0; k < 11; k++) { wc.strokeStyle = `rgba(92,70,43,${.035 + random() * .055})`; wc.beginPath(); const py = 3 + random() * (unit - 6); wc.moveTo(3, py); wc.bezierCurveTo(45, py - 1, 90, py + 2, length - 3, py); wc.stroke(); }
      wc.restore();
    }
  }
  wc.restore();
  const floorTex = new THREE.CanvasTexture(woodCanvas); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.anisotropy = 8;
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: .009, roughness: .51 });
  floorMat.name = 'Original light oak herringbone';
  const ellipse = { x: 0, z: -10.8, rx: 3.5, rz: 5.2 };
  function withinVoid(x: number, z: number) { return x * x / (ellipse.rx * ellipse.rx) + (z - ellipse.z) ** 2 / (ellipse.rz * ellipse.rz) < 1; }
  function floorGeometry(y: number, hole: boolean) {
    const shape = new THREE.Shape(); shape.moveTo(-12, 0); shape.lineTo(12, 0); shape.lineTo(12, 22); shape.lineTo(-12, 22); shape.closePath();
    if (hole) { const h = new THREE.Path(); h.absellipse(0, 10.8, 3.5, 5.2, 0, Math.PI * 2, true); shape.holes.push(h); }
    const g = new THREE.ShapeGeometry(shape, 56); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6, uv.getY(i) / 6);
    batch.add(g, floorMat, [0, y, 0]);
    if (hole) { const soffit = g.clone(), index = soffit.index!; for (let i = 0; i < index.count; i += 3) { const a = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, a); } soffit.computeVertexNormals(); batch.add(soffit, white, [0, y - .24, 0]); }
  }
  floorGeometry(0, true); floorGeometry(-3.6, false);
  batch.box(floorMat, 0, -.10, -6.2, 2.7, .20, 1.2);
  // Full enclosing shell, with the public entrance kept open and no artificial upper storey.
  batch.box(white, 0, -.1, -22.08, 24.16, 7.2, .16);
  batch.box(white, -12.08, -.1, -11, .16, 7.2, 22); batch.box(white, 12.08, -.1, -11, .16, 7.2, 22);
  batch.box(white, 0, -1.9, .10, 24, 3.4, .20);
  batch.box(white, 0, 3.87, -11, 24.16, .18, 22.16);
  function collision(name: string, x: number, z: number, w: number, d: number, bottom: number, top: number) { colliders.push(rectCollider(frame, `Nintendo: ${name}`, x, z, w, d, bottom, top)); }
  collision('rear wall', 0, -22.08, 24.16, .2, -3.8, 4.1); collision('south side wall', -12.08, -11, .2, 22, -3.8, 4.1); collision('north side wall', 12.08, -11, .2, 22, -3.8, 4.1);
  collision('basement front wall', 0, .1, 24, .22, -3.8, -.1);
  // Matching Powell frontage. Pane mullions are physical; the doorway remains 3 m wide.
  for (const side of [-1, 1]) {
    const center = side * 6.75;
    batch.box(stone, center, .43, .055, 10.5, .86, .24); batch.box(glass, center, 1.98, .035, 10.35, 2.18, .025);
    batch.box(stone, center, 3.45, .03, 10.5, .7, .28); batch.box(brass, center, .88, .08, 10.38, .07, .10); batch.box(brass, center, 3.05, .08, 10.38, .07, .10);
    for (let i = 0; i < 4; i++) { const x = side * (1.60 + i * 3.43); batch.box(brass, x, 1.98, .075, .065, 2.24, .09); }
    batch.box(burgundy, center, 3.27, .47, 10.4, .16, .85); batch.box(charcoal, center, 3.17, .67, 10.4, .12, .14);
    collision('Powell display glazing', center, .06, 10.5, .25, -.1, 3.8);
    // Window sill display bases retain depth without using imported character decals.
    batch.box(red, side * 6.9, .93, -.46, 8.8, .12, .6);
  }
  for (const x of [-1.58, 1.58]) { batch.box(charcoal, x, 1.83, .13, .20, 3.66, .35); batch.box(brass, x - Math.sign(x) * .12, 1.48, .055, .065, 2.93, .08); }
  batch.box(charcoal, 0, 3.38, .12, 3.36, .86, .34); batch.box(redGlow, 0, 3.43, .31, 3.02, .64, .06);
  const frontSign = label('Nintendo', 2.48, .46, '#c80e1c', '#ffffff', 155); frontSign.position.set(0, 3.43, .349); group.add(frontSign);
  const door = new THREE.Group(); door.name = 'Nintendo Powell door leaves';
  for (const side of [-1, 1]) {
    const panel = new THREE.Group(); panel.position.set(side * .76, 0, 0);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.44, 2.79, .028), glass); pane.position.y = 1.40; panel.add(pane);
    const db = new Batch(); db.box(brass, 0, .045, 0, 1.48, .09, .065); db.box(brass, 0, 2.80, 0, 1.48, .07, .065);
    for (const x of [-.73, .73]) db.box(brass, x, 1.42, 0, .05, 2.78, .06);
    db.rod(brass, new THREE.Vector3(-side * .55, 1.05, .07), new THREE.Vector3(-side * .55, 1.80, .07), .018);
    panel.add(db.finish()); panel.userData.closedX = side * .76; panel.userData.side = side; door.add(panel);
  }
  group.add(door);
  // Sliding doors start open and can be operated through the entrance target.
  let doorOpen = true, doorSlide = 1;
  collision('doorway left jamb', -1.6, 0, .18, .34, -.1, 3.8); collision('doorway right jamb', 1.6, 0, .18, .34, -.1, 3.8);
  colliders.push({ ...rectCollider(frame, 'Nintendo: closed entrance doors', 0, 0, 3, .14, -.1, 2.84), enabled: () => doorSlide < .92 });

  // The photographed oval void and descending straight stair are distinct geometric structures.
  const stairTop = -6.8, stairBottom = -14, stairWidth = 2.6, steps = 24, tread = .3, rise = .15;
  for (let i = 0; i < steps; i++) {
    const top = -i * rise, z = stairTop - (i + .5) * tread;
    batch.box(edge, 0, top - .085, z, stairWidth, .17, tread + .002);
    batch.box(metal, 0, top + .004, z + tread / 2 - .019, stairWidth, .008, .032);
    batch.box(white, 0, top - .16, z - tread / 2, stairWidth, .17, .03);
  }
  for (const side of [-1, 1]) {
    const x = side * 1.35;
    batch.rod(metal, new THREE.Vector3(x, .96, stairTop), new THREE.Vector3(x, -2.64, stairBottom), .029);
    for (let i = 0; i <= 6; i++) { const z = stairTop + (stairBottom - stairTop) * i / 6, y = -3.6 * i / 6; batch.rod(metal, new THREE.Vector3(x, y + .05, z), new THREE.Vector3(x, y + .98, z), .019); }
    const positions = [x, .12, stairTop, x, .9, stairTop, x, -2.7, stairBottom, x, -3.48, stairBottom];
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); gg.setIndex([0, 1, 2, 0, 2, 3]); gg.computeVertexNormals(); batch.add(gg, glass);
    for (let i = 0; i < steps; i++) collision('stair balustrade', x, stairTop - (i + .5) * tread, .10, tread, -(i + 1) * rise, -i * rise + 1.0);
  }
  const railSegments = 56;
  for (let i = 0; i < railSegments; i++) {
    const a = i / railSegments * Math.PI * 2, b = (i + 1) / railSegments * Math.PI * 2;
    const p = new THREE.Vector3(3.5 * Math.cos(a), 1.06, -10.8 + 5.2 * Math.sin(a));
    const q = new THREE.Vector3(3.5 * Math.cos(b), 1.06, -10.8 + 5.2 * Math.sin(b));
    // Leave an open throat at the stair landing, never rail across the intended route.
    if (p.z > -6.8 && q.z > -6.8 && Math.abs((p.x + q.x) / 2) < 1.6) continue;
    batch.rod(metal, p, q, .025);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([p.x, .12, p.z, q.x, .12, q.z, q.x, 1.02, q.z, p.x, 1.02, p.z], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); batch.add(g, glass);
    if (i % 4 === 0) batch.rod(metal, new THREE.Vector3(p.x, .02, p.z), p, .025);
    batch.rod(edge, new THREE.Vector3(p.x, -.13, p.z), new THREE.Vector3(q.x, -.13, q.z), .12);
    collision('oval upper guard', (p.x + q.x) / 2, (p.z + q.z) / 2, Math.abs(p.x - q.x) + .075, Math.abs(p.z - q.z) + .075, -.16, 1.1);
  }
  // Oval red cove directly above the stair; light fixtures are original modeled components.
  for (const [rx, rz, y, mat, radius] of [[3.72, 5.43, 3.63, white, .20], [3.52, 5.23, 3.62, redGlow, .062], [3.88, 5.6, 3.77, glowing, .035]] as const) {
    const pts = Array.from({ length: 65 }, (_, i) => new THREE.Vector3(rx * Math.cos(i / 64 * Math.PI * 2), y, -10.8 + rz * Math.sin(i / 64 * Math.PI * 2)));
    batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, radius, 8, true), mat);
  }
  for (const level of [0, -3.6]) {
    const ceiling = level === 0 ? 3.77 : -.30;
    for (const x of [-11.75, 11.75]) { batch.box(redGlow, x, ceiling - .15, -11, .07, .08, 21); batch.box(glowing, x - Math.sign(x) * .10, ceiling - .09, -11, .04, .035, 21); }
    for (const x of [-8, -4.4, 4.4, 8]) for (const z of [-3, -7, -12, -17, -20]) { if (level < 0 && withinVoid(x, z)) continue; batch.cyl(edge, x, ceiling, z, .095, .028, .095, 12); batch.cyl(glowing, x, ceiling - .018, z, .065, .01, .065, 12); }
    for (const x of [-4.4, 4.4]) for (const z of [-6, -16.6]) { batch.box(white, x, level + 1.74, z, .72, 3.48, .72); collision('structural column', x, z, .76, .76, level, level + 3.5); }
  }

  function sign(text: string, x: number, y: number, z: number, w: number, h: number, dark = false, yaw = 0) {
    const s = label(text, w, h, dark ? '#c40b1a' : '#f1f0e9', dark ? '#ffffff' : '#26313b', 90); s.position.set(x, y, z); s.rotation.y = yaw; group.add(s); return s;
  }
  function wallShelf(side: number, z: number, y: number, theme: number) {
    const x = side * 11.32, width = 3.25, yaw = -side * Math.PI / 2;
    const sb = new Batch(); sb.box(white, 0, 1.48, -.28, width, 2.95, .48);
    for (const sy of [.14, 1.06, 1.95, 2.88]) { sb.box(edge, 0, sy, .08, width, .09, .84); sb.box(glowing, 0, sy + .044, .38, width - .16, .018, .03); }
    for (const sx of [-width / 2, width / 2]) sb.box(white, sx, 1.52, .05, .10, 2.98, .82);
    // A few recognizably different retail forms: boxes, stacked fabric, bottles and hanging shirts.
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      const px = -1.3 + col * .5, py = .2 + row * .91;
      const material = colors[(theme + col + row) % colors.length];
      if (row === 2 && col % 2 === 0) { sb.cyl(material, px, py + .22, .07, .10, .40, .085, 10); sb.cyl(white, px, py + .43, .07, .065, .045, .065, 10); }
      else if (row === 1 && col % 3 === 0) { sb.box(material, px, py + .15, .08, .38, .28, .35); sb.box(white, px, py + .10, .27, .28, .055, .014); }
      else { const h = .24 + random() * .30; sb.box(material, px, py + h / 2, .08, .35, h, .32); sb.box(edge, px, py + h * .68, .246, .21, .06, .014); }
    }
    for (const [material, geometries] of sb.bins) for (const geometry of geometries) { batch.add(geometry, material, [x, y, z], [1, 1, 1], new THREE.Euler(0, yaw, 0)); geometry.dispose(); }
    collision('wall merchandise cabinet', x, z, .92, width + .12, y, y + 3.05);
  }
  for (const level of [0, -3.6]) for (const side of [-1, 1]) for (let i = 0; i < 5; i++) wallShelf(side, -3.0 - i * 3.65, level, i + (side + 1) * 2);
  // Low, rounded display islands with genuine circulation gaps and reserved Blender figure anchors.
  function island(name: string, x: number, z: number, y: number, radius: number, theme: number, anchor?: string) {
    batch.cyl(white, x, y + .36, z, radius, .72, radius, 40); batch.cyl(glowing, x, y + .055, z, radius - .045, .055, radius - .045, 40);
    batch.cyl(edge, x, y + .735, z, radius + .018, .035, radius + .018, 40);
    collision(`${name} display island`, x, z, radius * 2, radius * 2, y, y + .82);
    for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2, px = x + Math.cos(a) * (radius - .25), pz = z + Math.sin(a) * (radius - .25); batch.box(colors[(theme + j) % colors.length], px, y + .86, pz, .25, .22, .19, a); }
    if (anchor) { const slot = new THREE.Group(); slot.name = anchor; slot.position.set(x, y + .77, z); slot.userData.figureSource = 'Original Blender MCP display figure, integrated by parent'; group.add(slot); }
    sign(name, x, y + .36, z + radius + .008, radius * 1.48, .22);
  }
  island('SUPER MARIO', -7.05, -8.9, 0, 1.45, 0, 'displayMario');
  island('ANIMAL CROSSING', 7.0, -8.9, 0, 1.45, 3, 'displayAnimalCrossing');
  island('THE LEGEND OF ZELDA', -7.0, -10, -3.6, 1.55, 3, 'displayLink');
  island('PIKMIN', 7.0, -10, -3.6, 1.45, 2, 'displayPikmin');
  island('POKÉMON', -7.0, -17.8, -3.6, 1.4, 2, 'displayPikachu');
  island('SAN FRANCISCO', -6.6, -3.25, 0, 1.12, 0);
  island('DONKEY KONG', 6.6, -3.25, 0, 1.12, 2);
  // Rectangular garment racks add a second retail scale; clothes are original shaped silhouettes.
  for (const level of [0, -3.6]) for (const x of [-7, 7]) {
    const z = -13.75; batch.box(white, x, level + .10, z, 2.45, .20, 1.0);
    for (const dx of [-1.05, 1.05]) batch.cyl(metal, x + dx, level + .93, z, .023, 1.66);
    batch.rod(metal, new THREE.Vector3(x - 1.05, level + 1.77, z), new THREE.Vector3(x + 1.05, level + 1.77, z), .025);
    for (let k = 0; k < 8; k++) {
      const px = x - .88 + k * .25; const shape = new THREE.Shape(); shape.moveTo(-.17, .58); shape.lineTo(-.38, .44); shape.lineTo(-.25, .15); shape.lineTo(-.17, .23); shape.lineTo(-.17, -.38); shape.lineTo(.17, -.38); shape.lineTo(.17, .23); shape.lineTo(.25, .15); shape.lineTo(.38, .44); shape.lineTo(.17, .58); shape.lineTo(.10, .46); shape.lineTo(-.10, .46); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: .024, bevelEnabled: false }); batch.add(g, colors[k % colors.length], [px, level + 1.08, z], [1, 1, 1], new THREE.Euler(0, Math.PI / 2, 0));
    }
    collision('garment rail', x, z, 2.45, 1.0, level, level + 1.8);
  }
  // Cash wrap behind the void, with several actual terminals and a red brand wall.
  batch.box(red, 0, 1.68, -21.65, 8.0, 3.25, .35); sign('Nintendo', 0, 2.3, -21.45, 4.2, .75, true); sign('SAN FRANCISCO', 0, 1.69, -21.44, 3.8, .30, true);
  batch.box(white, 0, .52, -19.25, 7.5, 1.04, 1.18); batch.box(edge, 0, 1.08, -19.25, 7.65, .10, 1.26); batch.box(glowing, 0, .10, -18.64, 7.0, .07, .03);
  collision('checkout counter', 0, -19.25, 7.65, 1.28, 0, 1.15);
  for (const x of [-2.5, 0, 2.5]) { batch.cyl(metal, x, 1.28, -19.25, .038, .30); batch.box(black, x, 1.48, -19.22, .55, .34, .045); }

  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 1024; screenCanvas.height = 576;
  const screenContext = screenCanvas.getContext('2d')!; const screenTexture = new THREE.CanvasTexture(screenCanvas); screenTexture.colorSpace = THREE.SRGBColorSpace;
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
  let screenMode = 0, screenTick = -1, productSpinning = false, souvenir = false, figureAnimation = false, lastTime = 0;
  function drawScreen(time: number) {
    const c = screenContext; const g = c.createLinearGradient(0, 0, 0, 576); g.addColorStop(0, ['#173566', '#154741', '#4c224f'][screenMode]); g.addColorStop(1, '#091320'); c.fillStyle = g; c.fillRect(0, 0, 1024, 576);
    c.fillStyle = '#f1f4f7'; c.font = 'bold 44px Arial'; c.textAlign = 'left'; c.fillText(['PLAY · COLOR TRAIL', 'EXPLORE · LIGHT GARDEN', 'CREATE · CONSOLE COLORS'][screenMode], 52, 80);
    c.font = '22px Arial'; c.fillStyle = '#b8d4ed'; c.fillText('An original interactive store display', 54, 120);
    if (screenMode === 0) {
      for (let i = 0; i < 9; i++) { const x = 70 + i * 104, y = 330 + Math.sin(i * .72 + time * .8) * 85; c.fillStyle = ['#f15761', '#f9d86d', '#77d8c3'][i % 3]; c.beginPath(); c.arc(x, y, 29, 0, Math.PI * 2); c.fill(); c.fillStyle = '#102236'; c.fillRect(x - 13, y - 5, 7, 7); c.fillRect(x + 6, y - 5, 7, 7); }
    } else if (screenMode === 1) {
      for (let i = 0; i < 34; i++) { const x = 38 + i * 29, y = 448 - Math.sin(i * 1.71 + time * .55) * 55, h = 60 + Math.sin(i * 4.2) * 36; c.strokeStyle = '#88b691'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, 470); c.quadraticCurveTo(x + Math.sin(time + i) * 16, y, x, y - h); c.stroke(); c.fillStyle = ['#e3b779', '#a9d9d3', '#dabbef'][i % 3]; c.beginPath(); c.arc(x, y - h, 14, 0, Math.PI * 2); c.fill(); }
    } else {
      c.fillStyle = '#202a39'; c.fillRect(225, 200, 570, 290); c.fillStyle = '#8cd2c9'; c.fillRect(252, 221, 514, 246);
      const selected = Math.floor(time * .35) % 3; c.fillStyle = ['#f25364', '#ebc969', '#819ce1'][selected]; c.fillRect(145, 200, 70, 290); c.fillRect(805, 200, 70, 290); c.fillStyle = '#233040'; for (const x of [180, 838]) { c.beginPath(); c.arc(x, 282, 16, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#173543'; c.font = '36px Arial'; c.textAlign = 'center'; c.fillText('MAKE IT YOURS', 512, 357);
    }
    c.textAlign = 'left'; c.font = '19px Arial'; c.fillStyle = '#ffffff'; c.fillText('Interact with the console to change this display', 54, 544); screenTexture.needsUpdate = true;
  }
  function demo(x: number, z: number, y: number, title: string, giant = false) {
    const pedestal = new THREE.Group(); pedestal.name = title; pedestal.position.set(x, y, z);
    const b = new Batch(); b.box(red, 0, .52, 0, 1.0, 1.04, .68); b.box(black, 0, 1.08, 0, 1.04, .11, .74); b.box(glowing, 0, .035, 0, .94, .04, .60);
    for (const dx of [-.25, .25]) { b.box(black, dx, 1.17, .03, .18, .10, .23); b.cyl(metal, dx, 1.235, .03, .03, .03, .03, 10); }
    if (!giant) { b.box(black, 0, 1.68, -.23, 1.25, .72, .09); const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .647), screenMaterial); m.position.set(0, 1.68, -.179); pedestal.add(m); }
    pedestal.add(b.finish()); group.add(pedestal); collision(title, x, z, 1.08, .78, y, y + 1.2);
    targets.push({ id: `nintendo-${title.toLowerCase().replaceAll(' ', '-')}`, title, category: 'Demo screen', position: point(frame, x, y + 1.05, z + .35), radius: 2, action: () => { screenMode = (screenMode + 1) % 3; drawScreen(lastTime); }, description: () => `Change the original display: ${['Color Trail', 'Light Garden', 'Console Colors'][screenMode]}.`, object: pedestal });
  }
  // Screen wall sits beside the foot of the stair, visible into the lower void from upstairs.
  batch.box(white, 0, -1.72, -16.1, 6.35, 3.5, .20); batch.box(black, 0, -1.58, -15.97, 5.76, 3.30, .09);
  const bigScreen = new THREE.Mesh(new THREE.PlaneGeometry(5.60, 3.15), screenMaterial); bigScreen.position.set(0, -1.58, -15.908); group.add(bigScreen);
  collision('giant display wall', 0, -16.1, 6.35, .27, -3.6, .03);
  // Kiosk offset leaves the full straight stair landing open.
  demo(4.1, -19.2, -3.6, 'Lower floor demo'); demo(7.6, -18.5, -3.6, 'Game discovery'); demo(-8.0, -18.0, 0, 'Hardware colors');
  targets.push({ id: 'nintendo-giant-screen', title: 'Giant game display', category: 'Interactive screen', position: point(frame, 0, -1.45, -15.85), radius: 4, action: () => { screenMode = (screenMode + 1) % 3; drawScreen(lastTime); }, description: () => `Original animated installation · ${['Color Trail', 'Light Garden', 'Console Colors'][screenMode]}`, object: bigScreen });
  // Authored inspectable device, separate from the supplied character sculpture anchors.
  const device = new THREE.Group(); device.name = 'Inspectable handheld console'; device.position.set(7.0, 1.02, -17.8);
  const cb = new Batch(); cb.box(black, 0, 0, 0, .66, .045, .34); cb.box(colors[0], -.39, 0, 0, .13, .05, .35); cb.box(colors[1], .39, 0, 0, .13, .05, .35);
  for (const x of [-.39, .39]) cb.cyl(black, x, .043, -.05, .030, .026, .030, 12);
  device.add(cb.finish()); const devScreen = new THREE.Mesh(new THREE.PlaneGeometry(.57, .29), screenMaterial); devScreen.rotation.x = -Math.PI / 2; devScreen.position.y = .028; device.add(devScreen); group.add(device);
  batch.box(white, 7.0, .43, -17.8, 1.9, .86, 1.25); batch.box(edge, 7.0, .89, -17.8, 2.0, .06, 1.35); collision('device inspection table', 7, -17.8, 2, 1.35, 0, .95);
  sign('INSPECT A CONSOLE', 7, .54, -17.105, 1.65, .20);
  targets.push({ id: 'nintendo-inspect-device', title: 'Inspect a console', category: 'Rotating product', position: point(frame, 7, 1.04, -17.8), radius: 2.2, action: () => { productSpinning = !productSpinning; }, description: () => productSpinning ? 'The device rotates for inspection. Interact again to stop.' : 'Rotate this original handheld model.', object: device });
  targets.push({ id: 'nintendo-display-animation', title: 'Bring the display to life', category: 'Character display', position: point(frame, -7.05, 1.3, -8.9), radius: 2.6, action: () => { figureAnimation = !figureAnimation; }, description: () => figureAnimation ? 'Display motion is on.' : 'Start a gentle turntable animation.', object: group.getObjectByName('displayMario') });
  const token = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .03, 32), brass); token.position.set(2.5, 1.155, -18.9); group.add(token);
  targets.push({ id: 'nintendo-souvenir', title: 'Union Square souvenir', category: 'Collectible', position: point(frame, 2.5, 1.20, -18.6), radius: 2.1, action: () => { souvenir = !souvenir; token.visible = !souvenir; }, description: () => souvenir ? 'Souvenir collected for this visit. Interact to return it.' : 'Collect an original commemorative token.' });
  targets.push({ id: 'nintendo-door', title: 'Nintendo entrance', category: 'Door', position: point(frame, 0, 1.4, .25), radius: 3, action: () => { doorOpen = !doorOpen; }, description: () => doorOpen ? 'Entrance open. Interact to close the doors.' : 'Interact to open the entrance.', object: door });
  const staticMeshes = batch.finish(); staticMeshes.name = 'Nintendo original batched architecture and furnishings'; group.add(staticMeshes);
  // Restrained local lights establish interior depth while emissive coves remain visible at night.
  const lights: THREE.PointLight[] = [];
  for (const [x, y, z] of [[-7, 2.9, -8], [7, 2.9, -16], [-7, -.7, -10], [7, -.7, -18]]) { const l = new THREE.PointLight(0xfff1df, 26, 17, 2); l.position.set(x, y, z); l.castShadow = false; group.add(l); lights.push(l); }
  const upper: WalkSurface = { id: 'nintendo-ground', contains: (wx, wz) => { const p = local(frame, wx, wz); return p.x >= -12 && p.x <= 12 && p.z >= -22 && p.z <= .38 && (!withinVoid(p.x, p.z) || (Math.abs(p.x) <= 1.35 && p.z >= -6.8 && p.z <= -5.6)); }, height: () => frame.y };
  const floors: WalkSurface[] = [upper, stairFloor(frame, 'nintendo-central-stairs', 0, stairTop, stairBottom, stairWidth, 0, -3.6, steps), rectFloor(frame, 'nintendo-lower', 0, -11, 24, 22, -3.6)];
  const corners = [point(frame, -12.15, -3.85, -22.2), point(frame, 12.15, 4.12, .85)]; const bounds = new THREE.Box3().setFromPoints(corners);
  function reset() { screenMode = 0; screenTick = -1; productSpinning = false; figureAnimation = false; souvenir = false; token.visible = true; device.rotation.y = 0; doorOpen = true; doorSlide = 1; for (const name of ['displayMario', 'displayLink', 'displayPikmin', 'displayAnimalCrossing', 'displayPikachu']) { const obj = group.getObjectByName(name); if (obj) obj.rotation.y = 0; } drawScreen(0); }
  function update(time: number, dt: number) {
    lastTime = time; const tick = Math.floor(time * 8); if (tick !== screenTick) { screenTick = tick; drawScreen(time); }
    if (productSpinning) device.rotation.y = time * .6;
    if (figureAnimation) for (const name of ['displayMario', 'displayLink', 'displayPikmin']) { const obj = group.getObjectByName(name); if (obj) obj.rotation.y = Math.sin(time * .5) * .22; }
    const destination = doorOpen ? 1 : 0; doorSlide = THREE.MathUtils.damp(doorSlide, destination, 5, Math.min(dt, .1));
    for (const leaf of door.children) leaf.position.x = leaf.userData.closedX + leaf.userData.side * doorSlide * 1.48;
  }
  reset(); update(0, 0); group.updateMatrixWorld(true);
  return { id: 'nintendo', group, floors, colliders, targets, entry: point(frame, 0, 0, .38), bounds, update, reset, setLighting: (mode: string) => { for (const light of lights) light.intensity = mode === 'night' ? 32 : 26; } };
}
