import * as THREE from 'three';
import { RUNWAY, canyonCenterX, terrainHeight } from './world.js';

export const MODES = {
  'ring-run': {
    id: 'ring-run',
    name: 'Ring Run',
    subtitle: 'Thread 8 canyon rings, surf ridge lift, land Runway 36.',
    requireRings: true,
    timed: false,
    startTime: 0,
    ringTimeBonus: 0,
    windScale: 1.0,
    fuelBurnMult: 1.0,
    spawn: { x: 0, y: 112, z: 120, speed: 45, yaw: 0, pitch: -0.02, throttle: 0.68, fuel: 100 },
  },
  'canyon-dash': {
    id: 'canyon-dash',
    name: 'Canyon Dash',
    subtitle: 'Beat the countdown through 8 rings (+9s each) & touch down.',
    requireRings: true,
    timed: true,
    startTime: 64,
    ringTimeBonus: 9.0,
    windScale: 1.12,
    fuelBurnMult: 1.08,
    spawn: { x: 0, y: 112, z: 120, speed: 50, yaw: 0, pitch: -0.02, throttle: 0.82, fuel: 88 },
  },
  'dusk-landing': {
    id: 'dusk-landing',
    name: 'Dusk Landing',
    subtitle: 'Twilight canyon exit, crosswind, tight 22% fuel — land safely.',
    requireRings: false,
    timed: false,
    startTime: 0,
    ringTimeBonus: 0,
    windScale: 1.45,
    fuelBurnMult: 1.15,
    spawn: { x: -42, y: 146, z: -2140, speed: 42, yaw: -0.06, pitch: -0.04, throttle: 0.42, fuel: 22 },
  },
};

export function buildRingCourse() {
  // 8 sequential glowing canyon rings winding along the gorge onto the Runway 36 final approach.
  const layout = [
    { z: -200, offsetX: -12, altAboveFloor: 62 },
    { z: -530, offsetX: 38, altAboveFloor: 56 },
    { z: -870, offsetX: -26, altAboveFloor: 48 },
    { z: -1210, offsetX: 44, altAboveFloor: 66 },
    { z: -1550, offsetX: -32, altAboveFloor: 58 },
    { z: -1890, offsetX: 28, altAboveFloor: 62 },
    { z: -2220, offsetX: -8, altAboveFloor: 66 },
    { z: -2570, offsetX: 0, altAboveFloor: 52 },
  ];

  return layout.map((spec, idx) => {
    const x = idx === 7 ? RUNWAY.x : canyonCenterX(spec.z) + spec.offsetX;
    const floor = terrainHeight(x, spec.z);
    const y = idx === 7 ? RUNWAY.y + 52 : Math.max(floor + 28, 22 + spec.altAboveFloor);
    const nextZ = idx < layout.length - 1 ? layout[idx + 1].z : RUNWAY.zStart;
    const nextX = idx < layout.length - 1 ? canyonCenterX(nextZ) + layout[idx + 1].offsetX : RUNWAY.x;
    const yaw = Math.atan2(-(nextX - x), -(nextZ - spec.z));
    return { index: idx, x, y, z: spec.z, radius: 22, yaw, cleared: false };
  });
}

export function createMission(modeId) {
  const mode = MODES[modeId] ?? MODES['ring-run'];
  const rings = mode.requireRings ? buildRingCourse() : [];
  return {
    mode,
    rings,
    ringsCleared: 0,
    totalRings: rings.length,
    nextRingIndex: 0,
    timer: mode.timed ? mode.startTime : 0,
    elapsed: 0,
    score: 0,
    bannerText: mode.requireRings
      ? `${mode.name.toUpperCase()} — THREAD RING 1/${rings.length}`
      : 'DUSK APPROACH — RIDE LIFT & LAND RUNWAY 36',
    bannerKind: 'info',
    bannerTimer: 4.5,
    status: 'active', // active | complete | failed
    failReason: '',
    landingGrade: '',
  };
}

export function setMissionBanner(mission, text, kind = 'info', duration = 3.2) {
  mission.bannerText = text;
  mission.bannerKind = kind;
  mission.bannerTimer = duration;
}

export function getActiveWaypoint(mission) {
  if (mission.mode.requireRings && mission.nextRingIndex < mission.rings.length) {
    const r = mission.rings[mission.nextRingIndex];
    return { x: r.x, y: r.y, z: r.z, label: `RING ${r.index + 1}`, isRunway: false };
  }
  return { x: RUNWAY.x, y: RUNWAY.y + 4, z: RUNWAY.zStart - 40, label: 'RWY 36', isRunway: true };
}

export function computeFinalScore(mission, state) {
  const fpm = state.touchdownFpm ?? 180;
  let grade = 'FIRM';
  let landingBonus = 250;
  if (fpm <= 180) {
    grade = 'GREASER';
    landingBonus = 650;
  } else if (fpm <= 340) {
    grade = 'SMOOTH';
    landingBonus = 450;
  }
  mission.landingGrade = grade;

  const fuelBonus = Math.round(state.fuel * 18);
  const hullBonus = Math.round(state.hull * 10);
  const timeBonus = mission.mode.timed
    ? Math.round(mission.timer * 25)
    : Math.max(0, Math.round((180 - mission.elapsed) * 6));

  mission.score += landingBonus + fuelBonus + hullBonus + timeBonus;
  return { grade, landingBonus, fuelBonus, hullBonus, timeBonus };
}

