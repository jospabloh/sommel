// Terminal mode: on a terminal account nothing of the app renders until a
// person unlocks it with their PIN. Everyone else passes straight through.
import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useTerminalIdle } from '@/lib/terminal/useTerminalIdle';
import TerminalLock from './TerminalLock';
import TerminalRevoked from './TerminalRevoked';
import PrintStationProvider from '@/components/printing/PrintStationProvider';

export default function TerminalGate() {
  const { isTerminal, terminal, account } = useAuth();
  const unlocked = isTerminal && !!terminal?.pass && !terminal?.revoked;
  useTerminalIdle(unlocked);
  if (!isTerminal) return <Outlet />;
  if (terminal?.revoked || !account?.tenant_id) return <TerminalRevoked />;
  // Locked, the print station keeps running here (the Caja terminal is the
  // one with the USB printer); unlocked, Layout mounts its own.
  if (!unlocked) {
    return (
      <PrintStationProvider tenantId={account.tenant_id} allowed>
        <TerminalLock />
      </PrintStationProvider>
    );
  }
  return <Outlet />;
}
