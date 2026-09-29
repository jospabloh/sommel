// Searchable in-app user manual (module 21). The text lives in
// src/lib/manualContent.js; this component only searches and renders it.
// Accordion, one section per feature area; while a query is typed, every
// section that still has matches opens so the answers are visible at once.
import React, { useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { MANUAL_SECTIONS, filterManual, searchTerms } from '@/lib/manualContent';

export default function UserManual() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState([]);

  const searching = searchTerms(query).length > 0;
  const sections = useMemo(() => filterManual(query, MANUAL_SECTIONS), [query]);
  // While searching, everything that matched is open; otherwise the reader's own choice.
  const value = searching ? sections.map((s) => s.id) : open;

  return (
    <section aria-labelledby="manual-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-5 h-5 text-primary" aria-hidden="true" />
        <h2 id="manual-title" className="font-display text-xl font-semibold">Manual de usuario</h2>
      </div>

      <div className="relative mb-2">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca, por ejemplo: propina, corte, PIN"
          aria-label="Buscar en el manual"
          className="h-11 pl-9 pr-10"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 h-10 w-10"
            onClick={() => setQuery('')}
            aria-label="Borrar búsqueda"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {searching && (
        <p className="text-sm text-muted-foreground mb-2" role="status">
          {sections.length === 0
            ? 'No encontramos nada con esa búsqueda. Prueba con otra palabra o escríbenos a soporte.'
            : `${sections.reduce((n, s) => n + s.items.length, 0)} respuestas encontradas.`}
        </p>
      )}

      <Accordion type="multiple" value={value} onValueChange={(v) => { if (!searching) setOpen(v); }}>
        {sections.map((section) => (
          <AccordionItem key={section.id} value={section.id} data-manual-section={section.id}>
            <AccordionTrigger className="py-3.5">
              <span className="min-w-0 pr-2">
                <span className="block text-base font-semibold">{section.title}</span>
                <span className="block text-sm font-normal text-muted-foreground">{section.summary}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <dl className="space-y-4">
                {section.items.map((item) => (
                  <div key={item.q}>
                    <dt className="text-sm font-semibold text-foreground">{item.q}</dt>
                    <dd className="text-sm text-muted-foreground mt-1 leading-relaxed">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
