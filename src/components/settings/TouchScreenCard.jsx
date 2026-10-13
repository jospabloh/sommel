// Ajustes > "Esta pantalla": per-device options for touch screens without a
// physical keyboard. Saved in this browser only, never on the bar.
import React from 'react';
import { Hand } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { setTouchPrefs, useTouchPrefs } from '@/lib/touch/touchPrefs';

function Row({ id, title, text, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{text}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function TouchScreenCard() {
  const prefs = useTouchPrefs();
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Hand className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-semibold">Esta pantalla</h2>
          <p className="text-sm text-muted-foreground">Solo cambia esta computadora o tablet.</p>
        </div>
      </div>
      <Row
        id="touch-keyboard"
        title="Teclado en pantalla"
        text="Para pantallas táctiles sin teclado: aparece al tocar un campo de texto."
        checked={prefs.keyboard}
        onChange={(on) => setTouchPrefs({ keyboard: on })}
      />
      <Row
        id="touch-drag"
        title="Desplazar arrastrando el dedo"
        text="Para pantallas donde el dedo selecciona texto en lugar de mover la lista."
        checked={prefs.dragScroll}
        onChange={(on) => setTouchPrefs({ dragScroll: on })}
      />
    </section>
  );
}
