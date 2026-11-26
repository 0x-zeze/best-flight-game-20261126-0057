import * as THREE from 'three';
import { RUNWAY, canyonCenterX, terrainHeight } from './world.js';
import { FLIGHT_CONFIG, createFlightState } from './physics.js';
import { createMission, setMissionBanner } from './missions.js';

export function parseShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seedRaw = Number(params.get('seed'));
  const seed = Number.isFinite(seedRaw) && seedRaw > 0 ? Math.floor(seedRaw) : 1;
  return { shot, seed };
}

export function applyShotPose(shotName, ctx) {
  const { world, plane, ringVisuals, hud, camera, setOverlayState, updateCompleteCard } = ctx;
  const zeroInput = { pitch: 0, roll: 0, throttleDelta: 0, airbrake: false };

  if (shotName === 'cover') {
    const mission = createMission('ring-run');
    mission.ringsCleared = 6;
    mission.nextRingIndex = 6;
    mission.elapsed = 58.4;
    mission.timer = 58.4;
    mission.score = 2980;
    for (let i = 0; i < 6; i++) mission.rings[i].cleared = true;
    setMissionBanner(mission, 'RING 6/8 CLEARED — RUNWAY AHEAD IN VALLEY', 'success', 5);

    // Frame the bush plane near-level (gentle ~6 deg bank) aiming cleanly through Ring 7 toward Ring 8 & Runway 36.
    const r7 = mission.rings[6];
    const px = r7.x + 18;
    const pz = r7.z + 185;
    const py = r7.y + 18;
    const dx = r7.x - px;
    const dz = r7.z - pz;
    const yaw = Math.atan2(-dx, -dz);

    const state = createFlightState({
      x: px,
      y: py,
      z: pz,
      speed: 44.5,
      yaw,
      pitch: -0.025,
      roll: 0.10,
      throttle: 0.72,
      fuel: 68,
    });
    state.hull = 100;
    state.agl = Math.max(0, state.pos.y - world.terrainHeight(state.pos.x, state.pos.z) - FLIGHT_CONFIG.gearOffset);
    state.vsiFpm = -120;

    world.applyLighting('ring-run');
    world.update(18.5, new THREE.Vector3(state.pos.x, state.pos.y, state.pos.z));
    ringVisuals.sync(mission, 18.5);
    plane.update(state, { pitch: 0.04, roll: -0.1 }, 0, 18.5, false);
    plane.setPropSpin(0.65, 0.85);

    // Centered chase camera behind the aircraft framing near-level wings, glowing Ring 7, Ring 8, and valley runway.
    const behindX = Math.sin(yaw) * 18.6;
    const behindZ = Math.cos(yaw) * 18.6;
    camera.position.set(state.pos.x + behindX, state.pos.y + 5.4, state.pos.z + behindZ);
    camera.lookAt(r7.x - 4, r7.y - 4, r7.z - 95);

    setOverlayState('flying');
    hud.update(state, mission, false);
    return { state, mission };
  }

  if (shotName === 'lift') {
    const mission = createMission('ring-run');
    mission.ringsCleared = 2;
    mission.nextRingIndex = 2;
    mission.elapsed = 26.2;
    mission.timer = 26.2;
    mission.score = 1020;
    for (let i = 0; i < 2; i++) mission.rings[i].cleared = true;
    setMissionBanner(mission, 'RIDGE LIFT ACTIVE — CUT THROTTLE TO SAVE FUEL', 'lift', 5);

    // Low pass hugging the sunlit windward east canyon ridge right above the turquoise river.
    const pz = -685;
    const cx = canyonCenterX(pz);
    const px = cx + 92;
    const groundY = terrainHeight(px, pz);
    const py = groundY + 26;
    const r3 = mission.rings[2];
    const yaw = Math.atan2(-(r3.x - px), -(r3.z - pz)) - 0.12;

    const state = createFlightState({
      x: px,
      y: py,
      z: pz,
      speed: 41.0,
      yaw,
      pitch: 0.06,
      roll: 0.28,
      throttle: 0.28,
      fuel: 81,
    });
    state.hull = 94;
    state.agl = Math.max(0, py - groundY - FLIGHT_CONFIG.gearOffset);
    const sampled = world.sampleLift(px, py, pz, 1.0);
    state.liftRate = Math.max(sampled.liftRate, 5.4);
    state.liftSource = 'RIDGE';
    state.liftActive = true;
    state.vsiFpm = 640;

    world.applyLighting('ring-run');
    world.update(11.4, new THREE.Vector3(state.pos.x, state.pos.y, state.pos.z));
    ringVisuals.sync(mission, 11.4);
    plane.update(state, { pitch: 0.12, roll: -0.22 }, 0, 11.4, false);
    plane.setPropSpin(1.15, 0.45);

    const behindX = Math.sin(yaw) * 18.5 - Math.cos(yaw) * 3.8;
    const behindZ = Math.cos(yaw) * 18.5 + Math.sin(yaw) * 3.8;
    camera.position.set(state.pos.x + behindX, state.pos.y + 4.8, state.pos.z + behindZ);
    camera.lookAt(state.pos.x - Math.sin(yaw) * 75 - 12, state.pos.y - 3, state.pos.z - Math.cos(yaw) * 75);

    setOverlayState('flying');
    hud.update(state, mission, false);
    return { state, mission };
  }

  if (shotName === 'approach') {
    const mission = createMission('ring-run');
    mission.ringsCleared = 8;
    mission.nextRingIndex = 8;
    mission.elapsed = 84.6;
    mission.timer = 84.6;
    mission.score = 3840;
    for (let i = 0; i < 8; i++) mission.rings[i].cleared = true;
    setMissionBanner(mission, 'ALL 8 RINGS CLEARED — FINAL APPROACH RUNWAY 36', 'info', 5);

    // On-glideslope final approach (2 white / 2 red PAPI lights!) aligned with Runway 36.
    const state = createFlightState({
      x: -2.0,
      y: RUNWAY.y + 22.0,
      z: RUNWAY.zStart + 225,
      speed: 30.8,
      yaw: -0.015,
      pitch: -0.04,
      roll: -0.05,
      throttle: 0.22,
      fuel: 23,
    });
    state.airbrake = true;
    state.hull = 92;
    state.agl = Math.max(0, state.pos.y - world.terrainHeight(state.pos.x, state.pos.z) - FLIGHT_CONFIG.gearOffset);
    state.vsiFpm = -340;

    world.applyLighting('ring-run');
    world.update(42.0, new THREE.Vector3(state.pos.x, state.pos.y, state.pos.z));
    ringVisuals.sync(mission, 42.0);
    plane.update(state, { pitch: 0.16, roll: 0.05 }, 0, 42.0, false);
    plane.setPropSpin(2.05, 0.38);

    camera.position.set(state.pos.x + 1.8, state.pos.y + 5.2, state.pos.z + 18.2);
    camera.lookAt(RUNWAY.x, RUNWAY.y + 2.5, RUNWAY.zStart - 120);

    setOverlayState('flying');
    hud.update(state, mission, false);
    return { state, mission };
  }

  // 'complete' pose: cleanly landed on Runway 36 beside the mail hangar & windsock with debrief overlay.
  const mission = createMission('ring-run');
  mission.ringsCleared = 8;
  mission.nextRingIndex = 8;
  mission.elapsed = 96.4;
  mission.timer = 96.4;
  mission.score = 5490;
  mission.landingGrade = 'GREASER';
  mission.status = 'complete';
  for (let i = 0; i < 8; i++) mission.rings[i].cleared = true;
  setMissionBanner(mission, 'MAIL DELIVERED — GREASER LANDING (142 FPM)', 'success', 10);

  const state = createFlightState({
    x: -4.5,
    y: RUNWAY.y + FLIGHT_CONFIG.gearOffset,
    z: RUNWAY.zStart - 155,
    speed: 0,
    yaw: -0.52,
    pitch: 0.04,
    roll: 0,
    throttle: 0,
    fuel: 19,
  });
  state.hull = 96;
  state.agl = 0;
  state.vsiFpm = 0;
  state.onGround = true;
  state.landedStop = true;
  state.touchdownFpm = 142;

  world.applyLighting('ring-run');
  world.update(55.0, new THREE.Vector3(state.pos.x, state.pos.y, state.pos.z));
  ringVisuals.sync(mission, 55.0);
  plane.update(state, zeroInput, 0, 55.0, false);
  plane.setPropSpin(0.35, 0.08);

  // Frame the parked bush plane + hangar on the left half of Runway 36 beside the Mission Complete card.
  camera.position.set(11.0, RUNWAY.y + 6.0, state.pos.z + 20.5);
  camera.lookAt(4.8, RUNWAY.y + 2.8, state.pos.z - 4.0);

  updateCompleteCard(mission, state);
  setOverlayState('complete');
  hud.update(state, mission, false);
  return { state, mission };
}
