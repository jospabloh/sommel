// Per-app half of the shared smoke suite (Module 13). smoke.spec.js next to
// this file is byte-identical across the portfolio; everything Sommel-specific
// lives here.
export default {
  name: 'Sommel',

  // The deployed site. SMOKE_URL overrides it (the workflow uses that to point
  // the same suite at a preview).
  url: 'https://sommel.acaciaco.com.mx',

  // Taken verbatim from this repo's index.html <title>.
  title: /Sommel/,

  // PUBLIC routes only: the suite holds no credentials on purpose, so screens
  // behind a login (Mesas, Orden, ...) are NOT covered by a green run. Module 12
  // says what is owed for those: a look at the corner by hand on the first
  // deploy. './' lands on /login for an anonymous visitor.
  routes: ['./', './login', './register', './forgot-password', './reset-password', './no-such-page'],

  theme: {
    // Tailwind `.dark` on <html>, set by the pre-mount script in index.html and
    // by ThemeContext. The switcher's root carries data-theme-switcher.
    kind: 'class',
    root: '[data-theme-switcher]',
  },
};
