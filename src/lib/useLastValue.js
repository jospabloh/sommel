import { useRef } from 'react';

// A dialog driven by a nullable prop (`open={!!item}`) keeps rendering for its
// exit animation after the prop goes null. Rendering with the last value it
// had avoids a crash on close (2026-10-14: closing "Ligar productos" in
// Inventario left the screen blank).
export function useLastValue(value) {
  const ref = useRef(value);
  if (value !== null && value !== undefined) ref.current = value;
  return ref.current;
}
