import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlane } from './plane.js';
import { createFlightState, stepFlightPhysics } from './physics.js';
import { MODES, createMission, createRingVisuals, setMissionBanner, updateMission } from './missions.js';
import { createHud, formatClock } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { applyShotPose, parseShotParams } from './shots.js';

const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.6, 5400);

const { shot, seed } = parseShotParams();
const world = createWorld(scene, seed);
const plane = createPlane(scene);
const ringVisuals = createRingVisuals(scene);
const hud = createHud();
const audio = createAudio();

// Crash smoke puffs (reused pool for instant visual readability on impact).
const smokeGroup = new THREE.Group();
const smokeMat = new THREE.MeshStandardMaterial({ color: 0x2d2926, roughness: 1, transparent: true, opacity: 0.72 });
const smokePuffs = Array.from({ length: 10 }, (_, i) => {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 + (i % 3) * 0.7, 0), smokeMat);
  smokeGroup.add(m);
  return { mesh: m, offset: i * 0.42 };
});
smokeGroup.visible = false;
scene.add(smokeGroup);

const overlays = {
  menu: document.getElementById('overlay-menu'),
  paused: document.getElementById('overlay-paused'),
  crashed: document.getElementById('overlay-crashed'),
  complete: document.getElementById('overlay-complete'),
};

let gameState = 'menu'; // menu | flying | paused | crashed | complete
let selectedModeId = 'ring-run';
let mission = createMission(selectedModeId);
let flight = createFlightState(mission.mode.spawn);
let simTime = 0;
let shakeAmount = 0;

const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const desiredCamPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
let camInit = false;

function setOverlayState(next) {
  gameState = next;
  overlays.menu.classList.toggle('hidden', next !== 'menu');
  overlays.paused.classList.toggle('hidden', next !== 'paused');
  overlays.crashed.classList.toggle('hidden', next !== 'crashed');
  overlays.complete.classList.toggle('hidden', next !== 'complete');
}

function updateCompleteCard(m, st) {
  document.getElementById('cmp-mode').textContent = m.mode.name.toUpperCase();
  document.getElementById('cmp-rings').textContent = m.mode.requireRings ? `${m.ringsCleared}/${m.totalRings}` : 'DIRECT';
  document.getElementById('cmp-time').textContent = formatClock(m.elapsed);
  document.getElementById('cmp-fuel').textContent = `${Math.round(st.fuel)}%`;
  document.getElementById('cmp-grade').textContent = `${m.landingGrade || 'SMOOTH'} (${st.touchdownFpm ?? 160} fpm)`;
  document.getElementById('cmp-score').textContent = m.score.toLocaleString('en-US');
}

function updateCrashedCard(m, st) {
  document.getElementById('crash-reason').textContent = m.failReason || st.crashReason || 'AIRCRAFT CRASHED';
  document.getElementById('crash-rings').textContent = m.mode.requireRings ? `${m.ringsCleared}/${m.totalRings}` : 'APPROACH';
  document.getElementById('crash-fuel').textContent = `${Math.round(st.fuel)}%`;
  document.getElementById('crash-score').textContent = m.score.toLocaleString('en-US');
}

function startSortie(modeId = selectedModeId) {
  selectedModeId = modeId;
  mission = createMission(modeId);
  flight = createFlightState(mission.mode.spawn);
  world.applyLighting(modeId);
  smokeGroup.visible = false;
  shakeAmount = 0;
  camInit = false;
  setOverlayState('flying');
  audio.ensureStarted();
}

