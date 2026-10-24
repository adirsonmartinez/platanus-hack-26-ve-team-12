import { getProducts } from '../../lib/api';

export default async function Productos() {
  const products = await getProducts();
  return <ul>{products.map((p) => <li key={p.id}>{p.name} · {p.price}</li>)}</ul>;
}