export function updateMission(mission, state, dt) {
  const events = { ringCleared: false, ringIndex: -1, completed: false, failed: false };
  if (mission.status !== 'active') return events;

  mission.elapsed += dt;
  if (mission.bannerTimer > 0) {
    mission.bannerTimer = Math.max(0, mission.bannerTimer - dt);
  }

  if (mission.mode.timed) {
    mission.timer = Math.max(0, mission.timer - dt);
    if (mission.timer <= 0) {
      mission.status = 'failed';
      mission.failReason = 'TIME EXPIRED — MAIL LATE';
      events.failed = true;
      return events;
    }
  } else {
    mission.timer = mission.elapsed;
  }

  if (state.crashed) {
    mission.status = 'failed';
    mission.failReason = state.crashReason || 'AIRCRAFT CRASHED';
    events.failed = true;
    return events;
  }

  // Sequential ring gate pass detection.
  if (mission.mode.requireRings && mission.nextRingIndex < mission.rings.length) {
    const ring = mission.rings[mission.nextRingIndex];
    const dx = state.pos.x - ring.x;
    const dy = state.pos.y - ring.y;
    const dz = state.pos.z - ring.z;
    const dist = Math.hypot(dx, dy, dz);

    if (dist <= ring.radius + 4.5) {
      ring.cleared = true;
      mission.ringsCleared++;
      const bullseye = Math.max(0, Math.round((1 - dist / (ring.radius + 4.5)) * 160));
      const pts = 400 + bullseye;
      mission.score += pts;
      if (mission.mode.timed) {
        mission.timer += mission.mode.ringTimeBonus;
      }
      events.ringCleared = true;
      events.ringIndex = ring.index;
      mission.nextRingIndex++;

      if (mission.nextRingIndex >= mission.rings.length) {
        setMissionBanner(mission, 'ALL 8 RINGS CLEARED — LAND RUNWAY 36', 'success', 5.5);
      } else {
        const rem = mission.rings.length - mission.nextRingIndex;
        const extra = mission.mode.timed ? ` +${mission.mode.ringTimeBonus}s` : '';
        setMissionBanner(mission, `RING ${mission.ringsCleared}/8 CLEARED (+${pts}${extra}) — ${rem} LEFT`, 'success', 2.8);
      }
    }
  }

  // Landing completion check once plane has rolled to a stop on the runway.
  if (state.landedStop) {
    if (!mission.mode.requireRings || mission.ringsCleared >= mission.totalRings) {
      computeFinalScore(mission, state);
      mission.status = 'complete';
      setMissionBanner(mission, `MAIL DELIVERED — ${mission.landingGrade} LANDING`, 'success', 10);
      events.completed = true;
    } else {
      setMissionBanner(
        mission,
        `MISSED ${mission.totalRings - mission.ringsCleared} RINGS — TAKE OFF OR PRESS R`,
        'warn',
        4.5,
      );
      state.landedStop = false;
    }
  }

  return events;
}

export function createRingVisuals(scene) {
  const group = new THREE.Group();
  const entries = [];

  const activeOuterMat = new THREE.MeshBasicMaterial({ color: 0xffb72b });
  const activeInnerMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  const activeGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffa61a,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const upcomingMat = new THREE.MeshBasicMaterial({ color: 0x52c8ff, transparent: true, opacity: 0.65 });
  const clearedMat = new THREE.MeshBasicMaterial({ color: 0x4ae08c, transparent: true, opacity: 0.22 });

  const outerGeo = new THREE.TorusGeometry(22, 1.35, 10, 36);
  const innerGeo = new THREE.TorusGeometry(20.1, 0.45, 8, 36);
  const discGeo = new THREE.CircleGeometry(20.0, 28);
  const finGeo = new THREE.ConeGeometry(2.4, 5.2, 4);

  const course = buildRingCourse();
  for (const r of course) {
    const holder = new THREE.Group();
    holder.position.set(r.x, r.y, r.z);
    holder.rotation.y = r.yaw;

    const outer = new THREE.Mesh(outerGeo, upcomingMat);
    const inner = new THREE.Mesh(innerGeo, activeInnerMat);
    const disc = new THREE.Mesh(discGeo, activeGlowMat);
    holder.add(outer, inner, disc);

    // 4 directional chevron fins around the ring rim for unmistakable readability from afar.
    const fins = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const fin = new THREE.Mesh(finGeo, activeOuterMat);
      fin.position.set(Math.cos(a) * 24.4, Math.sin(a) * 24.4, 0);
      fin.rotation.z = a + Math.PI / 2;
      fins.add(fin);
    }
    holder.add(fins);

    group.add(holder);
    entries.push({ holder, outer, inner, disc, fins, ring: r });
  }

  scene.add(group);

  function sync(mission, time) {
    if (!mission.mode.requireRings) {
      group.visible = false;
      return;
    }
    group.visible = true;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const cleared = i < mission.nextRingIndex;
      const isNext = i === mission.nextRingIndex;
      const isFollowing = i === mission.nextRingIndex + 1;

      if (cleared) {
        e.outer.material = clearedMat;
        e.inner.visible = false;
        e.disc.visible = false;
        e.fins.visible = false;
      } else if (isNext) {
        e.outer.material = activeOuterMat;
        e.inner.visible = true;
        e.disc.visible = true;
        e.fins.visible = true;
        e.fins.rotation.z = time * 0.9;
        const pulse = 1 + Math.sin(time * 4.5) * 0.035;
        e.holder.scale.setScalar(pulse);
      } else {
        e.outer.material = upcomingMat;
        e.inner.visible = false;
        e.disc.visible = false;
        e.fins.visible = isFollowing;
        e.fins.rotation.z = -time * 0.4;
        e.holder.scale.setScalar(1);
      }
    }
  }

  return { group, entries, sync };
}
