import * as THREE from 'three';

export const WATER_Y = 6.0;

export const RUNWAY = {
  x: 0,
  zStart: -3020,
  zEnd: -3460,
  zCenter: -3240,
  y: 26.0,
  width: 38,
  length: 440,
  headingDeg: 0,
};

// Prevailing canyon wind (m/s) blowing WSW -> ENE across the gorge.
export const WIND_VECTOR = { x: 11.2, z: -4.8 };

export const THERMALS = [
  { x: -18, z: -420, radius: 48, topY: 195, strength: 5.4 },
  { x: 112, z: -1020, radius: 52, topY: 215, strength: 5.8 },
  { x: -75, z: -1580, radius: 50, topY: 220, strength: 5.6 },
  { x: 148, z: -2420, radius: 48, topY: 205, strength: 5.8 },
  { x: 118, z: -2780, radius: 48, topY: 195, strength: 5.2 },
];

export function createRng(seed = 1) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function fbm2(x, z) {
  const n1 = Math.sin(x * 0.0085 + 0.4) * Math.cos(z * 0.0072 - 0.3);
  const n2 = Math.sin(x * 0.019 - z * 0.014 + 1.7) * 0.5;
  const n3 = Math.cos(x * 0.041 + z * 0.036 - 0.9) * 0.25;
  const n4 = Math.sin(x * 0.083 - z * 0.071 + 2.3) * 0.12;
  return n1 + n2 + n3 + n4;
}

export function canyonCenterX(z) {
  // Smooth S-curve down the canyon that straightens cleanly into the runway valley.
  const straightTaper = smoothstep(-2780, -2300, z);
  return (Math.sin(z * 0.0022) * 165 + Math.sin(z * 0.0049 + 0.7) * 58) * straightTaper;
}

export function riverCenterX(z) {
  // Curves smoothly east around the airfield mesa so the strip sits on a dry bench.
  const bendEast = smoothstep(-2620, -3100, z) * 165;
  return canyonCenterX(z) + bendEast;
}

export function roadCenterX(z) {
  const base = canyonCenterX(z) - 56;
  const mergeApron = smoothstep(-2780, -3060, z);
  return base * (1 - mergeApron) + (-44) * mergeApron;
}

export function isOnRunway(x, z, margin = 4) {
  return (
    Math.abs(x - RUNWAY.x) <= RUNWAY.width * 0.5 + margin &&
    z <= RUNWAY.zStart + margin &&
    z >= RUNWAY.zEnd - margin
  );
}

export function terrainHeight(x, z) {
  const cx = canyonCenterX(z);
  const rx = riverCenterX(z);
  const dxCanyon = Math.abs(x - cx);
  const dxRiver = Math.abs(x - rx);

  // Broad canyon gorge profile that widens into a basin around the runway strip.
  const basinWiden = smoothstep(-2550, -3050, z) * 140;
  const wallStart = 64 + basinWiden;
  const wallSpan = 215;
  const wallT = smoothstep(wallStart, wallStart + wallSpan, dxCanyon);

  const noise = fbm2(x, z);
  const rawWall = wallT * (162 + noise * 34);

  // Subtle horizontal sandstone strata steps on the cliff walls.
  const strata = Math.sin(rawWall * 0.145) * 3.8 * wallT;
  let h = 16.0 + rawWall + strata + noise * 6.5;

  // Carve the river channel below WATER_Y.
  const riverMask = 1 - smoothstep(14, 42, dxRiver);
  h = h * (1 - riverMask) + 2.2 * riverMask;

  // Gently level the dirt mail road bench along the west bank.
  const dxRoad = Math.abs(x - roadCenterX(z));
  const roadMask = (1 - smoothstep(6, 17, dxRoad)) * (1 - riverMask);
  if (roadMask > 0.001) {
    const roadTarget = 18.5 + smoothstep(-2700, -3040, z) * (RUNWAY.y - 18.5);
    h = h * (1 - roadMask * 0.72) + roadTarget * (roadMask * 0.72);
  }

  // Flatten the Red Mesa runway plateau and hangar apron seamlessly.
  const padX = 1 - smoothstep(64, 138, Math.abs(x - RUNWAY.x));
  const padZ = smoothstep(-3620, -3490, z) * (1 - smoothstep(-2990, -2850, z));
  const padMask = padX * padZ;
  if (padMask > 0.001) {
    h = h * (1 - padMask) + RUNWAY.y * padMask;
  }

  return h;
}

