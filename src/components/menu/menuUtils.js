// Helpers compartidos por los componentes de Menú (contrato §5 — este
// directorio es del agente "Menú UI"). Sin llamadas al servidor: solo
// texto/formato para las pantallas 6 y 13 de la propuesta.

export const STATION_OPTIONS = [
  { value: 'kitchen', label: 'Cocina' },
  { value: 'bar', label: 'Barra' },
  { value: 'none', label: 'Ninguna' },
];

export function stationLabel(station) {
  return STATION_OPTIONS.find((o) => o.value === station)?.label ?? 'Ninguna';
}

/**
 * Genera una llave estable a partir de una etiqueta ("Chico (2-4 personas)"
 * => "chico_2_4_personas"), para variantes y modificadores cuando quien
 * captura no escribe una a mano.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return (text || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Precio a mostrar en la tarjeta del producto: el precio simple, o el rango
 * mínimo-máximo de sus variantes si las tiene.
 * @param {{price:number, variants?: Array<{price:number}>}} product
 * @returns {{min:number, max:number}}
 */
export function priceRange(product) {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const prices = product.variants.map((v) => v.price ?? 0);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }
  return { min: product.price ?? 0, max: product.price ?? 0 };
}

/**
 * Utilidad y margen (%) para un par precio/costo. Costo `null`/`undefined`
 * => "sin capturar", nunca se trata como cero (evita mostrar 100% de margen
 * en un producto al que simplemente nadie le puso el costo todavía).
 * @param {number} price
 * @param {number|null|undefined} cost
 * @returns {{profit:number, marginPct:number}|null}
 */
export function profitFor(price, cost) {
  if (cost === null || cost === undefined) return null;
  const profit = (price ?? 0) - cost;
  const marginPct = price > 0 ? (profit / price) * 100 : 0;
  return { profit, marginPct };
}
