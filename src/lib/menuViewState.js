// Which body the Menú page shows. A failed load must never read as an empty
// menu ("Todavía no hay categorías" invites creating duplicates). No imports.
export function menuViewState({ loadError, categoryCount }) {
  if (loadError) return 'error';
  return categoryCount === 0 ? 'empty' : 'list';
}
