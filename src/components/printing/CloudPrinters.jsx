// Impresión → Impresoras en red (Star CloudPRNT). Solo el admin del bar. La
// impresora se conecta sola a Sommel por internet: no necesita computadora al
// lado ni programas instalados. La contraseña se muestra una sola vez.
import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, Copy, Plus, Trash2 } from 'lucide-react';
import { callFn } from '@/lib/api';
import { appParams } from '@/lib/app-params';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { KIND_LABELS } from './printingHelpers';
import { CLOUD_KINDS, cloudPrntUrl, isOnline, lastSeenLabel } from './cloudPrinterHelpers';

function KindChips({ value, onChange, disabled }) {
  const toggle = (k) => {
    const next = value.includes(k) ? value.filter((x) => x !== k) : [...value, k];
    if (next.length > 0) onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Qué imprime">
      {CLOUD_KINDS.map((k) => (
        <Button key={k} type="button" className="h-11 px-4" variant={value.includes(k) ? 'default' : 'outline'} aria-pressed={value.includes(k)} disabled={disabled} onClick={() => toggle(k)}>
          {KIND_LABELS[k]}
        </Button>
      ))}
    </div>
  );
}

function CopyRow({ label, value }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copiado` });
    } catch {
      toast({ title: 'No se pudo copiar', description: 'Selecciónalo y cópialo a mano.' });
    }
  };
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <code className="flex-1 min-w-0 break-all rounded-md border border-border bg-background px-3 py-2 text-sm">{value}</code>
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={`Copiar ${label}`} onClick={copy}>
          <Copy className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function CloudPrinters() {
  const [printers, setPrinters] = useState(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('Cocina');
  const [kinds, setKinds] = useState(['cocina', 'barra']);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const url = cloudPrntUrl(window.location.origin, appParams.appId);

  const load = useCallback(async () => {
    try {
      const res = await callFn('printing', 'cloudList');
      setPrinters(res.printers || []);
    } catch {
      setPrinters([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      const res = await callFn('printing', 'cloudAdd', { name: name.trim(), kinds });
      setAdding(false);
      setCreated(res);
      await load();
    } catch (err) {
      toast({ title: 'No se pudo dar de alta', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const update = async (p, patch) => {
    try {
      await callFn('printing', 'cloudUpdate', { printer_id: p.id, ...patch });
      await load();
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
    }
  };

  const revoke = async (p) => {
    if (!window.confirm(`¿Quitar la impresora ${p.name}? Dejará de recibir trabajos.`)) return;
    try {
      await callFn('printing', 'cloudRevoke', { printer_id: p.id });
      await load();
    } catch (err) {
      toast({ title: 'No se pudo quitar', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium flex items-center gap-2"><Cloud className="w-4 h-4 shrink-0" /> Impresoras en red (Star CloudPRNT)</p>
          <p className="text-sm text-muted-foreground">
            Una impresora Star con CloudPRNT se conecta sola a Sommel por internet, sin computadora al lado.
          </p>
        </div>
        <Button type="button" variant="outline" className="h-11 shrink-0 self-start" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4 mr-1" /> Agregar
        </Button>
      </div>

      {printers === null ? null : printers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay impresoras en red.</p>
      ) : (
        <ul className="space-y-3">
          {printers.map((p) => (
            <li key={p.id} className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className={isOnline(p.last_seen_at) ? 'text-xs text-emerald-700 dark:text-emerald-400' : 'text-xs text-muted-foreground'}>
                    {lastSeenLabel(p.last_seen_at)}
                    {p.last_status ? ` · ${decodeURIComponent(p.last_status)}` : ''}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Quitar ${p.name}`} onClick={() => revoke(p)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <KindChips value={p.kinds.filter((k) => CLOUD_KINDS.includes(k))} onChange={(next) => update(p, { kinds: next })} />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Formato:</span>
                {[['starprnt', 'Star (negritas y corte)'], ['text', 'Texto simple']].map(([f, label]) => (
                  <Button key={f} type="button" size="sm" className="h-11" variant={p.format === f ? 'default' : 'outline'} aria-pressed={p.format === f} onClick={() => update(p, { format: f })}>
                    {label}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onOpenChange={(v) => !v && !busy && setAdding(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar impresora en red</DialogTitle>
            <DialogDescription>Para impresoras Star con CloudPRNT. Después te damos los datos para escribir en la impresora.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="cloud-name" className="text-sm font-medium">Nombre</label>
            <Input id="cloud-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Qué imprime</p>
            <KindChips value={kinds} onChange={setKinds} disabled={busy} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(false)}>Cancelar</Button>
            <Button type="button" disabled={busy || !name.trim()} onClick={add}>{busy ? 'Agregando…' : 'Agregar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!created} onOpenChange={(v) => !v && setCreated(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Datos para la impresora {created?.printer?.name}</DialogTitle>
            <DialogDescription>
              Escribe la IP de la impresora en un navegador, entra a su configuración de CloudPRNT y pon estos datos.
              La contraseña solo se muestra ahora; si se pierde, quita la impresora y agrégala de nuevo.
            </DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-3">
              <CopyRow label="URL del servidor" value={url} />
              <CopyRow label="Usuario" value={created.credentials.user} />
              <CopyRow label="Contraseña" value={created.credentials.password} />
              <p className="text-sm text-muted-foreground">
                Autenticación: Basic. Intervalo de consulta: 10 segundos (cada consulta gasta del límite de Sommel; más seguido no conviene).
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setCreated(null)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
