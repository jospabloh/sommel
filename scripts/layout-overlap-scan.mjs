// Layout scan: overlapping controls, horizontal overflow, clipped text and
// controls covered by a fixed bar or the corner theme switcher, on the main
// screens of Sommel at phone / tablet / desktop widths, in Chromium.
//
// Usage:  node scripts/layout-overlap-scan.mjs [--only mesas,orden] [--width 390,834]
//                                              [--shots dir] [--json out.json]
//   Starts Vite's dev server itself and fulfils EVERY /api/ request locally
//   with simulated data (nothing reaches Base44). Exits 1 when it finds a
//   problem. Needs a Playwright Chromium (PW_CHROMIUM overrides the path).
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const VIEWPORTS = [
  { w: 320, h: 568 }, { w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 834, h: 1194 },
  { w: 1024, h: 1366 }, { w: 1024, h: 768 }, { w: 1440, h: 900 },
];
const only = argOf('--width') ? argOf('--width').split(',').map(Number) : null;
const ONLY_SCREENS = argOf('--only') ? argOf('--only').split(',') : null;
const SHOTS = argOf('--shots');
const JSON_OUT = argOf('--json');

// ----------------------------------------------------------------- data --
const T = 't1';
const NOW = new Date().toISOString();
const USERS = {
  admin: { id: 'u1', email: 'dueno@example.invalid', full_name: 'Dueño Prueba', role: 'user', app_role: 'bar_admin', tenant_id: T },
  staff: { id: 'u2', email: 'mesero@example.invalid', full_name: 'Mesero Prueba', role: 'user', app_role: 'staff', tenant_id: T },
};
const tables = ['Mesa 1', 'Mesa 2', 'Barra 3', 'Terraza 4', 'Mesa 5', 'Mesa 6', 'Mesa 7', 'Reservada 8', 'Mesa 9'].map((name, i) => ({
  id: `bt${i}`, tenant_id: T, name, seats: 2 + (i % 5), status: i % 3 === 0 ? 'occupied' : 'free', created_date: NOW,
}));
const orders = [
  { id: 'o1', tenant_id: T, type: 'mesa', table_ids: ['bt0'], status: 'abierta', total: 184500, opened_at: NOW, created_date: NOW, number: 1 },
  { id: 'o2', tenant_id: T, type: 'mesa', table_ids: ['bt3'], status: 'abierta', total: 52000, opened_at: NOW, created_date: NOW, number: 2 },
  { id: 'o3', tenant_id: T, type: 'llevar', table_ids: [], customer_name: 'Alejandra Montserrat de la Fuente', status: 'abierta', total: 9800, opened_at: NOW, created_date: NOW, number: 3 },
];
const items = [
  ['Copa Malbec Reserva especial de la casa', 'enviado', 24000, 2, 'bar'],
  ['Tabla de quesos y carnes frías para compartir', 'listo', 38000, 1, 'kitchen'],
  ['Agua mineral', 'nuevo', 6500, 3, 'bar'],
  ['Risotto de hongos con trufa', 'nuevo', 31000, 1, 'kitchen'],
  ['Postre del día', 'cancelado', 14000, 1, 'kitchen'],
].map(([name, status, unit_price, qty, station], i) => ({
  id: `oi${i}`, tenant_id: T, order_id: 'o1', name, status, unit_price, qty, station, created_date: NOW, cancel_reason: status === 'cancelado' ? 'Cliente cambió de opinión' : undefined,
}));
const categories = ['Vinos tintos', 'Vinos blancos', 'Cocteles', 'Cervezas', 'Tapas y platos', 'Postres'].map((name, i) => ({ id: `cat${i}`, name, sort: i, tenant_id: T }));
const products = Array.from({ length: 18 }, (_, i) => ({
  id: `p${i}`, tenant_id: T, name: ['Malbec', 'Cabernet Sauvignon', 'Tempranillo Crianza', 'Margarita de tamarindo', 'Negroni', 'Tabla de quesos y carnes frías'][i % 6] + ` ${i}`,
  category_id: `cat${i % 6}`, station: i % 2 ? 'kitchen' : 'bar', active: i % 7 !== 0, price: 9500 + i * 500,
  variants: i % 3 === 0 ? [{ key: 'copa', label: 'Copa', price: 9500 }, { key: 'botella', label: 'Botella (750 ml)', price: 58000 }] : [],
  modifiers: i % 4 === 0 ? [{ key: 'hielo', label: 'Con hielo', price: 0 }] : [],
  cost: 3000, sku: `SKU-${i}`,
}));
const people = [
  ['Ana García', 'in'], ['Luis Hernández Domínguez', 'out'], ['Valeria', 'in'], ['José Pablo', 'out'], ['Mariana Villaseñor', 'out'], ['Dani', 'in'],
].map(([name, st], i) => ({ user_id: `up${i}`, name, full_name: name, email: `p${i}@example.invalid`, status: st, has_pin: i % 2 === 0, clocked_in: st === 'in', role: i ? 'staff' : 'bar_admin', since: NOW }));
const bar = {
  id: T, name: 'Sommel Bar de Prueba', billing_status: 'trial', trial_end_at: new Date(Date.now() + 12 * 864e5).toISOString(), plan: null, tax_rate: 16,
  corte_emails: ['dueno@example.invalid', 'contabilidad@example.invalid'], payment_methods: [{ key: 'efectivo', label: 'Efectivo', enabled: true }, { key: 'tarjeta', label: 'Tarjeta', enabled: true }],
  ticket_header: 'Sommel Bar', ticket_footer: 'Gracias por su visita', tip_suggestions: [10, 15, 20],
};
const inventory = Array.from({ length: 8 }, (_, i) => ({ id: `ii${i}`, name: ['Malbec botella', 'Limones', 'Hielo (bolsa)', 'Aceitunas verdes rellenas'][i % 4] + ` ${i}`, unit: 'pza', stock: i % 3 ? 12 : 1, low_threshold: 3, tenant_id: T }));

