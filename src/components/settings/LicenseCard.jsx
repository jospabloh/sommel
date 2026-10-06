// Ajustes: la licencia del bar, solo lectura (módulo 7). Los datos vienen de
// settings.get; la plataforma (Mission Control) es la única que los cambia, así
// que aquí no hay ningún botón que escriba: solo el camino para hablar con
// soporte.
import React from 'react';
import { BadgeCheck, CalendarClock, Mail } from 'lucide-react';
import { SUPPORT_EMAIL, trialDaysLeft } from '@/lib/billingNotice';
import { cn } from '@/lib/utils';

// Chips de estado: llevan significado, no superficie, así que tienen su
// variante oscura explícita (módulo 12).
const STATUS = {
  trial: {
    label: 'Prueba',
    tone: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-950/50 dark:text-blue-200',
  },
  active: {
    label: 'Activa',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-200',
  },
  view_only: {
    label: 'Solo lectura',
    tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200',
  },
  suspended: {
    label: 'Suspendida',
    tone: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-200',
  },
};

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-right">{children}</dd>
    </div>
  );
}

export default function LicenseCard({ bar }) {
  const status = STATUS[bar.billing_status];
  const trialEnd = formatDate(bar.trial_end_at);
  const periodEnd = formatDate(bar.current_period_end);
  const daysLeft = bar.billing_status === 'trial' ? trialDaysLeft(bar.trial_end_at) : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <BadgeCheck className="w-5 h-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Licencia</h2>
      </div>

      <dl>
        <Row label="Estado">
          {status ? (
            <span className={cn('inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold', status.tone)}>
              {status.label}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin dato</span>
          )}
        </Row>
        <Row label="Plan">{bar.plan || <span className="text-muted-foreground">Sin plan asignado</span>}</Row>
        {trialEnd && (
          <Row label="La prueba termina">
            {trialEnd}
            {daysLeft !== null && daysLeft > 0 && (
              <span className="block text-xs font-normal text-muted-foreground">
                {daysLeft === 1 ? 'Queda 1 día' : `Quedan ${daysLeft} días`}
              </span>
            )}
          </Row>
        )}
        {periodEnd && (
          <Row label="Pagado hasta">
            <span className="inline-flex items-center gap-1.5 justify-end">
              <CalendarClock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              {periodEnd}
            </span>
          </Row>
        )}
      </dl>

      <p className="text-sm text-muted-foreground">
        La licencia la administra ACACIA. Para renovarla, cambiar de plan o resolver una duda, escríbenos.
      </p>
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Licencia de Sommel')}`}
        className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-primary hover:underline min-h-11 [overflow-wrap:anywhere]"
      >
        <Mail className="w-4 h-4" /> {SUPPORT_EMAIL}
      </a>
    </div>
  );
}
