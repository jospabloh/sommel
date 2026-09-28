// Cancelaciones, cortesías, mermas y diferencias de caja.
import React from 'react';
import { formatMXN } from '@/lib/money';
import Section, { Empty } from './Section';
import { fmtLocalTime } from './periods';

function List({ children }) {
  return <ul className="divide-y divide-border/60">{children}</ul>;
}

function Row({ title, meta, right, note }) {
  return (
    <li className="py-2.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium break-words">{title}</p>
        {note ? <p className="text-sm text-muted-foreground break-words">{note}</p> : null}
        <p className="text-xs text-muted-foreground mt-0.5">{meta}</p>
      </div>
      {right ? <p className="text-sm font-medium tabular-nums shrink-0">{right}</p> : null}
    </li>
  );
}

const countNote = (shown, total) =>
  total > shown ? `Se muestran los ${shown} más recientes de ${total}.` : null;

export function Cancellations({ data }) {
  return (
    <Section title="Cancelaciones" hint="Renglones cancelados después de enviarse.">
      {data.count === 0 ? (
        <Empty>No hubo cancelaciones.</Empty>
      ) : (
        <>
          <p className="text-sm mb-1">
            {data.count} {data.count === 1 ? 'renglón cancelado' : 'renglones cancelados'}
          </p>
          <List>
            {data.items.map((c, i) => (
              <Row
                key={`${c.at}-${i}`}
                title={`${c.qty} x ${c.name}`}
                note={c.reason ? `Motivo: ${c.reason}` : 'Sin motivo'}
                meta={`${c.cancelled_by_name || 'Sin registro'} · ${fmtLocalTime(c.at)}${c.prepared ? ' · Ya preparado' : ''}`}
              />
            ))}
          </List>
          {countNote(data.items.length, data.count) ? (
            <p className="text-xs text-muted-foreground mt-2">{countNote(data.items.length, data.count)}</p>
          ) : null}
        </>
      )}
    </Section>
  );
}

export function Courtesies({ rows }) {
  return (
    <Section title="Cortesías" hint="Cuentas cerradas como cortesía, con su motivo.">
      {rows.length === 0 ? (
        <Empty>No hubo cortesías.</Empty>
      ) : (
        <List>
          {rows.map((c) => (
            <Row
              key={c.order_id}
              title={c.customer_name || (c.type === 'llevar' ? 'Para llevar' : 'Mesa')}
              note={c.reason ? `Motivo: ${c.reason}` : 'Sin motivo'}
              meta={`${c.closed_by_name || c.opened_by_name || 'Sin registro'} · ${fmtLocalTime(c.at)}`}
              right={formatMXN(c.amount)}
            />
          ))}
        </List>
      )}
    </Section>
  );
}

export function Waste({ data, showCost }) {
  return (
    <Section title="Mermas" hint="Insumos dados de baja, con su motivo.">
      {data.count === 0 ? (
        <Empty>No hubo mermas.</Empty>
      ) : (
        <>
          <List>
            {data.items.map((w, i) => (
              <Row
                key={`${w.item_id}-${w.at}-${i}`}
                title={`${w.qty.toLocaleString('es-MX')} ${w.unit || ''} de ${w.name}`.replace('  ', ' ')}
                note={w.reason ? `Motivo: ${w.reason}` : 'Sin motivo'}
                meta={`${w.created_by_name || 'Sin registro'} · ${fmtLocalTime(w.at)}`}
                right={showCost ? (w.cost === null || w.cost === undefined ? 'Sin costo' : formatMXN(w.cost)) : null}
              />
            ))}
          </List>
          {countNote(data.items.length, data.count) ? (
            <p className="text-xs text-muted-foreground mt-2">{countNote(data.items.length, data.count)}</p>
          ) : null}
        </>
      )}
    </Section>
  );
}

export function CashDifferences({ rows }) {
  return (
    <Section title="Diferencias de caja" hint="Turnos cerrados donde lo contado no coincidió con lo esperado.">
      {rows.length === 0 ? (
        <Empty>Todos los cortes cuadraron.</Empty>
      ) : (
        <List>
          {rows.map((s) => (
            <Row
              key={s.shift_id}
              title={s.difference > 0 ? `Sobró ${formatMXN(s.difference)}` : `Faltó ${formatMXN(Math.abs(s.difference))}`}
              note={s.comment ? `Comentario: ${s.comment}` : 'Sin comentario'}
              meta={`Cierre ${fmtLocalTime(s.closed_at)}`}
            />
          ))}
        </List>
      )}
    </Section>
  );
}
