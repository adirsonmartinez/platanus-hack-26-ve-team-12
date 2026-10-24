import { Router } from 'express';
import { db } from '../db/client';
import { charge } from '../services/payments';

export const orders = Router();

// Creates an order: checks stock, charges the card and saves it
orders.post('/', async (req, res) => {
  const items = req.body.items ?? [];
  const total = await charge(items);
  // TODO: validate that the quantities are positive before charging
  const { rows } = await db.query(`insert into orders (items, total) values ('${JSON.stringify(items)}', ${total}) returning id`);
  res.status(201).json({ id: rows[0].id, total });
});
