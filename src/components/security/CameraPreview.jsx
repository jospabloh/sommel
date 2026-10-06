// Visible preview of the anti PIN-sharing photo: the person always knows a
// photo is taken, and when (it is taken when the PIN is sent).
import React from 'react';
import { CameraOff } from 'lucide-react';

export default function CameraPreview({ videoRef, status }) {
  if (status === 'off') return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="w-16 h-16 shrink-0 rounded-full overflow-hidden bg-muted flex items-center justify-center">
        {status === 'unavailable' ? (
          <CameraOff className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
        ) : (
          <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover -scale-x-100" aria-label="Vista de la cámara" />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {status === 'unavailable'
          ? 'No hay cámara o no tiene permiso. Puedes entrar igual, pero se le avisará al administrador.'
          : 'Se tomará una foto al escribir tu PIN. Se borra sola a los 30 días.'}
      </p>
    </div>
  );
}
