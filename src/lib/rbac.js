// Single mapping from a user record to Sommel's roles. Base44's built-in
// `role: 'admin'` is the PLATFORM only; the bar's role is `app_role`
// (bar_admin | staff). Keep every client role check going through here.
export const PLATFORM_ROLE = 'admin';
export const BAR_ADMIN = 'bar_admin';
export const STAFF = 'staff';

export const isPlatformUser = (user) => user?.role === PLATFORM_ROLE;
export const barRoleOf = (user) => user?.app_role ?? null;
export const isBarAdmin = (user) => barRoleOf(user) === BAR_ADMIN;
// Bar administrators and the platform can manage the bar (team, permissions).
export const canManageBar = (user) => isPlatformUser(user) || isBarAdmin(user);

/** Short label for who is signed in, shown in the sidebar. */
export function roleLabel(user) {
  if (isPlatformUser(user)) return 'Plataforma ACACIA';
  if (isBarAdmin(user)) return 'Admin del bar';
  if (barRoleOf(user) === STAFF) return 'Personal';
  return 'Sin bar';
}
