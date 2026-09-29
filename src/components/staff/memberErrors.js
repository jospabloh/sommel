// Maps manageStaff member-action error codes to Spanish messages.
const MESSAGES = {
  owner_locked: 'El dueño del bar no se puede modificar.',
  last_admin: 'El bar no puede quedarse sin administrador. Nombra a otra persona antes.',
  self_remove: 'No puedes quitarte a ti mismo del equipo.',
  not_found: 'Esa persona ya no está en el equipo.',
  read_only: 'El bar está en modo solo lectura o suspendido.',
};

export function memberErrorMessage(err, fallback) {
  const code = err?.response?.data?.code;
  return MESSAGES[code] || err?.response?.data?.error || err?.message || fallback;
}