const fnData = {
  catalog: { categories, products },
  attendance: { people, records: [], totals: [], range: {} },
  shifts: {
    current: { shift: { id: 's1', opened_at: NOW, opened_by: 'Dueño Prueba', opening_float: 150000, expected_cash: 420000 }, cash_outs: [{ id: 'm1', reason: 'Compra de hielo y limones para la barra', amount: 25000, created_date: NOW }], totals_by_method: [{ key: 'efectivo', label: 'Efectivo', count: 8, amount: 270000 }, { key: 'tarjeta', label: 'Tarjeta', count: 5, amount: 640000 }], sales_total: 910000 },
    list: { shifts: [{ id: 's0', opened_at: NOW, closed_at: NOW, opened_by: 'Dueño Prueba', sales_total: 1200000, difference: -5000, status: 'closed' }] },
  },
  settings: { get: { bar }, billing: { bar: { billing_status: bar.billing_status, trial_end_at: bar.trial_end_at } } },
  inventory: { list: { items: inventory, low_ids: ['ii0', 'ii3'] } },
  stations: { getConfig: { bar: { name: bar.name, station_labels: {} } } },
  payments: {
    summary: {
      order: orders[0], items: items.filter((i) => i.status !== 'cancelado'), payments: [], remaining: 184500, subtotal: 184500, total: 184500, shift_open: true,
      methods: [{ key: 'efectivo', label: 'Efectivo', kind: 'cash' }, { key: 'tarjeta', label: 'Tarjeta', kind: 'card' }, { key: 'transferencia', label: 'Transferencia', kind: 'other' }],
      tip_suggestions: [10, 15, 20],
    },
  },
  reports: { summary: { totals: { sales: 1200000, orders: 40, avg_ticket: 30000, tips: 90000 }, previous_totals: { sales: 1000000, orders: 35, avg_ticket: 28000, tips: 80000 }, by_hour: [], by_product: [], top_products: [], by_category: [], by_person: [], by_method: [], cancellations: { count: 0, items: [] }, courtesies: [], waste: { count: 0 }, range: {}, previous_range: {} } },
  session: { listSessions: { sessions: [{ id: 'se1', device: 'iPad Safari', last_active_at: NOW, current: true }], current_device_id: 'd' } },
  manageStaff: { list: { staff: [{ id: 'u1', full_name: 'Dueño Prueba', email: 'dueno@example.invalid', app_role: 'bar_admin' }, { id: 'u2', full_name: 'Mariana Villaseñor Domínguez', email: 'mariana.villasenor.dominguez@example.invalid', app_role: 'staff' }], invites: [{ id: 'iv1', email: 'invitado.con.correo.largo@example.invalid', status: 'pending' }] } },
  permissions: { getProfile: { overrides: {} } },
  printing: { queue: { jobs: [] } },
  orders: {},
};

