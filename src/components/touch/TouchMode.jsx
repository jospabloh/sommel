// Mounts the touch-screen helpers this device asked for (Ajustes > "Esta
// pantalla"). Lives outside the router, like the theme switcher, so the
// login screen gets the keyboard too.
import React, { useEffect } from 'react';
import { useTouchPrefs } from '@/lib/touch/touchPrefs';
import { installDragScroll } from '@/lib/touch/dragScroll';
import VirtualKeyboard from './VirtualKeyboard';

export default function TouchMode() {
  const { dragScroll, keyboard } = useTouchPrefs();

  useEffect(() => (dragScroll ? installDragScroll() : undefined), [dragScroll]);

  return keyboard ? <VirtualKeyboard /> : null;
}
