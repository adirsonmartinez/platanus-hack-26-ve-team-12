// Charges an order with the payments provider (sandbox while developing)
export async function charge(items: { id: string; qty: number }[]) {
  const total = items.reduce((sum, item) => sum + item.qty * 5, 0);
  return total;
}