function dataFor(fn, action, role) {
  const group = fnData[fn];
  let out = group && (group[action] ?? group);
  if (fn === 'catalog' && role === 'staff') out = { categories, products: products.map(({ cost, ...r }) => r) };
  return { ok: true, ...(out && typeof out === 'object' ? out : {}) };
}

function entityRows(name) {
  if (name === 'BarTable') return tables;
  if (name === 'Order') return orders;
  if (name === 'OrderItem') return items;
  if (name === 'SupportTicket') return [];
  if (name === 'PermissionProfile') return [];
  return [];
}

async function mockBackend(ctx, who) {
  const me = { ...USERS[who] };
  await ctx.route((url) => url.pathname.startsWith('/api/') || /socket\.io/.test(url.href), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
    const json = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) });
    if (/socket\.io/.test(url.href)) return route.abort();
    if (p.includes('public-settings')) return json({ id: 'mockapp', public_settings: {} });
    if (p.endsWith('/entities/User/me')) return json(me);
    let m = p.match(/\/entities\/(\w+)(?:\/(\w+))?$/);
    if (m) {
      const rows = entityRows(m[1]);
      if (req.method() !== 'GET') return json({ id: `mock_${Date.now()}`, ...body });
      if (m[2]) return json(rows.find((r) => r.id === m[2]) || {});
      let q = {};
      try { q = JSON.parse(url.searchParams.get('q') || '{}'); } catch { /* none */ }
      return json(rows.filter((r) => Object.entries(q).every(([k, v]) => typeof v === 'object' || r[k] === undefined || r[k] === v)));
    }
    m = p.match(/\/functions\/(\w+)/);
    if (m) return json(dataFor(m[1], body.action, who));
    return json({ ok: true });
  });
}

// --------------------------------------------------------------- screens --
// `after` runs once the screen has loaded, to open a dialog/sheet to scan.
const SCREENS = [
  { key: 'login', path: '/login', anon: true },
  { key: 'register', path: '/register', anon: true },
  { key: 'mesas', path: '/mesas' },
  { key: 'orden', path: '/orden/o1' },
  { key: 'orden-agregar', path: '/orden/o1', after: async (page) => { await page.getByRole('button', { name: /Agregar/ }).first().click(); await page.waitForTimeout(500); } },
  { key: 'orden-cobrar', path: '/orden/o1', after: async (page) => { await page.getByRole('button', { name: /Cobrar/ }).first().click(); await page.waitForTimeout(700); } },
  { key: 'orden-llevar', path: '/orden/nueva?tipo=llevar' },
  { key: 'mesas-nueva', path: '/mesas', after: async (page) => { await page.getByRole('button', { name: /^Mesa$/ }).first().click(); await page.waitForTimeout(500); } },
  { key: 'orden-variante', path: '/orden/o1', after: async (page) => { await page.getByRole('button', { name: /Agregar/ }).first().click(); await page.waitForTimeout(500); await page.locator('[role=dialog] button', { hasText: /Malbec 0/ }).first().click().catch(() => {}); await page.waitForTimeout(600); } },
  { key: 'orden-dividir', path: '/orden/o1', after: async (page) => { await page.getByRole('button', { name: /Cobrar/ }).first().click(); await page.waitForTimeout(600); await page.getByRole('button', { name: /Iguales/ }).first().click().catch(() => {}); await page.waitForTimeout(500); } },
  { key: 'orden-menu', path: '/orden/o1', after: async (page) => { await page.locator('button:has(svg.lucide-ellipsis-vertical)').first().click().catch(() => {}); await page.waitForTimeout(400); } },
  { key: 'turno', path: '/turno' },
  { key: 'mesas-staff', path: '/mesas', who: 'staff' },
  { key: 'orden-staff', path: '/orden/o1', who: 'staff' },
  { key: 'turno-salida', path: '/turno', after: async (page) => { await page.getByRole('button', { name: /Registrar salida/ }).first().click(); await page.waitForTimeout(500); } },
  { key: 'turno-cierre', path: '/turno', after: async (page) => { await page.getByRole('button', { name: /Cerrar turno|Hacer corte|Cerrar/ }).first().click(); await page.waitForTimeout(500); } },
  { key: 'checador-pin', path: '/checador', after: async (page) => { await page.getByRole('button', { name: /Valeria/ }).first().click(); await page.waitForTimeout(500); } },
  { key: 'menu-producto', path: '/menu', after: async (page) => { await page.getByRole('button', { name: /^Producto$/ }).first().click(); await page.waitForTimeout(500); } },
  { key: 'inventario-nuevo', path: '/inventario', after: async (page) => { await page.getByRole('button', { name: /Nuevo insumo/ }).first().click(); await page.waitForTimeout(500); } },
  { key: 'staff-invitar', path: '/staff', after: async (page) => { await page.locator('input[type=email]').first().fill('persona.con.correo.muy.largo@example.invalid').catch(() => {}); } },
  { key: 'menu', path: '/menu' },
  { key: 'cocina', path: '/estacion/kitchen' },
  { key: 'barra', path: '/estacion/bar' },
  { key: 'checador', path: '/checador' },
  { key: 'asistencia', path: '/asistencia' },
  { key: 'inventario', path: '/inventario' },
  { key: 'reportes', path: '/reportes' },
  { key: 'impresion', path: '/estacion/impresion' },
  { key: 'staff', path: '/staff' },
  { key: 'permisos', path: '/permisos' },
  { key: 'ajustes', path: '/ajustes' },
  { key: 'cuenta', path: '/cuenta' },
  { key: 'soporte', path: '/soporte' },
  { key: 'about', path: '/about' },
];

