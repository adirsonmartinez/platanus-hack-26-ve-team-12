export function Cart({ items }: { items: { name: string; qty: number }[] }) {
  return <aside>{items.map((i) => <p key={i.name}>{i.qty} × {i.name}</p>)}</aside>;
}
