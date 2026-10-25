# Chat Git en lenguaje natural

Rama: `feature/chat-git-commands`

El chat "Agente Qubbot" ejecuta acciones de git (commit, rollback, reset, ramas) a partir de frases normales en español, con o sin tildes, y está pensado para funcionar igual con **voz** más adelante. No hace falta memorizar una sintaxis.

## Dónde está el código

| Archivo | Qué hace |
|---|---|
| [`renderer/models/gitIntent.js`](../renderer/models/gitIntent.js) | `parseGitIntent(texto)`: función pura, convierte una frase en una intención o `null` |
| [`renderer/models/agentModel.js`](../renderer/models/agentModel.js) | `#gitCommand`: ejecuta la intención con el servicio de git |
| [`renderer/services/gitService.js`](../renderer/services/gitService.js) | Puente al git real (Electron, `electron/git.js`) o git simulado en memoria en el navegador |
| `renderer/i18n/es.js` (`agent.git`) | Textos de respuesta, ayuda y explicaciones |
| `renderer/viewmodels/chatViewModel.js` | Chips de Rollback/Reset al elegir un commit en el mapa; el chat nunca se queda en "escribiendo…" si el agente falla |
| `tests/renderer/gitIntent*.test.mjs` | Tests del intérprete |

## Cómo probarlo

- **App de escritorio (git real):** `npm install && npm start`, abre un proyecto que sea repo git y escribe en el chat.
- **Navegador (git simulado en memoria):** `npm run build:web` y sirve `dist/` (o abre la web desplegada). Los commits aparecen en el mapa Git pero no tocan un repo.
- **Tests:** `node --test tests/renderer/*.test.mjs`

## Qué entiende

| Intención | Ejemplos |
|---|---|
| **Commit** | `haz un commit que se llame arreglo login` · `guárdame los cambios: fix pagos` · `sube mis cambios con el mensaje fix` · `commit "listo"` |
| **Rollback** (revert: crea un commit que deshace otro) | `rollback` · `deshaz el último commit` · `vuelve atrás` · `revierte el commit abc1234` |
| **Reset** (destructivo) | `reset al commit abc1234` · `reinicia todo` (pide el SHA) |
| **Crear rama** | `crea una rama para pagos` · `hazme una rama chat-v2` · `nueva rama login de usuario` |
| **Cambiar de rama** | `cámbiate a main` · `puedes hacer un checkout hasta feature/chat` · `cambia de rama a develop` |
| **Preguntas** (solo explican) | `qué es un rollback` · `diferencia entre reset y rollback` |
| **Ayuda** | `ayuda` |

Reglas:
- Commit sin mensaje: el chat lo pide.
- Rollback sin SHA: usa el último commit (`HEAD`).
- **Reset nunca adivina el commit**: sin SHA lo pide. En Electron, reset/revert/checkout piden confirmación.
- **Commit con confirmación**: muestra los archivos que entran y no se hace si alguno es secreto (`.env`, claves, credenciales) y `.gitignore` no lo excluye. Solo entran los archivos que se confirmaron.
- **Valores validados en el proceso principal**: un commit tiene que ser HEAD, HEAD~n o su código; una rama, un nombre válido de git. Nada que empiece con `-` llega a git (sería una opción). Crear rama no pregunta (no cambia archivos), pero queda registrado.
- Los nombres de rama con espacios pasan a guiones y nunca empiezan por `-` (evita que git lo lea como opción).
- Si la frase habla de git (`commit`, `rama`, `reset`...) pero no se entiende, el chat muestra la ayuda con ejemplos. Las preguntas y otros temas siguen al chat normal.

## Cómo funciona por dentro

```
send(texto) → AgentModel.reply → #gitCommand → parseGitIntent(texto)
                                     │ intención → gitService (commit / revert / reset / createBranch / checkout)
                                     └ null → comandos de archivos → respuestas del demo
```

`parseGitIntent` es **por palabras clave por raíz**, no por frases exactas (`haz*`, `cambi*`, `rever*`, `mud*`...):

1. Normaliza: minúsculas, sin tildes ni signos, quita muletillas (`por favor`, `oye`, `necesito`...).
2. Preguntas (`qué es…`) → explica, no ejecuta.
3. Busca la palabra clave de cada intención y gana la que aparece **primero** (`haz un commit: deshacer bug` es un commit).
4. Extrae el dato: SHA (4–40 hex con al menos un dígito), mensaje del commit o nombre de la rama (lo que sigue a `rama` / `checkout`).

## Añadir una frase o un comando

- **Una frase que falla:** añádela a la tabla de `tests/renderer/gitIntent.phrases.test.mjs`, haz que pase ajustando los regex de `gitIntent.js` y listo.
- **Sinónimo:** añade la raíz al regex de la intención (`TRIGGERS`, `CREATE_VERB`, `CHECKOUT_VERB`).
- **Intención nueva:** añade el tipo en `parseGitIntent`, un `case` en `AgentModel.#gitCommand` y una línea en `agent.git.help`.

## Hacia voz y limitaciones

- El intérprete es por reglas, no un LLM: frases muy ambiguas caen en la ayuda. Para voz conviene un clasificador de intención con IA y dejar estas reglas de respaldo.
- Pendiente para voz: nombres de rama dictados (`feature barra auth`), SHAs hablados y confirmación hablada antes de un reset.
- No hay `push`, `merge` ni "en qué rama estoy" / historial desde el chat.