export function terrainSlope(x, z) {
  const eps = 4.0;
  const dhdx = (terrainHeight(x + eps, z) - terrainHeight(x - eps, z)) / (2 * eps);
  const dhdz = (terrainHeight(x, z + eps) - terrainHeight(x, z - eps)) / (2 * eps);
  return { dhdx, dhdz };
}

export function sampleLift(x, y, z, windScale = 1.0) {
  const groundY = terrainHeight(x, z);
  const agl = y - groundY;
  const { dhdx, dhdz } = terrainSlope(x, z);

  // Wind blowing uphill against a canyon ridge face generates free ridge lift.
  const wx = WIND_VECTOR.x * windScale;
  const wz = WIND_VECTOR.z * windScale;
  const upslope = wx * dhdx + wz * dhdz;

  let ridgeLift = 0;
  if (upslope > 1.2 && agl > 3 && agl < 125) {
    const heightEnvelope = Math.sin(clamp((agl - 3) / 122, 0, 1) * Math.PI);
    ridgeLift = clamp((upslope - 1.0) * 0.92 * (0.62 + 0.38 * heightEnvelope), 0, 7.2);
  }

  // Sunny thermal columns along the canyon floor provide spiraling lift.
  let thermalLift = 0;
  for (const th of THERMALS) {
    const d = Math.hypot(x - th.x, z - th.z);
    if (d < th.radius && y > groundY + 4 && y < th.topY) {
      const radial = 1 - d / th.radius;
      const altFactor = smoothstep(th.topY, th.topY - 45, y);
      thermalLift = Math.max(thermalLift, th.strength * radial * altFactor);
    }
  }

  if (ridgeLift >= thermalLift && ridgeLift > 0.55) {
    return { liftRate: ridgeLift, source: 'RIDGE', intensity: clamp(ridgeLift / 6.5, 0, 1) };
  }
  if (thermalLift > 0.55) {
    return { liftRate: thermalLift, source: 'THERMAL', intensity: clamp(thermalLift / 6.0, 0, 1) };
  }
  return { liftRate: 0, source: null, intensity: 0 };
}

