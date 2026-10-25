// What a question wants: to understand (the agent only reads and explains) or to change something
import test from 'node:test';
import assert from 'node:assert/strict';
import { questionIntent } from '../../renderer/models/questionIntent.js';

test('asking to understand is "explain"', () => {
  for (const q of ['Explícame qué hay en «db/»', '¿Qué hace esta carpeta?', '¿Para qué sirve package.json?', 'Quiero entender cómo funciona el login', '¿Qué es esto?', 'cuéntame qué hay aquí', '¿Cómo funciona el pago?']) {
    assert.equal(questionIntent(q), 'explain', q);
  }
});

test('asking for a change, a fix or a security check is not', () => {
  for (const q of ['Arregla el login', 'Repara orders.ts', 'Cambia el color del botón', '¿Es seguro mi .env?', 'Explícame y arregla el error', 'Agrega una prueba', 'Revisa si hay riesgos', 'Quiero cambiar algo aquí']) {
    assert.notEqual(questionIntent(q), 'explain', q);
  }
  assert.equal(questionIntent('Arregla el login'), 'change');
  assert.equal(questionIntent('hola'), 'other');
});
