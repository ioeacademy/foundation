export async function fetchCatalog() {
  const res = await fetch('/api/v1/catalog', { cache: 'no-store' });
  if (!res.ok) throw new Error('Catalogo non disponibile (' + res.status + ')');
  const data = await res.json();
  return data.courses || [];
}
