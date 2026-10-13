// Sección "Extras" del Menú: lista de extras con precio (nombre, precio, a
// cuántos productos aplica), alta/edición, activar/desactivar y borrar. Todo
// se escribe por `catalog.upsertExtra` / `catalog.deleteExtra`.
import React, { useState } from 'react';
import { callFn, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/money';
import { extraScopeLabel } from '@/lib/extras';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, EyeOff, Loader2 } from 'lucide-react';
import ExtraFormDialog from './ExtraFormDialog';

/**
 * @param {{ extras: object[], products: object[], categories: object[],
 *   canEdit: boolean, onChanged: () => void }} props
 */
export default function ExtrasSection({ extras, products, categories, canEdit, onChanged }) {
  const { toast } = useToast();
  const [formState, setFormState] = useState(null); // null | { extra? }
  const [deleting, setDeleting] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const nextSort = extras.length > 0 ? Math.max(...extras.map((e) => e.sort ?? 0)) + 10 : 10;

  const handleToggle = async (extra, active) => {
    setTogglingId(extra.id);
    try {
      await callFn('catalog', 'upsertExtra', { id: extra.id, active });
      onChanged?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo cambiar el estado',
        description: err instanceof ApiError ? err.message : 'Error de red, intenta de nuevo.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await callFn('catalog', 'deleteExtra', { id: deleting.id });
      toast({ title: 'Extra eliminado', description: deleting.name });
      setDeleting(null);
      onChanged?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo eliminar el extra',
        description: err instanceof ApiError ? err.message : 'Error de red, intenta de nuevo.',
      });
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div className="space-y-3 pt-4">
      <p className="text-sm text-muted-foreground">
        Los extras suman un precio al renglón (por ejemplo, un shot extra). Se
        crean aquí y se ofrecen al tomar la comanda.
      </p>

      {canEdit && (
        <Button onClick={() => setFormState({})}>
          <Plus className="w-4 h-4" /> Extra
        </Button>
      )}

      {extras.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Todavía no hay extras.</div>
      ) : (
        extras.map((extra) => (
          <div
            key={extra.id}
            className={`rounded-xl border border-border bg-card p-4 ${extra.active === false ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{extra.name}</span>
                  {extra.active === false && (
                    <Badge variant="outline" className="gap-1"><EyeOff className="w-3 h-3" /> Inactivo</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                  <span className="font-semibold">+{formatMXN(extra.price)}</span>
                  <span className="text-muted-foreground">{extraScopeLabel(extra)}</span>
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={extra.active !== false}
                    onCheckedChange={(v) => handleToggle(extra, v)}
                    disabled={togglingId === extra.id}
                    aria-label={extra.active === false ? 'Activar extra' : 'Desactivar extra'}
                  />
                  <Button size="icon" variant="ghost" onClick={() => setFormState({ extra })} aria-label={`Editar ${extra.name}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleting(extra)} aria-label={`Eliminar ${extra.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {formState && (
        <ExtraFormDialog
          open
          onOpenChange={(v) => !v && setFormState(null)}
          extra={formState.extra}
          products={products}
          categories={categories}
          nextSort={nextSort}
          onSaved={() => {
            setFormState(null);
            onChanged?.();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Los pedidos que ya lo llevan lo conservan tal cual. Desde ahora
              dejará de ofrecerse. Si solo quieres pausarlo, desactívalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyDelete}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busyDelete}>
              {busyDelete && <Loader2 className="w-4 h-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
