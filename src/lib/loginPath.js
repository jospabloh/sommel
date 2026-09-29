// Where an unauthenticated visitor is sent. Sommel renders its own /login
// (module 10): never Base44's hosted login page. The current location rides
// along as ?returnTo= so Login.jsx can resume it after sign-in (Login reads it
// back through safeReturnTo(), which does the open-redirect validation).

export const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

export function isAuthPath(pathname) {
  const clean = (pathname || "").replace(/\/+$/, "") || "/";
  return AUTH_PATHS.includes(clean);
}

export function loginPath(location = window.location) {
  if (isAuthPath(location.pathname)) return "/login";
  const target = (location.pathname || "/") + (location.search || "");
  if (target === "/" || target === "") return "/login";
  return "/login?returnTo=" + encodeURIComponent(target);
}