function updateChaseCamera(dt, inputs) {
  const yaw = flight.yaw + (inputs?.orbitYaw ?? 0);
  const pitchOffset = inputs?.orbitPitch ?? 0;
  const dist = 18.5 + Math.max(0, (flight.speed - 36) * 0.14);
  const height = 5.4 + pitchOffset * 12;

  desiredCamPos.set(
    flight.pos.x + Math.sin(yaw) * dist,
    flight.pos.y + height,
    flight.pos.z + Math.cos(yaw) * dist,
  );

  // Never clip the chase camera underground.
  const camGround = world.terrainHeight(desiredCamPos.x, desiredCamPos.z) + 3.2;
  if (desiredCamPos.y < camGround) desiredCamPos.y = camGround;

  const lookAhead = 46;
  desiredLook.set(
    flight.pos.x - Math.sin(flight.yaw) * lookAhead,
    flight.pos.y + 1.5 + Math.sin(flight.pitch) * 16,
    flight.pos.z - Math.cos(flight.yaw) * lookAhead,
  );

  if (!camInit) {
    camPos.copy(desiredCamPos);
    camTarget.copy(desiredLook);
    camInit = true;
  } else {
    const posAlpha = 1 - Math.exp(-dt * 6.8);
    const lookAlpha = 1 - Math.exp(-dt * 9.5);
    camPos.lerp(desiredCamPos, posAlpha);
    camTarget.lerp(desiredLook, lookAlpha);
  }

  if (shakeAmount > 0.01) {
    camPos.x += Math.sin(simTime * 57) * shakeAmount;
    camPos.y += Math.cos(simTime * 49) * shakeAmount;
    shakeAmount = Math.max(0, shakeAmount - dt * 3.2);
  }

  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

const input = createInput(canvas, {
  onUserGesture: () => audio.ensureStarted(),
  onPause: () => {
    if (gameState === 'flying') setOverlayState('paused');
    else if (gameState === 'paused') setOverlayState('flying');
  },
  onRestart: () => {
    if (gameState !== 'menu') startSortie(selectedModeId);
  },
  onMute: () => {
    audio.ensureStarted();
    audio.toggleMute();
    hud.update(flight, mission, audio.isMuted());
  },
});

// Wire menu mode selector cards & action buttons.
document.querySelectorAll('.mode-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedModeId = btn.dataset.mode;
    document.querySelectorAll('.mode-card').forEach((b) => b.classList.toggle('selected', b === btn));
    world.applyLighting(selectedModeId);
    mission = createMission(selectedModeId);
    flight = createFlightState(mission.mode.spawn);
  });
});

document.getElementById('btn-fly').addEventListener('click', () => startSortie(selectedModeId));
document.getElementById('btn-resume').addEventListener('click', () => setOverlayState('flying'));
document.getElementById('btn-pause-restart').addEventListener('click', () => startSortie(selectedModeId));
document.getElementById('btn-pause-menu').addEventListener('click', () => setOverlayState('menu'));
document.getElementById('btn-crash-retry').addEventListener('click', () => startSortie(selectedModeId));
document.getElementById('btn-crash-menu').addEventListener('click', () => setOverlayState('menu'));
document.getElementById('btn-cmp-again').addEventListener('click', () => startSortie(selectedModeId));
document.getElementById('btn-cmp-next').addEventListener('click', () => {
  const order = Object.keys(MODES);
  const nextId = order[(order.indexOf(selectedModeId) + 1) % order.length];
  startSortie(nextId);
});
document.getElementById('btn-cmp-menu').addEventListener('click', () => setOverlayState('menu'));

const invertCheck = document.getElementById('opt-invert');
const wsThrottleCheck = document.getElementById('opt-ws-throttle');
invertCheck.addEventListener('change', () => input.setInvertPitch(invertCheck.checked));
wsThrottleCheck.addEventListener('change', () => input.setWsThrottle(wsThrottleCheck.checked));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (shot) renderer.render(scene, camera);
});