function buildSkyDome() {
  const geo = new THREE.SphereGeometry(4600, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTopColor: { value: new THREE.Color(0x2a69a8) },
      uMidColor: { value: new THREE.Color(0x88b8dc) },
      uHorizonColor: { value: new THREE.Color(0xf6cba0) },
      uSunDir: { value: new THREE.Vector3(-0.24, 0.24, -0.94).normalize() },
      uSunColor: { value: new THREE.Color(0xfff0c2) },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vWorldDir;
      void main() {
        vec3 d = normalize(vWorldDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.26, h));
        col = mix(col, uTopColor, smoothstep(0.22, 0.82, h));
        float sunDot = max(dot(d, uSunDir), 0.0);
        col += uSunColor * pow(sunDot, 26.0) * 0.48;
        col += vec3(1.0, 0.97, 0.88) * smoothstep(0.9986, 0.9996, sunDot) * 0.95;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

function buildTerrainMesh() {
  const width = 2500;
  const length = 4600;
  const segX = 140;
  const segZ = 240;
  const zMin = -4100;
  const zCenter = zMin + length * 0.5;

  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTmp = new THREE.Color();

  const cRiverBed = new THREE.Color(0x285a5e);
  const cSand = new THREE.Color(0xd2b384);
  const cRoad = new THREE.Color(0x8e6b4a);
  const cSage = new THREE.Color(0x6c7c48);
  const cTerracotta = new THREE.Color(0xb85834);
  const cOchre = new THREE.Color(0xd1864d);
  const cRim = new THREE.Color(0x9a492e);
  const cMesaTop = new THREE.Color(0x7c6848);
  const cApron = new THREE.Color(0x9d8462);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + zCenter;
    const y = terrainHeight(x, z);
    pos.setXYZ(i, x, y, z);

    const { dhdx, dhdz } = terrainSlope(x, z);
    const slope = Math.hypot(dhdx, dhdz);
    const dxRiver = Math.abs(x - riverCenterX(z));
    const dxRoad = Math.abs(x - roadCenterX(z));
    const strataBand = Math.sin(y * 0.16 + fbm2(x * 0.5, z * 0.5) * 0.7);

    if (y < WATER_Y + 0.4) {
      cTmp.copy(cRiverBed);
    } else if (dxRiver < 34 && y < 14) {
      cTmp.copy(cSand);
    } else if (Math.abs(x - RUNWAY.x) < 62 && z < -2960 && z > -3510) {
      cTmp.copy(cApron);
    } else if (dxRoad < 8.5 && y < 34 && dxRiver > 24) {
      cTmp.copy(cRoad);
    } else if (slope > 0.46) {
      // Stratified canyon cliff face: alternating terracotta, ochre, and sandstone rim bands.
      cTmp.copy(strataBand > 0.2 ? cOchre : strataBand < -0.3 ? cRim : cTerracotta);
    } else if (y > 148) {
      cTmp.copy(cMesaTop).lerp(cOchre, clamp((strataBand + 1) * 0.25, 0, 0.5));
    } else {
      cTmp.copy(cSage).lerp(cSand, smoothstep(14, 52, y) * 0.35);
    }

    const grain = (Math.sin(x * 0.09 + z * 0.07) * 0.04);
    colors[i * 3] = clamp(cTmp.r + grain, 0, 1);
    colors[i * 3 + 1] = clamp(cTmp.g + grain, 0, 1);
    colors[i * 3 + 2] = clamp(cTmp.b + grain, 0, 1);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildRiverMesh() {
  const segZ = 220;
  const zStart = 500;
  const zEnd = -4050;
  const halfW = 28;
  const positions = [];
  const indices = [];

  for (let i = 0; i <= segZ; i++) {
    const t = i / segZ;
    const z = zStart + (zEnd - zStart) * t;
    const rx = riverCenterX(z);
    positions.push(rx - halfW, WATER_Y, z);
    positions.push(rx + halfW, WATER_Y, z);
    if (i < segZ) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x228ba6,
    emissive: 0x0c3442,
    roughness: 0.56,
    metalness: 0.1,
  });
  return new THREE.Mesh(geo, mat);
}

function createRunwayTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');

  // Graded tarmac-gravel runway base.
  ctx.fillStyle = '#33363c';
  ctx.fillRect(0, 0, 512, 2048);

  // Subtle tire rubber and dust texture strips.
  ctx.fillStyle = 'rgba(205, 178, 138, 0.13)';
  ctx.fillRect(0, 0, 32, 2048);
  ctx.fillRect(480, 0, 32, 2048);
  ctx.fillStyle = 'rgba(18, 20, 24, 0.25)';
  ctx.fillRect(216, 150, 80, 1748);

  // Crisp side edge markings.
  ctx.fillStyle = '#e9e5d8';
  ctx.fillRect(36, 18, 10, 2012);
  ctx.fillRect(466, 18, 10, 2012);

  // Threshold piano keys (both ends).
  const drawPianoKeys = (yStart) => {
    for (let i = 0; i < 6; i++) {
      const x = 66 + i * 64;
      if (i === 3) continue;
      ctx.fillRect(x, yStart, 36, 96);
    }
    ctx.fillRect(256 - 52, yStart, 36, 96);
    ctx.fillRect(256 + 16, yStart, 36, 96);
  };
  drawPianoKeys(34);
  drawPianoKeys(1918);

  // Runway designation "36" at approach end (bottom of canvas maps to +Z south threshold).
  ctx.save();
  ctx.fillStyle = '#f2efe6';
  ctx.font = 'bold 128px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('36', 256, 1790);
  ctx.translate(256, 258);
  ctx.rotate(Math.PI);
  ctx.fillText('18', 0, 0);
  ctx.restore();

  // Aiming point bars (touchdown zone).
  ctx.fillRect(108, 1520, 44, 150);
  ctx.fillRect(360, 1520, 44, 150);

  // Dashed centerline.
  for (let y = 390; y < 1660; y += 112) {
    ctx.fillRect(248, y, 16, 62);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRunwayComplex() {
  const group = new THREE.Group();
  const y = RUNWAY.y;

  // Main strip.
  const stripGeo = new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length);
  stripGeo.rotateX(-Math.PI / 2);
  const stripMat = new THREE.MeshStandardMaterial({
    map: createRunwayTexture(),
    roughness: 0.88,
    metalness: 0.05,
  });
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.position.set(RUNWAY.x, y + 0.14, RUNWAY.zCenter);
  group.add(strip);

  // Edge beacons & threshold green/red bars.
  const edgeGeo = new THREE.SphereGeometry(0.65, 8, 6);
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x4cff8c });
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff4646 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x444952, roughness: 0.8 });

  for (let z = RUNWAY.zStart; z >= RUNWAY.zEnd; z -= 44) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(edgeGeo, whiteMat);
      lamp.position.set(RUNWAY.x + side * (RUNWAY.width * 0.5 + 2.4), y + 1.0, z);
      group.add(lamp);
    }
  }
  for (let x = -16; x <= 16; x += 8) {
    const startLamp = new THREE.Mesh(edgeGeo, greenMat);
    startLamp.position.set(x, y + 0.9, RUNWAY.zStart + 2);
    group.add(startLamp);
    const endLamp = new THREE.Mesh(edgeGeo, redMat);
    endLamp.position.set(x, y + 0.9, RUNWAY.zEnd - 2);
    group.add(endLamp);
  }

  // 4-lamp PAPI approach glide-slope indicator beside left touchdown zone.
  const papiLamps = [];
  for (let i = 0; i < 4; i++) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 1.4), postMat);
    housing.position.set(-25 - i * 3.1, y + 0.7, RUNWAY.zStart - 52);
    group.add(housing);
    const bulbMat = new THREE.MeshBasicMaterial({ color: i < 2 ? 0xffffff : 0xff3b30 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 6), bulbMat);
    bulb.position.set(-25 - i * 3.1, y + 0.85, RUNWAY.zStart - 51.2);
    group.add(bulb);
    papiLamps.push(bulbMat);
  }

  // Mail Hangar + apron tower beside the runway.
  const hangar = new THREE.Group();
  hangar.position.set(-46, y, RUNWAY.zCenter + 65);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9cbb4, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xb23a28, roughness: 0.65 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a3d52, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(24, 9.5, 20), wallMat);
  body.position.y = 4.75;
  hangar.add(body);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(18.5, 4.5, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.05, 1, 0.92);
  roof.position.y = 11.6;
  hangar.add(roof);

  const doorOpening = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 6.8, 13.5),
    new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 0.95 }),
  );
  doorOpening.position.set(12.0, 3.4, 0);
  hangar.add(doorOpening);

  const beaconMast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 18, 6), trimMat);
  beaconMast.position.set(-10, 9, -14);
  hangar.add(beaconMast);

  const mastLight = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), redMat);
  mastLight.position.set(-10, 18.2, -14);
  hangar.add(mastLight);

  group.add(hangar);

  // Animated orange-and-white windsock near approach end.
  const windsockPole = new THREE.Group();
  windsockPole.position.set(-25, y, RUNWAY.zStart - 16);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 10.5, 6), postMat);
  pole.position.y = 5.25;
  windsockPole.add(pole);

  const sockPivot = new THREE.Group();
  sockPivot.position.y = 10.2;
  const windAngle = Math.atan2(WIND_VECTOR.x, WIND_VECTOR.z);
  sockPivot.rotation.y = windAngle;

  const sockSegments = [];
  for (let i = 0; i < 5; i++) {
    const r0 = 0.85 - i * 0.11;
    const r1 = 0.74 - i * 0.11;
    const segGeo = new THREE.CylinderGeometry(r1, r0, 1.35, 8, 1, true);
    segGeo.rotateX(Math.PI / 2);
    const segMat = new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? 0xff6b1a : 0xf4f1e8,
      emissive: i % 2 === 0 ? 0x3a1200 : 0x111111,
      side: THREE.DoubleSide,
      roughness: 0.75,
    });
    const seg = new THREE.Mesh(segGeo, segMat);
    seg.position.z = 0.9 + i * 1.3;
    sockPivot.add(seg);
    sockSegments.push(seg);
  }
  windsockPole.add(sockPivot);
  group.add(windsockPole);

  return { group, papiLamps, sockSegments, mastLight };
}

