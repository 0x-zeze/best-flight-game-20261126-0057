import { getActiveWaypoint } from './missions.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function formatClock(seconds) {
  const s = Math.max(0, seconds);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  return `${String(mins).padStart(2, '0')}:${rem < 10 ? '0' : ''}${rem.toFixed(1)}`;
}

function drawArtificialHorizon(canvas, pitchRad, rollRad, slipNorm) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = 148;
  const h = 114;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.52;
  const pitchPx = clamp(pitchRad * (180 / Math.PI) * 2.1, -46, 46);

  // Clip inner attitude globe.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 10);
  ctx.clip();

  // Rotate sky/ground world opposite aircraft bank.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-rollRad);
  ctx.translate(0, pitchPx);

  // Sky & warm canyon earth split.
  const skyGrad = ctx.createLinearGradient(0, -120, 0, 0);
  skyGrad.addColorStop(0, '#124a84');
  skyGrad.addColorStop(1, '#3b8ad1');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-130, -140, 260, 140);

  const groundGrad = ctx.createLinearGradient(0, 0, 0, 120);
  groundGrad.addColorStop(0, '#a6572b');
  groundGrad.addColorStop(1, '#542712');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-130, 0, 260, 140);

  // Crisp horizon bar.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-120, 0);
  ctx.lineTo(120, 0);
  ctx.stroke();

  // Pitch ladder ticks (+/- 10, +/- 20 deg).
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  for (const deg of [-20, -10, 10, 20]) {
    const py = -deg * 2.1;
    const half = Math.abs(deg) === 10 ? 18 : 26;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-half, py);
    ctx.lineTo(half, py);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.abs(deg)}`, -half - 4, py);
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.abs(deg)}`, half + 4, py);
  }
  ctx.restore();

  // Bank scale arc along top bezel.
  ctx.strokeStyle = 'rgba(235,245,255,0.75)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(cx, cy, 46, -Math.PI * 0.82, -Math.PI * 0.18);
  ctx.stroke();

  for (const deg of [-45, -30, -15, 0, 15, 30, 45]) {
    const a = -Math.PI / 2 + (deg * Math.PI) / 180;
    const r0 = deg === 0 ? 40 : 42;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46);
    ctx.stroke();
  }

  // Rolling bank pointer triangle.
  const ptrAngle = -Math.PI / 2 - clamp(rollRad, -0.95, 0.95);
  const px = cx + Math.cos(ptrAngle) * 41;
  const py = cy + Math.sin(ptrAngle) * 41;
  ctx.fillStyle = '#ffd046';
  ctx.beginPath();
  ctx.arc(px, py, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Fixed yellow center aircraft reticle.
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(cx - 28, cy);
  ctx.lineTo(cx - 9, cy);
  ctx.lineTo(cx - 9, cy + 5);
  ctx.moveTo(cx + 28, cy);
  ctx.lineTo(cx + 9, cy);
  ctx.lineTo(cx + 9, cy + 5);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Slip indicator capsule at bottom.
  ctx.fillStyle = 'rgba(10, 18, 28, 0.72)';
  ctx.fillRect(cx - 24, h - 16, 48, 8);
  ctx.fillStyle = '#e7f4ff';
  ctx.beginPath();
  ctx.arc(cx + clamp(slipNorm, -1, 1) * 16, h - 12, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Bezel border.
  ctx.strokeStyle = 'rgba(180, 220, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 10);
  ctx.stroke();
  ctx.restore();
}

function drawCompassStrip(canvas, headingDeg, targetBearingDeg) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = 310;
  const h = 44;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const cx = w * 0.5;
  const pxPerDeg = 2.6;

  // Draw ticks covering +/- 65 degrees around current heading.
  const startDeg = Math.floor((headingDeg - 65) / 5) * 5;
  const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let d = startDeg; d <= headingDeg + 65; d += 5) {
    const x = cx + (d - headingDeg) * pxPerDeg;
    if (x < 8 || x > w - 8) continue;
    const norm = ((d % 360) + 360) % 360;
    const major = norm % 15 === 0;

    ctx.strokeStyle = major ? 'rgba(230, 245, 255, 0.92)' : 'rgba(170, 205, 230, 0.45)';
    ctx.lineWidth = major ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(x, h - 2);
    ctx.lineTo(x, h - (major ? 12 : 7));
    ctx.stroke();

    if (norm % 30 === 0 || labels[norm]) {
      const txt = labels[norm] ?? String(norm).padStart(3, '0');
      ctx.fillStyle = labels[norm] ? '#ffd24c' : '#d8ecff';
      ctx.font = labels[norm] ? 'bold 11px ui-monospace, monospace' : '10px ui-monospace, monospace';
      ctx.fillText(txt, x, 13);
    }
  }

  // Target bearing diamond bug.
  let diff = ((targetBearingDeg - headingDeg + 540) % 360) - 180;
  const bugX = clamp(cx + diff * pxPerDeg, 12, w - 12);
  ctx.fillStyle = '#ffae2b';
  ctx.beginPath();
  ctx.moveTo(bugX, 2);
  ctx.lineTo(bugX + 6, 8);
  ctx.lineTo(bugX, 14);
  ctx.lineTo(bugX - 6, 8);
  ctx.closePath();
  ctx.fill();

  // Center lubber triangle.
  ctx.fillStyle = '#53f3c3';
  ctx.beginPath();
  ctx.moveTo(cx, h - 1);
  ctx.lineTo(cx - 5, h - 8);
  ctx.lineTo(cx + 5, h - 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function createHud() {
  const el = {
    root: document.getElementById('hud'),
    modeLabel: document.getElementById('hud-mode'),
    rings: document.getElementById('hud-rings'),
    score: document.getElementById('hud-score'),
    timer: document.getElementById('hud-timer'),
    muteBadge: document.getElementById('hud-mute'),
    headingVal: document.getElementById('hud-hdg-val'),
    compassCanvas: document.getElementById('compass-canvas'),
    horizonCanvas: document.getElementById('horizon-canvas'),
    iasVal: document.getElementById('hud-ias'),
    iasBar: document.getElementById('hud-ias-fill'),
    stallTag: document.getElementById('hud-stall'),
    thrVal: document.getElementById('hud-thr-val'),
    thrBar: document.getElementById('hud-thr-fill'),
    brakeTag: document.getElementById('hud-brake'),
    altVal: document.getElementById('hud-alt'),
    aglVal: document.getElementById('hud-agl'),
    vsiVal: document.getElementById('hud-vsi'),
    liftCard: document.getElementById('hud-lift-card'),
    liftTitle: document.getElementById('hud-lift-title'),
    liftRate: document.getElementById('hud-lift-rate'),
    liftBar: document.getElementById('hud-lift-fill'),
    fuelVal: document.getElementById('hud-fuel-val'),
    fuelBar: document.getElementById('hud-fuel-fill'),
    fuelCard: document.getElementById('hud-fuel-card'),
    hullVal: document.getElementById('hud-hull-val'),
    hullBar: document.getElementById('hud-hull-fill'),
    wpLabel: document.getElementById('hud-wp-label'),
    wpDist: document.getElementById('hud-wp-dist'),
    banner: document.getElementById('hud-banner'),
  };

  function update(state, mission, audioMuted) {
    const knots = Math.round(state.speed * 1.94384);
    const altFt = Math.round(state.pos.y * 3.28084);
    const aglFt = Math.round(state.agl * 3.28084);
    const hdg = Math.round(state.headingDeg) % 360;

    el.modeLabel.textContent = mission.mode.name.toUpperCase();
    el.rings.textContent = mission.mode.requireRings
      ? `${mission.ringsCleared}/${mission.totalRings}`
      : 'LANDING';
    el.score.textContent = mission.score.toLocaleString('en-US');
    el.timer.textContent = formatClock(mission.timer);
    el.timer.classList.toggle('warn', mission.mode.timed && mission.timer < 15);
    el.muteBadge.textContent = audioMuted ? 'SFX OFF (M)' : 'SFX ON (M)';
    el.muteBadge.classList.toggle('muted', audioMuted);

    // Waypoint bearing & distance.
    const wp = getActiveWaypoint(mission);
    const dx = wp.x - state.pos.x;
    const dz = wp.z - state.pos.z;
    const distM = Math.round(Math.hypot(dx, dz));
    const bearingRad = Math.atan2(dx, -dz);
    const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360;

    el.headingVal.textContent = `${String(hdg).padStart(3, '0')}°`;
    drawCompassStrip(el.compassCanvas, state.headingDeg, bearingDeg);
    drawArtificialHorizon(el.horizonCanvas, state.pitch, state.roll, -state.roll * 0.45);

    // Airspeed, stall, throttle, airbrake.
    el.iasVal.textContent = String(knots).padStart(2, '0');
    el.iasBar.style.height = `${clamp((knots / 140) * 100, 4, 100)}%`;
    el.iasBar.classList.toggle('danger', state.stalling);
    el.stallTag.classList.toggle('active', state.stalling);

    const thrPct = Math.round(state.throttle * 100);
    el.thrVal.textContent = `${thrPct}%`;
    el.thrBar.style.width = `${thrPct}%`;
    el.brakeTag.classList.toggle('active', state.airbrake);

    // Altitude, AGL, VSI.
    el.altVal.textContent = String(altFt);
    el.aglVal.textContent = `${aglFt} AGL`;
    const vsiSign = state.vsiFpm >= 0 ? '+' : '';
    el.vsiVal.textContent = `VSI ${vsiSign}${state.vsiFpm}`;
    el.vsiVal.classList.toggle('climb', state.vsiFpm > 120);
    el.vsiVal.classList.toggle('sink', state.vsiFpm < -450);

    // Ridge lift / thermal indicator.
    el.liftCard.classList.toggle('active', state.liftActive);
    if (state.liftActive) {
      const label = state.liftSource === 'THERMAL' ? '▲ THERMAL LIFT' : '▲ RIDGE LIFT';
      el.liftTitle.textContent = label;
      el.liftRate.textContent = `+${state.liftRate.toFixed(1)} m/s`;
      el.liftBar.style.width = `${clamp((state.liftRate / 6.8) * 100, 15, 100)}%`;
    } else {
      el.liftTitle.textContent = 'RIDGE LIFT';
      el.liftRate.textContent = '0.0 m/s';
      el.liftBar.style.width = '0%';
    }

    // Fuel & airframe hull.
    const fuelPct = Math.round(state.fuel);
    el.fuelVal.textContent = `${fuelPct}%`;
    el.fuelBar.style.width = `${clamp(fuelPct, 0, 100)}%`;
    el.fuelCard.classList.toggle('low', fuelPct <= 25);

    const hullPct = Math.round(state.hull);
    el.hullVal.textContent = `${hullPct}%`;
    el.hullBar.style.width = `${clamp(hullPct, 0, 100)}%`;
    el.hullBar.classList.toggle('warn', hullPct < 60);
    el.hullBar.classList.toggle('danger', hullPct < 30);

    el.wpLabel.textContent = wp.label;
    el.wpDist.textContent = distM >= 1000 ? `${(distM / 1000).toFixed(2)} km` : `${distM} m`;

    // Tactical message banner.
    let msg = '';
    let kind = 'info';
    if (state.stalling && !state.onGround) {
      msg = 'STALL WARNING — LOWER NOSE OR ADD THROTTLE';
      kind = 'danger';
    } else if (mission.bannerTimer > 0 && mission.bannerText) {
      msg = mission.bannerText;
      kind = mission.bannerKind;
    } else if (state.fuel <= 0 && !state.onGround) {
      msg = 'FUEL EMPTY — DEADSTICK GLIDE TO RUNWAY 36';
      kind = 'warn';
    } else if (state.liftActive) {
      msg = `${state.liftSource === 'THERMAL' ? 'THERMAL' : 'RIDGE LIFT'} ACTIVE — CUT THROTTLE TO SAVE FUEL`;
      kind = 'lift';
    } else if (state.onGround && !state.landedStop) {
      msg = 'TOUCHDOWN — HOLD SPACE FOR WHEEL BRAKES';
      kind = 'success';
    }

    if (msg) {
      el.banner.textContent = msg;
      el.banner.className = `hud-banner visible ${kind}`;
    } else {
      el.banner.className = 'hud-banner';
    }
  }

  return { update };
}
