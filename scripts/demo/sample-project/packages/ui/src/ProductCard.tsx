export function ProductCard({ product }: { product: { name: string; price: number } }) {
  return <article className="feria-card"><h2>{product.name}</h2><p>{product.price}</p></article>;
}