function buildPineForest(rng) {
  const spots = [];
  for (let i = 0; i < 2400 && spots.length < 860; i++) {
    const x = (rng() - 0.5) * 1950;
    const z = 320 - rng() * 4100;
    if (Math.abs(x - RUNWAY.x) < 88 && z < -2880 && z > -3560) continue;
    if (Math.abs(x - riverCenterX(z)) < 34) continue;
    if (Math.abs(x - roadCenterX(z)) < 14) continue;

    const y = terrainHeight(x, z);
    if (y < WATER_Y + 3.2 || y > 175) continue;
    const { dhdx, dhdz } = terrainSlope(x, z);
    if (Math.hypot(dhdx, dhdz) > 0.56) continue;

    const scale = 0.8 + rng() * 0.95;
    spots.push({ x, y, z, scale, rot: rng() * Math.PI * 2 });
  }

  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.75, 4.6, 5);
  trunkGeo.translate(0, 2.3, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3e28, roughness: 0.95 });

  const lowerGeo = new THREE.ConeGeometry(3.4, 8.2, 6);
  lowerGeo.translate(0, 7.2, 0);
  const upperGeo = new THREE.ConeGeometry(2.4, 7.0, 6);
  upperGeo.translate(0, 11.4, 0);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2c5636, roughness: 0.9, flatShading: true });
  const topMat = new THREE.MeshStandardMaterial({ color: 0x386942, roughness: 0.88, flatShading: true });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const lowers = new THREE.InstancedMesh(lowerGeo, foliageMat, spots.length);
  const uppers = new THREE.InstancedMesh(upperGeo, topMat, spots.length);

  const dummy = new THREE.Object3D();
  spots.forEach((s, idx) => {
    dummy.position.set(s.x, s.y - 0.5, s.z);
    dummy.rotation.set(0, s.rot, 0);
    dummy.scale.setScalar(s.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);
    lowers.setMatrixAt(idx, dummy.matrix);
    uppers.setMatrixAt(idx, dummy.matrix);
  });

  group.add(trunks, lowers, uppers);
  return group;
}

