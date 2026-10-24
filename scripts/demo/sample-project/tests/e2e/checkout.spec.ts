import { test, expect } from '@playwright/test';

test('a person buys a cheese', async ({ page }) => {
  await page.goto('http://localhost:3000/checkout');
  await page.getByRole('button', { name: 'Pagar' }).click();
  await expect(page.getByText('Pedido listo')).toBeVisible();
});
