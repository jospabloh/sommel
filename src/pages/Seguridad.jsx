// Seguridad: lo que el admin ve del préstamo de PIN. Alertas (entrar sin foto,
// la misma persona en dos terminales, entrar sin checar) y las fotos de los
// últimos 30 días, que se borran solas. Se pide foto por persona en Staff.
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Camera, CheckCheck, X } from 'lucide-react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const KIND_LABEL = {
  photo_missing: 'Sin foto',
  two_terminals: 'Dos terminales',
  off_shift_unlock: 'Sin checar',
};
const PHOTO_KIND = { unlock: 'Entró a terminal', punch: 'Checó' };
const APPROVAL_LABEL = {
  cancel_sent_item: 'Canceló un platillo enviado',
  void_payment: 'Anuló un pago',
  cash_out: 'Retiro de efectivo',
  close_shift: 'Cerró el turno',
  discount: 'Dio un descuento o cortesía',
};

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function PhotoDialog({ photoId, onClose }) {
  const [photo, setPhoto] = useState(undefined);
  useEffect(() => {
    if (!photoId) return undefined;
    let alive = true;
    setPhoto(undefined);
    callFn('security', 'getPhoto', { id: photoId })
      .then((r) => alive && setPhoto(r.photo ?? null))
      .catch(() => alive && setPhoto(null));
    return () => { alive = false; };
  }, [photoId]);
  if (!photoId) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Foto" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium truncate">{photo?.user_name || 'Foto'}</p>
            {photo ? (
              <p className="text-xs text-muted-foreground">
                {PHOTO_KIND[photo.kind] || ''}{photo.terminal_name ? ` · ${photo.terminal_name}` : ''} · {when(photo.taken_at)}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={onClose} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {photo === undefined ? (
          <div className="aspect-[4/3] rounded-xl bg-muted animate-pulse" />
        ) : photo ? (
          <img src={photo.image} alt={`Foto de ${photo.user_name}`} className="w-full rounded-xl -scale-x-100" />
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">Esta foto ya se borró o no existe.</p>
        )}
      </div>
    </div>
  );
}

export default function Seguridad() {
  const { toast } = useToast();
  const [tab, setTab] = useState('alerts');
  const [alerts, setAlerts] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [error, setError] = useState(null);
  const [openPhoto, setOpenPhoto] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, p, ap] = await Promise.all([
        callFn('security', 'listAlerts'),
        callFn('security', 'listPhotos'),
        callFn('security', 'listApprovals'),
      ]);
      setAlerts(a.alerts ?? []);
      setPhotos(p.photos ?? []);
      setApprovals(ap.approvals ?? []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar');
      setAlerts([]);
      setPhotos([]);
      setApprovals([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const markSeen = async (payload) => {
    setBusy(true);
    try {
      await callFn('security', 'markSeen', payload);
      await load();
    } catch (err) {
      toast({ title: 'No se pudo marcar', description: err.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const unseen = (alerts ?? []).filter((a) => !a.seen_at).length;

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center"><ShieldAlert className="w-6 h-6 text-primary" /></div>
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold">Seguridad</h1>
          <p className="text-muted-foreground mt-0.5">Para que nadie use el PIN de otra persona</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Elige en <Link to="/staff" className="underline text-primary">Staff</Link> a quién se le toma foto (ícono de cámara).
        Las fotos se borran solas a los 30 días y las alertas a los 90.
      </p>

      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
        {[['alerts', `Alertas${unseen ? ` (${unseen})` : ''}`], ['photos', 'Fotos'], ['approvals', 'Aprobaciones']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn('h-11 px-4 rounded-full border text-sm font-medium transition-colors',
              tab === key ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-secondary')}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive mb-4" role="alert">{error}</p> : null}

      {alerts === null ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : tab === 'alerts' ? (
        <div className="space-y-3">
          {unseen > 0 ? (
            <div className="flex justify-end">
              <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => markSeen({ all: true })}>
                <CheckCheck className="w-4 h-4 mr-1" /> Marcar todas vistas
              </Button>
            </div>
          ) : null}
          {alerts.length === 0 ? (
            <p className="text-center py-16 text-muted-foreground">Sin alertas.</p>
          ) : alerts.map((a) => (
            <div key={a.id} className={cn('bg-card border rounded-xl p-4 flex gap-3 items-start', a.seen_at ? 'border-border opacity-70' : 'border-primary/40')}>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.user_name}</span>
                  <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-full">{KIND_LABEL[a.kind] || a.kind}</span>
                </div>
                <p className="text-sm">{a.detail}</p>
                <p className="text-xs text-muted-foreground">{when(a.created_at)}{a.seen_at ? ' · vista' : ''}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {a.photo_id ? (
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => setOpenPhoto(a.photo_id)} aria-label={`Ver foto de ${a.user_name}`}>
                    <Camera className="w-4 h-4" />
                  </Button>
                ) : null}
                {!a.seen_at ? (
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={busy} onClick={() => markSeen({ ids: [a.id] })} aria-label="Marcar vista">
                    <CheckCheck className="w-4 h-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'approvals' ? (
        approvals.length === 0 ? (
          <p className="text-center py-16 text-muted-foreground">Sin aprobaciones todavía.</p>
        ) : (
          <div className="space-y-2">
            {approvals.map((a) => (
              <div key={a.id} className="bg-card border border-border rounded-xl p-4 space-y-1">
                <p className="font-medium">{APPROVAL_LABEL[a.action] || a.action}</p>
                <p className="text-sm">
                  Pidió {a.requested_by_name || 'alguien'} · aprobó {a.approved_by_name || 'un administrador'}
                </p>
                {a.detail ? <p className="text-sm text-muted-foreground break-words">{a.detail}</p> : null}
                <p className="text-xs text-muted-foreground">{when(a.created_at)}</p>
              </div>
            ))}
          </div>
        )
      ) : photos.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">Sin fotos en los últimos 30 días.</p>
      ) : (
        <div className="space-y-2">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpenPhoto(p.id)}
              className="w-full text-left bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Camera className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{p.user_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {PHOTO_KIND[p.kind] || ''}{p.terminal_name ? ` · ${p.terminal_name}` : ''} · {when(p.taken_at)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      <PhotoDialog photoId={openPhoto} onClose={() => setOpenPhoto(null)} />
    </div>
  );
}