function buildDistantMesas(rng) {
  const group = new THREE.Group();
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0xa45439, roughness: 0.92, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x7c4632, roughness: 0.94, flatShading: true });

  const specs = [
    [-760, -4250, 340, 250, 240],
    [-190, -4450, 420, 290, 260],
    [480, -4300, 390, 265, 250],
    [1020, -4050, 320, 235, 240],
    [-1320, -3400, 360, 270, 320],
    [1360, -3200, 380, 280, 310],
    [-1360, -2050, 350, 260, 340],
    [1380, -1850, 340, 255, 320],
    [-1300, -780, 330, 240, 300],
    [1340, -620, 350, 250, 300],
  ];

  for (const [x, z, r, h, d] of specs) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r, h, 7), mesaMat);
    base.position.set(x, h * 0.45, z);
    base.rotation.y = rng() * Math.PI;
    base.scale.set(1, 1, d / r);
    group.add(base);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.64, h * 0.14, 7), capMat);
    cap.position.set(x, h * 0.95, z);
    cap.rotation.y = base.rotation.y;
    cap.scale.set(1, 1, d / r);
    group.add(cap);
  }
  return group;
}

function buildClouds(rng) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x9c8e82,
    roughness: 1.0,
    transparent: true,
    opacity: 0.92,
  });
  const puffGeo = new THREE.DodecahedronGeometry(1, 1);
  const clouds = [];

  for (let i = 0; i < 32; i++) {
    const c = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(puffGeo, mat);
      const sx = 28 + rng() * 34;
      const sy = 10 + rng() * 11;
      const sz = 22 + rng() * 26;
      m.scale.set(sx, sy, sz);
      m.position.set((p - puffs * 0.5) * 26, (rng() - 0.4) * 8, (rng() - 0.5) * 18);
      c.add(m);
    }
    const baseX = (rng() - 0.5) * 2200;
    const baseY = 305 + rng() * 145;
    const baseZ = 200 - rng() * 4400;
    c.position.set(baseX, baseY, baseZ);
    group.add(c);
    clouds.push({ mesh: c, baseX, baseZ, speed: 3.5 + rng() * 3.5 });
  }
  return { group, clouds, mat };
}

