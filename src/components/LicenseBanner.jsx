// Persistent license notice (modules 1/7/10, part of the billing story). Shows
// why a bar is read-only or suspended, and how many trial days are left. It is
// informational ONLY: it never blocks login or navigation, and any failure to
// load renders nothing (the server still enforces the real gate on each write).
//
// The bar comes from useBarSummary (settings.billing, membership only), so
// restricted staff still see why their writes are refused.
import React from 'react';
import { AlertTriangle, Info, Lock } from 'lucide-react';
import { useBarSummary } from '@/lib/useBarSummary';
import { billingNotice, SUPPORT_EMAIL } from '@/lib/billingNotice';
import { cn } from '@/lib/utils';

// Status chips carry meaning, not surface, so they get an explicit dark
// counterpart (module 12): a deep tint behind lighter text.
const TONES = {
  danger: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-200',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200',
  info: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-950/50 dark:text-blue-200',
};
const ICONS = { danger: Lock, warning: AlertTriangle, info: Info };

export default function LicenseBanner() {
  const { data: bar } = useBarSummary();

  const notice = billingNotice(bar);
  if (!notice) return null;
  const Icon = ICONS[notice.tone];

  return (
    <div
      role="status"
      data-license-banner={notice.kind}
      className={cn('flex items-start gap-3 border-b px-4 py-2.5 text-sm', TONES[notice.tone])}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0">
        <span className="font-semibold">{notice.title}.</span> {notice.text}{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-medium underline underline-offset-2 [overflow-wrap:anywhere]"
        >
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  );
}
