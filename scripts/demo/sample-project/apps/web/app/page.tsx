import { ProductCard } from '@feria/ui';
import { getProducts } from '../lib/api';

export default async function Home() {
  const products = await getProducts();
  return (
    <main>
      <h1>Feria Online</h1>
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </main>
  );
}
