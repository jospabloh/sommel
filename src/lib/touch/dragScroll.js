// Drag-to-scroll, iPad-like (2026-10-13). On an all-in-one touch PC Windows
// often reports the finger as a mouse, so nothing scrolls natively and a drag
// selects text or drags a link. This makes a press that moves scroll the box
// under it the way an iPad does:
//   - it follows the finger 1:1 and keeps going after a fling, slowing down on
//     iOS's curve (touchLogic: releaseVelocity / flingDistance / flingRemaining);
//   - a mostly vertical drag only scrolls vertically (lockAxis);
//   - like iPad, a gesture stays in the box where it started: a list at its end
//     stops there instead of moving the page, and nothing inside a fixed or
//     sticky panel (the sidebar menu, a dialog) moves what is behind it
//     (José, 2026-10-13: dragging the menu moved the whole app);
//   - the click that follows a drag is swallowed, so dragging across a table
//     card does not open it; a tap is still a tap.
// A real touch pointer goes through too, with a larger threshold: when the
// browser pans natively it sends pointercancel first and this steps aside.
import {
  blocksDrag,
  canScrollBy,
  dragThresholdFor,
  flingDistance,
  flingRemaining,
  handlesPointer,
  lockAxis,
  passedDragThreshold,
  releaseVelocity,
} from './touchLogic';

const SCROLLABLE = /(auto|scroll|overlay)/;

function describe(el) {
  return {
    tag: el?.tagName,
    type: el?.getAttribute?.('type') ?? '',
    inputMode: el?.getAttribute?.('inputmode') ?? '',
    readOnly: !!el?.readOnly,
    disabled: !!el?.disabled,
  };
}

const pageBox = () => document.scrollingElement || document.documentElement;

function isScrollBox(n) {
  if (n === pageBox()) return true;
  const s = getComputedStyle(n);
  return (SCROLLABLE.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1)
    || (SCROLLABLE.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1);
}

/**
 * Scrollable boxes from the pressed element up to the page, nearest first. A
 * fixed or sticky ancestor (the sidebar, a dialog) ends the chain: what is
 * pressed inside it never scrolls the page behind it.
 */
function scrollChain(el) {
  const out = [];
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (isScrollBox(n)) out.push(n);
    const pos = getComputedStyle(n).position;
    if (pos === 'fixed' || pos === 'sticky') return out;
  }
  out.push(pageBox());
  return out;
}

/** Does the box have anything to scroll on this axis at all? */
function overflows(box, axis) {
  const y = box.scrollHeight - box.clientHeight > 1;
  const x = box.scrollWidth - box.clientWidth > 1;
  return axis === 'y' ? y : axis === 'x' ? x : x || y;
}

/**
 * The one box this gesture moves, chosen when the drag starts: the nearest
 * one that can still move that way, else the nearest one that scrolls on that
 * axis at all (it just stays at its end, like iPad), else none.
 */
function chooseBox(chain, axis, dx, dy) {
  return chain.find((b) => canScrollBy(b, dx, dy)) ?? chain.find((b) => overflows(b, axis)) ?? null;
}

export function installDragScroll() {
  let drag = null;
  let fling = 0;
  let swallowClick = false;

  const stopFling = () => {
    if (fling) cancelAnimationFrame(fling);
    fling = 0;
  };

  const onDown = (e) => {
    stopFling();
    if (!handlesPointer(e.pointerType, e.button)) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest('[data-no-drag-scroll],[role="slider"],[contenteditable="true"]')) return;
    if (blocksDrag(describe(t))) return;
    drag = {
      id: e.pointerId,
      chain: scrollChain(t),
      x0: e.clientX, y0: e.clientY,
      x: e.clientX, y: e.clientY,
      moving: false, axis: 'both',
      threshold: dragThresholdFor(e.pointerType),
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
    };
  };

  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moving) {
      const dx0 = e.clientX - drag.x0;
      const dy0 = e.clientY - drag.y0;
      if (!passedDragThreshold(dx0, dy0, drag.threshold)) return;
      drag.moving = true;
      drag.axis = lockAxis(dx0, dy0);
      drag.box = chooseBox(drag.chain, drag.axis, drag.axis === 'y' ? 0 : -dx0, drag.axis === 'x' ? 0 : -dy0);
      document.documentElement.classList.add('drag-scrolling');
      window.getSelection?.()?.removeAllRanges();
    }
    e.preventDefault();
    const dx = drag.axis === 'y' ? 0 : drag.x - e.clientX; // content moves opposite the finger
    const dy = drag.axis === 'x' ? 0 : drag.y - e.clientY;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (drag.samples.length > 20) drag.samples.shift();
    if (drag.box) {
      if (dy) drag.box.scrollTop += dy;
      if (dx) drag.box.scrollLeft += dx;
    }
  };

  const glide = (box, axis, vx, vy) => {
    if (!box) return;
    const distX = axis === 'y' ? 0 : -flingDistance(vx);
    const distY = axis === 'x' ? 0 : -flingDistance(vy);
    if (!distX && !distY) return;
    const start = performance.now();
    let doneX = 0;
    let doneY = 0;
    const step = (now) => {
      const left = flingRemaining(now - start);
      const toX = distX * (1 - left) - doneX;
      const toY = distY * (1 - left) - doneY;
      doneX += toX;
      doneY += toY;
      const beforeTop = box.scrollTop;
      const beforeLeft = box.scrollLeft;
      if (toY) box.scrollTop += toY;
      if (toX) box.scrollLeft += toX;
      // Hitting the end stops the glide (no handing it to the page).
      const stuck = (Math.abs(toY) >= 1 || Math.abs(toX) >= 1) && box.scrollTop === beforeTop && box.scrollLeft === beforeLeft;
      const moved = !stuck;
      const remaining = Math.max(Math.abs(distX), Math.abs(distY)) * left;
      fling = moved && remaining > 0.5 ? requestAnimationFrame(step) : 0;
    };
    fling = requestAnimationFrame(step);
  };

  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moving, box, axis, samples } = drag;
    drag = null;
    if (!moving) return;
    document.documentElement.classList.remove('drag-scrolling');
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    if (e.type === 'pointerup') {
      const { vx, vy } = releaseVelocity(samples, e.timeStamp);
      glide(box, axis, vx, vy);
    }
  };

  const onClick = (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // A mouse-like finger must not start the browser's own drag of a link or an
  // image (the "ghost" that follows the finger instead of scrolling).
  const onDragStart = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t && !t.closest('[draggable="true"]')) e.preventDefault();
  };

  const opts = { capture: true };
  document.documentElement.classList.add('drag-scroll-on');
  document.addEventListener('pointerdown', onDown, opts);
  document.addEventListener('pointermove', onMove, { capture: true, passive: false });
  document.addEventListener('pointerup', onUp, opts);
  document.addEventListener('pointercancel', onUp, opts);
  document.addEventListener('click', onClick, opts);
  document.addEventListener('dragstart', onDragStart, opts);
  return () => {
    stopFling();
    document.documentElement.classList.remove('drag-scrolling', 'drag-scroll-on');
    document.removeEventListener('pointerdown', onDown, opts);
    document.removeEventListener('pointermove', onMove, opts);
    document.removeEventListener('pointerup', onUp, opts);
    document.removeEventListener('pointercancel', onUp, opts);
    document.removeEventListener('click', onClick, opts);
    document.removeEventListener('dragstart', onDragStart, opts);
  };
}
