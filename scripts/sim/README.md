# scripts/sim: simulador del chat

Un agente falso que habla exactamente como Claude Code (stream JSON) y llama **de verdad** a las
herramientas de Qubbot, para probar el chat en distintos escenarios sin gastar una suscripción.

| Archivo | Qué hace |
|---|---|
| `fakeAgent.js` | El "programa del agente": lee `-p` y `--mcp-config`, elige un escenario y lo reproduce con pausas reales. |
| `scenarios.js` | Los escenarios (`revision`, `ayudantes`, `error`, `secreto`, `aprobacion`, `largo`, `caida`, más `repair` y `refine` automáticos). |
| `run.mjs` | Recorre todos los escenarios en la app abierta y guarda capturas y `report.json`. |
| `fakeAgent.test.js` | Pruebas del simulador contra un servidor de herramientas de prueba (entra en `npm test`). |

Uso:

```bash
PLATANUS_SIM=1 npx electron . --remote-debugging-port=9223 --open=<proyecto>
node scripts/sim/run.mjs 9223 sim-report
```

- Con `PLATANUS_SIM=1` aparece "Simulador (pruebas)" en "Quién responde". En el chat se elige el escenario
  escribiendo `[sim:nombre]`.
- En ese modo, los diálogos de permiso se cancelan solos a los 5 s, para que una prueba no se quede esperando.
- La carpeta `scripts/` no entra en el instalador (`build.files`), así que el simulador nunca llega a una
  versión publicada.
- Agregar un escenario: una entrada en `scenarios.js` con pasos `{ think }`, `{ say }`, `{ tool, input }`,
  `{ task, steps }` o `{ crash }`.
