// Print-only mount for the job being printed. Rendered into <body> so the
// @media print rule in printing.css can hide the rest of the app.
import React from 'react';
import { createPortal } from 'react-dom';
import TicketLines from './TicketLines';

export default function PrintArea({ job }) {
  if (!job || typeof document === 'undefined') return null;
  return createPortal(
    <div className="sommel-print-area" aria-hidden="true">
      <TicketLines lines={job.lines} />
      <div className="tk-feed" />
    </div>,
    document.body,
  );
}
