import React from "react";

// Same SOMMEL logo Layout.jsx shows in the sidebar. Never a tenant's logo:
// the login page is shown before anyone belongs to a bar.
const SOMMEL_LOGO = "https://media.base44.com/images/public/6ab41c2a89f592a0eca074d2/068ca3173_Sommel_logo.png";

export const SUPPORT_EMAIL = "soporte@acaciaco.com.mx";
export const SITE_URL = "https://acaciaco.com.mx";

// Module 10 shell (adapted from acacia-app-standard shared/auth/AuthLayout.example.jsx):
// form column on the left, brand panel on the right from `lg` up. Every colour
// is a theme token. The icon/title/subtitle/footer/children props are the ones
// the auth pages (and OAuthConsent) already pass; the brand props default to
// Sommel's own copy so none of them has to repeat it.
export default function AuthLayout({
  icon: Icon,
  title,
  subtitle = null,
  footer = null,
  children,
  appName = "Sommel",
  logoSrc = SOMMEL_LOGO,
  tagline = "Punto de venta para wine bars",
  eyebrow = "Punto de venta · wine bars",
  headline = "Cada mesa, cada copa,",
  headlineAccent = "bajo control.",
  description = "Comandas a barra y cocina, cobros, turnos y checador del equipo, en un solo lugar.",
}) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-2">
      {/* Form column */}
      <div className="flex min-h-screen flex-col px-6 py-8 lg:min-h-0 lg:px-12">
        <a href="/" className="flex w-fit items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
          {logoSrc && <img src={logoSrc} alt="" className="h-9 w-9 rounded-xl object-cover shadow-sm" />}
          {appName}
        </a>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-7 text-center">
            {Icon && (
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>

          {children}

          {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
        </div>

        <div className="space-y-1 px-10 pb-12 text-center text-xs text-muted-foreground lg:px-0 lg:pb-0">
          <p>
            ¿Necesitas ayuda?{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            {" · "}
            <a href={SITE_URL} className="font-medium text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              acaciaco.com.mx
            </a>
          </p>
          <p>
            {appName}
            {tagline ? ` · ${tagline}` : ""}
          </p>
          <p>
            by <span className="font-semibold text-foreground">ACACIA Consultoría</span>
          </p>
        </div>
      </div>

      {/* Brand panel: desktop only, removed from the layout below lg */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary/25 via-primary/5 to-background lg:block">
        <div className="absolute inset-0 flex flex-col justify-center px-12">
          {eyebrow && (
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {eyebrow}
            </span>
          )}
          <h2 className="mt-5 text-4xl font-bold leading-tight">
            {headline}
            {headlineAccent && (
              <>
                <br />
                <span className="text-primary">{headlineAccent}</span>
              </>
            )}
          </h2>
          {description && <p className="mt-4 max-w-sm text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
    </div>
  );
}
