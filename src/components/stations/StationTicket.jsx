// Una comanda (orden) en la pantalla de estación (contrato §5, pantallas 3 y
// 8): mesa/cliente, hora de entrada, barra de calor, renglones enviado/listo
// con botones grandes, y avisos de cancelación. Botones y texto grandes a
// propósito ("legible a 1-2 m", "toques grandes") — se lee desde el otro lado
// de la barra, no desde una mano sosteniendo el teléfono pegado a la cara.
import React from 'react';
import { Check, Undo2, PackageCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import HeatBar from './HeatBar';
import CancelledNotice from './CancelledNotice';
import {
  heatLevel,
  formatMinutesElapsed,
  isWithinUndoWindow,
  earliestSentAt,
  orderDisplayName,
  lineSubtitle,
} from './stationHelpers';

const LEVEL_RING = {
  ok: 'border-border',
  warn: 'border-primary',
  late: 'border-destructive',
};

function ItemRow({ item, now, canOperate, onMarkReady, onMarkDelivered, onUndo, busy }) {
  const subtitle = lineSubtitle(item);
  const canUndo = item.status === 'listo' && isWithinUndoWindow(item.ready_at, now);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 px-3 py-3',
        item.status === 'listo' ? 'border-[hsl(var(--chart-3))] bg-[hsl(var(--chart-3))]/10' : 'border-border bg-card'
      )}
    >
      <div className="min-w-[8rem] flex-1">
        <div className="text-lg font-semibold leading-snug break-words">
          {item.qty > 1 ? `${item.qty}× ` : ''}
          {item.name}
        </div>
        {subtitle && <div className="text-sm text-muted-foreground break-words">{subtitle}</div>}
        {item.notes && <div className="text-sm italic text-muted-foreground break-words">"{item.notes}"</div>}
      </div>

      {canOperate && (
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {item.status === 'enviado' && (
            <Button
              type="button"
              size="lg"
              className="h-14 px-5 text-base"
              disabled={busy}
              onClick={() => onMarkReady(item)}
            >
              <Check className="w-5 h-5 mr-1.5" /> Listo
            </Button>
          )}
          {item.status === 'listo' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-14 px-4 text-base"
                disabled={busy || !canUndo}
                title={canUndo ? 'Deshacer (menos de 5 min)' : 'Ya pasaron 5 minutos'}
                onClick={() => onUndo(item)}
              >
                <Undo2 className="w-5 h-5 mr-1.5" /> Deshacer
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-14 px-5 text-base"
                disabled={busy}
                onClick={() => onMarkDelivered(item)}
              >
                <PackageCheck className="w-5 h-5 mr-1.5" /> Entregado
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function StationTicket({
  orderId,
  order,
  tablesById,
  lines,
  now,
  goalMinutes,
  canOperate,
  ackedCancelled,
  onAcknowledgeCancelled,
  onMarkReady,
  onMarkDelivered,
  onUndo,
  onMarkAllReady,
  busyIds,
}) {
  const activeLines = lines.filter((l) => l.status === 'enviado' || l.status === 'listo');
  const cancelledLines = lines.filter((l) => l.status === 'cancelado' && !ackedCancelled.has(l.id));
  const entrySentAt = earliestSentAt(lines);
  const { ratio, level } = heatLevel(entrySentAt, now, goalMinutes);
  const elapsedLabel = formatMinutesElapsed(entrySentAt, now);
  const pendingReady = activeLines.filter((l) => l.status === 'enviado');

  if (activeLines.length === 0 && cancelledLines.length === 0) return null;

  return (
    <div className={cn('rounded-2xl border-2 bg-card p-4 sm:p-5 space-y-3', LEVEL_RING[level])}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="font-display text-xl font-bold break-words">{orderDisplayName(order, tablesById)}</div>
          {elapsedLabel && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
              <Clock className="w-4 h-4" /> Entró hace {elapsedLabel}
            </div>
          )}
        </div>
        {canOperate && pendingReady.length > 1 && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-12 shrink-0"
            disabled={busyIds.size > 0}
            onClick={() => onMarkAllReady(orderId, pendingReady)}
          >
            <Check className="w-5 h-5 mr-1.5" /> Todo listo
          </Button>
        )}
      </div>

      {entrySentAt && (
        <HeatBar
          ratio={ratio}
          level={level}
          caption={
            level === 'late'
              ? 'Se pasó del tiempo meta'
              : level === 'warn'
                ? 'Cerca del tiempo meta'
                : 'En tiempo'
          }
        />
      )}

      {cancelledLines.map((item) => (
        <CancelledNotice key={item.id} item={item} onAcknowledge={() => onAcknowledgeCancelled(item.id)} />
      ))}

      <div className="space-y-2">
        {activeLines.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            now={now}
            canOperate={canOperate}
            onMarkReady={onMarkReady}
            onMarkDelivered={onMarkDelivered}
            onUndo={onUndo}
            busy={busyIds.has(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
