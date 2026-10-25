const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function getProducts() {
  const res = await fetch(`${API}/products`);
  return res.json();
}

export async function createOrder(items: { id: string; qty: number }[]) {
  const res = await fetch(`${API}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) });
  return { ok: res.ok, ...(await res.json()) };
}
