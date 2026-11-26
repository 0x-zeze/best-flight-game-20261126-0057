export function createInput(canvas, callbacks) {
  const keys = new Set();
  let invertPitch = false;
  let wsControlsThrottle = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let orbitYaw = 0;
  let orbitPitch = 0;

  function onKeyDown(e) {
    callbacks.onUserGesture?.();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) {
      if (e.code === 'KeyP' || e.code === 'Escape') callbacks.onPause?.();
      if (e.code === 'KeyR') callbacks.onRestart?.();
      if (e.code === 'KeyM') callbacks.onMute?.();
    }
    keys.add(e.code);
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onBlur() {
    keys.clear();
    dragging = false;
  }

  function onPointerDown(e) {
    callbacks.onUserGesture?.();
    if (e.target !== canvas) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    orbitYaw = Math.max(-1.4, Math.min(1.4, orbitYaw - dx * 0.006));
    orbitPitch = Math.max(-0.4, Math.min(0.6, orbitPitch + dy * 0.004));
  }

  function onPointerUp() {
    dragging = false;
  }

  function onDoubleClick() {
    orbitYaw = 0;
    orbitPitch = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('dblclick', onDoubleClick);

  function sample(dt) {
    if (!dragging) {
      orbitYaw *= Math.max(0, 1 - dt * 3.8);
      orbitPitch *= Math.max(0, 1 - dt * 3.8);
    }

    const up = keys.has('ArrowUp') || (!wsControlsThrottle && keys.has('KeyW'));
    const down = keys.has('ArrowDown') || (!wsControlsThrottle && keys.has('KeyS'));
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');

    const thrUp =
      keys.has('ShiftLeft') ||
      keys.has('ShiftRight') ||
      keys.has('KeyE') ||
      keys.has('Equal') ||
      (wsControlsThrottle && keys.has('KeyW'));
    const thrDown =
      keys.has('ControlLeft') ||
      keys.has('ControlRight') ||
      keys.has('KeyQ') ||
      keys.has('Minus') ||
      (wsControlsThrottle && keys.has('KeyS'));

    // Default: Down pulls nose UP (classic flight stick); Up pushes nose DOWN.
    let pitch = (down ? 1 : 0) - (up ? 1 : 0);
    if (invertPitch) pitch = -pitch;

    const roll = (right ? 1 : 0) - (left ? 1 : 0);
    const throttleDelta = (thrUp ? 1 : 0) - (thrDown ? 1 : 0);
    const airbrake = keys.has('Space');

    return { pitch, roll, throttleDelta, airbrake, orbitYaw, orbitPitch };
  }

  return {
    sample,
    setInvertPitch: (v) => { invertPitch = Boolean(v); },
    setWsThrottle: (v) => { wsControlsThrottle = Boolean(v); },
    getOptions: () => ({ invertPitch, wsControlsThrottle }),
  };
}
