// Terminal mode: on a terminal account nothing of the app renders until a
// person unlocks it with their PIN. Everyone else passes straight through.
import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useTerminalIdle } from '@/lib/terminal/useTerminalIdle';
import TerminalLock from './TerminalLock';
import TerminalRevoked from './TerminalRevoked';

export default function TerminalGate() {
  const { isTerminal, terminal } = useAuth();
  const unlocked = isTerminal && !!terminal?.pass && !terminal?.revoked;
  useTerminalIdle(unlocked);
  if (!isTerminal) return <Outlet />;
  if (terminal?.revoked) return <TerminalRevoked />;
  if (!unlocked) return <TerminalLock />;
  return <Outlet />;
}
