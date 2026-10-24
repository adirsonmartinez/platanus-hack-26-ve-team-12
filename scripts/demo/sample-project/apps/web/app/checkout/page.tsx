'use client';
import { useState } from 'react';
import { Button } from '@feria/ui';
import { createOrder } from '../../lib/api';

export default function Checkout() {
  const [status, setStatus] = useState('');
  async function pay() {
    const order = await createOrder(JSON.parse(localStorage.getItem('cart') ?? '[]'));
    setStatus(order.ok ? 'Pedido listo' : 'No se pudo pagar');
  }
  return <section><Button onClick={pay}>Pagar</Button><p>{status}</p></section>;
}