// Runs in the page. Returns { overlaps, covered, overflowX, clipped }.
async function measure(page, phase) {
  return page.evaluate((phase) => {
    const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=menuitem], [role=option], [role=combobox]';
    const label = (el) => {
      const t = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || '';
      return `${el.tagName.toLowerCase()} "${t.replace(/\s+/g, ' ').trim().slice(0, 36)}"`;
    };
    const modal = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]');
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      if (el.closest('[aria-hidden="true"], [inert]')) return false;
      if (el.disabled && false) return false;
      if (modal && !modal.contains(el) && !el.closest('[data-theme-switcher]')) return false;
      // clipped away by an overflow ancestor?
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (/(hidden|auto|scroll|clip)/.test(ac.overflowX + ac.overflowY)) {
          const ar = a.getBoundingClientRect();
          if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) return false;
        }
      }
      return true;
    };
    const els = [...document.querySelectorAll(SEL)].filter(visible);
    // A fixed bar / the corner switcher may sit over content that can still be
    // scrolled clear of it: that is only judged at the end of the scroll.
    const scrollable = document.scrollingElement.scrollHeight > innerHeight + 2;
    const fixedOf = (el) => {
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return a;
      return null;
    };
    const skipFixed = (a, b) => phase === 'top' && scrollable && (!!fixedOf(a) !== !!fixedOf(b));
    // b sits fully inside a and is the thing hit at its own centre: a deliberate overlay.
    const nestedOnTop = (a, b, ra, rb) => ra.left <= rb.left + 1 && ra.right >= rb.right - 1 && ra.top <= rb.top + 1 && ra.bottom >= rb.bottom - 1 && (() => {
      const cx = rb.left + rb.width / 2, cy = rb.top + rb.height / 2;
      if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return true; // cannot be probed off-screen
      const at = document.elementFromPoint(cx, cy);
      return !!at && (at === b || b.contains(at));
    })();
    const inter = (a, b) => {
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return w > 2 && h > 2 ? w * h : 0;
    };
    const overlaps = [];
    const rects = els.map((e) => e.getBoundingClientRect());
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.contains(b) || b.contains(a)) continue;
        // a label wrapping the control it labels (radio rows) is one hit area
        if (a.closest('label') && a.closest('label') === b.closest('label')) continue;
        const area = inter(rects[i], rects[j]);
        if (area && skipFixed(a, b)) continue;
        if (area && (nestedOnTop(a, b, rects[i], rects[j]) || nestedOnTop(b, a, rects[j], rects[i]))) continue;
        if (area) overlaps.push(`${label(a)} X ${label(b)} (${Math.round(area)}px2)`);
      }
    }
    // Controls whose centre is painted over by something that is not them.
    const covered = [];
    for (let i = 0; i < els.length; i++) {
      const r = rects[i];
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * 0.3, r.top + r.height / 2], [r.right - r.width * 0.3, r.top + r.height / 2]];
      for (const [x, y] of pts) {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const at = document.elementFromPoint(x, y);
        if (!at || at === els[i] || els[i].contains(at) || at.contains(els[i])) continue;
        if (at.closest('label') && at.closest('label') === els[i].closest('label')) continue;
        // A <label>/<td> or sibling text is not a competing control.
        const hit = at.closest(SEL) || at.closest('[data-theme-switcher], [class*="fixed"]');
        if (!hit || hit === els[i] || skipFixed(els[i], hit)) continue;
        covered.push(`${label(els[i])} covered by ${label(hit)}`);
        break;
      }
    }
    const doc = document.scrollingElement;
    const overflowX = doc.scrollWidth > innerWidth + 1 ? `page ${doc.scrollWidth}px > ${innerWidth}px` : null;
    const wide = [];
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('[data-radix-popper-content-wrapper], [role=dialog]')) {
        wide.push(`${label(el)} right=${Math.round(r.right)}`);
        if (wide.length > 4) break;
      }
    }
    const clipped = [];
    for (const el of document.querySelectorAll('button, a, h1, h2, h3, label, span, p, div')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el);
      if (!/(hidden|clip)/.test(cs.overflowX) || el.clientWidth <= 2) continue;
      if (cs.textOverflow === 'ellipsis') continue; // deliberate truncation
      if (el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().width > 0) {
        clipped.push(`${label(el)} scrollW ${el.scrollWidth} > ${el.clientWidth}`);
      }
    }
    return { overlaps, covered: [...new Set(covered)], overflowX, wide, clipped };
  }, phase);
}

