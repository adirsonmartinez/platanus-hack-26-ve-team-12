// Scenarios of the simulated agent (scripts/sim/fakeAgent.js). Each one is a list of steps, played in
// order with realistic pauses:
//   { think }            reasoning                      { say }    a piece of the answer (streams in chunks)
//   { tool, input }      a Platanus tool, really called  { task, steps }  a helper (subagent) and its steps
//   { crash }            the CLI dies with this exit code
// Pick one by writing "[sim:nombre]" in the message. A repair prompt gets `repair`; the "Mejorar mi
// mensaje" prompt gets `refine`; anything else gets `revision`.

// A small file the runner (run.mjs) creates before the change scenarios and deletes afterwards
const FIXTURE = {
  path: 'platanus-sim/nota.txt',
  before: 'Nota de prueba de Platanus\nversion: 1\nclave: (vacía)\nautor: simulador\n',
  after: 'Nota de prueba de Platanus\nversion: 2\nclave: (vacía)\nautor: simulador\nrevisado: sí\n',
};

const TOUR_FERIA = {
  summary: 'Feria Online es la tienda de una feria de productores: la gente elige frutas, verduras y quesos y paga desde su casa.',
  steps: {
    place: { title: 'Una feria, tres partes', say: 'Todo vive en un mismo lugar: la tienda que ve la gente, el servicio que guarda pedidos y unas piezas de diseño que ambas comparten.', bubble: '¡Hola! Te muestro la feria' },
    doc1: { title: 'Empieza por el README', say: 'Es la portada: cuenta qué es la feria, cómo se enciende todo con un solo comando y qué hace cada parte.', bubble: 'Aquí está la portada' },
    part1: { title: 'Donde se anotan los pedidos', say: 'Recibe cada compra, la cobra y la guarda junto con los productos de cada productor.', bubble: 'Aquí se guardan los pedidos' },
    part2: { title: 'La tienda que ve la gente', say: 'Las páginas para mirar productos, llenar el carrito y pagar. Usa las piezas de diseño compartidas.', bubble: 'Esto es lo que ve quien compra' },
    entry: { title: 'Aquí se enciende el servicio', say: 'Este archivo arranca el servicio de pedidos y le dice qué hacer con cada pedido que llega.', bubble: 'La puerta de entrada' },
    tests: { title: 'Pruebas de la compra', say: 'Revisan solas que cobrar y comprar sigan funcionando. Córrelas antes de cambiar algo.', bubble: 'Esto cuida que nada se rompa' },
  },
  usecases: [{
    candidate: 'uc3',
    title: 'Caso de uso: Comprar en la feria',
    say: 'La persona paga en la página de pago, la tienda envía el pedido al servicio, que lo cobra y lo guarda.',
    flow: ['apps/web/app/checkout/page.tsx', 'apps/web/lib/api.ts', 'apps/api/src/routes/orders.ts', 'apps/api/src/services/payments.ts'],
  }],
  start: { say: 'Lee el README, enciende la feria con un comando y sigue una compra desde la página de pago. Si algo no se entiende, pregúntame.', open: 'README.md', folder: 'apps/api', ask: '¿Cómo se guarda un pedido en Feria Online?' },
  skip: [],
};

const SUGGEST = (lines) => `\n\n\`\`\`sugerencias\n${lines.map((l) => `- ${l}`).join('\n')}\n\`\`\``;

