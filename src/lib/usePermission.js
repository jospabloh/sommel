// Hook separado de PermissionContext.jsx a propósito (react-refresh).
import { useContext } from 'react';
import { PermissionContext } from '@/lib/PermissionContext';

export function usePermission() {
  return useContext(PermissionContext);
}
