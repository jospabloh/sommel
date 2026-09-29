// Acerca de (module 21): version and news, the searchable manual, how to
// reach ACACIA, and whose app this is. Reachable by every role (no permission
// gate); the route and nav entry are wired in App.jsx / Layout.jsx. Version
// data comes only from src/lib/appConfig.js, the same file the update banner
// and package.json are kept equal to by `npm run check:version`.
import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, Heart, LifeBuoy, Mail, MessageCircle, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import UserManual from '@/components/UserManual';
import {
  APP_VERSION,
  RELEASE_DATE,
  CHANGELOG,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
} from '@/lib/appConfig';
import { SUPPORT_EMAIL } from '@/lib/billingNotice';

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function About() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = CHANGELOG.find((e) => e.version === APP_VERSION) ?? CHANGELOG[0];
  const previous = CHANGELOG.filter((e) => e !== current);

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-3xl space-y-5">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">Acerca de Sommel</h1>
        <p className="text-muted-foreground mt-1">Punto de venta para wine bars: comandas, cobro, turno, inventario y equipo.</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Badge variant="secondary" className="text-sm px-3 py-1" data-app-version={APP_VERSION}>
            <Tag className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Versión {APP_VERSION}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDate(RELEASE_DATE)}</span>
        </div>
      </header>

      <section aria-labelledby="novedades-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 id="novedades-title" className="font-display text-xl font-semibold mb-3">Novedades v{APP_VERSION}</h2>
        <ul className="space-y-2">
          {current.changes.map((change, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span className="text-foreground">{change}</span>
            </li>
          ))}
        </ul>

        {previous.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              className="flex w-full min-h-11 items-center justify-between text-left text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Historial de versiones anteriores
              <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {historyOpen && (
              <div className="mt-2 space-y-4">
                {previous.map((entry) => (
                  <div key={entry.version} className="border-l-2 border-border pl-4">
                    <p className="text-sm font-semibold text-foreground">
                      v{entry.version} <span className="font-normal text-xs text-muted-foreground">· {formatDate(entry.date)}</span>
                    </p>
                    <ul className="mt-1 space-y-1">
                      {entry.changes.map((change, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                          <span aria-hidden="true">•</span>
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <UserManual />

      <section aria-labelledby="contacto-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <LifeBuoy className="w-5 h-5 text-primary" aria-hidden="true" />
          <h2 id="contacto-title" className="font-display text-xl font-semibold">Contacto y soporte</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">Si algo no funciona o no encuentras la respuesta en el manual, escríbenos.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent"
          >
            <Mail className="w-4 h-4" aria-hidden="true" /> {SUPPORT_EMAIL}
          </a>
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" /> WhatsApp {SUPPORT_WHATSAPP_DISPLAY}
          </a>
        </div>
      </section>

      <section aria-labelledby="acacia-title" className="rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
        <h2 id="acacia-title" className="font-display text-xl font-semibold flex items-center gap-2">
          <Heart className="w-5 h-5 text-primary" aria-hidden="true" /> by ACACIA Consultoría
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Hecho con <span aria-hidden="true">♥</span><span className="sr-only">cariño</span> para los wine bars que usan Sommel.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Sommel es un producto de <span className="font-medium text-foreground">ACACIA Consultoría en Informática y Cómputo</span>.
          © {new Date().getFullYear()} ACACIA. Todos los derechos reservados.
        </p>
      </section>
    </div>
  );
}