// Deterministic screenshot mode: freeze a single seeded frame and skip RAF drift.
if (shot) {
  const posed = applyShotPose(shot, {
    world,
    plane,
    ringVisuals,
    hud,
    camera,
    setOverlayState,
    updateCompleteCard,
  });
  flight = posed.state;
  mission = posed.mission;
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    window.__SHOT_READY = true;
  });
} else {
  let lastTs = performance.now();

  function tick(ts) {
    requestAnimationFrame(tick);
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    if (gameState === 'menu') {
      simTime += dt;
      // Scenic live flyover camera above the canyon behind the title screen.
      const orbitZ = -2050 + Math.sin(simTime * 0.12) * 180;
      const focus = new THREE.Vector3(0, 88, orbitZ - 260);
      flight.pos.x = Math.sin(simTime * 0.35) * 38;
      flight.pos.y = 108 + Math.sin(simTime * 0.6) * 5;
      flight.pos.z = orbitZ;
      flight.yaw = Math.cos(simTime * 0.35) * 0.14;
      flight.roll = Math.cos(simTime * 0.35) * 0.22;
      flight.pitch = 0.02;
      flight.headingDeg = (((-flight.yaw * 180) / Math.PI) % 360 + 360) % 360;

      world.update(simTime, new THREE.Vector3(flight.pos.x, flight.pos.y, flight.pos.z));
      ringVisuals.sync(mission, simTime);
      plane.update(flight, { pitch: 0, roll: 0 }, dt, simTime, selectedModeId === 'dusk-landing');
      camera.position.set(flight.pos.x + 22, flight.pos.y + 7, flight.pos.z + 24);
      camera.lookAt(focus);
      hud.update(flight, mission, audio.isMuted());
      audio.update(flight, false);
      renderer.render(scene, camera);
      return;
    }

    if (gameState === 'flying') {
      simTime += dt;
      const sampled = input.sample(dt);
      const physEvents = stepFlightPhysics(flight, sampled, world, dt, mission.mode);
      const missEvents = updateMission(mission, flight, dt);

      if (physEvents.touchdown) {
        audio.playTouchdown(physEvents.touchdownSoft);
        shakeAmount = physEvents.touchdownSoft ? 0.25 : 0.75;
        setMissionBanner(
          mission,
          `TOUCHDOWN ${flight.touchdownFpm} FPM — HOLD SPACE TO BRAKE`,
          physEvents.touchdownSoft ? 'success' : 'warn',
          3.6,
        );
      }
      if (physEvents.scrape) {
        audio.playScrape();
        shakeAmount = 0.9;
        setMissionBanner(mission, `TERRAIN SCRAPE — HULL ${Math.round(flight.hull)}%`, 'warn', 2.4);
      }
      if (physEvents.fuelEmpty) {
        setMissionBanner(mission, 'FUEL DEPLETED — RIDE RIDGE LIFT TO STRIP!', 'warn', 4.5);
      }
      if (missEvents.ringCleared) {
        audio.playRingChime(missEvents.ringIndex);
      }
      if (physEvents.crash || missEvents.failed) {
        audio.playCrash();
        shakeAmount = 1.6;
        smokeGroup.visible = true;
        smokeGroup.position.set(flight.pos.x, flight.pos.y, flight.pos.z);
        updateCrashedCard(mission, flight);
        setOverlayState('crashed');
      } else if (missEvents.completed) {
        audio.playComplete();
        updateCompleteCard(mission, flight);
        setOverlayState('complete');
      }

      world.update(simTime, new THREE.Vector3(flight.pos.x, flight.pos.y, flight.pos.z));
      ringVisuals.sync(mission, simTime);
      plane.update(flight, sampled, dt, simTime, mission.mode.id === 'dusk-landing');
      updateChaseCamera(dt, sampled);
      hud.update(flight, mission, audio.isMuted());
      audio.update(flight, true);
    } else if (gameState === 'crashed') {
      simTime += dt;
      for (const p of smokePuffs) {
        const phase = (simTime * 0.55 + p.offset) % 1;
        p.mesh.position.set(Math.sin(phase * 6 + p.offset) * 2.4, phase * 18, Math.cos(phase * 5) * 2.1);
        p.mesh.scale.setScalar(0.6 + phase * 1.9);
      }
      world.update(simTime, new THREE.Vector3(flight.pos.x, flight.pos.y, flight.pos.z));
      camera.position.set(
        flight.pos.x + Math.cos(simTime * 0.35) * 26,
        flight.pos.y + 11,
        flight.pos.z + Math.sin(simTime * 0.35) * 26,
      );
      camera.lookAt(flight.pos.x, flight.pos.y + 2, flight.pos.z);
      audio.update(flight, false);
    } else if (gameState === 'complete') {
      simTime += dt;
      world.update(simTime, new THREE.Vector3(flight.pos.x, flight.pos.y, flight.pos.z));
      camera.position.set(
        flight.pos.x + Math.sin(simTime * 0.22 + 0.6) * 26,
        flight.pos.y + 6.5,
        flight.pos.z + Math.cos(simTime * 0.22 + 0.6) * 26,
      );
      camera.lookAt(flight.pos.x - 3, flight.pos.y + 2, flight.pos.z - 2);
      audio.update(flight, false);
    } else {
      audio.update(flight, false);
    }

    renderer.render(scene, camera);
  }

  world.applyLighting(selectedModeId);
  ringVisuals.sync(mission, 0);
  hud.update(flight, mission, false);
  requestAnimationFrame(tick);
}
