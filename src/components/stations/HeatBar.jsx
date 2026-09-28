// Barra de calor verde->ámbar->rojo (contrato §5, pantallas 3 y 8). Mismo
// truco que documenta /home/user/acaciaco-site/CLAUDE.md ("Heat bar en el
// panel: horas hábiles, no días") y su `.ad-heat-fill` en
// roseta/factura/admin/: el degradado se pinta UNA vez sobre la escala
// completa 0-100%, y el relleno estira su propio `background-size` con la
// fracción inversa del ancho — eso cancela el re-estirado por defecto del
// degradado al ancho (más angosto) del propio relleno, así que un renglón al
// 20% muestra solo el primer quinto del degradado (todavía verde) en vez de
// todo el arcoíris verde->rojo comprimido en una tira delgada.
//
// Colores: tokens existentes del tema (chart-3, primary, destructive) — sin
// hex nuevos, para que siga el tema si algún día este repo suma modo claro.
import React from 'react';
import { cn } from '@/lib/utils';

export default function HeatBar({ ratio, level, caption, className }) {
  const clamped = Math.max(0, Math.min(100, ratio * 100));
  const backgroundSize = clamped > 0 ? `${10000 / clamped}% 100%` : '100% 100%';

  return (
    <div className={cn('w-full', className)}>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-no-repeat"
          style={{
            width: `${clamped}%`,
            backgroundSize,
            backgroundImage:
              'linear-gradient(90deg, hsl(var(--chart-3)) 0%, hsl(var(--primary)) 60%, hsl(var(--destructive)) 100%)',
          }}
        />
      </div>
      {caption && (
        <p
          className={cn(
            'mt-1 text-xs font-medium',
            level === 'late' ? 'text-destructive' : level === 'warn' ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {caption}
        </p>
      )}
    </div>
  );
}
