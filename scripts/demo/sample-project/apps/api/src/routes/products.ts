import { Router } from 'express';
import { db } from '../db/client';

export const products = Router();

products.get('/', async (_req, res) => {
  const { rows } = await db.query('select id, name, price from products order by name');
  res.json(rows);
});
