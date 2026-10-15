// Terminal only: "Checar" and "Cambiar usuario" one tap away in the top bar
// (José, 2026-10-15). On a shared caja everyone needs them fast, so they do
// not hide in the avatar menu. Icons only on a phone, icon + label from sm.
import React from 'react';
import { Link } from 'react-router-dom';
import { Fingerprint, Lock } from 'lucide-react';
import { lockNow } from '@/lib/terminal/lockNow';

const PILL =
  'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border px-2.5 sm:px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function TerminalQuickActions({ canPunch }) {
  return (
    <div className="flex items-center gap-2" data-terminal-quick-actions>
      {canPunch ? (
        <Link to="/checador" className={PILL} title="Checar entrada o salida" aria-label="Checar entrada o salida">
          <Fingerprint className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Checar</span>
        </Link>
      ) : null}
      <button type="button" onClick={lockNow} className={PILL} title="Cambiar usuario" aria-label="Cambiar usuario">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Cambiar usuario</span>
      </button>
    </div>
  );
}