// ------------------------------------------------------------------ main --
process.env.VITE_BASE44_APP_ID = 'mockapp';
process.env.VITE_BASE44_APP_BASE_URL = 'http://localhost:5199';
const server = await createServer({ server: { port: 6100 + Math.floor(Math.random() * 800), strictPort: false }, logLevel: 'error', define: {}, envPrefix: 'VITE_' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const exe = process.env.PW_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', undefined].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const report = [];
let problems = 0;
const vps = VIEWPORTS.filter((v) => !only || only.includes(v.w));

for (const vp of vps) {
  for (const scr of SCREENS) {
    if (ONLY_SCREENS && !ONLY_SCREENS.includes(scr.key)) continue;
    const who = scr.who || 'admin';
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.w <= 1024, isMobile: vp.w <= 834, deviceScaleFactor: 1 });
    if (!scr.anon) await ctx.addInitScript(() => { try { localStorage.setItem('base44_access_token', 'mock'); localStorage.setItem('sommel-theme', 'light'); } catch { /* none */ } });
    await mockBackend(ctx, who);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
    try {
      await page.goto(base + scr.path, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(600);
      if (scr.after) await scr.after(page);
    } catch (e) { errors.push(`nav: ${String(e.message).slice(0, 120)}`); }
    for (const phase of ['top', 'bottom']) {
      if (phase === 'bottom') { await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight)); await page.waitForTimeout(200); }
      const m = await measure(page, phase);
      const finding = { vp: `${vp.w}x${vp.h}`, screen: scr.key, phase, path: page.url().replace(base, ''), errors: phase === 'top' ? errors : [], ...m };
      const bad = m.overlaps.length + m.covered.length + (m.overflowX ? 1 : 0) + m.wide.length + m.clipped.length;
      if (bad) { problems += bad; report.push(finding); }
      if (SHOTS && (bad || phase === 'top')) {
        await mkdir(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/${scr.key}-${vp.w}x${vp.h}-${phase}.png` });
      }
    }
    if (errors.length) report.push({ vp: `${vp.w}x${vp.h}`, screen: scr.key, errorsOnly: errors });
    await ctx.close();
  }
}
await browser.close();
await server.close();

for (const f of report) {
  if (f.errorsOnly) { console.log(`ERR  ${f.vp} ${f.screen}: ${f.errorsOnly.join(' | ')}`); continue; }
  console.log(`\n${f.vp} ${f.screen} [${f.phase}] -> ${f.path}`);
  for (const k of ['overlaps', 'covered', 'wide', 'clipped']) for (const x of f[k]) console.log(`  ${k}: ${x}`);
  if (f.overflowX) console.log(`  overflowX: ${f.overflowX}`);
}
console.log(`\n${problems} problema(s)`);
if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(report, null, 2));
process.exit(problems ? 1 : 0);