const scenarios = {
  revision: () => [
    { think: 'La persona quiere saber si vercel.json es seguro. Miro el proyecto y leo el archivo.' },
    { tool: 'get_project', input: {} },
    { tool: 'read_file', input: { path: 'vercel.json' } },
    { tool: 'set_file_score', input: { path: 'vercel.json', level: 'green', reason: 'Sin claves; con cabeceras de seguridad' } },
    { say: 'Sí, tu `vercel.json` es seguro. Lo revisé y lo marqué en verde.\n\n> [!ok] No guarda claves\n> Solo dice cómo se publica tu página.\n\n> [!idea] Una mejora opcional\n> Podrías limitar desde dónde se cargan las cosas de tu página, como una lista de invitados.' },
    { say: SUGGEST(['¿Cómo agrego esa lista?', 'auditar: package.json', 'abrir: vercel.json']) },
  ],

  ayudantes: () => [
    { think: 'Hay varias cosas que revisar: reparto el trabajo en un ayudante.' },
    { say: 'Voy a revisar tu configuración con un ayudante.' },
    {
      task: { description: 'Revisar la configuración del proyecto', type: 'Explore' },
      steps: [
        { tool: 'read_file', input: { path: 'package.json' } },
        { tool: 'read_file', input: { path: 'vercel.json' } },
        { say: 'La configuración no tiene claves.' },
      ],
    },
    { tool: 'set_file_score', input: { path: 'package.json', level: 'yellow', reason: 'La app se arma sin firma digital' } },
    { say: 'Revisé los dos archivos de configuración.\n\n> [!riesgo] Tu app no tiene firma digital\n> Al instalarla, la computadora avisa "programa desconocido". Lo marqué en amarillo.\n\n> [!paso] Qué te falta hacer a ti\n> Conseguir un certificado de Apple y otro de Windows.' },
    { say: SUGGEST(['¿Cómo firmo mi app?', 'ver: .github']) },
  ],

  error: () => [
    { tool: 'read_file', input: { path: 'no-existe.js' } },
    { think: 'Ese archivo no existe; sigo con lo que sí hay.' },
    { tool: 'list_risks', input: {} },
    { say: 'No encontré `no-existe.js` en tu proyecto, así que revisé la lista de riesgos.\n\n> [!nota] Nada nuevo\n> Los archivos en riesgo son los mismos que ves en el mapa.' },
    { say: SUGGEST(['¿Qué archivo reviso primero?']) },
  ],

  secreto: () => [
    { tool: 'read_file', input: { path: '.env' } },
    { say: 'Platanus no me deja abrir `.env`, y está bien: ahí se guardan claves.\n\n> [!idea] Lo importante\n> Que ese archivo nunca se suba a internet. Puedo revisar si está protegido.' },
    { say: SUGGEST(['¿Está protegido mi .env?']) },
  ],

  aprobacion: () => [
    { tool: 'read_file', input: { path: FIXTURE.path } },
    { say: 'Voy a actualizar la nota de prueba; te pediré permiso.' },
    { tool: 'write_file', input: { path: FIXTURE.path, content: FIXTURE.after, reason: 'Sube la versión y marca la nota como revisada' } },
    { say: 'No guardé el cambio porque no lo aprobaste. Tu archivo quedó igual.' },
  ],

  // The video's question about scripts/demo/sample-project: the agent reads how an order is saved, finds
  // the order built into the SQL text and marks it yellow (its folder rises on the map)
  feria: () => [
    { think: 'Quiere saber si los pedidos se guardan de forma segura. Miro la ruta de pedidos.' },
    { tool: 'read_file', input: { path: 'apps/api/src/routes/orders.ts' } },
    { say: 'Revisé cómo se guarda cada pedido.' },
    { tool: 'read_file', input: { path: 'apps/api/src/services/payments.ts' } },
    { tool: 'set_file_score', input: { path: 'apps/api/src/routes/orders.ts', level: 'yellow', reason: 'Arma la consulta pegando lo que manda la persona' } },
    { say: '\n\n> [!riesgo] El pedido se pega tal cual en la base de datos\n> Si alguien manda un pedido raro, podría colar órdenes propias. Lo marqué en amarillo.\n\n> [!paso] Cómo se arregla\n> Pasar los datos aparte de la consulta, así la base de datos nunca los confunde con órdenes.' },
    { say: SUGGEST(['reparar: apps/api/src/routes/orders.ts', 'abrir: apps/api/src/routes/orders.ts', '¿Qué más reviso?']) },
  ],

  // Building a small project from scratch (several new files, in different folders): the robot carries
  // each one to its folder (building live). Use it with permissions on Auto.
  obra: () => [
    { think: 'Armo la base: una portada, el servidor, una ruta y su prueba.' },
    { say: 'Voy a armar la base de tu página de saludos.' },
    { tool: 'write_file', input: { path: 'README.md', content: '# Saludos\n\nUna página que saluda a quien la visita.\n', reason: 'La portada del proyecto' } },
    { tool: 'write_file', input: { path: 'src/index.js', content: "import { saludo } from './rutas/saludo.js';\nconsole.log(saludo('mundo'));\n", reason: 'El punto de entrada' } },
    { tool: 'write_file', input: { path: 'src/rutas/saludo.js', content: 'export const saludo = (nombre) => `Hola, ${nombre}`;\n', reason: 'La ruta que saluda' } },
    { tool: 'write_file', input: { path: 'pruebas/saludo.test.js', content: "import { saludo } from '../src/rutas/saludo.js';\nif (saludo('Ana') !== 'Hola, Ana') throw new Error('falla');\n", reason: 'Una prueba del saludo' } },
    { say: '\n\n> [!ok] Listo\n> Hay una portada, el servidor, una ruta que saluda y su prueba.' },
    { say: SUGGEST(['abrir: README.md', '¿Cómo lo pruebo?']) },
  ],

  // Dev, with permissions on Auto: the change is saved on its own and shows as applied
  cambio: () => [
    { think: 'Leo la nota, subo la versión y la marco como revisada.' },
    { tool: 'read_file', input: { path: FIXTURE.path } },
    { say: 'Actualizo `platanus-sim/nota.txt`: subo `version` a 2 y agrego `revisado`.' },
    { tool: 'write_file', input: { path: FIXTURE.path, content: FIXTURE.after, reason: 'Sube la versión y marca la nota como revisada' } },
    { say: '\n\n> [!ok] Cambio guardado\n> Dos líneas: `version: 2` y la nueva `revisado: sí`. Puedes deshacerlo desde el historial.' },
    { say: SUGGEST(['abrir: platanus-sim/nota.txt']) },
  ],

  largo: () => [
    { think: 'Explico cómo agregar la protección, con un ejemplo.' },
    { tool: 'read_file', input: { path: 'vercel.json' } },
    { say: 'Para agregar la protección, suma una regla a `vercel.json`. Así:\n\n```json\n{\n  "headers": [{\n    "source": "/(.*)",\n    "headers": [{ "key": "Content-Security-Policy", "value": "default-src \'self\'" }]\n  }]\n}\n```\n\n' },
    { say: '1. Abre el archivo.\n2. Pega la regla dentro de `headers`.\n3. Publica tu página y revisa que todo cargue.\n\n> [!paso] Prueba antes\n> Si algo deja de verse, la regla es demasiado estricta: agrega ese sitio a la lista.\n\n> [!riesgo] No la copies a ciegas\n> Si tu página usa servicios de afuera (pagos, mapas), también deben estar en la lista.' },
    { say: SUGGEST(['¿Qué servicios de afuera uso?', 'abrir: vercel.json']) },
  ],

  caida: () => [
    { tool: 'get_project', input: {} },
    { say: 'Empiezo a revisar…' },
    { crash: 1 },
  ],

  repair: (prompt) => {
    const target = /`([^`]+)`/.exec(prompt)?.[1] ?? /del archivo (\S+?):/.exec(prompt)?.[1] ?? 'vercel.json';
    return [
      { think: `Reviso ${target} antes de cambiar nada.` },
      { tool: 'read_file', input: { path: target } },
      { say: 'Falsa alarma: no hay nada que arreglar.' },
      { tool: 'set_file_score', input: { path: target, level: 'green', reason: 'Revisado: no hay riesgo' } },
      { say: `\n\n> [!riesgo] Qué encontré\n> La alarma saltó por el nombre de \`${target}\`, pero por dentro no guarda claves.\n\n> [!paso] Qué te falta hacer a ti\n> Nada con este archivo.` },
    ];
  },

  // "Recorrido" of scripts/demo/sample-project (feria-online): reads the README, then narrates the stops
  // as JSON (agent/voice.json -> tour). Ids and paths match what the analyzer finds in that project.
  tour: () => [
    { think: 'Leo el README para contar la feria con sus palabras.' },
    { tool: 'read_file', input: { path: 'README.md' } },
    { say: JSON.stringify(TOUR_FERIA) },
  ],

  // "Mejorar mi mensaje": answers only with the spec as JSON (agent/voice.json -> refine)
  refine: (prompt) => [
    { say: JSON.stringify({
      objective: `Que ${prompt.replace(/\s+/g, ' ').trim().slice(0, 80)}`,
      problem: 'Hoy no está claro si el proyecto está protegido',
      scope: ['vercel.json'],
      constraints: ['No mostrar claves'],
      tasks: [{ do: 'Comprobar el problema con una prueba', accept: 'La prueba falla hoy' }, { do: 'Hacer el cambio más pequeño', accept: 'La prueba pasa' }],
      test: { red: 'La prueba muestra el problema', green: 'La prueba pasa con el cambio', refactor: 'Dejar todo ordenado' },
    }) },
  ],
};

// fallback: the scenario for messages with no tag (PLATANUS_SIM_DEFAULT, e.g. "feria" for the video)
function pickScenario(prompt, systemPrompt = '', fallback = process.env.PLATANUS_SIM_DEFAULT) {
  const tag = /\[sim:([a-z]+)\]/i.exec(prompt)?.[1]?.toLowerCase();
  if (tag && scenarios[tag]) return { name: tag, steps: scenarios[tag](prompt) };
  if (/asistente de escritura/i.test(systemPrompt)) return { name: 'refine', steps: scenarios.refine(prompt) };
  if (/guía de Platanus/i.test(systemPrompt)) return { name: 'tour', steps: scenarios.tour(prompt) };
  if (/^\s*repara/i.test(prompt) || /repara(r)? el archivo/i.test(prompt)) return { name: 'repair', steps: scenarios.repair(prompt) };
  if (fallback && scenarios[fallback]) return { name: fallback, steps: scenarios[fallback](prompt) };
  return { name: 'revision', steps: scenarios.revision(prompt) };
}

module.exports = { scenarios, pickScenario, FIXTURE, TOUR_FERIA };
