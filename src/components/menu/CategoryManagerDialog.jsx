// Panel de categorías: crear, editar y borrar (contrato §4 `catalog`
// upsertCategory/deleteCategory). Dueño: agente "Menú UI" (contrato §5).
import React, { useState } from 'react';
import { callFn, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import CategoryFormDialog from './CategoryFormDialog';
import { stationLabel } from './menuUtils';

/**
 * @param {{ open: boolean, onOpenChange: (v:boolean)=>void, categories: object[],
 *   products: object[], onChanged: () => void }} props
 */
export default function CategoryManagerDialog({ open, onOpenChange, categories, products, onChanged }) {
  const { toast } = useToast();
  const [formState, setFormState] = useState(null); // null | { category? }
  const [deleting, setDeleting] = useState(null); // category being confirmed
  const [busyDelete, setBusyDelete] = useState(false);

  const nextSort = categories.length > 0 ? Math.max(...categories.map((c) => c.sort ?? 0)) + 10 : 10;
  const sorted = [...categories].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const countProducts = (categoryId) => products.filter((p) => p.category_id === categoryId).length;

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await callFn('catalog', 'deleteCategory', { id: deleting.id });
      toast({ title: 'Categoría eliminada', description: deleting.name });
      setDeleting(null);
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'category_in_use') {
        toast({
          variant: 'destructive',
          title: 'No se puede eliminar',
          description: `"${deleting.name}" todavía tiene productos. Muévelos a otra categoría primero.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'No se pudo eliminar la categoría',
          description: err instanceof ApiError ? err.message : 'Error de red, intenta de nuevo.',
        });
      }
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Categorías del menú</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {sorted.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Todavía no hay categorías.</p>
            )}
            {sorted.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{cat.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>Orden {cat.sort ?? 0}</span>
                    <span>·</span>
                    <span>{stationLabel(cat.station_default)}</span>
                    <span>·</span>
                    <span>{countProducts(cat.id)} producto(s)</span>
                  </div>
                </div>
                <Badge variant="outline" className="hidden sm:inline-flex shrink-0">
                  {stationLabel(cat.station_default)}
                </Badge>
                <Button size="icon" variant="ghost" onClick={() => setFormState({ category: cat })} aria-label={`Editar ${cat.name}`}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleting(cat)} aria-label={`Eliminar ${cat.name}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button onClick={() => setFormState({})} className="w-full">
            <Plus className="w-4 h-4" /> Nueva categoría
          </Button>
        </DialogContent>
      </Dialog>

      {formState && (
        <CategoryFormDialog
          open
          onOpenChange={(v) => !v && setFormState(null)}
          category={formState.category}
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
              Esta acción no se puede deshacer. Si la categoría todavía tiene
              productos, no se podrá eliminar hasta moverlos a otra.
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
    </>
  );
}
