// Drag-to-scroll for touch screens that Windows reports as a mouse
// (2026-10-13). A real touch screen already scrolls natively; on these the
// finger is a mouse, so dragging selected text instead of moving the list.
// With the option on, a press that moves past a few pixels scrolls the
// nearest scrollable box (or the page) and the click that follows is
// swallowed, so dragging across a table card does not open it.
import { blocksDrag, handlesPointer, passedDragThreshold } from './touchLogic';

const SCROLLABLE = /(auto|scroll|overlay)/;
const FRICTION = 0.95;
const MIN_SPEED = 0.02; // px per ms

function describe(el) {
  return {
    tag: el?.tagName,
    type: el?.getAttribute?.('type') ?? '',
    inputMode: el?.getAttribute?.('inputmode') ?? '',
    readOnly: !!el?.readOnly,
    disabled: !!el?.disabled,
  };
}

function scrollParent(el) {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    const y = SCROLLABLE.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1;
    const x = SCROLLABLE.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1;
    if (x || y) return n;
  }
  return document.scrollingElement || document.documentElement;
}

export function installDragScroll() {
  let drag = null;
  let momentum = 0;
  let swallowClick = false;

  const stopMomentum = () => {
    if (momentum) cancelAnimationFrame(momentum);
    momentum = 0;
  };

  const onDown = (e) => {
    stopMomentum();
    if (!handlesPointer(e.pointerType, e.button)) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest('[data-no-drag-scroll],[role="slider"],[contenteditable="true"]')) return;
    if (blocksDrag(describe(t))) return;
    const box = scrollParent(t);
    drag = {
      id: e.pointerId, box, x: e.clientX, y: e.clientY,
      top: box.scrollTop, left: box.scrollLeft, moving: false,
      lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, vx: 0, vy: 0,
    };
  };

  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moving) {
      if (!passedDragThreshold(dx, dy)) return;
      drag.moving = true;
      document.documentElement.classList.add('drag-scrolling');
      window.getSelection?.()?.removeAllRanges();
    }
    e.preventDefault();
    drag.box.scrollTop = drag.top - dy;
    drag.box.scrollLeft = drag.left - dx;
    const dt = Math.max(1, e.timeStamp - drag.lastT);
    drag.vx = (e.clientX - drag.lastX) / dt;
    drag.vy = (e.clientY - drag.lastY) / dt;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
  };

  const glide = (box, vx, vy) => {
    let last = performance.now();
    const step = (now) => {
      const dt = now - last;
      last = now;
      box.scrollTop -= vy * dt;
      box.scrollLeft -= vx * dt;
      const k = FRICTION ** (dt / 16);
      vx *= k;
      vy *= k;
      momentum = Math.hypot(vx, vy) > MIN_SPEED ? requestAnimationFrame(step) : 0;
    };
    momentum = requestAnimationFrame(step);
  };

  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moving, box, vx, vy, lastT } = drag;
    drag = null;
    if (!moving) return;
    document.documentElement.classList.remove('drag-scrolling');
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    // A finger that stopped before lifting does not fling the list.
    if (e.type === 'pointerup' && e.timeStamp - lastT < 80) glide(box, vx, vy);
  };

  const onClick = (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const opts = { capture: true };
  document.addEventListener('pointerdown', onDown, opts);
  document.addEventListener('pointermove', onMove, { capture: true, passive: false });
  document.addEventListener('pointerup', onUp, opts);
  document.addEventListener('pointercancel', onUp, opts);
  document.addEventListener('click', onClick, opts);
  return () => {
    stopMomentum();
    document.documentElement.classList.remove('drag-scrolling');
    document.removeEventListener('pointerdown', onDown, opts);
    document.removeEventListener('pointermove', onMove, opts);
    document.removeEventListener('pointerup', onUp, opts);
    document.removeEventListener('pointercancel', onUp, opts);
    document.removeEventListener('click', onClick, opts);
  };
}
