// Dinero: enteros en centavos MXN (contrato §1/§5). La UI SOLO formatea —
// nunca calcula subtotal/descuento/propina/total/cambio, eso lo hace siempre
// el servidor.

/**
 * Formatea centavos como pesos mexicanos, p.ej. formatMXN(12550) => "$125.50".
 * @param {number} cents
 * @returns {string}
 */
export function formatMXN(cents) {
  const value = (Number(cents) || 0) / 100;
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** @param {number} pesos @returns {number} */
export function pesosToCents(pesos) {
  return Math.round(Number(pesos) * 100);
}

/** @param {number} cents @returns {number} */
export function centsToPesos(cents) {
  return Number(cents) / 100;
}
