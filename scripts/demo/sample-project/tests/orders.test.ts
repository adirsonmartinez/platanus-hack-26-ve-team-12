import { describe, it, expect } from 'vitest';
import { charge } from '../apps/api/src/services/payments';

describe('charge', () => {
  it('adds up the order', async () => {
    expect(await charge([{ id: 'queso', qty: 2 }])).toBe(10);
  });
});