function buildLiftRibbons() {
  const group = new THREE.Group();
  const thermalMat = new THREE.MeshBasicMaterial({
    color: 0x7efce0,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ridgeMat = new THREE.MeshBasicMaterial({
    color: 0x6bffce,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const rings = [];
  for (const th of THERMALS) {
    const baseY = terrainHeight(th.x, th.z) + 12;
    for (let i = 0; i < 4; i++) {
      const torus = new THREE.Mesh(new THREE.TorusGeometry(th.radius * (0.42 + i * 0.09), 0.55, 5, 24), thermalMat);
      torus.rotation.x = Math.PI / 2;
      torus.position.set(th.x, baseY + i * 32, th.z);
      group.add(torus);
      rings.push({ mesh: torus, baseY, span: th.topY - baseY, phase: i * 0.25 });
    }
  }

  // Rising wind-streamlines hugging the windward east canyon walls so ridge lift is readable in 3D.
  const streaks = [];
  const streakGeo = new THREE.PlaneGeometry(3.2, 28);
  for (let z = -300; z >= -2680; z -= 125) {
    const cx = canyonCenterX(z);
    for (let lane = 0; lane < 3; lane++) {
      const x = cx + 86 + lane * 26;
      const baseY = terrainHeight(x, z) + 8;
      const streak = new THREE.Mesh(streakGeo, ridgeMat);
      streak.position.set(x, baseY + lane * 14, z);
      streak.rotation.z = -0.34;
      streak.rotation.y = 0.25;
      group.add(streak);
      streaks.push({ mesh: streak, x, z, baseY, phase: (lane * 0.33 + Math.abs(z) * 0.002) % 1 });
    }
  }

  return { group, rings, streaks };
}

export function createWorld(scene, seed = 1) {
  const rng = createRng(seed);
  const group = new THREE.Group();

  const sky = buildSkyDome();
  group.add(sky);

  const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.35);
  sunLight.position.set(-420, 440, -1400);
  group.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0x8ec5f8, 0xb8734d, 0.95);
  group.add(hemiLight);

  const ambient = new THREE.AmbientLight(0x52463d, 0.35);
  group.add(ambient);

  const terrain = buildTerrainMesh();
  group.add(terrain);

  const river = buildRiverMesh();
  group.add(river);

  const runwayObj = buildRunwayComplex();
  group.add(runwayObj.group);

  const forest = buildPineForest(rng);
  group.add(forest);

  const mesas = buildDistantMesas(rng);
  group.add(mesas);

  const cloudsObj = buildClouds(rng);
  group.add(cloudsObj.group);

  const liftObj = buildLiftRibbons();
  group.add(liftObj.group);

  scene.add(group);
  scene.fog = new THREE.FogExp2(0xdfbfa0, 0.00032);

  function applyLighting(modeId) {
    const u = sky.material.uniforms;
    if (modeId === 'dusk-landing') {
      u.uTopColor.value.setHex(0x1b2448);
      u.uMidColor.value.setHex(0x6e4a6d);
      u.uHorizonColor.value.setHex(0xf28b4b);
      u.uSunDir.value.set(-0.22, 0.09, -0.97).normalize();
      u.uSunColor.value.setHex(0xff9b42);
      sunLight.color.setHex(0xffae66);
      sunLight.intensity = 1.85;
      hemiLight.color.setHex(0x6a6aa0);
      hemiLight.groundColor.setHex(0x5a3426);
      hemiLight.intensity = 0.78;
      cloudsObj.mat.color.setHex(0xffb48a);
      cloudsObj.mat.emissive.setHex(0x3a1c28);
      scene.fog.color.setHex(0xc47b5c);
      scene.fog.density = 0.00042;
    } else {
      u.uTopColor.value.setHex(0x286aa8);
      u.uMidColor.value.setHex(0x89badc);
      u.uHorizonColor.value.setHex(0xf5cca4);
      u.uSunDir.value.set(-0.26, 0.25, -0.93).normalize();
      u.uSunColor.value.setHex(0xfff0c4);
      sunLight.color.setHex(0xfff1d6);
      sunLight.intensity = 2.35;
      hemiLight.color.setHex(0x8ec5f8);
      hemiLight.groundColor.setHex(0xb8734d);
      hemiLight.intensity = 0.95;
      cloudsObj.mat.color.setHex(0xffffff);
      cloudsObj.mat.emissive.setHex(0x9c8e82);
      scene.fog.color.setHex(0xdfbfa0);
      scene.fog.density = 0.00031;
    }
  }

  function updatePapi(planePos) {
    // Compute glide angle from approach touchdown point (z = -3072, y = 26).
    const dist = Math.max(1, planePos.z - (RUNWAY.zStart - 52));
    const altAboveStrip = planePos.y - RUNWAY.y;
    const angleDeg = Math.atan2(altAboveStrip, dist) * (180 / Math.PI);
    const thresholds = [2.8, 3.7, 4.6, 5.5];
    for (let i = 0; i < 4; i++) {
      // Standard PAPI: higher than threshold -> white, below -> red.
      const isHigh = angleDeg > thresholds[i];
      runwayObj.papiLamps[i].color.setHex(isHigh ? 0xffffff : 0xff3b30);
    }
  }

  function update(time, planePos) {
    // Keep sky dome centered on aircraft.
    sky.position.copy(planePos);

    // Animate windsock flutter.
    runwayObj.sockSegments.forEach((seg, idx) => {
      seg.position.x = Math.sin(time * 5.2 - idx * 0.7) * (0.14 * idx);
      seg.position.y = -0.08 * idx + Math.cos(time * 4.1 - idx * 0.5) * (0.08 * idx);
    });

    // Drift clouds deterministically by time.
    for (const c of cloudsObj.clouds) {
      const wrappedX = (((c.baseX + time * c.speed + 1200) % 2400) + 2400) % 2400 - 1200;
      c.mesh.position.x = wrappedX;
    }

    // Rise thermal rings and ridge lift wind streaks smoothly.
    for (const r of liftObj.rings) {
      const frac = (r.phase + time * 0.16) % 1;
      r.mesh.position.y = r.baseY + frac * r.span;
      r.mesh.rotation.z = time * 0.9 + r.phase * 6.28;
    }
    for (const s of liftObj.streaks) {
      const frac = (s.phase + time * 0.24) % 1;
      s.mesh.position.y = s.baseY + frac * 52;
      s.mesh.position.x = s.x + frac * 18;
    }

    updatePapi(planePos);
  }

  applyLighting('ring-run');

  return {
    group,
    runway: RUNWAY,
    thermals: THERMALS,
    terrainHeight,
    terrainSlope,
    isOnRunway,
    sampleLift,
    applyLighting,
    update,
  };
}
