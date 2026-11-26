import * as THREE from 'three';

export function createPlane(scene) {
  const group = new THREE.Group();
  const airframe = new THREE.Group();
  group.add(airframe);

  // Original "Kestrel-4" Canyon Mail Bush Plane livery.
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xf4eee0, roughness: 0.48, metalness: 0.08 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xd94524, roughness: 0.45, metalness: 0.12 });
  const navyMat = new THREE.MeshStandardMaterial({ color: 0x1e3550, roughness: 0.55, metalness: 0.15 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x262b33, roughness: 0.65, metalness: 0.5 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.92, metalness: 0.05 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x3b6e9c,
    emissive: 0x0b1f33,
    roughness: 0.15,
    metalness: 0.6,
    transparent: true,
    opacity: 0.78,
  });

  // Main cabin fuselage + engine cowling + tapered aft tailcone (forward is -Z).
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.45, 3.1), creamMat);
  cabin.position.set(0, 0.05, -0.2);
  airframe.add(cabin);

  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(1.61, 0.34, 3.12), redMat);
  stripeL.position.set(0, -0.06, -0.2);
  airframe.add(stripeL);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.42, 3.15), navyMat);
  belly.position.set(0, -0.52, -0.2);
  airframe.add(belly);

  const cowling = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.78, 1.75, 10), redMat);
  cowling.rotation.x = -Math.PI / 2;
  cowling.position.set(0, -0.02, -2.55);
  airframe.add(cowling);

  const cowlCap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.35, 10), navyMat);
  cowlCap.rotation.x = -Math.PI / 2;
  cowlCap.position.set(0, -0.02, -3.48);
  airframe.add(cowlCap);

  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.74, 4.1, 8), creamMat);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0.08, 3.25);
  airframe.add(tailCone);

  const tailStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.72, 3.5, 8), redMat);
  tailStripe.rotation.x = Math.PI / 2;
  tailStripe.scale.set(1.06, 0.34, 1);
  tailStripe.position.set(0, 0.02, 2.95);
  airframe.add(tailStripe);

  // Glazed cockpit canopy + pilot silhouette.
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.72, 1.55), glassMat);
  windshield.position.set(0, 0.76, -0.82);
  windshield.rotation.x = -0.18;
  airframe.add(windshield);

  const pilotHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshStandardMaterial({ color: 0xe6c38c, roughness: 0.5 }));
  pilotHead.position.set(0, 0.72, -0.58);
  airframe.add(pilotHead);

  // High STOL wing with slight dihedral + terracotta wingtips + moving ailerons.
  const wingCenter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 2.15), creamMat);
  wingCenter.position.set(0, 0.96, -0.35);
  airframe.add(wingCenter);

  const ailerons = [];
  for (const side of [-1, 1]) {
    const panel = new THREE.Group();
    panel.position.set(side * 0.95, 0.96, -0.35);
    panel.rotation.z = side * 0.035;

    const mainWing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 2.05), creamMat);
    mainWing.position.set(side * 2.2, 0, 0);
    panel.add(mainWing);

    const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.22, 0.46), navyMat);
    wingStripe.position.set(side * 2.2, 0, -0.68);
    panel.add(wingStripe);

    const wingTip = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.21, 1.92), redMat);
    wingTip.position.set(side * 4.82, 0.02, 0.05);
    panel.add(wingTip);

    // Deflectable aileron on outer trailing edge.
    const aileron = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.46), redMat);
    aileron.position.set(side * 3.4, -0.02, 1.05);
    panel.add(aileron);
    ailerons.push({ mesh: aileron, side });

    airframe.add(panel);

    // Wing brace strut joining underside of high wing cleanly into lower cabin edge.
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.28, 6), darkMetal);
    strut.position.set(side * 1.64, 0.24, -0.35);
    strut.rotation.z = -side * 0.93;
    airframe.add(strut);
  }

  // Empennage: vertical fin, moving rudder, horizontal tailplane, moving elevator.
  const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.85, 1.35), redMat);
  vFin.position.set(0, 1.05, 4.72);
  vFin.rotation.x = -0.22;
  airframe.add(vFin);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.72, 0.65), creamMat);
  rudder.position.set(0, 1.02, 5.55);
  airframe.add(rudder);

  const hStab = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.14, 1.15), creamMat);
  hStab.position.set(0, 0.34, 4.78);
  airframe.add(hStab);

  const elevator = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.11, 0.45), redMat);
  elevator.position.set(0, 0.34, 5.48);
  airframe.add(elevator);

  // Oversized backcountry tundra landing gear + tailwheel.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6), darkMetal);
    leg.position.set(side * 1.0, -0.98, -1.15);
    leg.rotation.z = side * 0.68;
    airframe.add(leg);

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.42, 12), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(side * 1.35, -1.42, -1.15);
    airframe.add(tire);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.45, 8), creamMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(side * 1.35, -1.42, -1.15);
    airframe.add(hub);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 8), tireMat);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.35, 5.0);
  airframe.add(tailWheel);

  // Spinning propeller assembly + translucent motion blur disc.
  const propGroup = new THREE.Group();
  propGroup.position.set(0, -0.02, -3.72);

  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.62, 8), creamMat);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.22;
  propGroup.add(spinner);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.2, 0.05), darkMetal);
  propGroup.add(blade);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.21, 0.06), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    tip.position.x = side * 1.06;
    propGroup.add(tip);
  }

  const blurMat = new THREE.MeshBasicMaterial({
    color: 0xd8dee6,
    transparent: true,
    opacity: 0.26,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const blurDisc = new THREE.Mesh(new THREE.RingGeometry(0.24, 1.18, 20), blurMat);
  propGroup.add(blurDisc);
  airframe.add(propGroup);

  // Navigation lights (left red, right green, tail white strobe, landing nose beam).
  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2f2f }));
  navRed.position.set(-6.15, 1.15, -0.32);
  airframe.add(navRed);

  const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0x30ff6e }));
  navGreen.position.set(6.15, 1.15, -0.32);
  airframe.add(navGreen);

  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tailStrobe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), strobeMat);
  tailStrobe.position.set(0, 1.98, 5.25);
  airframe.add(tailStrobe);

  const landingBeamMat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const landingCone = new THREE.Mesh(new THREE.ConeGeometry(2.0, 14, 10, 1, true), landingBeamMat);
  landingCone.rotation.x = Math.PI / 2;
  landingCone.position.set(0, -0.45, -10.5);
  airframe.add(landingCone);

  const headlamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff4c2 }));
  headlamp.position.set(0, -0.34, -3.55);
  airframe.add(headlamp);

  // Wingtip slipstream / ridge-lift ribbons.
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: 0xfff8e6,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ribbons = [];
  for (const side of [-1, 1]) {
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 7.5), ribbonMat);
    ribbon.rotation.x = Math.PI / 2;
    ribbon.position.set(side * 6.08, 1.12, 3.8);
    airframe.add(ribbon);
    ribbons.push(ribbon);
  }

  scene.add(group);

  let propAngle = 0;

  function setPropSpin(angle, rpmRatio) {
    propAngle = angle;
    propGroup.rotation.z = propAngle;
    blurMat.opacity = 0.08 + rpmRatio * 0.28;
  }

  function update(state, inputs, dt, time, isDusk = false) {
    group.position.set(state.pos.x, state.pos.y, state.pos.z);
    group.rotation.order = 'YXZ';
    group.rotation.set(state.pitch, state.yaw, state.roll);

    // Subtle airframe stall buffet shake.
    if (state.stalling && !state.onGround && !state.crashed) {
      airframe.rotation.z = Math.sin(time * 42) * 0.045;
      airframe.position.y = Math.cos(time * 36) * 0.08;
    } else {
      airframe.rotation.z = 0;
      airframe.position.y = 0;
    }

    const rpmRatio = state.crashed ? 0 : state.fuel > 0 ? 0.22 + state.throttle * 0.78 : 0.1;
    propAngle += dt * (8 + rpmRatio * 48);
    setPropSpin(propAngle, rpmRatio);

    // Control surface deflection for crisp visual flight feedback.
    elevator.rotation.x = -inputs.pitch * 0.38;
    rudder.rotation.y = inputs.roll * 0.28;
    for (const a of ailerons) {
      a.mesh.rotation.x = a.side * inputs.roll * 0.36;
    }

    // Tail strobe flash + subtle dusk landing light cone only at twilight.
    const strobeOn = (time % 1.2) < 0.14;
    strobeMat.color.setHex(strobeOn ? 0xffffff : 0x556070);
    landingBeamMat.opacity = isDusk ? 0.22 : 0.0;

    // Wingtip trails glow emerald-gold when surfing ridge lift!
    if (state.liftActive) {
      ribbonMat.color.setHex(0x88ffdc);
      ribbonMat.opacity = 0.45;
    } else {
      ribbonMat.color.setHex(0xfff5e0);
      ribbonMat.opacity = state.speed > 36 && !state.onGround ? 0.18 : 0.04;
    }
  }

  return { group, airframe, update, setPropSpin };
}
