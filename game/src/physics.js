import { WATER_Y } from './world.js';

export const FLIGHT_CONFIG = {
  gearOffset: 1.75,
  stallSpeed: 23.5,
  cruiseSpeed: 44.0,
  maxSpeed: 70.0,
  gravity: 9.81,
  maxThrust: 19.5,
  baseDrag: 0.0082,
  airbrakeDrag: 0.022,
  wheelBrakeDecel: 13.5,
};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createFlightState(spawn) {
  const speed = spawn.speed ?? 44;
  const yaw = spawn.yaw ?? 0;
  const pitch = spawn.pitch ?? 0;
  const fx = -Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * Math.cos(pitch);

  return {
    pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    vel: { x: fx * speed, y: fy * speed, z: fz * speed },
    speed,
    pitch,
    roll: spawn.roll ?? 0,
    yaw,
    throttle: spawn.throttle ?? 0.68,
    airbrake: false,
    fuel: spawn.fuel ?? 100,
    hull: 100,
    agl: 60,
    vsiFpm: 0,
    headingDeg: (((-yaw * 180) / Math.PI) % 360 + 360) % 360,
    liftActive: false,
    liftRate: 0,
    liftSource: null,
    stalling: false,
    onGround: false,
    landedStop: false,
    touchdownFpm: null,
    crashed: false,
    crashReason: '',
    scrapeCooldown: 0,
  };
}

export function stepFlightPhysics(state, inputs, world, dt, modeConfig) {
  const events = { touchdown: false, touchdownSoft: true, scrape: false, crash: false, fuelEmpty: false };
  if (state.crashed || state.landedStop) return events;

  const hadFuel = state.fuel > 0;
  state.throttle = clamp(state.throttle + inputs.throttleDelta * dt * 0.72, 0, 1);
  state.airbrake = inputs.airbrake;
  if (state.scrapeCooldown > 0) state.scrapeCooldown = Math.max(0, state.scrapeCooldown - dt);

  // Fuel consumption scales quadratically with throttle so cutting throttle in ridge lift saves real fuel.
  const burnRate = (0.14 + 0.92 * state.throttle * state.throttle) * (modeConfig.fuelBurnMult ?? 1.0);
  state.fuel = Math.max(0, state.fuel - burnRate * dt);
  if (hadFuel && state.fuel <= 0) events.fuelEmpty = true;

  const effectiveThrottle = state.fuel > 0 ? state.throttle : 0;

  if (state.onGround) {
    // Runway rollout steering, wheel braking, and takeoff capability if player guns throttle.
    state.roll *= Math.max(0, 1 - dt * 8);
    state.pitch = clamp(state.pitch * (1 - dt * 6) + inputs.pitch * dt * 0.45, -0.05, 0.24);
    state.yaw += -inputs.roll * dt * 0.75 * clamp(state.speed / 15, 0.2, 1);

    const thrustAcc = effectiveThrottle * FLIGHT_CONFIG.maxThrust * 0.88;
    const brakeAcc = state.airbrake ? FLIGHT_CONFIG.wheelBrakeDecel : 0;
    const rollDrag = 2.1 + state.speed * 0.045;
    state.speed = clamp(state.speed + (thrustAcc - brakeAcc - rollDrag) * dt, 0, FLIGHT_CONFIG.maxSpeed);

    const fx = -Math.sin(state.yaw);
    const fz = -Math.cos(state.yaw);
    state.vel.x = fx * state.speed;
    state.vel.z = fz * state.speed;
    state.vel.y = 0;

    state.pos.x += state.vel.x * dt;
    state.pos.z += state.vel.z * dt;
    const groundY = world.terrainHeight(state.pos.x, state.pos.z);
    state.pos.y = groundY + FLIGHT_CONFIG.gearOffset;
    state.agl = 0;
    state.vsiFpm = 0;
    state.liftActive = false;
    state.liftRate = 0;
    state.liftSource = null;
    state.stalling = false;

    // Liftoff again if accelerating past takeoff speed with nose pulled up.
    if (state.speed > FLIGHT_CONFIG.stallSpeed + 6 && state.pitch > 0.1) {
      state.onGround = false;
      state.vel.y = 4.5;
    } else if (!world.isOnRunway(state.pos.x, state.pos.z, 8) && state.speed > 14) {
      // Rolling off the strip onto rough canyon rock damages gear.
      state.hull = Math.max(0, state.hull - dt * 26);
      if (state.scrapeCooldown <= 0) {
        events.scrape = true;
        state.scrapeCooldown = 0.7;
      }
      if (state.hull <= 0) {
        state.crashed = true;
        state.crashReason = 'OVERRAN RUNWAY';
        events.crash = true;
      }
    } else if (state.speed < 2.2 && effectiveThrottle < 0.12 && world.isOnRunway(state.pos.x, state.pos.z, 4)) {
      state.speed = 0;
      state.landedStop = true;
    }

    state.headingDeg = (((-state.yaw * 180) / Math.PI) % 360 + 360) % 360;
    return events;
  }

  // Airborne aerodynamics: control authority scales cleanly with airflow speed.
  const controlAuth = clamp(state.speed / 34, 0.35, 1.15);
  const rollRate = 1.65 * controlAuth;
  const pitchRate = 1.12 * controlAuth;

  if (Math.abs(inputs.roll) > 0.01) {
    state.roll = clamp(state.roll - inputs.roll * rollRate * dt, -1.18, 1.18);
  } else {
    // Gentle dihedral self-leveling so the plane feels steady through narrow gorges.
    state.roll *= Math.max(0, 1 - dt * 1.15);
  }

  // Coordinated bank-to-turn yaw: banking right (roll < 0) turns right (dyaw < 0).
  const turnFactor = clamp(state.speed / FLIGHT_CONFIG.cruiseSpeed, 0.45, 1.3);
  state.yaw += Math.sin(state.roll) * 1.05 * dt / Math.max(0.65, turnFactor * 0.85);

  const stalling = state.speed < FLIGHT_CONFIG.stallSpeed;
  state.stalling = stalling;

  if (Math.abs(inputs.pitch) > 0.01) {
    state.pitch = clamp(state.pitch + inputs.pitch * pitchRate * dt, -0.68, 0.62);
  } else if (!stalling) {
    state.pitch *= Math.max(0, 1 - dt * 0.45);
  }

  // Stall nose drop helps the pilot recover airspeed naturally.
  if (stalling) {
    const deficit = (FLIGHT_CONFIG.stallSpeed - state.speed) / FLIGHT_CONFIG.stallSpeed;
    state.pitch = clamp(state.pitch - (0.35 + deficit * 0.9) * dt, -0.65, 0.55);
  }

  // Forward unit vector in YXZ Euler convention (yaw=0 -> North -Z).
  const cp = Math.cos(state.pitch);
  const fx = -Math.sin(state.yaw) * cp;
  const fy = Math.sin(state.pitch);
  const fz = -Math.cos(state.yaw) * cp;

  // Longitudinal speed integration: thrust, quadratic drag, airbrake, and gravity slope component.
  const dragCoeff = FLIGHT_CONFIG.baseDrag + (state.airbrake ? FLIGHT_CONFIG.airbrakeDrag : 0);
  const thrustAcc = effectiveThrottle * FLIGHT_CONFIG.maxThrust;
  const dragAcc = dragCoeff * state.speed * state.speed;
  const gravitySlope = -FLIGHT_CONFIG.gravity * fy * 0.92;
  const bankDrag = Math.abs(Math.sin(state.roll)) * 1.4;

  state.speed = clamp(
    state.speed + (thrustAcc - dragAcc + gravitySlope - bankDrag) * dt,
    13.5,
    FLIGHT_CONFIG.maxSpeed,
  );

  // Sample ridge lift & sunny thermals.
  const windScale = modeConfig.windScale ?? 1.0;
  const liftSample = world.sampleLift(state.pos.x, state.pos.y, state.pos.z, windScale);
  state.liftRate = liftSample.liftRate;
  state.liftSource = liftSample.source;
  state.liftActive = liftSample.liftRate > 0.55;

  // Vertical speed combines flight path + wing lift deficit when stalling/banking + free ridge lift!
  const speedRatio = clamp(state.speed / FLIGHT_CONFIG.cruiseSpeed, 0.35, 1.35);
  const wingLiftSupport = clamp(speedRatio * speedRatio * Math.cos(state.roll), 0.25, 1.15);
  const sinkFromDeficit = (1 - Math.min(1, wingLiftSupport)) * 11.5;

  // Gentle crosswind drift adds realism on Dusk Landing & canyon crossings.
  const crossDriftX = modeConfig.windScale > 1.0 ? 2.4 * (modeConfig.windScale - 0.8) : 0.7;

  const targetVx = fx * state.speed + crossDriftX;
  const targetVy = fy * state.speed - sinkFromDeficit + state.liftRate;
  const targetVz = fz * state.speed;

  // Smooth inertia coupling so velocity feels weighty yet responsive.
  const blend = clamp(dt * 5.2, 0, 1);
  state.vel.x += (targetVx - state.vel.x) * blend;
  state.vel.y += (targetVy - state.vel.y) * blend;
  state.vel.z += (targetVz - state.vel.z) * blend;

  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;
  state.pos.z += state.vel.z * dt;

  // Soft canyon perimeter ceiling & bounds so the pilot never flies off the heightfield.
  state.pos.x = clamp(state.pos.x, -1120, 1120);
  state.pos.z = clamp(state.pos.z, -3950, 420);
  state.pos.y = Math.min(state.pos.y, 440);

  const groundY = world.terrainHeight(state.pos.x, state.pos.z);
  state.agl = Math.max(0, state.pos.y - groundY - FLIGHT_CONFIG.gearOffset);
  state.vsiFpm = Math.round(state.vel.y * 196.85);
  state.headingDeg = (((-state.yaw * 180) / Math.PI) % 360 + 360) % 360;

  // Water impact check.
  if (state.pos.y <= WATER_Y + 0.9) {
    state.pos.y = WATER_Y + 0.8;
    state.crashed = true;
    state.crashReason = 'RIVER IMPACT';
    state.hull = 0;
    events.crash = true;
    return events;
  }

  // Terrain & runway contact check.
  if (state.pos.y <= groundY + FLIGHT_CONFIG.gearOffset) {
    const sinkRate = Math.max(0, -state.vel.y);
    const onStrip = world.isOnRunway(state.pos.x, state.pos.z, 4);
    const wingsLevel = Math.abs(state.roll) < 0.44;
    const noseSafe = state.pitch > -0.26;

    if (onStrip && wingsLevel && noseSafe && sinkRate < 11.5 && state.speed < 58) {
      state.pos.y = groundY + FLIGHT_CONFIG.gearOffset;
      state.onGround = true;
      state.vel.y = 0;
      state.pitch = Math.max(0, state.pitch * 0.4);
      state.roll = 0;
      state.touchdownFpm = Math.round(sinkRate * 196.85);
      events.touchdown = true;
      events.touchdownSoft = sinkRate < 5.5;
      if (sinkRate > 6.5) {
        const dmg = Math.round((sinkRate - 6.0) * 8);
        state.hull = Math.max(5, state.hull - dmg);
      }
      return events;
    }

    // Off-runway: shallow graze damages airframe and bounces; steep cliff impact crashes.
    const { dhdx, dhdz } = world.terrainSlope(state.pos.x, state.pos.z);
    const slope = Math.hypot(dhdx, dhdz);
    const hardHit = sinkRate > 7.8 || slope > 0.58 || Math.abs(state.roll) > 0.72 || state.speed > 52;

    if (hardHit) {
      state.pos.y = groundY + 1.1;
      state.crashed = true;
      state.crashReason = slope > 0.5 ? 'CANYON RIDGE IMPACT' : onStrip ? 'HARD LANDING IMPACT' : 'TERRAIN IMPACT';
      state.hull = 0;
      events.crash = true;
    } else {
      const dmg = Math.round(16 + sinkRate * 3.5);
      state.hull = Math.max(0, state.hull - dmg);
      state.pos.y = groundY + FLIGHT_CONFIG.gearOffset + 2.4;
      state.vel.y = Math.max(5.5, sinkRate * 0.7);
      state.pitch = Math.max(0.14, state.pitch + 0.14);
      state.speed = Math.max(22, state.speed * 0.84);
      if (state.hull <= 0) {
        state.crashed = true;
        state.crashReason = 'AIRFRAME DESTROYED';
        events.crash = true;
      } else if (state.scrapeCooldown <= 0) {
        events.scrape = true;
        state.scrapeCooldown = 0.8;
      }
    }
  }

  return events;
}
